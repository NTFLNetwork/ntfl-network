# NTFL Public Rebuild

This rebuild is designed for a public GitHub Pages site with a one-time Supabase setup and daily public updates.

## What is included
- Clean modern league layout
- Home, Teams, Team, Schedule, Standings, Rankings, Awards, History, Hall of Fame, Admin
- Team pages with:
  - ESPN CDN logos
  - uppercase team abbreviations
  - coaches
  - full schedule
  - stats: record, PF, PA, PPG, OPPG, point diff, home record, away record, streak, last 5
- Rankings drag reorder in Admin
- Public save path through Supabase
- Download fallback to `site-data.json`

## One-time setup
1. Open `admin.html`
2. Fill in your Supabase URL, anon key, table name, and row id
3. Click **Publish Public**
4. Upload the downloaded `site-data.json` to `data/site-data.json` on GitHub once

After that, public updates can go straight to Supabase and everyone sees the latest data on refresh.

## Supabase table
Recommended table: `ntfl_site_state`

Suggested columns:
- `id` integer primary key
- `data` jsonb not null

Example SQL:
```sql
create table if not exists public.ntfl_site_state (
  id integer primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.ntfl_site_state enable row level security;

create policy "read all"
on public.ntfl_site_state
for select
using (true);

create policy "insert all"
on public.ntfl_site_state
for insert
with check (true);

create policy "update all"
on public.ntfl_site_state
for update
using (true)
with check (true);
```

## Notes
- The site uses `assets/league-logo.jpeg` for the league logo.
- The league logo was provided by the user and included in the build.
- Team logos are loaded from the ESPN CDN.
