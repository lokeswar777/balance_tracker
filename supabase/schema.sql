create table if not exists public.balance_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(15, 2) not null check (amount >= 0),
  note text check (char_length(note) <= 240),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists balance_history_user_recorded_idx
  on public.balance_history (user_id, recorded_at desc, created_at desc, id);

alter table public.balance_history enable row level security;

drop policy if exists "Users can view their own balance history" on public.balance_history;
create policy "Users can view their own balance history"
  on public.balance_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add to their own balance history" on public.balance_history;
create policy "Users can add to their own balance history"
  on public.balance_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can edit their own balance history" on public.balance_history;
create policy "Users can edit their own balance history"
  on public.balance_history for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own balance history" on public.balance_history;
create policy "Users can remove their own balance history"
  on public.balance_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.balance_history to authenticated;
