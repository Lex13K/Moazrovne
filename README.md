# Moazrovne

Moazrovne is a private-data quiz + rating web app built with **Vite + React**, backed by **Supabase Auth**, **Supabase Postgres**, and **Supabase Storage**.

The repository is safe to keep **public** because it contains **only code** and **scraping scripts**. The actual dataset (questions + images) is stored in **private Supabase Storage buckets** and is accessible only to authenticated users.

---

## Contents

- [High-level architecture](#high-level-architecture)
- [Supabase resources](#supabase-resources)
- [Storage buckets and policies](#storage-buckets-and-policies)
- [Database table and RLS](#database-table-and-rls)
- [Game mode — Supabase backend reference (already provisioned)](#game-mode--supabase-backend-reference-already-provisioned)
- [Question stats backend patch (manual SQL)](#question-stats-backend-patch-manual-sql)
- [How the app works](#how-the-app-works)
- [Repo structure](#repo-structure)
- [Local development](#local-development)
- [Dataset scraping and publishing](#dataset-scraping-and-publishing)
- [GitHub Actions workflows](#github-actions-workflows)
- [Secrets and configuration](#secrets-and-configuration)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Operational notes](#operational-notes)
- [Troubleshooting](#troubleshooting)

---

## High-level architecture

### Frontend
- Built with **Vite + React** (`web/`).
- Users sign in with **Supabase Auth** (email + password).
- The app has two modes after login:
  1. **Rating Mode** (legacy): rates unseen questions exactly as before.
  2. **Game Mode** (party multiplayer): create/join by code, pick rated questions, play synchronized rounds.
- Both modes stay mounted in the UI when switching tabs, so party/game state is preserved while users temporarily switch to Rating Mode to rate more questions.

### Data pipeline
- Python scripts scrape and generate the dataset:
  - `fetch_new_questions.py` scrapes moazrovne.net and appends to `data/moazrovne_dataset.csv`
  - `convertor.py` converts the CSV into `data/moazrovne_dataset.json`
- The dataset and images are uploaded to Supabase Storage by GitHub Actions.
- A separate “CI state” CSV is stored in a dedicated private bucket `ci` so the scraper can resume where it left off.

### Security goals
- No dataset or images are committed to GitHub.
- No credentials are committed or shipped to the browser.
- The browser uses only Supabase public keys and authenticated access.
- CI uses a Supabase **service role key** to upload to Storage (never shipped to users).

---

## Supabase resources

### Required buckets
All buckets are **Private**:

- `questions`
  - `questions.json`
- `images`
  - `qid_<id>.jpg` (or png/webp if you download those formats)
- `ci`
  - `moazrovne_dataset.csv` (CI-only state)

### Required Auth
- Supabase Auth enabled with Email/Password.
- Users must sign in to load the dataset.

---

## Storage buckets and policies

Storage objects are protected by RLS policies on `storage.objects`.

Recommended minimal policies:

1) Allow authenticated users to read only `questions/questions.json`:
```sql
create policy "auth read questions.json"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'questions'
  and name = 'questions.json'
);
```

2) Allow authenticated users to read images (needed for `createSignedUrl`):
```sql
create policy "auth read images qid_*"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'images'
  and name like 'qid_%'
);
```

3) `ci` bucket should have **no policies** for `anon` or `authenticated`
- This keeps the CSV inaccessible to normal users.
- GitHub Actions uses the service role key which bypasses RLS.

No client-side upload policies should exist for `questions` or `images`.

---

## Database table and RLS

### `ratings` table (current contract)
The app stores per-user ratings of questions and depends on this shape:

- `user_id uuid` (FK to `auth.users.id`)
- `question_id int4`
- `rating int2`
- `created_at timestamptz`
- `updated_at timestamptz`
- unique/composite key on `(user_id, question_id)` (required by frontend upsert conflict target)

RLS requirements:
- `select` only own rows (`auth.uid() = user_id`)
- `insert` only own rows (`with check auth.uid() = user_id`)
- `update` only own rows (`using` + `with check`)

---

## Game mode — Supabase backend reference (already provisioned)

This project’s game backend has already been created in Supabase. Treat this section as the **current contract** (not a “run this to create” checklist).

Use this section when:
- reviewing how the live backend works
- debugging drift between code and database
- setting up a **new** Supabase project to mirror production

---

### Current object inventory

**Tables (public schema):**
- `user_profiles`
- `parties`
- `party_members`
- `game_sessions`
- `game_player_state`
- `game_picks`
- `game_rounds`
- `game_events`

**Functions:**
- helper: `is_party_member(uuid)`
- RPCs: `create_party(int)`, `join_party(text)`, `start_game(uuid)`, `submit_picks(uuid, int[])`, `begin_game(uuid)`, `reveal_answer(uuid, int)`, `next_round(uuid)`

**Realtime publication membership:**
- `public.parties`
- `public.party_members`
- `public.game_sessions`
- `public.game_player_state`
- `public.game_events`

---

### Behavioral contract (what these objects enforce)

- Party code is generated server-side in `create_party`.
- Only `lobby` parties accept new members (`join_party`).
- Leader controls `start_game`, `begin_game`, and `next_round`.
- Every player must submit exactly `questions_per_player` picks in `submit_picks`.
- Picks must come from that player’s own `ratings`.
- `begin_game` shuffles picks into `game_rounds`.
- Any member can call `reveal_answer` for self; reveal notifications are emitted through `game_events`.

---

### Policy contract (RLS)

- RLS is enabled on all game tables.
- Core read policies are membership-based.
- `party_members` and `parties` policies rely on `is_party_member(uuid)` to avoid recursive policy evaluation.
- RPC writes are `security definer` and must have `grant execute ... to authenticated`.

---

### Drift checks (read-only verification queries)

Use these SQL checks to confirm current state matches code expectations.

**1) Tables exist**
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'user_profiles','parties','party_members',
    'game_sessions','game_player_state','game_picks',
    'game_rounds','game_events'
  )
order by table_name;
```

Expected: **8 rows**.

**2) RLS is enabled**
```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'user_profiles','parties','party_members',
    'game_sessions','game_player_state','game_picks',
    'game_rounds','game_events'
  )
order by relname;
```

Expected: `relrowsecurity = true` for all rows.

**3) Functions exist**
```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'is_party_member',
    'create_party','join_party','start_game',
    'submit_picks','begin_game','reveal_answer','next_round'
  )
order by routine_name;
```

Expected: **8 rows**.

**4) RPC execute grants are present**
```sql
select routine_name, grantee
from information_schema.role_routine_grants
where specific_schema = 'public'
  and grantee = 'authenticated'
  and routine_name in (
    'is_party_member',
    'create_party','join_party','start_game',
    'submit_picks','begin_game','reveal_answer','next_round'
  )
order by routine_name, grantee;
```

Expected: all listed routines appear with `grantee = authenticated`.

**5) Realtime publication contains required tables**
```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'parties','party_members','game_sessions','game_player_state','game_events'
  )
order by tablename;
```

Expected: **5 rows**.

---

### Canonical object summary

| Object | Type | Purpose |
|---|---|---|
| `user_profiles` | Table | Display names for players |
| `parties` | Table | Lobby with invite code |
| `party_members` | Table | Party membership |
| `game_sessions` | Table | Session state and current index |
| `game_player_state` | Table | Per-player ready flag |
| `game_picks` | Table | Questions selected by each user |
| `game_rounds` | Table | Shuffled ordered rounds |
| `game_events` | Table | Reveal/next event stream |
| `is_party_member` | SQL function | Non-recursive membership helper for RLS |
| `create_party` | RPC | Create lobby and leader membership |
| `join_party` | RPC | Join lobby by code |
| `start_game` | RPC | Leader transitions lobby -> picking and opens session |
| `submit_picks` | RPC | Validate and store exact-N picks |
| `begin_game` | RPC | Leader starts active game with shuffled rounds |
| `reveal_answer` | RPC | Player reveal notification event |
| `next_round` | RPC | Leader advances or finishes session |
| `get_user_question_stats` | RPC | Per-user stats: rating, first/last rated, play count, last played |
| `set_updated_at` | Trigger function | Auto-refreshes `ratings.updated_at` on every UPDATE |

---

## Question stats backend patch (manual SQL)

Use this section when a Supabase project has game mode but is missing the stats functionality used by:
- Picks screen metadata/sorting
- History tab metadata/sorting
- Reliable `last_rated_at` updates after re-rating

Run these SQL blocks in Supabase SQL Editor.

### Block 1 — Auto-update `ratings.updated_at` on every rating change

Without this trigger, `updated_at` may stay equal to `created_at`, and `last_rated_at` will not reflect re-rates.

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Idempotent: only creates the trigger if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'ratings_set_updated_at'
      and tgrelid = 'public.ratings'::regclass
  ) then
    execute '
      create trigger ratings_set_updated_at
      before update on public.ratings
      for each row execute function public.set_updated_at()
    ';
  end if;
end;
$$;
```

### Block 2 — Create the `get_user_question_stats` RPC

Returns one row per question the calling user has rated or played.

```sql
create or replace function public.get_user_question_stats()
returns table (
  question_id    int,
  rating         int2,
  first_rated_at timestamptz,
  last_rated_at  timestamptz,
  played_count   bigint,
  last_played_at timestamptz
)
language sql security definer stable as $$

  -- Questions rated by this user (plus any play data)
  select
    r.question_id,
    r.rating,
    r.created_at                       as first_rated_at,
    r.updated_at                       as last_rated_at,
    coalesce(p.play_count, 0)::bigint  as played_count,
    p.last_played_at
  from public.ratings r
  left join (
    select
      gr.question_id,
      count(*)::bigint   as play_count,
      max(gs.created_at) as last_played_at
    from public.game_rounds gr
    join public.game_sessions gs
      on gs.id = gr.session_id
    join public.game_player_state gps
      on gps.session_id = gs.id
      and gps.user_id = auth.uid()
    where gs.status in ('active', 'finished')
    group by gr.question_id
  ) p on p.question_id = r.question_id
  where r.user_id = auth.uid()

  union all

  -- Questions played by this user but never rated
  select
    p2.question_id,
    null::int2          as rating,
    null::timestamptz   as first_rated_at,
    null::timestamptz   as last_rated_at,
    p2.play_count,
    p2.last_played_at
  from (
    select
      gr.question_id,
      count(*)::bigint   as play_count,
      max(gs.created_at) as last_played_at
    from public.game_rounds gr
    join public.game_sessions gs
      on gs.id = gr.session_id
    join public.game_player_state gps
      on gps.session_id = gs.id
      and gps.user_id = auth.uid()
    where gs.status in ('active', 'finished')
    group by gr.question_id
  ) p2
  where not exists (
    select 1 from public.ratings r2
    where r2.user_id = auth.uid()
      and r2.question_id = p2.question_id
  );

$$;
```

### Block 3 — Grant execute

```sql
grant execute on function public.get_user_question_stats() to authenticated;
```

### Verify

**Trigger exists**
```sql
select tgname, tgrelid::regclass
from pg_trigger
where tgname = 'ratings_set_updated_at';
```

**Function grant exists**
```sql
select routine_name, grantee
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name = 'get_user_question_stats'
  and grantee = 'authenticated';
```

**Rating range supports 1-10**
```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.ratings'::regclass
  and contype = 'c';
```

If the active rating check is still `<= 5`, replace it with:
```sql
alter table public.ratings drop constraint ratings_rating_check;

alter table public.ratings
  add constraint ratings_rating_range check (rating >= 1 and rating <= 10);
```

---

## How the app works

Frontend flow:
1. User signs in.
2. App downloads questions from Storage:
   - bucket: `questions`
   - object: `questions.json`
3. App fetches user ratings from Postgres (`ratings` table).
4. App shows three tabs (all stay mounted so switching never loses state):
   - **Rating Mode**: pick unseen question, reveal answer, rate 1–10, upsert into `ratings`.
   - **Game Mode**: create/join party, pick `N` rated questions, ready up, then play live rounds.
   - **History**: all questions the user has rated or played, with rating/date/play metadata and inline re-rating.
5. The picks screen inside Game Mode shows rating, play count, last-rated date, and last-played date for each question, plus sort controls.

Game mode detail:
1. Leader creates party with `questions_per_player` and shares code.
2. Friends join by code (only while party status is `lobby`).
3. Leader starts game -> party becomes `picking`, a session is created.
4. Each player submits exactly `N` picks from their own rated questions.
5. Leader begins game once all are ready; picks are shuffled into `game_rounds`.
6. During each round:
   - everyone sees question text + author identity
   - any player can reveal answer for themselves
   - others receive reveal notification event
   - only leader can advance to next round
7. Session finishes when all rounds are exhausted.

---

## Repo structure

```
Moazrovne/
├─ .github/
│  └─ workflows/
│     ├─ update_dataset.yml        # scrape + upload dataset/images to Supabase Storage
│     └─ deploy_pages.yml          # build + deploy frontend to GitHub Pages
├─ web/
│  ├─ src/
│  │  ├─ api/
│  │  │  ├─ ratings.js
│  │  │  ├─ storage.js
│  │  │  └─ game.js
│  │  ├─ components/
│  │  │  ├─ Auth.jsx
│  │  │  ├─ RatingMode.jsx
│  │  │  ├─ HistoryMode.jsx
│  │  │  └─ game/
│  │  │     ├─ GameMode.jsx
│  │  │     ├─ HomeScreen.jsx
│  │  │     ├─ Lobby.jsx
│  │  │     ├─ PicksScreen.jsx
│  │  │     ├─ RoundScreen.jsx
│  │  │     └─ GameOver.jsx
│  │  ├─ lib/
│  │  │  └─ supabaseClient.js
│  │  ├─ App.jsx
│  │  └─ main.jsx
│  ├─ vite.config.js
│  ├─ package.json
│  └─ package-lock.json
├─ fetch_new_questions.py
├─ convertor.py
├─ requirements.txt
└─ .gitignore
```

Notes:
- `data/` exists locally/CI but is gitignored and never committed.
- `docs/` is not used (Pages deployment via Actions artifacts).

---

## Local development

### Prerequisites
- Node.js 20+
- Python 3.10+
- Supabase project (Auth + Storage + Postgres table)

### Frontend dev server
From repo root:
```bash
cd web
npm ci
npm run dev
```

Create `web/.env` (never commit it):
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Running the scraper locally (optional)
From repo root:
```bash
python -m venv .venv
# activate venv
pip install -r requirements.txt
python fetch_new_questions.py
python convertor.py
```

This writes to local:
- `data/moazrovne_dataset.csv`
- `data/moazrovne_dataset.json`
- `data/html/` cache
- `data/images/` downloaded images

These are for local use only and should remain untracked.

---

## Dataset scraping and publishing

The dataset update workflow:
1. Downloads `ci/moazrovne_dataset.csv` (if present)
2. Runs `fetch_new_questions.py`
3. Runs `convertor.py`
4. Uploads:
   - `data/moazrovne_dataset.csv` → `ci/moazrovne_dataset.csv`
   - `data/moazrovne_dataset.json` → `questions/questions.json`
   - `data/images/*` → `images/*`

Scraper notes:
- Uses HTTP endpoint (`http://moazrovne.net/q/<id>`) due to HTTPS certificate issues.
- Sleeps between requests for politeness.
- Maintains an HTML cache so it can resume without re-fetching pages already stored locally/CI.
- Stop rule uses `MAX_MISSING = 40` past a `BUFFER_ID` threshold (currently 3000).

---

## GitHub Actions workflows

### 1) update_dataset.yml (scheduled/manual)
Purpose: scrape + upload to Supabase Storage, no commits.

Required secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Bucket expectations:
- `ci` exists and is private
- `questions` exists and is private
- `images` exists and is private

### 2) deploy_pages.yml (on push/manual)
Purpose: build and deploy `web/` to GitHub Pages via GitHub Actions.

Required secrets:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Also uses `VITE_BASE_PATH` in CI so Vite builds correct asset URLs for Pages.

---

## Secrets and configuration

### Frontend (public)
The browser uses:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are not “secret” in the traditional sense (anon/public key), but they should still be stored as GitHub Secrets for convenience.

### CI only (secret)
GitHub Actions uses:
- `SUPABASE_SERVICE_ROLE_KEY`

This key must never be committed and must never be shipped to the browser.

---

## Deployment (GitHub Pages)

The frontend is deployed via GitHub Actions Pages deployment.

To confirm:
- Repo → Settings → Pages → Source: **GitHub Actions**
- Latest `deploy_pages.yml` workflow run succeeded

Site URL format:
- `https://<user>.github.io/<repo>/`

---

## Operational notes

### Data leakage prevention
- Dataset and images never committed to GitHub.
- `web/public/questions.json` must not exist.
- `data/` must remain ignored and untracked.
- No workflow should commit build output or scraped artifacts.

### Performance
Currently the app downloads the full `questions.json` after login.
- This is acceptable for moderate dataset sizes.
- If it grows large, consider sharding or an API-based paging model.

---

## Troubleshooting

### Site loads but shows an error after login
- Confirm Storage policies allow authenticated users to read `questions.json` and `qid_*` images.
- Confirm `questions/questions.json` exists in Storage.
- Confirm `images/` contains the expected filenames.

### Images don’t show
- Confirm `current.image === 1` is set for those questions.
- Confirm the image exists as `qid_<id>.jpg` in `images` bucket.
- Confirm authenticated `select` policy on `images` bucket.
- Signed URLs are short-lived; reloading should regenerate a fresh URL.

### Dataset workflow runs but uploads nothing
- Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets are set.
- Confirm the `ci` bucket exists.
- Confirm the scraper produced `data/moazrovne_dataset.csv` and `data/moazrovne_dataset.json`.

### Local dev can’t access Supabase
- Ensure `web/.env` exists and Vite restarted after editing.
- Confirm project URL/key are correct.
- Confirm user account exists and email/password login is enabled.

### `party_members` queries return 500
- Cause: recursive policy on `party_members` selecting from itself.
- Fix: use `public.is_party_member(uuid)` in `party_members` and `parties` policies (see **Policy contract (RLS)** in the game backend reference section).

### RPC calls fail with unclear UI error (`[object Object]`)
- Ensure RPC execute grants exist for `authenticated` (see **Drift checks -> RPC execute grants are present**).
- The frontend now renders Supabase error messages via `e?.message ?? String(e)`.

### User loses party after switching to Rating Mode
- This was fixed by keeping both mode components mounted in `App.jsx` and hiding inactive one with CSS.
- If this regression returns, verify tabs are not conditionally unmounting `GameMode`.

---
