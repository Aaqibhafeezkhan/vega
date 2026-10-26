-- Server-side arrival time for play events so clients can pull "everything new since my last sync"
-- even when events were logged on another device in the past.
alter table public.play_events add column if not exists synced_at timestamptz not null default now();
create index if not exists play_events_user_synced on public.play_events (user_id, synced_at);
