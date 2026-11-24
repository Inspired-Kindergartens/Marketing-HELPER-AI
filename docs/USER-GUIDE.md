# Marketing Helper — User Guide

Marketing Helper brings everything the marketing team needs into one place: how full each kindergarten is, who is on the waitlists, how our Facebook and Instagram ads are doing, website visits, emails, job adverts, and a set of handy tools.

It runs on this computer only. Open it from the desktop shortcut, or go to [the landing page](/). It starts by itself in the background when you log in to Windows, so you won't see a window for it.

**Beep Beep** is the app's built-in AI helper. Most pages have a Beep Beep chat on the right. Type a question, press **Enter** (or **Send**), and Beep Beep answers using what is on that page. **Clear** starts a fresh conversation.

---

## The landing page

The [landing page](/) is your starting point.

- **Big buttons** open the main areas: [Marketing](/app), [Tasks](/tasks), [Info Sheets](/one-pager), [Communications](/comms), [Job Descriptions](/jd) and [Budget](/budget).
- **Small buttons** underneath open the tools: this Read Me, Upscalar, SharePoint, the website admin, [Code Snippets](/snippets), [Links](/subscriptions), [Sector Insight](/sector), [General Chat](/chat) and [Things To Know](/wiki).
- **Reminders** show tasks that are overdue or due soon. Click one to open the task. If nothing is due, this section is hidden. In the last three days of a month, if nobody has added an expense to the Budget that month, a reminder says so: **Add expense** opens the Purchases list, and **Dismiss** hides it for that month. If you don't do either, it stays into the next month until an expense for that month is added. A recommended AI model update also appears here and stays until you choose **Update AI model** or **Dismiss**. If you dismiss it, you can still update later from the button at the bottom of the page.
- **Email alert banner.** An amber or red banner appears if our email tracking has gone quiet. Amber (3+ days with no email activity) is worth a look. Red (7+ days) means something is probably broken: click it to go to Webmail, and see *Email alerts* below.
- **News and weather** scroll along the bottom: severe weather warnings for our area and early-childhood news. The app checks for new items every 15 minutes on its own, so refreshing the page won't fetch news any sooner. The "Updated" time shows the last successful check. If that time is more than about 30 minutes old, something is wrong: tell whoever looks after the app. To make sure a topic is always picked up (for example our organisation's name or a centre), add it as a **search text** under the feed. To go back to a story that has scrolled past, click and drag the feed left or right; it carries on scrolling from where you let go. Hovering over the feed pauses it. Each story shows its headline first, then the publisher and time (long publisher names are cut short with …). Stories matching a search text go to the top. Local stories from the Bay of Plenty Times, SunLive, RNZ, Stuff and 1News are included, even when the headline doesn't mention early childhood but the article does.
- **Buttons at the very bottom:**
  - **Centre Staff** opens a small window with two buttons: **Upload** replaces the list that says which Senior Teacher looks after each kindergarten, and **Download** gives you a PDF of every kindergarten's head teacher, administrator and other staff. See [Centre Staff](#centre-staff).
  - **Restart server** restarts the app if something seems stuck.
  - **Update AI model** appears when a new AI model is recommended for Beep Beep. It tells you what it's installing and how big it is, downloads the model, and checks it works before switching. If the check fails, your current model stays and the button shows why. The model you were using is kept as a backup, and any older backup is deleted automatically to free up space.
  - **Rollback AI model** switches Beep Beep back to the backup model if the new one isn't working well. The app then stops recommending the model you rolled back from.
  - **[Infocare Login](/settings/infocare)** changes the username and password the app uses to read from Infocare. See *Changing the Infocare login* below.
  - **[Back up data](/backup)** saves one file on this computer holding everything the app knows: the whole database, every photo and file the app holds (task attachments, info sheet photos, AI pictures and the original info sheet PDFs), the contact list, and the passwords and keys the app uses to connect to Infocare, Google, Meta and Postmark. You choose a passphrase that locks the file. For safety it is not downloaded through the browser; the page tells you where it was saved. See *Moving the app to another computer* below.
  - **Look** chooses how the app looks: Default, Light or Dark. See *Appearance* below.

On any page, the **icons down the right-hand edge** take you back to the landing page or straight to another area. They run in the same order as the buttons on the landing page: the big buttons first, left to right and top to bottom, then the small ones.

---

## Marketing — [open](/app)

The main dashboard: how full each kindergarten is, and whether our advertising is in the right places.

**The time buttons** (`1W` … `12M`) choose how far ahead to look, for example for children leaving. `3M` (three months) is the default.

### Infocare Analytics

One row per kindergarten, from Infocare. The most urgent centres are at the top.

- **ENROL/MAX** — children enrolled / places the centre runs, then how full the centre is on an average day. The places are the centre's **Capacity** from **Enrolment Quality** (the busier of your am / pm places) when you have set them, otherwise its licence from Infocare. Change them with the pencil in Enrolment Quality and this table updates as soon as you press Save; EST, U2 / O2 and Urgency follow too.
- **EST** — estimated empty places on an average day.
- **U2 / O2** — under-2s and over-2s enrolled, against the places for each.
- **Waitlist** — *realistic* waitlist / total waitlist. Many families on a waitlist never enrol, so the first number estimates the ones likely to.
- **Age 5+ / Near 5 / Leaving** — children already five, turning five soon, or with a leaving date. These places will need filling.
- **Email** — email the centre about advertising or enrolments.

Click a row to see that centre's summary in the chat panel.

**The filter buttons** are in a row under the panel title: the reset button, the time buttons, the ↑ ↓ name sort, then the **SLT buttons**. *All SLT* lists every kindergarten. Press a name (for example *Marion*) to list only that Senior Teacher's kindergartens. A kindergarten shared by two SLT shows for both. The names come from the **Key Senior Teacher** column of the contact list (uploaded with [Centre Staff](#centre-staff) on the landing page); a kindergarten that isn't in that list only shows under *All SLT*.

The **print** button (top right of the panel) downloads the table as a PDF, for the window, order and SLT you have chosen, with a total row for all kindergartens (or for that SLT's kindergartens). It replaces the old Print console button.

**Urgency** (Critical, High, Moderate, Stable) is a score out of 100. It goes up when children are leaving faster than the realistic waitlist can replace them, when the roll has empty places, when the roll is lower than the same month last year, and when there is no realistic waitlist at all. Empty places and the yearly fall come from last month's % full roll in **Enrolment Quality**, so part-week children share a place and your operating capacity is used. Centres without roll data are judged on enrolled children against the licence. Critical is 70+, High 45–69, Moderate 20–44, Stable under 20. It is not a ranking, so every centre can be Stable in a good week.

### Enrolment Quality — [open](/app?panel=enrolment-quality)

How full each kindergarten has been, month by month, so you can spot a centre that was doing well and is now slipping. It replaces the printed "Roll Returns" sheet.

- **% full roll** — on an average open day, how many children were booked in the busier session (morning or afternoon), against the places the centre runs at. Children who come part of the week share a place: Kimmy (Tue, Wed, Fri) and Joe (Mon, Thu) together fill **one** place. A morning-only child and an afternoon-only child also share one. Over 100% is normal for a popular centre.
- **Trend** — a small line for the chosen period, with an arrow: green ↗ rising, red ↘ falling, grey → steady (within 3% either way). Each line is stretched to fit its own months, so a real rise or fall stands out. The dashed line is 100%. A gap means no figures for that month (for example, before the centre opened).
- **Start / Latest / Change** — the first and latest month in the period, and the difference between them (e.g. 90% → 82% is −8%). The current month is "to date". Percentages are green at 90% and above, grey from 80% to 89%, and red under 80%.
- **Booked am / pm** — the average number of children booked in the morning and the afternoon in the latest month, from Infocare.
- **Places am / pm** — the morning and afternoon places you have set for the centre, e.g. `30 / 20` (`-` if you haven't set any). Press the pencil to change them.
- **Capacity** — the places used for the %, with the licence in curly brackets, e.g. `30 {35}`. It is the busier of your am / pm places (30 / 20 gives 30), or the licence if you haven't set any. Waihi at 30 / 20 with 25 children booked in the morning shows 25 ÷ 30 = 83%.

**All kindergartens** is always the top row, shaded grey, whatever the sort. It adds every centre together: all children placed against all capacity, with the same trend, Start, Latest, Change, Am / pm and Capacity columns. Click it to see its months. It has no pencil; change a centre's capacity and the total follows. It is also first in the PDF, and Beep Beep uses it for questions about the organisation as a whole.

**Quieter days of the week.** % full roll is a monthly average, so a centre that is quieter on Mondays and Fridays shows a lower % without saying which days are quiet. Ask Beep Beep about weekday patterns or reduced-day staffing: it can explain how to read the roster evidence and why fewer staff on a day does not always mean the centre is fuller than reported.

**The period buttons** (`3M`, `6M`, `12M`, `2Y`, `3Y`, `5Y`) look back from this month. `12M` is the default.

**The sort buttons**: *Worst change* (the default) sorts by the Change column, the biggest fall at the top. *Worst latest* sorts by the Latest column, the lowest % at the top. *A-Z* and *Z-A* sort by name.

**The SLT buttons** work as in Infocare Analytics: *All SLT* lists every kindergarten, a name lists only that Senior Teacher's kindergartens. The top row then adds up just those kindergartens (for example *Marion's kindergartens*), and the PDF covers them only. The two panels are filtered separately.

A PDF downloaded with an SLT chosen (from either panel) names the SLT on its cover, at the top of every page and in the file name, for example *Enrolment-Quality-12M-Marion-2026-11-13.pdf*. Every report PDF's cover has **Marketing** on a line above its title.

**Click a centre** to see each month. Beep Beep's chat switches to that kindergarten too: its summary and Meta notes, and a fresh conversation about it. Press the **pencil** in its Places am / pm cell to open the editor and set its **am / pm places** (the editor only shows after you press the pencil, and **Cancel** closes it): how many places the centre actually runs in the morning and in the afternoon, which can be lower than its licence (for example, licensed for 45 but staffed for 40 in the morning and 30 in the afternoon). Capacity is the busier of the two, because % full roll counts each day's busier session. A centre's **first** figure has no From month: it covers the whole 5-year history (shown as "from the start"), so setting the right number once corrects the past too. After that, the editor has a **From month** box, filled in with this month; change it to an earlier or later month if the change happened (or will happen) then. A later figure counts from its From month onwards: if a centre goes from 40 to 44 places in March, months up to February keep 40 and March onwards use 44. Each month in the centre's month table shows the places used for it. Each save is kept in a list under the heading, with its From month, the date it was changed (recorded automatically) and your note (for example "4 teachers"). Saving again for the same From month replaces it in the calculation, but the earlier save stays in the list. **Nothing changes until you press Save.** Pressing × on an entry only strikes it through (press it again to keep it); new numbers in the boxes are not used yet either. **Save** applies everything together, removals and the new figure, and keeps the centre open and in view even if the table re-sorts. **Cancel** puts the boxes back and un-strikes every entry. Removing an entry puts the figures around it back. The boxes stay empty until you save a figure, and only you can change it: nothing from Infocare, Update from Infocare or Beep Beep ever changes it. The app suggests a figure from the staff roster: teachers working with children at 10am on a typical day, × 10 children each (× 15 for sessions of 4 hours or less), never more than the licence. Press **Use** to copy it into both boxes, then **Save**. The Am / pm column (children booked) comes from Infocare and is never changed.

**Under-2s.** OPEYS All Day, Maunganui All Day and Tai o Fenua are licensed for under-2s, inside their total (OPEYS: 60, of which up to 18 under-2). For these centres the editor also has an **Under-2** box: how many of the total are under-2 places you actually run (for example OPEYS 60, of which 10 under-2). % full roll still counts all children against the total. The under-2 figure is used for the staffing suggestion (under-2s need one teacher for every 5 children), and it is shown in the Capacity tooltip, the PDF (`U2 10 {18}`) and Beep Beep's figures.

The **print** button (top right of the panel) downloads what is on screen as a PDF, for the period and order you have chosen: a plain cover page (just the title, the period, the date it was made and the logo, so a copy left lying around shows no figures), a summary table, a chart of each centre's change, then a chart for every centre (six to a page). Capacity is shown as the busier of the am / pm places with the licence in curly brackets, e.g. `40 {45}`. The am / pm places are kept separately and never change anything in Infocare.

**Printing the PDFs.** The Enrolment Quality, Infocare Analytics and Waitlist Quality PDFs all start with the same plain cover page, and each file asks for A4 portrait, actual size, single-sided, 7 copies. Adobe Acrobat Reader fills these in for you; Chrome and Edge usually don't, so check them in the Print dialog. A PDF can't ask for stapling or page order, so in the printer's settings (**Printer Properties** or **More settings**) choose **Staple: top left** and make sure **Reverse order** is off.

The figures come from Infocare bookings. The app fetches them by itself once a month, at the start of the month, when the month just ended is complete. **Update from Infocare** (the download button at the top of the panel) fetches them now, including this month so far. The first fetch reads up to five years and takes about an hour; the table fills in while it runs.

Ask Beep Beep questions like "Which centres are slipping?" or "How has Brookfield's roll changed this year?". It reads these figures for questions about roll, enrolments, capacity or trends.

When you pick a centre, Beep Beep's opening summary on the dashboard includes one line from this panel, for example *Roll: 73% full in Nov-26 so far (low), of 42 licensed places; down 6% over 12M from 79%.* It uses the same figures and period as the panel.

### Waitlist Quality

Shows whether each waitlist is fresh or stale: how long families have been waiting, the oldest entry, and how many children on it are already too old for kindergarten. A big waitlist full of old entries is weaker than it looks.

The **print** button (top right of the panel) downloads the whole panel as a PDF, with every centre listed (the panel shows the top eight).

**Longest wait** (in the Waitlist Quality Hierarchy table) is how many days the longest-waiting single child at that centre has been on the waitlist.

**of which Aged 2** (in the DOB profile table) is how many of the Under 5 children are 2 years old. They're already counted in Under 5, so this column doesn't add to the Total. It shows `-` until the waitlist is next refreshed.

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

**Results are kept.** Each day's results for every campaign, ad set and ad are saved in the app, from October 2023 onwards. Changing or reusing a campaign in Meta afterwards doesn't remove them. The app fetches results when you open [META Ads](/app?panel=meta-ads), at most once a day. If it hasn't been opened for a while, it catches up on the days it missed, however long ago.

**Start a new ad set for each new advert period**, rather than changing the dates on an old one. Meta then keeps each period's dates and results separate too. If an ad set is reused, the app still treats each stretch of spending as a separate advert, as long as there was a break of more than two weeks.

**Advert reviews.** Two weeks after a kindergarten's advert ends, the app adds an **Advert review** note to that kindergarten, which you'll find in [Notes](/app?panel=notes). It looks in Infocare for the families who applied while the advert was running, using each child's application date. It counts how many of those children are now **enrolled** and how many are **on the waitlist**. It then compares the total with how many applications that kindergarten usually gets in the same number of days. For example:

> Meta advert that ran from 13 May to 11 Jun 2026 did well with 3 enrolments and 1 on the waitlist during that period, against a usual 2. ($221 spent, 813 clicks)

- **Did well** means a spike: at least half as many applications again as usual, and at least two more families.
- **Brought no spike** means about the usual number, or fewer.
- **Usual** comes from the six months before the advert, leaving out the days when other adverts for that kindergarten were running. If there aren't at least eight weeks without adverts to go on, the note gives the counts and says there's not enough history to tell.

Once a kindergarten has two or more reviewed adverts, Beep Beep's opening summary for it says whether it **responds well**, **does not respond well** or **has a mixed response** to Meta adverts, for example "1 of 4 adverts brought a spike". With only one review, it gives that advert's result and says it's too early to call a pattern. Beep Beep uses the reviews when you ask about adverts. Adverts for staff, surveys and home-based care are not reviewed. Past adverts, back to late 2023, have been reviewed, so history is there already. If newer results change an advert's dates or spend, its review is redone; a note you added yourself is kept.

Two things to know when reading older reviews: a family who joined the waitlist and later withdrew is no longer in Infocare, so it can't be counted; and families from older adverts have mostly enrolled by now, so those notes show few on the waitlist.

### Google Analytics

Website visits for the chosen months: people, visits, how engaged they were, and the most visited pages. It also matches each centre's ads to that centre's web page, so you can see whether ad clicks turn into visits.

### Notes and Beep Beep

Keep notes against recommendations. Ask Beep Beep things like *"Which centres need ads?"*, *"Why is Te Puke High?"* or *"What does Learning Limited mean?"*. Beep Beep also knows how every number on this page is worked out, plus Meta and Google Analytics terms. It shows its **Sources** under each answer.

The **refresh buttons** (circular arrows and download icons) fetch the latest data. Each panel shows when it was last updated.

---

## Tasks — [open](/tasks)

The team's to-do list.

- **Task Board** — every task with its status (To do, In progress, Completed). **Add** creates one, and it appears at the top of its column. Each column shows ten tasks at a time; **Previous** and **Next** under a column turn its pages.
- **Task Detail** — click a task to change its status with the **Status** buttons, or give it a due date, a checklist, notes, attached files, a person, a project or a centre. The timer tracks time spent. **Open in Outlook** starts an email about the task. Drag a checklist item by the dotted grip on its left to change its order.
- **Projects** — group tasks and see them on a timeline.
- **Members** — the people tasks can be given to.

While a task is open, Projects and Members are hidden to keep the page focused. Go back to [Tasks](/tasks) to see them again.
- **Beep Beep** — ask *"What's overdue?"* or *"How is the open-day project going?"*.

Overdue and upcoming tasks also show on the landing page.

---

## General Chat — [open](/chat)

A Beep Beep chat for anything: writing, planning, explaining, checking. Conversations are saved, so you can come back to them and sort them into groups. You can also attach a document (a PDF, a text file, or a CSV spreadsheet export) and ask about it.

**Member email lists.** Ask *"Give me the member parents email list for every kindergarten"* (here or in the [Marketing](/app) chat). Beep Beep reads Infocare and gives one list per kindergarten, ready to paste into an email's To field. It includes caregivers of children enrolled today who are ticked as an Association member in Infocare, each person once per kindergarten. Arataki, Avenues, Brookfield, Gwen Rogers, Karamuramu, Katikati, Maungaarangi and Maunganui All Day are left out. Members with no email in Infocare aren't listed, but the reply says how many there are. Use **Bcc** when emailing a whole list.

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
- **Formatting:** the toolbar above the article does headings, bold, italic, underline, strikethrough (to cross text out), bullet and numbered lists, indents and links. Select the text first, then press the button.
- **Paragraphs:** press **Enter** once to start a new paragraph; the gap is added for you. Pressing Enter again on an empty line does nothing, so the spacing stays even. For a new line without a gap, press **Shift+Enter**.
- **Links:** select some text, press the link button and paste a web address or a folder on this computer (for example `D:\Apps\...\Panui`). Clicking a folder link opens it in File Explorer. While editing, hold **Ctrl** and click a link to open it.
- **Archived** articles are kept but hidden, and Beep Beep stops using them.
- Beep Beep on this page answers from the articles and says which one it used. The Marketing, Communications and General Chat helpers read them too. Every article counts: for each question Beep Beep looks up the articles that match it, so there's nothing to pin. A new or edited article is picked up a few seconds after you save it.

---

## Budget — [open](/budget)

The marketing budget, one financial year at a time (1 July to 30 June). It replaces the yearly *Budget Calculator* spreadsheets; 2024-25, 2025-26 and 2026-27 were copied in from them.

- **Choose a year** in the box at the top of **Totals**. **New year** starts the next financial year and copies across every subscription that has not ended. The same happens by itself when a new financial year begins on 1 July. A subscription is left behind if it is marked ended, or its **Ended** date is before the new year starts.
- **Totals** (on the right) shows the budget, what has been spent so far, what is left, and where the year is heading:
  - **Actual spend** = subscriptions for the year + purchases so far.
  - **Predicted spend** = subscriptions + predicted purchases. A purchase category only carries on at the same monthly rate for the rest of the year if you tick **In predictions** on its card (see Purchases); every other category counts just what has been spent. Desire spends are **not** included.
  - **Predicted surplus / deficit** = budget minus predicted spend. It's marked **On track** while the gap is small enough to be within the prediction's own margin of error; beyond that it's a **Surplus** or a **Deficit**.
  - **How "On track" is decided (the threshold).** You don't set this and it isn't shown; the app works it out each time:
    - The only guessed part of the prediction is the purchases for the months still to come in the categories ticked **In predictions**. The app looks at how much those categories' monthly totals have swung so far this year and works out how far off that guess could reasonably be.
    - Steady spending gives a narrow margin; lumpy spending (one big purchase in a month) gives a wide one. Early in the year the margin is wide, and it narrows as the months fill in.
    - With fewer than three months of the year gone, it uses half of the guessed purchases instead, because there isn't enough to measure.
    - The margin is never less than 2% of the predicted spend (the old spreadsheet's figure) and never more than 10%. A finished year, or a year with nothing ticked, is always 2%.
    - Purchases with no date can't be placed in a month, so they don't count towards the swing.
  - **Budget** is the only thing you type in here. The pencil on the **Budget** tile opens a small window to change the budget. Next year's budget is never set for you (the report only says what next year is expected to cost).
  - **Additional budget** is extra budget given for one thing in one year, for example the $20,000 for Office Signage in 2026-27. Click that purchase category's card, press **Additional budget** above its list and type the amount (leave it blank to remove it). It is **part of** the year's budget, not on top of it, so leave the Budget figure as it is. The app then treats that category as a one-off: the report leaves its purchases out of next year (leave **In predictions** unticked for it, so they also aren't carried on at a monthly rate). The card shows the amount, and Totals gets an **Additional budget** row.
  - **Generate report** (top of Totals) writes the year's report from the figures: the budget and any additional budget, spend so far, subscription price increases and decreases, new and dropped subscriptions, the biggest purchase categories, desire spends and how likely they are, and what next year is expected to cost. It opens in a window where you can edit it; **Save** keeps your version, **Generate again** rewrites it from today's figures. Saving it empty goes back to an automatic report. The old **year notes** box is gone; the notes typed for 2024-25 and 2025-26 are now those years' reports.
  - Subscriptions are counted without GST (divided by 1.15), the same as the spreadsheet. Purchases and desire spends are counted as you enter them.
- **Purchases**: one card per **category** (Facebook, Kale Print, Office Signage …), three cards a row. Each card shows its running total, an **Add purchase** button and its last three purchases. **Add purchase** opens a small window with the card's name filled in as the supplier and the category, and today's date; all can be changed. Each card also has an **In predictions** tick box. It starts unticked: tick it for spending that keeps coming every month (Facebook ads, for example) and the app carries that category on at its monthly average for the rest of the year in **Predicted spend**. Leave it unticked for one-off or occasional buying, which then counts only what has been spent. The tick applies to that category in every year and saves as soon as you click it. With seven or more cards the purchase rows get shorter, so the panel takes less of the screen. **Click a card** to list all of its purchases, with their notes, on the right, in place of Totals; **Close** at the top right brings Totals back. Above that list, **Rename** changes the category's name (in every year, so Year Over Year stays one line) and **Delete** removes the category with all of its purchases in the year you're looking at. The Facebook category has neither, because its Meta rows are added for you. **New category** (top right of the panel) asks for a name and adds an empty card; the category is kept once you add its first purchase. The pencil opens the same window to edit a purchase; **Category** is a drop-down of the current categories, so pick another there to move it. Each purchase goes in the financial year of its date. **Facebook/Instagram ad spend is added for you** each month from the Meta results, so don't type it in; those rows can't be edited.
- **Subscriptions**: **Add subscription** (top right of the panel) opens a small window for a new one; the pencil on a row opens the same window to edit it. **Started** and **Ended** are the dates the subscription began and finished; leave either blank if you don't know it. The stop button ends a subscription: it asks how many payments were made this year and fills in today as the **Ended** date if there isn't one. The bin deletes it. The yearly cost is worked out from the amount and how often it's paid. **Inc** compares it with the same subscription last year. If a service changes its name, edit the name rather than adding a new one, so its history stays linked. Adding a name already used in another year links to that one too. Ended subscriptions stay in the same list, after the running ones, with their **Ended** date and no yearly cost; they don't count towards the totals.
- The **Purchases** and **Subscriptions** title rows show their totals: purchases so far this year, and the yearly cost of the active subscriptions (GST included, the same as the **Yearly total** row).
- **Desire Spends** (used to be called Future Spends): things you would like to buy this year if the money is there, laid out the same way as Purchases: one card per **category**, three a row. Each card shows the total still to buy, an **Add spend** button and its three newest spends (**TBC** and **Bought** are marked). **Click a card** to list all of its spends on the right, with supplier and quantity, plus **Rename** and **Delete** for the category (Delete removes only what is still to buy). **New category** (top right of the panel) adds an empty card. The pencil opens the same small window to edit a spend, and the bag icon marks it bought. They are a wish list: they are **not** counted in the budget, actual spend or predicted spend (Totals shows their total on its own row). Year Over Year says how likely it is that all of them can be bought. When you buy one, press **Bought**, check the date (today, or pick another with the calendar button) and confirm: it becomes a purchase (amount × quantity).
- **Dates** on this page are typed as YYYY-MM-DD or picked with the calendar button beside the box, the same as on Tasks.
- **Year Over Year**: whole-year figures only (no individual subscriptions or purchase categories). It always shows the two most recent finished years and the current year, whichever year is chosen in Totals.
  - **The table** has one column per year. The finished years show what happened; the current year's column is marked **predicted**, so every column is a full year and they can be compared fairly.
    - **Budget**: each year's budget, with the increase or decrease from the year before in dollars and %.
    - **Spend**: what was spent (finished years) or the predicted spend (current year), with the change from the year before.
    - **Surplus / deficit**: budget minus spend, and that as a % of the budget. A minus figure is a deficit.
    - **Year type**: your own call on each year, **Bullish** (a year to grow and spend) or **Bearish** (a year to hold back). Click the pencil in a year's column, choose one (or **Not set**) and **Save**. It changes no figures; it is there so the years are read in context, and it is included in the report, the PDF and Beep Beep's budget answers.
    - **Budget without one-offs** and **Spend without one-offs**: shown when a year was given **Additional budget**. They leave that one-off out, so the years compare like for like (2026-27's budget doubled, but without the $20,000 for Office Signage it rose by a third).
    - **Subscriptions share of budget**: how much of each year's budget was committed to subscriptions before the year started.
    - **Purchases to end of (month)**: purchases up to the same point in each year, the end of last month. A year shows **—** when its purchases have no dates; the two years copied from the spreadsheets don't, so this starts being useful next year, as long as purchases keep their dates.
    - **Desire Spends bought**: how much of each year's Desire Spends list was actually bought (marked **Bought**). The lists copied from the spreadsheets never recorded this, so the past years show $0.
  - **Marketing results** (the second table) sets the spend against what it is there to achieve. Its current-year column is the year **to date**.
    - **Children enrolled**: the average number of children on the roll across all kindergartens, from the same Infocare figures as Enrolment Quality (finished months only).
    - **Budget spend per child**: the year's spend (predicted, for the current year) divided by children enrolled.
    - **Meta ad spend**, **Meta landing page views** and **Meta leads**: what the Facebook/Instagram adverts cost and brought in. The current year's running totals show no change, because part of a year against a whole year would mislead.
    - **Cost per landing page view** and **Cost per lead**: Meta ad spend divided by each. These do show the change, so you can see whether more spending bought results more cheaply or more dearly.
    - Nothing here is typed in or changed: the roll and the Meta results are only read.
  - **The tiles** above the table track the current year: **Budget vs** last year, **Spent to date**, **Predicted spend**, and the **Predicted surplus** or **deficit** (the same figure and On track / Surplus / Deficit colour as Totals). **Usual surplus** is how the finished years ended on average, as a % of their budgets, to judge this year's prediction against.
  - **Desire Spends** is the total still to buy, and what the predicted surplus would have left (or be short by) after buying all of them.
  - **Desire Spend likelihood** is the chance that everything on the Desire Spends list can be bought this financial year. It compares the predicted surplus with the Desire Spends total, allowing for how far off the prediction could be (the same margin as "On track") and for half of anything still marked **TBC**, since its price isn't settled. 100% means the surplus covers them even if the prediction is off; 50% means it only just covers them; near 0% means it doesn't. Green is 75% or more, amber 40% or more, red below that. With nothing ticked **In predictions** there is no guess in the prediction, so it is simply 100% or 0%.
- **Print icon** downloads the year as a PDF named **Marketing Budget** and the year (for example *Marketing Budget 2026-27*). It includes the report: your saved one, or, if you haven't generated one, a report written from the figures at that moment.
- **Beep Beep** on the Marketing page and in General Chat can answer budget questions, for example *"How much have we spent on subscriptions this year?"* or *"Which subscriptions went up?"*

---

## Info Sheets — [open](/one-pager)

The one-page PDF flyer for each kindergarten, all made from one shared design (the 2023 info sheet: logo, teal name band, three photos, "Making the early years count", About us and the team photo on the left, contact details and questions on the right).

- **Kindergartens** lists every open kindergarten with its senior leader, its head teacher and administrator (head teacher on the first line, administrator under), how many of its four photos are in, and when it was last edited. The head teacher and administrator are the people with those jobs in Infocare's staff list, which the app fetches once a day; if Infocare has nobody in the job, the line is empty. The senior leader is the **Key Senior Teacher** column of the list uploaded with [Centre Staff](#centre-staff) on the landing page. Each kindergarten is a button: press it to work on that kindergarten. The one you have open is marked with an arrow. Each one starts with the words and photos from its existing info sheet. OPEYS has no team photo yet: the one on its old sheet was a stand-in. Otamarakau's old sheet had a photo of a child where the team photo goes; it is still there, and a task in [Tasks](/tasks) asks for a real team photo.
  - **In use** is the tick box at the end of each kindergarten's line. Every kindergarten starts ticked. Each time you tick or untick it, a box opens asking for the **Reason**, already filled in with *As directed by the kindergarten*; change the words if you like and press **Save**. The reason is kept as a note on that kindergarten (*Marked not in use: …* or *Marked in use: …*), which you can read under **Notes**. **Cancel** (or Esc) puts the tick back as it was. A kindergarten that is not ticked is not asked for a staff photo: no *Update the team photo* task is added for it, its line shows no team photo badge, and its preview shows no **Staff photo needed** badge. A task that was already open stays in [Tasks](/tasks) for you to tick off. Tick the kindergarten again and staff photos are asked for as before.
- **One design for everyone.** Every sheet uses the same template, in the newer style: the logo that has *Ngā Kōhungahunga Manawanui* under it, and the heavier lettering for the kindergarten's name, the tagline and the headings. The only exception is Tai o Fenua, which has its own logo beside ours at the top and its hibiscus in the teal half-circle at the foot of the page; everything else on its page is the template. The blue cloud that said *Extended hours available!* on the old Avenues sheet is no longer part of the design.
- **The preview** on the right is the real PDF. It updates each time you save or change a photo. The **print icon** above it downloads the PDF, for example *Avenues Kindergarten Info Sheet v3 Nov 2026*.
- **Text** holds the kindergarten's own words. Press **Save** to keep your changes and update the preview.
  - **Service type** says how the service runs: **Kindergarten (donations)** or **All Day (fees)**. It decides which shared wording the service uses for cost and enrolment. Maunganui and OPEYS are All Day.
  - **About us**: a blank line starts a new paragraph. Start lines with `-` to make a bullet list.
  - **Draft with AI** rewrites whatever is in the About us box as a finished About us. Paste the kindergarten's website text or type rough notes, then press it. Beep Beep only uses what you gave it and never adds facts of its own. Read the draft, change what you like, then **Save**. Nothing is saved until you do.
  - **Fill from what we know** puts the address, phone and email from the Ministry of Education directory (the same record [Sector Insight](/sector) uses) into the boxes. Check them, then **Save**.
  - **Hours** are always the service's own, because every service's hours differ; there is no shared wording for them. The session times were worked out from each kindergarten's bookings in Infocare (November 2026), with notes such as holiday programmes kept from its old sheet. Infocare is only read, never changed. The two All Day services and Karamuramu keep the hours from their sheets, because their bookings don't show set sessions. You can still edit any of them here. A section left empty is left off the page.
  - **Contact us** is the address, phone and email boxes. The website line under them is the same for everyone and is changed under **Shared Text**.
  - **Save** stays at the bottom of the panel as you scroll, and saves every box in it.
  - **How much does it cost?**, **Are the teachers trained?** and **How do I enrol my child?** use the shared wording for the service's type unless you type something here. The shared wording shows in grey in the empty box. **Use shared text** empties the box so the service goes back to the shared wording. Many kindergartens have their own donation wording from their existing sheet.
- **Photos** has four slots: three across the top of the page and the team photo. **Upload** (or **Replace**) lets you choose a JPG or PNG, then crop it, and **Use photo**. You can also drag a photo file from a folder or your desktop and drop it on a slot's card: the card gets an outline while the file is over it, and dropping it opens the same crop step. **Remove** empties the slot.
  - **Cropping.** The crop step shows the whole photo with a green box on it. What is inside the box is kept; the rest is dimmed and cut away. Drag a corner of the box to make it smaller or larger, and drag inside the box to move it. Under the photo is a tick box, **Fix crop to the PDF's photo shape**, which is on each time the crop step opens. While it is on, the box keeps the shape the PDF gives that photo (Photo 1, 2 and 3 and the team photo alike), so what you see in the box is what is on the page. Untick it to make the box any shape; ticking it again trims the box back to the PDF's shape. A top photo cropped to another shape is trimmed to fit its place on the page, from the middle; a team photo of another shape is shown whole.
  - **A tight crop is upscaled with AI.** If the part you kept has too few pixels to print sharply where it goes on the page (under 300 to the inch), the app offers to have the AI draw the same picture again at full size, with nothing in it changed. Because that sends the photo to OpenAI, it first asks **"Does this image contain real children?"** Answer **Yes** and nothing is sent; answer **No** and it is sent; **Cancel** keeps the cropped photo as it is. The photo dims under a turning icon until the larger picture arrives (a few minutes). The larger picture gets the **AI generated** tick, and **Revert** puts your cropped photo back. The team photo is never upscaled: it is of real staff. This needs the OpenAI key, like the other AI pictures.
  - **Revert** puts back the photo that was in the slot before the last change (an upload, **Generate with AI** or **Regenerate with AI**). The button only shows once a photo has been replaced. The two photos swap places, so pressing **Revert** again brings the newer one back. One earlier photo is kept per slot, and **Remove** clears it too.
  - **Download** saves the photo in the slot to your computer, named after the kindergarten and the slot, for example *Avenues Kindergarten Photo 1.jpg*.
  - **The words under the team photo:** open **Photos**, type them in **Photo caption** on the Team photo card (one line per row of people works well). There is no Save button: the words save themselves a moment after you stop typing, and the preview then shows them. Words you typed just before putting in a new photo are kept and saved when the photo goes in. They only show on the page when there is a team photo. The three photos across the top have no words under them in this design.
  - **Team photo due.** When a kindergarten's teaching team changes, the app adds a task called *Update the team photo: (kindergarten)* to [Tasks](/tasks), due in two weeks, saying what changed. The kindergarten shows **Team photo due** in the list here (it reads **Team photo due email sent** once you have sent it the **Staff photo** email; a kindergarten you emailed with no task open shows **Staff photo email sent**; both go back when a new team photo is put in), and its Team photo card gets a **Team photo due: open task** button. An info sheet with no team photo at all (never put in, removed, or its file lost) shows **Team photo due** too, with no task needed, until a team photo is put in. When you **Remove** a team photo, the app adds the *Update the team photo* task itself, already **In progress**, unless that kindergarten has one open. It counts as a change when:
    - a teacher or head teacher starts or leaves, by the dates in Infocare's staff list (relievers and non-teaching staff don't count); or
    - a full-time teacher job was advertised in [Job Descriptions](/jd) and its closing date was a month ago.

    Only changes after the current team photo went on the sheet count, and one open task per kindergarten is enough: more changes don't add another. When the new photo is on, tick the task off. The staff list is the one the app reads from Infocare once a day; Infocare is never changed.
  - **The photos from the old sheets** were checked once, on 17 November 2026: the names under each team photo against today's staff in Infocare. Where they differ, or there is no team photo, a task was added to [Tasks](/tasks) listing the names. A shortened name (Mike for Michael) can show as a difference when the person is the same. Six sheets have a photo but no names under it, so they could not be checked.
  - **Generate with AI** makes a picture from a description you type and puts it in the slot. Only your description is sent to OpenAI. AI pictures (generated or regenerated) are made at the largest size the image model offers, 3456 by 2400 pixels, so they print sharply. A picture that size can take a few minutes to arrive.
  - **Regenerate with AI** makes a new picture from the one in the slot, for example a photo of the empty playground with children added. The usual way: upload a real photo of the kindergarten with **no children in it**, then press **Regenerate with AI**.
    - It first asks **"Does this image contain real children?"** Answer **Yes** and it stops; nothing is sent. Answer **No** and it carries on. A photo with the **AI generated** tick is not asked.
    - Then type what you would like to see. If you leave the box empty, it uses the choice under **If left empty**. The default is **the same number of children, doing the same things**: three children in the old picture give three new children, each in the place and pose of the one they replace. If the old picture has no children, it adds two or three playing together. The other choices are two or three children playing together, one child, a busy group, or children with a teacher.
    - The children in the old picture are never kept: every child in the new picture is a new one. If what you type doesn't say how many children, it keeps the number in the old picture. If it doesn't say what they are doing, they keep the poses from the old picture.
    - The new children are a mix of New Zealand children in ordinary modern clothes, and the place itself is kept as it is in your photo.    - The new picture replaces the photo in the slot and gets the **AI generated** tick. You can press **Regenerate with AI** on it again to try another version, and it won't ask the question this time.
    - When you press **Regenerate with AI** the box closes straight away. The old photo dims under a turning icon until the new picture arrives, and that photo's buttons are off until then. You can press **Regenerate with AI** on the other photos in the meantime, so several can be made at once. Stay on the kindergarten's page until they arrive.
    - The team photo has no Regenerate with AI button: it is of real staff.
  - **AI generated** is a tick on each photo. The app turns it on by itself for a picture it generated or regenerated, and leaves it off for anything uploaded or dropped in. You can tick or untick it yourself, for example to tick a picture you made with AI somewhere else and then uploaded. A ticked photo is not asked "Does this image contain real children?" when you press **Regenerate with AI**, so only tick a picture that really is AI generated. Uploading a photo over a ticked one turns it off again.
  - **A picture with real children in it is never sent to OpenAI.** The question above is the check, so answer it carefully. Only a picture with the AI generated tick skips it, because the children in it aren't real.
- **Email kindergarten** (the envelope above the preview) writes to the kindergarten's email address, the one under **Text**, Contact us. It works like the **Email** button on the [Marketing](/app) page:
  1. Choose the email: **Approve changes** (asks them to check the info sheet and reply "approved"), **Staff photo** (asks for a current team photo with no children in it, and the names row by row), or **New** (an empty email).
  2. Change the subject and words if you like, then **Continue**. Both ready-made emails ask for a reply within three working days and greet the head teacher and administrator by first name.
  3. Your mail app opens with the email written. For **Approve changes** the PDF is downloaded at the same time: attach it to the email yourself, as a mail link can't carry a file.
  4. Back here it asks **Did you send the email?** Answer **Yes** and the email is kept as a note on that kindergarten, with its other notes on the [Marketing](/app) page. It appears under **Notes** straight away. A **Staff photo** email is kept as the short note "Email sent for staff photo update"; the other emails keep their subject and words.
- **Badges on the team photo**: the preview shows up to two badges in the top left corner of the team photo, each a black box with a green border and green words, like the app's own buttons. **Staff photo needed** shows while the task to get a new team photo is open, and whenever the sheet has no team photo (never put in, removed, or its file lost). **Email sent** shows once you have sent the **Staff photo** email and answered **Yes**, and goes away when a new team photo is put in. They are only in the preview: the PDF you download or attach never has them.
- **Notes** lists every note kept on the kindergarten, newest first, each with its date and what it is about (for example *Info sheet*, or an advert review). These are the same notes as on the [Marketing](/app) page, so a note written there shows here and a note written here shows there. Type in **Add note** and press **Save note** to add one. To change a note, click in it, change the words and click somewhere else: it saves by itself. Notes are never printed on the info sheet.
- **It always fits on one page.** When About us is long, the team photo is made smaller first, then the text a little smaller. If it still doesn't fit, an amber note above the preview says which column is too long and by how many lines.
- **Downloading**: the print button above the preview downloads the PDF as it is now, named with the kindergarten and the month, for example "Avenues Kindergarten Info Sheet Nov 2026.pdf". Saved versions were removed on 18 November 2026.
- **Shared Text** is the wording every service uses: the tagline, the website address, and the shared questions. Cost and enrolment each have two versions, one for kindergartens and one marked **(All Day)**. Changing it changes every service of that type that hasn't typed its own.

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
- **Opened** is roughly when each centre opened. Nobody publishes an official opening date, so the app works it out from the centre's Education Review Office (ERO) reports. Hover over a date to see what it's based on.
  - **A month or year** (e.g. *Aug 2018*): the ERO report says when it opened.
  - **c. 2022**: its first ERO review was in 2022. First reviews usually happen within a year or two of opening.
  - **2015 or earlier**: the oldest ERO report we can find is from 2015, so it was open by then. It may be much older.
  - **Recent**: ERO hasn't reviewed it yet, so it opened recently. This also shows for a centre that was re-licensed after a change of owner.
  - **Blank**: ERO doesn't say. This happens when ERO reviews a whole group rather than each centre, as it does for BestStart, Evolve's brands (Learning Adventures, Lollipops, Little Lights), Central Kids and our own kindergartens. It also happens with some reports written in te reo Māori.

  The monthly update checks ERO again, so dates fill in as new reports come out. The export has the same column.

---

## AI images

The app can make a picture from a description, which you either type or say into the microphone. The first place that uses it is **Generate with AI** on the [Info Sheets](/one-pager) photos, from a typed description.

- **It uses OpenAI, not Beep Beep.** Beep Beep can't draw or listen, so the description, and the recording if you speak, are sent to OpenAI over the internet. Nothing else in the app leaves this computer for an AI service.
- **Pictures of real children never go to OpenAI.** A photo is only sent when you press **Regenerate with AI** on an info sheet photo (or a tightly cropped one is offered an AI upscale) and you answer **No** to "Does this image contain real children?", or when the picture is marked **AI generated** (the app ticks this for a picture it generated, and you can tick it yourself).
- **It needs an OpenAI key.** Until the key is added to the app's settings file and the app is restarted, AI images stay switched off and everything else works as normal. OpenAI charges the account for each picture and each recording.
- **Speaking:** the first time, the browser asks for permission to use the microphone. The recording is turned into words and is not kept.
- **Pictures are kept** in the app's own folder with the description that made them, and are included in backups.

---

## Centre Staff

**Centre Staff** is a button at the bottom of the [landing page](/). It opens a small window with two buttons; **Close** shuts it.

- **Upload** (Senior Teacher list): choose the latest centre contact list, the Excel workbook from the [Kindergarten Contact List](https://ikindergartens.sharepoint.com/sites/InspiredKindergartenTeam/Lists/Kindergarten%20Contact%20List/AllItems.aspx) on the Staff Portal. The window tells you how many kindergartens were updated, or what was wrong with the file. The app reads two columns from it, **Kindergarten** and **Key Senior Teacher**, to know which Senior Teacher looks after each kindergarten: the SLT buttons, the Senior leader column on [Info Sheets](/one-pager) and the job description approval email use it. The app works without it; those just have no senior teacher.
- **Download** (Head Teachers, Administrators and staff): a PDF listing every kindergarten with its email address, its Senior Teacher, and everyone who works there today with their job: the head teacher first, then the administrator, the teachers, and any other staff. The names and jobs are exactly as Infocare's staff list has them. People who have left, or have not started yet, are not listed.

Everything else about who to contact comes from elsewhere, so it never needs uploading:

- **Head teacher and administrator** are the people with the jobs *Head Teacher* and *Administrator* in Infocare's staff list. The app fetches that list from Infocare once a day, so a change in Infocare shows here the next day. Infocare is only read, never changed.
- **Who an email greets**: the head teacher and the administrator. If Infocare has no administrator for the kindergarten, the email greets the head teacher alone. If it has neither, the email greets the kindergarten by name (for example "Kia ora Papamoa Kindergarten").
- **The email address** is the one on the kindergarten's [Info Sheet](/one-pager).

---

## When Beep Beep is working

Beep Beep's AI only loads when it's needed, so it isn't using the computer's memory the rest of the time. After a quiet spell, the first reply can take up to a minute, and the chat shows **Loading the AI model** while you wait. It unloads again after 15 minutes without use.

Besides answering your questions, it does a few jobs by itself:

- **[Things To Know](/wiki):** files each article you save and writes its tags and summary.
- **[Sector Insight](/sector):** reads competitor websites about once a month.
- **Help library:** checks each day for new or changed help pages, so it can find them when you ask a question.

The news and weather on the landing page don't use AI. They still update every 15 minutes.

Beep Beep's AI files are stored once, inside the app's own folder.

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

## How the app keeps passwords safe

- The passwords and keys the app uses (Infocare, Google, Meta, Postmark, Mailchimp, Formstack, OpenAI) are stored **encrypted**. They can only be unlocked on this computer, so a copy of the settings file taken elsewhere is useless.
- They are never shown on any page and never given to Beep Beep.
- Backups are locked with a passphrase you choose.
- The one thing the app can't do for you is encrypt the whole computer drive. Ask IT to turn on **BitLocker** so a lost or stolen computer doesn't expose the app's data.

## Moving the app to another computer

Everything the app has stored can be moved to a new computer, or kept safe in case this one fails.

1. On this computer, click **[Back up data](/backup)** at the bottom of the landing page. Choose a passphrase of at least 12 characters and type it twice. A file called something like `marketing-helper-backup-20261030-1104.mhbak` (about 60 MB) is saved in the app's `backups` folder, and the page shows exactly where.
2. **Save the passphrase in the organisation's password manager straight away.** Without it the backup can never be opened, and nobody can recover it. Locked like this, the file is safe to store on the work OneDrive or a USB stick. Still don't email it.
3. On the new computer, whoever looks after the app installs PostgreSQL, Node.js and the app from GitHub, then runs the restore script with the backup file and the passphrase (the technical README has the exact steps). It puts the database and files back exactly as they were, and locks the passwords to the new computer.
4. Beep Beep's AI model is not in the backup because it is large and can be downloaded again. The setup step fetches it.
5. The connections to Infocare, Google Analytics, Meta, Mailchimp, Formstack and the email tracking (Postmark/Cloudflare) all move with the backup. They keep working on the new computer without anyone needing to set them up again. Emails sent while the app is switched off during the move are caught up automatically afterwards.

The full step-by-step checklist for whoever does the move is the [Transfer Plan](https://github.com/Inspired-Kindergartens/Marketing-HELPER-AI/blob/main/docs/TRANSFER-PLAN.md). It includes a check (`npm run transfer:check`) that confirms every password and connection is in place and working on the new computer.

It's a good idea to make a backup now and then (say once a month) even if you're not moving.

## Tips

- **Check the "last updated" times.** Each panel shows when its data was last fetched. Use the refresh buttons when it looks old.
- **Pop-up boxes keep what you typed.** Selecting text in a pop-up box and letting go of the mouse outside it does not close the box. If you do close a box by clicking outside it or pressing Esc, what you typed is still there when you open it again. It is only cleared when you press **Cancel** (or **Close**), or once it has been saved or sent. This applies to the note box on [Marketing](/app), and the pop-up boxes on [Budget](/budget), [Info Sheets](/one-pager), [Things To Know](/wiki), [Code Snippets](/snippets) and [Links](/subscriptions). On Info Sheets the real children question is still asked every time.
- **Beep Beep can be slow** when the computer is busy (for example a game is running), because it runs on this computer.
- **Adding to Beep Beep's knowledge.** Beep Beep's help library is kept up to date automatically. To teach it more, save help pages or manuals (PDF, Word-saved-as-web-page, or text) into the `knowledge` folder of the app, under `meta`, `infocare`, `google-analytics` or `mailchimp`. They're picked up within a day, or when the app restarts.
