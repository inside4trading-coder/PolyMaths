import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOB_API_BASE = "https://clob.polymarket.com";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, params } = await req.json();
    console.log(`Polymarket CLOB API: ${action}`, params);

    let result;

    switch (action) {
      case 'fetch_prices': {
        // Fetch current prices for tokens
        const { token_ids } = params;
        if (!token_ids || !Array.isArray(token_ids)) {
          throw new Error('token_ids array is required');
        }

        const response = await fetch(`${CLOB_API_BASE}/prices`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`CLOB API error: ${response.status}`);
        }

        const prices = await response.json();
        console.log(`Fetched prices from CLOB API`);

        result = { prices };
        break;
      }

      case 'fetch_orderbook': {
        // Fetch orderbook for a token
        const { token_id } = params;
        if (!token_id) throw new Error('token_id is required');

        const response = await fetch(`${CLOB_API_BASE}/book?token_id=${token_id}`);
        
        // Handle 404 gracefully - token may be inactive or market closed
        if (response.status === 404) {
          console.log(`Orderbook not available for token: ${token_id} (404)`);
          result = { orderbook: { bids: [], asks: [] }, unavailable: true };
          break;
        }
        
        if (!response.ok) {
          throw new Error(`CLOB API error: ${response.status}`);
        }

        const orderbook = await response.json();
        console.log(`Fetched orderbook for token: ${token_id}`);

        result = { orderbook };
        break;
      }

      case 'fetch_midpoint': {
        // Fetch midpoint price for a token
        const { token_id } = params;
        if (!token_id) throw new Error('token_id is required');

        const response = await fetch(`${CLOB_API_BASE}/midpoint?token_id=${token_id}`);
        if (!response.ok) {
          throw new Error(`CLOB API error: ${response.status}`);
        }

        const data = await response.json();
        const midpoint = parseFloat(data.mid);

        // Update token price in database
        const { error: updateError } = await supabase
          .from('tokens')
          .update({ price: midpoint })
          .eq('id', token_id);

        if (updateError) {
          console.error('Error updating token price:', updateError);
        }

        result = { token_id, midpoint };
        break;
      }

      case 'fetch_spread': {
        // Fetch spread for a token
        const { token_id } = params;
        if (!token_id) throw new Error('token_id is required');

        const response = await fetch(`${CLOB_API_BASE}/spread?token_id=${token_id}`);
        if (!response.ok) {
          throw new Error(`CLOB API error: ${response.status}`);
        }

        const spread = await response.json();
        result = { token_id, spread };
        break;
      }

      case 'fetch_price_history': {
        // Test price history endpoint
        const { token_id } = params;
        if (!token_id) throw new Error('token_id is required');

        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400;
        
        // Try different URL formats
        const urls = [
          `${CLOB_API_BASE}/prices-history?market=${token_id}&startTs=${oneDayAgo}&endTs=${now}&interval=max&fidelity=60`,
          `${CLOB_API_BASE}/prices-history?market=${token_id}&interval=1d`,
          `${CLOB_API_BASE}/timeseries?token_id=${token_id}&interval=1d`,
        ];
        
        const results: any[] = [];
        for (const url of urls) {
          try {
            console.log(`Trying: ${url}`);
            const response = await fetch(url);
            const data = await response.json();
            results.push({ url: url.split('?')[1], status: response.status, data });
          } catch (e) {
            results.push({ url: url.split('?')[1], error: String(e) });
          }
        }
        
        result = { results };
        break;
      }

      case 'fetch_market_tokens': {
        // Fetch tokens for a market condition
        const { condition_id } = params;
        if (!condition_id) throw new Error('condition_id is required');

        const response = await fetch(`${CLOB_API_BASE}/markets/${condition_id}`);
        if (!response.ok) {
          throw new Error(`CLOB API error: ${response.status}`);
        }

        const marketData = await response.json();
        console.log(`Fetched market tokens for condition: ${condition_id}`);

        // Get market id from our database
        const { data: market } = await supabase
          .from('markets')
          .select('id')
          .eq('condition_id', condition_id)
          .single();

        if (market && marketData.tokens) {
          // Upsert tokens
          const tokens = marketData.tokens.map((t: any, idx: number) => ({
            id: t.token_id,
            market_id: market.id,
            outcome: t.outcome || (idx === 0 ? 'Yes' : 'No'),
            price: parseFloat(t.price) || null,
            change_1h: null,
            change_24h: null,
          }));

          const { error: upsertError } = await supabase
            .from('tokens')
            .upsert(tokens, { onConflict: 'id' });

          if (upsertError) {
            console.error('Error upserting tokens:', upsertError);
          } else {
            console.log(`Upserted ${tokens.length} tokens`);
          }
        }

        result = { market: marketData };
        break;
      }

      case 'fetch_all_markets': {
        // Fetch all markets from CLOB API
        const response = await fetch(`${CLOB_API_BASE}/markets`);
        if (!response.ok) {
          throw new Error(`CLOB API error: ${response.status}`);
        }

        const markets = await response.json();
        console.log(`Fetched ${markets.length} markets from CLOB API`);

        // Process and upsert tokens for each market
        let tokensUpserted = 0;
        for (const m of markets.slice(0, 100)) { // Limit to first 100 for now
          if (m.tokens && Array.isArray(m.tokens)) {
            const { data: market } = await supabase
              .from('markets')
              .select('id')
              .eq('condition_id', m.condition_id)
              .single();

            if (market) {
              const tokens = m.tokens.map((t: any, idx: number) => ({
                id: t.token_id,
                market_id: market.id,
                outcome: t.outcome || (idx === 0 ? 'Yes' : 'No'),
                price: parseFloat(t.price) || null,
              }));

              const { error } = await supabase
                .from('tokens')
                .upsert(tokens, { onConflict: 'id' });

              if (!error) tokensUpserted += tokens.length;
            }
          }
        }

        result = { markets_count: markets.length, tokens_upserted: tokensUpserted };
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
    console.error('Polymarket CLOB error:', error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
