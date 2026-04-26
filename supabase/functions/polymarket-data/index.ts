try { await import("https://deno.land/x/xhr@0.1.0/mod.ts"); } catch { /* XHR polyfill optional */ }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Use npm: specifier to reduce cold-start/esm.sh related boot instability.
import { createClient } from "npm:@supabase/supabase-js@2";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DATA_API_BASE = "https://data-api.polymarket.com";
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

function parseTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'number') {
    const ms = value < 10000000000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === 'string') {
    // numeric string unix seconds/millis
    if (/^\d+$/.test(value)) {
      const num = Number(value);
      const ms = num < 10000000000 ? num * 1000 : num;
      return new Date(ms).toISOString();
    }
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Extract user_id from JWT for RLS-protected wallet operations
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Method 1: Try supabase.auth.getUser first (validates token)
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          userId = user.id;
          console.log(`[polymarket-data] Authenticated user via getUser: ${userId}`);
        } else {
          // Method 2: Fallback - decode JWT payload directly (for ES256 tokens)
          // JWT format: header.payload.signature
          const parts = token.split('.');
          if (parts.length === 3) {
            try {
              const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              const payloadJson = atob(payloadBase64);
              const payload = JSON.parse(payloadJson);
              if (payload.sub) {
                userId = payload.sub;
                console.log(`[polymarket-data] Authenticated user via JWT decode: ${userId}`);
              }
            } catch (decodeErr) {
              console.log('[polymarket-data] JWT decode error:', decodeErr);
            }
          }
          if (!userId && error) {
            console.log(`[polymarket-data] Auth error: ${error.message}`);
          }
        }
      } catch (e) {
        console.log('[polymarket-data] Could not extract user from token:', e);
      }
    } else {
      console.log('[polymarket-data] No valid Authorization header found');
    }

    const body = await req.json();
    const action = body.action;
    // Support params nested or flat in body
    const params = body.params || body;
    console.log(`Polymarket Data API: ${action}`, params);

    let result;

    switch (action) {
      case 'leaderboard': {
        // Proxy for Polymarket Smart Money Leaderboard (browser fetches are blocked)
        const {
          timePeriod = 'WEEK',
          orderBy = 'PNL',
          category = 'OVERALL',
          limit = 50,
        } = params;

        const qs = new URLSearchParams({
          timePeriod: String(timePeriod),
          orderBy: String(orderBy),
          category: String(category),
          limit: String(limit),
        });

        const url = `${DATA_API_BASE}/v1/leaderboard?${qs.toString()}`;
        console.log(`[leaderboard] Fetching: ${url}`);

        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error(`[leaderboard] Upstream ${res.status}: ${text.slice(0, 200)}`);
          throw new Error(`Polymarket leaderboard error: ${res.status}`);
        }

        const data = await res.json();
        const traders = Array.isArray(data) ? data : [];
        console.log(`[leaderboard] Returned ${traders.length} traders`);
        result = { traders };
        break;
      }

      case 'debug_pnl_sources': {
        // Debug: Fetch all P/L related data from Polymarket APIs
        const { wallet_address } = params;
        if (!wallet_address) throw new Error('wallet_address is required');

        console.log(`[debug_pnl_sources] Fetching all P/L sources for ${wallet_address}`);

        // 1. Try /traded endpoint for predictions count
        let traded = null;
        try {
          const tradedRes = await fetch(`${DATA_API_BASE}/traded?user=${wallet_address}`);
          if (tradedRes.ok) traded = await tradedRes.json();
          console.log('[debug_pnl_sources] /traded:', traded);
        } catch (e) { console.log('[debug_pnl_sources] /traded error:', e); }

        // 2. Try profile endpoint (might have P/L)
        let profile = null;
        try {
          const profileRes = await fetch(`https://gamma-api.polymarket.com/profiles?addresses=${wallet_address}`);
          if (profileRes.ok) profile = await profileRes.json();
          console.log('[debug_pnl_sources] /profiles:', JSON.stringify(profile).slice(0, 1000));
        } catch (e) { console.log('[debug_pnl_sources] /profiles error:', e); }

        // 3. Try public-profile endpoint
        let publicProfile = null;
        try {
          const ppRes = await fetch(`https://gamma-api.polymarket.com/public-profile?address=${wallet_address}`);
          if (ppRes.ok) publicProfile = await ppRes.json();
          console.log('[debug_pnl_sources] /public-profile:', JSON.stringify(publicProfile).slice(0, 1000));
        } catch (e) { console.log('[debug_pnl_sources] /public-profile error:', e); }

        // 4. Try /profit-loss endpoint variations including v1/leaderboard
        let profitLoss = null;
        const plEndpoints = [
          `${DATA_API_BASE}/v1/leaderboard?user=${wallet_address}&timePeriod=ALL`,
          `${DATA_API_BASE}/v1/leaderboard?proxyWallet=${wallet_address}&timePeriod=ALL`,
          `${DATA_API_BASE}/profit-loss?user=${wallet_address}`,
          `${DATA_API_BASE}/pnl?user=${wallet_address}`,
          `${DATA_API_BASE}/user-pnl?user=${wallet_address}`,
          `${DATA_API_BASE}/stats?user=${wallet_address}`,
          `${DATA_API_BASE}/user-stats?user=${wallet_address}`,
        ];
        for (const url of plEndpoints) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              // For leaderboard, check if it returned data for this user
              if (Array.isArray(data) && data.length > 0) {
                const userEntry = data.find((d: any) => 
                  d.proxyWallet?.toLowerCase() === wallet_address.toLowerCase() ||
                  d.user?.toLowerCase() === wallet_address.toLowerCase()
                );
                if (userEntry) {
                  profitLoss = { url, data: userEntry, officialPnl: userEntry.pnl };
                  console.log('[debug_pnl_sources] Found Official P/L from leaderboard:', userEntry.pnl);
                  break;
                }
              } else if (data && Object.keys(data).length > 0 && !Array.isArray(data)) {
                profitLoss = { url, data };
                console.log('[debug_pnl_sources] Found P/L:', url, data);
                break;
              }
            }
          } catch (e) { /* ignore */ }
        }

        // 5. Fetch positions (open)
        let positions = [];
        let openPnlSum = 0;
        let openInitialValue = 0;
        let openCurrentValue = 0;
        let redeemableCount = 0;
        let redeemableLoss = 0;
        try {
          const posRes = await fetch(`${DATA_API_BASE}/positions?user=${wallet_address}`);
          if (posRes.ok) {
            positions = await posRes.json();
            for (const p of positions) {
              openPnlSum += parseFloat(p.cashPnl) || 0;
              openInitialValue += parseFloat(p.initialValue) || 0;
              openCurrentValue += parseFloat(p.currentValue) || 0;
              if (p.redeemable) {
                redeemableCount++;
                redeemableLoss += parseFloat(p.cashPnl) || 0;
              }
            }
          }
          console.log('[debug_pnl_sources] /positions count:', positions.length);
        } catch (e) { console.log('[debug_pnl_sources] /positions error:', e); }

        // 6. Fetch ALL closed positions with full pagination
        let closedTotal = 0;
        let closedPnlSum = 0;
        let closedBoughtSum = 0;
        const PAGE_SIZE = 50;
        let offset = 0;
        let hasMore = true;
        try {
          while (hasMore && offset < 10000) {
            const closedRes = await fetch(`${DATA_API_BASE}/v1/closed-positions?user=${wallet_address}&limit=${PAGE_SIZE}&offset=${offset}`);
            if (!closedRes.ok) break;
            
            const closedPage = await closedRes.json();
            if (!Array.isArray(closedPage) || closedPage.length === 0) break;
            
            for (const p of closedPage) {
              closedPnlSum += parseFloat(p.realizedPnl) || 0;
              closedBoughtSum += parseFloat(p.totalBought) || 0;
              closedTotal++;
            }
            
            if (closedPage.length < PAGE_SIZE) hasMore = false;
            offset += closedPage.length;
          }
          console.log('[debug_pnl_sources] /closed-positions TOTAL:', closedTotal, 'P/L:', closedPnlSum);
        } catch (e) { console.log('[debug_pnl_sources] /closed-positions error:', e); }

        // Calculate different P/L methods
        const method1_realized_plus_open = closedPnlSum + openPnlSum;
        const method2_realized_only = closedPnlSum;
        const method3_initial_minus_current = closedBoughtSum + openInitialValue - openCurrentValue - closedPnlSum;

        // Count wins by curPrice = 1 (market resolved in your favor)
        let openWins = 0;
        let closedWins = 0;
        let closedLosses = 0;
        
        for (const p of positions) {
          if (parseFloat(p.curPrice) === 1) openWins++;
        }

        // Re-fetch closed to count wins properly
        offset = 0;
        hasMore = true;
        try {
          while (hasMore && offset < 10000) {
            const closedRes = await fetch(`${DATA_API_BASE}/v1/closed-positions?user=${wallet_address}&limit=${PAGE_SIZE}&offset=${offset}`);
            if (!closedRes.ok) break;
            
            const closedPage = await closedRes.json();
            if (!Array.isArray(closedPage) || closedPage.length === 0) break;
            
            for (const p of closedPage) {
              // Win = curPrice is 1 (market resolved in your favor)
              if (parseFloat(p.curPrice) === 1) closedWins++;
              else closedLosses++;
            }
            
            if (closedPage.length < PAGE_SIZE) hasMore = false;
            offset += closedPage.length;
          }
        } catch (e) { console.log('[debug] closed wins count error:', e); }

        const totalWins = openWins + closedWins;
        const totalPositions = positions.length + closedTotal;
        const polymarketWinRate = totalPositions > 0 ? (totalWins / totalPositions) * 100 : 0;

        result = {
          wallet_address,
          traded,
          publicProfile,
          profitLoss,
          open_positions_count: positions.length,
          open_wins_by_curprice: openWins,
          closed_positions_total: closedTotal,
          closed_wins_by_curprice: closedWins,
          closed_losses: closedLosses,
          total_wins: totalWins,
          total_positions: totalPositions,
          calculated_win_rate_percent: polymarketWinRate,
          open_pnl_sum: openPnlSum,
          closed_pnl_sum: closedPnlSum,
          calc_method1_realized_plus_open: method1_realized_plus_open,
        };
        break;
      }

      case 'fetch_trades': {
        // Fetch recent trades for a market
        const { market_id, limit = 100 } = params;
        
        let url = `${DATA_API_BASE}/trades?limit=${limit}`;
        if (market_id) {
          url += `&market=${market_id}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Data API error: ${response.status}`);
        }

        const trades = await response.json();
        console.log(`Fetched ${trades.length || 0} trades from Data API`);

        // Helper to convert timestamp (unix epoch or ISO string) to ISO string
        const parseTimestampLocal = (ts: any): string => {
          return parseTimestamp(ts);
        };

        // Transform and upsert trades
        const getWallet = (t: any): { maker: string | null; taker: string | null; wallet: string | null } => {
          const maker = t.maker || t.maker_address || t.makerAddress || null;
          const taker = t.taker || t.taker_address || t.takerAddress || null;

          // Data API uses proxyWallet as the primary wallet field
          const wallet =
            t.proxyWallet ||
            t.proxy_wallet ||
            taker ||
            maker ||
            t.wallet_address ||
            t.wallet ||
            t.user ||
            t.trader ||
            t.address ||
            t.proxy_address ||
            null;

          return { maker: maker || wallet, taker: taker || wallet, wallet }; 
        };

        const tradesToInsert = (Array.isArray(trades) ? trades : []).map((t: any) => {
          const w = getWallet(t);

          return {
            id: t.id || t.trade_id || crypto.randomUUID(),
            market_id: t.market || t.market_id || market_id,
            token_id: t.token_id || t.asset_id || null,
            side: (t.side || 'buy').toUpperCase(),
            price: parseFloat(t.price) || 0,
            size: parseFloat(t.size) || parseFloat(t.amount) || 0,
            outcome: t.outcome || null,
            maker: w.maker,
            taker: w.taker,
            wallet_address: w.wallet,
            timestamp: parseTimestampLocal(t.timestamp || t.created_at),
          };
        });

        if (tradesToInsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('trades')
            .upsert(tradesToInsert, { 
              onConflict: 'id',
              ignoreDuplicates: true 
            });

          if (upsertError) {
            console.error('Error upserting trades:', upsertError);
          } else {
            console.log(`Upserted ${tradesToInsert.length} trades`);
          }

          // Extract unique wallet addresses from trades for background sync
          const uniqueWallets = new Set<string>();
          tradesToInsert.forEach((t: any) => {
            if (t.maker) uniqueWallets.add(t.maker);
            if (t.taker) uniqueWallets.add(t.taker);
            if (t.wallet_address) uniqueWallets.add(t.wallet_address);
          });

          // Sync wallet data in background (don't await, fire and forget)
          const walletsToSync = Array.from(uniqueWallets).slice(0, 10); // Limit to 10 to avoid rate limits
          console.log(`Syncing ${walletsToSync.length} wallets in background...`);
          
          // Use waitUntil for background processing
          const syncWallets = async () => {
            for (const walletAddr of walletsToSync) {
              try {
                // Fetch activity for this wallet
                const activityRes = await fetch(
                  `${DATA_API_BASE}/activity?user=${walletAddr}&limit=100`
                );
                
                if (!activityRes.ok) continue;
                
                const activities = await activityRes.json();
                const activityList = Array.isArray(activities) ? activities : [];
                
                if (activityList.length === 0) continue;

                // Calculate stats
                const totalVolume = activityList.reduce((sum: number, a: any) => 
                  sum + (parseFloat(a.size) || 0) * (parseFloat(a.price) || 1), 0
                );

                const last24h = Date.now() - 24 * 60 * 60 * 1000;
                const volume24h = activityList
                  .filter((a: any) => {
                    const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    return ts >= last24h;
                  })
                  .reduce((sum: number, a: any) => 
                    sum + (parseFloat(a.size) || 0) * (parseFloat(a.price) || 1), 0
                  );

                const last7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
                const volume7d = activityList
                  .filter((a: any) => {
                    const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    return ts >= last7d;
                  })
                  .reduce((sum: number, a: any) => 
                    sum + (parseFloat(a.size) || 0) * (parseFloat(a.price) || 1), 0
                  );

                const marketsSet = new Set(activityList.map((a: any) => a.market || a.market_id).filter(Boolean));
                const avgTradeSize = activityList.length > 0 ? totalVolume / activityList.length : 0;

                // Get last activity timestamp
                const lastTs = activityList[0]?.timestamp || activityList[0]?.created_at;
                const lastActive = lastTs ? parseTimestamp(lastTs) : new Date().toISOString();

                // Upsert wallet
                await supabase
                  .from('wallets')
                  .upsert({
                    address: walletAddr,
                    total_volume: totalVolume,
                    volume_24h: volume24h,
                    volume_7d: volume7d,
                    markets_traded: marketsSet.size,
                    avg_trade_size: avgTradeSize,
                    last_active: lastActive,
                  }, { 
                    onConflict: 'address',
                    ignoreDuplicates: false 
                  });

                console.log(`Synced wallet ${walletAddr.slice(0, 8)}... vol24h=$${volume24h.toFixed(0)}`);
              } catch (err) {
                console.error(`Error syncing wallet ${walletAddr}:`, err);
              }
            }
          };

          // Fire background task (don't await)
          syncWallets().catch(err => console.error('Background wallet sync error:', err));
        }

        result = { trades_synced: tradesToInsert.length, raw: trades };
        break;
      }

      case 'fetch_wallet_activity': {
        // Fetch activity for a specific wallet with optional cursor for full history
        const { wallet_address, limit = 500, cursor, deep_fetch = false } = params;
        if (!wallet_address) throw new Error('wallet_address is required');

        // Build market lookup so wallet_activity.market_id matches our internal markets.id
        const { data: dbMarkets } = await supabase
          .from('markets')
          .select('id, condition_id, slug, question');

        const marketLookup = new Map<string, { id: string; question: string }>();
        for (const m of dbMarkets || []) {
          const info = { id: m.id, question: m.question };
          if (m.condition_id) {
            marketLookup.set(String(m.condition_id), info);
            marketLookup.set(String(m.condition_id).toLowerCase(), info);
          }
          marketLookup.set(String(m.id), info);
          if (m.slug) marketLookup.set(String(m.slug), info);
        }

        // Gamma enrichment helper: resolves unknown condition_ids on-the-fly
        const enrichFromGamma = async (conditionId: string) => {
          if (!conditionId || marketLookup.has(conditionId)) return;
          try {
            const res = await fetch(`${GAMMA_API_BASE}/markets?condition_id=${conditionId}&limit=1`);
            if (!res.ok) return;
            const gammaMarkets = await res.json();
            const gm = Array.isArray(gammaMarkets) ? gammaMarkets[0] : gammaMarkets;
            if (!gm?.question) return;
            const info = { id: String(gm.id || conditionId), question: gm.question };
            marketLookup.set(conditionId, info);
            marketLookup.set(conditionId.toLowerCase(), info);
            // Background: persist to markets table
            const outcomes = (() => {
              try {
                if (typeof gm.outcomes === 'string') return JSON.parse(gm.outcomes);
                return Array.isArray(gm.outcomes) ? gm.outcomes : ['Yes', 'No'];
              } catch { return ['Yes', 'No']; }
            })();
            await supabase.from('markets').upsert({
              id: info.id,
              condition_id: conditionId,
              slug: gm.slug || gm.market_slug || conditionId,
              question: gm.question,
              description: gm.description || null,
              outcomes,
              category: gm.category || null,
              end_date: gm.end_date_iso || gm.endDate || null,
              volume: parseFloat(gm.volume) || 0,
              volume_24h: parseFloat(gm.volume24hr) || 0,
              liquidity: parseFloat(gm.liquidity) || 0,
              closed: gm.closed || gm.active === false || false,
            }, { onConflict: 'id', ignoreDuplicates: true });
          } catch (err) {
            console.warn(`[enrich] Gamma fallback failed for ${conditionId.slice(0, 10)}:`, err);
          }
        };

        // Helper to transform and upsert a batch of activities
        let hasLoggedSample = false;
        const transformActivity = (a: any) => {
          const activityType = String(a.type || a.activity_type || 'TRADE').toUpperCase();

          // Log first activity structure for debugging
          if (!hasLoggedSample) {
            console.log('Sample activity structure:', JSON.stringify(a, null, 2));
            hasLoggedSample = true;
          }

          // Extract refs from API
          const slug = a.slug || a.eventSlug || a.market_slug || null;
          const conditionId = a.conditionId || a.condition_id || null;

          // Try to map to our internal markets.id; if not found, keep a stable external ref
          // NOTE: wallet_activity.market_id is NOT guaranteed to exist in our markets table.
          // We still persist a stable market reference (conditionId/slug) so P/L grouping is consistent.
          const rawMarketRef = conditionId || slug;
          const marketInfo = rawMarketRef
            ? (marketLookup.get(String(rawMarketRef)) || marketLookup.get(String(rawMarketRef).toLowerCase()))
            : undefined;

          const marketId = marketInfo?.id || (rawMarketRef ? String(rawMarketRef) : null);

          // Question: prefer API title (always available)
          const marketQuestion = a.title || a.question || marketInfo?.question || a.market_question || null;

          // Outcome
          const outcome = a.outcome || (a.outcomeIndex === 0 ? 'Yes' : a.outcomeIndex === 1 ? 'No' : null) || null;

          // Side inference for REDEEM
          let side = a.side ? String(a.side).toUpperCase() : null;
          if (!side && activityType === 'REDEEM') side = 'SELL';

          const size = parseFloat(a.size) || parseFloat(a.amount) || parseFloat(a.value) || 0;

          // Price inference for REDEEM
          let price = a.price != null ? (parseFloat(a.price) || null) : (a.avg_price != null ? (parseFloat(a.avg_price) || null) : null);
          if (price === null && activityType === 'REDEEM') price = 1.0;

          const ts = parseTimestamp(a.timestamp || a.created_at || a.time);

          // Deterministic signature: include slug/conditionId so we can dedupe even when marketId is NULL
          const signature = [
            wallet_address,
            marketId || (conditionId || slug || ''),
            marketQuestion || '',
            outcome || '',
            side || '',
            price == null ? '' : String(price),
            String(size),
            activityType,
            ts,
          ].join('|');

          return {
            id: crypto.randomUUID(),
            signature,
            wallet_address: wallet_address,
            activity_type: activityType,
            market_id: marketId,
            market_question: marketQuestion,
            outcome,
            side,
            size,
            price,
            is_unusual: false,
            unusual_reason: null,
            timestamp: ts,
          };
        };

        const upsertBatch = async (batch: any[]) => {
          if (batch.length === 0) return;

          // IMPORTANT: wallet_activity has a unique constraint on
          // (wallet_address, market_id, timestamp, size, side). If we upsert on signature only,
          // Postgres can still throw 23505 on the other constraint and abort the whole batch.
          // So we dedupe + upsert on the same composite key.
          const seen = new Set<string>();
          const dedupedBatch = batch.filter((item) => {
            const k = [
              item.wallet_address,
              item.market_id ?? '',
              item.timestamp,
              String(item.size),
              item.side ?? '',
            ].join('|');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

          if (dedupedBatch.length === 0) return;

          const { error: upsertError } = await supabase
            .from('wallet_activity')
            .upsert(dedupedBatch, {
              onConflict: 'wallet_address,market_id,timestamp,size,side',
              ignoreDuplicates: false,
            });

          if (upsertError) {
            console.error('Error upserting wallet activity:', upsertError);
            // Don't fail the whole sync on partial duplicates; deep fetch is idempotent.
          }
        };

        // If not deep_fetch, do simple single-page fetch
        if (!deep_fetch) {
          const response = await fetch(
            `${DATA_API_BASE}/activity?user=${wallet_address}&limit=${limit}`
          );
          if (!response.ok) {
            throw new Error(`Data API error: ${response.status}`);
          }

          const activities = await response.json();
          console.log(`Fetched ${activities.length || 0} activities for wallet ${wallet_address}`);

          // Enrich unknown condition_ids via Gamma before transforming
          const rawActivities = Array.isArray(activities) ? activities : [];
          const unknownCids = [...new Set(
            rawActivities
              .map((a: any) => a.conditionId || a.condition_id)
              .filter((cid: string) => cid && !marketLookup.has(cid))
          )].slice(0, 15);
          if (unknownCids.length > 0) {
            console.log(`[fetch_wallet_activity] Enriching ${unknownCids.length} unknown condition_ids`);
            await Promise.allSettled(unknownCids.map(enrichFromGamma));
          }

          const activityToInsert = rawActivities.map(transformActivity);
          await upsertBatch(activityToInsert);

          result = { activities_synced: activityToInsert.length };
          break;
        }

        // Deep fetch mode: paginated fetching with cursor
        console.log(`Deep fetch for wallet ${wallet_address}, cursor: ${cursor || 'none'}`);
        
        let url = `${DATA_API_BASE}/activity?user=${wallet_address}&limit=${limit}&sortDirection=DESC`;
        if (cursor) {
          // Pagination: Data API supports time bounds via `end` (unix seconds).
          // Subtract 1s to avoid refetching the boundary item.
          const endSeconds = Math.max(0, Math.floor(new Date(cursor).getTime() / 1000) - 1);
          url += `&end=${endSeconds}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Data API error: ${response.status}`);
        }

        const activities = await response.json();
        const activityList = Array.isArray(activities) ? activities : [];
        console.log(`Deep fetch: got ${activityList.length} activities`);

        // Transform and upsert in chunks
        const CHUNK_SIZE = 100;
        const activityToInsert = activityList.map(transformActivity);
        
        for (let i = 0; i < activityToInsert.length; i += CHUNK_SIZE) {
          const chunk = activityToInsert.slice(i, i + CHUNK_SIZE);
          await upsertBatch(chunk);
        }

        // Find oldest timestamp for next cursor
        let oldestTimestamp: string | null = null;
        let hasMore = false;

        if (activityList.length > 0) {
          const timestamps = activityList
            .map((a: any) => parseTimestamp(a.timestamp || a.created_at))
            .sort();
          oldestTimestamp = timestamps[0];
          hasMore = activityList.length >= limit; // If we got full page, likely more exists
        }

        // Update wallet cursor in database
        // FIXED: Count AFTER upsert to get actual stored records (not inflated by duplicates)
        const { count: actualCount, error: countError } = await supabase
          .from('wallet_activity')
          .select('*', { count: 'exact', head: true })
          .eq('wallet_address', wallet_address);

        if (countError) {
          console.error('Error counting wallet activity:', countError);
        }

        const totalLoaded = actualCount || 0;
        console.log(`Wallet ${wallet_address}: ${totalLoaded} total records in DB after upsert`);

        await supabase
          .from('wallets')
          .update({
            activity_cursor: oldestTimestamp,
            activity_loaded_count: totalLoaded, // Use actual DB count, not accumulated
          })
          .eq('address', wallet_address);

        result = {
          activities_synced: activityToInsert.length,
          oldest_timestamp: oldestTimestamp,
          has_more: hasMore,
          total_loaded: totalLoaded,
        };
        break;
      }

      case 'fetch_wallet_positions': {
        // Fetch positions for a wallet (raw, without storing)
        const { wallet_address } = params;
        if (!wallet_address) throw new Error('wallet_address is required');

        const response = await fetch(
          `${DATA_API_BASE}/positions?user=${wallet_address}`
        );
        if (!response.ok) {
          throw new Error(`Data API error: ${response.status}`);
        }

        const positions = await response.json();
        console.log(`Fetched ${positions.length || 0} positions for wallet ${wallet_address}`);

        result = { positions };
        break;
      }

      case 'sync_wallet_positions': {
        // Fetch positions from Polymarket and store in wallet_positions table
        // Support both 'wallet' and 'wallet_address' params for flexibility
        const wallet_address = params?.wallet_address || params?.wallet;
        if (!wallet_address) throw new Error('wallet_address or wallet is required');

        const response = await fetch(
          `${DATA_API_BASE}/positions?user=${wallet_address}`
        );
        if (!response.ok) {
          throw new Error(`Data API error: ${response.status}`);
        }

        const positions = await response.json();
        const positionsList = Array.isArray(positions) ? positions : [];
        console.log(`Syncing ${positionsList.length} positions for wallet ${wallet_address}`);

        if (positionsList.length === 0) {
          result = { positions_synced: 0, total_pnl: 0 };
          break;
        }

        // Transform positions to match our wallet_positions table
        const positionsToUpsert = positionsList.map((p: any) => ({
          wallet_address: wallet_address,
          condition_id: p.conditionId || '',
          asset_id: p.asset || null,
          slug: p.slug || null,
          title: p.title || null,
          outcome: p.outcome || null,
          outcome_index: p.outcomeIndex ?? null,
          size: parseFloat(p.size) || 0,
          avg_price: parseFloat(p.avgPrice) || null,
          cur_price: parseFloat(p.curPrice) || null,
          initial_value: parseFloat(p.initialValue) || null,
          current_value: parseFloat(p.currentValue) || null,
          cash_pnl: parseFloat(p.cashPnl) || 0,
          percent_pnl: parseFloat(p.percentPnl) || 0,
          realized_pnl: parseFloat(p.realizedPnl) || 0,
          total_bought: parseFloat(p.totalBought) || 0,
          redeemable: p.redeemable || false,
          mergeable: p.mergeable || false,
          end_date: p.endDate ? parseTimestamp(p.endDate) : null,
          synced_at: new Date().toISOString(),
        }));

        // Upsert positions (update if exists based on wallet+condition+outcome)
        const { error: upsertError } = await supabase
          .from('wallet_positions')
          .upsert(positionsToUpsert, {
            onConflict: 'wallet_address,condition_id,outcome',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error('Error upserting wallet positions:', upsertError);
          throw upsertError;
        }

        // Calculate total P/L from positions
        const totalPnl = positionsList.reduce((sum: number, p: any) => 
          sum + (parseFloat(p.cashPnl) || 0), 0
        );
        const totalValue = positionsList.reduce((sum: number, p: any) => 
          sum + (parseFloat(p.currentValue) || 0), 0
        );

        // Fetch profile name from Polymarket (image is generated client-side from address hash)
        let profileName: string | null = null;
        try {
          const profileRes = await fetch(`https://gamma-api.polymarket.com/public-profile?address=${wallet_address}`);
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            profileName = profileData?.name || profileData?.pseudonym || null;
          }
        } catch (e) {
          console.log('[sync_wallet_positions] public-profile fetch error:', e);
        }

        console.log(`[sync_wallet_positions] Profile: ${profileName ?? '—'}`);

        // Update wallet with aggregated stats (no profile_image - generated client-side)
        const { error: walletError } = await supabase
          .from('wallets')
          .upsert({
            address: wallet_address,
            pnl: totalPnl,
            ...(profileName ? { label: profileName } : {}),
            profile_image: null, // Clear any old og:image URLs
            updated_at: new Date().toISOString(),
          }, { onConflict: 'address', ignoreDuplicates: false });

        if (walletError) {
          console.error('Error updating wallet pnl:', walletError);
        }

        console.log(`Synced ${positionsToUpsert.length} positions, total P/L: $${totalPnl.toFixed(2)}`);

        // Sync missing markets in background to enable Mkt Vol and Vol% columns
        const conditionIds = [...new Set(positionsToUpsert.map((p: any) => p.condition_id).filter(Boolean))];
        
        if (conditionIds.length > 0) {
          // Check which markets are already in DB
          const { data: existingMarkets } = await supabase
            .from('markets')
            .select('condition_id')
            .in('condition_id', conditionIds);
          
          const existingSet = new Set((existingMarkets || []).map((m: any) => m.condition_id));
          const missingConditionIds = conditionIds.filter((id: string) => !existingSet.has(id));
          
          console.log(`[sync_wallet_positions] Missing markets: ${missingConditionIds.length}/${conditionIds.length}`);
          
          if (missingConditionIds.length > 0) {
            // Helper to safely parse outcomes array
            const parseOutcomes = (outcomes: any): string[] => {
              if (!outcomes) return ['Yes', 'No'];
              if (Array.isArray(outcomes)) return outcomes;
              if (typeof outcomes === 'string') {
                try {
                  const parsed = JSON.parse(outcomes);
                  if (Array.isArray(parsed)) return parsed;
                } catch { /* ignore */ }
              }
              return ['Yes', 'No'];
            };
            
            // Background sync missing markets from Gamma API
            const syncMissingMarkets = async () => {
              let marketsSynced = 0;
              
              for (const conditionId of missingConditionIds.slice(0, 50)) { // Limit to 50 to avoid rate limits
                try {
                  // Gamma API search by condition_id
                  const gammaRes = await fetch(`${GAMMA_API_BASE}/markets?condition_ids=${conditionId}&limit=1`);
                  
                  if (!gammaRes.ok) continue;
                  
                  const gammaMarkets = await gammaRes.json();
                  const market = Array.isArray(gammaMarkets) && gammaMarkets.length > 0 ? gammaMarkets[0] : null;
                  
                  if (!market) {
                    // Try by slug from positions
                    const posWithSlug = positionsToUpsert.find((p: any) => p.condition_id === conditionId && p.slug);
                    if (posWithSlug?.slug) {
                      const slugRes = await fetch(`${GAMMA_API_BASE}/markets?slug=${posWithSlug.slug}&limit=1`);
                      if (slugRes.ok) {
                        const slugMarkets = await slugRes.json();
                        if (Array.isArray(slugMarkets) && slugMarkets.length > 0) {
                          const m = slugMarkets[0];
                          await supabase.from('markets').upsert({
                            id: String(m.id || m.market_id),
                            condition_id: m.conditionId || conditionId,
                            question: m.question || m.title || posWithSlug.title,
                            slug: m.slug || posWithSlug.slug,
                            category: m.category || null,
                            closed: m.closed || false,
                            outcomes: parseOutcomes(m.outcomes),
                            volume: parseFloat(m.volume) || 0,
                            volume_24h: parseFloat(m.volume24hr) || parseFloat(m.volume24h) || 0,
                            liquidity: parseFloat(m.liquidity) || 0,
                            end_date: m.endDateIso || m.end_date_iso || null,
                          }, { onConflict: 'id', ignoreDuplicates: false });
                          marketsSynced++;
                        }
                      }
                    }
                    continue;
                  }
                  
                  // Upsert market from Gamma data
                  const m = market;
                  await supabase.from('markets').upsert({
                    id: String(m.id || m.market_id),
                    condition_id: m.conditionId || conditionId,
                    question: m.question || m.title,
                    slug: m.slug || '',
                    category: m.category || null,
                    closed: m.closed || false,
                    outcomes: parseOutcomes(m.outcomes),
                    volume: parseFloat(m.volume) || 0,
                    volume_24h: parseFloat(m.volume24hr) || parseFloat(m.volume24h) || 0,
                    liquidity: parseFloat(m.liquidity) || 0,
                    end_date: m.endDateIso || m.end_date_iso || null,
                  }, { onConflict: 'id', ignoreDuplicates: false });
                  
                  marketsSynced++;
                } catch (err) {
                  console.error(`[sync_markets] Error syncing market ${conditionId}:`, err);
                }
              }
              
              console.log(`[sync_wallet_positions] Background synced ${marketsSynced} missing markets`);
            };
            
            // Fire background task using EdgeRuntime.waitUntil if available
            if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
              EdgeRuntime.waitUntil(syncMissingMarkets());
            } else {
              syncMissingMarkets().catch(err => console.error('Background market sync error:', err));
            }
          }
        }

        result = { 
          positions_synced: positionsToUpsert.length, 
          total_pnl: totalPnl,
          total_value: totalValue,
        };
        break;
      }

      case 'sync_wallet_pnl': {
        // Incremental P/L sync with persistent cursor for high-volume wallets
        // Uses background processing to avoid timeouts
        const wallet_address = params?.wallet_address || params?.wallet;
        const reset = params?.reset === true; // Force restart from beginning
        if (!wallet_address) throw new Error('wallet_address or wallet is required');

        console.log(`[sync_wallet_pnl] Starting for wallet ${wallet_address} (reset=${reset})`);

        // Fetch predictions count from /traded endpoint (source of truth for Polymarket)
        let tradedCount = 0;
        try {
          const tradedRes = await fetch(`${DATA_API_BASE}/traded?user=${wallet_address}`);
          if (tradedRes.ok) {
            const tradedData = await tradedRes.json();
            tradedCount = tradedData?.traded || 0;
            console.log(`[sync_wallet_pnl] /traded endpoint: ${tradedCount} predictions`);
          }
        } catch (e) {
          console.log('[sync_wallet_pnl] /traded fetch error:', e);
        }

        // Get current sync state from DB
        const { data: walletData } = await supabase
          .from('wallets')
          .select('pnl_sync_offset, pnl_sync_status, realized_pnl, closed_positions_count, biggest_win, win_rate')
          .eq('address', wallet_address)
          .single();

        // CRITICAL: When reset=true, we MUST start fresh
        let startOffset = reset ? 0 : (walletData?.pnl_sync_offset || 0);
        let currentRealizedPnl = reset ? 0 : (walletData?.realized_pnl || 0);
        let currentClosedCount = reset ? 0 : (walletData?.closed_positions_count || 0);
        let currentBiggestWin = reset ? 0 : (walletData?.biggest_win || 0);
        // Derive currentClosedWins from stored win_rate and closed_positions_count
        let currentClosedWins = reset ? 0 : Math.round((walletData?.win_rate || 0) * currentClosedCount);

        // Mark as syncing and reset counters if needed
        // CRITICAL: Include user_id for RLS-protected access
        if (!userId) {
          console.warn('[sync_wallet_pnl] No authenticated user - wallet metrics may not be visible');
        }
        
        await supabase
          .from('wallets')
          .upsert({
            address: wallet_address,
            ...(userId ? { user_id: userId } : {}),
            pnl_sync_status: 'syncing',
            pnl_sync_started_at: new Date().toISOString(),
            pnl_sync_offset: startOffset,
            ...(reset ? { 
              realized_pnl: 0, 
              closed_positions_count: 0,
              biggest_win: 0,
              win_rate: 0,
            } : {}),
          }, { onConflict: 'address' });

        // Background task for incremental processing
        const processInBackground = async () => {
          try {
            let offset = startOffset;
            const PAGE_SIZE = 50;
            const BATCH_SIZE = 500; // Save progress every 500 positions
            const MAX_OFFSET = 100000;
            
            // Start fresh if reset, otherwise continue from previous
            let batchRealizedPnl = reset ? 0 : currentRealizedPnl;
            let batchClosedCount = reset ? 0 : currentClosedCount;
            // CRITICAL: Persist closedWins across batches to fix win_rate=0 bug
            let closedWins = reset ? 0 : currentClosedWins;
            let biggestWin = reset ? 0 : currentBiggestWin;
            let totalClosedBought = 0;
            let hasMore = true;
            let positionsInBatch = 0;

            while (hasMore && offset < MAX_OFFSET) {
              const url = `${DATA_API_BASE}/v1/closed-positions?user=${wallet_address}&limit=${PAGE_SIZE}&offset=${offset}`;
              
              const response = await fetch(url);
              if (!response.ok) {
                console.error(`[sync_wallet_pnl] Fetch failed at offset ${offset}: ${response.status}`);
                break;
              }

              const positions = await response.json();
              const positionsList = Array.isArray(positions) ? positions : [];

              if (positionsList.length === 0) {
                hasMore = false;
                break;
              }

              // Process batch
              for (const pos of positionsList) {
                const realizedPnl = parseFloat(pos.realizedPnl) || 0;
                const totalBought = parseFloat(pos.totalBought) || 0;
                const curPrice = parseFloat(pos.curPrice) || 0;

                batchRealizedPnl += realizedPnl;
                totalClosedBought += totalBought;
                batchClosedCount++;
                positionsInBatch++;

                // Win = curPrice is 1 (market resolved in your favor) - Polymarket methodology
                if (curPrice === 1) {
                  closedWins++;
                }
                // Track biggest win by realizedPnl (for display purposes)
                if (realizedPnl > biggestWin) biggestWin = realizedPnl;
              }

              offset += positionsList.length;

              // Save progress every BATCH_SIZE positions (including closedWins via win_rate)
              if (positionsInBatch >= BATCH_SIZE) {
                // Calculate intermediate win_rate to persist closedWins count
                const intermediateWinRate = batchClosedCount > 0 ? closedWins / batchClosedCount : 0;
                
                await supabase
                  .from('wallets')
                  .update({
                    pnl_sync_offset: offset,
                    realized_pnl: batchRealizedPnl,
                    closed_positions_count: batchClosedCount,
                    biggest_win: biggestWin,
                    win_rate: intermediateWinRate, // Persist closedWins indirectly via win_rate
                    updated_at: new Date().toISOString(),
                  })
                  .eq('address', wallet_address);

                console.log(`[sync_wallet_pnl] Progress saved: ${batchClosedCount} positions, P/L: $${batchRealizedPnl.toFixed(0)}, wins: ${closedWins}, winRate: ${(intermediateWinRate * 100).toFixed(1)}%, offset: ${offset}`);
                positionsInBatch = 0;
              }

              if (positionsList.length < PAGE_SIZE) {
                hasMore = false;
              }
            }

            // Get unrealized P/L from open positions (also need cur_price for win counting)
            const { data: currentPositions } = await supabase
              .from('wallet_positions')
              .select('cash_pnl, current_value, initial_value, cur_price')
              .eq('wallet_address', wallet_address);

            const unrealizedPnl = (currentPositions || []).reduce(
              (sum: number, p: any) => sum + (parseFloat(p.cash_pnl) || 0), 0
            );

            const openPositionsCost = (currentPositions || []).reduce(
              (sum: number, p: any) => sum + (parseFloat(p.initial_value) || 0), 0
            );

            const totalPnl = batchRealizedPnl + unrealizedPnl;
            
            // Win = curPrice is 1 (market resolved in your favor) - Polymarket methodology
            // Open positions with curPrice = 1 are wins (resolved but not yet closed)
            const openWins = (currentPositions || []).filter((p: any) => parseFloat(p.cur_price) === 1).length;
            
            // Total wins = closed wins + open resolved wins
            const totalWins = closedWins + openWins;
            
            // Win rate = wins / total closed positions (only count resolved markets)
            const winRate = batchClosedCount > 0 ? totalWins / batchClosedCount : 0;
            
            // Use /traded count if available, otherwise fallback to our calculation
            const openPositionsCount = (currentPositions || []).length;
            const marketsTraded = tradedCount > 0 ? tradedCount : (batchClosedCount + openPositionsCount);

            // Fetch profile name from Polymarket (image is generated client-side)
            let profileName: string | null = null;
            try {
              const profileRes = await fetch(`https://gamma-api.polymarket.com/public-profile?address=${wallet_address}`);
              if (profileRes.ok) {
                const profileData = await profileRes.json();
                profileName = profileData?.name || profileData?.pseudonym || null;
              }
            } catch (e) {
              console.log('[sync_wallet_pnl] public-profile fetch error:', e);
            }

            console.log(`[sync_wallet_pnl] Profile: ${profileName ?? '—'}, closedWins: ${closedWins}, openWins: ${openWins}, totalWins: ${totalWins}, batchClosedCount: ${batchClosedCount}, winRate: ${(winRate * 100).toFixed(1)}%`);
            // Final update (no profile_image - generated client-side from address hash)
            await supabase
              .from('wallets')
              .update({
                pnl_sync_offset: offset,
                pnl_sync_status: hasMore ? 'syncing' : 'completed',
                pnl_sync_completed_at: hasMore ? null : new Date().toISOString(),
                realized_pnl: batchRealizedPnl,
                unrealized_pnl: unrealizedPnl,
                total_pnl: totalPnl,
                closed_positions_count: batchClosedCount,
                markets_traded: marketsTraded,
                total_buys_usd: totalClosedBought + openPositionsCost,
                win_rate: winRate,
                biggest_win: biggestWin,
                ...(profileName ? { label: profileName } : {}),
                profile_image: null, // Clear any old og:image URLs
                updated_at: new Date().toISOString(),
              })
              .eq('address', wallet_address);

            console.log(`[sync_wallet_pnl] COMPLETED for ${wallet_address}: ${marketsTraded} predictions (from /traded), closed: ${batchClosedCount}, Total P/L: $${totalPnl.toFixed(2)}`);
          } catch (error) {
            console.error(`[sync_wallet_pnl] Background error:`, error);
            await supabase
              .from('wallets')
              .update({ pnl_sync_status: 'error' })
              .eq('address', wallet_address);
          }
        };

        // Start background processing
        EdgeRuntime.waitUntil(processInBackground());

        result = {
          message: 'P/L sync started in background',
          wallet_address,
          starting_offset: startOffset,
          current_realized_pnl: currentRealizedPnl,
          current_closed_count: currentClosedCount,
          traded_from_api: tradedCount,
        };
        break;
      }

      case 'fetch_wallet_stats': {
        // Fetch wallet statistics and update our database
        const { wallet_address } = params;
        if (!wallet_address) throw new Error('wallet_address is required');

        // Fetch positions to calculate stats
        const positionsResponse = await fetch(
          `${DATA_API_BASE}/positions?user=${wallet_address}`
        );
        const positions = positionsResponse.ok ? await positionsResponse.json() : [];

        // Fetch recent activity
        const activityResponse = await fetch(
          `${DATA_API_BASE}/activity?user=${wallet_address}&limit=500`
        );
        const activities = activityResponse.ok ? await activityResponse.json() : [];

        // Calculate time boundaries
        const now = Date.now();
        const last24hMs = now - 24 * 60 * 60 * 1000;
        const last7dMs = now - 7 * 24 * 60 * 60 * 1000;

        // Calculate volume stats
        let totalVolume = 0;
        let volume24h = 0;
        let volume7d = 0;
        const marketSet = new Set<string>();

        for (const a of activities) {
          const size = parseFloat(a.size) || 0;
          const price = parseFloat(a.price) || 1;
          const value = size * price;
          
          totalVolume += value;
          
          const ts = parseTimestamp(a.timestamp || a.created_at);
          const activityTime = new Date(ts).getTime();
          
          if (activityTime >= last24hMs) volume24h += value;
          if (activityTime >= last7dMs) volume7d += value;
          
          if (a.market) marketSet.add(a.market);
        }

        // Calculate avg trade size
        const avgTradeSize = activities.length > 0 ? totalVolume / activities.length : 0;

        // Calculate PnL from positions
        let pnl = 0;
        let wins = 0;
        let losses = 0;
        let biggestWin = 0;

        for (const pos of positions) {
          const positionPnl = parseFloat(pos.pnl) || parseFloat(pos.profit) || 0;
          pnl += positionPnl;
          
          if (positionPnl > 0) {
            wins++;
            if (positionPnl > biggestWin) biggestWin = positionPnl;
          } else if (positionPnl < 0) {
            losses++;
          }
        }

        // Calculate win rate
        const totalTrades = wins + losses;
        const winRate = totalTrades > 0 ? wins / totalTrades : 0;

        // Upsert wallet with all calculated stats
        // CRITICAL: Include user_id for RLS-protected access
        const { error: upsertError } = await supabase
          .from('wallets')
          .upsert({
            address: wallet_address,
            ...(userId ? { user_id: userId } : {}),
            total_volume: totalVolume,
            volume_24h: volume24h,
            volume_7d: volume7d,
            avg_trade_size: avgTradeSize,
            markets_traded: marketSet.size,
            pnl: pnl,
            win_rate: winRate,
            biggest_win: biggestWin,
            is_watched: true,
            last_active: activities[0] ? parseTimestamp(activities[0].timestamp || activities[0].created_at) : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'address' });

        if (upsertError) {
          console.error('Error upserting wallet:', upsertError);
        }

        console.log(`Updated wallet stats: volume=${totalVolume}, pnl=${pnl}, winRate=${winRate}`);

        result = { 
          wallet_address,
          total_volume: totalVolume,
          volume_24h: volume24h,
          volume_7d: volume7d,
          avg_trade_size: avgTradeSize,
          pnl,
          win_rate: winRate,
          biggest_win: biggestWin,
          positions_count: positions.length,
          activities_count: activities.length,
        };
        break;
      }

      case 'fetch_leaderboard': {
        // Fetch top traders from leaderboard
        const { limit = 50 } = params;

        const response = await fetch(`${DATA_API_BASE}/leaderboard?limit=${limit}`);
        if (!response.ok) {
          throw new Error(`Data API error: ${response.status}`);
        }

        const leaderboard = await response.json();
        console.log(`Fetched ${leaderboard.length || 0} traders from leaderboard`);

        // Upsert wallets from leaderboard
        const walletsToInsert = (Array.isArray(leaderboard) ? leaderboard : []).map((l: any) => {
          // Polymarket API returns win_rate as percentage (e.g., 85.71), convert to decimal (0.8571)
          const rawWinRate = parseFloat(l.win_rate) || 0;
          const normalizedWinRate = rawWinRate > 1 ? rawWinRate / 100 : rawWinRate;
          
          return {
            address: l.address || l.user,
            label: l.username || l.name || null,
            total_volume: parseFloat(l.volume) || 0,
            pnl: parseFloat(l.pnl) || parseFloat(l.profit) || 0,
            win_rate: normalizedWinRate || null,
            markets_traded: l.markets_traded || null,
            is_watched: false,
          };
        });

        if (walletsToInsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('wallets')
            .upsert(walletsToInsert, { onConflict: 'address' });

          if (upsertError) {
            console.error('Error upserting leaderboard wallets:', upsertError);
          }
        }

        result = { wallets_synced: walletsToInsert.length, leaderboard };
        break;
      }

      case 'discover_fresh_wallets': {
        // Discovery Engine v2: Multi-source wallet discovery
        const { 
          offset = 0, 
          leaderboard_limit = 100,
          trades_limit = 5000,
          exclude_addresses = []
        } = params;

        console.log(`[Discovery v2] Starting with offset=${offset}, excluding ${exclude_addresses.length} addresses`);

        const excludeSet = new Set((exclude_addresses || []).map((a: string) => a.toLowerCase()));
        const discoveredWallets: Map<string, { volume: number; source: string; pnl?: number }> = new Map();

        // Source 1: Global Leaderboard API with offset
        try {
          // Fetch more than needed to apply offset
          const lbResponse = await fetch(`${DATA_API_BASE}/leaderboard?limit=${leaderboard_limit + offset}`);
          if (lbResponse.ok) {
            const leaderboard = await lbResponse.json();
            const lbArray = Array.isArray(leaderboard) ? leaderboard : [];
            
            // Apply offset to get different tier of traders
            const sliced = lbArray.slice(offset, offset + leaderboard_limit);
            console.log(`[Discovery v2] Leaderboard: fetched ${lbArray.length}, using offset ${offset}, got ${sliced.length}`);

            for (const l of sliced) {
              const addr = (l.address || l.user || '').toLowerCase();
              if (addr && !excludeSet.has(addr)) {
                discoveredWallets.set(addr, {
                  volume: parseFloat(l.volume) || 0,
                  pnl: parseFloat(l.pnl) || parseFloat(l.profit) || 0,
                  source: 'leaderboard'
                });
              }
            }
          }
        } catch (e) {
          console.error('[Discovery v2] Leaderboard error:', e);
        }

        // Source 2: Global trades stream from API (NOT local DB)
        try {
          const tradesResponse = await fetch(`${DATA_API_BASE}/trades?limit=${trades_limit}`);
          if (tradesResponse.ok) {
            const trades = await tradesResponse.json();
            const tradesArray = Array.isArray(trades) ? trades : [];
            console.log(`[Discovery v2] Global trades: fetched ${tradesArray.length}`);

            for (const t of tradesArray) {
              // Extract wallet from trade
              const wallet = (
                t.proxyWallet || 
                t.proxy_wallet || 
                t.taker || 
                t.maker || 
                t.user || 
                t.trader || 
                ''
              ).toLowerCase();

              if (wallet && !excludeSet.has(wallet)) {
                const tradeValue = (parseFloat(t.size) || 0) * (parseFloat(t.price) || 1);
                const existing = discoveredWallets.get(wallet);
                if (existing) {
                  existing.volume += tradeValue;
                } else {
                  discoveredWallets.set(wallet, {
                    volume: tradeValue,
                    source: 'global_trades'
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error('[Discovery v2] Global trades error:', e);
        }

        // Source 3: Recent activity stream for fresh traders
        try {
          const activityResponse = await fetch(`${DATA_API_BASE}/activity?limit=1000`);
          if (activityResponse.ok) {
            const activities = await activityResponse.json();
            const actArray = Array.isArray(activities) ? activities : [];
            console.log(`[Discovery v2] Global activity: fetched ${actArray.length}`);

            for (const a of actArray) {
              const wallet = (
                a.proxyWallet || 
                a.proxy_wallet || 
                a.user || 
                a.trader || 
                ''
              ).toLowerCase();

              if (wallet && !excludeSet.has(wallet)) {
                const actValue = (parseFloat(a.size) || 0) * (parseFloat(a.price) || 1);
                const existing = discoveredWallets.get(wallet);
                if (existing) {
                  existing.volume += actValue;
                } else {
                  discoveredWallets.set(wallet, {
                    volume: actValue,
                    source: 'global_activity'
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error('[Discovery v2] Global activity error:', e);
        }

        // Sort by volume and prepare result
        const sortedWallets = Array.from(discoveredWallets.entries())
          .sort(([, a], [, b]) => b.volume - a.volume)
          .slice(0, 100); // Return top 100 new discoveries

        // Count by source
        const sourceStats = {
          leaderboard: sortedWallets.filter(([, w]) => w.source === 'leaderboard').length,
          global_trades: sortedWallets.filter(([, w]) => w.source === 'global_trades').length,
          global_activity: sortedWallets.filter(([, w]) => w.source === 'global_activity').length,
        };

        console.log(`[Discovery v2] Found ${sortedWallets.length} unique wallets. Sources:`, sourceStats);

        // Upsert discovered wallets to DB
        const walletsToUpsert = sortedWallets.map(([addr, data]) => ({
          address: addr,
          total_volume: data.volume,
          pnl: data.pnl || null,
        }));

        if (walletsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('wallets')
            .upsert(walletsToUpsert, { 
              onConflict: 'address',
              ignoreDuplicates: false 
            });

          if (upsertError) {
            console.error('[Discovery v2] Upsert error:', upsertError);
          }
        }

        result = {
          discovered_count: sortedWallets.length,
          offset_used: offset,
          next_offset: offset + 50,
          source_breakdown: sourceStats,
          wallets: sortedWallets.map(([addr, data]) => ({
            address: addr,
            volume: data.volume,
            source: data.source,
            pnl: data.pnl
          }))
        };
        break;
      }

      case 'backfill_wallets': {
        // Backfill wallet_address for trades that are missing it
        const { limit = 500 } = params;
        
        // Get distinct market_ids that have trades without wallet_address
        const { data: marketsToFix, error: marketsError } = await supabase
          .from('trades')
          .select('market_id')
          .is('wallet_address', null)
          .limit(limit);
        
        if (marketsError) throw marketsError;
        
        const uniqueMarkets = [...new Set((marketsToFix || []).map(t => t.market_id))];
        console.log(`Found ${uniqueMarkets.length} markets with missing wallet data`);
        
        let totalFixed = 0;
        
        for (const marketId of uniqueMarkets.slice(0, 10)) { // Process up to 10 markets
          try {
            // Fetch fresh trades from API
            const response = await fetch(`${DATA_API_BASE}/trades?market=${marketId}&limit=200`);
            if (!response.ok) continue;
            
            const apiTrades = await response.json();
            if (!Array.isArray(apiTrades) || apiTrades.length === 0) continue;
            
            // Build a map of trade_id -> wallet
            const walletMap = new Map<string, string>();
            for (const t of apiTrades) {
              const tradeId = t.id || t.trade_id;
              const wallet = t.taker || t.maker || t.wallet_address || t.user || t.trader || t.proxyWallet;
              if (tradeId && wallet) {
                walletMap.set(tradeId, wallet);
              }
            }
            
            // Get our trades for this market that need fixing
            const { data: ourTrades } = await supabase
              .from('trades')
              .select('id')
              .eq('market_id', marketId)
              .is('wallet_address', null);
            
            if (!ourTrades || ourTrades.length === 0) continue;
            
            // Update each trade
            for (const trade of ourTrades) {
              const wallet = walletMap.get(trade.id);
              if (wallet) {
                await supabase
                  .from('trades')
                  .update({ wallet_address: wallet, taker: wallet })
                  .eq('id', trade.id);
                totalFixed++;
              }
            }
            
            console.log(`Fixed ${totalFixed} trades for market ${marketId}`);
          } catch (e) {
            console.error(`Error fixing market ${marketId}:`, e);
          }
        }
        
        result = { markets_processed: uniqueMarkets.length, trades_fixed: totalFixed };
        break;
      }

      case 'sync_global_activity': {
        // Sync Global Activity Feed: Fetch recent global trades and insert as activity
        const { limit = 500 } = params;
        
        console.log(`[sync_global_activity] Fetching ${limit} global trades...`);
        
        const stats = {
          trades_fetched: 0,
          activities_inserted: 0,
          unusual_count: 0,
          whale_count: 0,
          new_wallets_discovered: 0,
        };
        
        try {
          // Fetch global trades from Polymarket
          const tradesRes = await fetch(`${DATA_API_BASE}/trades?limit=${limit}`);
          if (!tradesRes.ok) {
            throw new Error(`Trades API error: ${tradesRes.status}`);
          }
          
          const trades = await tradesRes.json();
          const tradesArray = Array.isArray(trades) ? trades : [];
          stats.trades_fetched = tradesArray.length;
          
          console.log(`[sync_global_activity] Fetched ${tradesArray.length} trades`);
          
          if (tradesArray.length === 0) {
            result = stats;
            break;
          }
          
          // Get existing wallets to detect new discoveries
          const { data: existingWallets } = await supabase
            .from('wallets')
            .select('address');
          const existingAddressSet = new Set((existingWallets || []).map(w => w.address.toLowerCase()));
          
          // Get market info for enrichment
          const conditionIds = [...new Set(tradesArray.map((t: any) => t.conditionId || t.condition_id).filter(Boolean))];
          const { data: markets } = await supabase
            .from('markets')
            .select('id, condition_id, question')
            .in('condition_id', conditionIds.slice(0, 100));
          
          const marketByCondition = new Map((markets || []).map(m => [m.condition_id, m]));
          
          // Enrich unknown condition_ids via Gamma API (background)
          const unknownConditionIds = conditionIds.filter(cid => !marketByCondition.has(cid)).slice(0, 20);
          if (unknownConditionIds.length > 0) {
            console.log(`[sync_global_activity] Enriching ${unknownConditionIds.length} unknown condition_ids via Gamma`);
            const enrichPromises = unknownConditionIds.map(async (cid: string) => {
              try {
                const res = await fetch(`${GAMMA_API_BASE}/markets?condition_id=${cid}&limit=1`);
                if (!res.ok) return;
                const gammaMarkets = await res.json();
                const gm = Array.isArray(gammaMarkets) ? gammaMarkets[0] : gammaMarkets;
                if (!gm?.question) return;
                
                // Cache in local lookup for current batch
                marketByCondition.set(cid, { id: gm.id || cid, condition_id: cid, question: gm.question });
                
                // Background: upsert into markets table for future lookups
                const outcomes = (() => {
                  try {
                    if (typeof gm.outcomes === 'string') return JSON.parse(gm.outcomes);
                    return Array.isArray(gm.outcomes) ? gm.outcomes : ['Yes', 'No'];
                  } catch { return ['Yes', 'No']; }
                })();
                
                await supabase.from('markets').upsert({
                  id: String(gm.id || cid),
                  condition_id: cid,
                  slug: gm.slug || gm.market_slug || cid,
                  question: gm.question,
                  description: gm.description || null,
                  outcomes,
                  category: gm.category || null,
                  end_date: gm.end_date_iso || gm.endDate || null,
                  volume: parseFloat(gm.volume) || 0,
                  volume_24h: parseFloat(gm.volume24hr) || 0,
                  liquidity: parseFloat(gm.liquidity) || 0,
                  closed: gm.closed || gm.active === false || false,
                }, { onConflict: 'id', ignoreDuplicates: true });
              } catch (err) {
                console.warn(`[enrich] Failed for ${cid.slice(0, 10)}:`, err);
              }
            });
            
            // Await enrichment before processing trades (they need the question)
            await Promise.allSettled(enrichPromises);
          }
          
          // Process trades into activities
          const activities: any[] = [];
          const newWalletAddresses = new Set<string>();
          
          for (const trade of tradesArray) {
            // Extract wallet address with priority
            const walletAddr = (
              trade.proxyWallet ||
              trade.proxy_wallet ||
              trade.taker ||
              trade.maker ||
              trade.user ||
              ''
            ).toLowerCase();
            
            if (!walletAddr || walletAddr.length < 10) continue;
            
            const conditionId = trade.conditionId || trade.condition_id || '';
            const market = marketByCondition.get(conditionId);
            
            const size = parseFloat(trade.size) || 0;
            const price = parseFloat(trade.price) || 0;
            const usdcSize = size * price;
            
            // Determine unusual and whale status
            const isWhale = usdcSize >= 10000;
            const isUnusual = usdcSize >= 5000;
            
            if (isWhale) stats.whale_count++;
            if (isUnusual) stats.unusual_count++;
            
            // Check if this is a new wallet
            if (!existingAddressSet.has(walletAddr)) {
              newWalletAddresses.add(walletAddr);
            }
            
            const timestamp = parseTimestamp(trade.timestamp || trade.createdAt || trade.matchTime);
            const side = (trade.side || 'BUY').toUpperCase();
            const outcome = trade.outcome || (trade.outcomeIndex === 0 ? 'Yes' : trade.outcomeIndex === 1 ? 'No' : null);
            
            // Create deterministic signature for deduplication
            const signature = [
              walletAddr,
              market?.id || conditionId || '',
              market?.question || '',
              outcome || '',
              side,
              price === 0 ? '' : String(price.toFixed(4)),
              String(size.toFixed(4)),
              'TRADE',
              timestamp,
            ].join('|');
            
            activities.push({
              signature,
              wallet_address: walletAddr,
              activity_type: 'TRADE',
              market_id: market?.id || null,
              condition_id: conditionId || null,
              market_question: market?.question || null,
              outcome,
              side,
              size,
              usdc_size: usdcSize,
              price,
              is_unusual: isUnusual,
              unusual_reason: isUnusual ? `Large trade: $${usdcSize.toFixed(0)}` : null,
              timestamp,
              asset_id: trade.assetId || trade.asset_id || null,
              transaction_hash: trade.transactionHash || trade.transaction_hash || null,
            });
          }
          
          console.log(`[sync_global_activity] Processed ${activities.length} activities (${stats.whale_count} whale, ${stats.unusual_count} unusual)`);
          
          // Upsert activities with deduplication
          if (activities.length > 0) {
            const { error, count } = await supabase
              .from('wallet_activity')
              .upsert(activities, {
                onConflict: 'signature',
                ignoreDuplicates: true,
                count: 'exact',
              });
            
            if (error) {
              console.error('[sync_global_activity] Upsert error:', error);
            } else {
              stats.activities_inserted = count || activities.length;
            }
          }
          
          // Create wallet records for new discoveries (background)
          stats.new_wallets_discovered = newWalletAddresses.size;
          if (newWalletAddresses.size > 0) {
            const newWallets = Array.from(newWalletAddresses).slice(0, 50).map(addr => ({
              address: addr,
              is_watched: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
            
            EdgeRuntime.waitUntil(
              (async () => {
                const { error } = await supabase
                  .from('wallets')
                  .upsert(newWallets, { onConflict: 'address', ignoreDuplicates: true });
                if (error) console.error('[sync_global_activity] Wallet upsert error:', error);
                else console.log(`[sync_global_activity] Created ${newWallets.length} new wallet records`);
              })()
            );
          }
          
          console.log(`[sync_global_activity] Done:`, stats);
          result = stats;
          
        } catch (e) {
          console.error('[sync_global_activity] Error:', e);
          throw e;
        }
        break;
      }

      case 'refresh_wallet_metrics': {
        // API-First: Fetch FRESH metrics directly from Polymarket APIs
        // CRITICAL FIX: Use official leaderboard API for total_pnl (accurate for ALL wallets)
        const wallet_address = params?.wallet_address || params?.wallet;
        if (!wallet_address) throw new Error('wallet_address or wallet is required');

        console.log(`[refresh_wallet_metrics] Fetching fresh data for ${wallet_address}`);

        // 1. Fetch OFFICIAL P/L from leaderboard API (source of truth)
        // This is the ONLY accurate source for total P/L - matches Polymarket UI exactly
        let officialPnl: number | null = null;
        let officialVolume: number | null = null;
        let officialRank: number | null = null;
        try {
          const leaderboardUrl = `${DATA_API_BASE}/v1/leaderboard?user=${wallet_address}&timePeriod=ALL`;
          console.log(`[refresh_wallet_metrics] Fetching official P/L from: ${leaderboardUrl}`);
          const leaderboardRes = await fetch(leaderboardUrl);
          if (leaderboardRes.ok) {
            const leaderboardData = await leaderboardRes.json();
            if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
              // Find the user entry (matches by proxyWallet or user)
              const userEntry = leaderboardData.find((d: any) => 
                d.proxyWallet?.toLowerCase() === wallet_address.toLowerCase() ||
                d.user?.toLowerCase() === wallet_address.toLowerCase()
              );
              if (userEntry) {
                officialPnl = parseFloat(userEntry.pnl) || null;
                officialVolume = parseFloat(userEntry.volume) || null;
                officialRank = userEntry.rank || null;
                console.log(`[refresh_wallet_metrics] Official P/L from leaderboard: $${officialPnl?.toFixed(2)}, volume: $${officialVolume?.toFixed(2)}, rank: ${officialRank}`);
              }
            }
          }
        } catch (e) {
          console.log('[refresh_wallet_metrics] leaderboard fetch error:', e);
        }

        // 2. Fetch profile data (name, etc)
        let profileName: string | null = null;
        try {
          const profileRes = await fetch(`${GAMMA_API_BASE}/public-profile?address=${wallet_address}`);
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            profileName = profileData?.name || profileData?.pseudonym || null;
          }
        } catch (e) {
          console.log('[refresh_wallet_metrics] profile fetch error:', e);
        }

        // 3. Fetch predictions count from /traded endpoint (official count)
        let tradedCount = 0;
        try {
          const tradedRes = await fetch(`${DATA_API_BASE}/traded?user=${wallet_address}`);
          if (tradedRes.ok) {
            const tradedData = await tradedRes.json();
            tradedCount = tradedData?.traded || 0;
          }
        } catch (e) {
          console.log('[refresh_wallet_metrics] /traded fetch error:', e);
        }

        // 4. Fetch current positions for unrealized P/L
        let openPositions: any[] = [];
        let unrealizedPnl = 0;
        let positionsValue = 0;
        let openPositionsCount = 0;
        try {
          const posRes = await fetch(`${DATA_API_BASE}/positions?user=${wallet_address}`);
          if (posRes.ok) {
            openPositions = await posRes.json();
            openPositions = Array.isArray(openPositions) ? openPositions : [];
            openPositionsCount = openPositions.length;
            
            for (const p of openPositions) {
              unrealizedPnl += parseFloat(p.cashPnl) || 0;
              positionsValue += parseFloat(p.currentValue) || 0;
            }
          }
        } catch (e) {
          console.log('[refresh_wallet_metrics] /positions fetch error:', e);
        }

        // 5. Fetch closed positions for win rate and biggest win
        // Note: For wallets >10K positions, win rate is approximate (based on first 10K)
        const PAGE_SIZE = 50;
        const MAX_PAGES = 200; // Max 10,000 closed positions
        let offset = 0;
        let hasMore = true;
        let closedCount = 0;
        let closedWins = 0;
        let realizedPnlCalculated = 0; // Only used as fallback if leaderboard API fails
        let biggestWin = 0;

        try {
          while (hasMore && offset < PAGE_SIZE * MAX_PAGES) {
            const url = `${DATA_API_BASE}/v1/closed-positions?user=${wallet_address}&limit=${PAGE_SIZE}&offset=${offset}`;
            const response = await fetch(url);
            
            if (!response.ok) break;
            
            const positions = await response.json();
            const positionsList = Array.isArray(positions) ? positions : [];
            
            if (positionsList.length === 0) break;

            for (const pos of positionsList) {
              const posRealizedPnl = parseFloat(pos.realizedPnl) || 0;
              const curPrice = parseFloat(pos.curPrice) || 0;

              realizedPnlCalculated += posRealizedPnl;
              closedCount++;

              // Win = curPrice is 1 (Polymarket methodology)
              if (curPrice === 1) closedWins++;
              
              // Track biggest win
              if (posRealizedPnl > biggestWin) biggestWin = posRealizedPnl;
            }

            offset += positionsList.length;
            if (positionsList.length < PAGE_SIZE) hasMore = false;
          }
        } catch (e) {
          console.log('[refresh_wallet_metrics] closed-positions fetch error:', e);
        }

        // Count open wins (resolved but not closed)
        const openWins = openPositions.filter(p => parseFloat(p.curPrice) === 1).length;
        const totalWins = closedWins + openWins;
        
        // Calculate win rate (wins / closed positions)
        const winRate = closedCount > 0 ? totalWins / closedCount : 0;
        
        // CRITICAL: Use OFFICIAL P/L from leaderboard API (accurate for all wallets)
        // Fallback to calculated value only if leaderboard API fails
        const totalPnl = officialPnl !== null ? officialPnl : (realizedPnlCalculated + unrealizedPnl);
        const totalVolume = officialVolume;
        
        // For realized_pnl, use official P/L minus unrealized if available
        const realizedPnl = officialPnl !== null ? (officialPnl - unrealizedPnl) : realizedPnlCalculated;
        
        // Markets traded = /traded count or fallback
        const marketsTraded = tradedCount > 0 ? tradedCount : (closedCount + openPositionsCount);

        console.log(`[refresh_wallet_metrics] Results: officialPnl=$${officialPnl?.toFixed(2) || 'N/A'}, calculatedPnl=$${realizedPnlCalculated.toFixed(2)}, winRate=${(winRate * 100).toFixed(1)}%, biggestWin=$${biggestWin.toFixed(2)}, closedCount=${closedCount}`);

        // 6. Fetch existing wallet data to preserve valid metrics
        const { data: existingWallet } = await supabase
          .from('wallets')
          .select('win_rate, biggest_win, markets_traded, closed_positions_count, realized_pnl, total_pnl, total_volume')
          .eq('address', wallet_address)
          .maybeSingle();

        // CRITICAL: Only update fields if new value is better/valid
        // This prevents overwriting good data with empty API responses
        const shouldUpdateWinRate = closedCount > 0 || !existingWallet?.win_rate;
        const shouldUpdateBiggestWin = biggestWin > 0 || !existingWallet?.biggest_win;
        const shouldUpdateMarketsTraded = marketsTraded > 1 || !existingWallet?.markets_traded;
        const shouldUpdateClosedCount = closedCount > 0 || !existingWallet?.closed_positions_count;
        const shouldUpdateVolume = totalVolume !== null || !existingWallet?.total_volume;

        console.log(`[refresh_wallet_metrics] Update decisions: winRate=${shouldUpdateWinRate}, biggestWin=${shouldUpdateBiggestWin}, markets=${shouldUpdateMarketsTraded}, closed=${shouldUpdateClosedCount}, volume=${shouldUpdateVolume}`);

        // CRITICAL: Include user_id for RLS-protected access
        if (!userId) {
          console.warn('[refresh_wallet_metrics] No authenticated user - wallet metrics may not be visible');
        }
        
        // Build metrics payload
        const metricsData = {
          ...(profileName ? { label: profileName } : {}),
          markets_traded: shouldUpdateMarketsTraded ? marketsTraded : (existingWallet?.markets_traded || marketsTraded),
          win_rate: shouldUpdateWinRate ? winRate : (existingWallet?.win_rate || winRate),
          realized_pnl: realizedPnl !== 0 ? realizedPnl : (existingWallet?.realized_pnl || realizedPnl),
          unrealized_pnl: unrealizedPnl,
          total_pnl: officialPnl !== null ? totalPnl : (existingWallet?.total_pnl || totalPnl),
          total_volume: shouldUpdateVolume && totalVolume !== null ? totalVolume : (existingWallet?.total_volume || null),
          biggest_win: shouldUpdateBiggestWin ? biggestWin : (existingWallet?.biggest_win || biggestWin),
          closed_positions_count: shouldUpdateClosedCount ? closedCount : (existingWallet?.closed_positions_count || closedCount),
          pnl_sync_status: 'completed',
          pnl_sync_completed_at: new Date().toISOString(),
          pnl_sync_offset: offset > 0 ? offset : (existingWallet?.closed_positions_count || offset),
          updated_at: new Date().toISOString(),
        };

        // Strategy: UPDATE by (address, user_id) first, then INSERT if no rows updated
        // This ensures metrics are saved to the correct user's wallet record
        let saveError = null;
        
        if (userId) {
          // Try to update existing wallet for THIS user
          const { data: updated, error: updateErr } = await supabase
            .from('wallets')
            .update(metricsData)
            .eq('address', wallet_address)
            .eq('user_id', userId)
            .select()
            .maybeSingle();
          
          if (updateErr) {
            console.error('[refresh_wallet_metrics] Update error:', updateErr);
            saveError = updateErr;
          } else if (updated) {
            console.log('[refresh_wallet_metrics] Updated existing wallet for user:', userId);
          } else {
            // No wallet exists for this user+address combo - insert new
            console.log('[refresh_wallet_metrics] No wallet found for user, inserting new record');
            const { error: insertErr } = await supabase
              .from('wallets')
              .insert({
                address: wallet_address,
                user_id: userId,
                is_watched: true, // If we're refreshing metrics, user wants to track this wallet
                ...metricsData,
              });
            
            if (insertErr) {
              // Handle unique constraint violation - wallet exists but maybe without user_id
              if (insertErr.code === '23505') {
                console.log('[refresh_wallet_metrics] Conflict on insert, trying update without user_id filter');
                // Fallback: update existing wallet and set user_id
                const { error: fallbackErr } = await supabase
                  .from('wallets')
                  .update({ ...metricsData, user_id: userId })
                  .eq('address', wallet_address);
                
                if (fallbackErr) {
                  console.error('[refresh_wallet_metrics] Fallback update error:', fallbackErr);
                  saveError = fallbackErr;
                } else {
                  console.log('[refresh_wallet_metrics] Fallback update succeeded - claimed wallet for user');
                }
              } else {
                console.error('[refresh_wallet_metrics] Insert error:', insertErr);
                saveError = insertErr;
              }
            } else {
              console.log('[refresh_wallet_metrics] Inserted new wallet record');
            }
          }
        } else {
          // No userId - use legacy upsert (not recommended, metrics won't be visible via RLS)
          console.warn('[refresh_wallet_metrics] No userId - falling back to address-only upsert');
          const { error: upsertErr } = await supabase
            .from('wallets')
            .upsert({
              address: wallet_address,
              ...metricsData,
            }, { onConflict: 'address' });
          
          if (upsertErr) {
            console.error('[refresh_wallet_metrics] Legacy upsert error:', upsertErr);
            saveError = upsertErr;
          }
        }

        if (saveError) {
          throw saveError;
        }

        result = {
          wallet_address,
          label: profileName,
          markets_traded: marketsTraded,
          win_rate: winRate,
          win_rate_percent: (winRate * 100).toFixed(1),
          realized_pnl: realizedPnl,
          unrealized_pnl: unrealizedPnl,
          total_pnl: totalPnl,
          total_volume: totalVolume,
          biggest_win: biggestWin,
          positions_value: positionsValue,
          closed_count: closedCount,
          open_count: openPositionsCount,
          closed_wins: closedWins,
          open_wins: openWins,
          total_wins: totalWins,
          // Metadata about data source
          pnl_source: officialPnl !== null ? 'leaderboard_api' : 'calculated',
          official_pnl: officialPnl,
          calculated_pnl: realizedPnlCalculated + unrealizedPnl,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Polymarket Data error:', error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
