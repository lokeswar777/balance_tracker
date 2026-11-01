# Balance

A personal balance tracker built with React, TypeScript, Vite, and Supabase. Each
balance update is a new, persistent snapshot. Sign-in, row-level security, and
the database ensure a user can access only their own history.

## Get started

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` using your project's API settings. The publishable
   (or legacy anon) key is intended for browser use; **never** use a
   service-role key in the frontend.
4. In Supabase Authentication settings, enable email/password sign-in and
   configure email confirmation to suit your project.
5. Run `npm install`, then `npm run dev`.

Build for deployment with `npm run build`; publish the generated `dist`
directory and configure the same two public Vite environment variables in the
hosting provider. The dashboard does not fall back to mock or local-only
financial records when Supabase is unavailable.

## Data and behavior

- The authenticated user's `auth.uid()` is enforced by database row-level
  security on every history operation.
- The newest balance is determined by `recorded_at`, then `created_at`, then
  `id`, so entries sharing a timestamp have a consistent order.
- Adding a balance inserts a snapshot. Editing or deleting a historical entry
  changes only that snapshot; the displayed balances, differences, chart, and
  statistics are recalculated from the stored history.
- INR is the display currency. Amounts are stored to two decimal places.
