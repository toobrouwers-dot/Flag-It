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
  source text;
begin
  base_username := split_part(new.email, '@', 1);
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
  if length(base_username) < 3 then base_username := 'klimmer'; end if;
  final_username := base_username;
  source := coalesce(new.raw_user_meta_data->>'signup_source', 'direct');
  loop
    begin
      insert into public.accounts(id, username, signup_source) values(new.id, final_username, source);
      exit;
    exception when unique_violation then
      suffix := suffix + 1;
      final_username := base_username || suffix;
    end;
  end loop;
  return new;
end; $$;

-- This function must only fire via the auth trigger, not be callable via the REST API.
revoke execute on function public.handle_new_user() from anon, authenticated;

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

-- ════════════════════════════════════════════════════════════
-- MARKETING ATTRIBUTION
-- Voer dit uit in de Supabase SQL Editor als add-on migratie,
-- vóór (of samen met) de bijgewerkte handle_new_user()-functie
-- hierboven die deze kolom invult.
-- ════════════════════════════════════════════════════════════

alter table public.accounts
  add column if not exists signup_source text default 'direct';

-- Bewust NIET toevoegen aan de "grant select (...)" kolomlijst
-- verderop (zelfde reden als is_admin): alleen leesbaar via de
-- SQL Editor (superuser), niet via de publieke API.
-- Opvragen: select signup_source, count(*) from accounts group by 1 order by 2 desc;

-- ════════════════════════════════════════════════════════════
-- ADS INFRASTRUCTURE
-- Voer dit uit in de Supabase SQL Editor als add-on migratie
-- ════════════════════════════════════════════════════════════

-- Voeg is_admin toe aan accounts (eigenaar zet dit handmatig via dashboard)
alter table public.accounts
  add column if not exists is_admin boolean default false;

-- SECURITY FIX: "accounts_own_write" (regel ~199) staat toe dat een
-- gebruiker elke kolom van zijn eigen accounts-rij update/insert, en
-- "accounts_public_read" (regel ~198) filtert alleen op rijen, niet op
-- kolommen. Zonder onderstaande grants kan iedereen via de API zelf
-- is_admin=true zetten of uitlezen wie admin is.
--
-- LET OP: "revoke select/update (is_admin) ... from anon" (een eerdere
-- versie van deze fix) werkt NIET — Postgres kent geen "deny"-concept,
-- alleen grants. Zolang anon/authenticated een blanket tabelbrede
-- GRANT SELECT/UPDATE hebben (Supabase-default), doet een kolom-
-- specifieke REVOKE niets: de tabelbrede grant blijft alle kolommen
-- dekken. De enige werkende aanpak is het tabelbrede recht helemaal
-- intrekken en dan alleen de veilige kolommen teruggeven.
--
-- De SQL Editor draait als superuser (postgres) en omzeilt grants,
-- dus "eigenaar zet is_admin handmatig via dashboard" blijft werken.
revoke select on public.accounts from authenticated, anon;
grant select (id, username, display_name, emoji, bio, is_public, local_profiles, created_at)
  on public.accounts to authenticated, anon;

revoke update on public.accounts from authenticated, anon;
grant update (username, display_name, bio, is_public)
  on public.accounts to authenticated, anon;

-- De app doet nooit een directe insert in accounts (alleen de
-- handle_new_user()-trigger hieronder, die als security definer draait
-- en grants omzeilt) — zonder deze revoke zou iemand anders hun eigen
-- accounts-rij kunnen verwijderen (toegestaan door accounts_own_write)
-- en een nieuwe kunnen inserten met is_admin=true.
revoke insert on public.accounts from authenticated, anon;

-- Globale app-instellingen (key/value)
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

-- RLS: iedereen leest, alleen admins schrijven
alter table public.app_settings enable row level security;

create policy "Anyone reads settings"
  on public.app_settings for select using (true);

create policy "Admin writes settings"
  on public.app_settings for all
  using (
    exists (
      select 1 from public.accounts
      where id = auth.uid() and is_admin = true
    )
  );

-- Standaardwaarde: ads aan
insert into public.app_settings (key, value)
  values ('ads_enabled', 'true')
  on conflict (key) do nothing;

-- Gesponsorde kaart config (één rij = actieve sponsor)
create table if not exists public.sponsored_card (
  id         int primary key default 1,
  active     boolean default false,
  logo_url   text default '',
  title      text default '',
  cta_text   text default '',
  cta_url    text default '',
  updated_at timestamptz default now(),
  check (id = 1)           -- slechts één rij toegestaan
);

alter table public.sponsored_card enable row level security;

create policy "Anyone reads sponsor"
  on public.sponsored_card for select using (true);

create policy "Admin writes sponsor"
  on public.sponsored_card for all
  using (
    exists (
      select 1 from public.accounts
      where id = auth.uid() and is_admin = true
    )
  );

insert into public.sponsored_card (id, active) values (1, false)
  on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════
-- FEEDBACK
-- Privé kanaal: iedereen mag indienen (ook uitgelogd),
-- alleen de eigenaar (is_admin) mag lezen.
-- ════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid references public.accounts(id) on delete set null,
  message        text not null,
  contact_email  text,
  created_at     timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "feedback_insert_anyone"
  on public.feedback for insert
  with check (true);

create policy "feedback_select_admin_only"
  on public.feedback for select
  using (
    exists (
      select 1 from public.accounts
      where id = auth.uid() and is_admin = true
    )
  );

create index on public.feedback(created_at desc);

-- ════════════════════════════════════════════════════════════
-- ADMIN CHECK RPC
-- Ontbrak in dit schema-bestand terwijl cloud.js er al naar
-- verwijst (rpc('check_is_admin')) — hier alsnog toegevoegd
-- zodat het schema consistent is met de live database.
-- ════════════════════════════════════════════════════════════

create or replace function public.check_is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select is_admin from public.accounts where id = auth.uid()),
    false
  );
$$;

grant execute on function public.check_is_admin() to anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- RLS PERFORMANCE + ONTBREKENDE FK-INDEXES
-- Voer dit uit in de Supabase SQL Editor als add-on migratie.
--
-- 1) Elke RLS policy hieronder riep auth.uid() ongewrapt aan in de
--    using/with check-expressie, wat Postgres dwingt de functie per
--    rij opnieuw te evalueren. Wrapped als (select auth.uid()) wordt
--    de uitkomst één keer gecachet (initPlan) — zelfde gedrag en
--    beveiliging, 5-10x sneller op grotere tabellen. Zie:
--    https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
-- 2) kudos.from_user_id, comments.user_id en feedback.user_id zijn
--    foreign keys naar accounts(id) zonder eigen index — nodig voor
--    een snelle ON DELETE CASCADE / SET NULL bij account-verwijdering
--    (anders full table scan per FK per verwijderd account).
-- ════════════════════════════════════════════════════════════

drop policy if exists "accounts_own_write" on public.accounts;
create policy "accounts_own_write" on public.accounts for all
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "sessions_own" on public.sessions;
create policy "sessions_own" on public.sessions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "gyms_own" on public.gyms;
create policy "gyms_own" on public.gyms for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "goals_own" on public.goals;
create policy "goals_own" on public.goals for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "hang_sessions_own" on public.hang_sessions;
create policy "hang_sessions_own" on public.hang_sessions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "projects_own" on public.projects;
create policy "projects_own" on public.projects for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "injuries_own" on public.injuries;
create policy "injuries_own" on public.injuries for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "competitions_own" on public.competitions;
create policy "competitions_own" on public.competitions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "gym_resets_own" on public.gym_resets;
create policy "gym_resets_own" on public.gym_resets for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "active_plans_own" on public.active_plans;
create policy "active_plans_own" on public.active_plans for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "follows_read" on public.follows;
create policy "follows_read" on public.follows for select using ((select auth.uid()) is not null);
drop policy if exists "follows_insert" on public.follows;
create policy "follows_insert" on public.follows for insert with check (follower_id = (select auth.uid()));
drop policy if exists "follows_delete" on public.follows;
create policy "follows_delete" on public.follows for delete using (follower_id = (select auth.uid()));

drop policy if exists "kudos_insert" on public.kudos;
create policy "kudos_insert" on public.kudos for insert with check (from_user_id = (select auth.uid()));
drop policy if exists "kudos_delete" on public.kudos;
create policy "kudos_delete" on public.kudos for delete using (from_user_id = (select auth.uid()));

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert with check (user_id = (select auth.uid()));
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments for delete using (user_id = (select auth.uid()));

drop policy if exists "Admin writes settings" on public.app_settings;
create policy "Admin writes settings" on public.app_settings for all
  using (exists (select 1 from public.accounts where id = (select auth.uid()) and is_admin = true));

drop policy if exists "Admin writes sponsor" on public.sponsored_card;
create policy "Admin writes sponsor" on public.sponsored_card for all
  using (exists (select 1 from public.accounts where id = (select auth.uid()) and is_admin = true));

drop policy if exists "feedback_select_admin_only" on public.feedback;
create policy "feedback_select_admin_only" on public.feedback for select
  using (exists (select 1 from public.accounts where id = (select auth.uid()) and is_admin = true));

create index if not exists kudos_from_user_id_idx on public.kudos(from_user_id);
create index if not exists comments_user_id_idx on public.comments(user_id);
create index if not exists feedback_user_id_idx on public.feedback(user_id);

-- ════════════════════════════════════════════════════════════
-- GRAAD-KALIBRATOR (F6)
-- Voer dit uit in de Supabase SQL Editor als add-on migratie.
--
-- Geeft ALLEEN geanonimiseerde totalen per (gym, graad) terug: counts,
-- nooit rijen en nooit user_ids. De HAVING-clausule is de
-- k-anonimiteitsdrempel — een combinatie verschijnt pas vanaf 5
-- verschillende klimmers en 30 gelogde routes. Wie niet mee wil tellen
-- zet stats_opt_out aan (schakelaar in Meer) en valt er dan uit.
--
-- Veilig om opnieuw te draaien.
-- ════════════════════════════════════════════════════════════

alter table public.accounts
  add column if not exists stats_opt_out boolean not null default false;

create or replace function public.grade_calibration(p_gym_key text default null)
returns table (
  gym_key      text,
  grade        text,
  sends        bigint,
  routes_total bigint,
  climbers     bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  with exploded as (
    select
      lower(btrim(s.gym))                as gym_key,
      s.user_id                          as user_id,
      rt->>'grade'                       as grade,
      (rt->>'result') in ('top','flash') as sent
    from public.sessions s
    join public.accounts a on a.id = s.user_id
    cross join lateral jsonb_array_elements(s.routes) as rt
    where a.stats_opt_out = false
      and s.gym is not null
      and btrim(s.gym) <> ''
  )
  select
    e.gym_key,
    e.grade,
    count(*) filter (where e.sent) as sends,
    count(*)                       as routes_total,
    count(distinct e.user_id)      as climbers
  from exploded e
  where e.grade is not null
    and e.grade <> ''
    and (p_gym_key is null or e.gym_key = p_gym_key)
  group by e.gym_key, e.grade
  having count(distinct e.user_id) >= 5
     and count(*) >= 30;
$$;

grant execute on function public.grade_calibration(text) to authenticated;

-- ════════════════════════════════════════════════════════════
-- GYM BETA BOARD (F10)
-- Voer dit uit in de Supabase SQL Editor als add-on migratie.
--
-- Gedeelde route-beta per gym. gym_key = lower(btrim(gymnaam)) en
-- koppelt klimmers van dezelfde gym aan elkaar; gyms zijn vrije tekst
-- per gebruiker, dus zonder die normalisatie zijn "Monk" en "monk "
-- twee verschillende gyms.
--
-- Veilig om opnieuw te draaien.
-- ════════════════════════════════════════════════════════════

create table if not exists public.gym_beta (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.accounts(id) on delete cascade not null,
  gym_key    text not null,                  -- lower(btrim(gymnaam))
  gym_label  text not null default '',       -- naam zoals de plaatser hem schreef
  grade      text not null default '',
  color      text not null default '',       -- greepkleur
  sector     text not null default '',
  body       text not null,                  -- de beta zelf, max 500 tekens
  hidden     boolean not null default false, -- admin-moderatie
  created_at timestamptz default now()
);

-- Lengtebegrenzing server-side, niet alleen in de UI
alter table public.gym_beta drop constraint if exists gym_beta_body_len;
alter table public.gym_beta
  add constraint gym_beta_body_len check (char_length(body) between 1 and 500);

-- Hoofdquery: beta van één gym, nieuwste eerst
create index if not exists gym_beta_gym_key_idx
  on public.gym_beta (gym_key, created_at desc);

-- Index op de foreign key, net als bij kudos/comments/feedback
create index if not exists gym_beta_user_id_idx
  on public.gym_beta (user_id);

alter table public.gym_beta enable row level security;

-- auth.uid() staat gewrapt in (select ...) zodat Postgres hem één keer
-- evalueert in plaats van per rij — zelfde patroon als de policies hierboven.
drop policy if exists "gym_beta_read"       on public.gym_beta;
drop policy if exists "gym_beta_insert_own" on public.gym_beta;
drop policy if exists "gym_beta_update_own" on public.gym_beta;
drop policy if exists "gym_beta_delete_own" on public.gym_beta;
drop policy if exists "gym_beta_admin_all"  on public.gym_beta;

-- Ingelogde gebruikers lezen niet-verborgen beta
create policy "gym_beta_read" on public.gym_beta for select
  using (hidden = false and (select auth.uid()) is not null);

-- Je plaatst alleen onder je eigen naam
create policy "gym_beta_insert_own" on public.gym_beta for insert
  with check (user_id = (select auth.uid()));

-- Je bewerkt en verwijdert alleen je eigen beta
create policy "gym_beta_update_own" on public.gym_beta for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "gym_beta_delete_own" on public.gym_beta for delete
  using (user_id = (select auth.uid()));

-- Admin mag alles: verbergen en verwijderen
create policy "gym_beta_admin_all" on public.gym_beta for all
  using (public.check_is_admin()) with check (public.check_is_admin());
