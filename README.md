# SoulSync Backend — v0.3 (Auth + Communities + Posts/Comments)

Phased build. Built so far: secure signup/login, mobile OTP, communities
(create/join/leave, 88-member local auto-split), and a posts/comments feed.
Report system and inactivity/archival job are next.

## Stack
- **NestJS (TypeScript)** — structured, testable, enforces good patterns
- **Supabase (Postgres)** — free tier, Row-Level Security enabled on every table
- **JWT** (access + refresh tokens) for sessions
- **bcrypt** for password hashing (12 rounds)
- **helmet + throttler + class-validator** for hardening

## Setup (zero-cost)

1. Create a free Supabase project at supabase.com
2. In Supabase → SQL Editor, run `supabase/schema.sql`
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and two separate JWT secrets (generate with
   `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
4. `npm install && npm run start:dev`

## Endpoints so far

**Auth**
- `POST /auth/signup` — email, mobileNumber (E.164), password
- `POST /auth/verify-otp` — completes signup, returns JWTs
- `POST /auth/login`

**Users**
- `GET /users/me` (auth required)

**Communities**
- `GET /communities` (`?category=`)
- `GET /communities/:id`
- `POST /communities` (auth required — creator gets no special mod rights)
- `POST /communities/:id/join` (optional `city` — feeds local auto-split at 88 members)
- `DELETE /communities/:id/leave`

**Posts & Comments**
- `GET /communities/:id/posts` (`?limit=&before=` for pagination)
- `POST /communities/:id/posts` (must be a member)
- `GET /posts/:id`
- `DELETE /posts/:id` (author-only)
- `GET /posts/:id/comments`
- `POST /posts/:id/comments` (must be a member)
- `DELETE /comments/:id` (author-only)

Every new post/comment updates the parent community's `last_activity_at` —
this feeds the 180-day inactivity/archive system (not yet built).

## Security decisions baked in
- RLS on every table — DB-level enforcement, not just app-level checks
- Service role key never leaves the backend (`config/supabase.provider.ts`)
- OTP codes hashed (SHA-256), 10-min expiry, 5-attempt cap, single-use
- Passwords hashed with bcrypt (12 rounds)
- Generic error messages on login/signup (no account enumeration)
- Global rate limiting + tighter limits on OTP verify and login
- Strict input validation — unknown fields rejected outright
- CORS locked to configured frontend origin only

## Known limitations (flagged, not hidden)
- Member/comment counters use read-then-write, not atomic — fine at current
  scale, replace with a Postgres function if concurrency grows
- OTP delivery is stubbed (logs to console, no real SMS yet)
- Posting/commenting requires community membership — an assumption, not
  explicitly in the original spec; flag if open posting is wanted instead

## Next phases
- Report system (3-strike review, anonymous reporter identity, severity escalation)
- Inactivity job (150/175/180-day warnings, archive, 1-year hard delete)
- Payments module
- Tiered identity verification (profile picture + liveness check)
