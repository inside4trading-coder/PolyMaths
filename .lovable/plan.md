## Problem

The **Leaderboard** tab in PolyAgents shows "No traders found / 0 / $0". Browser network logs show:

```
GET https://data-api.polymarket.com/v1/leaderboard?...
Origin: https://...lovableproject.com
Error: Failed to fetch
```

Server-side `curl` to the same URL returns valid data (200, `access-control-allow-origin: *`), so the API itself works. The browser request is being blocked at the network layer — same root cause as the previously fixed `SystemHealth` "Offline" issue. The fix pattern is the same: **proxy via an edge function**.

A scan of the rest of PolyAgents confirms this is the **only** broken module:

| Tab | Data source | Status |
|---|---|---|
| Analyzer | `polymarket-agents` edge fn (Lovable AI) | OK |
| RAG | `rag-news-signals` edge fn | OK |
| **Leaderboard** | **Direct browser fetch to `data-api.polymarket.com`** | **BROKEN** |
| Forecast | `markets`/`tokens`/`rag_signals` tables | OK |
| Sentiment | `sentiment-tracker` edge fn + `market_sentiment` table | OK |
| History | `agent_predictions` table | OK |

A scan of `src/` shows Leaderboard is the only client-side direct call to `polymarket.com` REST APIs (the orderbook WebSocket is unaffected).

## Fix

### 1. Add a `polymarket-leaderboard` action to the existing `polymarket-data` edge function

Server-side proxy that:
- Accepts `{ timePeriod, orderBy, category, limit }`
- Calls `https://data-api.polymarket.com/v1/leaderboard?...`
- Returns the JSON array unchanged
- Uses standard CORS headers
- 60s in-memory cache to avoid hammering the upstream

(Adding a case to the existing function is simpler than a new function, and `polymarket-data` already has the right CORS + base URL setup.)

### 2. Update `SmartMoneyLeaderboard.tsx`

Replace the direct `fetch()` with `supabase.functions.invoke('polymarket-data', { body: { action: 'leaderboard', params: { timePeriod, orderBy, category, limit: 50 } } })`.

Keep all UI, filters, stats, and detail panel logic identical — only the data fetch changes.

### 3. Minor cleanup

- Fix the React warning `Function components cannot be given refs` from `Skeleton` inside `SmartMoneyLeaderboard` by wrapping the `Skeleton` component with `React.forwardRef` in `src/components/ui/skeleton.tsx` (low priority but visible in console).

## Verification

After deploy:
1. Open `/dashboard` → PolyAgents → Leaderboard
2. Stats cards populate (Top Traders ~50, Total Profit, Volume, Avg Profit)
3. List of traders renders with avatars, ranks, P/L
4. Switching Today/Week/Month/All Time and Profit/Volume re-fetches correctly
5. Selecting a trader opens the right-hand profile panel with working Polymarket / PolygonScan links
