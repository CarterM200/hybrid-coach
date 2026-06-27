-- Hybrid Coach - database schema
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It creates one table that stores each user's entire app state as a JSON blob,
-- locked down so a user can only ever read/write their own row.

create table if not exists public.athlete_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every row belongs to exactly one user.
alter table public.athlete_state enable row level security;

drop policy if exists "athlete_state_select_own" on public.athlete_state;
create policy "athlete_state_select_own"
  on public.athlete_state for select
  using (auth.uid() = user_id);

drop policy if exists "athlete_state_insert_own" on public.athlete_state;
create policy "athlete_state_insert_own"
  on public.athlete_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "athlete_state_update_own" on public.athlete_state;
create policy "athlete_state_update_own"
  on public.athlete_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "athlete_state_delete_own" on public.athlete_state;
create policy "athlete_state_delete_own"
  on public.athlete_state for delete
  using (auth.uid() = user_id);

-- Account deletion. Lets a signed-in user delete THEIR OWN auth account from the
-- client. Runs as a security-definer function (owned by a privileged role) so it
-- can remove the row from auth.users; the athlete_state row is removed automatically
-- by the ON DELETE CASCADE above. Users can only ever delete themselves (auth.uid()).
create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
