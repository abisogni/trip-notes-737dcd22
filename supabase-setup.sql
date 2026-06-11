-- Paris Trip Journal — Supabase setup
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run

-- Pins added live during the trip (the original 20 guide pins stay hardcoded in the page)
create table public.paris_pins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  notes text,
  source_url text,
  added_by text not null,
  created_at timestamptz not null default now()
);

-- Journal entries / comments attached to any pin (original "1".."20" or a paris_pins.id)
create table public.paris_comments (
  id uuid primary key default gen_random_uuid(),
  pin_id text not null,
  pin_name text not null,
  author text not null,
  comment_text text,
  photo_url text,
  created_at timestamptz not null default now()
);

create index on public.paris_comments (pin_id);

-- Row Level Security: anyone with the anon/public key can read and add entries,
-- but cannot edit or delete (keeps the journal append-only).
alter table public.paris_pins enable row level security;
alter table public.paris_comments enable row level security;

create policy "public read paris_pins" on public.paris_pins
  for select using (true);
create policy "public insert paris_pins" on public.paris_pins
  for insert with check (true);

create policy "public read paris_comments" on public.paris_comments
  for select using (true);
create policy "public insert paris_comments" on public.paris_comments
  for insert with check (true);

-- Storage bucket for journal photos
insert into storage.buckets (id, name, public)
values ('paris-photos', 'paris-photos', true)
on conflict (id) do nothing;

create policy "public read paris-photos"
  on storage.objects for select
  using (bucket_id = 'paris-photos');

create policy "public upload paris-photos"
  on storage.objects for insert
  with check (bucket_id = 'paris-photos');

-- Realtime: so a new pin/comment from one phone shows up live on the other
alter publication supabase_realtime add table public.paris_pins;
alter publication supabase_realtime add table public.paris_comments;
