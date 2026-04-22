/**
 * Edge Function: maintenance-cron
 * Deploy name: maintenance-cron
 * Purpose: Consolidated data cleanup — replaces cleanup-history, cleanup-agent-data,
 *          and the inline price_history cleanup formerly in sync-tokens.
 * Triggers: cron job or manual invocation via supabase.functions.invoke('maintenance-cron')
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BATCH_LIMIT = 500;

/** Count rows matching a filter */
async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  filterFn: (q: any) => any,
): Promise<number> {
  const query = supabase.from(table).select('*', { count: 'exact', head: true });
  const { count, error } = await filterFn(query);
  if (error) {
    console.error(`[maintenance-cron] ${table} count error:`, error.message);
    return 0;
  }
  return count || 0;
}

/** Delete rows in batches without returning data to avoid timeout */
async function batchDelete(
  supabase: ReturnType<typeof createClient>,
  table: string,
  filterFn: (q: any) => any,
): Promise<number> {
  // First count how many we'll delete
  const totalBefore = await countRows(supabase, table, filterFn);
  if (totalBefore === 0) return 0;

  let rounds = 0;
  const maxRounds = Math.ceil(totalBefore / BATCH_LIMIT) + 2;

  while (rounds++ < maxRounds) {
    try {
      // Delete a small batch — no .select() to avoid returning large payloads
      const { error } = await filterFn(
        supabase.from(table).delete()
      ).limit(BATCH_LIMIT);

      if (error) {
        console.error(`[maintenance-cron] ${table} delete error:`, error.message);
        break;
      }
    } catch (e) {
      console.error(`[maintenance-cron] ${table} batch exception:`, e);
      break;
    }

    // Check remaining
    const remaining = await countRows(supabase, table, filterFn);
    if (remaining === 0) break;
  }

  const totalAfter = await countRows(supabase, table, filterFn);
  return Math.max(0, totalBefore - totalAfter);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;
    console.log('[maintenance-cron] Authenticated user:', userId);

    // Service-role client for deletions
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      priceHistoryDays = 7,
      walletActivityDays = 30,
      agentDataDays = 7,
      cleanExpiredMarkets = true,
      dryRun = false,
    } = await req.json().catch(() => ({}));

    console.log(`[maintenance-cron] Config: priceHistory=${priceHistoryDays}d, walletActivity=${walletActivityDays}d, agentData=${agentDataDays}d, dryRun=${dryRun}`);

    const now = new Date();
    const priceHistoryCutoff = new Date(now.getTime() - priceHistoryDays * 86400000).toISOString();
    const walletActivityCutoff = new Date(now.getTime() - walletActivityDays * 86400000).toISOString();
    const agentDataCutoff = new Date(now.getTime() - agentDataDays * 86400000).toISOString();

    // Pre-fetch expired market IDs if needed
    let expiredMarketIds: string[] = [];
    if (cleanExpiredMarkets) {
      const { data: expired } = await supabase
        .from('markets')
        .select('id')
        .or(`end_date.lt.${now.toISOString()},closed.eq.true`);
      expiredMarketIds = expired?.map(m => m.id) || [];
    }

    if (dryRun) {
      // Count-only mode
      const [priceCount, walletCount, predictionsCount, sentimentCount, signalsCount] = await Promise.allSettled([
        supabase.from('price_history').select('*', { count: 'exact', head: true }).lt('recorded_at', priceHistoryCutoff),
        supabase.from('wallet_activity').select('*', { count: 'exact', head: true }).lt('timestamp', walletActivityCutoff),
        supabase.from('agent_predictions').select('*', { count: 'exact', head: true }).eq('user_id', userId).lt('created_at', agentDataCutoff),
        supabase.from('market_sentiment').select('*', { count: 'exact', head: true }).lt('analyzed_at', agentDataCutoff),
        supabase.from('rag_signals').select('*', { count: 'exact', head: true }).lt('created_at', agentDataCutoff),
      ]);

      const extractCount = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value.count || 0) : 0;

      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        would_delete: {
          price_history: extractCount(priceCount),
          wallet_activity: extractCount(walletCount),
          agent_predictions: extractCount(predictionsCount),
          market_sentiment: extractCount(sentimentCount),
          rag_signals: extractCount(signalsCount),
          expired_markets_found: expiredMarketIds.length,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- Execute all cleanups in parallel ---
    // Use DB function for large tables (price_history, wallet_activity) to avoid REST API timeout
    const results = await Promise.allSettled([
      // 1+2. Price history + Wallet activity via DB function (60s timeout)
      supabase.rpc('cleanup_old_records', {
        p_price_history_cutoff: priceHistoryCutoff,
        p_wallet_activity_cutoff: walletActivityCutoff,
      }),

      // 3. Agent predictions (user-scoped by age)
      batchDelete(supabase, 'agent_predictions', (q: any) => q.eq('user_id', userId).lt('created_at', agentDataCutoff)),

      // 4. Agent predictions for expired markets (user-scoped)
      expiredMarketIds.length > 0
        ? batchDelete(supabase, 'agent_predictions', (q: any) => q.eq('user_id', userId).in('market_id', expiredMarketIds))
        : Promise.resolve(0),

      // 5. Market sentiment by age
      batchDelete(supabase, 'market_sentiment', (q: any) => q.lt('analyzed_at', agentDataCutoff)),

      // 6. Market sentiment for expired markets
      expiredMarketIds.length > 0
        ? batchDelete(supabase, 'market_sentiment', (q: any) => q.in('market_id', expiredMarketIds))
        : Promise.resolve(0),

      // 7. RAG signals by age
      batchDelete(supabase, 'rag_signals', (q: any) => q.lt('created_at', agentDataCutoff)),

      // 8. RAG signals for expired markets
      expiredMarketIds.length > 0
        ? batchDelete(supabase, 'rag_signals', (q: any) => q.in('market_id', expiredMarketIds))
        : Promise.resolve(0),
    ]);

    const extract = (r: PromiseSettledResult<number>) =>
      r.status === 'fulfilled' ? r.value : 0;

    // Extract RPC result for price_history + wallet_activity
    const rpcResult = results[0].status === 'fulfilled'
      ? (results[0].value as any)?.data ?? { price_history_deleted: 0, wallet_activity_deleted: 0 }
      : { price_history_deleted: 0, wallet_activity_deleted: 0 };

    if (results[0].status === 'fulfilled' && (results[0].value as any)?.error) {
      console.error('[maintenance-cron] RPC error:', (results[0].value as any).error.message);
    }

    const summary = {
      success: true,
      dry_run: false,
      completed_at: new Date().toISOString(),
      deleted: {
        price_history: rpcResult.price_history_deleted || 0,
        wallet_activity: rpcResult.wallet_activity_deleted || 0,
        agent_predictions: extract(results[1] as any) + extract(results[2] as any),
        market_sentiment: extract(results[3] as any) + extract(results[4] as any),
        rag_signals: extract(results[5] as any) + extract(results[6] as any),
      },
      expired_markets_cleaned: expiredMarketIds.length,
      errors: results
        .map((r, i) => r.status === 'rejected' ? `Task ${i}: ${r.reason}` : null)
        .filter(Boolean),
    };

    console.log('[maintenance-cron] Result:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[maintenance-cron] Error:', error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
