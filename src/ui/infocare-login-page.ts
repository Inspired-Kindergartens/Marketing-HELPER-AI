import { THEME_HEAD_SCRIPT } from "./theme.js";

// Change the Infocare API login. Write-only by design: the page never receives
// the current username or password (only whether they are set), and the inputs
// are never pre-filled. The server tests new details against Infocare before
// saving them to .env.
export function renderInfocareLoginPage(input: { isConfigured: boolean; updatedAt: string | null }) {
  const current = input.isConfigured ? "Set" : "Not set";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Infocare Login - Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="landing-body">
    <main class="contact-upload grid gap-16 text-body">
      <a class="contact-upload__back text-muted" href="/">Back to landing</a>
      <h1>Infocare Login</h1>
      <p>Change the username and password the app uses to read from Infocare. For security the current details are never shown. Enter the new ones and they are checked with Infocare before being saved.</p>
      <p class="contact-upload__status text-accent" data-infocare-status hidden></p>
      <p class="contact-upload__error" data-infocare-error hidden></p>
      <dl class="contact-upload__meta grid gap-10">
        <div><dt>Current login</dt><dd>${current}</dd></div>
        <div><dt>Last changed</dt><dd>${input.updatedAt ?? "Not changed in the app"}</dd></div>
      </dl>
      <form class="contact-upload__form flex flex-wrap gap-12" data-infocare-form autocomplete="off">
        <label class="field-label">
          <span>New username</span>
          <input class="form-control" type="text" name="username" autocomplete="off" spellcheck="false" required />
        </label>
        <label class="field-label">
          <span>New password</span>
          <input class="form-control" type="password" name="password" autocomplete="new-password" required />
        </label>
        <button type="submit"><i class="bi bi-shield-lock" aria-hidden="true"></i><span data-infocare-label>Check and save</span></button>
      </form>
    </main>
    <script>
      (function () {
        var form = document.querySelector("[data-infocare-form]");
        var status = document.querySelector("[data-infocare-status]");
        var error = document.querySelector("[data-infocare-error]");
        var label = document.querySelector("[data-infocare-label]");
        var button = form.querySelector("button");
        function show(el, text) {
          status.hidden = true;
          error.hidden = true;
          el.textContent = text;
          el.hidden = false;
        }
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          button.disabled = true;
          label.textContent = "Checking with Infocare…";
          fetch("/api/settings/infocare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: form.username.value, password: form.password.value }),
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (payload.ok) {
                form.reset();
                show(status, "Saved. Infocare accepted the new login and the app is using it now.");
                setTimeout(function () { window.location.reload(); }, 2500);
              } else {
                form.password.value = "";
                show(error, payload.error || "The login could not be saved.");
              }
            })
            .catch(function () {
              form.password.value = "";
              show(error, "The login could not be saved.");
            })
            .then(function () {
              button.disabled = false;
              label.textContent = "Check and save";
            });
        });
      })();
    </script>
  </body>
</html>`;
}
