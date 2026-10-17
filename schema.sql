-- ============================================================
-- Wellness Tracker - database schema (namespaced: cotee_*)
-- Run this once in the Supabase SQL editor of the shared project.
-- Table names are prefixed so they never collide with the project's
-- other apps (budget, devotional, challenge tracker, Held).
-- ============================================================

-- 1. Profiles (one row per person, linked to their login)
create table public.cotee_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  avatar jsonb not null default '{"skin":"#f1c9a5","hair":"short","hairColor":"#1d1d1d","shirt":"#0F6B8A"}'::jsonb,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Activities = the point rules the admin can edit (10 pts per 20 pushups, etc.)
create table public.cotee_activities (
  id bigint generated always as identity primary key,
  name text not null,
  unit text not null,
  points_per numeric not null,
  per_quantity numeric not null,
  sort_order int not null default 0,
  active boolean not null default true
);

-- 3. Challenges (weekly, monthly, or custom date ranges)
create table public.cotee_challenges (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  target_points numeric,
  created_by uuid references public.cotee_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 4. Activity log entries
create table public.cotee_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.cotee_profiles(id) on delete cascade,
  activity_id bigint not null references public.cotee_activities(id) on delete restrict,
  quantity numeric not null,
  points numeric not null,
  proof_url text,
  note text,
  created_at timestamptz not null default now(),
  flagged boolean not null default false
);
create index cotee_entries_user_created_idx on public.cotee_entries (user_id, created_at desc);
create index cotee_entries_created_idx on public.cotee_entries (created_at desc);

-- 5. Admin check helper
create or replace function public.cotee_is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.cotee_profiles where id = auth.uid() and is_admin = true);
$$;

-- 6. Row level security
alter table public.cotee_profiles enable row level security;
alter table public.cotee_activities enable row level security;
alter table public.cotee_challenges enable row level security;
alter table public.cotee_entries enable row level security;

create policy "cotee profiles readable by authenticated"
  on public.cotee_profiles for select to authenticated using (true);
create policy "cotee profiles insert own"
  on public.cotee_profiles for insert to authenticated with check (auth.uid() = id);
create policy "cotee profiles update own"
  on public.cotee_profiles for update to authenticated using (auth.uid() = id);
create policy "cotee profiles admin all"
  on public.cotee_profiles for all to authenticated using (public.cotee_is_admin());

create policy "cotee activities readable"
  on public.cotee_activities for select to authenticated using (true);
create policy "cotee activities admin write"
  on public.cotee_activities for all to authenticated
  using (public.cotee_is_admin()) with check (public.cotee_is_admin());

create policy "cotee challenges readable"
  on public.cotee_challenges for select to authenticated using (true);
create policy "cotee challenges admin write"
  on public.cotee_challenges for all to authenticated
  using (public.cotee_is_admin()) with check (public.cotee_is_admin());

create policy "cotee entries readable"
  on public.cotee_entries for select to authenticated using (true);
create policy "cotee entries insert own"
  on public.cotee_entries for insert to authenticated with check (auth.uid() = user_id);
create policy "cotee entries update own"
  on public.cotee_entries for update to authenticated using (auth.uid() = user_id);
create policy "cotee entries delete own"
  on public.cotee_entries for delete to authenticated using (auth.uid() = user_id);
create policy "cotee entries admin all"
  on public.cotee_entries for all to authenticated using (public.cotee_is_admin());

-- 7. Leaderboard: ranked totals inside a challenge window
create or replace function public.cotee_leaderboard(p_starts_at timestamptz, p_ends_at timestamptz)
returns table (user_id uuid, display_name text, avatar jsonb, total_points numeric, entry_count bigint)
language sql security definer set search_path = public as $$
  select e.user_id, p.display_name, p.avatar, sum(e.points)::numeric, count(*)::bigint
  from public.cotee_entries e
  join public.cotee_profiles p on p.id = e.user_id
  where e.created_at >= p_starts_at
    and e.created_at <= p_ends_at
    and e.flagged = false
  group by e.user_id, p.display_name, p.avatar
  order by sum(e.points) desc;
$$;

-- 8. Storage bucket for proof photos (public read, each person uploads to their own folder)
insert into storage.buckets (id, name, public) values ('cotee-proofs', 'cotee-proofs', true)
on conflict (id) do nothing;

create policy "cotee proofs public read"
  on storage.objects for select using (bucket_id = 'cotee-proofs');
create policy "cotee proofs authed upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cotee-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "cotee proofs owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'cotee-proofs' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'cotee-proofs');
create policy "cotee proofs owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cotee-proofs' and auth.uid()::text = (storage.foldername(name))[1]);

-- 9. Seed activities (the admin can edit these any time in the Admin tab)
-- Point logic: points track effort. 10 pts ~= 15 min of moderate activity
-- (brisk walking). Vigorous activities earn faster, light ones slower,
-- so no single easy activity games the board.
-- Guarded: only seeds when the table is empty, safe to re-run.
insert into public.cotee_activities (name, unit, points_per, per_quantity, sort_order)
select v.name, v.unit, v.points_per, v.per_quantity, v.sort_order
from (values
  ('Walking', 'steps', 10, 1500, 1),
  ('Running', 'miles', 10, 1, 2),
  ('Hiking', 'miles', 10, 1, 3),
  ('Cycling', 'miles', 10, 3, 4),
  ('Stationary bike', 'minutes', 10, 15, 5),
  ('Elliptical', 'minutes', 10, 15, 6),
  ('Rowing machine', 'minutes', 10, 8, 7),
  ('Jump rope', 'minutes', 10, 8, 8),
  ('Swimming', 'laps', 10, 10, 9),
  ('Water aerobics', 'minutes', 10, 15, 10),
  ('Pushups', 'reps', 10, 50, 11),
  ('Squats', 'reps', 10, 50, 12),
  ('Lunges', 'reps', 10, 40, 13),
  ('Sit-ups', 'reps', 10, 50, 14),
  ('Plank', 'minutes', 10, 5, 15),
  ('Burpees', 'reps', 10, 20, 16),
  ('Pull-ups', 'reps', 10, 10, 17),
  ('Dips', 'reps', 10, 30, 18),
  ('Jumping jacks', 'reps', 10, 100, 19),
  ('Weight lifting', 'minutes', 10, 15, 20),
  ('Resistance bands', 'minutes', 10, 15, 21),
  ('Yoga', 'minutes', 10, 20, 22),
  ('Pilates', 'minutes', 10, 15, 23),
  ('Stretching', 'minutes', 10, 30, 24),
  ('Tai chi', 'minutes', 10, 20, 25),
  ('Chair exercises', 'minutes', 10, 20, 26),
  ('Dancing', 'minutes', 10, 15, 27),
  ('Pickleball', 'minutes', 10, 15, 28),
  ('Tennis', 'minutes', 10, 15, 29),
  ('Basketball', 'minutes', 10, 12, 30),
  ('Soccer', 'minutes', 10, 12, 31),
  ('Golf (walking)', 'minutes', 10, 30, 32),
  ('Bowling', 'minutes', 10, 30, 33),
  ('Kayaking', 'minutes', 10, 15, 34),
  ('Gardening', 'minutes', 10, 20, 35)
) as v(name, unit, points_per, per_quantity, sort_order)
where not exists (select 1 from public.cotee_activities);
