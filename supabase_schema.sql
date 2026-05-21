-- ============================================================
-- Flag-It Supabase Schema
-- 1. Create a project at supabase.com
-- 2. Paste this into your SQL Editor and run it
-- 3. Enable Google OAuth: Authentication → Providers → Google
-- 4. Set your Site URL: Authentication → URL Configuration
-- ============================================================

-- ── Accounts (extends auth.users) ────────────────────────
create table public.accounts (
  id           uuid references auth.users(id) on delete cascade primary key,
  username     text unique not null,
  display_name text,
  emoji        text default '🧗',
  bio          text default '',
  is_public    boolean default true,
  local_profiles jsonb default '[]',   -- mirrors the local profile list for multi-device restore
  created_at   timestamptz default now()
);

-- ── Sessions ─────────────────────────────────────────────
create table public.sessions (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.accounts(id) on delete cascade not null,
  profile_id   text not null,
  local_id     bigint not null,
  date         date not null,
  gym          text default '',
  note         text default '',
  routes       jsonb default '[]',
  feel         text,
  session_start bigint,
  session_end  bigint,
  is_public    boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Gyms ─────────────────────────────────────────────────
create table public.gyms (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.accounts(id) on delete cascade not null,
  profile_id text not null,
  local_id   bigint not null,
  name       text not null,
  fav        boolean default false,
  created_at timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Goals ────────────────────────────────────────────────
create table public.goals (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references public.accounts(id) on delete cascade not null,
  profile_id     text not null,
  local_id       bigint not null,
  type           text not null,
  grade          text,
  result         text,
  count          integer,
  deadline       date,
  created_at_date date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Hang Sessions ─────────────────────────────────────────
create table public.hang_sessions (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.accounts(id) on delete cascade not null,
  profile_id text not null,
  local_id   bigint not null,
  date       date not null,
  note       text default '',
  sets       jsonb default '[]',
  created_at timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Projects ──────────────────────────────────────────────
create table public.projects (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references public.accounts(id) on delete cascade not null,
  profile_id     text not null,
  local_id       bigint not null,
  name           text,
  grade          text,
  gym            text,
  status         text default 'project',
  attempts       integer default 0,
  highpoint      text default '',
  beta_notes     text default '',
  setter_data    jsonb,
  created_at_date date,
  completed_at   date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Injuries ──────────────────────────────────────────────
create table public.injuries (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.accounts(id) on delete cascade not null,
  profile_id text not null,
  local_id   bigint not null,
  part       text,
  severity   text,
  date       date,
  note       text default '',
  status     text default 'active',
  created_at timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Competitions ──────────────────────────────────────────
create table public.competitions (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.accounts(id) on delete cascade not null,
  profile_id text not null,
  local_id   bigint not null,
  name       text,
  date       date,
  location   text default '',
  created_at timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Gym Resets ────────────────────────────────────────────
create table public.gym_resets (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.accounts(id) on delete cascade not null,
  profile_id   text not null,
  local_id     bigint not null,
  gym_local_id bigint,
  date         date,
  created_at   timestamptz default now(),
  unique(user_id, profile_id, local_id)
);

-- ── Active Plans ──────────────────────────────────────────
create table public.active_plans (
  user_id    uuid references public.accounts(id) on delete cascade not null,
  profile_id text not null,
  plan_id    text,
  start_date date,
  updated_at timestamptz default now(),
  primary key(user_id, profile_id)
);

-- ── Follows ───────────────────────────────────────────────
create table public.follows (
  follower_id  uuid references public.accounts(id) on delete cascade,
  following_id uuid references public.accounts(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key(follower_id, following_id)
);

-- ── Kudos ─────────────────────────────────────────────────
create table public.kudos (
  id           uuid default gen_random_uuid() primary key,
  from_user_id uuid references public.accounts(id) on delete cascade not null,
  session_id   uuid references public.sessions(id) on delete cascade not null,
  created_at   timestamptz default now(),
  unique(from_user_id, session_id)
);

-- ── Comments ──────────────────────────────────────────────
create table public.comments (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.accounts(id) on delete cascade not null,
  session_id uuid references public.sessions(id) on delete cascade not null,
  content    text not null,
  created_at timestamptz default now()
);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

alter table public.accounts    enable row level security;
alter table public.sessions    enable row level security;
alter table public.gyms        enable row level security;
alter table public.goals       enable row level security;
alter table public.hang_sessions enable row level security;
alter table public.projects    enable row level security;
alter table public.injuries    enable row level security;
alter table public.competitions enable row level security;
alter table public.gym_resets  enable row level security;
alter table public.active_plans enable row level security;
alter table public.follows     enable row level security;
alter table public.kudos       enable row level security;
alter table public.comments    enable row level security;

-- Accounts: public read (for social), own write
create policy "accounts_public_read" on public.accounts for select using (true);
create policy "accounts_own_write"   on public.accounts for all   using (id = auth.uid()) with check (id = auth.uid());

-- Sessions: own CRUD + public sessions readable by all
create policy "sessions_own"         on public.sessions for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sessions_public_read" on public.sessions for select using (is_public = true);

-- Gyms: own only
create policy "gyms_own" on public.gyms for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Goals: own only
create policy "goals_own" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Hang sessions: own only
create policy "hang_sessions_own" on public.hang_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Projects: own only
create policy "projects_own" on public.projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Injuries: own only
create policy "injuries_own" on public.injuries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Competitions: own only
create policy "competitions_own" on public.competitions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gym resets: own only
create policy "gym_resets_own" on public.gym_resets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Active plans: own only
create policy "active_plans_own" on public.active_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Follows: authenticated can read/write own follows
create policy "follows_read"   on public.follows for select using (auth.uid() is not null);
create policy "follows_insert" on public.follows for insert with check (follower_id = auth.uid());
create policy "follows_delete" on public.follows for delete using (follower_id = auth.uid());

-- Kudos: public read, authenticated insert/delete own
create policy "kudos_read"   on public.kudos for select using (true);
create policy "kudos_insert" on public.kudos for insert with check (from_user_id = auth.uid());
create policy "kudos_delete" on public.kudos for delete using (from_user_id = auth.uid());

-- Comments: public read, authenticated insert, own delete
create policy "comments_read"   on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (user_id = auth.uid());
create policy "comments_delete" on public.comments for delete using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- TRIGGERS
-- ════════════════════════════════════════════════════════════

create or replace function public.handle_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin new.updated_at = now(); return new; end; $$;

create trigger sessions_updated_at  before update on public.sessions  for each row execute function public.handle_updated_at();
create trigger goals_updated_at     before update on public.goals     for each row execute function public.handle_updated_at();
create trigger projects_updated_at  before update on public.projects  for each row execute function public.handle_updated_at();

-- Auto-create account row on signup (username defaults to first part of email)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := split_part(new.email, '@', 1);
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
  if length(base_username) < 3 then base_username := 'klimmer'; end if;
  final_username := base_username;
  loop
    begin
      insert into public.accounts(id, username) values(new.id, final_username);
      exit;
    exception when unique_violation then
      suffix := suffix + 1;
      final_username := base_username || suffix;
    end;
  end loop;
  return new;
end; $$;

-- This function must only fire via the auth trigger, not be callable via the REST API.
-- Revoke from PUBLIC (the default grantee) to close the /rpc/handle_new_user endpoint.
revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════

create index on public.sessions(user_id, profile_id);
create index on public.sessions(date desc);
create index on public.sessions(is_public) where is_public = true;
create index on public.gyms(user_id, profile_id);
create index on public.goals(user_id, profile_id);
create index on public.hang_sessions(user_id, profile_id);
create index on public.hang_sessions(date desc);
create index on public.projects(user_id, profile_id);
create index on public.injuries(user_id, profile_id);
create index on public.competitions(user_id, profile_id);
create index on public.gym_resets(user_id, profile_id);
create index on public.kudos(session_id);
create index on public.comments(session_id);
create index on public.follows(follower_id);
create index on public.follows(following_id);
