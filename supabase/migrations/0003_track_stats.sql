-- W2: anonymous play counts and a "Trending on Vega" feed.
-- No user id, no IP, no per-listen rows: only a per-track, per-day counter. Clients cannot read or write the table
-- directly; they go through the two functions below.

create table if not exists public.track_plays (
  source      text not null,
  id          text not null,
  day         date not null default current_date,
  plays       integer not null default 0,
  title       text not null,
  artists     text[] not null default '{}',
  thumb       text,
  duration_ms integer not null default 0,
  primary key (source, id, day)
);

alter table public.track_plays enable row level security;  -- no policies: direct access denied

create or replace function public.bump_play(
  p_source text, p_id text, p_title text, p_artists text[], p_thumb text, p_duration_ms integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_source <> 'ytm' or char_length(p_id) not between 5 and 20 or char_length(p_title) not between 1 and 300 then
    return;
  end if;
  insert into public.track_plays (source, id, day, plays, title, artists, thumb, duration_ms)
  values (p_source, p_id, current_date, 1, left(p_title, 300), coalesce(p_artists[1:6], '{}'), left(p_thumb, 500), greatest(p_duration_ms, 0))
  on conflict (source, id, day) do update set plays = public.track_plays.plays + 1;
end $$;

create or replace function public.trending(p_limit integer default 20)
returns table (source text, id text, title text, artists text[], thumb text, duration_ms integer, plays bigint)
language sql stable security definer set search_path = public as $$
  select source, id, max(title), max(artists), max(thumb), max(duration_ms), sum(plays)::bigint as plays
  from public.track_plays
  where day >= current_date - 7
  group by source, id
  order by sum(plays) desc, max(day) desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.bump_play(text, text, text, text[], text, integer) from public;
revoke all on function public.trending(integer) from public;
grant execute on function public.bump_play(text, text, text, text[], text, integer) to anon, authenticated;
grant execute on function public.trending(integer) to anon, authenticated;
