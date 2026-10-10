-- Applied to the AyuTube Supabase project.
-- Adds channel follow/hide preferences and timestamped video notes.

create table public.channel_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  channel_key  text not null check (char_length(channel_key) between 1 and 200),
  channel_name text not null check (char_length(channel_name) between 1 and 300),
  kind         text not null check (kind in ('follow', 'block')),
  created_at   timestamptz not null default now(),
  unique (user_id, channel_key)
);

create index channel_preferences_user_idx
  on public.channel_preferences (user_id, kind, created_at desc);

create table public.video_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  video_id   text not null check (char_length(video_id) between 1 and 100),
  seconds    integer not null default 0 check (seconds >= 0 and seconds <= 604800),
  body       text not null check (char_length(trim(both from body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index video_notes_user_video_idx
  on public.video_notes (user_id, video_id, seconds);

alter table public.channel_preferences enable row level security;
alter table public.video_notes         enable row level security;

create policy channel_preferences_select_own on public.channel_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy channel_preferences_insert_own on public.channel_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy channel_preferences_update_own on public.channel_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy channel_preferences_delete_own on public.channel_preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy video_notes_select_own on public.video_notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy video_notes_insert_own on public.video_notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy video_notes_update_own on public.video_notes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy video_notes_delete_own on public.video_notes
  for delete to authenticated using ((select auth.uid()) = user_id);
