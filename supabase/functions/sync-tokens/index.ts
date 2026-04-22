import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { marketIds = [] } = await req.json().catch(() => ({}));
    console.log(`[sync-tokens] Starting for ${marketIds.length || 'all'} markets`);

    const stats = {
      tokens_synced: 0,
      price_history_added: 0,
      price_history_cleaned: 0,
      errors: [] as string[],
    };

    // Get tokens to update (all or specific markets)
    let tokensQuery = supabase.from('tokens').select('id, market_id, outcome, price');
    if (marketIds.length > 0) {
      tokensQuery = tokensQuery.in('market_id', marketIds);
    }
    
    const { data: tokens, error: fetchError } = await tokensQuery.limit(500);
    if (fetchError) {
      stats.errors.push(`Fetch tokens: ${fetchError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      console.log('[sync-tokens] No tokens to update');
      return new Response(JSON.stringify({ success: true, ...stats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-tokens] Processing ${tokens.length} tokens`);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch price history for change calculation
    const tokenIds = tokens.map(t => t.id);
    const { data: historyData } = await supabase
      .from('price_history')
      .select('token_id, price, recorded_at')
      .in('token_id', tokenIds)
      .gte('recorded_at', oneDayAgo)
      .order('recorded_at', { ascending: true })
      .limit(5000);

    // Build history map
    const tokensWithHistory = new Map<string, { price_1h_ago: number; price_24h_ago: number }>();
    if (historyData && historyData.length > 0) {
      const byToken = new Map<string, Array<{ price: number; recorded_at: string }>>();
      for (const h of historyData) {
        if (!byToken.has(h.token_id)) {
          byToken.set(h.token_id, []);
        }
        byToken.get(h.token_id)!.push({ price: h.price, recorded_at: h.recorded_at });
      }

      for (const [tokenId, prices] of byToken) {
        let price_1h_ago = 0;
        let price_24h_ago = 0;

        for (const p of prices) {
          if (new Date(p.recorded_at).getTime() <= new Date(oneHourAgo).getTime()) {
            price_1h_ago = p.price;
            break;
          }
        }
        if (price_1h_ago === 0 && prices.length > 0) {
          price_1h_ago = prices[0].price;
        }
        if (prices.length > 0) {
          price_24h_ago = prices[0].price;
        }

        if (price_1h_ago > 0 || price_24h_ago > 0) {
          tokensWithHistory.set(tokenId, { price_1h_ago, price_24h_ago });
        }
      }
    }

    // Calculate changes and update tokens
    const tokensToUpdate = tokens.map(token => {
      const currentPrice = token.price || 0;
      const history = tokensWithHistory.get(token.id);

      let change_1h = 0;
      let change_24h = 0;

      if (history) {
        if (history.price_1h_ago > 0 && currentPrice > 0) {
          change_1h = ((currentPrice - history.price_1h_ago) / history.price_1h_ago) * 100;
        }
        if (history.price_24h_ago > 0 && currentPrice > 0) {
          change_24h = ((currentPrice - history.price_24h_ago) / history.price_24h_ago) * 100;
        }
      }

      change_1h = Math.max(-100, Math.min(100, change_1h));
      change_24h = Math.max(-100, Math.min(100, change_24h));

      return {
        id: token.id,
        market_id: token.market_id,
        outcome: token.outcome,
        price: currentPrice,
        change_1h: Math.round(change_1h * 100) / 100,
        change_24h: Math.round(change_24h * 100) / 100,
      };
    });

    // Update tokens
    for (let i = 0; i < tokensToUpdate.length; i += 200) {
      const batch = tokensToUpdate.slice(i, i + 200);
      const { error } = await supabase.from('tokens').upsert(batch, { onConflict: 'id' });
      if (error) {
        stats.errors.push(`Token update: ${error.message}`);
        break;
      }
    }
    stats.tokens_synced = tokensToUpdate.length;

    // Save current prices to price_history
    const priceHistoryEntries = tokens
      .filter(t => t.price && t.price > 0)
      .map(t => ({
        token_id: t.id,
        price: t.price,
        recorded_at: now.toISOString(),
      }));

    if (priceHistoryEntries.length > 0) {
      for (let i = 0; i < priceHistoryEntries.length; i += 200) {
        const batch = priceHistoryEntries.slice(i, i + 200);
        await supabase.from('price_history').insert(batch);
      }
      stats.price_history_added = priceHistoryEntries.length;
    }

    // Price history cleanup moved to maintenance-cron edge function

    console.log('[sync-tokens] Completed:', stats);

    return new Response(JSON.stringify({ 
      success: true, 
      completed_at: new Date().toISOString(),
      ...stats 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-tokens] Error:', error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
