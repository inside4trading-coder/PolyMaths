import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BATCH_SIZE = 200;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { configId, offset = 0, sinceDate } = await req.json().catch(() => ({}));

    if (!configId) {
      return new Response(JSON.stringify({ success: false, error: 'configId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[bot-backfill] Starting offset=${offset}, sinceDate=${sinceDate || 'today'}`);

    // 1. Load bot config
    const { data: config, error: configError } = await supabase
      .from('bot_configs').select('*').eq('id', configId).single();

    if (configError || !config) {
      return new Response(JSON.stringify({ success: false, error: 'Config not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wallets: string[] = config.wallets || [];
    if (wallets.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No wallets configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Allow configurable start date (default: today UTC)
    let startDate: string;
    if (sinceDate) {
      startDate = new Date(sinceDate).toISOString();
    } else {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      startDate = todayStart.toISOString();
    }

    // 2. Pre-load ALL needed data in parallel
    const [processedRes, activitiesRes, positionsRes, marketsRes, tokensRes] = await Promise.all([
      supabase.from('bot_orders').select('source_activity_id')
        .eq('bot_config_id', config.id).not('source_activity_id', 'is', null),
      // Fetch TRADE, SPLIT, and REDEEM activities
      supabase.from('wallet_activity').select('*')
        .in('wallet_address', wallets)
        .in('activity_type', ['TRADE', 'SPLIT', 'REDEEM'])
        .gte('timestamp', startDate)
        .order('timestamp', { ascending: true })
        .range(offset, offset + BATCH_SIZE + 999),
      supabase.from('bot_positions').select('*')
        .eq('bot_config_id', config.id).is('closed_at', null),
      supabase.from('markets').select('id'),
      supabase.from('tokens').select('id, market_id, outcome'),
    ]);

    const processedIds = new Set(processedRes.data?.map((o: any) => o.source_activity_id) || []);
    const activities = activitiesRes.data || [];

    if (activities.length === 0) {
      return new Response(JSON.stringify({
        success: true, processed: 0, remaining: 0, nextOffset: offset, message: 'No more activities'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build lookups
    const marketIds = new Set((marketsRes.data || []).map((m: any) => m.id));
    const tokenMap = new Map<string, string>();
    for (const t of (tokensRes.data || []) as Array<{ id: string; market_id: string; outcome: string }>) {
      tokenMap.set(`${t.market_id}:${t.outcome.toLowerCase()}`, t.id);
    }

    function resolveTokenId(mId: string, out: string): string | null {
      let id = tokenMap.get(`${mId}:${out.toLowerCase()}`);
      if (id) return id;
      const map: Record<string, string> = { 'up': 'yes', 'down': 'no', 'yes': 'up', 'no': 'down' };
      const mapped = map[out.toLowerCase()];
      if (mapped) id = tokenMap.get(`${mId}:${mapped}`);
      return id || null;
    }

    // In-memory position state keyed by condition_id + side (more precise than market_question)
    // Fallback key uses market_question for backward compat
    const positions = new Map<string, any>();
    for (const p of (positionsRes.data || [])) {
      const key = posKeyFromPos(p);
      positions.set(key, { ...p, _dirty: false, _new: false });
    }

    // Key by condition_id when available, else market_question/market_id
    function posKeyFromPos(p: any): string {
      // Try to find condition_id from reasons or market metadata
      const base = p.market_question || p.market_id || 'unknown';
      return `${p.outcome}|${base}|${p.side}`;
    }

    const posKey = (outcome: string, mq: string | null, mId: string | null, side: string) =>
      `${outcome}|${mq || mId || 'unknown'}|${side}`;

    const findOpen = (outcome: string, mq: string | null, mId: string | null, side: string) => {
      const k = posKey(outcome, mq, mId, side);
      const p = positions.get(k);
      return (p && !p.closed_at) ? p : null;
    };

    // Find ANY open position for a market (by condition_id match via market_question)
    const findOpenByMarket = (mq: string | null, mId: string | null): any[] => {
      const results: any[] = [];
      const matchKey = mq || mId || 'unknown';
      for (const [k, p] of positions.entries()) {
        if (!p.closed_at && k.includes(`|${matchKey}|`)) {
          results.push(p);
        }
      }
      return results;
    };

    // Filter & slice
    const unprocessed = activities.filter((a: any) => !processedIds.has(a.id));
    const toProcess = unprocessed.slice(0, BATCH_SIZE);
    const remaining = unprocessed.length - toProcess.length;

    const tradeCount = toProcess.filter((a: any) => a.activity_type === 'TRADE').length;
    const splitCount = toProcess.filter((a: any) => a.activity_type === 'SPLIT').length;
    const redeemCount = toProcess.filter((a: any) => a.activity_type === 'REDEEM').length;

    console.log(`[bot-backfill] Fetched ${activities.length}, unprocessed ${unprocessed.length}, processing ${toProcess.length} (${tradeCount} trades, ${splitCount} splits, ${redeemCount} redeems)`);

    // Process all activities in-memory
    const orderInserts: any[] = [];
    const eventInserts: any[] = [];

    for (const act of toProcess) {
      const actType = act.activity_type as string;
      const outcome = act.outcome as string || 'Unknown';
      const price = act.price as number || 0;
      const marketId = act.market_id as string | null;
      const mq = act.market_question as string | null;
      const wa = act.wallet_address as string;
      const ts = act.timestamp as string;
      const conditionId = act.condition_id as string | null;
      const mExists = marketId ? marketIds.has(marketId) : false;
      const effMkt = mExists ? marketId : null;

      if (actType === 'SPLIT') {
        // SPLIT: User deposits USDC collateral and receives tokens for all outcomes
        // This is an investment of capital — creates positions at cost = usdc_size / num_outcomes
        // For binary markets: $300 split → $300 worth of Up tokens + $300 worth of Down tokens
        // The cost basis per outcome = usdc_size (the full collateral, since each outcome token is worth $1 if it wins)
        const splitUsdc = act.usdc_size || act.size || 0;
        
        // Record split as an event
        eventInserts.push({
          bot_config_id: config.id, user_id: config.user_id, event_type: 'info',
          message: `Backfill SPLIT: $${splitUsdc.toFixed(0)} collateral → tokens for "${mq || conditionId}"`,
          details: { activity_id: act.id, market_question: mq, condition_id: conditionId, usdc: splitUsdc, backfill: true },
          reasons: ['Backfill SPLIT'], timestamp: ts,
        });

        // Create order record for traceability
        orderInserts.push({
          id: crypto.randomUUID(), bot_config_id: config.id, user_id: config.user_id,
          market_id: effMkt, token_id: null, outcome: 'SPLIT', side: 'BUY',
          size: splitUsdc, price: 0.5, status: 'filled', filled_size: splitUsdc,
          filled_price: 0.5, simulated_slippage: 0, source_activity_id: act.id,
          reasons: [`Backfill SPLIT $${splitUsdc.toFixed(0)} from ${wa.slice(0, 8)}...`],
          created_at: ts, updated_at: ts,
        });

        // For binary markets, create LONG positions for both outcomes at entry_price = collateral/size
        // The split creates equal token holdings. Later TRADEs will sell one side.
        // We create positions for both Up and Down (binary market assumption)
        for (const outcomeName of ['Up', 'Down']) {
          const side = 'LONG';
          const tokenSize = act.size || splitUsdc; // shares received per outcome
          const entryPrice = splitUsdc / tokenSize; // should be ~0.5 for equal split
          const tokenId = (marketId && mExists) ? resolveTokenId(marketId, outcomeName) : null;

          const existing = findOpen(outcomeName, mq, effMkt, side);
          if (existing) {
            // Average in
            const newSize = existing.size + splitUsdc;
            existing.entry_price = ((existing.entry_price * existing.size) + (entryPrice * splitUsdc)) / newSize;
            existing.size = newSize;
            existing.updated_at = ts;
            existing._dirty = true;
          } else {
            const newPos = {
              id: crypto.randomUUID(), bot_config_id: config.id, user_id: config.user_id,
              market_id: effMkt, market_question: mq, token_id: tokenId,
              outcome: outcomeName, side, size: splitUsdc, entry_price: entryPrice,
              current_price: entryPrice, pnl: 0, pnl_percent: 0,
              triggered_by: `Wallet: ${wa.slice(0, 8)}...`,
              source_activity_id: act.id,
              reasons: [`Backfill SPLIT: ${outcomeName} @ ${entryPrice.toFixed(4)}`],
              opened_at: ts, created_at: ts, updated_at: ts, _new: true, _dirty: false,
            };
            positions.set(posKey(outcomeName, mq, effMkt, side), newPos);
          }
        }

      } else if (actType === 'REDEEM') {
        // REDEEM: User redeems winning outcome tokens for USDC
        // usdc_size = USDC received from redemption (the payout)
        // This closes all open positions for this market
        const redeemUsdc = act.usdc_size || act.size || 0;

        // Record redeem order
        orderInserts.push({
          id: crypto.randomUUID(), bot_config_id: config.id, user_id: config.user_id,
          market_id: effMkt, token_id: null, outcome: 'REDEEM', side: 'SELL',
          size: redeemUsdc, price: 1.0, status: 'filled', filled_size: redeemUsdc,
          filled_price: 1.0, simulated_slippage: 0, source_activity_id: act.id,
          reasons: [`Backfill REDEEM $${redeemUsdc.toFixed(2)} from ${wa.slice(0, 8)}...`],
          created_at: ts, updated_at: ts,
        });

        // Find all open positions for this market and close them
        const openPositions = findOpenByMarket(mq, effMkt);
        
        if (openPositions.length > 0) {
          // Calculate total cost basis across all open positions for this market
          let totalCostBasis = 0;
          for (const pos of openPositions) {
            totalCostBasis += pos.entry_price * pos.size;
          }

          // PnL = USDC received - total cost basis
          const totalPnl = redeemUsdc - totalCostBasis;

          // Close all positions, distributing PnL proportionally
          for (const pos of openPositions) {
            const posCost = pos.entry_price * pos.size;
            const posPnlShare = openPositions.length === 1 ? totalPnl : totalPnl * (posCost / totalCostBasis);
            
            pos.current_price = pos.side === 'LONG' ? 1.0 : 0.0;
            pos.pnl = (pos.pnl || 0) + posPnlShare;
            pos.pnl_percent = posCost > 0 ? (posPnlShare / posCost) * 100 : 0;
            pos.closed_at = ts;
            pos.close_reason = 'redeem';
            pos.updated_at = ts;
            pos._dirty = true;
          }

          console.log(`[bot-backfill] REDEEM "${mq}": $${redeemUsdc.toFixed(2)} received, cost basis $${totalCostBasis.toFixed(2)}, PnL $${totalPnl.toFixed(2)}, closed ${openPositions.length} positions`);
        } else {
          // No matching open position — this redeem is pure profit from positions opened before backfill window
          // Create a synthetic closed position to capture the PnL
          const newPos = {
            id: crypto.randomUUID(), bot_config_id: config.id, user_id: config.user_id,
            market_id: effMkt, market_question: mq, token_id: null,
            outcome: outcome !== 'Unknown' ? outcome : 'Redeemed', side: 'LONG',
            size: redeemUsdc, entry_price: 0, current_price: 1.0,
            pnl: redeemUsdc, pnl_percent: 100,
            triggered_by: `Wallet: ${wa.slice(0, 8)}...`,
            source_activity_id: act.id,
            reasons: [`Backfill REDEEM: $${redeemUsdc.toFixed(2)} (no prior position found)`],
            opened_at: ts, closed_at: ts, close_reason: 'redeem', created_at: ts, updated_at: ts, _new: true, _dirty: false,
          };
          positions.set(`redeem-${act.id}`, newPos);
          console.log(`[bot-backfill] REDEEM orphan "${mq}": +$${redeemUsdc.toFixed(2)} (no matching position)`);
        }

        eventInserts.push({
          bot_config_id: config.id, user_id: config.user_id, event_type: 'fill',
          message: `Backfill REDEEM: $${redeemUsdc.toFixed(2)} from "${mq || conditionId}"`,
          details: { activity_id: act.id, market_question: mq, condition_id: conditionId, usdc: redeemUsdc, backfill: true },
          reasons: ['Backfill REDEEM'], timestamp: ts,
        });

      } else if (actType === 'TRADE') {
        // Original TRADE logic
        const side = act.side as string;
        const tradeSize = act.usdc_size || (act.size * (price <= 1 ? price : price / 100));
        const tokenId = (marketId && mExists) ? resolveTokenId(marketId, outcome) : null;

        const orderId = crypto.randomUUID();
        orderInserts.push({
          id: orderId, bot_config_id: config.id, user_id: config.user_id,
          market_id: effMkt, token_id: tokenId, outcome, side,
          size: tradeSize, price, status: 'filled', filled_size: tradeSize,
          filled_price: price, simulated_slippage: 0, source_activity_id: act.id,
          reasons: [`Backfill from ${wa.slice(0, 8)}...`],
          created_at: ts, updated_at: ts,
        });

        const posSide = side === 'BUY' ? 'LONG' : 'SHORT';
        const oppSide = side === 'BUY' ? 'SHORT' : 'LONG';

        const opp = findOpen(outcome, mq, effMkt, oppSide);
        const same = findOpen(outcome, mq, effMkt, posSide);

        if (opp) {
          const rem = opp.size - tradeSize;
          opp._dirty = true;

          if (rem > 0.01) {
            const pnl = oppSide === 'LONG' ? (price - opp.entry_price) * tradeSize : (opp.entry_price - price) * tradeSize;
            opp.size = rem;
            opp.current_price = price;
            opp.pnl = (opp.pnl || 0) + pnl;
            opp.updated_at = ts;
          } else if (rem >= -0.01) {
            const pnl = oppSide === 'LONG' ? (price - opp.entry_price) * opp.size : (opp.entry_price - price) * opp.size;
            opp.current_price = price;
            opp.pnl = (opp.pnl || 0) + pnl;
            opp.closed_at = ts;
            opp.close_reason = 'trade';
            opp.updated_at = ts;
          } else {
            const closePnl = oppSide === 'LONG' ? (price - opp.entry_price) * opp.size : (opp.entry_price - price) * opp.size;
            opp.current_price = price;
            opp.pnl = (opp.pnl || 0) + closePnl;
            opp.closed_at = ts;
            opp.close_reason = 'trade';
            opp.updated_at = ts;

            const excess = Math.abs(rem);
            const newPos = {
              id: crypto.randomUUID(), bot_config_id: config.id, user_id: config.user_id,
              market_id: effMkt, market_question: mq, token_id: tokenId,
              outcome, side: posSide, size: excess, entry_price: price, current_price: price,
              pnl: 0, pnl_percent: 0, triggered_by: `Wallet: ${wa.slice(0, 8)}...`,
              source_activity_id: act.id, reasons: [`Backfill excess $${excess.toFixed(0)}`],
              opened_at: ts, created_at: ts, updated_at: ts, _new: true, _dirty: false,
            };
            positions.set(posKey(outcome, mq, effMkt, posSide), newPos);
          }
        } else if (same) {
          const newSize = same.size + tradeSize;
          same.entry_price = ((same.entry_price * same.size) + (price * tradeSize)) / newSize;
          same.size = newSize;
          same.current_price = price;
          same.updated_at = ts;
          same._dirty = true;
        } else {
          const newPos = {
            id: crypto.randomUUID(), bot_config_id: config.id, user_id: config.user_id,
            market_id: effMkt, market_question: mq, token_id: tokenId,
            outcome, side: posSide, size: tradeSize, entry_price: price, current_price: price,
            pnl: 0, pnl_percent: 0, triggered_by: `Wallet: ${wa.slice(0, 8)}...`,
            source_activity_id: act.id, reasons: [`Backfill: ${side} ${outcome} @ ${price}`],
            opened_at: ts, created_at: ts, updated_at: ts, _new: true, _dirty: false,
          };
          positions.set(posKey(outcome, mq, effMkt, posSide), newPos);
        }

        eventInserts.push({
          bot_config_id: config.id, user_id: config.user_id, event_type: 'fill',
          message: `Backfill: ${side} ${outcome} $${tradeSize.toFixed(0)} @ ${price}`,
          details: { order_id: orderId, market_question: mq, side, outcome, size: tradeSize, price, backfill: true },
          reasons: ['Backfill'], timestamp: ts,
        });
      }
    }

    // --- Flush to DB ---
    const dbOps: Promise<any>[] = [];

    if (orderInserts.length > 0) {
      dbOps.push(supabase.from('bot_orders').insert(orderInserts).then(({ error }) => {
        if (error) console.error('[bot-backfill] Orders error:', error.message);
      }));
    }

    if (eventInserts.length > 0) {
      dbOps.push(supabase.from('bot_events').insert(eventInserts).then(({ error }) => {
        if (error) console.error('[bot-backfill] Events error:', error.message);
      }));
    }

    await Promise.all(dbOps);

    // Position writes
    const newPosInserts: any[] = [];
    const dirtyUpdates: Array<{ id: string; data: any }> = [];

    for (const pos of positions.values()) {
      const { _new, _dirty, ...clean } = pos;
      if (_new) {
        newPosInserts.push(clean);
      } else if (_dirty) {
        dirtyUpdates.push({ id: clean.id, data: clean });
      }
    }

    if (newPosInserts.length > 0) {
      const { error } = await supabase.from('bot_positions').insert(newPosInserts);
      if (error) console.error('[bot-backfill] Position inserts error:', error.message);
    }

    for (let i = 0; i < dirtyUpdates.length; i += 10) {
      const batch = dirtyUpdates.slice(i, i + 10);
      await Promise.all(batch.map(({ id, data }) => {
        const { id: _, ...rest } = data;
        return supabase.from('bot_positions').update(rest).eq('id', id);
      }));
    }

    const nextOffset = offset + activities.length;
    console.log(`[bot-backfill] Done: processed=${toProcess.length} (${tradeCount}T/${splitCount}S/${redeemCount}R), newPos=${newPosInserts.length}, updatedPos=${dirtyUpdates.length}, remaining=${remaining}, nextOffset=${nextOffset}`);

    return new Response(JSON.stringify({
      success: true, processed: toProcess.length, remaining, nextOffset,
      breakdown: { trades: tradeCount, splits: splitCount, redeems: redeemCount },
      newPositions: newPosInserts.length, updatedPositions: dirtyUpdates.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[bot-backfill] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false, error: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
