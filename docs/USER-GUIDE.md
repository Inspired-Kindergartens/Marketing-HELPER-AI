# Marketing Helper — User Guide

Marketing Helper brings everything the marketing team needs into one place: how full each kindergarten is, who is on the waitlists, how our Facebook and Instagram ads are doing, website visits, emails, job adverts, and a set of handy tools.

It runs on this computer only. Open it from the desktop shortcut, or go to [the landing page](/). It starts by itself in the background when you log in to Windows, so you won't see a window for it.

**Beep Beep** is the app's built-in AI helper. Most pages have a Beep Beep chat on the right. Type a question, press **Enter** (or **Send**), and Beep Beep answers using what is on that page. **Clear** starts a fresh conversation.

---

## The landing page

The [landing page](/) is your starting point.

- **Big buttons** open the main areas: [Marketing](/app), [Tasks](/tasks), [General Chat](/chat), [Communications](/comms), [Job Descriptions](/jd) and [Budget](/budget).
- **Small buttons** underneath open the tools: this Read Me, Upscalar, SharePoint, the website admin, [Code Snippets](/snippets), [Links](/subscriptions), [Sector Insight](/sector) and [Things To Know](/wiki).
- **Reminders** show tasks that are overdue or due soon. Click one to open the task. If nothing is due, this section is hidden. In the last three days of a month, if nobody has added an expense to the Budget that month, a reminder says so: **Add expense** opens the Purchases list, and **Dismiss** hides it for that month. If you don't do either, it stays into the next month until an expense for that month is added. A recommended AI model update also appears here and stays until you choose **Update AI model** or **Dismiss**. If you dismiss it, you can still update later from the button at the bottom of the page.
- **Email alert banner.** An amber or red banner appears if our email tracking has gone quiet. Amber (3+ days with no email activity) is worth a look. Red (7+ days) means something is probably broken: click it to go to Webmail, and see *Email alerts* below.
- **News and weather** scroll along the bottom: severe weather warnings for our area and early-childhood news. The app checks for new items every 15 minutes on its own, so refreshing the page won't fetch news any sooner. The "Updated" time shows the last successful check. If that time is more than about 30 minutes old, something is wrong: tell whoever looks after the app. To make sure a topic is always picked up (for example our organisation's name or a centre), add it as a **search text** under the feed. To go back to a story that has scrolled past, click and drag the feed left or right; it carries on scrolling from where you let go. Hovering over the feed pauses it. Each story shows its headline first, then the publisher and time (long publisher names are cut short with …). Stories matching a search text go to the top. Local stories from the Bay of Plenty Times, SunLive, RNZ, Stuff and 1News are included, even when the headline doesn't mention early childhood but the article does.
- **Buttons at the very bottom:**
  - **[Upload Contacts](/contacts/upload)** replaces the centre contact list used by the dashboard's Email column.
  - **Restart server** restarts the app if something seems stuck.
  - **Update AI model** appears when a new AI model is recommended for Beep Beep. It tells you what it's installing and how big it is, downloads the model, and checks it works before switching. If the check fails, your current model stays and the button shows why. The model you were using is kept as a backup, and any older backup is deleted automatically to free up space.
  - **Rollback AI model** switches Beep Beep back to the backup model if the new one isn't working well. The app then stops recommending the model you rolled back from.
  - **[Infocare Login](/settings/infocare)** changes the username and password the app uses to read from Infocare. See *Changing the Infocare login* below.
  - **[Back up data](/backup)** saves one file on this computer holding everything the app knows: the whole database, uploaded task attachments, the contact list, and the passwords and keys the app uses to connect to Infocare, Google, Meta and Postmark. You choose a passphrase that locks the file. For safety it is not downloaded through the browser; the page tells you where it was saved. See *Moving the app to another computer* below.
  - **Look** chooses how the app looks: Default, Light or Dark. See *Appearance* below.

On any page, the **icons down the right-hand edge** take you back to the landing page or straight to another area.

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

**The filter buttons** are in a row under the panel title: the reset button, the time buttons, the ↑ ↓ name sort, then the **SLT buttons**. *All SLT* lists every kindergarten. Press a name (for example *Marion*) to list only that Senior Teacher's kindergartens. A kindergarten shared by two SLT shows for both. The names come from the **Key Senior Teacher** column of the contact list ([Upload Contacts](/contacts/upload)); a kindergarten that isn't in that list only shows under *All SLT*.

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
  - **Predicted spend** = subscriptions + purchases so far, carried on at the same rate for the rest of the year + future spends.
  - **Predicted surplus / deficit** = budget minus predicted spend. It's marked **On track** while the gap is small enough to be within the prediction's own margin of error; beyond that it's a **Surplus** or a **Deficit**.
  - **How "On track" is decided (the threshold).** You don't set this and it isn't shown; the app works it out each time:
    - The only guessed part of the prediction is the purchases for the months still to come. The app looks at how much your monthly purchase totals have swung so far this year and works out how far off that guess could reasonably be.
    - Steady spending gives a narrow margin; lumpy spending (one big purchase in a month) gives a wide one. Early in the year the margin is wide, and it narrows as the months fill in.
    - With fewer than three months of the year gone, it uses half of the guessed purchases instead, because there isn't enough to measure.
    - Half of any future spends still marked **TBC** is added.
    - The margin is never less than 2% of the predicted spend (the old spreadsheet's figure) and never more than 10%. A finished year is always 2%.
    - Purchases with no date can't be placed in a month, so they don't count towards the swing.
  - **Budget** is the only thing you type in here. The pencil on the **Budget** tile opens a small window to change the budget. Next year's budget is never set for you (the report only says what next year is expected to cost).
  - **Additional budget** is extra budget given for one thing in one year, for example the $20,000 for Office Signage in 2026-27. Click that purchase category's card, press **Additional budget** above its list and type the amount (leave it blank to remove it). It is **part of** the year's budget, not on top of it, so leave the Budget figure as it is. The app then treats that category as a one-off: its purchases count as spent, but they are not carried on at a monthly rate in **Predicted spend**, and the report leaves them out of next year. The card shows the amount, and Totals gets an **Additional budget** row.
  - **Generate report** (top of Totals) writes the year's report from the figures: the budget and any additional budget, spend so far, subscription price increases and decreases, new and dropped subscriptions, the biggest purchase categories, future spends, and what next year is expected to cost. It opens in a window where you can edit it; **Save** keeps your version, **Generate again** rewrites it from today's figures. Saving it empty goes back to an automatic report. The old **year notes** box is gone; the notes typed for 2024-25 and 2025-26 are now those years' reports.
  - Subscriptions are counted without GST (divided by 1.15), the same as the spreadsheet. Purchases and future spends are counted as you enter them.
- **Purchases**: one card per **category** (Facebook, Kale Print, Office Signage …), three cards a row. Each card shows its running total, an **Add purchase** button and its last three purchases. **Add purchase** opens a small window with the card's name filled in as the supplier and the category, and today's date; all can be changed. With seven or more cards the purchase rows get shorter, so the panel takes less of the screen. **Click a card** to list all of its purchases, with their notes, on the right, in place of Totals; **Close** at the top right brings Totals back. Above that list, **Rename** changes the category's name (in every year, so Year Over Year stays one line) and **Delete** removes the category with all of its purchases in the year you're looking at. The Facebook category has neither, because its Meta rows are added for you. **New category** (top right of the panel) asks for a name and adds an empty card; the category is kept once you add its first purchase. The pencil opens the same window to edit a purchase; **Category** is a drop-down of the current categories, so pick another there to move it. Each purchase goes in the financial year of its date. **Facebook/Instagram ad spend is added for you** each month from the Meta results, so don't type it in; those rows can't be edited.
- **Subscriptions**: **Add subscription** (top right of the panel) opens a small window for a new one; the pencil on a row opens the same window to edit it. **Started** and **Ended** are the dates the subscription began and finished; leave either blank if you don't know it. The stop button ends a subscription: it asks how many payments were made this year and fills in today as the **Ended** date if there isn't one. The bin deletes it. The yearly cost is worked out from the amount and how often it's paid. **Inc** compares it with the same subscription last year. If a service changes its name, edit the name rather than adding a new one, so its history stays linked. Adding a name already used in another year links to that one too. Ended subscriptions stay in the same list, after the running ones, with their **Ended** date and no yearly cost; they don't count towards the totals.
- The **Purchases** and **Subscriptions** title rows show their totals: purchases so far this year, and the yearly cost of the active subscriptions (GST included, the same as the **Yearly total** row).
- **Future Spends**: things you plan to buy this year, laid out the same way as Purchases: one card per **category**, three a row. Each card shows the total still to buy, an **Add spend** button and its three newest spends (**TBC** and **Bought** are marked). **Click a card** to list all of its spends on the right, with supplier and quantity, plus **Rename** and **Delete** for the category (Delete removes only what is still to buy). **New category** (top right of the panel) adds an empty card. The pencil opens the same small window to edit a spend, and the bag icon marks it bought. They count towards the predicted spend. When you buy one, press **Bought**, check the date (today, or pick another with the calendar button) and confirm: it becomes a purchase (amount × quantity).
- **Dates** on this page are typed as YYYY-MM-DD or picked with the calendar button beside the box, the same as on Tasks.
- **Year Over Year**: each year's totals side by side, and every subscription and purchase group by year, with the change from the year before.
- **Print icon** downloads the year as a PDF named **Marketing Budget** and the year (for example *Marketing Budget 2026-27*). It includes the report: your saved one, or, if you haven't generated one, a report written from the figures at that moment.
- **Beep Beep** on the Marketing page and in General Chat can answer budget questions, for example *"How much have we spent on subscriptions this year?"* or *"Which subscriptions went up?"*

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

## Upload Contacts — [open](/contacts/upload)

Upload the latest centre contact list (the Excel workbook). The **Email** buttons on the Marketing page use it to find each centre's address.

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

- The passwords and keys the app uses (Infocare, Google, Meta, Postmark, Mailchimp, Formstack) are stored **encrypted**. They can only be unlocked on this computer, so a copy of the settings file taken elsewhere is useless.
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
- **Beep Beep can be slow** when the computer is busy (for example a game is running), because it runs on this computer.
- **Adding to Beep Beep's knowledge.** Beep Beep's help library is kept up to date automatically. To teach it more, save help pages or manuals (PDF, Word-saved-as-web-page, or text) into the `knowledge` folder of the app, under `meta`, `infocare`, `google-analytics` or `mailchimp`. They're picked up within a day, or when the app restarts.
