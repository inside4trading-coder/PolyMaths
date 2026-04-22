import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GAMMA_API = 'https://gamma-api.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

interface BotConfig {
  id: string;
  user_id: string;
  name: string;
  mode: 'paper' | 'live';
  status: 'running' | 'paused' | 'stopped';
  wallets: string[];
  categories: string[];
  signal_min_trade_size: number;
  signal_min_liquidity_score: number;
  signal_max_spread: number;
  signal_cluster_trigger: boolean;
  signal_cluster_min_trades: number;
  signal_cluster_window_minutes: number;
  last_signal_scan_at: string;
}

interface WalletActivity {
  id: string;
  wallet_address: string;
  activity_type: string;
  market_id: string | null;
  market_question: string | null;
  outcome: string;
  side: string;
  size: number;
  usdc_size: number | null;
  price: number;
  timestamp: string;
  condition_id: string | null;
  asset_id: string | null;
}

interface Signal {
  activity: WalletActivity;
  reasons: string[];
  score: number;
}

// ── Sync recent activity for a list of wallets ──────────────────────
async function syncWalletActivity(
  supabase: any,
  wallets: string[],
  sinceISO: string
): Promise<number> {
  let totalSynced = 0;

  for (const wallet of wallets) {
    try {
      const url = `${DATA_API}/activity?user=${wallet}&limit=100`;
      console.log(`[activity-sync] Fetching: ${url}`);
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) {
        console.warn(`[activity-sync] Failed to fetch for ${wallet.slice(0, 10)}...: ${resp.status}`);
        continue;
      }

      const raw = await resp.json();
      const items = Array.isArray(raw) ? raw : [];

      if (items.length === 0) continue;

      // Filter to trades after sinceISO
      const sinceTs = new Date(sinceISO).getTime();
      const fresh = items.filter((t: any) => {
        // API returns epoch seconds — convert to ms for comparison
        const rawTs = t.timestamp ? Number(t.timestamp) : 0;
        const ts = rawTs > 1e12 ? rawTs : rawTs * 1000; // handle both seconds and ms
        return ts > sinceTs;
      });

      if (fresh.length === 0) {
        console.log(`[activity-sync] ${wallet.slice(0, 10)}...: 0 new trades since ${sinceISO}`);
        continue;
      }

      const rows = fresh.map((t: any) => {
        const size = parseFloat(t.size || t.amount || '0');
        const price = parseFloat(t.price || '0');
        // Always compute usdc_size: prefer API value, fallback to size*price
        const rawUsdc = t.usdcSize ? parseFloat(t.usdcSize) : null;
        const computedUsdc = size > 0 && price > 0 ? size * price : null;
        const usdcSize = rawUsdc || computedUsdc;
        const rawSide = (t.side || '').toUpperCase();
        const side = rawSide === 'BUY' || rawSide === 'SELL' ? rawSide : 'BUY';
        // Capture all activity types: TRADE, SPLIT, REDEEM, CONVERSION, MERGE, etc.
        const activityType = t.type || 'TRADE';
        
        return {
          wallet_address: wallet,
          activity_type: activityType,
          market_id: t.market || t.marketId || null,
          market_question: t.title || t.question || t.marketQuestion || null,
          outcome: t.outcome || 'Unknown',
          side: side === 'BUY' || side === 'SELL' ? side : 'BUY',
          size,
          usdc_size: usdcSize,
          price,
          timestamp: t.timestamp ? new Date((Number(t.timestamp) > 1e12 ? Number(t.timestamp) : Number(t.timestamp) * 1000)).toISOString() : new Date().toISOString(),
          condition_id: t.conditionId || t.condition_id || null,
          asset_id: t.assetId || t.asset_id || null,
          signature: t.transactionHash || t.id || `${wallet}-${t.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          is_unusual: usdcSize ? usdcSize >= 5000 : false,
          unusual_reason: usdcSize && usdcSize >= 10000 ? 'Whale trade' : usdcSize && usdcSize >= 5000 ? 'Large trade' : null,
          transaction_hash: t.transactionHash || null,
        };
      });

      const { error, count } = await supabase
        .from('wallet_activity')
        .upsert(rows, { onConflict: 'signature', ignoreDuplicates: true, count: 'exact' });

      if (error) {
        console.warn(`[activity-sync] Upsert error for ${wallet.slice(0, 10)}...:`, error.message);
      } else {
        const synced = count || rows.length;
        totalSynced += synced;
        console.log(`[activity-sync] ${wallet.slice(0, 10)}...: synced ${synced} trades`);
      }
    } catch (e) {
      console.error(`[activity-sync] Error for ${wallet.slice(0, 10)}...:`, e);
    }
  }

  return totalSynced;
}

// ── Resolve market by condition_id ──────────────────────────────────
async function resolveMarketByConditionId(
  supabase: any,
  conditionId: string,
  cache: Record<string, any>
): Promise<any | null> {
  if (cache[conditionId]) return cache[conditionId];

  const { data: localMarket } = await supabase
    .from('markets')
    .select('id, condition_id, question, liquidity_score, category, closed, end_date')
    .eq('condition_id', conditionId)
    .limit(1)
    .single();

  if (localMarket) {
    cache[conditionId] = localMarket;
    return localMarket;
  }

  try {
    const url = `${GAMMA_API}/markets?condition_id=${conditionId}&limit=1`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;

    const markets = await resp.json();
    if (!Array.isArray(markets) || markets.length === 0) return null;

    const gm = markets[0];
    const marketData = {
      id: gm.id || gm.condition_id,
      condition_id: gm.condition_id,
      slug: gm.slug || gm.condition_id,
      question: gm.question || 'Unknown',
      description: gm.description || null,
      outcomes: gm.outcomes || ['Yes', 'No'],
      volume: parseFloat(gm.volume || '0'),
      volume_24h: parseFloat(gm.volume24hr || '0'),
      liquidity: parseFloat(gm.liquidity || '0'),
      liquidity_score: parseFloat(gm.liquidityScore || '0'),
      category: gm.category || null,
      tags: gm.tags || [],
      end_date: gm.endDate || null,
      closed: gm.closed || false,
    };

    await supabase.from('markets').upsert(marketData, { onConflict: 'id' });
    console.log(`[bot-signal-scanner] Imported market from Gamma: ${marketData.question}`);

    if (gm.tokens && Array.isArray(gm.tokens)) {
      const tokenRows = gm.tokens.map((t: any) => ({
        id: t.token_id,
        market_id: marketData.id,
        outcome: t.outcome,
        price: parseFloat(t.price || '0'),
      }));
      if (tokenRows.length > 0) {
        await supabase.from('tokens').upsert(tokenRows, { onConflict: 'id' });
      }
    }

    cache[conditionId] = marketData;
    return marketData;
  } catch (e) {
    console.error(`[bot-signal-scanner] Gamma lookup failed for ${conditionId}:`, e);
    return null;
  }
}

// ── Process signals for a single bot config ─────────────────────────
async function processBotConfig(
  supabase: any,
  config: BotConfig,
  dryRun: boolean
): Promise<{ signals: number; rejected: number; scanned: number; synced: number }> {
  const result = { signals: 0, rejected: 0, scanned: 0, synced: 0 };

  if (!config.wallets || config.wallets.length === 0) {
    console.log(`[scanner] Config ${config.id}: no wallets configured`);
    return result;
  }

  // ── Step 0: Sync fresh activity from Polymarket API ──
  const lastScanTime = config.last_signal_scan_at || new Date(Date.now() - 60 * 60 * 1000).toISOString();
  console.log(`[scanner] Config ${config.id}: syncing activity since ${lastScanTime}`);

  const synced = await syncWalletActivity(supabase, config.wallets, lastScanTime);
  result.synced = synced;
  console.log(`[scanner] Config ${config.id}: synced ${synced} new trades`);

  // ── Step 1: Get recent activity from wallet_activity (all types for visibility) ──
  const { data: activities, error: activityError } = await supabase
    .from('wallet_activity')
    .select('*')
    .in('wallet_address', config.wallets)
    .gt('timestamp', lastScanTime)
    .order('timestamp', { ascending: true })
    .limit(1000);

  if (activityError) {
    console.error(`[scanner] Config ${config.id}: activity fetch error:`, activityError.message);
    return result;
  }

  result.scanned = activities?.length || 0;
  const tradeActivities = activities?.filter((a: any) => a.activity_type === 'TRADE') || [];
  const nonTradeActivities = activities?.filter((a: any) => a.activity_type !== 'TRADE') || [];
  console.log(`[scanner] Config ${config.id}: ${result.scanned} total activities (${tradeActivities.length} trades, ${nonTradeActivities.length} other) since last scan`);

  // Track the latest activity timestamp to advance cursor precisely (not to "now")
  // Ordered ascending, so last element is the latest
  const latestActivityTs = activities && activities.length > 0
    ? activities[activities.length - 1].timestamp
    : null;

  if (!activities || activities.length === 0) {
    if (!dryRun) {
      await supabase.from('bot_configs').update({ last_signal_scan_at: new Date().toISOString() }).eq('id', config.id);
    }
    return result;
  }

  // Log non-trade activity as info events for visibility
  if (!dryRun && nonTradeActivities.length > 0) {
    const infoEvents = nonTradeActivities.slice(0, 20).map((a: any) => ({
      bot_config_id: config.id,
      user_id: config.user_id,
      event_type: 'info',
      message: `${a.activity_type}: ${a.market_question || 'Unknown market'} - $${(a.usdc_size || a.size || 0).toFixed ? (a.usdc_size || a.size || 0).toFixed(0) : '0'}`,
      details: {
        activity_id: a.id,
        activity_type: a.activity_type,
        wallet_address: a.wallet_address,
        market_id: a.market_id,
        market_question: a.market_question,
        size: a.size,
        usdc_size: a.usdc_size,
        timestamp: a.timestamp,
      },
      reasons: [`Wallet: ${a.wallet_address.slice(0, 8)}...`, a.activity_type],
      timestamp: new Date().toISOString(),
    }));
    const { error: infoErr } = await supabase.from('bot_events').insert(infoEvents);
    if (infoErr) console.warn(`[scanner] Config ${config.id}: info event insert error:`, infoErr.message);
    else console.log(`[scanner] Config ${config.id}: logged ${infoEvents.length} non-trade activities`);
  }

  // ── Step 2: Resolve markets ──
  // Use only trade activities for signal detection
  const signalCandidates = tradeActivities;
  const marketIds = [...new Set(activities.filter((a: any) => a.market_id).map((a: any) => a.market_id!))];
  let marketsMap: Record<string, any> = {};
  if (marketIds.length > 0) {
    const { data: markets } = await supabase
      .from('markets')
      .select('id, condition_id, liquidity_score, category, question, end_date, closed')
      .in('id', marketIds);
    if (markets) {
      marketsMap = Object.fromEntries(markets.map((m: any) => [m.id, m]));
    }
  }

  const conditionIdCache: Record<string, any> = {};
  const activitiesWithoutMarket = activities.filter((a: any) => !a.market_id && a.condition_id);
  const uniqueConditionIds = [...new Set(activitiesWithoutMarket.map((a: any) => a.condition_id!))];

  for (const cid of uniqueConditionIds) {
    const resolved = await resolveMarketByConditionId(supabase, cid as string, conditionIdCache);
    if (resolved) marketsMap[resolved.id] = resolved;
  }

  const conditionToMarket: Record<string, string> = {};
  for (const [cid, market] of Object.entries(conditionIdCache)) {
    conditionToMarket[cid] = (market as any).id;
  }

  // Enrich activities
  for (const activity of activities) {
    if (!activity.market_id && activity.condition_id && conditionToMarket[activity.condition_id]) {
      activity.market_id = conditionToMarket[activity.condition_id];
      const market = marketsMap[activity.market_id!];
      if (market && !activity.market_question) {
        activity.market_question = market.question;
      }
    }
  }

  // ── Step 3: Detect signals ──
  const signals: Signal[] = [];

  for (const activity of signalCandidates) {
    const reasons: string[] = [];
    let score = 0;
    let rejected = false;

    const tradeSize = activity.usdc_size || (activity.size * (activity.price || 0));

    if (tradeSize >= (config.signal_min_trade_size || 0)) {
      reasons.push(`Trade size: $${tradeSize.toFixed(0)}`);
      score += 10;
    } else {
      rejected = true;
    }

    const market = activity.market_id ? marketsMap[activity.market_id] : null;
    if (market) {
      if (market.closed && config.mode !== 'paper') {
        rejected = true;
      } else if (market.liquidity_score >= (config.signal_min_liquidity_score || 0)) {
        reasons.push(`Liquidity score: ${market.liquidity_score}`);
        score += 5;
      } else if ((config.signal_min_liquidity_score || 0) > 0) {
        rejected = true;
      }

      if (config.categories && config.categories.length > 0) {
        const marketCategory = market.category || 'Other';
        if (!config.categories.some((cat: string) => marketCategory.toLowerCase().includes(cat.toLowerCase()))) {
          rejected = true;
        }
      }
    }

    reasons.push(`Wallet: ${activity.wallet_address.slice(0, 8)}...`);
    reasons.push(`${activity.side} ${activity.outcome}`);

    if (!rejected) {
      signals.push({ activity, reasons, score });
    } else {
      result.rejected++;
    }
  }

  result.signals = signals.length;
  console.log(`[scanner] Config ${config.id}: ${signals.length} signals, ${result.rejected} rejected`);

  // ── Step 4: Insert signals into queue + bot_events ──
  if (!dryRun && signals.length > 0) {
    // Insert into bot_signals_queue for the executor to consume
    const queueRows = signals.map(signal => ({
      bot_config_id: config.id,
      user_id: config.user_id,
      activity_id: signal.activity.id,
      market_id: signal.activity.market_id,
      market_question: signal.activity.market_question || (signal.activity.market_id ? marketsMap[signal.activity.market_id]?.question : null),
      wallet_address: signal.activity.wallet_address,
      outcome: signal.activity.outcome,
      side: signal.activity.side,
      size: signal.activity.size,
      usdc_size: signal.activity.usdc_size,
      price: signal.activity.price,
      score: signal.score,
      status: 'pending',
    }));

    const { error: queueError } = await supabase
      .from('bot_signals_queue')
      .upsert(queueRows, { onConflict: 'bot_config_id,activity_id', ignoreDuplicates: true });
    if (queueError) console.error(`[scanner] Config ${config.id}: queue insert error:`, queueError.message);
    else console.log(`[scanner] Config ${config.id}: queued ${queueRows.length} signals`);

    // Also log to bot_events for visibility in LiveFeed
    const events = signals.map(signal => ({
      bot_config_id: config.id,
      user_id: config.user_id,
      event_type: 'signal',
      message: `Signal: ${signal.activity.side} ${signal.activity.outcome} - $${(signal.activity.usdc_size || signal.activity.size * signal.activity.price).toFixed(0)}`,
      details: {
        activity_id: signal.activity.id,
        wallet_address: signal.activity.wallet_address,
        market_id: signal.activity.market_id,
        market_question: signal.activity.market_question || (signal.activity.market_id ? marketsMap[signal.activity.market_id]?.question : null),
        outcome: signal.activity.outcome,
        side: signal.activity.side,
        size: signal.activity.size,
        usdc_size: signal.activity.usdc_size,
        price: signal.activity.price,
        score: signal.score,
        timestamp: signal.activity.timestamp,
      },
      reasons: signal.reasons,
      timestamp: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase.from('bot_events').insert(events);
    if (insertError) console.error(`[scanner] Config ${config.id}: event insert error:`, insertError.message);
  }

  if (!dryRun) {
    // Advance cursor to the latest processed activity timestamp (not "now")
    // This allows retroactive scanning to page through historical data
    const cursorTime = latestActivityTs || new Date().toISOString();
    await supabase.from('bot_configs').update({ last_signal_scan_at: cursorTime }).eq('id', config.id);
    console.log(`[scanner] Config ${config.id}: cursor advanced to ${cursorTime}`);
  }

  return result;
}

// ── Main handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { configId, dryRun = false } = await req.json().catch(() => ({}));

    // ── Determine mode: user-scoped (manual) or all-bots (cron) ──
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const token = authHeader.replace('Bearer ', '');
        const { data: claimsData } = await authSupabase.auth.getClaims(token);
        if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub;
        }
      } catch {
        // Not a valid user JWT — likely anon key from cron
      }
    }

    const isCronMode = !userId;
    console.log(`[bot-signal-scanner] Mode: ${isCronMode ? 'CRON (all bots)' : `USER (${userId})`}, configId=${configId || 'auto'}, dryRun=${dryRun}`);

    // ── Fetch running bot configs ──
    let configQuery = supabase
      .from('bot_configs')
      .select('*')
      .eq('status', 'running')
      .eq('mode', 'paper');

    if (configId) {
      configQuery = configQuery.eq('id', configId);
    } else if (userId) {
      // Manual mode: scope to this user
      configQuery = configQuery.eq('user_id', userId);
    }
    // Cron mode without configId: get ALL running configs (no user filter)

    const { data: configs, error: configError } = await configQuery.limit(20);

    if (configError || !configs || configs.length === 0) {
      console.log('[bot-signal-scanner] No running bot configs found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No active paper trading configs found',
        configs: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[bot-signal-scanner] Processing ${configs.length} bot config(s)...`);

    // ── Process each config ──
    const allResults: Array<{
      configId: string;
      userId: string;
      signals: number;
      rejected: number;
      scanned: number;
      synced: number;
    }> = [];

    for (const config of configs) {
      try {
        const r = await processBotConfig(supabase, config as BotConfig, dryRun);
        allResults.push({
          configId: config.id,
          userId: config.user_id,
          ...r,
        });
      } catch (e) {
        console.error(`[bot-signal-scanner] Error processing config ${config.id}:`, e);
        allResults.push({
          configId: config.id,
          userId: config.user_id,
          signals: 0, rejected: 0, scanned: 0, synced: 0,
        });
      }
    }

    const totalSignals = allResults.reduce((s, r) => s + r.signals, 0);
    const totalSynced = allResults.reduce((s, r) => s + r.synced, 0);
    const totalScanned = allResults.reduce((s, r) => s + r.scanned, 0);

    console.log(`[bot-signal-scanner] Done: ${configs.length} configs, ${totalSynced} synced, ${totalScanned} scanned, ${totalSignals} signals`);

    return new Response(JSON.stringify({
      success: true,
      mode: isCronMode ? 'cron' : 'manual',
      configsProcessed: configs.length,
      totalSignals,
      totalSynced,
      totalScanned,
      results: allResults,
      dryRun,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[bot-signal-scanner] Error:', error);
    return new Response(JSON.stringify({
      success: false, error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
