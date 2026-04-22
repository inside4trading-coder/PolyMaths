
## Problem

You enabled Lovable Cloud, which created a fresh, empty backend. The previous database (with `markets`, `tokens`, `wallets`, `positions`, `agent_predictions`, etc.) no longer exists. That's why:

1. **Positions Radar shows no data** — the `positions`, `wallets`, and `markets` tables don't exist in the new backend.
2. **Sync & Discover does nothing** — the edge functions try to write to tables that aren't there.
3. **The build is broken** — `src/integrations/supabase/types.ts` was regenerated empty, so every `supabase.from('markets')`, `.from('tokens')`, `.from('wallets')`, etc. throws TypeScript errors (`Argument of type '"markets"' is not assignable to parameter of type 'never'`).

The app code (UI, hooks, edge functions) is fully intact — only the database schema is missing.

## Plan: Recreate the database schema

I'll create a single migration that rebuilds every table the app references, with proper RLS, indexes, and the helper structures the edge functions expect.

### Tables to create

Inferred from the edge functions and components:

- **`markets`** — id, condition_id, question, description, slug, outcomes (jsonb), category, tags (jsonb), end_date, volume, volume_24h, liquidity, liquidity_score, closed, created_at, updated_at
- **`tokens`** — id, market_id, outcome, price, updated_at
- **`wallets`** — address (pk), label, owner_user_id, is_whale, created_at, updated_at
- **`positions`** — id, wallet_address, market_id, token_id, outcome, size, avg_price, current_price, realized_pnl, unrealized_pnl, status, updated_at
- **`watchlist`** — user_id, wallet_address (per-user wallet tracking)
- **`agent_predictions`** — id, market_id, market_question, recommendation, confidence, analysis, model_used, tokens_used, created_at
- **`market_sentiment`** — id, market_id, score, signals (jsonb), created_at
- **`rag_signals`** — id, market_id, headline, source, url, sentiment, summary, created_at
- **`bot_sessions`**, **`bot_orders`**, **`bot_positions`**, **`bot_signals`** — bot builder/monitor tables
- **`agent_configs`** — per-user agent settings
- **`wallet_activity`**, **`wallet_sparklines`**, **`wallet_winrates`** — wallet analytics caches

### Roles & RLS

- `app_role` enum (`admin`, `user`) + `user_roles` table + `has_role()` security-definer function (per the security guidelines).
- RLS on every table:
  - **Public read** for market data (`markets`, `tokens`, `agent_predictions`, `market_sentiment`, `rag_signals`) — needed so the radar works without login.
  - **Per-user** for `watchlist`, `bot_sessions`, `agent_configs` (only owner can read/write).
  - **Authenticated read + service-role write** for `wallets`, `positions`, `wallet_activity` (edge functions use service role to populate, users read).

### Auth

The `Index.tsx` redirects to `/` when the user isn't logged in, but `Auth.tsx` already exists. I'll verify the auth flow still works against the new backend (no schema changes needed on `auth.*`), and ensure the user can sign up and reach `/dashboard`.

### After migration

1. `src/integrations/supabase/types.ts` regenerates automatically from the new schema → all 200+ TS errors disappear.
2. The "Sync & Discover" button calls `sync-markets` / `backfill-markets` edge functions, which will populate `markets` + `tokens` from the Polymarket Gamma API.
3. To see positions in the radar, you'll add a wallet via Wallet Intel → it gets stored in `watchlist` → the position-sync edge functions populate `positions`.

### What I will NOT change

- No UI changes. No edge function logic changes (they already target the right table names).
- No removal of existing features.

### Technical notes

- Use `gen_random_uuid()` for primary keys where the source ID isn't external.
- Use `jsonb` for `outcomes`, `tags`, `signals` (matches the `ensureArray` helper in edge functions).
- Add indexes on `positions(wallet_address)`, `positions(market_id)`, `tokens(market_id)`, `markets(closed, volume_24h)` for radar query performance.
- Triggers: `updated_at` auto-update on `markets`, `tokens`, `positions`, `wallets`.
- No CHECK constraints with `now()` (per guidelines) — use validation triggers if needed.

### Steps

1. Run the migration to create all tables, enums, RLS policies, indexes, and triggers.
2. Wait for `types.ts` to regenerate → build errors clear.
3. You log in (or sign up) → click **Sync & Discover** → markets populate.
4. Add a wallet in **Wallet Intel** → positions populate in the radar.
