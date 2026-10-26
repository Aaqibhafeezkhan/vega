-- Vega cloud schema. Every table is per-user and protected by Row Level Security:
-- a signed-in user can only ever see and change rows where user_id = auth.uid().
-- Tracks are stored as a metadata snapshot (jsonb), never as stream URLs.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table if not exists public.liked_tracks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  track_key  text not null,               -- "<source>:<id>"
  track      jsonb not null,
  updated_at bigint not null,             -- client ms timestamp, last-write-wins
  deleted    boolean not null default false,
  primary key (user_id, track_key)
);

create table if not exists public.playlists (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          text not null,
  name        text not null check (char_length(name) between 1 and 200),
  description text,
  tracks      jsonb not null default '[]'::jsonb,
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted     boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.play_events (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          text not null,              -- deterministic client id => idempotent upserts
  track       jsonb not null,
  started_at  bigint not null,
  listened_ms integer not null check (listened_ms >= 0),
  counted     boolean not null,
  skipped     boolean not null,
  primary key (user_id, id)
);
create index if not exists play_events_user_time on public.play_events (user_id, started_at desc);

create table if not exists public.user_settings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at bigint not null,
  primary key (user_id, key)
);

-- Row Level Security
alter table public.profiles      enable row level security;
alter table public.liked_tracks  enable row level security;
alter table public.playlists     enable row level security;
alter table public.play_events   enable row level security;
alter table public.user_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['liked_tracks','playlists','play_events','user_settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nothing here is meant for anonymous access.
revoke all on all tables in schema public from anon;
