# Telecom Site Tracker - Agent Guide

A client-only telecom site progress tracker. A field coordinator tracks physical telecom
sites, logs daily progress updates, blockers, approvals / sign-offs, and field proof, then
generates an email draft from each update. There is no backend. All data lives in IndexedDB.

## Stack

- **Vue 3** (`<script setup>` SFCs) + **Vue Router**
- **Vite 8** build tool / dev server
- **Tailwind CSS v4** via `@tailwindcss/vite` (`@import "tailwindcss"`)
- **Dexie.js** for IndexedDB; no Pinia
- **Material Symbols** via `src/components/MaterialIcon.vue`
- **SheetJS (`xlsx`)** for checklist and cable matrix Excel template download, export, and import

## Commands

```bash
npm install      # install deps
npm run dev      # dev server (Vite) on http://localhost:5185
npm run build    # production build - use this to verify
npm run preview  # preview production build on http://localhost:5185
```

On Windows PowerShell, `npm` may be blocked by script policy. Use `npm.cmd run build`
or `npm.cmd run dev` when that happens.

## Architecture

### Data Layer (`src/db/`)

- `index.js` defines the Dexie schema and `initDb()`.
- Tables: `sites`, `reports`, `issues`, `confirms`, `attachments`, `emailSettings`,
  `checklists`, `cableMatrices`, plus supporting lookup/activity tables already in the app.
- The app starts empty. Do not add demo, dummy, placeholder, or hardcoded site records.
- Internal table/field names still use `reports`, `issues`, and `confirms`, but the user-facing
  domain language is telecom progress updates, blockers, and approvals.
- `initDb()` only removes the old untouched 8-site demo seed if it is detected in an
  existing browser IndexedDB. It should not delete user-created data.
- `checklists` stores one main checklist record per site. Each record owns an `items` array for
  sub checklist rows, including sub task status, comment, and local item ID.
- `cableMatrices` stores one cable row per record, including cable number, cable label at origin
  end destination, `from`, `to`, test / label check statuses, drag order, and row-level change log.

### Reactive Store (`src/composables/`)

- `useLiveQuery.js` wraps `Dexie.liveQuery` in Vue refs and auto-unsubscribes.
- `useSites.js` exposes sites with derived open-blocker and approval counts, plus site CRUD.
- `useReports.js`, `useIssues.js`, and `useConfirms.js` expose per-site CRUD plus reactive
  single-record helpers for edit views.
- `useChecklists.js` owns per-site main checklist CRUD, sub checklist CRUD, summary counts,
  Excel import merge logic, drag reorder persistence, and duplicate-name protection.
- `useCableMatrix.js` owns per-site cable matrix CRUD, summary counts, Excel import merge logic,
  drag reorder persistence, and row-level change logging for statuses plus `from` / `to` edits.
- Blocker and approval codes are generated per site by incrementing the highest existing
  `I-###` or `C-###` code.
- `useAttachments.js` stores `File` / `Blob` objects directly in IndexedDB.
- `useTrackerStats.js` derives overview totals from live IndexedDB data.

### Checklist Excel (`src/lib/checklistSpreadsheet.js`)

- `downloadChecklistTemplate()` exports a local `.xlsx` template with `Main task`, `Sub task`,
  `Status`, and `Comment` columns.
- `downloadChecklistExport()` exports current checklist rows with repeated `Main task`, `Status`,
  `Comment`, and `Log` columns.
- `parseChecklistSpreadsheet()` reads the first worksheet and groups repeated `Main task` rows
  under the same main checklist.
- Blank `Main task` cells inherit the most recent non-blank main task during import.

### Cable Matrix Excel (`src/lib/cableMatrixSpreadsheet.js`)

- `downloadCableMatrixTemplate()` exports a local `.xlsx` template with `Cable Number`,
  `Cable label at origin end destination`, `From`, `To`, `Test`, `Label origin`, and
  `Label end` columns.
- `downloadCableMatrixExport()` exports current cable matrix rows with those columns plus `Log`.
- `parseCableMatrixSpreadsheet()` reads the first worksheet and imports one cable row per sheet row.

### Email (`src/lib/email.js`)

- `buildEmailSubject()` and `buildEmailBody()` compose site progress email content from the
  update, linked blockers, linked approvals, and settings toggles.
- `generateEml()` builds an RFC-822 `multipart/mixed` message with `X-Unsent: 1` so Outlook
  opens the `.eml` as an editable, sendable draft.
- `downloadEml()` and `copyToClipboard()` are the output helpers.

### UI

- `src/views/` contains one view per route:
  - `OverviewView`
  - `SiteDashboardView`
  - `ChecklistView` (site checklist board)
  - `CableMatrixView` (site cable matrix board)
  - `NewReportView` (progress update form)
  - `EmailDraftView`
  - `IssueLogView` (blocker form)
  - `ConfirmLogView` (approval form)
  - `AddSiteView` (also used for site settings)
- `src/components/` contains shared UI:
  - `Sidebar`
  - `Topbar`
  - `StatCard`
  - `AttachmentDropzone`
  - `MaterialIcon`
- `src/router/index.js` keeps `/site/new` before `/site/:id`. Do not reorder those routes.
- The checklist and cable matrix workflows live on their own routes and are linked from the site dashboard.

## Conventions

- **No dummy data**: forms and the database start empty. Do not seed demo sites, demo updates,
  placeholder blockers, placeholder approvals, fake users, or hardcoded stats.
- **Telecom wording**: user-facing copy should describe physical telecom sites, site progress,
  field proof, blockers / risks, and approvals / sign-offs. Avoid website, coding, test, QA,
  staging, or software-release language in UI copy.
- **Reactive reads**: components should read through `use*` composables backed by
  `useLiveQuery`. Avoid direct `db.*` reads in components.
- **Async single records**: use `useSiteById()`, `useReportById()`, `useIssueById()`, and
  `useConfirmById()` for edit/detail views. Do not call async `get*ById()` inside `computed`.
- **Site fields**: internal `url` stores the user-facing `Location / area` value. Do not label
  it as a website URL.
- **Styling**: keep the hand-drawn wireframe look. Design tokens are CSS custom properties in
  `src/assets/main.css`; reusable primitives include `.box`, `.chip`, `.btn`, `.field`,
  `.label`, and `.squiggle`.
- **Icons**: do not use emoji glyphs in app UI or generated email. Use `MaterialIcon.vue`
  with Material Symbols names instead.
- **Forms**: form state starts empty. UI examples belong in labels or helper text, not dummy
  `ref()` values.
- **Checklist names**: main checklist titles must be unique per site. Creation, rename, import,
  and duplicate flows should reject duplicates rather than silently merging unless the import flow
  is explicitly matching an existing main checklist by name.
- **Checklist modals**: use styled in-app modals for duplicate, delete, and comment flows.
  Do not use raw browser `prompt()` or `confirm()` for checklist interactions.
- **Checklist import**: keep the Excel contract simple: `Main task` and `Sub task` columns.
  Repeated `Main task` values should append to the same main checklist.
- **Checklist UX**: preserve the current sticky summary/add card area, collapsible main checklist
  cards, drag reordering, auto-scroll during drag, and per-sub-check comment modal behavior.
- **Checklist export/logs**: checklist export includes `Status`, `Comment`, and `Log`. Sub checklist
  logs must continue recording change dates for done / not done / N/A changes.
- **Cable matrix columns**: cable matrix rows include `Cable Number`, `Cable label at origin end destination`,
  `From`, `To`, `Test`, `Label origin`, and `Label end`.
- **Cable matrix statuses**: `Test`, `Label origin`, and `Label end` use `No` / `OK` dropdowns
  and persist their state in IndexedDB.
- **Cable matrix logs**: row logs record change dates for `Test`, `Label origin`, `Label end`,
  `From`, and `To`.
- **Cable matrix UX**: preserve the sticky summary/add card area, row drag reorder, auto-scroll
  during drag, export/import controls, and row-level log modal.
- **Approvals**: saving an approval requires at least one attachment.
- **IDs**: `sites` use slug strings; `reports`, `issues`, `confirms`, and `attachments`
  auto-increment.
- **Checklist item IDs**: sub checklist items use generated local IDs inside the parent checklist
  record rather than their own Dexie table.
- **Attachments**: store field proof through `AttachmentDropzone` / `useAttachments`; persist
  attachment ID arrays as plain arrays, not Vue reactive proxies.

## Current Routes

- `/` - overview
- `/site/new` - add site
- `/site/:id` - site dashboard
- `/site/:id/settings` - edit/delete site
- `/site/:id/checklist` - site checklist
- `/site/:id/cable-matrix` - site cable matrix
- `/site/:id/report/new` - new progress update
- `/site/:id/report/:reportId/edit` - edit progress update
- `/site/:id/report/:reportId/email` - email draft
- `/site/:id/issue/new` - new blocker
- `/site/:id/issue/:issueId/edit` - edit blocker
- `/site/:id/confirm/new` - new approval
- `/site/:id/confirm/:confirmId/edit` - edit approval

## Verification Checklist

After changes, run `npm.cmd run build` on Windows or `npm run build` elsewhere.

Then check the app in the browser:

1. Fresh/clean IndexedDB overview shows 0 telecom sites and an empty-state add-site action.
2. Add a site with a location / area, then confirm it appears in the sidebar and overview.
3. Open the site dashboard; settings, new update, log blocker, and save approval actions open.
4. New progress update -> save -> appears in history -> reload -> still there.
5. New progress update -> save & generate email -> opens the update email draft.
6. Email draft toggles update the body; copy and `.eml` download buttons work.
7. Log a blocker -> site open-blocker badge increments; clicking the blocker opens edit mode.
8. Approval save is blocked at 0 attachments and allowed at 1 or more attachments.
9. Site settings can update site fields and delete the site with the two-click confirm action.
10. Checklist view opens from the site dashboard and shows the sticky summary section correctly.
11. Main checklist cards load collapsed by default, can expand/collapse, and keep their summary
    details visible.
12. Main checklist drag reorder persists and auto-scrolls near the top/bottom edge while dragging.
13. Duplicate main checklist opens a styled modal, requires a unique name, and copies sub tasks.
14. Delete main checklist opens a styled modal before removing the main checklist and its sub tasks.
15. Sub checklist comment button opens a styled modal, and saved comments remain on reload.
16. Sub checklist log button opens a styled modal, and status-change dates remain on reload.
17. Checklist Excel template downloads with `Main task`, `Sub task`, `Status`, and `Comment`
    columns, checklist export includes `Log`, and checklist import groups repeated main task rows
    together.
18. Cable matrix opens from the site dashboard, shows the sticky summary section, and saves rows
    with `Cable Number`, `Cable label at origin end destination`, `From`, `To`, `Test`,
    `Label origin`, and `Label end`.
19. Cable matrix drag reorder persists and auto-scrolls near the top/bottom edge while dragging.
20. Cable matrix log button opens a styled modal, and change dates for status / `From` / `To`
    remain on reload.
21. Cable matrix Excel template downloads with `Cable Number`, `Cable label at origin end destination`,
    `From`, `To`, `Test`, `Label origin`, and `Label end`, and export includes `Log`.
22. No emoji glyphs, demo site records, hardcoded site stats, placeholder content, or
    website/software QA wording remains in user-facing copy.
