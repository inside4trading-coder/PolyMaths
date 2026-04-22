import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

function ensureArray(value: unknown, defaultValue: string[] = []): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return defaultValue; }
  }
  return defaultValue;
}

function parseTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'number') {
    const ms = value < 10000000000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * On-demand sync for a single market (Option D)
 * Called when user opens a market detail view
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { marketId } = await req.json().catch(() => ({}));
    
    if (!marketId) {
      return new Response(JSON.stringify({ success: false, error: 'marketId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-market-detail] Starting for market: ${marketId}`);

    const stats = {
      market_updated: false,
      tokens_updated: 0,
      trades_synced: 0,
      errors: [] as string[],
    };

    // Get existing market data
    const { data: existingMarket } = await supabase
      .from('markets')
      .select('condition_id, slug')
      .eq('id', marketId)
      .maybeSingle();

    const conditionId = existingMarket?.condition_id || marketId;
    const slug = existingMarket?.slug || marketId;
    
    // Check if this is a special short-term market slug (e.g., btc-updown-15m-1767801600)
    const isShortTermSlug = /^[a-z]+-[a-z]+-\d+m-\d+$/.test(marketId);

    // 1. Fetch fresh market data from Gamma (try multiple strategies)
    try {
      let marketResponse: Response | null = null;
      let m: any = null;
      
      // Strategy 1: Direct slug lookup
      console.log(`[sync-market-detail] Trying slug: ${slug}`);
      marketResponse = await fetch(`${GAMMA_API_BASE}/markets/${slug}`);
      
      if (marketResponse.ok) {
        const response = await marketResponse.json();
        m = Array.isArray(response) ? response[0] : response;
      }
      
      // Strategy 2: Try the marketId as slug if different
      if (!m && marketId !== slug) {
        console.log(`[sync-market-detail] Trying marketId as slug: ${marketId}`);
        marketResponse = await fetch(`${GAMMA_API_BASE}/markets/${marketId}`);
        if (marketResponse.ok) {
          const response = await marketResponse.json();
          m = Array.isArray(response) ? response[0] : response;
        }
      }
      
      // Strategy 3: Search by slug pattern for short-term markets
      if (!m && isShortTermSlug) {
        console.log(`[sync-market-detail] Searching for short-term market: ${marketId}`);
        marketResponse = await fetch(`${GAMMA_API_BASE}/markets?slug=${marketId}&limit=1`);
        if (marketResponse.ok) {
          const response = await marketResponse.json();
          m = Array.isArray(response) ? response[0] : response;
        }
      }
      
      // Strategy 4: Condition ID query
      if (!m && conditionId) {
        console.log(`[sync-market-detail] Trying condition_id: ${conditionId}`);
        marketResponse = await fetch(`${GAMMA_API_BASE}/markets?condition_id=${conditionId}&limit=1`);
        if (marketResponse.ok) {
          const response = await marketResponse.json();
          m = Array.isArray(response) ? response[0] : response;
        }
      }
      
      if (!m) {
        console.log(`[sync-market-detail] No market found for ${marketId} after all strategies`);
        stats.errors.push(`Market not found: ${marketId}`);
      } else {
        
        let clobTokenIds: string[] = [];
        try {
          clobTokenIds = typeof m.clobTokenIds === 'string'
            ? JSON.parse(m.clobTokenIds)
            : Array.isArray(m.clobTokenIds) ? m.clobTokenIds : [];
        } catch { clobTokenIds = []; }

        let outcomePrices: number[] = [];
        try {
          outcomePrices = typeof m.outcomePrices === 'string'
            ? JSON.parse(m.outcomePrices)
            : Array.isArray(m.outcomePrices) ? m.outcomePrices : [];
        } catch { outcomePrices = []; }

        const outcomes = ensureArray(m.outcomes, ['Yes', 'No']);
        const liquidity = parseFloat(m.liquidity) || 0;
        const volume24h = parseFloat(m.volume24hr) || parseFloat(m.volume_24h) || 0;

        // Update market
        const marketData = {
          id: marketId,
          condition_id: m.condition_id || conditionId,
          question: m.question || m.title || 'Unknown',
          description: m.description || null,
          slug: m.slug || slug,
          outcomes,
          category: m.groupItemTitle || m.category || null,
          tags: ensureArray(m.tags, []),
          end_date: m.end_date_iso || m.endDate || m.endDateIso || null,
          volume: parseFloat(m.volume) || 0,
          volume_24h: volume24h,
          liquidity,
          closed: m.closed || false,
        };

        const { error } = await supabase.from('markets').upsert(marketData, { onConflict: 'id' });
        if (!error) stats.market_updated = true;

        // Update tokens - fetch existing prices to avoid overwriting with 0
        const tokensToUpsert: any[] = [];
        if (clobTokenIds.length > 0) {
          // Get existing token prices
          const { data: existingTokens } = await supabase
            .from('tokens')
            .select('id, price')
            .in('id', clobTokenIds);
          
          const existingPrices = new Map<string, number>();
          for (const t of existingTokens || []) {
            if (t.price > 0) existingPrices.set(t.id, t.price);
          }
          
          for (let i = 0; i < clobTokenIds.length; i++) {
            const tokenId = clobTokenIds[i];
            const newPrice = parseFloat(String(outcomePrices[i])) || 0;
            const existingPrice = existingPrices.get(tokenId) || 0;
            
            // Use new price if valid, otherwise keep existing
            const finalPrice = newPrice > 0 ? newPrice : existingPrice;
            
            if (tokenId && typeof tokenId === 'string' && tokenId.length > 10) {
              tokensToUpsert.push({
                id: tokenId,
                market_id: marketId,
                outcome: outcomes[i] || (i === 0 ? 'Yes' : 'No'),
                price: finalPrice,
              });
            }
          }
        }

        if (tokensToUpsert.length > 0) {
          const { error: tokenError } = await supabase.from('tokens').upsert(tokensToUpsert, { onConflict: 'id' });
          if (!tokenError) stats.tokens_updated = tokensToUpsert.length;
          console.log(`[sync-market-detail] Updated ${tokensToUpsert.length} tokens`);
        }
      }
    } catch (e: unknown) {
      stats.errors.push(`Market fetch: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    // 2. Fetch fresh trades for this market
    // CRITICAL: Use 'market' parameter, NOT 'conditionId' - the API ignores conditionId
    try {
      const tradesUrl = `${DATA_API_BASE}/trades?market=${conditionId}&limit=100`;
      console.log(`[sync-market-detail] Fetching trades from: ${tradesUrl}`);
      const tradesResponse = await fetch(tradesUrl);

      if (tradesResponse.ok) {
        const tradesData = await tradesResponse.json();
        const trades = Array.isArray(tradesData) ? tradesData : [];

        if (trades.length > 0) {
          const sample = trades[0];
          console.log(
            `[sync-market-detail] Sample trade keys: ${Object.keys(sample || {}).join(', ')}`
          );
          console.log(
            `[sync-market-detail] Sample: conditionId=${sample?.conditionId || '—'} asset=${sample?.asset || '—'} tokenId=${sample?.tokenId || '—'}`
          );
          // Log first 3 trades' asset values to debug
          trades.slice(0, 3).forEach((t: any, i: number) => {
            console.log(`[sync-market-detail] Trade[${i}] asset=${t.asset || '—'} conditionId=${t.conditionId || '—'}`);
          });
        }

        console.log(`[sync-market-detail] API returned ${trades.length} trades. Validating for market conditionId: ${conditionId}`);

        // IMPORTANT: Some Data API responses appear not to honor conditionId filtering reliably.
        // We validate trades using (1) matching conditionId when present, OR (2) tokenId belonging to this market.
        const { data: marketTokens, error: marketTokensError } = await supabase
          .from('tokens')
          .select('id')
          .eq('market_id', marketId);

        if (marketTokensError) {
          console.log(`[sync-market-detail] Warning: could not load market tokens: ${marketTokensError.message}`);
        }

        const marketTokenIdSet = new Set<string>((marketTokens || []).map((row: any) => String(row.id)));
        
        console.log(`[sync-market-detail] Market tokens in DB: ${Array.from(marketTokenIdSet).join(', ').slice(0, 100)}...`);

        const filteredTrades = trades.filter((t) => {
          const tradeConditionId = String(t.conditionId || t.condition_id || '').toLowerCase();
          // CRITICAL FIX: The API returns tokenId in the 'asset' field, not 'tokenId'
          const tradeTokenId = String(t.asset || t.tokenId || t.token_id || t.assetId || t.asset_id || '').trim();

          const conditionMatches = !!tradeConditionId && tradeConditionId === conditionId.toLowerCase();
          const tokenMatches = !!tradeTokenId && marketTokenIdSet.has(tradeTokenId);

          return conditionMatches || tokenMatches;
        });

        console.log(
          `[sync-market-detail] ${filteredTrades.length}/${trades.length} trades accepted (conditionId or asset/tokenId match)`
        );

        const tradesToInsert = filteredTrades.map(t => {
          // Use 'asset' field as primary source for token_id
          const tokenId = t.asset || t.tokenId || t.token_id || t.assetId || t.asset_id || null;
          return {
            id: t.id || t.tradeId || `${conditionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            market_id: marketId,
            token_id: tokenId,
            side: (t.side || 'BUY').toUpperCase(),
            price: parseFloat(t.price) || 0,
            size: parseFloat(t.size) || parseFloat(t.amount) || 0,
            outcome: t.outcome || t.outcomeName || null,
            maker: t.maker || null,
            taker: t.proxyWallet || t.taker || null,
            wallet_address: t.proxyWallet || t.taker || null,
            timestamp: parseTimestamp(t.timestamp),
          };
        });

        if (tradesToInsert.length > 0) {
          const { error } = await supabase
            .from('trades')
            .upsert(tradesToInsert, { onConflict: 'id', ignoreDuplicates: true });
          
          if (!error) stats.trades_synced = tradesToInsert.length;
        }
      }
    } catch (e: unknown) {
      stats.errors.push(`Trades fetch: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    console.log('[sync-market-detail] Completed:', stats);

    return new Response(JSON.stringify({
      success: true,
      completed_at: new Date().toISOString(),
      ...stats
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-market-detail] Error:', error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
