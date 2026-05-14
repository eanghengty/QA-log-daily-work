# Telecom Site Tracker — CLAUDE.md

## What this app does
Client-side Vue 3 app for field coordinators to track telecom site progress. No backend — all data lives in the browser's IndexedDB via Dexie.js. Features: site management, daily progress updates (reports), blocker/risk logging (issues), approval sign-offs (confirms), RFC-822 `.eml` email generation, CSV export.

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
  db/index.js              # Dexie schema + initDb() + legacy demo cleanup
  composables/
    useLiveQuery.js         # Core: wraps Dexie.liveQuery() in Vue refs
    useSites.js             # Site CRUD + reactive queries + cascading delete
    useReports.js           # Progress update CRUD
    useIssues.js            # Blocker CRUD, auto-generates I-### codes
    useConfirms.js          # Approval CRUD, auto-generates C-### codes
    useAttachments.js       # Blob storage in IndexedDB
    useTrackerStats.js      # Global dashboard aggregates
  lib/
    email.js                # RFC-822 .eml generation with base64 attachments
  views/
    OverviewView.vue        # Dashboard: all sites, stats, CSV export
    SiteDashboardView.vue   # Per-site detail: blockers, approvals, history
    AddSiteView.vue         # Create/edit site form
    NewReportView.vue       # Progress update form
    IssueLogView.vue        # Blocker form
    ConfirmLogView.vue      # Approval form
    EmailDraftView.vue      # Email composer/preview
  components/
    Sidebar.vue             # Fixed nav sidebar (hosts AddSiteModal)
    Topbar.vue              # View header with action slots
    StatCard.vue            # Stat display card
    AttachmentDropzone.vue  # Drag-drop file input with previews
    AttachmentViewer.vue    # Modal viewer: images inline, files downloadable
    AddSiteModal.vue        # Modal for creating a new site (no Short code field)
    MaterialIcon.vue        # Material Symbols icon wrapper
  assets/main.css           # CSS custom properties + design system classes
  router/index.js           # 11 routes
```

## Database schema (version 2)
```
sites:        id (string slug, primary key)
reports:      ++id, siteId, date
issues:       ++id, siteId, status
confirms:     ++id, siteId
attachments:  ++id
emailSettings: siteId (primary key)
```

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
- **Approvals require ≥1 attachment** — enforced in `ConfirmLogView.save()`
- **Email generation** — `X-Unsent: 1` header makes `.eml` open as editable draft in Outlook
- **Telecom domain language** — "blockers", "approvals", "progress updates" (not QA/software terms)
- **Legacy demo cleanup** — `initDb()` detects and clears the old 8-site untouched demo seed without touching user data
- **Add site via modal** — "Add site" buttons in OverviewView and Sidebar open `AddSiteModal.vue` instead of navigating to a full page; `/site/new` route still exists for the settings edit flow
- **No Short code on create** — `code` field removed from the add/edit form; existing values preserved in DB and still used as avatar fallback in OverviewView

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
- On save navigates to the new site's dashboard (`/site/:id`)
- Dismissed via Cancel button or backdrop click; resets form on close

## CSS design system (src/assets/main.css)
Key CSS custom properties: `--ink`, `--ink-2`, `--ink-3`, `--paper`, `--paper-2`, `--line`, `--line-2`, `--issue`, `--issue-bg`, `--confirm`, `--confirm-bg`, `--pending`, `--highlight`

Reusable classes: `.box`, `.box-dash`, `.chip`, `.chip-issue`, `.chip-confirm`, `.chip-pending`, `.btn`, `.btn-primary`, `.btn-ghost`, `.field`, `.label`, `.row`, `.col`, `.between`, `.grow`, `.title-xl`, `.title-md`, `.small`, `.tiny`, `.mono`

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
```
Note: `/site/new` must appear before `/site/:id` in router config.
