-- Run this in Supabase SQL Editor. RLS is enabled on every table: even if
-- application code has a bug, Postgres itself blocks unauthorized access.

create extension if not exists "pgcrypto";

-- ============ USERS ============
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  mobile_number text unique not null,
  password_hash text not null,
  email_verified boolean not null default false,
  mobile_verified boolean not null default false,
  verification_tier text not null default 'unverified'
    check (verification_tier in ('unverified','basic','verified','trusted')),
  profile_picture_url text,
  is_admin boolean not null default false,
  strike_count int not null default 0,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users enable row level security;

-- Safe to re-run: adds these columns if this schema was already applied
-- before they existed (create table if not exists skips existing tables).
alter table users add column if not exists is_admin boolean not null default false;
alter table users add column if not exists strike_count int not null default 0;
alter table users add column if not exists is_banned boolean not null default false;

create policy "Users can read own row"
  on users for select
  using (auth.uid() = id);

create policy "Users can update own row"
  on users for update
  using (auth.uid() = id);

-- ============ OTP REQUESTS ============
create table if not exists otp_requests (
  mobile_number text not null,
  purpose text not null check (purpose in ('signup','login','reset_password')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (mobile_number, purpose)
);

alter table otp_requests enable row level security;
-- Intentionally no policies: default-deny for all non-service-role access.

-- ============ COMMUNITIES ============
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  category text not null,
  creator_id uuid references users(id),
  member_count int not null default 0,
  is_archived boolean not null default false,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table communities enable row level security;

create policy "Anyone can view non-archived communities"
  on communities for select
  using (is_archived = false);

create index if not exists idx_communities_category on communities(category);
create index if not exists idx_communities_last_activity on communities(last_activity_at);

-- ============ COMMUNITY MEMBERS ============
create table if not exists community_members (
  user_id uuid not null references users(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  normalized_city text,
  local_group_id uuid,
  joined_at timestamptz not null default now(),
  primary key (user_id, community_id)
);

alter table community_members enable row level security;

create policy "Members can see who else is in a community"
  on community_members for select
  using (true);

create index if not exists idx_members_community_city
  on community_members(community_id, normalized_city);

-- ============ LOCAL SUB-GROUPS ============
-- Auto-created once > 88 members from the same normalized_city join a
-- parent community. Deduplicated by (community_id, normalized_city).
create table if not exists local_groups (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  normalized_city text not null,
  member_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (community_id, normalized_city)
);

alter table local_groups enable row level security;

create policy "Anyone can view local groups"
  on local_groups for select
  using (true);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_local_group'
  ) then
    alter table community_members
      add constraint fk_local_group foreign key (local_group_id) references local_groups(id);
  end if;
end $$;

-- ============ POSTS ============
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  is_removed boolean not null default false,
  comment_count int not null default 0,
  upvote_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table posts enable row level security;

create policy "Anyone can view non-removed posts"
  on posts for select
  using (is_removed = false);

create index if not exists idx_posts_community on posts(community_id, created_at desc);
create index if not exists idx_posts_author on posts(author_id);

-- ============ COMMENTS ============
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null,
  is_removed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;

create policy "Anyone can view non-removed comments"
  on comments for select
  using (is_removed = false);

create index if not exists idx_comments_post on comments(post_id, created_at asc);

-- ============ REPORTS ============
-- reporter_id is stored (needed for abuse-of-reporting checks and pattern
-- analysis) but NEVER returned to the reported user or other members —
-- enforced by omitting it from every non-admin API response, and by RLS
-- default-deny below (no select policy = no client-role access at all).
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user')),
  target_id uuid not null,
  reason_category text not null
    check (reason_category in (
      'harassment','hate_speech','spam','misinformation',
      'inappropriate_content','impersonation','other'
    )),
  description text,
  severity text not null default 'low' check (severity in ('low','medium','high')),
  status text not null default 'pending'
    check (status in ('pending','actioned','dismissed')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
-- No select/insert/update policies defined: default-deny for every
-- non-service-role client. All access goes through the backend, which uses
-- the service role key and enforces admin-only reads in ReportsService.

create index if not exists idx_reports_target on reports(target_type, target_id);
create index if not exists idx_reports_status on reports(status, severity);

-- ============ STRIKES ============
-- One row per confirmed violation, tied to the report that triggered it.
-- A user's total strike_count (on the users table) drives the 3-strike
-- suspension — not a community vote.
create table if not exists strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  report_id uuid not null references reports(id),
  reason_category text not null,
  issued_by uuid references users(id),
  created_at timestamptz not null default now()
);

alter table strikes enable row level security;
-- Default-deny, same reasoning as reports.

create index if not exists idx_strikes_user on strikes(user_id);
