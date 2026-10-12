-- Applied to the AyuTube Supabase project.
-- Interests, exam date and first-run state on the profile, plus liked videos.

alter table public.profiles
  add column interests    text[] not null default '{}',
  add column exam_name    text,
  add column exam_date    date,
  add column onboarded_at timestamptz;

alter table public.profiles
  add constraint profiles_interests_max check (cardinality(interests) <= 5),
  add constraint profiles_exam_name_len check (exam_name is null or char_length(exam_name) between 1 and 60);

create table public.video_likes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  video_id      text not null check (char_length(video_id) between 1 and 100),
  title         text not null check (char_length(title) between 1 and 500),
  channel_title text not null default '' check (char_length(channel_title) <= 300),
  thumbnail_url text not null default '' check (char_length(thumbnail_url) <= 2000),
  created_at    timestamptz not null default now(),
  unique (user_id, video_id)
);

create index video_likes_user_created_idx
  on public.video_likes (user_id, created_at desc);

alter table public.video_likes enable row level security;

create policy video_likes_select_own on public.video_likes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy video_likes_insert_own on public.video_likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy video_likes_update_own on public.video_likes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy video_likes_delete_own on public.video_likes
  for delete to authenticated using ((select auth.uid()) = user_id);
