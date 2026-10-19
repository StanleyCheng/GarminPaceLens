"""Administrative queries stay scoped, paginated, and free of credential dumps."""

from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest

from admin_api import AdminStore
from supabase_store import DashboardError, SupabaseError


def test_admin_check_requires_verified_exact_username_before_any_query():
    for username in (None, "alice", "Stanley", "stanley "):
        with pytest.raises(DashboardError) as error:
            AdminStore(None, {"username": username})
        assert error.value.status == 403


def test_directory_paginates_every_profile_and_snapshot_without_loading_activity_payloads():
    profiles = [{"user_id": str(uuid4()), "username": f"runner_{i:03}", "created_at": "2026-10-01"} for i in range(503)]
    snapshots = [{"user_id": row["user_id"], "imported_records": i, "updated_at": "2026-10-19"} for i, row in enumerate(profiles)]
    queries = []

    class Backend:
        def request(self, path):
            query = parse_qs(urlsplit(path).query)
            queries.append(query)
            assert "credentials" not in query["select"][0]
            assert query["select"] != ["payload"]
            rows = profiles if "/pace_profiles?" in path else snapshots
            # A server cap below the requested limit must not truncate the directory.
            offset = int(query["offset"][0])
            return rows[offset:offset + 200]

    result = AdminStore(Backend(), {"username": "stanley"}).users()["users"]
    assert len(result) == 503 and result[-1]["imported_records"] == 502
    assert [q["offset"][0] for q in queries] == ["0", "200", "400", "503"] * 2


@pytest.mark.parametrize("code,status", [("weak_password", 400), ("user_not_found", 404), ("upstream", 502)])
def test_auth_password_errors_are_safe_and_do_not_return_secrets(code, status):
    target = str(uuid4())

    class Backend:
        def request(self, path, **kwargs):
            if path.startswith("/rest/v1/"):
                return [{"user_id": target, "username": "runner"}]
            assert kwargs == {"method": "PUT", "body": {"password": "new-private-password"}}
            raise SupabaseError(404 if code == "user_not_found" else status, code)

    with pytest.raises((DashboardError, SupabaseError)) as error:
        AdminStore(Backend(), {"username": "stanley"}).update_app_password(target, "new-private-password")
    assert error.value.status == status
    assert "new-private-password" not in str(error.value)


def test_password_only_rpc_is_server_only_and_keeps_completed_snapshots():
    schema = Path(__file__).resolve().parents[1].joinpath("supabase/schema.sql").read_text().lower()
    function = schema.split("create or replace function public.pace_update_garmin_password", 1)[1].split("end $$;", 1)[0]
    assert "where user_id = p_user for update" in function
    assert "revision is distinct from p_revision" in function
    assert "session_ciphertext = null, revision = gen_random_uuid()" in function
    assert "status in ('running','finalizing')" in function
    assert "pace_snapshots" not in function
    assert schema.count("public.pace_update_garmin_password(uuid,uuid,text)") == 2
    assert "from public, anon, authenticated;" in schema and "to service_role;" in schema


def test_auth_deletion_cascades_through_all_user_record_tables():
    schema = Path(__file__).resolve().parents[1].joinpath("supabase/schema.sql").read_text().lower()
    profile = schema.split("create table if not exists public.pace_profiles", 1)[1].split(");", 1)[0]
    assert "references auth.users(id) on delete cascade" in profile
    for table in ("pace_garmin_connections", "pace_sync_jobs", "pace_snapshots"):
        definition = schema.split(f"create table if not exists public.{table}", 1)[1].split(");", 1)[0]
        assert "references public.pace_profiles(user_id) on delete cascade" in definition
    batches = schema.split("create table if not exists public.pace_import_batches", 1)[1].split(");", 1)[0]
    assert "references public.pace_sync_jobs(id, user_id) on delete cascade" in batches
