-- Voice messages for Sunny (Customer tab → Agent tab "Voice requests").
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists public.voice_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text,
  email text,
  audio_path text not null,          -- file in the voice-messages storage bucket
  audio_mime text not null,
  seconds int not null,
  language text,                     -- e.g. Malayalam
  transcript text,                   -- what was said, in that language
  transcript_en text,                -- English version
  status text not null default 'new' check (status in ('new','contacted','ticketed','closed')),
  error text,                        -- why the text is missing, if it is
  submitted_by text                  -- signed-in account that sent it
);
create index if not exists voice_requests_created_idx on public.voice_requests (created_at desc);

-- Browsers can't read the table; only the server (secret key) can.
alter table public.voice_requests enable row level security;

-- Phase B: trip details read from the message (and corrected by Sunny).
alter table public.voice_requests add column if not exists trip jsonb;

-- Private bucket for the recordings (played through short-lived signed links).
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', false)
on conflict (id) do nothing;
