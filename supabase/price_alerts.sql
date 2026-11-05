-- Budget price alerts (AI Trip Planner: "Notify me when the price drops below my budget").
-- Run once in Supabase → SQL Editor. Safe to run again.

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,                        -- users.id of the account that made it
  email text not null,                 -- where the alert goes
  origin text not null,                -- "San Francisco (SFO)"
  destination text not null,           -- "Kochi (COK)"
  destination_city text not null,
  destination_country text not null default '',
  destination_code text not null default '',
  depart date not null,
  days int not null,                   -- trip length; the return flight is on the last day
  adults int not null default 1,
  budget numeric not null,             -- per person, in currency
  currency text not null,              -- the starting airport's currency, e.g. USD
  status text not null default 'active' check (status in ('active','notified','expired','stopped')),
  start_price numeric,                 -- cheapest per person when the alert was made
  last_price numeric,                  -- cheapest per person at the last check
  last_checked timestamptz,
  notified_at timestamptz,
  stop_token uuid not null default gen_random_uuid(),  -- "Stop this alert" link in the email
  source text not null default 'gemini'                -- where prices come from: gemini (demo) or serpapi
);
create index if not exists price_alerts_user_idx on public.price_alerts (user_id, created_at desc);
create index if not exists price_alerts_status_idx on public.price_alerts (status);
create unique index if not exists price_alerts_token_idx on public.price_alerts (stop_token);

-- Browsers can't read the table; only the server (secret key) can.
alter table public.price_alerts enable row level security;
