"""Exercise real HTTP parsing/cookies with an isolated fake account service."""

import base64
import copy
import gzip
import json
import threading
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest

import api.dashboard as adapter
from api.dashboard import handler
from supabase_store import DashboardError, Supabase, SupabaseError, decrypt_private, encrypt_private


class FakeAccountService:
    def __init__(self):
        self.users = {
            "alice": {"id": str(uuid4()), "password": "alice-app-password", "garmin_username": "alice@example.com", "garmin_password": "alice-garmin-private"},
            "bob": {"id": str(uuid4()), "password": "bob-app-password", "garmin_username": "bob@example.com", "garmin_password": "bob-garmin-private"},
        }
        self.sessions = {}
        self.auth_attempts = []
        self.requests = []
        self.logout_failure = None
        self.identity_failure = None
        self.sync_jobs = {}
        self.import_batches = {}
        self.snapshots = {user["id"]: {"activities": [{"owner": name}], "meta": {"generated_at": "2026-10-02T00:00:00Z"}}
                          for name, user in self.users.items()}

    def limit_auth(self, fingerprint, kind):
        self.auth_attempts.append((fingerprint, kind))

    def sign_in(self, username, password):
        user = self.users.get(username)
        if user is None or password != user["password"]:
            raise DashboardError("The username or password is incorrect.", 401)
        session = {"access_token": f"{username}-private-access", "refresh_token": f"{username}-private-refresh", "expires_in": 3600}
        self.sessions[session["access_token"]] = username
        return session

    def create_account(self, username, password, credentials):
        if username in self.users:
            raise DashboardError("That username is already taken.", 409)
        self.users[username] = {"id": str(uuid4()), "password": password,
                                "garmin_username": credentials["username"], "garmin_password": credentials["password"]}
        self.snapshots[self.users[username]["id"]] = None
        return self.sign_in(username, password)

    def change_app_password(self, username, current_password, new_password):
        return Supabase.change_app_password(self, username, current_password, new_password)

    def identity(self, access, refresh):
        if self.identity_failure:
            raise self.identity_failure
        username = self.sessions.get(access)
        if not username:
            raise DashboardError("Sign in to see your activities.", 401)
        return {"id": self.users[username]["id"], "username": username}, None

    def request(self, path, **kwargs):
        self.requests.append((path, kwargs))
        if path.startswith("/rest/v1/"):
            table = urlsplit(path).path.rsplit("/", 1)[-1]
            query = parse_qs(urlsplit(path).query)
            rows = []
            for username, user in sorted(self.users.items()):
                if query.get("user_id", ["eq." + user["id"]])[0] != "eq." + user["id"]:
                    continue
                if table == "pace_profiles":
                    rows.append({"user_id": user["id"], "username": username, "created_at": "2026-10-01T00:00:00Z"})
                elif table == "pace_snapshots" and self.snapshots[user["id"]] is not None:
                    rows.append({"payload": copy.deepcopy(self.snapshots[user["id"]])} if query.get("select") == ["payload"] else
                                {"user_id": user["id"], "imported_records": self.snapshots[user["id"]].get("meta", {}).get("activity_count_fetched"),
                                 "updated_at": "2026-10-02T00:00:00Z"})
                elif table == "pace_garmin_connections":
                    rows.append({"credentials_ciphertext": encrypt_private({"username": user["garmin_username"], "password": user["garmin_password"]}, user["id"]),
                                 "revision": "test-revision"})
            offset = int(query.get("offset", [0])[0])
            limit = int(query.get("limit", [len(rows)])[0])
            return rows[offset:offset + limit]
        if path.startswith("/auth/v1/admin/users/"):
            user_id = path.rsplit("/", 1)[-1]
            username = next(name for name, user in self.users.items() if user["id"] == user_id)
            user = self.users[username]
            if kwargs["method"] == "DELETE":
                assert kwargs["body"] == {"should_soft_delete": False}
                del self.users[username]
                self.snapshots.pop(user_id, None)
                self.sync_jobs.pop(user_id, None)
                self.import_batches.pop(user_id, None)
                self.sessions = {token: name for token, name in self.sessions.items() if name != username}
                return {}
            assert kwargs["method"] == "PUT"
            user["password"] = kwargs["body"]["password"]
            return {"id": user["id"]}
        if path == "/auth/v1/user" and kwargs.get("method") == "PUT":
            username = self.sessions[kwargs["token"]]
            assert kwargs["privileged"] is False
            assert kwargs["body"]["current_password"] == self.users[username]["password"]
            self.users[username]["password"] = kwargs["body"]["password"]
            return {"id": self.users[username]["id"]}
        if self.logout_failure:
            raise self.logout_failure
        self.sessions.pop(kwargs.get("token"), None)
        return None

    def rpc(self, name, params):
        assert name == "pace_update_garmin_password"
        assert params["p_revision"] == "test-revision"
        user = next(user for user in self.users.values() if user["id"] == params["p_user"])
        credentials = decrypt_private(params["p_credentials"], params["p_user"])
        user["garmin_password"] = credentials["password"]


class FakeUserStore:
    def __init__(self, backend, user_id):
        self.backend = backend
        self.user_id = user_id

    def connection(self):
        user = next(user for user in self.backend.users.values() if user["id"] == self.user_id)
        return {"credentials": {"username": user["garmin_username"], "password": user["garmin_password"]},
                "session": "private-garmin-session"}

    def snapshot(self):
        return copy.deepcopy(self.backend.snapshots[self.user_id])

    def update_credentials(self, credentials):
        user = next(user for user in self.backend.users.values() if user["id"] == self.user_id)
        user["garmin_username"] = credentials["username"]
        user["garmin_password"] = credentials["password"]


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-test-only")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret-test-only")
    monkeypatch.setenv("CREDENTIALS_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"t" * 32).decode())
    monkeypatch.delenv("VERCEL", raising=False)
    backend = FakeAccountService()
    monkeypatch.setattr(adapter, "Supabase", lambda: backend)
    monkeypatch.setattr(adapter, "UserStore", FakeUserStore)
    instance = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=lambda: instance.serve_forever(poll_interval=0.01), daemon=True)
    thread.start()
    yield SimpleNamespace(port=instance.server_port, backend=backend)
    instance.shutdown()
    instance.server_close()
    thread.join()


def request(server, method="GET", path="/api/dashboard", body=None, headers=None, raw_body=None):
    connection = HTTPConnection("127.0.0.1", server.port)
    headers = copy.deepcopy(headers or {})
    if body is not None:
        headers.setdefault("Content-Type", "application/json")
    encoded = raw_body if raw_body is not None else json.dumps(body) if body is not None else None
    connection.request(method, path, body=encoded, headers=headers)
    response = connection.getresponse()
    content = response.read()
    response_headers = dict(response.getheaders())
    response_headers["Set-Cookie"] = response.headers.get_all("Set-Cookie", [])
    if response_headers.get("Content-Encoding") == "gzip":
        content = gzip.decompress(content)
    result = response.status, response_headers, json.loads(content)
    connection.close()
    return result


def login(server, username="alice"):
    status, headers, body = request(server, "POST", "/api/dashboard?action=login",
                                    {"username": username, "password": f"{username}-app-password"})
    assert status == 200 and body == {"ok": True}
    return "; ".join(cookie.split(";")[0] for cookie in headers["Set-Cookie"])


def test_private_data_and_every_authenticated_action_require_sign_in(server, monkeypatch):
    monkeypatch.setattr(adapter, "UserStore", lambda *a: pytest.fail("must not touch storage"))
    assert request(server)[0] == 401
    for action in ("refresh", "sync-step", "garmin", "garmin-session", "app-password", "delete-account"):
        assert request(server, "POST", f"/api/dashboard?action={action}", {})[0] == 401


def test_login_normalizes_username_and_secure_private_cookies_unlock_only_own_data(server, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    status, headers, body = request(server, "POST", "/api/dashboard?action=login",
                                    {"username": " Alice ", "password": "alice-app-password"})
    assert status == 200 and body == {"ok": True}
    cookies = headers["Set-Cookie"]
    assert len(cookies) == 2
    assert all(all(flag in cookie for flag in ("HttpOnly", "SameSite=Strict", "Secure", "Path=/api")) for cookie in cookies)
    assert "private-access" not in json.dumps(body) and "private-refresh" not in json.dumps(body)
    cookie_header = "; ".join(cookie.split(";")[0] for cookie in cookies)
    status, headers, body = request(server, headers={"Cookie": cookie_header})
    assert status == 200 and body["payload"]["activities"] == [{"owner": "alice"}]
    assert body["user"] == {"username": "alice", "garmin_username": "alice@example.com"}
    assert headers["Cache-Control"] == "private, no-store" and headers["X-Content-Type-Options"] == "nosniff"
    assert "alice-garmin-private" not in json.dumps(body) and "private-garmin-session" not in json.dumps(body)


def test_two_signed_in_users_read_separate_snapshots_even_with_spoofed_query_user_id(server):
    alice_cookie = login(server, "alice")
    bob_cookie = login(server, "bob")
    alice_id = server.backend.users["alice"]["id"]
    bob_id = server.backend.users["bob"]["id"]
    assert request(server, path=f"/api/dashboard?user_id={bob_id}", headers={"Cookie": alice_cookie})[2]["payload"]["activities"] == [{"owner": "alice"}]
    assert request(server, path=f"/api/dashboard?user_id={alice_id}", headers={"Cookie": bob_cookie})[2]["payload"]["activities"] == [{"owner": "bob"}]


def test_signup_collects_app_and_garmin_credentials_and_subsequent_login_needs_only_app_credentials(server):
    status, headers, body = request(server, "POST", "/api/dashboard?action=signup", {
        "username": " New_Runner ", "password": "new-app-password",
        "garmin_username": " garmin@example.com ", "garmin_password": "private-garmin-password",
    })
    assert status == 200 and body == {"ok": True}
    assert server.backend.users["new_runner"]["garmin_username"] == "garmin@example.com"
    assert "private-garmin-password" not in json.dumps(body)
    status, _, body = request(server, "POST", "/api/dashboard?action=login",
                              {"username": "new_runner", "password": "new-app-password"})
    assert status == 200 and body == {"ok": True}
    assert server.backend.auth_attempts == [("local", "signup"), ("local", "login")]


def test_wrong_password_clears_existing_session_and_never_returns_tokens(server):
    status, headers, body = request(server, "POST", "/api/dashboard?action=login",
                                    {"username": "alice", "password": "wrong-private-password"})
    assert status == 401
    assert all("Max-Age=0" in cookie for cookie in headers["Set-Cookie"])
    assert "wrong-private-password" not in json.dumps(body)
    assert not any("private-access" in cookie for cookie in headers["Set-Cookie"])


@pytest.mark.parametrize("value", [None, "ab", "runner@example.com", "<script>"])
def test_invalid_usernames_fail_before_auth_call(server, value):
    status, _, _ = request(server, "POST", "/api/dashboard?action=login", {"username": value, "password": "private-password"})
    assert status == 400 and server.backend.auth_attempts == []


def test_missing_garmin_signup_credentials_are_rejected(server):
    status, _, _ = request(server, "POST", "/api/dashboard?action=signup", {"username": "runner", "password": "app-private-password"})
    assert status == 400 and "runner" not in server.backend.users


def test_garmin_credentials_update_ignores_browser_owner_and_affects_only_signed_in_user(server):
    cookie = login(server, "alice")
    status, _, body = request(server, "POST", "/api/dashboard?action=garmin", {
        "user_id": server.backend.users["bob"]["id"],
        "garmin_username": "new-alice@example.com", "garmin_password": "new-private-garmin-password",
    }, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True, "garmin_username": "new-alice@example.com"}
    assert server.backend.users["alice"]["garmin_username"] == "new-alice@example.com"
    assert server.backend.users["bob"]["garmin_username"] == "bob@example.com"
    assert "new-private-garmin-password" not in json.dumps(body)


def test_refresh_and_sync_step_bind_verified_identity_ignore_spoofed_owner_and_return_progress(server, monkeypatch):
    cookie = login(server, "alice")
    owner = server.backend.users["alice"]["id"]
    scopes = []
    job_id = str(uuid4())
    monkeypatch.setattr(adapter, "start_refresh", lambda store: scopes.append(store.user_id) or {"job_id": job_id, "records_loaded": 0, "complete": False})
    monkeypatch.setattr(adapter, "refresh_step", lambda store, requested_job: scopes.append((store.user_id, requested_job)) or {"complete": False, "records_loaded": 100})
    status, _, body = request(server, "POST", "/api/dashboard?action=refresh", {"user_id": server.backend.users["bob"]["id"]}, {"Cookie": cookie})
    assert status == 202 and body["job_id"] == job_id
    status, _, body = request(server, "POST", "/api/dashboard?action=sync-step", {"user_id": server.backend.users["bob"]["id"], "job_id": job_id}, {"Cookie": cookie})
    assert status == 202 and body == {"complete": False, "records_loaded": 100}
    assert scopes == [owner, (owner, job_id)]
    monkeypatch.setattr(adapter, "refresh_step", lambda store, requested_job: {"complete": True, "records_loaded": 100, "payload": {"activities": []}})
    assert request(server, "POST", "/api/dashboard?action=sync-step", {"job_id": job_id}, {"Cookie": cookie})[0] == 200


def test_session_import_binds_verified_owner_and_never_echoes_tokens(server, monkeypatch):
    cookie = login(server, "bob")
    seen = []
    monkeypatch.setattr(adapter, "import_garmin_session", lambda store, value: seen.append((store.user_id, value)))
    status, _, body = request(server, "POST", "/api/dashboard?action=garmin-session", {
        "session_json": "private-garmin-tokens", "user_id": server.backend.users["alice"]["id"],
    }, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True}
    assert seen == [(server.backend.users["bob"]["id"], "private-garmin-tokens")]


@pytest.mark.parametrize("failure", [None, SupabaseError(401, "expired"), DashboardError("Unreachable", 502)])
def test_sign_out_clears_both_cookies_even_if_upstream_logout_fails(server, monkeypatch, failure):
    monkeypatch.setenv("VERCEL", "1")
    cookie = login(server)
    server.backend.logout_failure = failure
    status, headers, body = request(server, "POST", "/api/dashboard?action=logout", {}, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True}
    assert len(headers["Set-Cookie"]) == 2
    assert all("Max-Age=0" in cookie and "HttpOnly" in cookie and "Secure" in cookie for cookie in headers["Set-Cookie"])
    assert server.backend.requests[-1] == ("/auth/v1/logout?scope=local", {
        "method": "POST", "privileged": False, "token": "alice-private-access"})


def test_expired_auth_session_clears_cookies(server):
    status, headers, body = request(server, headers={"Cookie": "pace_access=expired; pace_refresh=expired"})
    assert status == 401 and len(headers["Set-Cookie"]) == 2
    assert all("Max-Age=0" in cookie for cookie in headers["Set-Cookie"])


@pytest.mark.parametrize("action", ["login", "signup", "refresh", "logout", "garmin", "sync-step", "garmin-session"])
def test_cross_origin_mutation_is_rejected_before_auth_or_storage(server, action):
    status, _, _ = request(server, "POST", f"/api/dashboard?action={action}", {}, {"Origin": "https://another-site.example"})
    assert status == 403 and server.backend.auth_attempts == []


def test_same_origin_mutation_accepts_forwarded_vercel_host(server):
    status, _, _ = request(server, "POST", "/api/dashboard?action=login", {
        "username": "alice", "password": "alice-app-password"},
        {"Origin": "https://pace.example", "X-Forwarded-Host": "pace.example"})
    assert status == 200


@pytest.mark.parametrize("raw,content_type,status", [("invalid", "application/json", 400),
                                                   ("[]", "application/json", 400),
                                                   ("{}", "text/plain", 415),
                                                   ("x" * 32769, "application/json", 400)])
def test_malformed_or_oversized_request_rejected_without_account_call(server, raw, content_type, status):
    actual, _, _ = request(server, "POST", "/api/dashboard?action=login", raw_body=raw, headers={"Content-Type": content_type})
    assert actual == status and server.backend.auth_attempts == []


@pytest.mark.parametrize("failure", [RuntimeError("private-password private-token"), SupabaseError(400, "private-diagnostic")])
def test_unexpected_and_upstream_errors_are_redacted_in_http_response_and_logs(server, capsys, failure):
    cookie = login(server)
    server.backend.identity_failure = failure
    status, _, body = request(server, headers={"Cookie": cookie})
    assert status == 502
    assert "private-password" not in json.dumps(body) and "private-token" not in json.dumps(body)
    assert "private-diagnostic" not in json.dumps(body)
    captured = capsys.readouterr()
    assert "private-password" not in captured.out and "private-token" not in captured.out


def test_large_history_is_compressed_and_private(server):
    cookie = login(server)
    payload = {"activities": [{"year": 2026, "month": 10, "pace_s_per_km": 300}] * 1000}
    server.backend.snapshots[server.backend.users["alice"]["id"]] = payload
    status, headers, body = request(server, headers={"Cookie": cookie, "Accept-Encoding": "gzip"})
    assert status == 200 and body["payload"] == payload
    assert headers["Content-Encoding"] == "gzip" and int(headers["Content-Length"]) < 1000
    assert headers["Cache-Control"] == "private, no-store"


def admin_login(server):
    server.backend.create_account("stanley", "stanley-app-password",
                                  {"username": "stanley@example.com", "password": "stanley-garmin-private"})
    return login(server, "stanley")


@pytest.mark.parametrize("action,method", [("admin-users", "GET"), ("admin-dashboard", "GET"),
    ("admin-app-password", "POST"), ("admin-garmin-password", "POST"), ("admin-show-garmin-password", "POST"), ("admin-delete-user", "POST")])
def test_admin_endpoints_reject_unsigned_and_regular_users_before_storage(server, action, method):
    target = server.backend.users["bob"]["id"]
    body = {"user_id": target, "password": "new-private-password", "username": "stanley"} if method == "POST" else None
    path = f"/api/dashboard?action={action}&user_id={target}&username=stanley"
    assert request(server, method, path, body)[0] == 401
    cookie = login(server, "alice")
    server.backend.requests.clear()
    assert request(server, method, path, body, {"Cookie": cookie})[0] == 403
    assert server.backend.requests == []
    assert server.backend.users["bob"]["password"] == "bob-app-password"
    assert server.backend.users["bob"]["garmin_password"] == "bob-garmin-private"


def test_stanley_lists_all_users_and_counts_completed_raw_records_without_secrets(server):
    cookie = admin_login(server)
    server.backend.snapshots[server.backend.users["alice"]["id"]]["meta"]["activity_count_fetched"] = 1421
    status, headers, body = request(server, path="/api/dashboard?action=admin-users", headers={"Cookie": cookie})
    assert status == 200
    users = {user["username"]: user for user in body["users"]}
    assert set(users) == {"alice", "bob", "stanley"}
    assert users["alice"]["imported_records"] == 1421
    assert users["stanley"]["imported_records"] == 0 and users["stanley"]["last_import_at"] is None
    assert users["bob"]["imported_records"] is None  # Old snapshots never invent a raw count.
    assert not any(word in json.dumps(body) for word in ("password", "@example.com", "private"))
    assert headers["Cache-Control"] == "private, no-store"


def test_stanley_preview_does_not_replace_session_or_expose_connection_secrets(server):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    status, headers, body = request(server, path=f"/api/dashboard?action=admin-dashboard&user_id={target}", headers={"Cookie": cookie})
    assert status == 200 and body["read_only"] is True
    assert body["user"]["username"] == "bob" and body["payload"]["activities"] == [{"owner": "bob"}]
    assert headers["Set-Cookie"] == [] and "private" not in json.dumps(body)
    assert request(server, headers={"Cookie": cookie})[2]["user"]["username"] == "stanley"
    assert request(server, path=f"/api/dashboard?user_id={target}", headers={"Cookie": cookie})[2]["payload"] is None


def test_only_explicit_reveal_returns_selected_garmin_password_and_updates_preserve_history(server):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    saved = copy.deepcopy(server.backend.snapshots[target])
    status, headers, body = request(server, "POST", "/api/dashboard?action=admin-show-garmin-password",
                                    {"user_id": target}, {"Cookie": cookie})
    assert status == 200 and body == {"garmin_username": "bob@example.com", "garmin_password": "bob-garmin-private"}
    assert headers["Cache-Control"] == "private, no-store"
    assert request(server, "GET", f"/api/dashboard?action=admin-show-garmin-password&user_id={target}", headers={"Cookie": cookie})[0] == 400
    status, _, body = request(server, "POST", "/api/dashboard?action=admin-garmin-password",
                              {"user_id": target, "password": "new-garmin-private"}, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True}
    assert server.backend.users["bob"]["garmin_password"] == "new-garmin-private"
    assert server.backend.users["bob"]["garmin_username"] == "bob@example.com"
    assert server.backend.users["alice"]["garmin_password"] == "alice-garmin-private"
    assert server.backend.snapshots[target] == saved


def test_app_password_change_targets_selected_user_and_new_password_signs_in(server):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    status, _, body = request(server, "POST", "/api/dashboard?action=admin-app-password",
                              {"user_id": target, "password": "new-app-private"}, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True}
    assert server.backend.users["alice"]["password"] == "alice-app-password"
    assert request(server, "POST", "/api/dashboard?action=login", {"username": "bob", "password": "bob-app-password"})[0] == 401
    assert request(server, "POST", "/api/dashboard?action=login", {"username": "bob", "password": "new-app-private"})[0] == 200


@pytest.mark.parametrize("target,status", [(None, 400), ("bad-id", 400), (str(uuid4()), 404)])
def test_admin_targets_are_validated_before_reveal_or_mutation(server, target, status):
    cookie = admin_login(server)
    for action in ("admin-app-password", "admin-garmin-password", "admin-show-garmin-password", "admin-delete-user"):
        assert request(server, "POST", f"/api/dashboard?action={action}", {"user_id": target, "password": "new-private-password"}, {"Cookie": cookie})[0] == status
    query = "" if target is None else f"&user_id={target}"
    assert request(server, path=f"/api/dashboard?action=admin-dashboard{query}", headers={"Cookie": cookie})[0] == status


@pytest.mark.parametrize("action,password", [("admin-app-password", "short"), ("admin-app-password", "x" * 129),
    ("admin-garmin-password", ""), ("admin-garmin-password", "x" * 1025)])
def test_invalid_admin_password_never_changes_user(server, action, password):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    assert request(server, "POST", f"/api/dashboard?action={action}", {"user_id": target, "password": password}, {"Cookie": cookie})[0] == 400
    assert server.backend.users["bob"]["password"] == "bob-app-password"
    assert server.backend.users["bob"]["garmin_password"] == "bob-garmin-private"


@pytest.mark.parametrize("confirmation", [None, "", "alice", "Bob", "bob ", True])
def test_delete_requires_exact_selected_username_before_touching_auth(server, confirmation):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    status, _, _ = request(server, "POST", "/api/dashboard?action=admin-delete-user",
                           {"user_id": target, "confirm_username": confirmation}, {"Cookie": cookie})
    assert status == 400 and "bob" in server.backend.users
    assert not any(kwargs.get("method") == "DELETE" for _, kwargs in server.backend.requests)


def test_delete_removes_selected_login_and_all_linked_records_but_keeps_other_users(server):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    bob_cookie = login(server, "bob")
    server.backend.sync_jobs[target] = ["completed-job", "running-job"]
    server.backend.import_batches[target] = [{"private_activity": 1}]
    alice = copy.deepcopy(server.backend.users["alice"])
    alice_snapshot = copy.deepcopy(server.backend.snapshots[alice["id"]])
    status, headers, body = request(server, "POST", "/api/dashboard?action=admin-delete-user",
                                    {"user_id": target, "confirm_username": "bob"}, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True, "deleted_user_id": target, "deleted_self": False}
    assert headers["Set-Cookie"] == []
    assert "bob" not in server.backend.users
    assert all(target not in rows for rows in (server.backend.snapshots, server.backend.sync_jobs, server.backend.import_batches))
    assert server.backend.users["alice"] == alice
    assert server.backend.snapshots[alice["id"]] == alice_snapshot
    assert request(server, headers={"Cookie": bob_cookie})[0] == 401
    assert request(server, "POST", "/api/dashboard?action=login", {"username": "bob", "password": "bob-app-password"})[0] == 401
    assert request(server, headers={"Cookie": cookie})[2]["user"]["username"] == "stanley"
    auth_deletes = [(path, kwargs) for path, kwargs in server.backend.requests if kwargs.get("method") == "DELETE"]
    assert auth_deletes == [(f"/auth/v1/admin/users/{target}", {"method": "DELETE", "body": {"should_soft_delete": False}})]


def test_self_deletion_clears_session_cookies_and_allows_no_further_admin_access(server):
    cookie = admin_login(server)
    target = server.backend.users["stanley"]["id"]
    status, headers, body = request(server, "POST", "/api/dashboard?action=admin-delete-user",
                                    {"user_id": target, "confirm_username": "stanley"}, {"Cookie": cookie})
    assert status == 200 and body["deleted_self"] is True
    assert len(headers["Set-Cookie"]) == 2 and all("Max-Age=0" in value for value in headers["Set-Cookie"])
    assert request(server, path="/api/dashboard?action=admin-users", headers={"Cookie": cookie})[0] == 401


def test_delete_rejects_cross_origin_and_get_requests(server):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    body = {"user_id": target, "confirm_username": "bob"}
    assert request(server, "POST", "/api/dashboard?action=admin-delete-user", body,
                   {"Cookie": cookie, "Origin": "https://unrelated.example"})[0] == 403
    assert request(server, path=f"/api/dashboard?action=admin-delete-user&user_id={target}&confirm_username=bob", headers={"Cookie": cookie})[0] == 400
    assert "bob" in server.backend.users


def test_failed_auth_delete_does_not_manually_erase_any_records(server, monkeypatch):
    cookie = admin_login(server)
    target = server.backend.users["bob"]["id"]
    original = server.backend.request

    def fail_delete(path, **kwargs):
        if kwargs.get("method") == "DELETE":
            raise SupabaseError(500, "database_error")
        return original(path, **kwargs)

    monkeypatch.setattr(server.backend, "request", fail_delete)
    assert request(server, "POST", "/api/dashboard?action=admin-delete-user",
                   {"user_id": target, "confirm_username": "bob"}, {"Cookie": cookie})[0] == 502
    assert "bob" in server.backend.users and target in server.backend.snapshots


def test_user_changes_only_own_app_password_and_stays_signed_in(server):
    cookie = login(server, "alice")
    status, headers, body = request(server, "POST", "/api/dashboard?action=app-password", {
        "user_id": server.backend.users["bob"]["id"], "username": "bob",
        "current_password": "alice-app-password", "new_password": "alice-new-password",
    }, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True}
    assert len(headers["Set-Cookie"]) == 2
    assert "password" not in json.dumps(body)
    assert server.backend.users["alice"]["password"] == "alice-new-password"
    assert server.backend.users["bob"]["password"] == "bob-app-password"
    fresh_cookie = "; ".join(value.split(";")[0] for value in headers["Set-Cookie"])
    assert request(server, headers={"Cookie": fresh_cookie})[2]["user"]["username"] == "alice"
    assert request(server, "POST", "/api/dashboard?action=login", {"username": "alice", "password": "alice-app-password"})[0] == 401
    assert request(server, "POST", "/api/dashboard?action=login", {"username": "alice", "password": "alice-new-password"})[0] == 200
    assert server.backend.auth_attempts == [("local", "login"), ("local", "login"), ("local", "login"), ("local", "login")]


@pytest.mark.parametrize("current,new", [("wrong-password", "valid-new-password"), (None, "valid-new-password"),
    ("alice-app-password", "short"), ("alice-app-password", "x" * 129)])
def test_invalid_own_password_change_keeps_account_and_current_session(server, current, new):
    cookie = login(server, "alice")
    status, headers, body = request(server, "POST", "/api/dashboard?action=app-password",
                                    {"current_password": current, "new_password": new}, {"Cookie": cookie})
    assert status == 400 and headers["Set-Cookie"] == []
    assert server.backend.users["alice"]["password"] == "alice-app-password"
    assert request(server, headers={"Cookie": cookie})[0] == 200
    assert "wrong-password" not in json.dumps(body)


def test_regular_user_can_delete_only_their_own_account_even_with_spoofed_owner(server):
    cookie = login(server, "alice")
    target = server.backend.users["alice"]["id"]
    server.backend.sync_jobs[target] = ["job"]
    server.backend.import_batches[target] = ["records"]
    status, headers, body = request(server, "POST", "/api/dashboard?action=delete-account",
        {"user_id": server.backend.users["bob"]["id"], "username": "bob", "confirm_username": "alice"}, {"Cookie": cookie})
    assert status == 200 and body == {"ok": True}
    assert len(headers["Set-Cookie"]) == 2 and all("Max-Age=0" in value for value in headers["Set-Cookie"])
    assert "alice" not in server.backend.users and "bob" in server.backend.users
    assert all(target not in rows for rows in (server.backend.snapshots, server.backend.sync_jobs, server.backend.import_batches))
    assert request(server, headers={"Cookie": cookie})[0] == 401
    assert request(server, "POST", "/api/dashboard?action=login", {"username": "alice", "password": "alice-app-password"})[0] == 401


def test_self_delete_requires_own_exact_confirmation_and_same_origin_post(server):
    cookie = login(server, "alice")
    for confirmation in (None, "bob", "Alice", "alice "):
        assert request(server, "POST", "/api/dashboard?action=delete-account",
                       {"confirm_username": confirmation}, {"Cookie": cookie})[0] == 400
    assert request(server, "POST", "/api/dashboard?action=delete-account", {"confirm_username": "alice"},
                   {"Cookie": cookie, "Origin": "https://unrelated.example"})[0] == 403
    assert request(server, path="/api/dashboard?action=delete-account&confirm_username=alice", headers={"Cookie": cookie})[0] == 400
    assert "alice" in server.backend.users


def test_public_signup_cannot_reclaim_the_admin_username_after_deletion(server):
    # The owner name grants admin access, so public signup must never reassign it.
    assert "stanley" not in server.backend.users
    status, _, body = request(server, "POST", "/api/dashboard?action=signup", {
        "username": " Stanley ", "password": "valid-new-password",
        "garmin_username": "runner@example.com", "garmin_password": "garmin-password",
    })
    assert status == 403 and "reserved" in body["error"]
    assert "stanley" not in server.backend.users and server.backend.auth_attempts == []
