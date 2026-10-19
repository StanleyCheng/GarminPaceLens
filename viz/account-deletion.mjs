export function createDeletionDialog({ request, sessionExpired }) {
  const dialog = document.getElementById("account-delete-dialog");
  const form = document.getElementById("delete-account-form");
  const confirm = document.getElementById("delete-account-confirm");
  const username = document.getElementById("delete-confirm-username");
  const cancel = document.getElementById("delete-account-cancel");
  const status = document.getElementById("delete-account-status");
  let target = null;
  let running = false;
  let generation = 0;

  function notice(message = "", error = false) {
    status.textContent = message;
    status.className = `status${error ? " status-error" : ""}`;
    status.setAttribute("role", error ? "alert" : "status");
    status.hidden = !message;
  }

  function setBusy(value) {
    running = value;
    username.disabled = value;
    cancel.disabled = value;
    confirm.disabled = value || !target || username.value !== target.user.username;
    if (value) {
      dialog.setAttribute("aria-busy", "true");
      confirm.setAttribute("aria-busy", "true");
    } else {
      dialog.removeAttribute("aria-busy");
      confirm.removeAttribute("aria-busy");
    }
  }

  function close() {
    generation += 1;
    if (dialog.open) dialog.close();
    form.reset();
    target = null;
    setBusy(false);
    notice();
  }

  function open(user, { action, self = false, onDeleted }) {
    if (running) return;
    close();
    target = { user: { ...user }, action, onDeleted };
    document.getElementById("delete-dialog-title").textContent = `Delete ${user.username}?`;
    document.getElementById("delete-confirm-label").textContent = `Type ${user.username} to confirm`;
    document.getElementById("delete-dialog-self").hidden = !self;
    dialog.setAttribute("aria-describedby", self
      ? "delete-dialog-description delete-dialog-self" : "delete-dialog-description");
    dialog.showModal();
    cancel.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (running || !target || username.value !== target.user.username) return;
    const operation = target;
    const ticket = generation;
    setBusy(true);
    notice(`Deleting ${operation.user.username} and all linked records…`);
    try {
      const result = await request(operation.action, {
        user_id: operation.user.user_id, confirm_username: username.value,
      });
      if (ticket !== generation) return;
      if (result.ok !== true) throw new Error("Account deletion could not be confirmed. Reload the page to check the account.");
      close();
      operation.onDeleted(result);
    } catch (error) {
      if (ticket !== generation) return;
      if (error.status === 401) sessionExpired();
      else notice(error.message, true);
    } finally {
      if (ticket === generation) setBusy(false);
    }
  }

  function init() {
    form.addEventListener("submit", submit);
    username.addEventListener("input", () => setBusy(running));
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      if (running) event.preventDefault();
      else close();
    });
  }

  return { init, open, close };
}
