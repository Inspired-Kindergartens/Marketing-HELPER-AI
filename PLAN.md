# PLAN: Tasks & Projects

A new top-level section of Marketing Helper AI for tracking work: **Tasks** (time
tracking, progress status, checklists, due/overdue reminders) that can be grouped
and expanded into **Projects** (with assignable **Members**, task consolidation by
group, and a Gantt-style graphical view). Reminders for due/overdue tasks surface
on the landing page, and a new primary button opens the section.

This plan follows the existing architecture: Prisma models in `prisma/schema.prisma`,
persistence + view models in `src/storage/*`, page rendering in a dedicated
`src/ui/*-app-shell.ts` shell composed of `src/ui/<section>/*-panel.ts` panels via
`renderLayout`, Fastify routes in `src/server.ts`, and styles in `src/ui/app.css`.
The section mirrors how **Communications** (`/comms`) was added.

---

## Goals

1. **Tasks** with: title/description, **status** (progress state), **time tracking**
   (estimated + logged time, optional running timer), a **checklist** of subitems,
   a **due date**, and optional links to a centre and/or a project.
2. **Reminders** on the landing page for tasks that are **due soon** or **overdue**.
3. A new **primary button** on the landing page (`Tasks`) opening `/tasks`.
4. **Projects**: a task can be promoted into / attached to a project. Projects have
   **members** drawn from a user-maintained **Members** database, **consolidate
   tasks by group**, and render **graphically** (Gantt or comparable timeline).

---

## Data model (`prisma/schema.prisma`)

New models, following existing conventions (`Int @id @default(autoincrement())`,
`createdAt`/`updatedAt`, `@@index` on lookup/sort columns, optional `centreKey`
relation to `CentreReference` with `onDelete: SetNull`).

### `Member`
User-maintained directory of people who can be assigned to projects.
- `id`, `name`, `email String? @unique`, `role String?`, `active Boolean @default(true)`
- `createdAt`, `updatedAt`
- relations: `projectMembers ProjectMember[]`, `assignedTasks Task[]`
- index: `@@index([active, name])`

### `Project`
- `id`, `name`, `description String?`
- `status String @default("active")` (e.g. active / on_hold / completed / archived)
- `startDate DateTime?`, `targetDate DateTime?`
- `centreKey Int?` (optional link to a centre)
- `createdAt`, `updatedAt`
- relations: `centre CentreReference?`, `members ProjectMember[]`,
  `taskGroups TaskGroup[]`, `tasks Task[]`
- index: `@@index([status, targetDate])`, `@@index([centreKey])`

### `ProjectMember` (join: project ↔ member)
- `id`, `projectId Int`, `memberId Int`, `projectRole String?`, `createdAt`
- relations: `project`, `member` (both `onDelete: Cascade`)
- `@@unique([projectId, memberId])`, `@@index([memberId])`

### `TaskGroup` (consolidates tasks by group within a project)
- `id`, `projectId Int`, `name`, `position Int @default(0)`, `createdAt`, `updatedAt`
- relations: `project` (`onDelete: Cascade`), `tasks Task[]`
- `@@index([projectId, position])`

### `Task`
- `id`, `title`, `description String?`
- `status String @default("todo")` — progress states: `todo` / `in_progress` /
  `blocked` / `done` (validated by a shared constant set, see below)
- `dueDate DateTime?`
- **Time tracking**: `estimatedMinutes Int?`, `loggedMinutes Int @default(0)`,
  `timerStartedAt DateTime?` (non-null ⇒ a timer is currently running; on stop,
  elapsed is folded into `loggedMinutes` and this is cleared)
- `projectId Int?`, `taskGroupId Int?`, `centreKey Int?`, `assigneeId Int?`
- `position Int @default(0)` (ordering within group/board)
- `completedAt DateTime?`, `createdAt`, `updatedAt`
- relations: `project Project?` (`SetNull`), `group TaskGroup?` (`SetNull`),
  `centre CentreReference?` (`SetNull`), `assignee Member?` (`SetNull`),
  `checklistItems ChecklistItem[]`, `timeEntries TimeEntry[]`
- indexes: `@@index([status, dueDate])` (drives reminders),
  `@@index([projectId, position])`, `@@index([taskGroupId, position])`,
  `@@index([assigneeId])`, `@@index([centreKey])`, `@@index([dueDate])`

### `ChecklistItem`
- `id`, `taskId Int`, `label`, `done Boolean @default(false)`,
  `position Int @default(0)`, `createdAt`, `updatedAt`
- relation: `task` (`onDelete: Cascade`)
- `@@index([taskId, position])`

### `TimeEntry` (audit trail for logged time; `loggedMinutes` is the cached sum)
- `id`, `taskId Int`, `minutes Int`, `note String?`, `startedAt DateTime?`,
  `endedAt DateTime?`, `createdAt`
- relation: `task` (`onDelete: Cascade`)
- `@@index([taskId, createdAt(sort: Desc)])`

Add the back-relations (`tasks`, `projects`, `taskGroups`, `formstack`-style) to
`CentreReference`.

**Migration**: `prisma/migrations/<timestamp>_add_tasks_projects/` created via
`npm run prisma:migrate`, then `npm run prisma:generate`.

---

## Storage layer (`src/storage/`)

New modules, each Prisma-backed and exporting a typed view-model shape (matching the
`*DashboardData` pattern used by `postmark-store.ts` / `formstack-store.ts`):

- `task-store.ts` — CRUD for tasks; checklist add/toggle/remove; status change
  (sets/clears `completedAt`); **timer start/stop** (start sets `timerStartedAt`;
  stop creates a `TimeEntry`, increments `loggedMinutes`, clears `timerStartedAt`);
  manual time logging; `listTasks(filter)` for board/list views; and
  `getDueAndOverdueTasks(now, horizonDays)` returning the reminder feed
  (status ≠ done, ordered by `dueDate`, split into `overdue` vs `dueSoon`).
- `project-store.ts` — CRUD for projects; group CRUD/reorder; attach/detach a task
  to a project + group; project roll-up (tasks consolidated by `TaskGroup`, plus
  per-group/per-status counts and date range for the timeline).
- `member-store.ts` — CRUD for the members directory; add/remove project members.

Shared validation: a `TASK_STATUSES` constant + `resolveTaskStatus()` guard
(mirroring `resolveWindowKey` / `VALID_COMMS_PANEL_IDS`) so the UI and API agree on
the allowed status set. A `taskTimeMinutes(task)` helper returns
`loggedMinutes + (timerStartedAt ? now - timerStartedAt : 0)` so a running timer is
reflected without writing on every read.

---

## UI layer (`src/ui/`)

### Landing page (`src/ui/landing-page.ts`)
- Add a **primary button** `Tasks` → `/tasks` to the `tiles` array
  (`{ label: "Tasks", description: "Tasks, projects & reminders", href: "/tasks", primary: true }`).
- Add a **reminders strip** above/beside `landing__buttons`: a server-rendered
  `landing__reminders` section listing overdue (emphasised) and due-soon tasks, each
  linking to `/tasks?task=<id>`. Empty state hides the section. `renderLandingPage`
  becomes a function of the reminder feed: `renderLandingPage({ reminders })`, and
  the `/` route passes `getDueAndOverdueTasks(...)`.

### Tasks section shell (`src/ui/tasks-app-shell.ts`)
Mirror `comms-app-shell.ts`: a `PANEL_DEFINITIONS` list, a `VALID_TASKS_PANEL_IDS`
set, `renderTasksAppShell(options)` composing panels via `renderLayout`, and a
`buildTasksQueryString` helper. Panels under `src/ui/tasks/`:
- `task-board-panel.ts` — the task list/board grouped by **status** (todo /
  in_progress / blocked / done). Each card shows due/overdue badge, time
  (logged / estimated), checklist progress (`3/5`), assignee, and timer start/stop.
- `task-detail-panel.ts` — single task: description, status control, due date,
  checklist editor, time log + running timer, project/group/assignee/centre links.
- `projects-panel.ts` — project list and a selected project's **consolidated view**:
  tasks grouped by `TaskGroup`, member list (add from Members directory), and the
  **Gantt/timeline graph**.
- `members-panel.ts` — the Members directory (add/edit/deactivate).

### Gantt / graphical view
Render server-side as an inline SVG/CSS timeline (no new heavy client deps; keep the
existing vanilla approach). Each task is a horizontal bar positioned by
`startDate`/`dueDate` across the project's date range, grouped by `TaskGroup` rows,
coloured by status. If a task has no dates it falls into an "unscheduled" lane.
A Gantt is the default; a simple grouped bar/status breakdown is the fallback when
the project has no usable dates.

### Styles (`src/ui/app.css`)
Add `.landing-reminders*`, `.task-card*`, `.task-board*`, `.gantt*`,
`.project-*`, and `.member-*` classes, reusing existing tokens/spacing.

---

## Routes (`src/server.ts`)

Page routes (mirroring `/app` and `/comms`):
- `GET /` — extend to fetch and pass the reminder feed to `renderLandingPage`.
- `GET /tasks` — querystring `{ panel?, project?, task?, demo? }`; renders
  `renderTasksAppShell` with the relevant store data (and a demo path like the
  others when `demo=1`).

JSON/form API routes (follow the existing redirect-on-mutation convention used by
the Postmark/Mailchimp/Formstack handlers; return to `/tasks?...` with the right
panel/selection after a mutation):
- Tasks: `POST /api/tasks` (create), `POST /api/tasks/:id` (update),
  `POST /api/tasks/:id/status`, `POST /api/tasks/:id/timer/start`,
  `POST /api/tasks/:id/timer/stop`, `POST /api/tasks/:id/time` (manual log),
  `POST /api/tasks/:id/delete`.
- Checklist: `POST /api/tasks/:id/checklist` (add),
  `POST /api/tasks/:id/checklist/:itemId/toggle`,
  `POST /api/tasks/:id/checklist/:itemId/delete`.
- Projects: `POST /api/projects` (create/update), `POST /api/projects/:id/groups`,
  `POST /api/projects/:id/members` (add/remove from directory),
  `POST /api/tasks/:id/attach` (set project + group), `POST /api/projects/:id/delete`.
- Members: `POST /api/members` (create/update), `POST /api/members/:id/delete`.

Keep all routes behind the existing local-host safety in `src/server.ts`.

---

## Demo fixtures (`src/demo/`)

Add a tasks/projects fixture set (a couple of projects, groups, members, and tasks
with mixed due dates, statuses, checklists, and logged time) so `/tasks?demo=1` and
the landing-page reminders demonstrate the feature without real data — matching how
the Marketing/Comms demos work.

---

## Tests (`test/`)

- `task-store.test.ts` — status transitions set/clear `completedAt`; timer
  start→stop folds elapsed into `loggedMinutes` and writes a `TimeEntry`;
  `getDueAndOverdueTasks` correctly partitions overdue vs due-soon and excludes done.
- `tasks-app-shell.test.ts` — panel selection guard, reminder rendering, Gantt bar
  positioning for scheduled vs unscheduled tasks (mirrors `comms-app-shell.test.ts`).
- Landing page test: reminders section renders for due/overdue and hides when empty.

---

## Build order

1. Schema + migration + `prisma:generate`.
2. Stores (`member-store`, `task-store`, `project-store`) + shared status/time helpers.
3. Landing page button + reminders feed (smallest visible slice).
4. Tasks shell + task board + task detail (time tracking, checklists, status).
5. Projects (groups, members directory, attach tasks, consolidated view).
6. Gantt/graph rendering.
7. Demo fixtures + tests + CSS polish.
8. Update `README.md` (new section + dashboard panel docs) and `ROADMAP.md`.
