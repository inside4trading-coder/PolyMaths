import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOB_API = "https://clob.polymarket.com";

interface BotPosition {
  id: string;
  token_id: string;
  market_id: string;
  side: string;
  size: number;
  entry_price: number;
  current_price: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  user_id: string;
}

interface PriceUpdate {
  positionId: string;
  tokenId: string;
  oldPrice: number | null;
  newPrice: number;
  pnl: number;
  pnlPercent: number;
}

// Fetch current price from CLOB API
async function fetchTokenPrice(tokenId: string): Promise<number | null> {
  try {
    const response = await fetch(`${CLOB_API}/price?token_id=${tokenId}&side=buy`);
    if (!response.ok) {
      console.warn(`CLOB price 404 for token ${tokenId.slice(0, 12)}..., will try fallback`);
      return null;
    }
    const data = await response.json();
    return data.price ? parseFloat(data.price) : null;
  } catch (error) {
    console.error(`Error fetching price for token ${tokenId.slice(0, 12)}...:`, error);
    return null;
  }
}

// Fetch prices from the local tokens table as fallback
async function fetchFallbackPrices(
  supabase: any,
  tokenIds: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const { data: tokens } = await supabase
    .from('tokens')
    .select('id, price')
    .in('id', tokenIds);
  
  if (tokens) {
    for (const t of tokens) {
      if (t.price && t.price > 0) {
        prices.set(t.id, Number(t.price));
      }
    }
  }
  return prices;
}

// Try CLOB midpoint endpoint as secondary fallback
async function fetchMidpointPrice(tokenId: string): Promise<number | null> {
  try {
    const response = await fetch(`${CLOB_API}/midpoint?token_id=${tokenId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.mid ? parseFloat(data.mid) : null;
  } catch {
    return null;
  }
}

// Batch fetch prices for multiple tokens with fallback chain
async function fetchTokenPrices(
  tokenIds: string[],
  supabase: any
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const uniqueTokenIds = [...new Set(tokenIds)];
  
  // Step 1: Try CLOB /price endpoint
  const batchSize = 5;
  const failedTokens: string[] = [];
  
  for (let i = 0; i < uniqueTokenIds.length; i += batchSize) {
    const batch = uniqueTokenIds.slice(i, i + batchSize);
    const pricePromises = batch.map(async (tokenId) => {
      const price = await fetchTokenPrice(tokenId);
      if (price !== null) {
        prices.set(tokenId, price);
      } else {
        failedTokens.push(tokenId);
      }
    });
    await Promise.all(pricePromises);
    if (i + batchSize < uniqueTokenIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Step 2: Try midpoint for failed tokens
  if (failedTokens.length > 0) {
    console.log(`Trying midpoint for ${failedTokens.length} tokens...`);
    const stillFailed: string[] = [];
    for (const tokenId of failedTokens) {
      const mid = await fetchMidpointPrice(tokenId);
      if (mid !== null) {
        prices.set(tokenId, mid);
        console.log(`Got midpoint for ${tokenId.slice(0, 12)}...: ${mid}`);
      } else {
        stillFailed.push(tokenId);
      }
    }
    
    // Step 3: Fallback to tokens table for remaining
    if (stillFailed.length > 0) {
      console.log(`Falling back to tokens table for ${stillFailed.length} tokens...`);
      const fallback = await fetchFallbackPrices(supabase, stillFailed);
      for (const [id, price] of fallback) {
        prices.set(id, price);
        console.log(`Got fallback price for ${id.slice(0, 12)}...: ${price}`);
      }
      
      // Step 4: For still-missing tokens, use entry_price as last resort (market likely resolved)
      const finalMissing = stillFailed.filter(id => !fallback.has(id));
      if (finalMissing.length > 0) {
        console.log(`${finalMissing.length} tokens have no price source — will use market resolution logic`);
      }
    }
  }
  
  return prices;
}

// Calculate P/L for a position
function calculatePnL(
  side: string,
  size: number,
  entryPrice: number,
  currentPrice: number
): { pnl: number; pnlPercent: number } {
  // For LONG positions: profit when price goes up
  // For SHORT positions: profit when price goes down
  const priceDiff = side === 'LONG' 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  
  // P/L = size * price_difference (size is in USDC, price is 0-1)
  const pnl = size * priceDiff;
  
  // P/L percent relative to entry
  const pnlPercent = entryPrice > 0 ? (priceDiff / entryPrice) * 100 : 0;
  
  return { pnl, pnlPercent };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Parse request body
    let configId: string | undefined;
    let dryRun = false;
    
    try {
      const body = await req.json();
      configId = body.configId;
      dryRun = body.dryRun || false;
    } catch {
      // No body or invalid JSON - update all positions
    }

    // Build query for open positions
    let query = supabase
      .from("bot_positions")
      .select("*")
      .is("closed_at", null);
    
    if (configId) {
      query = query.eq("bot_config_id", configId);
    }
    
    const { data: positions, error: positionsError } = await query;
    
// === Auto-close expired poll positions ===
    // Detect positions from time-bounded polls (e.g. "7:30AM-7:35AM ET")
    const now = new Date();
    const expiredPositions: any[] = [];
    const activePositions: any[] = [];
    
    for (const pos of (positions || [])) {
      const mq = pos.market_question || '';
      // Parse both start and end times: "February 16, 7:30AM-7:35AM ET"
      const rangeMatch = mq.match(/(\d{1,2}):(\d{2})(AM|PM)\s*-\s*(\d{1,2}):(\d{2})(AM|PM)\s*ET$/i);
      const dateMatch = mq.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
      
      if (rangeMatch && dateMatch) {
        // Parse end time to check expiry
        let endHours = parseInt(rangeMatch[4]);
        const endMinutes = parseInt(rangeMatch[5]);
        const endAmpm = rangeMatch[6].toUpperCase();
        if (endAmpm === 'PM' && endHours !== 12) endHours += 12;
        if (endAmpm === 'AM' && endHours === 12) endHours = 0;
        
        const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const monthIdx = monthNames.indexOf(dateMatch[1].toLowerCase());
        const day = parseInt(dateMatch[2]);
        const year = now.getFullYear();
        
        // Create date in UTC, adjusting for ET (UTC-5)
        const expiryUtc = new Date(Date.UTC(year, monthIdx, day, endHours + 5, endMinutes));
        
        if (now > expiryUtc) {
          // Store parsed times for BTC price resolution
          let startHours = parseInt(rangeMatch[1]);
          const startMinutes = parseInt(rangeMatch[2]);
          const startAmpm = rangeMatch[3].toUpperCase();
          if (startAmpm === 'PM' && startHours !== 12) startHours += 12;
          if (startAmpm === 'AM' && startHours === 12) startHours = 0;
          
          const startUtc = new Date(Date.UTC(year, monthIdx, day, startHours + 5, startMinutes));
          
          pos._pollStartUtc = startUtc;
          pos._pollEndUtc = expiryUtc;
          expiredPositions.push(pos);
          continue;
        }
      }
      activePositions.push(pos);
    }
    
    // === Resolution Strategy 1: Polymarket Gamma API ===
    // Check if market is officially resolved and get token outcome prices
    async function resolveViaPolymarket(marketId: string, outcome: string): Promise<{ price: number; method: string } | null> {
      if (!marketId) return null;
      try {
        const res = await fetch(`https://gamma-api.polymarket.com/markets/${marketId}`);
        if (!res.ok) {
          console.warn(`Gamma API ${res.status} for market ${marketId.slice(0, 12)}...`);
          return null;
        }
        const market = await res.json();
        
        // Check if market is officially closed/resolved
        if (!market.closed && !market.resolved) {
          console.log(`Market ${marketId.slice(0, 12)}... not yet resolved on Polymarket`);
          return null;
        }
        
        // Get token prices from resolved market - they should be 0 or 1
        const tokens = market.tokens || [];
        const outcomeMap: Record<string, string> = { 'up': 'yes', 'down': 'no', 'yes': 'up', 'no': 'down' };
        const posOutcome = outcome?.toLowerCase();
        
        // Find matching token
        let token = tokens.find((t: any) => t.outcome?.toLowerCase() === posOutcome);
        if (!token) {
          const mapped = outcomeMap[posOutcome];
          if (mapped) token = tokens.find((t: any) => t.outcome?.toLowerCase() === mapped);
        }
        // Fallback: 2 tokens, match by position
        if (!token && tokens.length === 2) {
          const isPositive = ['yes', 'up'].includes(posOutcome);
          token = isPositive ? tokens[0] : tokens[1];
        }
        
        if (token) {
          const price = parseFloat(token.price);
          // Resolved markets should have prices very close to 0 or 1
          if (price >= 0.95) {
            console.log(`Polymarket resolved: ${outcome} = 1.00 (price=${price})`);
            return { price: 1.0, method: 'polymarket_resolved' };
          } else if (price <= 0.05) {
            console.log(`Polymarket resolved: ${outcome} = 0.00 (price=${price})`);
            return { price: 0.0, method: 'polymarket_resolved' };
          }
          // Price is intermediate - market not fully resolved yet
          console.log(`Polymarket price ${price} for ${outcome} — not clearly resolved`);
          return null;
        }
        return null;
      } catch (err) {
        console.error('Gamma API error:', err);
        return null;
      }
    }
    
    // === Resolution Strategy 2: Binance price fallback (multi-asset) ===
    const ASSET_SYMBOL_MAP: Record<string, string> = {
      bitcoin: 'BTCUSDT',
      btc: 'BTCUSDT',
      ethereum: 'ETHUSDT',
      eth: 'ETHUSDT',
      solana: 'SOLUSDT',
      sol: 'SOLUSDT',
      xrp: 'XRPUSDT',
      dogecoin: 'DOGEUSDT',
      doge: 'DOGEUSDT',
      bnb: 'BNBUSDT',
      avalanche: 'AVAXUSDT',
      avax: 'AVAXUSDT',
      cardano: 'ADAUSDT',
      ada: 'ADAUSDT',
      polygon: 'MATICUSDT',
      matic: 'MATICUSDT',
      chainlink: 'LINKUSDT',
      link: 'LINKUSDT',
      sui: 'SUIUSDT',
    };

    function detectBinanceSymbol(marketQuestion: string): string {
      const mq = marketQuestion.toLowerCase();
      for (const [keyword, symbol] of Object.entries(ASSET_SYMBOL_MAP)) {
        if (mq.includes(keyword)) return symbol;
      }
      return 'BTCUSDT'; // default fallback
    }

    async function fetchPriceAt(symbol: string, timestampMs: number): Promise<number | null> {
      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${timestampMs}&limit=1`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`Binance API error: ${res.status} for ${symbol}`);
          return null;
        }
        const klines = await res.json();
        if (klines && klines.length > 0) {
          return parseFloat(klines[0][4]); // close price
        }
        return null;
      } catch (err) {
        console.error(`Binance API error for ${symbol}:`, err);
        return null;
      }
    }
    
    async function resolveViaBinance(startUtc: Date, endUtc: Date, outcome: string, marketQuestion: string): Promise<{ price: number; method: string } | null> {
      const symbol = detectBinanceSymbol(marketQuestion);
      const [startPrice, endPrice] = await Promise.all([
        fetchPriceAt(symbol, startUtc.getTime()),
        fetchPriceAt(symbol, endUtc.getTime()),
      ]);
      if (startPrice === null || endPrice === null) {
        console.warn(`Binance fallback failed for ${symbol}: start=${startPrice}, end=${endPrice}`);
        return null;
      }
      const wentUp = endPrice >= startPrice;
      console.log(`Binance fallback (${symbol}): $${startPrice.toFixed(4)} → $${endPrice.toFixed(4)} = ${wentUp ? 'Up' : 'Down'}`);
      
      const posOutcome = outcome?.toLowerCase();
      const isMatch = (
        (wentUp && (posOutcome === 'up' || posOutcome === 'yes')) ||
        (!wentUp && (posOutcome === 'down' || posOutcome === 'no'))
      );
      return { price: isMatch ? 1.0 : 0.0, method: `binance_${symbol.replace('USDT','').toLowerCase()}_${wentUp ? 'up' : 'down'}` };
    }
    
    // Close expired positions with real resolution price
    let closedCount = 0;
    for (const pos of expiredPositions) {
      let resolutionPrice: number;
      let resolutionMethod = 'fallback';
      
      // Strategy 1: Check Polymarket for official resolution
      const polyResult = await resolveViaPolymarket(pos.market_id, pos.outcome);
      
      if (polyResult) {
        resolutionPrice = polyResult.price;
        resolutionMethod = polyResult.method;
        console.log(`Position ${pos.id.slice(0,8)}... resolved via Polymarket → ${resolutionPrice}`);
      } 
      // Strategy 2: Binance BTC price fallback
      else if (pos._pollStartUtc && pos._pollEndUtc) {
        const binanceResult = await resolveViaBinance(pos._pollStartUtc, pos._pollEndUtc, pos.outcome, pos.market_question || '');
        if (binanceResult) {
          resolutionPrice = binanceResult.price;
          resolutionMethod = binanceResult.method;
          console.log(`Position ${pos.id.slice(0,8)}... resolved via Binance fallback → ${resolutionPrice}`);
        } else {
          resolutionPrice = pos.current_price && pos.current_price > 0 ? pos.current_price : pos.entry_price;
          resolutionMethod = 'price_fallback';
        }
      } else {
        resolutionPrice = pos.current_price && pos.current_price > 0 ? pos.current_price : pos.entry_price;
        resolutionMethod = 'no_poll_times';
      }
      
      const priceDiff = pos.side === 'LONG' ? resolutionPrice - pos.entry_price : pos.entry_price - resolutionPrice;
      const finalPnl = pos.size * priceDiff;
      const finalPnlPercent = pos.entry_price > 0 ? (priceDiff / pos.entry_price) * 100 : 0;
      
      const { error: closeError } = await supabase
        .from('bot_positions')
        .update({
          closed_at: new Date().toISOString(),
          current_price: resolutionPrice,
          pnl: finalPnl,
          pnl_percent: finalPnlPercent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos.id);
      
      if (!closeError) {
        closedCount++;
        console.log(`Closed expired position ${pos.id.slice(0,8)}... "${pos.market_question}" resolution=${resolutionPrice} method=${resolutionMethod} PnL: $${finalPnl.toFixed(2)}`);
        
        // Log close event with resolution details
        if (pos.bot_config_id && pos.user_id) {
          await supabase.from('bot_events').insert({
            bot_config_id: pos.bot_config_id,
            user_id: pos.user_id,
            event_type: 'fill',
            message: `Resolved: ${pos.outcome} ${pos.side} → ${resolutionPrice === 1 ? 'WON' : resolutionPrice === 0 ? 'LOST' : 'CLOSED'} | PnL: $${finalPnl.toFixed(2)} (${finalPnlPercent.toFixed(1)}%)`,
            details: {
              position_id: pos.id,
              market_question: pos.market_question,
              outcome: pos.outcome,
              side: pos.side,
              size: pos.size,
              entry_price: pos.entry_price,
              exit_price: resolutionPrice,
              pnl: finalPnl,
              pnl_percent: finalPnlPercent,
              resolution_method: resolutionMethod,
              reason: 'poll_resolved',
            },
            reasons: [`Poll resolved via ${resolutionMethod}`],
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
    
    if (closedCount > 0) {
      console.log(`Auto-closed ${closedCount} expired poll positions`);
    }
    
    if (positionsError) {
      console.error("Error fetching positions:", positionsError);
      return new Response(
        JSON.stringify({ success: false, error: positionsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!activePositions || activePositions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: closedCount > 0 ? `Closed ${closedCount} expired positions, no active positions to update` : "No open positions to update",
          updated: 0,
          skipped: 0,
          closed: closedCount
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${activePositions.length} active positions to update (${closedCount} expired closed)`);
    
    // Resolve missing token_ids from market_id + outcome
    const positionsNeedingTokens = activePositions.filter((p: any) => !p.token_id && p.market_id);
    console.log(`Positions needing token resolution: ${positionsNeedingTokens.length}`);
    
    if (positionsNeedingTokens.length > 0) {
      const marketIds = [...new Set(positionsNeedingTokens.map((p: any) => p.market_id))];
      const { data: tokens } = await supabase
        .from('tokens')
        .select('id, market_id, outcome')
        .in('market_id', marketIds);
      
      console.log(`Found ${tokens?.length || 0} tokens for ${marketIds.length} markets`);
      
      if (tokens && tokens.length > 0) {
        const outcomeMap: Record<string, string> = {
          'up': 'yes', 'down': 'no', 'yes': 'up', 'no': 'down'
        };
        
        for (const pos of positionsNeedingTokens) {
          const marketTokens = tokens.filter((t: any) => t.market_id === pos.market_id);
          
          // Try exact match
          let token = marketTokens.find((t: any) => 
            t.outcome?.toLowerCase() === pos.outcome?.toLowerCase()
          );
          
          // Try mapped match (Up→Yes, Down→No)
          if (!token) {
            const mapped = outcomeMap[pos.outcome?.toLowerCase()];
            if (mapped) {
              token = marketTokens.find((t: any) => t.outcome?.toLowerCase() === mapped);
            }
          }
          
          // Fallback: 2 tokens, match by position
          if (!token && marketTokens.length === 2) {
            const isPositive = ['yes', 'up'].includes(pos.outcome?.toLowerCase());
            token = isPositive ? marketTokens[0] : marketTokens[1];
          }
          
          if (token) {
            pos.token_id = token.id;
            await supabase.from('bot_positions').update({ token_id: token.id }).eq('id', pos.id);
            console.log(`Resolved token_id for position ${pos.id} (${pos.outcome} → ${token.outcome}): ${token.id.slice(0, 10)}...`);
          } else {
            console.log(`Could not resolve token for position ${pos.id} market=${pos.market_id} outcome=${pos.outcome}`);
          }
        }
      }
    }

    // Get all unique token IDs
    const tokenIds = activePositions
      .map((p: any) => p.token_id)
      .filter((id: string | null): id is string => id !== null);
    
    if (tokenIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No active positions with resolvable token IDs",
          updated: 0,
          skipped: activePositions.length,
          closed: closedCount
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch current prices with fallback chain
    console.log(`Fetching prices for ${tokenIds.length} unique tokens...`);
    const prices = await fetchTokenPrices(tokenIds, supabase);
    console.log(`Got prices for ${prices.size} tokens`);
    
    // For positions without prices, check if market is closed and use current_price or entry_price
    const marketIds = [...new Set(activePositions.map((p: any) => p.market_id).filter(Boolean))];
    const { data: marketsData } = await supabase
      .from('markets')
      .select('id, closed')
      .in('id', marketIds);
    const closedMarkets = new Set((marketsData || []).filter((m: any) => m.closed).map((m: any) => m.id));
    
    // Calculate updates
    const updates: PriceUpdate[] = [];
    const skipped: string[] = [];
    
    for (const position of activePositions as BotPosition[]) {
      if (!position.token_id) {
        skipped.push(position.id);
        continue;
      }
      
      let currentPrice = prices.get(position.token_id);
      
      // Fallback for closed markets: use current_price if already set, or entry_price
      if (currentPrice === undefined && closedMarkets.has(position.market_id)) {
        currentPrice = position.current_price && position.current_price > 0 
          ? position.current_price 
          : position.entry_price;
        console.log(`Using fallback price ${currentPrice} for closed market position ${position.id.slice(0, 8)}...`);
      }
      
      if (currentPrice === undefined) {
        skipped.push(position.id);
        continue;
      }
      
      const { pnl, pnlPercent } = calculatePnL(
        position.side,
        position.size,
        position.entry_price,
        currentPrice
      );
      
      updates.push({
        positionId: position.id,
        tokenId: position.token_id,
        oldPrice: position.current_price,
        newPrice: currentPrice,
        pnl,
        pnlPercent
      });
    }

    console.log(`Prepared ${updates.length} updates, ${skipped.length} skipped`);
    
    if (dryRun) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          dryRun: true,
          updates,
          skipped,
          message: `Would update ${updates.length} positions`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply updates
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    for (const update of updates) {
      const { error } = await supabase
        .from("bot_positions")
        .update({
          current_price: update.newPrice,
          pnl: update.pnl,
          pnl_percent: update.pnlPercent,
          updated_at: new Date().toISOString()
        })
        .eq("id", update.positionId);
      
      if (error) {
        console.error(`Error updating position ${update.positionId}:`, error);
        errors.push(`${update.positionId}: ${error.message}`);
        errorCount++;
      } else {
        successCount++;
      }
    }

    // Log summary event if we have a configId
    if (configId && successCount > 0) {
      // Get user_id from the config
      const { data: config } = await supabase
        .from("bot_configs")
        .select("user_id")
        .eq("id", configId)
        .single();
      
      if (config?.user_id) {
        await supabase.from("bot_events").insert({
          bot_config_id: configId,
          user_id: config.user_id,
          event_type: "price_update",
          message: `Updated prices for ${successCount} positions`,
          details: {
            updated: successCount,
            skipped: skipped.length,
            errors: errorCount,
            timestamp: Date.now()
          },
          reasons: updates.slice(0, 5).map(u => 
            `${u.tokenId.slice(0, 8)}... ${(u.oldPrice ?? 0) * 100}¢ → ${u.newPrice * 100}¢`
          ),
          timestamp: new Date().toISOString()
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: successCount,
        skipped: skipped.length,
        errors: errorCount,
        errorDetails: errors.length > 0 ? errors : undefined,
        summary: updates.slice(0, 10).map(u => ({
          positionId: u.positionId,
          price: `${(u.oldPrice ?? 0) * 100}¢ → ${u.newPrice * 100}¢`,
          pnl: u.pnl.toFixed(2),
          pnlPercent: u.pnlPercent.toFixed(2) + '%'
        }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
