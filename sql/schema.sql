
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('commissioner','moderator','viewer')),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  coach_name text not null default '',
  ac_name text not null default '',
  conference text not null default '',
  division text not null default '',
  logo_url text not null default '',
  primary_color text not null default '#0f172a',
  secondary_color text not null default '#38bdf8',
  wins integer not null default 0,
  losses integer not null default 0,
  ties integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  streak text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_teams_updated_at on public.teams;
create trigger trg_teams_updated_at
before update on public.teams
for each row execute function public.updated_at_column();

create table if not exists public.schedule_games (
  id text primary key,
  week text not null,
  week_number integer not null,
  game_date date null,
  kickoff_time text null,
  home_team_name text not null,
  away_team_name text not null,
  home_score integer null,
  away_score integer null,
  status text not null default 'scheduled' check (status in ('scheduled','live','final','postponed','cancelled')),
  is_live boolean not null default false,
  spotlight boolean not null default false,
  source_sheet text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_schedule_week on public.schedule_games (week_number, week);
create index if not exists idx_schedule_status on public.schedule_games (status, is_live);
drop trigger if exists trg_schedule_updated_at on public.schedule_games;
create trigger trg_schedule_updated_at
before update on public.schedule_games
for each row execute function public.updated_at_column();

create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  week integer not null default 1,
  rank integer not null,
  team_name text not null,
  previous_rank integer null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_rankings_week on public.rankings (week, rank);
drop trigger if exists trg_rankings_updated_at on public.rankings;
create trigger trg_rankings_updated_at
before update on public.rankings
for each row execute function public.updated_at_column();

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text not null default '',
  category text not null default 'League',
  is_featured boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_news_published_at on public.news (published_at desc);
drop trigger if exists trg_news_updated_at on public.news;
create trigger trg_news_updated_at
before update on public.news
for each row execute function public.updated_at_column();

create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  season text not null default 'Season 4',
  award_name text not null,
  winner text not null,
  note text not null default '',
  icon text not null default '🏆',
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_awards_updated_at on public.awards;
create trigger trg_awards_updated_at
before update on public.awards
for each row execute function public.updated_at_column();

create table if not exists public.history_items (
  id uuid primary key default gen_random_uuid(),
  season text not null default 'Season 4',
  title text not null,
  body text not null,
  image_url text not null default '',
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_history_updated_at on public.history_items;
create trigger trg_history_updated_at
before update on public.history_items
for each row execute function public.updated_at_column();

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_settings_updated_at on public.site_settings;
create trigger trg_settings_updated_at
before update on public.site_settings
for each row execute function public.updated_at_column();

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and (
        p.role = required_role
        or (required_role = 'moderator' and p.role = 'commissioner')
      )
  );
$$;

alter table public.teams enable row level security;
alter table public.schedule_games enable row level security;
alter table public.rankings enable row level security;
alter table public.news enable row level security;
alter table public.awards enable row level security;
alter table public.history_items enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Public read teams" on public.teams;
create policy "Public read teams" on public.teams for select using (true);
drop policy if exists "Manage teams" on public.teams;
create policy "Manage teams" on public.teams for all using (public.has_role('moderator')) with check (public.has_role('moderator'));

drop policy if exists "Public read schedule" on public.schedule_games;
create policy "Public read schedule" on public.schedule_games for select using (true);
drop policy if exists "Manage schedule" on public.schedule_games;
create policy "Manage schedule" on public.schedule_games for all using (public.has_role('moderator')) with check (public.has_role('moderator'));

drop policy if exists "Public read rankings" on public.rankings;
create policy "Public read rankings" on public.rankings for select using (true);
drop policy if exists "Manage rankings" on public.rankings;
create policy "Manage rankings" on public.rankings for all using (public.has_role('moderator')) with check (public.has_role('moderator'));

drop policy if exists "Public read news" on public.news;
create policy "Public read news" on public.news for select using (true);
drop policy if exists "Manage news" on public.news;
create policy "Manage news" on public.news for all using (public.has_role('moderator')) with check (public.has_role('moderator'));

drop policy if exists "Public read awards" on public.awards;
create policy "Public read awards" on public.awards for select using (true);
drop policy if exists "Manage awards" on public.awards;
create policy "Manage awards" on public.awards for all using (public.has_role('moderator')) with check (public.has_role('moderator'));

drop policy if exists "Public read history" on public.history_items;
create policy "Public read history" on public.history_items for select using (true);
drop policy if exists "Manage history" on public.history_items;
create policy "Manage history" on public.history_items for all using (public.has_role('moderator')) with check (public.has_role('moderator'));

drop policy if exists "Public read settings" on public.site_settings;
create policy "Public read settings" on public.site_settings for select using (true);
drop policy if exists "Manage settings" on public.site_settings;
create policy "Manage settings" on public.site_settings for all using (public.has_role('moderator')) with check (public.has_role('moderator'));
