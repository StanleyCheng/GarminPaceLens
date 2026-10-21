import { message as msg, setText, setLabel, t, number, date, errorMessage, onLanguageChange } from "./i18n.mjs";
export function createAdminPanel({ request, viewDashboard, sessionExpired, confirmDeletion, closeDeletion }) {
  const view = document.getElementById("admin-view");
  const status = document.getElementById("admin-status");
  const list = document.getElementById("admin-user-list");
  const search = document.getElementById("admin-search");
  const detail = document.getElementById("admin-user-detail");
  const reveal = document.getElementById("admin-reveal-garmin");
  let users = [];
  let loaded = false;
  let selected = null;
  let generation = 0;

  function notice(message = "", kind = "", target = status) {
    setText(target, message);
    target.className = `status${kind ? ` status-${kind}` : ""}`;
    target.setAttribute("role", kind === "error" ? "alert" : "status");
    target.hidden = !message;
  }

  function resetPasswordField(id) {
    const field = document.getElementById(id);
    field.value = "";
    field.type = "password";
    const button = view.querySelector(`[data-password-toggle="${id}"]`);
    setText(button, "Show");
    button.setAttribute("aria-pressed", "false");
    setLabel(button, "aria-label", id.includes("app") ? "Show new app password" : "Show new Garmin password");
  }

  function hideSavedPassword() {
    document.getElementById("admin-current-garmin-password").value = "";
    document.getElementById("admin-saved-garmin").hidden = true;
    setText(reveal, "Show saved Garmin password");
    reveal.setAttribute("aria-expanded", "false");
  }

  function clearPasswords() {
    resetPasswordField("admin-app-password");
    resetPasswordField("admin-garmin-password");
    hideSavedPassword();
    notice("", "", document.getElementById("admin-app-status"));
    notice("", "", document.getElementById("admin-garmin-status"));
    setText(document.getElementById("admin-garmin-account"), "The Garmin account used for this user’s imports.");
  }

  function busy(value) {
    view.querySelectorAll("button, input").forEach((element) => { element.disabled = value; });
    if (value) view.setAttribute("aria-busy", "true");
    else view.removeAttribute("aria-busy");
  }

  function fail(error, target = status) {
    if (error.status === 401) sessionExpired();
    else notice(errorMessage(error), "error", target);
  }

  function recordLabel(user) {
    return user.imported_records == null ? msg("Record count unavailable") : msg("{count} imported records", { count: number(user.imported_records) });
  }

  function renderUsers() {
    const filtered = users.filter((user) => user.username.toLowerCase().includes(search.value.trim().toLowerCase()));
    list.replaceChildren();
    setText(document.getElementById("admin-user-count"), search.value.trim()
      ? msg("{count} of {total} users", { count: number(filtered.length), total: number(users.length) }) : msg(users.length === 1 ? "{count} user" : "{count} users", { count: number(users.length) }));
    const empty = document.getElementById("admin-list-empty");
    empty.hidden = filtered.length > 0;
    setText(empty, users.length ? "No matching users. Try another username." : "No users found. Reload the list to try again.");
    for (const user of filtered) {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "user-select";
      button.disabled = view.hasAttribute("aria-busy");
      button.setAttribute("aria-pressed", String(selected?.user_id === user.user_id));
      button.setAttribute("aria-label", t("Manage {username}, {records}", { username: user.username, records: recordLabel(user) }));
      const identity = document.createElement("span");
      identity.className = "user-list-identity";
      const name = document.createElement("strong");
      name.textContent = user.username;
      const time = document.createElement("span");
      const imported = new Date(user.last_import_at);
      time.textContent = user.last_import_at && Number.isFinite(imported.getTime())
        ? date(imported, { year: "numeric", month: "short", day: "numeric" })
        : t("No completed import");
      identity.append(name, time);
      const count = document.createElement("span");
      count.className = "user-record-count";
      count.textContent = user.imported_records == null ? t("Unavailable") : number(user.imported_records);
      button.append(identity, count);
      button.addEventListener("click", () => selectUser(user));
      row.append(button);
      list.append(row);
    }
  }

  function selectUser(user) {
    selected = user;
    clearPasswords();
    notice();
    setText(document.getElementById("admin-selected-name"), msg("{value}", { value: user.username }));
    setText(document.getElementById("admin-selected-records"), recordLabel(user));
    document.getElementById("admin-select-prompt").hidden = true;
    detail.hidden = false;
    renderUsers();
    document.getElementById("admin-selected-name").focus();
  }

  async function open() {
    loaded = false;
    const ticket = ++generation;
    selected = null;
    users = [];
    search.value = "";
    clearPasswords();
    list.replaceChildren();
    detail.hidden = true;
    document.getElementById("admin-select-prompt").hidden = false;
    document.getElementById("admin-list-empty").hidden = true;
    setText(document.getElementById("admin-user-count"), "Loading…");
    notice("Loading users and completed import totals…");
    busy(true);
    try {
      const result = await request("admin-users");
      if (ticket !== generation) return;
      if (!Array.isArray(result.users)) throw new Error("The user list could not be loaded. Reload users to try again.");
      users = result.users;
      loaded = true;
      renderUsers();
      notice();
    } catch (error) {
      if (ticket === generation) fail(error);
    } finally {
      if (ticket === generation) busy(false);
    }
  }

  async function showGarminPassword() {
    if (!selected) return;
    const saved = document.getElementById("admin-saved-garmin");
    if (!saved.hidden) {
      hideSavedPassword();
      return;
    }
    const ticket = generation;
    busy(true);
    notice();
    try {
      const result = await request("admin-show-garmin-password", { user_id: selected.user_id });
      if (ticket !== generation) return;
      document.getElementById("admin-current-garmin-password").value = result.garmin_password;
      setText(document.getElementById("admin-garmin-account"), msg("{value}", { value: result.garmin_username }));
      saved.hidden = false;
      setText(reveal, "Hide saved Garmin password");
      reveal.setAttribute("aria-expanded", "true");
    } catch (error) {
      if (ticket === generation) fail(error);
    } finally {
      if (ticket === generation) busy(false);
    }
  }

  async function savePassword(event, kind) {
    event.preventDefault();
    if (!selected) return;
    const user = selected;
    const ticket = generation;
    const field = document.getElementById(`admin-${kind}-password`);
    const feedback = document.getElementById(`admin-${kind}-status`);
    busy(true);
    notice(msg(kind === "app" ? "Saving app sign-in password for {username}…" : "Saving Garmin connection password for {username}…", { username: user.username }), "", feedback);
    try {
      await request(`admin-${kind}-password`, { user_id: user.user_id, password: field.value });
      if (ticket !== generation) return;
      if (kind === "garmin") hideSavedPassword();
      notice(msg(kind === "app" ? "App sign-in password saved for {username}." : "Garmin connection password saved for {username}. Imported history is unchanged.", { username: user.username }), "success", feedback);
    } catch (error) {
      if (ticket === generation) fail(error, feedback);
    } finally {
      if (ticket === generation) {
        resetPasswordField(field.id);
        busy(false);
      }
    }
  }

  function init() {
    onLanguageChange(() => { if (loaded) renderUsers(); });
    document.getElementById("admin-delete-user").addEventListener("click", () => {
      if (!selected) return;
      const user = { ...selected };
      hideSavedPassword();
      confirmDeletion(user, () => {
        clearPasswords();
        selected = null;
        users = users.filter((item) => item.user_id !== user.user_id);
        detail.hidden = true;
        document.getElementById("admin-select-prompt").hidden = false;
        renderUsers();
        notice(msg("{username}’s app login and all linked records were deleted.", { username: user.username }), "success");
        search.focus();
      });
    });
    search.addEventListener("input", renderUsers);
    document.getElementById("admin-reload").addEventListener("click", open);
    reveal.addEventListener("click", showGarminPassword);
    document.getElementById("admin-app-form").addEventListener("submit", (event) => savePassword(event, "app"));
    document.getElementById("admin-garmin-form").addEventListener("submit", (event) => savePassword(event, "garmin"));
    document.getElementById("admin-view-dashboard").addEventListener("click", async () => {
      if (!selected) return;
      const ticket = generation;
      busy(true);
      notice(msg("Opening {username}’s dashboard…", { username: selected.username }));
      try { await viewDashboard(selected); }
      catch (error) { if (ticket === generation) fail(error); }
      finally { if (ticket === generation) busy(false); }
    });
    view.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = document.getElementById(button.dataset.passwordToggle);
        const visible = field.type === "password";
        field.type = visible ? "text" : "password";
        setText(button, visible ? "Hide" : "Show");
        button.setAttribute("aria-pressed", String(visible));
        setLabel(button, "aria-label", field.id.includes("app") ? (visible ? "Hide new app password" : "Show new app password") : (visible ? "Hide new Garmin password" : "Show new Garmin password"));
      });
    });
  }

  function hide() {
    generation += 1;
    closeDeletion();
    clearPasswords();
    busy(false);
  }

  function clear() {
    loaded = false;
    hide();
    selected = null;
    users = [];
    list.replaceChildren();
    search.value = "";
    detail.hidden = true;
    setText(document.getElementById("admin-selected-name"), "");
    notice();
  }

  return { init, open, hide, clear };
}
