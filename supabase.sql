create table if not exists public.balance_history (
  id smallint primary key check (id = 1),
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.balance_history enable row level security;
revoke all on table public.balance_history from anon, authenticated;
grant all on table public.balance_history to service_role;
