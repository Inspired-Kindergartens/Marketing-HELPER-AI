import { THEME_HEAD_SCRIPT } from "./theme.js";

// Full backup, locked with a passphrase the user chooses. The file is saved on
// this computer only; the page shows where, never offers it for download.
export function renderBackupPage(input: { minPassphraseLength: number }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Back Up Data - Marketing Helper AI</title>
    <link rel="icon" href="/favicon.ico" type="image/png" />
    <link rel="stylesheet" href="/vendor/bootstrap-icons.css" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/themes.css" />
    ${THEME_HEAD_SCRIPT}
  </head>
  <body class="landing-body">
    <main class="contact-upload grid gap-16 text-body">
      <a class="contact-upload__back text-muted" href="/">Back to landing</a>
      <h1>Back Up Data</h1>
      <p>Saves everything the app holds (the database, uploaded files and the passwords and keys for Infocare, Google, Meta, Postmark, Mailchimp and Formstack) into one file on this computer, locked with a passphrase you choose.</p>
      <p><strong>Keep the passphrase in the organisation's password manager.</strong> Without it the backup cannot be opened. Nobody, including whoever looks after the app, can recover it.</p>
      <p class="contact-upload__status text-accent" data-backup-status hidden></p>
      <p class="contact-upload__error" data-backup-error hidden></p>
      <form class="contact-upload__form flex flex-wrap gap-12" data-backup-form autocomplete="off">
        <label class="field-label">
          <span>Passphrase (at least ${input.minPassphraseLength} characters)</span>
          <input class="form-control" type="password" name="passphrase" minlength="${input.minPassphraseLength}" autocomplete="new-password" required />
        </label>
        <label class="field-label">
          <span>Type it again</span>
          <input class="form-control" type="password" name="confirm" minlength="${input.minPassphraseLength}" autocomplete="new-password" required />
        </label>
        <button type="submit"><i class="bi bi-database-lock" aria-hidden="true"></i><span data-backup-label>Create backup</span></button>
      </form>
    </main>
    <script>
      (function () {
        var form = document.querySelector("[data-backup-form]");
        var status = document.querySelector("[data-backup-status]");
        var error = document.querySelector("[data-backup-error]");
        var label = document.querySelector("[data-backup-label]");
        var button = form.querySelector("button");
        function show(el, text) {
          status.hidden = true;
          error.hidden = true;
          el.textContent = text;
          el.hidden = false;
        }
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          if (form.passphrase.value !== form.confirm.value) {
            show(error, "The two passphrases don't match.");
            return;
          }
          button.disabled = true;
          label.textContent = "Backing up…";
          fetch("/actions/backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passphrase: form.passphrase.value }),
          })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
              if (payload.ok) {
                form.reset();
                show(status, "Backup saved on this computer: " + payload.path);
              } else {
                show(error, payload.error || "Backup failed.");
              }
            })
            .catch(function () {
              show(error, "Backup failed.");
            })
            .then(function () {
              button.disabled = false;
              label.textContent = "Create backup";
            });
        });
      })();
    </script>
  </body>
</html>`;
}
