# Supabase Auth + Realtime Setup

This repo now includes a first-pass Supabase shell without replacing the current IndexedDB data flows yet.

## What is already wired in the app

- Email/password sign in
- Sign up
- Password reset email
- Signed-in account modal for display name and password updates
- Supabase Realtime presence channel (`qa-tracker:lobby`) for websocket connectivity
- Sidebar connection status and online-user count

If Supabase environment variables are not set, the app stays in the current local-only IndexedDB mode.

## 1. Add environment variables

Copy `.env.example` into your local Vite env file and fill in the values:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

## 2. Link this repo to your cloud project

Use the Windows-safe CLI form in PowerShell:

```bash
npx.cmd supabase login
npx.cmd supabase link --project-ref your-project-ref
```

You can find the project ref in the Supabase dashboard URL or project settings.

## 3. Push the first migration

This repo now includes a proper CLI migration:

```bash
npx.cmd supabase db push
```

That migration creates:

- `profiles`
- `organizations`
- `organization_members`
- profile trigger sync from `auth.users`
- row-level security policies
- `create_organization_with_owner(text)` helper

## 4. Pull your frontend env values

From the Supabase dashboard, copy:

- Project URL
- anon public key

Put them in your local env file from `.env.example`.

For GitHub Pages, add the same public frontend values as GitHub secrets before
deploying from `main`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The Pages workflow passes those secrets into `npm run build`. If either secret
is missing, the deploy job fails instead of publishing a local-only fallback
build that skips the custom backend auth gate.

## 5. Enable Realtime

Supabase Realtime presence uses websockets. No extra Postgres table is needed for the current presence lobby, but your project must have Realtime enabled in Supabase.

The current channel name is:

```text
qa-tracker:lobby
```

## 6. Cloud-backed tracker data

The current Supabase migrations now cover:

- custom backend auth tables
- site headers
- site scopes
- confirmation sources
- core cloud tables for reports, blockers, approvals, email settings, and document references
- pending summaries
- site checklist, cable matrix, antenna checklist, DCPL checklist, and cable checklist board payloads

IndexedDB still provides the reactive local mirror used by the Vue views, and attachments remain IndexedDB-only until file storage is migrated.

Deploy `tracker-core` after applying migrations so the new board actions are available to the frontend.

## 7. Recommended next implementation step

Move one domain at a time instead of all tables at once:

1. profiles + organizations + memberships
2. sites
3. updates / blockers / approvals
4. attachments to Supabase Storage
5. any remaining row-level normalization after the JSON board payloads are stable

Use `SUPABASE_MIGRATION.md` for the target schema strategy.
