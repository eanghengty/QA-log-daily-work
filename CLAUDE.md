# Telecom Site Tracker — CLAUDE.md

## What this app does
Client-side Vue 3 app for field coordinators to track telecom site progress. No backend — all data lives in the browser's IndexedDB via Dexie.js. Features: site management, daily progress updates (reports), blocker/risk logging (issues), confirmation sign-offs (confirms), RFC-822 `.eml` email generation, CSV export, full JSON backup/restore.

## Tech stack
- **Vue 3** (`<script setup>` SFCs) + **Vue Router 5**
- **Dexie.js v4** — IndexedDB wrapper with live reactive queries
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **Vite 8** build tool
- **js-file-download** for CSV export

## Dev commands
```
npm run dev      # Start dev server (default port 5185)
npm run build    # Production build
npm run preview  # Preview production build
```

## Project structure
```
src/
  db/index.js              # Dexie schema (v3) + initDb() + legacy demo cleanup
  composables/
    useLiveQuery.js         # Core: wraps Dexie.liveQuery() in Vue refs
    useSites.js             # Site CRUD + reactive queries + cascading delete
    useReports.js           # Progress update CRUD
    useIssues.js            # Blocker CRUD, auto-generates I-### codes
    useConfirms.js          # Confirmation CRUD, auto-generates C-### codes
    useAttachments.js       # Blob storage in IndexedDB
    useEmailSettings.js     # Per-site email To/CC/subject prefix CRUD
    useTrackerStats.js      # Global dashboard aggregates
  lib/
    email.js                # RFC-822 .eml generation; buildEmailBody() returns structured HTML only (no hardcoded greeting/closing)
    backup.js               # exportBackup() dumps all tables as JSON; importBackup() restores
  views/
    OverviewView.vue        # Dashboard: all sites, stats, CSV export, backup/restore
    SiteDashboardView.vue   # Per-site detail: blockers, confirmations, history (with delete per row)
    AddSiteView.vue         # Create/edit site form
    NewReportView.vue       # Progress update form
    IssueLogView.vue        # Blocker form (isSaving + try/catch/finally)
    ConfirmLogView.vue      # Confirmation form (isSaving + try/catch/finally)
    EmailDraftView.vue      # Email composer: editable subject/to/cc/body, Cambodia date
    EmailSettingsView.vue   # Per-site email defaults (to, cc, subject prefix, copy-from-site)
  components/
    Sidebar.vue             # Fixed nav sidebar (hosts AddSiteModal)
    Topbar.vue              # View header with action slots
    StatCard.vue            # Stat display card
    AttachmentDropzone.vue  # Drag-drop file input with upload spinner
    AttachmentViewer.vue    # Modal viewer: images inline, files downloadable
    AddSiteModal.vue        # Modal for creating a new site (isSaving + try/catch/finally + duplicate ID error)
    MaterialIcon.vue        # Material Symbols icon wrapper
  assets/main.css           # CSS custom properties + design system classes; font: Tahoma, 'Segoe UI'
  router/index.js           # 12 routes
```

## Database schema (version 3)
```
sites:         id (string slug, primary key)
reports:       ++id, siteId, date
issues:        ++id, siteId, status
confirms:      ++id, siteId
attachments:   ++id
emailSettings: siteId (primary key)  — stores { siteId, to, cc, defaultSubject }
```
`defaultSubject` is always stored as a **date-free prefix** (e.g. `[SITE-01] Progress update`). The Cambodia date is appended fresh on load.

## Site data model
```js
{
  id: String,        // slug, immutable after creation
  name: String,      // required
  scope: String,     // optional — e.g. "Full build / Upgrade / Audit"
  comment: String,   // optional — free-form site notes
  code: String,      // legacy optional short code (no longer in create form; still used for avatar fallback display)
  url: String,       // location / area (field label, not a real URL)
  createdAt: ISO string
}
```

## Key patterns
- **No state management library** — composables + Dexie liveQuery only
- **Slug-based site IDs** — URL-friendly, human-readable routes (e.g. `/site/tower-01`)
- **Auto-incrementing codes** — Issues get `I-###` (starts I-200), confirms get `C-###` (starts C-100), per site
- **Cascading deletes** — `deleteSite()` wipes all related reports/issues/confirms/attachments/emailSettings
- **Confirmations require ≥1 attachment** — enforced in `ConfirmLogView.save()`
- **Email generation** — `X-Unsent: 1` header makes `.eml` open as editable draft in Outlook
- **Cambodia timezone** — all date displays use `timeZone: 'Asia/Phnom_Penh'`
- **Domain language** — "blockers", "confirmations", "progress updates" (not QA/software terms; "approvals" renamed to "confirmations" throughout)
- **Legacy demo cleanup** — `initDb()` detects and clears the old 8-site untouched demo seed without touching user data
- **Add site via modal** — "Add site" buttons in OverviewView and Sidebar open `AddSiteModal.vue` instead of navigating to a full page; `/site/new` route still exists for the settings edit flow
- **No Short code on create** — `code` field removed from the add/edit form; existing values preserved in DB and still used as avatar fallback in OverviewView
- **Forced remount on route change** — `<RouterView :key="$route.fullPath" />` in `App.vue` ensures all composables reinitialise with the correct `siteId` when switching sites
- **Safe async saves** — `AddSiteModal`, `IssueLogView`, `ConfirmLogView` all use `isSaving` ref + try/catch/finally; duplicate site ID shows inline error, other DB errors show "Failed to save" message
- **`.btn-spinner`** — global CSS class in `main.css` for in-button loading spinners (white border-top animation); used by primary save buttons while `isSaving` is true

## Email draft flow (EmailDraftView.vue)
- Subject, To, CC are all editable inputs pre-populated from `emailSettings`
- Subject format: `{prefix} - {today Cambodia date}` — date always appended fresh, never stored
- Body generated by `buildEmailBody()` and rendered in a `contenteditable` div — user can freely edit; `bodyUserEdited` flag prevents re-generation overwriting edits
- Reset button regenerates body from report data
- "Save as default" persists To/CC and subject prefix (date stripped) back to `emailSettings`
- Download generates RFC-822 `.eml` with optional base64 attachments

## Email settings (EmailSettingsView.vue)
- Route: `/site/:id/email-settings`
- Fields: To, CC, default subject prefix
- "Copy from site" dropdown: loads another site's saved settings into the form without auto-saving; user reviews then clicks Save

## Backup / restore (OverviewView.vue + src/lib/backup.js)
- "Backup all data" exports all tables (including attachments as base64) as a dated JSON file
- "Restore from backup" prompts confirmation, clears all tables, bulk-inserts from JSON
- Status toast shown on restore success/error

## Attachment dropzone (AttachmentDropzone.vue)
- Shows upload spinner (`isUploading` ref) while files are being written to IndexedDB
- Interactions disabled (pointer-events + cursor) during upload

## Attachment viewer modal (AttachmentViewer.vue)
- Triggered by a "View (n)" button in IssueLogView and ConfirmLogView when attachments exist
- Fetches blobs via `getAttachmentsByIds()` from `useAttachments`
- Images (MIME starts with `image/`) render inline; other files show a Download button
- Supports multiple attachments with numbered pagination
- Near-fullscreen size: `max-width: 95vw`, `max-height: 95vh`, image capped at `75vh`
- Revokes all `URL.createObjectURL()` URLs on close to prevent memory leaks
- Dismissed via close button or backdrop click

## Add site modal (AddSiteModal.vue)
- Opens from "Add site" button in OverviewView (topbar + empty state) and Sidebar
- Fields: Site ID (required), Site name (required), Scope, Location/area, Comment — no Short code
- 2-second loading animation after save before modal closes and navigates to `/site/:id`
- Duplicate site ID shows inline error ("Site ID already exists. Try a different one.") — spinner stops, user can correct and retry
- Dismissed via Cancel button or backdrop click; resets form on close

## CSS design system (src/assets/main.css)
- Font: `Tahoma, 'Segoe UI', sans-serif` (system font — no Google Fonts import needed)
- Key CSS custom properties: `--ink`, `--ink-2`, `--ink-3`, `--paper`, `--paper-2`, `--line`, `--line-2`, `--issue`, `--issue-bg`, `--confirm`, `--confirm-bg`, `--pending`, `--highlight`
- Reusable classes: `.box`, `.box-dash`, `.chip`, `.chip-issue`, `.chip-confirm`, `.chip-pending`, `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-spinner`, `.field`, `.label`, `.row`, `.col`, `.between`, `.grow`, `.title-xl`, `.title-md`, `.small`, `.tiny`, `.mono`

## Routes
```
/                                    OverviewView
/site/new                            AddSiteView (create)
/site/:id                            SiteDashboardView
/site/:id/settings                   AddSiteView (edit/delete)
/site/:id/report/new                 NewReportView (create)
/site/:id/report/:reportId/edit      NewReportView (edit)
/site/:id/report/:reportId/email     EmailDraftView
/site/:id/issue/new                  IssueLogView (create)
/site/:id/issue/:issueId/edit        IssueLogView (edit)
/site/:id/confirm/new                ConfirmLogView (create)
/site/:id/confirm/:confirmId/edit    ConfirmLogView (edit)
/site/:id/email-settings             EmailSettingsView
```
Note: `/site/new` must appear before `/site/:id` in router config.
