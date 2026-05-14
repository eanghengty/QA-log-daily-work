# QA Tracker - Agent Guide

A client-only QA self-update tracker. A single QA person tracks 5-20 sites, logs daily
free-form reports, issues, and confirmations with file proof, then generates an email
draft from each report. There is no backend. All data lives in IndexedDB.

## Stack

- **Vue 3** (`<script setup>` SFCs) + **Vue Router**
- **Vite 8** build tool / dev server
- **Tailwind CSS v4** via `@tailwindcss/vite` (`@import "tailwindcss"`)
- **Dexie.js** for IndexedDB; no Pinia
- **Material Symbols** via `src/components/MaterialIcon.vue`

## Commands

```bash
npm install      # install deps
npm run dev      # dev server (Vite)
npm run build    # production build - use this to verify
npm run preview  # preview production build
```

On Windows PowerShell, `npm` may be blocked by script policy. Use `npm.cmd run build`
or `npm.cmd run dev` when that happens.

## Architecture

### Data Layer (`src/db/`)

- `index.js` defines the Dexie schema and `initDb()`.
- Tables: `sites`, `reports`, `issues`, `confirms`, `attachments`, `emailSettings`.
- The app starts empty. Do not add demo, dummy, placeholder, or hardcoded QA records.
- `initDb()` only removes the old untouched 8-site demo seed if it is detected in an
  existing browser IndexedDB. It should not delete user-created data.

### Reactive Store (`src/composables/`)

- `useLiveQuery.js` wraps `Dexie.liveQuery` in Vue refs and auto-unsubscribes.
- `useSites.js` exposes sites with derived `pending` and `confirms` counts, plus site CRUD.
- `useReports.js`, `useIssues.js`, and `useConfirms.js` expose per-site CRUD plus reactive
  single-record helpers for edit views.
- Issue and confirmation codes are generated per site by incrementing the highest existing
  `I-###` or `C-###` code.
- `useAttachments.js` stores `File` / `Blob` objects directly in IndexedDB.
- `useTrackerStats.js` derives overview totals from live IndexedDB data.

### Email (`src/lib/email.js`)

- `buildEmailSubject()` and `buildEmailBody()` compose report email content from the report,
  linked issues, linked confirmations, and settings toggles.
- `generateEml()` builds an RFC-822 `multipart/mixed` message with `X-Unsent: 1` so Outlook
  opens the `.eml` as an editable, sendable draft.
- `downloadEml()` and `copyToClipboard()` are the output helpers.

### UI

- `src/views/` contains one view per route:
  - `OverviewView`
  - `SiteDashboardView`
  - `NewReportView`
  - `EmailDraftView`
  - `IssueLogView`
  - `ConfirmLogView`
  - `AddSiteView` (also used for site settings)
- `src/components/` contains shared UI:
  - `Sidebar`
  - `Topbar`
  - `StatCard`
  - `AttachmentDropzone`
  - `MaterialIcon`
- `src/router/index.js` keeps `/site/new` before `/site/:id`. Do not reorder those routes.

## Conventions

- **No dummy data**: forms and the database start empty. Do not seed demo sites, demo reports,
  placeholder issues, placeholder confirmations, fake users, or hardcoded stats.
- **Reactive reads**: components should read through `use*` composables backed by
  `useLiveQuery`. Avoid direct `db.*` reads in components.
- **Async single records**: use `useSiteById()`, `useReportById()`, `useIssueById()`, and
  `useConfirmById()` for edit/detail views. Do not call async `get*ById()` inside `computed`.
- **Styling**: keep the hand-drawn wireframe look. Design tokens are CSS custom properties in
  `src/assets/main.css`; reusable primitives include `.box`, `.chip`, `.btn`, `.field`,
  `.label`, and `.squiggle`.
- **Icons**: do not use emoji glyphs in app UI or generated email. Use `MaterialIcon.vue`
  with Material Symbols names instead.
- **Forms**: form state starts empty. UI examples belong in labels or helper text, not dummy
  `ref()` values.
- **Confirmations**: saving a confirmation requires at least one attachment.
- **IDs**: `sites` use slug strings; `reports`, `issues`, `confirms`, and `attachments`
  auto-increment.
- **Attachments**: store file proof through `AttachmentDropzone` / `useAttachments`; persist
  attachment ID arrays as plain arrays, not Vue reactive proxies.

## Current Routes

- `/` - overview
- `/site/new` - add site
- `/site/:id` - site dashboard
- `/site/:id/settings` - edit/delete site
- `/site/:id/report/new` - new report
- `/site/:id/report/:reportId/edit` - edit report
- `/site/:id/report/:reportId/email` - email draft
- `/site/:id/issue/new` - new issue
- `/site/:id/issue/:issueId/edit` - edit issue
- `/site/:id/confirm/new` - new confirmation
- `/site/:id/confirm/:confirmId/edit` - edit confirmation

## Verification Checklist

After changes, run `npm.cmd run build` on Windows or `npm run build` elsewhere.

Then check the app in the browser:

1. Fresh/clean IndexedDB overview shows 0 sites and an empty-state add-site action.
2. Add a site, then confirm it appears in the sidebar and overview.
3. Open the site dashboard; settings, new report, log issue, and save confirmation actions open.
4. New report -> save -> appears in history -> reload -> still there.
5. New report -> save & generate email -> opens the report email draft.
6. Email draft toggles update the body; copy and `.eml` download buttons work.
7. Log an issue -> site pending badge increments; clicking the issue opens edit mode.
8. Confirmation save is blocked at 0 attachments and allowed at 1 or more attachments.
9. Site settings can update site fields and delete the site with the two-click confirm action.
10. No emoji glyphs, demo QA records, hardcoded site stats, or placeholder QA content remain.
