-- AyuTube database schema (reference copy)
--
-- Reconstructed from introspection of the live AyuTube Supabase project
-- (columns, constraints, indexes, RLS policies, trigger function).
-- The live database ALREADY contains all of this - do not re-run it there.
-- Use it as documentation, or to recreate the schema in a fresh project.
-- Table GRANTs were not captured; Supabase defaults apply.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique
               check (username is null or char_length(username) between 3 and 30),
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- --------------------------------------------------------------- playlists
create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null
              check (char_length(trim(both from name)) between 1 and 100),
  description text not null default ''
              check (char_length(description) <= 500),
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index playlists_user_created_idx
  on public.playlists (user_id, created_at desc);

-- ---------------------------------------------------------- playlist_items
create table public.playlist_items (
  id            uuid primary key default gen_random_uuid(),
  playlist_id   uuid not null references public.playlists (id) on delete cascade,
  video_id      text not null check (char_length(video_id) between 1 and 100),
  title         text not null check (char_length(title) between 1 and 500),
  channel_title text not null default '' check (char_length(channel_title) <= 300),
  thumbnail_url text not null default '' check (char_length(thumbnail_url) <= 2000),
  position      integer not null default 0 check (position >= 0),
  added_at      timestamptz not null default now(),
  unique (playlist_id, video_id)
);

create index playlist_items_order_idx
  on public.playlist_items (playlist_id, position, added_at);

--------------------------------------------------------------- watch_later
create table public.watch_later (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  video_id      text not null check (char_length(video_id) between 1 and 100),
  title         text not null check (char_length(title) between 1 and 500),
  channel_title text not null default '' check (char_length(channel_title) <= 300),
  thumbnail_url text not null default '' check (char_length(thumbnail_url) <= 2000),
  added_at      timestamptz not null default now(),
  unique (user_id, video_id)
);

create index watch_later_user_added_idx
  on public.watch_later (user_id, added_at desc);

-- ----------------------------------------------------------- watch_history
create table public.watch_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  video_id         text not null check (char_length(video_id) between 1 and 100),
  title            text not null check (char_length(title) between 1 and 500),
  channel_title    text not null default '' check (char_length(channel_title) <= 300),
  thumbnail_url    text not null default '' check (char_length(thumbnail_url) <= 2000),
  watched_at       timestamptz not null default now(),
  progress_seconds integer not null default 0 check (progress_seconds >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  unique (user_id, video_id)
);

create index watch_history_user_watched_idx
  on public.watch_history (user_id, watched_at desc);

-- ------------------------------------------------------ row level security
alter table public.profiles       enable row level security;
alter table public.playlists      enable row level security;
alter table public.playlist_items enable row level security;
alter table public.watch_later    enable row level security;
alter table public.watch_history  enable row level security;

-- profiles (no delete policy: removed with the auth user via cascade)
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- playlists
create policy playlists_select_own on public.playlists
  for select to authenticated using ((select auth.uid()) = user_id);
create policy playlists_insert_own on public.playlists
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy playlists_update_own on public.playlists
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy playlists_delete_own on public.playlists
  for delete to authenticated using ((select auth.uid()) = user_id);

-- playlist_items: ownership is checked through the parent playlist
create policy playlist_items_select_own on public.playlist_items
  for select to authenticated using (exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id and p.user_id = (select auth.uid())));
create policy playlist_items_insert_own on public.playlist_items
  for insert to authenticated with check (exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id and p.user_id = (select auth.uid())));
create policy playlist_items_update_own on public.playlist_items
  for update to authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id and p.user_id = (select auth.uid())))
  with check (exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id and p.user_id = (select auth.uid())));
create policy playlist_items_delete_own on public.playlist_items
  for delete to authenticated using (exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id and p.user_id = (select auth.uid())));

-- watch_later
create policy watch_later_select_own on public.watch_later
  for select to authenticated using ((select auth.uid()) = user_id);
create policy watch_later_insert_own on public.watch_later
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy watch_later_update_own on public.watch_later
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy watch_later_delete_own on public.watch_later
  for delete to authenticated using ((select auth.uid()) = user_id);

-- watch_history
create policy watch_history_select_own on public.watch_history
  for select to authenticated using ((select auth.uid()) = user_id);
create policy watch_history_insert_own on public.watch_history
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy watch_history_update_own on public.watch_history
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy watch_history_delete_own on public.watch_history
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ------------------------------------------- profile row on new auth user
create or replace function public.handle_new_ayutube_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_ayutube
  after insert on auth.users
  for each row execute function public.handle_new_ayutube_user();

-- ---------------------------------------- channel preferences and notes
-- (also available as supabase/migrations/20261010_...sql)

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
