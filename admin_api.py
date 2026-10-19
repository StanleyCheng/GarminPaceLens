"""Stanley-only account administration, with explicit target-user boundaries."""

from urllib.parse import urlencode
from uuid import UUID

from supabase_store import (DashboardError, SupabaseError, UserStore,
                            decrypt_private, delete_account, encrypt_private,
                            validate_garmin_credentials)


class AdminStore:
    """Authorize the verified caller before reading or changing another account."""

    def __init__(self, supabase, identity):
        if identity.get("username") != "stanley":
            raise DashboardError("Only Stanley can access account administration.", 403)
        self.supabase = supabase
        self.caller_id = identity.get("id")

    def _rows(self, table, **query):
        return self.supabase.request("/rest/v1/" + table + "?" + urlencode(query))

    def _all_rows(self, table, **query):
        offset = 0
        while True:
            rows = self._rows(table, **query, offset=offset, limit=500)
            if not rows:
                return
            yield from rows
            offset += len(rows)

    def profile(self, user_id):
        try:
            user_id = str(UUID(user_id))
        except (ValueError, TypeError, AttributeError):
            raise DashboardError("Select a valid user.", 400)
        rows = self._rows("pace_profiles", select="user_id,username,created_at",
                          user_id="eq." + user_id)
        if not rows:
            raise DashboardError("This user no longer exists. Reload the user list.", 404)
        return rows[0]

    def users(self):
        profiles = list(self._all_rows("pace_profiles", select="user_id,username,created_at",
                                       order="username.asc,user_id.asc"))
        snapshots = {row["user_id"]: row for row in self._all_rows(
            "pace_snapshots", select="user_id,imported_records:payload->meta->activity_count_fetched,updated_at",
            order="user_id.asc")}
        users = []
        for profile in profiles:
            snapshot = snapshots.get(profile["user_id"])
            count = snapshot.get("imported_records") if snapshot else 0
            users.append({**profile, "imported_records": count if type(count) is int and count >= 0 else None,
                          "last_import_at": snapshot["updated_at"] if snapshot else None})
        return {"users": users}

    def dashboard(self, user_id):
        profile = self.profile(user_id)
        return {"user": profile, "payload": UserStore(self.supabase, profile["user_id"]).snapshot(),
                "read_only": True}

    def _connection(self, profile):
        rows = self._rows("pace_garmin_connections", select="credentials_ciphertext,revision",
                          user_id="eq." + profile["user_id"])
        if not rows:
            raise DashboardError("This user has no saved Garmin connection.", 422)
        row = rows[0]
        return decrypt_private(row["credentials_ciphertext"], profile["user_id"]), row["revision"]

    def garmin_password(self, user_id):
        profile = self.profile(user_id)
        credentials, _ = self._connection(profile)
        return {"garmin_username": credentials["username"], "garmin_password": credentials["password"]}

    def update_garmin_password(self, user_id, password):
        profile = self.profile(user_id)
        credentials, revision = self._connection(profile)
        credentials = validate_garmin_credentials(credentials["username"], password)
        # A password change preserves completed history and invalidates in-flight imports.
        UserStore(self.supabase, profile["user_id"]).call(
            "pace_update_garmin_password", p_revision=revision,
            p_credentials=encrypt_private(credentials, profile["user_id"]))
        return {"ok": True}

    def update_app_password(self, user_id, password):
        profile = self.profile(user_id)
        if not isinstance(password, str) or not 10 <= len(password) <= 128:
            raise DashboardError("Choose an app password with 10–128 characters.", 400)
        try:
            self.supabase.request(f"/auth/v1/admin/users/{profile['user_id']}", method="PUT",
                                  body={"password": password})
        except SupabaseError as exc:
            if exc.code == "weak_password":
                raise DashboardError("Choose a stronger app password with a mix of letters, numbers, and symbols.", 400) from exc
            if exc.status == 404:
                raise DashboardError("This user no longer exists. Reload the user list.", 404) from exc
            raise
        return {"ok": True}

    def delete_user(self, user_id, confirmation):
        """Hard-delete Auth once; database cascades remove the linked app data."""
        profile = self.profile(user_id)
        if confirmation != profile["username"]:
            raise DashboardError("Type the selected user's exact username to confirm deletion.", 400)
        delete_account(self.supabase, profile["user_id"])
        return {"ok": True, "deleted_user_id": profile["user_id"],
                "deleted_self": profile["user_id"] == self.caller_id}
