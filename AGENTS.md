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
- **SheetJS (`xlsx`)** for checklist, cable matrix, antenna checklist, DCPL checklist, and cable checklist Excel template download, export, and import

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
  `checklists`, `checklistLayouts`, `cableMatrices`, `antennaChecklists`, `dcplChecklists`,
  `cableChecklists`, `documentReferences`, `pendingSummaries`, plus supporting lookup/activity tables already in the app.
- The app starts empty. Do not add demo, dummy, placeholder, or hardcoded site records.
- Internal table/field names still use `reports`, `issues`, and `confirms`, but the user-facing
  domain language is telecom progress updates, blockers, and approvals.
- `initDb()` only removes the old untouched 8-site demo seed if it is detected in an
  existing browser IndexedDB. It should not delete user-created data.
- `checklists` stores one main checklist record per site. Each record owns an `items` array for
  sub checklist rows, including sub task status, comment, local item ID, and site-specific
  custom field values.
- `checklistLayouts` stores one site-level checklist layout record per site, including extra
  custom checklist columns and their input types (`text`, `number`, or `date`).
- `cableMatrices` stores one cable row per record, including cable number, cable label at origin
  end destination, `from`, `to`, test / label check statuses, drag order, and row-level change log.
- `antennaChecklists` stores one antenna asset row per record, including `level`, `description`,
  `make`, `model`, `serialNumber`, `assetTag`, `comment`, drag order, and row-level change log.
- `dcplChecklists` stores one DCPL asset row per record, including `level`, `description`, `make`,
  `model`, `label`, `serialNumber`, `dbValue`, `comment`, drag order, and row-level change log.
- `cableChecklists` stores one cable checklist row per record, including `level`, `cableLabel`,
  `cableId`, `hopCriteria`, `sweepTestReceived`, `remark`, `cableLength`, drag order, and
  row-level change log.
- `documentReferences` stores one titled document link per site for quick access from the site
  dashboard top bar.
- `pendingSummaries` stores one generated pending-summary board per site, including pasted source
  text, ordered main lists, ordered sub lists, pending items, per-item `todo` / `partial` /
  `done` status, optional partial-done comments, optional under-checking flags, and item action dates.

### Reactive Store (`src/composables/`)

- `useLiveQuery.js` wraps `Dexie.liveQuery` in Vue refs and auto-unsubscribes.
- `useSites.js` exposes sites with derived open-blocker and approval counts, plus site CRUD.
- `useReports.js`, `useIssues.js`, and `useConfirms.js` expose per-site CRUD plus reactive
  single-record helpers for edit views.
- `useChecklists.js` owns per-site main checklist CRUD, sub checklist CRUD, summary counts,
  custom field persistence, Excel import merge logic, drag reorder persistence, and
  duplicate-name protection.
- `useChecklistLayout.js` owns per-site checklist custom columns, including column type selection
  and merge behavior for imported checklist sheets.
- `useCableMatrix.js` owns per-site cable matrix CRUD, summary counts, Excel import merge logic,
  drag reorder persistence, and row-level change logging for statuses plus `from` / `to` edits.
- `useAntennaChecklist.js` owns per-site antenna checklist CRUD, summary counts, Excel import,
  drag reorder persistence, and row-level change logging.
- `useDcplChecklist.js` owns per-site DCPL checklist CRUD, summary counts, Excel import,
  drag reorder persistence, and row-level change logging.
- `useCableChecklist.js` owns per-site cable checklist CRUD, summary counts, Excel import,
  drag reorder persistence, cable-length totals, date handling for `sweepTestReceived`, and
  row-level change logging.
- `usePendingSummary.js` owns per-site pending summary generation from pasted text, nested
  main-list / sub-list / item persistence, manual add and delete actions for all three layers,
  summary counts, partial-done comment capture, under-checking flags, export-to-progress-update
  formatting, and per-item status action history.
- Blocker and approval codes are generated per site by incrementing the highest existing
  `I-###` or `C-###` code.
- `useAttachments.js` stores `File` / `Blob` objects directly in IndexedDB.
- `useTrackerStats.js` derives overview totals from live IndexedDB data.

### Checklist Excel (`src/lib/checklistSpreadsheet.js`)

- `downloadChecklistTemplate()` exports a local `.xlsx` template with baseline `Main task`,
  `Sub task`, `Status`, and `Comment` columns, plus any site-specific custom checklist columns.
- `downloadChecklistExport()` exports current checklist rows with repeated `Main task`, `Status`,
  `Comment`, all site-specific custom checklist columns, and `Log`.
- `parseChecklistSpreadsheet()` reads the first worksheet and groups repeated `Main task` rows
  under the same main checklist, while treating any non-baseline headers as imported custom
  checklist columns.
- Blank `Main task` cells inherit the most recent non-blank main task during import.

### Cable Matrix Excel (`src/lib/cableMatrixSpreadsheet.js`)

- `downloadCableMatrixTemplate()` exports a local `.xlsx` template with `Cable Number`,
  `Cable label at origin end destination`, `From`, `To`, `Test`, `Label origin`, and
  `Label end` columns.
- `downloadCableMatrixExport()` exports current cable matrix rows with those columns plus `Log`.
- `parseCableMatrixSpreadsheet()` reads the first worksheet and imports one cable row per sheet row.

### Antenna / DCPL / Cable Checklist Excel (`src/lib/*ChecklistSpreadsheet.js`)

- `antennaChecklistSpreadsheet.js` uses `LEVEL`, `Description`, `Make`, `Model`, `Serial Number`,
  `Asset Tag / Label`, and `Comment` columns.
- `dcplChecklistSpreadsheet.js` uses `LEVEL`, `Description`, `Make`, `Model`, `Label`,
  `Serial Number`, `dB`, and `Comment` columns. Imports may also accept the old sample heading
  `Post Installation Photo check` and map it into `Comment`.
- `cableChecklistSpreadsheet.js` uses `LEVEL`, `Cable label`, `Cable ID`, `HOP Criteria`,
  `Sweep test received`, `Remark`, and `Cable length Est. + 10 %` columns.
- Cable checklist import must preserve Excel date cells in `Sweep test received` as actual dates
  rather than raw Excel serial numbers.

### Site Import / Export (`src/lib/backup.js`)

- `exportSite()` must include all per-site records for progress updates, blockers, confirmations,
  site checklist, checklist custom columns, cable matrix, antenna checklist, DCPL checklist,
  cable checklist, pending summary, document references, email settings, and linked attachments.
- Site export payloads include a `summary` block so the site dashboard import flow can show the
  user exactly what the incoming file contains before replacing current site data.
- `importSite()` must restore all of those tables for the selected site, not just the original
  checklist and cable matrix data.

### Email (`src/lib/email.js`)

- `EmailDraftView.vue` builds the default draft subject as `[current site] Pending summary update - date`
  when no saved subject prefix exists, and `buildEmailBody()` composes the site progress email
  content from the update, linked blockers, linked approvals, and settings toggles.
- `generateEml()` builds an RFC-822 `multipart/mixed` message with `X-Unsent: 1` so Outlook
  opens the `.eml` as an editable, sendable draft.
- `downloadEml()` and `copyToClipboard()` are the output helpers.

### UI

- `src/views/` contains one view per route:
  - `OverviewView`
  - `SiteDashboardView`
  - `ChecklistView` (site checklist board)
  - `CableMatrixView` (site cable matrix board)
  - `AntennaChecklistView` (site antenna asset board)
  - `DcplChecklistView` (site DCPL asset board)
  - `CableChecklistView` (site cable checklist board)
  - `PendingSummaryView` (generated pending-summary board)
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
- The checklist, cable matrix, antenna checklist, DCPL checklist, cable checklist, and pending
  summary workflows live on their own routes and are linked from the site dashboard quick-action area.
- The site dashboard top bar includes `Document Reference`, which opens a modal for site-specific
  titled document links.

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
- **Site fields**: sites also store `hopReviewer`. Treat it as required on new-site flows, and
  render `NA` for older data when the field is missing.
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
  Repeated `Main task` values should append to the same main checklist. Any extra checklist
  columns beyond the baseline set should be treated as site-specific custom columns.
- **Checklist UX**: preserve the current sticky summary/add card area, collapsible main checklist
  cards, drag reordering, auto-scroll during drag, per-sub-check comment modal behavior, and the
  checklist table header row even when no sub-check data exists yet.
- **Checklist custom columns**: custom checklist columns are site-specific, stored separately from
  the checklist rows, support `text`, `number`, and `date` input types, and must round-trip
  through site export/import and checklist Excel export/import.
- **Checklist export/logs**: checklist export includes `Status`, `Comment`, any custom checklist
  columns, and `Log`. Sub checklist logs must continue recording change dates for done / not done /
  N/A changes.
- **Cable matrix columns**: cable matrix rows include `Cable Number`, `Cable label at origin end destination`,
  `From`, `To`, `Test`, `Label origin`, and `Label end`.
- **Cable matrix statuses**: `Test`, `Label origin`, and `Label end` use `No` / `OK` dropdowns
  and persist their state in IndexedDB.
- **Cable matrix logs**: row logs record change dates for `Test`, `Label origin`, `Label end`,
  `From`, and `To`.
- **Cable matrix UX**: preserve the sticky summary/add card area, row drag reorder, auto-scroll
  during drag, export/import controls, and row-level log modal.
- **Antenna checklist columns**: rows include `LEVEL`, `Description`, `Make`, `Model`,
  `Serial Number`, `Asset Tag / Label`, and `Comment`.
- **DCPL checklist columns**: rows include `LEVEL`, `Description`, `Make`, `Model`, `Label`,
  `Serial Number`, `dB`, and `Comment`.
- **Cable checklist columns**: rows include `LEVEL`, `Cable label`, `Cable ID`, `HOP Criteria`,
  `Sweep test received`, `Remark`, and `Cable length Est. + 10 %`.
- **Checklist-style asset boards**: antenna, DCPL, and cable checklist views should preserve the
  sticky summary/add card area, row drag reorder, auto-scroll during drag, import/export controls,
  and row-level log modal behavior.
- **Checklist row editing**: antenna, DCPL, and cable checklist rows use local draft state and
  save field changes on blur. Avoid partial-row update bugs that clear unrelated columns.
- **Cable checklist dates**: `Sweep test received` should use date values in import, storage,
  export, and manual entry UI. Manual entry should use a date picker.
- **Pending summary parsing**: pasted text treats top-level numbered lines such as `1.` as main
  lists, nested numbered lines such as `1.1` as sub lists, and bulleted lines as pending items.
- **Pending summary UX**: the top summary cards can be hidden / shown, the generate card can
  collapse, and the board must support manual add plus delete actions for main lists, sub lists,
  and pending items, an under-checking toggle, and a partial-done flow with required comment modal.
- **Pending summary counts**: partial-done items still count under not done in main / sub list
  summaries until they are fully marked done.
- **Pending summary export**: export to the progress-update form should keep numbered indentation,
  include partial-done comments inline, place not-done / partial items in the first block, and
  place done items in the bottom `Pending clear today:` block.
- **Pending summary history**: todo / partial / done changes must record action dates in the item
  history so the user can review when it changed, including saved partial-done comments.
- **Approvals**: saving an approval requires at least one attachment.
- **IDs**: `sites` use slug strings; `reports`, `issues`, `confirms`, and `attachments`
  auto-increment.
- **Checklist item IDs**: sub checklist items use generated local IDs inside the parent checklist
  record rather than their own Dexie table.
- **Attachments**: store field proof through `AttachmentDropzone` / `useAttachments`; persist
  attachment ID arrays as plain arrays, not Vue reactive proxies.
- **Site import/export**: site-level import and export from the site dashboard must always cover
  updates, blockers, confirmations, site checklist, checklist custom columns, cable matrix,
  antenna checklist, DCPL checklist, cable checklist, pending summary, document references,
  email settings, and linked attachments.
- **Document references**: document references are site-specific titled links managed from the
  site dashboard top bar modal and must be included in site delete and site import/export flows.
- **Scope gating**: site scope checks are case-insensitive. `macro` sites must not expose the
  DCPL checklist, and `tx` sites must not expose the antenna or DCPL checklist.

## Current Routes

- `/` - overview
- `/site/new` - add site
- `/site/:id` - site dashboard
- `/site/:id/settings` - edit/delete site
- `/site/:id/checklist` - site checklist
- `/site/:id/cable-matrix` - site cable matrix
- `/site/:id/antenna-checklist` - site antenna checklist
- `/site/:id/dcpl-checklist` - site DCPL checklist
- `/site/:id/cable-checklist` - site cable checklist
- `/site/:id/pending-summary` - generated pending summary board
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
2. Add a site with a location / area and `HOP reviewer`, then confirm it appears in the sidebar
   and overview.
3. Open the site dashboard; settings, new update, log blocker, and save approval actions open.
4. Site header text shows `HOP reviewer: ...`, and older sites without a saved reviewer show `NA`.
5. Site dashboard top bar `Document Reference` opens a modal, saves title + link entries, shows
   saved links on reload, and includes them in site import/export.
6. New progress update -> save -> appears in history -> reload -> still there.
7. New progress update -> save & generate email -> opens the update email draft.
8. Email draft defaults the subject to `[current site] Pending summary update - date`, toggles
   update the body, and copy / `.eml` download buttons work.
9. Log a blocker -> site open-blocker badge increments; clicking the blocker opens edit mode.
10. Approval save is blocked at 0 attachments and allowed at 1 or more attachments.
11. Site settings can update site fields and delete the site with the two-click confirm action.
12. Checklist view opens from the site dashboard and shows the sticky summary section correctly.
13. Main checklist cards load collapsed by default, can expand/collapse, and keep their summary
    details visible.
14. Main checklist drag reorder persists and auto-scrolls near the top/bottom edge while dragging.
15. Duplicate main checklist opens a styled modal, requires a unique name, and copies sub tasks.
16. Delete main checklist opens a styled modal before removing the main checklist and its sub tasks.
17. Sub checklist comment button opens a styled modal, and saved comments remain on reload.
18. Sub checklist log button opens a styled modal, and status-change dates remain on reload.
19. Checklist table headers show even with no sub-check data, and adding a custom checklist column
    asks for `Text`, `Number`, or `Date`.
20. Custom checklist column values save on the site, reload correctly, and travel with site
    JSON export/import.
21. Checklist Excel template downloads with baseline `Main task`, `Sub task`, `Status`, and
    `Comment` columns plus site custom columns, checklist export includes custom columns and `Log`,
    and checklist import groups repeated main task rows together.
22. Cable matrix opens from the site dashboard, shows the sticky summary section, and saves rows
    with `Cable Number`, `Cable label at origin end destination`, `From`, `To`, `Test`,
    `Label origin`, and `Label end`.
23. Cable matrix drag reorder persists and auto-scrolls near the top/bottom edge while dragging.
24. Cable matrix log button opens a styled modal, and change dates for status / `From` / `To`
    remain on reload.
25. Cable matrix Excel template downloads with `Cable Number`, `Cable label at origin end destination`,
    `From`, `To`, `Test`, `Label origin`, and `Label end`, and export includes `Log`.
26. Antenna checklist opens from the site dashboard, saves rows with `LEVEL`, `Description`,
    `Make`, `Model`, `Serial Number`, `Asset Tag / Label`, and `Comment`, and keeps row edits
    after reload.
27. DCPL checklist opens from the site dashboard, saves rows with `LEVEL`, `Description`, `Make`,
    `Model`, `Label`, `Serial Number`, `dB`, and `Comment`, and imports/exports those columns.
28. Cable checklist opens from the site dashboard, saves rows with `LEVEL`, `Cable label`,
    `Cable ID`, `HOP Criteria`, `Sweep test received`, `Remark`, and `Cable length Est. + 10 %`.
29. Cable checklist `Sweep test received` imports Excel dates correctly, manual entry uses a date
    picker, and saved dates remain correct on reload.
30. Cable checklist summary uses cable-length totals rather than serial-number totals.
31. `macro` scope hides the DCPL checklist entry points, and `tx` scope hides both antenna and
    DCPL checklist entry points, including direct-route access.
32. Pending summary opens from the site dashboard quick actions, pasted numbered/bulleted text
    generates layered main lists and sub lists, and the generated items still show after reload.
33. Pending summary top summary cards can hide/show, and the generate pending summary card can
    collapse and expand without losing the pasted text.
34. Pending summary supports manual add and delete actions for main lists, sub lists, and pending
    items, and those changes still show after reload.
35. Ticking and unticking a pending summary item updates the done / not-done counts and records
    dated history entries in the item history modal.
36. Pending summary supports `Partial done`, requires a comment before saving that state, keeps
    partial items under not-done counts, and shows the saved partial comment on reload.
37. Pending summary `Flag checking` / `Under checking` toggles the visual marker on and off
    without changing done / not-done counts, and that state survives reload.
38. Pending summary export to new progress update keeps numbered indentation, sends not-done plus
    partial-done items in the first block, sends done items in the bottom `Pending clear today:`
    block, and includes partial comments inline in the exported text.
39. Site dashboard export includes checklist custom columns, document references, pending summary
    data, and the newer antenna, DCPL, and cable checklist data, and site import confirmation
    clearly describes the incoming counts before replacing current site data.
40. No emoji glyphs, demo site records, hardcoded site stats, placeholder content, or
    website/software QA wording remains in user-facing copy.
