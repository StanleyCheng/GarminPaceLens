import { initLanguage, message as msg, setText, setLabel, number, date, errorMessage, onLanguageChange } from "./i18n.mjs";
import { createInsightDashboard } from "./insight-ui.mjs";
import { parseLocalExport } from "./local-export.mjs";
import { createAdminPanel } from "./admin-ui.mjs";
import { createDeletionDialog } from "./account-deletion.mjs";

const statusEl = document.getElementById("status");
const refreshButton = document.getElementById("refresh-button");
const lastUpdatedEl = document.getElementById("last-updated");
const authView = document.getElementById("auth-view");
const accountView = document.getElementById("account-view");
const emptyView = document.getElementById("empty-view");
const accountBar = document.getElementById("account-bar");
const accountButton = document.getElementById("account-button");
const dashboardContent = document.getElementById("dashboard-content");
const adminView = document.getElementById("admin-view");
const adminButton = document.getElementById("admin-button");
const stanleyReturnButton = document.getElementById("stanley-return-button");
const dashboard = createInsightDashboard();
const deletion = createDeletionDialog({ request: apiRequest,
  sessionExpired: () => showAuth("Your session expired. Sign in again to manage your account.", true) });
const admin = createAdminPanel({ request: apiRequest, viewDashboard: viewUserDashboard,
  sessionExpired: () => showAuth("Your session expired. Sign in again to manage users.", true),
  closeDeletion: () => deletion.close(),
  confirmDeletion: (user, onDeleted) => deletion.open(user, {
    action: "admin-delete-user", self: user.username === currentUser?.username,
    onDeleted: (result) => {
      if (result.deleted_self) {
        showAuth("Your account and all linked records have been deleted.");
        return;
      }
      if (viewedUser?.user_id === user.user_id) {
        viewedUser = null;
        currentPaceData = null;
        dashboard.clear();
        setUpdatedTime(null);
        updateNavigation();
      }
      onDeleted();
    },
  }) });
let lastUpdatedValue = null;
let currentPaceData = null;
let localMode = false;
let currentUser = null;
let signupMode = false;
let syncRunning = false;
let accountRunning = false;
let refreshGeneration = 0;
let viewGeneration = 0;
let viewedUser = null;
let ownPayload = null;

function updateNavigation() {
  const isAdmin = !localMode && currentUser?.username === "stanley";
  adminButton.hidden = !isAdmin;
  adminButton.disabled = syncRunning || accountRunning;
  stanleyReturnButton.hidden = !isAdmin || (adminView.hidden && !viewedUser);
  stanleyReturnButton.disabled = syncRunning || accountRunning;
  document.getElementById("signout-button").disabled = accountRunning;
  accountView.querySelectorAll("input, textarea, button").forEach((field) => {
    field.disabled = accountRunning || syncRunning;
  });
  accountButton.disabled = syncRunning || accountRunning || localMode;
  refreshButton.disabled = syncRunning || accountRunning || !currentUser;
  accountButton.hidden = localMode || Boolean(viewedUser) || !adminView.hidden;
  refreshButton.hidden = localMode || Boolean(viewedUser) || !adminView.hidden;
  document.querySelector(".refresh-control").hidden = !adminView.hidden;
  document.getElementById("viewing-banner").hidden = !viewedUser || !adminView.hidden;
  document.getElementById("empty-refresh").hidden = localMode || Boolean(viewedUser);
}

function showStatus(message, kind = "") {
  statusEl.className = `status${kind ? ` status-${kind}` : ""}`;
  statusEl.setAttribute("role", kind === "error" ? "alert" : "status");
  setText(statusEl, message);
  statusEl.hidden = !message;
}

function setUpdatedTime(value) {
  lastUpdatedValue = value;
  const updated = new Date(value);
  if (value && Number.isFinite(updated.getTime())) {
    lastUpdatedEl.dateTime = updated.toISOString();
    setText(lastUpdatedEl, date(updated, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    }));
    setLabel(lastUpdatedEl, "title", msg("{label}: {time}", { label: msg(localMode ? "Export generated" : "Last successful Garmin sync"), time: date(updated, { dateStyle: "long", timeStyle: "short" }) }));
  } else {
    lastUpdatedEl.removeAttribute("datetime");
    setText(lastUpdatedEl, localMode ? "No export loaded" : "Not synced yet");
    setLabel(lastUpdatedEl, "title", localMode ? "Choose a Garmin JSON export below" : "A date appears after a complete import");
  }
}

function showDashboard() {
  admin.hide();
  adminView.hidden = true;
  adminButton.removeAttribute("aria-current");
  authView.hidden = true;
  accountView.hidden = true;
  accountButton.removeAttribute("aria-current");
  dashboardContent.hidden = !currentPaceData;
  emptyView.hidden = Boolean(currentPaceData);
  setText(document.querySelector(".dashboard-heading h2"), viewedUser
    ? msg("{username}’s training, in context", { username: viewedUser.username }) : "Your training, in context");
  if (!localMode) {
    setText(document.getElementById("empty-title"), viewedUser
      ? msg("{username} has no imported history", { username: viewedUser.username }) : "Start with your Garmin history");
    setText(document.getElementById("empty-intro"), viewedUser
      ? "This user has not completed an import. Their records will appear after they sync Garmin."
      : "Import your Garmin activities to explore ten training and performance views.");
  }
  updateNavigation();
  if (currentPaceData) dashboard.render();
}

function setSyncState(running, count = 0) {
  syncRunning = running;
  document.getElementById("sync-dot").hidden = !running;
  setText(document.getElementById("sync-label"), running
    ? msg("Loading · {count} records", { count: number(count) }) : localMode ? "Local export" : viewedUser ? "Last user import" : "Last data update");
  refreshButton.disabled = running || !currentUser;
  setLabel(refreshButton, "aria-label", running
    ? "Loading all Garmin activities" : "Refresh all Garmin activities");
  setLabel(refreshButton, "title", currentUser ? "Refresh your complete Garmin history" : "Sign in to refresh your Garmin history");
  if (running) refreshButton.setAttribute("aria-busy", "true");
  else refreshButton.removeAttribute("aria-busy");
  document.getElementById("empty-refresh").disabled = running;
  setText(document.getElementById("empty-refresh"), running ? "Importing all activities…" : "Import all Garmin activities");
  accountButton.disabled = running || localMode;
  updateNavigation();
}

function clearUser() {
  refreshGeneration += 1;
  viewGeneration += 1;
  admin.clear();
  adminView.hidden = true;
  viewedUser = null;
  ownPayload = null;
  accountRunning = false;
  clearOwnPasswordForm();
  currentUser = null;
  currentPaceData = null;
  localMode = false;
  dashboard.clear();
  accountBar.hidden = true;
  accountButton.hidden = false;
  document.getElementById("local-file-replace").hidden = true;
  document.getElementById("local-file-picker").hidden = true;
  document.getElementById("local-online-link").hidden = true;
  document.getElementById("empty-refresh").hidden = false;
  setText(document.getElementById("empty-title"), "Start with your Garmin history");
  setText(document.getElementById("empty-intro"), "Import your Garmin activities to explore ten training and performance views.");
  dashboardContent.hidden = true;
  accountView.hidden = true;
  emptyView.hidden = true;
  document.getElementById("garmin-password").value = "";
  document.getElementById("garmin-username").value = "";
  setText(document.getElementById("account-name"), "");
  document.getElementById("garmin-session").value = "";
  document.getElementById("signup-garmin-password").value = "";
  document.getElementById("app-password").value = "";
  setUpdatedTime(null);
  setSyncState(false);
}

function setAuthMode(signup) {
  signupMode = signup;
  setText(document.getElementById("auth-title"), signup ? "Create your account" : "Welcome back");
  setText(document.getElementById("auth-intro"), signup
    ? "Choose your app sign-in and connect Garmin to import your complete activity history."
    : "Sign in to explore your personal Garmin activity history.");
  document.getElementById("signup-garmin").hidden = !signup;
  document.getElementById("signup-garmin").disabled = !signup;
  document.getElementById("username-hint").hidden = !signup;
  document.getElementById("password-hint").hidden = !signup;
  const password = document.getElementById("app-password");
  password.value = "";
  password.autocomplete = signup ? "new-password" : "current-password";
  password.minLength = signup ? 10 : 1;
  document.getElementById("signup-garmin-password").value = "";
  setText(document.getElementById("auth-submit"), signup ? "Create account and import" : "Sign in");
  setText(document.getElementById("auth-switch-copy"), signup ? "Already have an account?" : "New to Garmin Pace Lens?");
  setText(document.getElementById("auth-switch"), signup ? "Sign in" : "Create an account");
}

function showAuth(message = "", isError = false) {
  clearUser();
  setAuthMode(false);
  authView.hidden = false;
  showStatus(message, isError ? "error" : "");
}

function applyPayload(payload) {
  if (!Array.isArray(payload.activities)) throw new Error("The Garmin response is invalid. Refresh again to retry.");
  currentPaceData = dashboard.applyPayload(payload);
  setUpdatedTime(payload.meta?.generated_at);
  showDashboard();
}

function showLocalFilePicker() {
  localMode = true;
  currentUser = { username: "Local preview" };
  accountBar.hidden = true;
  authView.hidden = true;
  accountView.hidden = true;
  dashboardContent.hidden = true;
  emptyView.hidden = false;
  setText(document.getElementById("empty-title"), "Open your Garmin export");
  setText(document.getElementById("empty-intro"), "Choose the garmin_activities.json file created by get-garmin.py in viz/data. Your activity data stays in this browser.");
  document.getElementById("empty-refresh").hidden = true;
  document.getElementById("local-file-picker").hidden = false;
  document.getElementById("local-online-link").hidden = false;
  setUpdatedTime(null);
  setSyncState(false);
  showStatus("");
}

async function loadLocalFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const payload = parseLocalExport(await file.text());
    applyPayload(payload);
    accountBar.hidden = false;
    setText(document.getElementById("account-name"), "Local data preview");
    accountButton.hidden = true;
    document.getElementById("signout-button").hidden = true;
    document.getElementById("local-file-replace").hidden = false;
    showStatus(msg("{filename} opened locally. Your activity data stays in this browser.", { filename: file.name }), "success");
  } catch (error) {
    showStatus(msg("{error} Choose a Garmin Pace Lens JSON export and try again.", { error: errorMessage(error) }), "error");
  } finally {
    input.value = "";
  }
}

async function apiRequest(action, body) {
  let response;
  try {
    response = await fetch(`/api/dashboard${action ? `?action=${action}` : ""}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Could not reach the dashboard server. Check your connection and try again.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error(response.status === 504
      ? "The Garmin import timed out. Try refreshing again."
      : "The dashboard server is unavailable. Try again later.");
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(payload.error || "Could not load Garmin data. Try again later.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadDashboard() {
  if (location.protocol === "file:") {
    showLocalFilePicker();
    return true;
  }
  try {
    const result = await apiRequest();
    if (!result.user?.username) throw new Error("Your account could not be loaded. Sign in again.");
    currentUser = result.user;
    viewedUser = null;
    ownPayload = result.payload || null;
    accountBar.hidden = false;
    setText(document.getElementById("account-name"), msg("Signed in as {username}", { username: currentUser.username }));
    document.getElementById("signout-button").hidden = false;
    if (result.payload) applyPayload(result.payload);
    else {
      currentPaceData = null;
      setUpdatedTime(null);
      showDashboard();
    }
    setSyncState(false);
    showStatus("");
    return true;
  } catch (error) {
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (isLocal && (error.status === 404 || error.status === 501)) {
      try {
        const response = await fetch("./data/garmin_activities.json", { cache: "no-store" });
        if (response.ok) {
          showLocalFilePicker();
          accountBar.hidden = false;
          setText(document.getElementById("account-name"), "Local data preview");
          accountButton.hidden = true;
          document.getElementById("signout-button").hidden = true;
          document.getElementById("local-file-replace").hidden = false;
          applyPayload(parseLocalExport(await response.text()));
          setSyncState(false);
          showStatus("Local data preview. Live Garmin imports and accounts are available on the deployed app.");
          return true;
        }
      } catch { /* A missing or invalid local export can be selected manually. */ }
      showLocalFilePicker();
      return true;
    }
    showAuth(error.status === 401 ? "" : errorMessage(error), error.status !== 401);
    return false;
  }
}

async function refresh() {
  if (syncRunning || !currentUser || viewedUser || !adminView.hidden) return;
  if (localMode) {
    showStatus("Run get-garmin.py for newer data, then choose the refreshed JSON export.");
    return;
  }
  const generation = ++refreshGeneration;
  setSyncState(true);
  showStatus("Connecting to Garmin. Importing every activity from your account; keep this tab open until loading finishes.");
  try {
    let result = await apiRequest("refresh", {});
    if (generation !== refreshGeneration) return;
    if (!result.job_id && !result.complete) throw new Error("The import could not start. Refresh again to retry.");
    const jobId = result.job_id;
    while (!result.complete) {
      const count = Number.isInteger(result.records_loaded) ? result.records_loaded : 0;
      setSyncState(true, count);
      showStatus(msg("Importing your complete Garmin history… {count} records loaded. Keep this tab open until loading finishes.", { count: number(count) }));
      result = await apiRequest("sync-step", { job_id: jobId });
      if (generation !== refreshGeneration) return;
    }
    if (!result.payload) throw new Error("The completed import did not include your dashboard. Refresh again to retry.");
    ownPayload = result.payload;
    applyPayload(result.payload);
    const count = Number.isInteger(result.records_loaded) ? result.records_loaded : result.payload.meta?.activity_count_fetched;
    showStatus(Number.isInteger(count)
      ? msg("{count} Garmin records imported. Your dashboard is up to date.", { count: number(count) })
      : "All Garmin records imported. Your dashboard is up to date.", "success");
  } catch (error) {
    if (generation !== refreshGeneration) return;
    if (error.status === 401) {
      showAuth("Your session expired. Sign in again to import your Garmin history.", true);
    } else {
      showStatus(msg("Import stopped. {error}{previous}", { error: errorMessage(error), previous: msg(currentPaceData ? " Your last completed dashboard is still available." : "") }), "error");
    }
  } finally {
    if (generation === refreshGeneration) setSyncState(false);
  }
}

function setFormBusy(form, busy) {
  for (const field of form.querySelectorAll("input, textarea, button")) field.disabled = busy;
  const button = form.querySelector('button[type="submit"]');
  if (busy) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
}

function setAccountBusy(busy) {
  accountRunning = busy;
  accountView.querySelectorAll("input, textarea, button").forEach((field) => { field.disabled = busy; });
  updateNavigation();
}

function resetOwnPasswordInputs() {
  document.getElementById("own-current-password").value = "";
  const field = document.getElementById("own-new-password");
  field.value = "";
  field.type = "password";
  const toggle = document.getElementById("own-password-toggle");
  setText(toggle, "Show");
  toggle.setAttribute("aria-pressed", "false");
  setLabel(toggle, "aria-label", "Show new app password");
}

function clearOwnPasswordForm() {
  resetOwnPasswordInputs();
  const status = document.getElementById("own-password-status");
  setText(status, "");
  status.hidden = true;
}

async function submitOwnPassword(event) {
  event.preventDefault();
  if (!currentUser || localMode || viewedUser || accountRunning || syncRunning) return;
  const form = event.currentTarget;
  const status = document.getElementById("own-password-status");
  const body = { current_password: document.getElementById("own-current-password").value,
    new_password: document.getElementById("own-new-password").value };
  setAccountBusy(true);
  setFormBusy(form, true);
  status.className = "status";
  status.setAttribute("role", "status");
  setText(status, "Changing your app password…");
  status.hidden = false;
  try {
    await apiRequest("app-password", body);
    status.className = "status status-success";
    setText(status, "Your app password has been changed. Use the new password the next time you sign in.");
  } catch (error) {
    if (error.status === 401) showAuth("Your session expired. Sign in again to change your password.", true);
    else {
      status.className = "status status-error";
      status.setAttribute("role", "alert");
      setText(status, errorMessage(error));
    }
  } finally {
    resetOwnPasswordInputs();
    setFormBusy(form, false);
    setAccountBusy(false);
  }
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const signup = signupMode;
  const body = {
    username: document.getElementById("app-username").value.trim(),
    password: document.getElementById("app-password").value,
  };
  if (signup) {
    body.garmin_username = document.getElementById("signup-garmin-username").value.trim();
    body.garmin_password = document.getElementById("signup-garmin-password").value;
  }
  setFormBusy(form, true);
  document.getElementById("auth-switch").disabled = true;
  showStatus(signup ? "Creating your account…" : "Signing in…");
  try {
    await apiRequest(signup ? "signup" : "login", body);
    document.getElementById("app-password").value = "";
    document.getElementById("signup-garmin-password").value = "";
    const loaded = await loadDashboard();
    if (signup && loaded) await refresh();
  } catch (error) {
    showStatus(errorMessage(error), "error");
    document.getElementById("app-password").value = "";
  } finally {
    setFormBusy(form, false);
    document.getElementById("auth-switch").disabled = false;
  }
}

function openAccount() {
  if (!currentUser || syncRunning || accountRunning || localMode || viewedUser || !adminView.hidden) return;
  clearOwnPasswordForm();
  document.getElementById("garmin-username").value = currentUser.garmin_username || "";
  document.getElementById("garmin-password").value = "";
  dashboardContent.hidden = true;
  emptyView.hidden = true;
  accountView.hidden = false;
  accountButton.setAttribute("aria-current", "page");
  showStatus("");
  document.getElementById("garmin-username").focus();
}

function openAdmin() {
  if (currentUser?.username !== "stanley" || localMode || syncRunning || accountRunning) return;
  viewGeneration += 1;
  dashboardContent.hidden = true;
  emptyView.hidden = true;
  accountView.hidden = true;
  authView.hidden = true;
  adminView.hidden = false;
  accountButton.removeAttribute("aria-current");
  adminButton.setAttribute("aria-current", "page");
  updateNavigation();
  showStatus("");
  document.getElementById("admin-title").focus();
  void admin.open();
}

async function viewUserDashboard(user) {
  const generation = ++viewGeneration;
  const result = await apiRequest(`admin-dashboard&user_id=${encodeURIComponent(user.user_id)}`);
  if (generation !== viewGeneration || !currentUser) return;
  if (!result.read_only || result.user?.user_id !== user.user_id) {
    throw new Error("The selected dashboard could not be verified. Reload users and try again.");
  }
  viewedUser = result.user;
  dashboard.clear();
  currentPaceData = null;
  setText(document.getElementById("viewing-name"), msg("Viewing {username}’s dashboard", { username: viewedUser.username }));
  if (result.payload) applyPayload(result.payload);
  else {
    setUpdatedTime(null);
    showDashboard();
  }
  setSyncState(false);
  showStatus("");
  document.getElementById("viewing-back-button").focus();
}

function returnToStanley() {
  if (currentUser?.username !== "stanley") return;
  viewGeneration += 1;
  viewedUser = null;
  currentPaceData = null;
  dashboard.clear();
  if (ownPayload) applyPayload(ownPayload);
  else {
    setUpdatedTime(null);
    showDashboard();
  }
  setSyncState(false);
  showStatus("");
  adminButton.focus();
}

async function submitGarmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (accountRunning || syncRunning) return;
  setAccountBusy(true);
  setFormBusy(form, true);
  showStatus("Saving your Garmin connection…");
  try {
    await apiRequest("garmin", {
      garmin_username: document.getElementById("garmin-username").value.trim(),
      garmin_password: document.getElementById("garmin-password").value,
    });
    document.getElementById("garmin-password").value = "";
    // The old payload belongs to the previous Garmin connection.
    currentPaceData = null;
    dashboard.clear();
    setUpdatedTime(null);
    if (await loadDashboard()) await refresh();
  } catch (error) {
    if (error.status === 401) showAuth("Your session expired. Sign in again to change your Garmin connection.", true);
    else showStatus(errorMessage(error), "error");
  } finally {
    setFormBusy(form, false);
    setAccountBusy(false);
  }
}

async function signOut() {
  const button = document.getElementById("signout-button");
  button.disabled = true;
  try {
    await apiRequest("logout", {});
    showAuth("You have signed out.");
  } catch (error) {
    showStatus(msg("Could not sign out. {error}", { error: errorMessage(error) }), "error");
  } finally {
    button.disabled = false;
  }
}

async function submitSession(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (accountRunning || syncRunning) return;
  const field = document.getElementById("garmin-session");
  try {
    JSON.parse(field.value);
  } catch {
    showStatus("The session is not valid JSON. Copy the complete verified-session file and try again.", "error");
    field.focus();
    return;
  }
  setAccountBusy(true);
  setFormBusy(form, true);
  showStatus("Saving your verified Garmin session…");
  try {
    await apiRequest("garmin-session", { session_json: field.value });
    field.value = "";
    showDashboard();
    await refresh();
  } catch (error) {
    if (error.status === 401) showAuth("Your session expired. Sign in again to save your Garmin connection.", true);
    else showStatus(errorMessage(error), "error");
  } finally {
    setFormBusy(form, false);
    setAccountBusy(false);
  }
}

async function init() {
  initLanguage();
  onLanguageChange(() => setUpdatedTime(lastUpdatedValue));
  dashboard.init();
  deletion.init();
  admin.init();
  document.getElementById("own-app-password-form").addEventListener("submit", submitOwnPassword);
  document.getElementById("own-password-toggle").addEventListener("click", (event) => {
    const field = document.getElementById("own-new-password");
    const visible = field.type === "password";
    field.type = visible ? "text" : "password";
    setText(event.currentTarget, visible ? "Hide" : "Show");
    event.currentTarget.setAttribute("aria-pressed", String(visible));
    setLabel(event.currentTarget, "aria-label", visible ? "Hide new app password" : "Show new app password");
  });
  document.getElementById("delete-own-account").addEventListener("click", () => {
    if (!currentUser || accountRunning || syncRunning || localMode || viewedUser) return;
    deletion.open(currentUser, { action: "delete-account", self: true,
      onDeleted: () => showAuth("Your account and all linked records have been deleted.") });
  });
  adminButton.addEventListener("click", openAdmin);
  document.getElementById("viewing-back-button").addEventListener("click", openAdmin);
  stanleyReturnButton.addEventListener("click", returnToStanley);
  document.querySelectorAll(".local-data-input").forEach((input) => input.addEventListener("change", loadLocalFile));
  refreshButton.addEventListener("click", refresh);
  document.getElementById("empty-refresh").addEventListener("click", refresh);
  document.getElementById("auth-form").addEventListener("submit", submitAuth);
  document.getElementById("auth-switch").addEventListener("click", () => {
    setAuthMode(!signupMode);
    showStatus("");
    document.getElementById("app-username").focus();
  });
  accountButton.addEventListener("click", openAccount);
  document.getElementById("back-button").addEventListener("click", () => {
    showDashboard();
    showStatus("");
    accountButton.focus();
  });
  document.getElementById("garmin-form").addEventListener("submit", submitGarmin);
  document.getElementById("session-form").addEventListener("submit", submitSession);
  document.getElementById("signout-button").addEventListener("click", signOut);
  await loadDashboard();
}

window.addEventListener("DOMContentLoaded", init);
