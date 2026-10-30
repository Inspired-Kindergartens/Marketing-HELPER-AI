# Transfer Plan: moving Marketing Helper to a new computer

A checklist in the order it should be done. It covers the data (database and files), the settings and credentials (`.env`), the external services (Infocare, Google Analytics, Meta, Postmark/Cloudflare, Mailchimp, Formstack, GitHub) and the parts that only live on this computer (scheduled task, AI models).

**How the pieces travel:**

| What | How it moves | Machine-bound? |
| --- | --- | --- |
| Database (all app data) | Inside the **Back up data** file (`.mhbak`, locked with your passphrase) | No |
| `.env` (every password, token and key) | Inside the backup file | On disk, the passwords are encrypted so they only unlock on this computer. The backup carries them unlocked under the passphrase, and the restore re-locks them to the new computer. The values themselves work from any computer |
| Google OAuth client + refresh token | `OAuth.json` inside the backup; the refresh token is inside `.env` | No |
| Uploads, Infocare/Meta working files, contact list, feed snapshots | Inside the backup file | No |
| Postmark events while the app is off | Buffered by the Cloudflare Worker; the app catches up from its saved position (stored in the database) | No |
| Code | GitHub | No, but the new computer needs its own GitHub access |
| AI models (~6.6 GB) | Re-downloaded by `npm run ai:setup` | Yes |
| Scheduled task, desktop shortcut | Re-created on the new computer | Yes |

`npm run transfer:check` lists every setting the app needs and shows which are missing (it never prints the values). For each password it also says whether it is encrypted. It tests each service live from the computer it runs on and checks BitLocker. Run it on both computers.

---

## Phase 1: Before the move (old computer)

- [ ] Run `npm run transfer:check` and confirm everything passes, so you know the starting point works.
- [ ] Check service ownership: each one should belong to an organisation account, not a person who may leave.
  - [ ] Google Cloud project (OAuth client for Google Analytics) and the GA4 property: owned by the shared marketing Google account.
  - [ ] Meta: the ads token is a non-expiring **System User** token in Business Manager (transfer:check reports "never expires"). If it ever shows an expiry date, replace it before the move.
  - [ ] Cloudflare account that hosts the `postmark-webhook-events` Worker.
  - [ ] Postmark: the webhook settings are managed by Blacksheep. Nothing changes on a transfer, because Postmark sends events to the Cloudflare Worker, not to this computer.
  - [ ] Mailchimp and Formstack API keys: created under an organisation login.
  - [ ] Infocare API login: confirm with Infocare that it is **not** limited to this computer's IP address or network. If it is, ask them to allow the new location before the move.
  - [ ] GitHub: someone with admin rights on `Inspired-Kindergartens/Marketing-HELPER-AI` is available to add access for the new computer.
- [ ] Decide the **backup passphrase** (at least 12 characters) and save it in the organisation's password manager **before** making the backup. A lost passphrase means the backup can never be opened.
- [ ] Commit and push all code (`git status` clean, `main` matches `origin/main`).
- [ ] Choose a cutover time when nobody is using the app.

## Phase 2: Prepare the new computer

- [ ] Windows 10/11 with at least 16 GB RAM. For the AI to run well, an NVIDIA GPU with at least 4 GB.
- [ ] **BitLocker turned on** for the drive the app will live on (ask IT). It protects the database and files if the computer is lost or stolen.
- [ ] Install **PostgreSQL 18** (same or newer major version than the old computer). Note the `postgres` superuser password you set during install.
- [ ] Install **Node.js 22** LTS and **Git**.
- [ ] GitHub access: create a new SSH key on the new computer and add it as a deploy key on the repo (write access), or sign in with Git Credential Manager. Set it in the repo only (`git config --local`), not globally.
- [ ] Clone the repo, e.g. `git clone git@github.com:Inspired-Kindergartens/Marketing-HELPER-AI.git`.
- [ ] `npm install` (the restore script needs this first).

## Phase 3: Cutover

- [ ] **Old computer: stop the app** so no new data is written after the backup: `npm run server:task:stop`, then close any window still serving port 3000.
- [ ] Old computer: `npm run backup`. It's the same backup as the footer's **Back up data** page, but it works while the app is stopped. Enter the passphrase twice (it isn't shown as you type). It prints where the `.mhbak` file was saved, in the `backups` folder. Anything changed after this point is not in the backup.
- [ ] Copy the `.mhbak` file to the new computer using a USB stick or the work OneDrive. It is encrypted, but still don't email it, and **never send the passphrase alongside it**. Share the passphrase through the password manager.
- [ ] New computer, with the app not running: `powershell -ExecutionPolicy Bypass -File scripts\restore-backup.ps1 -Backup <path-to-.mhbak>`. It:
  - Asks for the passphrase and unlocks the backup. A wrong passphrase stops here with nothing changed.
  - Puts back `.env`, `OAuth.json`, the contact list, uploads, `INFOCARE/`, `META/` and `logs/`.
  - Creates the database login and database named in `.env` (asks for the `postgres` password).
  - Loads all the data.
  - Encrypts the passwords in `.env` so they only unlock on this new computer.
- [ ] `npm run build`
- [ ] `npm run ai:setup` (downloads Ollama and the models; takes a while).
- [ ] `npm run transfer:check`. Everything must say OK. Fix anything marked FAIL before going on:
  - **Infocare login FAIL**: wrong password, or Infocare limits by IP address (see Phase 1). A correct new login can be entered on the app's **Infocare Login** page once the app is running.
  - **Google Analytics WARN**: run `npm run google:oauth` and sign in with the marketing Google account to create a new refresh token. The app moves it into `.env` (encrypted) on its next start.
  - **Meta WARN**: generate a new token (see `.env.example`) and put it in `.env`. It is encrypted on the next start.
  - **"stored as plain text" WARN**: `npm run secrets:seal`.
  - **Migrations FAIL**: `npx prisma migrate deploy`.
- [ ] `npm run server:install` (registers the "Marketing Helper AI Server" scheduled task so the app starts with Windows).
- [ ] Create a desktop shortcut to `scripts\open-marketing-helper.ps1`.

## Phase 4: Check the app works

- [ ] Open http://127.0.0.1:3000. The landing page loads and the news/weather feed updates within 15 minutes.
- [ ] Marketing dashboard: Infocare numbers match the old computer's last view.
- [ ] Refresh Google Analytics, Meta Ads, Mailchimp and Formstack panels; each shows a new "last updated" time.
- [ ] Communications: within an hour, Postmark events sent during the downtime appear (pulled from the Cloudflare Worker). No amber/red banner.
- [ ] Beep Beep answers a question.
- [ ] Tasks: open a task with an attachment and download it.
- [ ] Make a backup on the new computer (**Back up data** page) to prove backups work there.
- [ ] Make a test commit/push from the new computer.

## Phase 5: Retire the old computer

- [ ] Run the old app for **no more than** the cutover window. Two copies running would each pull Postmark events and their data would split.
- [ ] Disable the old scheduled task: `Disable-ScheduledTask -TaskName 'Marketing Helper AI Server'`.
- [ ] Remove the old computer's GitHub deploy key from the repo settings.
- [ ] Once the new computer has run well for a couple of weeks, delete the project folder and backup files on the old computer. The `.env` there only unlocks on that computer, but the database is readable to anyone who can open the drive.
- [ ] Optional, for extra safety: rotate the credentials that were copied. Change the Infocare password with Infocare, then enter it on the app's **Infocare Login** page (it is tested before saving). Rotate the Cloudflare sync token and the Mailchimp/Formstack keys and update `.env`. Re-run `npm run transfer:check`.

---

## Gathering credentials without a backup

If the old computer is lost and there is no backup (or the passphrase is lost), every setting has to be gathered again. A copied `.env` from the old computer won't help, because its passwords only unlock there. `npm run transfer:check` lists each missing setting with where to get it. `.env.example` holds the full list with comments. Copy it to `.env` and fill it in; the app encrypts the passwords the first time it starts:

| Setting(s) | Where to get it |
| --- | --- |
| `INFOCAREUSER`, `INFOCAREPASS`, `INFOCARE_BASE_URL` | Infocare (Digiweb) support / account admin. Once the app runs, the login can also be changed on the **Infocare Login** page |
| `DATABASE_URL` | Your choice; create the login and database in PostgreSQL |
| `META_*` | Meta Business Manager > System Users (token), Ads Manager (account ID) |
| `GOOGLE_ANALYTICS_PROPERTY_ID`, `OAuth.json` | Google Analytics Admin; Google Cloud console > Credentials. Then run `npm run google:oauth` |
| `CLOUDFLARE_SYNC_URL`, `CLOUDFLARE_SYNC_TOKEN` | Cloudflare dashboard > Workers > `postmark-webhook-events` > Settings (secret) |
| `POSTMARK_WEBHOOK_BASIC_AUTH` | Must match the webhook password Blacksheep set in Postmark (ask them) |
| `MAILCHIMP_API_KEY` | Mailchimp > Profile > Extras > API keys |
| `FORMSTACK_API_TOKEN` | Formstack > Account > API |

Without a backup the database data is gone too. Infocare, Google Analytics, Meta, Mailchimp, Formstack and Sector Insight data re-downloads on refresh. Postmark history is recoverable only from the Cloudflare Worker (from its saved position) or a Postmark CSV export. Tasks, notes, job descriptions, wiki articles and snippets are lost, so take regular backups.
