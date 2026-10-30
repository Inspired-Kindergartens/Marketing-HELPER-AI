# Marketing Helper — User Guide

Marketing Helper brings everything the marketing team needs into one place: how full each kindergarten is, who is on the waitlists, how our Facebook and Instagram ads are doing, website visits, emails, job adverts, and a set of handy tools.

It runs on this computer only. Open it from the desktop shortcut, or go to [the landing page](/).

**Beep Beep** is the app's built-in AI helper. Most pages have a Beep Beep chat on the right. Type a question, press **Enter** (or **Send**), and Beep Beep answers using what is on that page. **Clear** starts a fresh conversation.

---

## The landing page

The [landing page](/) is your starting point.

- **Big buttons** open the main areas: [Marketing](/app), [Tasks](/tasks), [General Chat](/chat), [Communications](/comms), [Job Descriptions](/jd) and [Things To Know](/wiki).
- **Small buttons** underneath open the tools: this Read Me, Upscalar, SharePoint, the website admin, [Code Snippets](/snippets), [Links](/subscriptions) and [Sector Insight](/sector).
- **Reminders** show tasks that are overdue or due soon. Click one to open the task. If nothing is due, this section is hidden.
- **Email alert banner.** An amber or red banner appears if our email tracking has gone quiet. Amber (3+ days with no email activity) is worth a look. Red (7+ days) means something is probably broken: click it to go to Webmail, and see *Email alerts* below.
- **News and weather** scroll along the bottom: severe weather warnings for our area and early-childhood news. The app checks for new items every 15 minutes on its own, so refreshing the page won't fetch news any sooner. The "Updated" time shows the last successful check. If that time is more than about 30 minutes old, something is wrong: tell whoever looks after the app. To make sure a topic is always picked up (for example our organisation's name or a centre), add it as a **search text** under the feed. To go back to a story that has scrolled past, click and drag the feed left or right; it carries on scrolling from where you let go. Hovering over the feed pauses it. Each story shows its headline first, then the publisher and time (long publisher names are cut short with …). Stories matching a search text go to the top. Local stories from the Bay of Plenty Times, SunLive, RNZ, Stuff and 1News are included, even when the headline doesn't mention early childhood but the article does.
- **Buttons at the very bottom:**
  - **[Upload Contacts](/contacts/upload)** replaces the centre contact list used by the dashboard's Email column.
  - **Restart server** restarts the app if something seems stuck.
  - **Update AI model** appears when a better AI model is available for Beep Beep. It downloads the new model and switches to it. The model you were using is kept as a backup, and any older backup is deleted automatically to free up space.
  - **Rollback AI model** switches Beep Beep back to the backup model if the new one isn't working well.
  - **[Infocare Login](/settings/infocare)** changes the username and password the app uses to read from Infocare. See *Changing the Infocare login* below.
  - **Back up data** saves one zip file on this computer holding everything the app knows: the whole database, uploaded task attachments, the contact list, and the passwords and keys the app uses to connect to Infocare, Google, Meta and Postmark. For safety it is not downloaded through the browser. A message tells you where it was saved. See *Moving the app to another computer* below.
  - **Look** chooses how the app looks: Default, Light or Dark. See *Appearance* below.

On any page, the **icons down the right-hand edge** take you back to the landing page or straight to another area.

---

## Marketing — [open](/app)

The main dashboard: how full each kindergarten is, and whether our advertising is in the right places.

**The time buttons** (`1W` … `12M`) choose how far ahead to look, for example for children leaving. `3M` (three months) is the default.

### Infocare Analytics

One row per kindergarten, from Infocare. The most urgent centres are at the top.

- **ENROL/MAX** — children enrolled / places the centre is licensed for, then how full the centre is on an average day.
- **EST** — estimated empty places on an average day.
- **U2 / O2** — under-2s and over-2s enrolled, against the places for each.
- **Waitlist** — *realistic* waitlist / total waitlist. Many families on a waitlist never enrol, so the first number estimates the ones likely to.
- **Age 5+ / Near 5 / Leaving** — children already five, turning five soon, or with a leaving date. These places will need filling.
- **Email** — email the centre about advertising or enrolments.

Click a row to see that centre's summary in the chat panel.

**Urgency** (Critical, High, Moderate, Stable) is a score out of 100. It goes up when children are leaving faster than the realistic waitlist can replace them, and when the centre already has empty places. Critical is 70+, High 45–69, Moderate 20–44, Stable under 20. It is not a ranking, so every centre can be Stable in a good week.

### Waitlist Quality

Shows whether each waitlist is fresh or stale: how long families have been waiting, the oldest entry, and how many children on it are already too old for kindergarten. A big waitlist full of old entries is weaker than it looks.

### META Ads

Our Facebook and Instagram ads, matched to each kindergarten.

- **Delivery** — *Active* is running normally. *Learning* means Meta is still working out who to show it to. *Learning Limited*, *Not Delivering* and *Rejected* need a look.
- **Results, Impressions, Amount spent, CPR** (cost per result), **Budget** and **Ends**.
- **Recommendations** combine the ads with Infocare:
  - *Needs ads* — empty places, little waitlist, and no ads running. Start a campaign.
  - *Prepare campaign* — places are about to open and no ads are running.
  - *Review spend* — the waitlist already covers the places, yet ads are still spending.
  - *Ads active, monitor* — ads are running where they are needed.

Put the kindergarten's name in the campaign name in Meta, so the app can match the ad to the centre.

### Google Analytics

Website visits for the chosen months: people, visits, how engaged they were, and the most visited pages. It also matches each centre's ads to that centre's web page, so you can see whether ad clicks turn into visits.

### Notes and Beep Beep

Keep notes against recommendations. Ask Beep Beep things like *"Which centres need ads?"*, *"Why is Te Puke High?"* or *"What does Learning Limited mean?"*. Beep Beep also knows how every number on this page is worked out, plus Meta and Google Analytics terms. It shows its **Sources** under each answer.

The **refresh buttons** (circular arrows and download icons) fetch the latest data. Each panel shows when it was last updated.

---

## Tasks — [open](/tasks)

The team's to-do list.

- **Task Board** — every task with its status (To do, In progress, Completed). **Add** creates one, and it appears at the top of its column.
- **Task Detail** — click a task to give it a due date, a checklist, notes, attached files, a person, a project or a centre. The timer tracks time spent. **Open in Outlook** starts an email about the task. Drag a checklist item by the dotted grip on its left to change its order.
- **Projects** — group tasks and see them on a timeline.
- **Members** — the people tasks can be given to.

While a task is open, Projects and Members are hidden to keep the page focused. Go back to [Tasks](/tasks) to see them again.
- **Beep Beep** — ask *"What's overdue?"* or *"How is the open-day project going?"*.

Overdue and upcoming tasks also show on the landing page.

---

## General Chat — [open](/chat)

A Beep Beep chat for anything: writing, planning, explaining, checking. Conversations are saved, so you can come back to them and sort them into groups. You can also attach a document (a PDF, a text file, or a CSV spreadsheet export) and ask about it.

---

## Communications — [open](/comms)

Everything about the emails and forms we send and receive.

- **Webmail** — emails sent to centres and office staff, and whether they were delivered, opened or clicked. Click a recipient or a centre to see only their emails. **Sort by** re-orders the Recent messages list. In Recent messages, **Sent** is the day the email was delivered and **Read** is the day it was first opened (often a day or two later); **Last Sent** in Email Count by Service is the send date, so it matches **Sent**. Dates only — Postmark's time of day isn't reliable enough to show.
- **Panui** — our Mailchimp newsletters and how they performed.
- **Online Forms** — Formstack form submissions.
- **Centre Activity** — emails and form submissions per centre together.
- **Beep Beep** — ask about opens, form submissions or campaigns. It also knows Mailchimp's whole help centre, so you can ask *"How do I add a first-name merge tag?"*.

### Email alerts

If the landing page shows a **red** email banner, our email tracking has stopped. Webmail's **Webhook Check** box shows when the last email activity arrived. Tell whoever looks after the app: the fix may need our web host (Blacksheep), because they manage the email service settings.

---

## Job Descriptions — [open](/jd)

Create the job description and website advert for a vacancy.

1. Choose the **Job Title** and the **Location** (kindergarten). The details fill in automatically.
2. Check and edit the fields in the **JD Editor**. Changing **Position Type** also swaps "Full Time" / "Part Time" in the intro paragraph.
3. **Download PDF** for the job description document.
4. In **Website Blurb**, press **Generate with AI** for the advert text, edit it, then **Copy to clipboard**. The fixed text at the bottom is added for you, including a **Please apply online here** link that opens the application form with the kindergarten and role already filled in (non-teaching roles get the general application form).
5. **Copy Website Page Name** gives the exact title to use on the website. Use it unchanged, because the web address is made from it.
6. **Generate Email** writes the email to the office with the link for the Education Gazette. Publish the website page first, then send the email.

The **Job Positions** button at the top of the Job Descriptions list (and at the top of a JD's website blurb page) opens the shared Job Positions folder in File Explorer.

**Settings** holds the shared details: each centre's intro text and Senior Teacher, qualifications for each role, and pay scales. Each group is a section you click to open; opening one closes the others. Saving keeps you where you are. To point the **Job Positions** button at a different folder, open **Folder shortcuts**, paste the folder address from Explorer's address bar and press **Save**. Leave it blank and save to go back to the default folder.

---

## Things To Know — [open](/wiki)

Our team wiki: how we do things, rules to remember, brand and process notes.

- **Add** a new article. When you save, Beep Beep files it under a category and writes its tags and summary for you.
- Click an article to read it; **Edit**, **Archive**, **Delete** or **Copy to clipboard** it from there.
- **Categories** lets you rename, re-order or remove categories.
- **Archived** articles are kept but hidden, and Beep Beep stops using them.
- Beep Beep on this page answers from the articles and says which one it used. The Marketing and General Chat helpers read them too.

---

## Code Snippets — [open](/snippets)

Pieces of code we reuse: tracking tags, embed codes, email HTML.

- **Click a snippet** to copy its code. The clipboard icon does the same.
- **Add** saves a new one; the pencil edits, and you can duplicate or delete.
- **Categories** groups them.
- **Beep Beep** writes or fixes code. Under any code it writes, **Save as snippet** keeps it.

---

## Links — [open](/subscriptions)

Useful links in one list, such as the services and accounts the team subscribes to. The links for putting the newsletter (pānui) together are under the **Panui Tools** category. (Panui Tools used to be its own page.)

- **Add** a link with a title, its web address and a category. Use the description for anything worth remembering, such as the plan or renewal date.
- **Click one** to open its website in a new tab. The row icons copy the link, edit, duplicate or delete it.
- **Categories** groups them. Each category folds up under its name: click a name to open it (opening one closes the others). The category of the link you used last (opened, copied, added or edited) is open when the page loads.

---

## Sector Insight — [open](/sector)

Every other early childhood service around our kindergartens (childcare centres, kindergartens, home-based services, playcentres, kōhanga reo and puna reo), with the promotions and incentives they advertise, and whether they provide meals or transport. It covers the Bay of Plenty plus the districts of our Waihi, Whangamatā and Thames-area centres.

- **Where the list comes from.** Centres, addresses, licensed places and the number of under-2 places come from the Ministry of Education's ECE directory. Promotions, meals and transport started from the BOP competitor spreadsheet, and are kept up to date by reading each competitor's website.
- **Updates itself monthly.** About once a month the app re-reads the Ministry directory and every competitor website. New offers are added and offers that are no longer on the website are marked as ended. **Update now** runs it straight away. It reads one website at a time, so a full update takes an hour or more. You can keep using the app while it runs.
- **The list shows competitors only.** Our own kindergartens, and centres that have dropped out of the Ministry directory (probably closed), are kept in the background: Beep Beep can still compare against them and they're in the export, but they aren't listed or counted.
- **Filters** below the totals narrow the list by town, type, operator, meals, transport or promotion. **Promotion starts on "Running one"**, so the page opens on the centres currently running an offer; set it to **Any** to see every centre. The search box matches names, suburbs and offer wording.
- **Click a centre** to see everything known about it. There you can correct the operator, website, meals and transport, add notes, and add or end promotions you hear about yourself. Promotions you add by hand are never ended by the monthly update.
- **Promotions** lists every offer currently in the market, how many centres run it, and when we first saw it.
- **Update History** shows what each update found or changed.
- **Export** downloads the list as a spreadsheet with the same columns as the original competitor sheet.
- **Ask Beep Beep** anything, for example *"Show me the list of centres that provide meals"*, *"Which BestStart centres are running a promotion?"*, *"How many home-based services are in Rotorua?"* or *"Which of those are in Pāpāmoa?"*. The app works out exactly which centres match, and lists them under the answer with links, so the list is always complete and correct. Beep Beep then sums it up. While a centre is open, questions like *"does it provide meals?"* are about that centre.
- **"Not known"** for meals or transport means the website doesn't say, not that the centre doesn't offer it.

---

## Upload Contacts — [open](/contacts/upload)

Upload the latest centre contact list (the Excel workbook). The **Email** buttons on the Marketing page use it to find each centre's address.

---

## Appearance

You can choose how the app looks. At the very bottom of [the landing page](/), next to **View on GitHub**, the **Look** menu offers:

- **Default**: the original look, dark with green headings and capital-letter labels.
- **Light**: white panels on a soft grey background, with rounded corners.
- **Dark**: a modern dark look with rounded corners and softer colours.

Your choice changes every page straight away, including any other tabs you have open, and is remembered next time you open the app. It is saved on this computer's browser, so someone else's computer keeps its own choice.

## Changing the Infocare login — [open](/settings/infocare)

When the Infocare password changes, update it here so the dashboard keeps working.

1. Click **Infocare Login** at the bottom of the [landing page](/).
2. Type the new username and password, then click **Check and save**.
3. The app first checks the details with Infocare. If Infocare accepts them, they are saved and used straight away, with no restart needed. If not, nothing is changed and you can try again.

For security, the page never shows the current username or password. It only says whether a login is set and when it was last changed. Beep Beep (the AI) has no access to these details, or to any of the app's other passwords and keys.

## Moving the app to another computer

Everything the app has stored can be moved to a new computer, or kept safe in case this one fails.

1. On this computer, click **Back up data** at the bottom of the [landing page](/). A file called something like `marketing-helper-backup-20261030-1104.zip` (about 60 MB) is saved in the app's `backups` folder, and a message shows exactly where.
2. **Keep the zip private.** It contains passwords and API keys. Store it on the work OneDrive or a USB stick, not in email or a shared folder.
3. On the new computer, whoever looks after the app installs PostgreSQL, Node.js and the app from GitHub, then runs the restore script with the zip (the technical README has the exact steps). It puts the database and files back exactly as they were.
4. Beep Beep's AI model is not in the backup because it is large and can be downloaded again. The setup step fetches it.
5. The connections to Infocare, Google Analytics, Meta, Mailchimp, Formstack and the email tracking (Postmark/Cloudflare) all move with the backup. They keep working on the new computer without anyone needing to set them up again. Emails sent while the app is switched off during the move are caught up automatically afterwards.

The full step-by-step checklist for whoever does the move is the [Transfer Plan](https://github.com/Inspired-Kindergartens/Marketing-HELPER-AI/blob/main/docs/TRANSFER-PLAN.md). It includes a check (`npm run transfer:check`) that confirms every password and connection is in place and working on the new computer.

It's a good idea to make a backup now and then (say once a month) even if you're not moving.

## Tips

- **Check the "last updated" times.** Each panel shows when its data was last fetched. Use the refresh buttons when it looks old.
- **Beep Beep can be slow** when the computer is busy (for example a game is running), because it runs on this computer.
- **Adding to Beep Beep's knowledge.** Beep Beep's help library is kept up to date automatically. To teach it more, save help pages or manuals (PDF, Word-saved-as-web-page, or text) into the `knowledge` folder of the app, under `meta`, `infocare`, `google-analytics` or `mailchimp`. They're picked up within a day, or when the app restarts.
