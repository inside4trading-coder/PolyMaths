import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

function ensureArray(value: unknown, defaultValue: string[] = []): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return defaultValue; }
  }
  return defaultValue;
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

    const { incremental = true, limit = 100 } = await req.json().catch(() => ({}));
    console.log(`[sync-markets] Starting (incremental: ${incremental}, limit: ${limit})`);

    const stats = {
      markets_synced: 0,
      tokens_synced: 0,
      errors: [] as string[],
    };

    // Get last sync timestamp for incremental sync
    let lastSyncTime: string | null = null;
    if (incremental) {
      const { data: lastMarket } = await supabase
        .from('markets')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastMarket?.updated_at) {
        // Go back 10 minutes to catch any late updates
        const lastSync = new Date(lastMarket.updated_at);
        lastSync.setMinutes(lastSync.getMinutes() - 10);
        lastSyncTime = lastSync.toISOString();
        console.log(`[sync-markets] Incremental since: ${lastSyncTime}`);
      }
    }

    const tokensFromGamma: any[] = [];
    const marketsToInsert: any[] = [];

    // Fetch markets from Gamma API
    try {
      let url = `${GAMMA_API_BASE}/markets?limit=${limit}&active=true`;
      
      // Note: Gamma API doesn't support updated_since, but we can filter locally
      console.log(`[sync-markets] Fetching from: ${url}`);
      const marketsResponse = await fetch(url);
      
      if (marketsResponse.ok) {
        const markets = await marketsResponse.json();
        const marketsArr = Array.isArray(markets) ? markets : [];
        console.log(`[sync-markets] Fetched ${marketsArr.length} markets`);
        
        for (const m of marketsArr) {
          // Skip if incremental and not recently updated
          if (incremental && lastSyncTime && m.updatedAt) {
            const marketUpdated = new Date(m.updatedAt);
            const syncCutoff = new Date(lastSyncTime);
            if (marketUpdated < syncCutoff) continue;
          }

          let clobTokenIds: string[] = [];
          try {
            clobTokenIds = typeof m.clobTokenIds === 'string'
              ? JSON.parse(m.clobTokenIds)
              : Array.isArray(m.clobTokenIds) ? m.clobTokenIds : [];
          } catch { clobTokenIds = []; }

          let outcomePrices: number[] = [];
          try {
            const rawPrices = typeof m.outcomePrices === 'string'
              ? JSON.parse(m.outcomePrices)
              : Array.isArray(m.outcomePrices) ? m.outcomePrices : [];
            outcomePrices = rawPrices.map((p: any) => parseFloat(String(p)) || 0);
          } catch { outcomePrices = []; }

          const outcomes = ensureArray(m.outcomes, ['Yes', 'No']);
          const marketId = String(m.id || m.condition_id);

          // Extract tokens with prices
          if (clobTokenIds.length > 0) {
            for (let i = 0; i < clobTokenIds.length; i++) {
              const tokenId = clobTokenIds[i];
              const tokenPrice = outcomePrices[i] || 0;
              if (tokenId && typeof tokenId === 'string' && tokenId.length > 10) {
                tokensFromGamma.push({
                  id: tokenId,
                  market_id: marketId,
                  outcome: outcomes[i] || (i === 0 ? 'Yes' : 'No'),
                  price: tokenPrice,
                });
              }
            }
          }
          
          const liquidity = parseFloat(m.liquidity) || 0;
          const volume24h = parseFloat(m.volume24hr) || parseFloat(m.volume_24h) || 0;
          const normalizedCategory = m.groupItemTitle || m.category || null;

          const derivedLiquidityScore = (() => {
            const liq = Math.max(0, liquidity);
            const vol = Math.max(0, volume24h);
            const liqScore = Math.min(60, (Math.log10(liq + 1) / 6) * 60);
            const volScore = Math.min(40, (Math.log10(vol + 1) / 6) * 40);
            return Math.max(0, Math.min(100, Math.round(liqScore + volScore)));
          })();

          marketsToInsert.push({
            id: marketId,
            condition_id: m.condition_id || marketId,
            question: m.question || m.title || 'Unknown',
            description: m.description || null,
            slug: m.slug || marketId,
            outcomes: outcomes,
            category: normalizedCategory,
            tags: ensureArray(m.tags, []),
            end_date: m.end_date_iso || m.endDate || m.endDateIso || null,
            volume: parseFloat(m.volume) || 0,
            volume_24h: volume24h,
            liquidity,
            liquidity_score: derivedLiquidityScore,
            closed: m.closed || false,
          });
        }
      }
    } catch (e: unknown) {
      console.error('[sync-markets] Error:', e);
      stats.errors.push(`Markets: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    // Upsert markets (batch)
    if (marketsToInsert.length > 0) {
      const uniqueMarkets = new Map<string, any>();
      for (const m of marketsToInsert) {
        uniqueMarkets.set(String(m.id), m);
      }
      const dedupedMarkets = Array.from(uniqueMarkets.values());
      
      for (let i = 0; i < dedupedMarkets.length; i += 100) {
        const batch = dedupedMarkets.slice(i, i + 100);
        const { error } = await supabase.from('markets').upsert(batch, { onConflict: 'id' });
        if (error) {
          stats.errors.push(`Markets upsert: ${error.message}`);
          break;
        }
      }
      stats.markets_synced = dedupedMarkets.length;
    }

    // Upsert tokens (batch) - keep existing price if new price is 0
    if (tokensFromGamma.length > 0) {
      const byId = new Map<string, any>();
      for (const t of tokensFromGamma) {
        if (!t?.id || !t?.market_id) continue;
        const existing = byId.get(String(t.id));
        const newPrice = Number.isFinite(Number(t.price)) ? Number(t.price) : 0;
        
        // Keep the higher price if we have duplicates (don't overwrite valid price with 0)
        const finalPrice = existing && existing.price > 0 && newPrice === 0 
          ? existing.price 
          : newPrice;
        
        byId.set(String(t.id), {
          id: String(t.id),
          market_id: String(t.market_id),
          outcome: String(t.outcome),
          price: finalPrice,
        });
      }
      const deduped = Array.from(byId.values());
      const tokensWithPrice = deduped.filter(t => t.price > 0);
      
      console.log(`[sync-markets] Tokens: ${deduped.length} total, ${tokensWithPrice.length} with price`);
      
      for (let i = 0; i < deduped.length; i += 200) {
        const batch = deduped.slice(i, i + 200);
        const { error } = await supabase.from('tokens').upsert(batch, { onConflict: 'id' });
        if (error) {
          stats.errors.push(`Tokens upsert: ${error.message}`);
          break;
        }
      }
      stats.tokens_synced = deduped.length;
    }

    console.log('[sync-markets] Completed:', stats);

    return new Response(JSON.stringify({ 
      success: true, 
      completed_at: new Date().toISOString(),
      ...stats 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-markets] Error:', error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
