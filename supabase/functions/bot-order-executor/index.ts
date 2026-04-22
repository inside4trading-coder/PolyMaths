// Edge Function: bot-order-executor
// Deploy name: bot-order-executor
// Referenced by: cron job "bot-auto-poll" (every 2 min), frontend via supabase.functions.invoke('bot-order-executor')
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLOB_API = 'https://clob.polymarket.com';

interface QueueSignal {
  id: string;
  bot_config_id: string;
  user_id: string;
  activity_id: string;
  market_id: string | null;
  market_question: string | null;
  wallet_address: string;
  outcome: string;
  side: string;
  size: number;
  usdc_size: number | null;
  price: number;
  score: number;
}

interface OrderbookLevel {
  price: string;
  size: string;
}

interface OrderbookResponse {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

// Simulate order fill using real orderbook data
async function simulateOrderFill(
  tokenId: string,
  side: string,
  size: number,
  targetPrice: number
): Promise<{ filledPrice: number; slippage: number; levels: number }> {
  try {
    const url = `${CLOB_API}/book?token_id=${tokenId}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log('[bot-order-executor] Orderbook fetch failed, using target price');
      return { filledPrice: targetPrice, slippage: 0, levels: 0 };
    }

    const orderbook: OrderbookResponse = await response.json();
    
    // For BUY orders, we eat through asks; for SELL, we eat through bids
    const levels = side === 'BUY' ? orderbook.asks : orderbook.bids;
    
    if (!levels || levels.length === 0) {
      console.log('[bot-order-executor] No orderbook levels, using target price');
      return { filledPrice: targetPrice, slippage: 0, levels: 0 };
    }

    // Sort: asks ascending, bids descending
    const sortedLevels = [...levels].sort((a, b) => {
      const priceA = parseFloat(a.price);
      const priceB = parseFloat(b.price);
      return side === 'BUY' ? priceA - priceB : priceB - priceA;
    });

    // Simulate filling through orderbook levels
    let remainingSize = size;
    let totalCost = 0;
    let levelsUsed = 0;

    for (const level of sortedLevels) {
      if (remainingSize <= 0) break;
      
      const levelPrice = parseFloat(level.price);
      const levelSize = parseFloat(level.size);
      const fillSize = Math.min(remainingSize, levelSize * levelPrice); // Convert to USDC
      
      totalCost += fillSize;
      remainingSize -= fillSize;
      levelsUsed++;
    }

    // If we couldn't fill everything, add remaining at worst price
    if (remainingSize > 0) {
      const worstPrice = parseFloat(sortedLevels[sortedLevels.length - 1]?.price || String(targetPrice));
      totalCost += remainingSize;
    }

    const filledPrice = size > 0 ? totalCost / size : targetPrice;
    const slippage = Math.abs(filledPrice - targetPrice) / targetPrice;

    return { 
      filledPrice: Math.round(filledPrice * 10000) / 10000, 
      slippage: Math.round(slippage * 10000) / 10000,
      levels: levelsUsed 
    };
  } catch (error) {
    console.error('[bot-order-executor] Orderbook simulation error:', error);
    return { filledPrice: targetPrice, slippage: 0, levels: 0 };
  }
}

// Get token ID from market and outcome
// Handles outcome naming mismatches (Up/Down vs Yes/No)
async function getTokenId(
  supabase: any,
  marketId: string,
  outcome: string
): Promise<string | null> {
  const { data: tokens } = await supabase
    .from('tokens')
    .select('id, outcome')
    .eq('market_id', marketId);

  if (!tokens || tokens.length === 0) return null;

  const typedTokens = tokens as Array<{ id: string; outcome: string }>;

  // Try exact match first
  let token = typedTokens.find(t => 
    t.outcome?.toLowerCase() === outcome?.toLowerCase()
  );

  // Try mapping: Up→Yes, Down→No (common Polymarket pattern)
  if (!token) {
    const outcomeMap: Record<string, string> = {
      'up': 'yes', 'down': 'no', 'yes': 'up', 'no': 'down'
    };
    const mapped = outcomeMap[outcome?.toLowerCase()];
    if (mapped) {
      token = typedTokens.find(t => t.outcome?.toLowerCase() === mapped);
    }
  }

  // Fallback: if only 2 tokens, match by position (first=Yes/Up, second=No/Down)
  if (!token && typedTokens.length === 2) {
    const isPositive = ['yes', 'up'].includes(outcome?.toLowerCase());
    token = isPositive ? typedTokens[0] : typedTokens[1];
  }

  return token?.id || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { configId, dryRun = false } = await req.json().catch(() => ({}));

    // Max signals per invocation — tuned to fit within 60s edge function timeout.
    // Measured rate: ~8 orders/sec. 250 signals ≈ ~31s processing + ~10s overhead = safe.
    const MAX_PER_INVOCATION = 250;

    console.log('[bot-order-executor] Starting execution...', { configId, dryRun });

    // 1. Get active bot config(s) — support multi-config for cron
    let configQuery = supabase
      .from('bot_configs')
      .select('*')
      .eq('status', 'running')
      .eq('mode', 'paper');

    if (configId) {
      configQuery = configQuery.eq('id', configId);
    }

    const { data: configs, error: configError } = await configQuery.limit(20);

    if (configError || !configs || configs.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active paper trading configs found',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process first config (backwards compatible) or iterate all
    const config = configs[0];
    console.log('[bot-order-executor] Config loaded:', config.id, `(${configs.length} total)`);

    // 2. Fetch pending signals from queue — O(1) indexed lookup, no full-table scan
    const { data: signals, error: signalError } = await supabase
      .from('bot_signals_queue')
      .select('*')
      .eq('bot_config_id', config.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_PER_INVOCATION);

    if (signalError) {
      throw new Error(`Failed to fetch pending signals: ${signalError.message}`);
    }

    const hasMore = signals?.length === MAX_PER_INVOCATION;

    console.log('[bot-order-executor] Pending signals from queue:', signals?.length || 0, hasMore ? '(more pending)' : '(all caught up)');

    if (!signals || signals.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        processed: 0,
        message: 'No pending signals in queue'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Process each signal
    const STATUS_CHECK_INTERVAL = 50; // Re-verify bot status every N signals
    const results: Array<{
      signalId: string;
      activityId: string;
      status: 'created' | 'skipped' | 'error';
      orderId?: string;
      positionId?: string;
      filledPrice?: number;
      slippage?: number;
      error?: string;
    }> = [];

    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i] as QueueSignal;

      // Mid-execution status check: abort if bot was paused during processing
      if (i > 0 && i % STATUS_CHECK_INTERVAL === 0) {
        const { data: freshConfig } = await supabase
          .from('bot_configs')
          .select('status')
          .eq('id', config.id)
          .single();
        
        if (freshConfig?.status !== 'running') {
          console.log(`[bot-order-executor] Bot paused mid-execution at signal ${i}/${signals.length}. Stopping.`);
          break;
        }
      }
      
      // Skip if no activity_id (malformed signal)
      if (!signal.activity_id) {
        await supabase.from('bot_signals_queue').update({ status: 'skipped', processed_at: new Date().toISOString() }).eq('id', signal.id);
        results.push({
          signalId: signal.id,
          activityId: 'unknown',
          status: 'skipped',
          error: 'Missing activity_id in signal'
        });
        continue;
      }

      try {
        // Verify market exists if market_id is present
        let marketExists = false;
        if (signal.market_id) {
          const { data: market } = await supabase
            .from('markets')
            .select('id')
            .eq('id', signal.market_id)
            .single();
          marketExists = !!market;
        }

        // Get token ID for orderbook lookup
        let tokenId: string | null = null;
        if (signal.market_id && marketExists) {
          tokenId = await getTokenId(supabase, signal.market_id, signal.outcome);
        }

        // Simulate order fill
        const tradeSize = signal.usdc_size || (signal.size * (signal.price <= 1 ? signal.price : signal.price / 100));
        const { filledPrice, slippage, levels } = tokenId
          ? await simulateOrderFill(tokenId, signal.side, tradeSize, signal.price)
          : { filledPrice: signal.price, slippage: 0, levels: 0 };

        console.log('[bot-order-executor] Simulated fill:', {
          tokenId, side: signal.side, size: tradeSize,
          targetPrice: signal.price, filledPrice, slippage, levels
        });

        if (dryRun) {
          results.push({
            signalId: signal.id, activityId: signal.activity_id,
            status: 'skipped', filledPrice, slippage,
            error: 'Dry run - no changes made'
          });
          continue;
        }

        // Create bot_order
        const orderData = {
          bot_config_id: config.id,
          user_id: config.user_id,
          market_id: marketExists ? signal.market_id : null,
          token_id: tokenId,
          outcome: signal.outcome,
          side: signal.side,
          size: tradeSize,
          price: signal.price,
          status: 'filled',
          filled_size: tradeSize,
          filled_price: filledPrice,
          simulated_slippage: slippage,
          source_activity_id: signal.activity_id,
          reasons: [
            `Copied from ${signal.wallet_address?.slice(0, 8)}...`,
            `Orderbook depth: ${levels} levels`,
            `Slippage: ${(slippage * 100).toFixed(2)}%`
          ],
        };

        const { data: order, error: orderError } = await supabase
          .from('bot_orders')
          .insert(orderData)
          .select()
          .single();

        if (orderError) {
          throw new Error(`Order insert failed: ${orderError.message}`);
        }

        // --- Position Netting Logic ---
        const positionSide = signal.side === 'BUY' ? 'LONG' : 'SHORT';
        const oppositeSide = signal.side === 'BUY' ? 'SHORT' : 'LONG';
        const effectiveMarketId = marketExists ? signal.market_id : null;

        const findOpenPosition = async (side: string) => {
          let posQuery = supabase
            .from('bot_positions')
            .select('*')
            .eq('bot_config_id', config.id)
            .eq('outcome', signal.outcome)
            .eq('side', side)
            .is('closed_at', null);
          
          if (signal.market_question) {
            posQuery = posQuery.eq('market_question', signal.market_question);
          } else if (effectiveMarketId) {
            posQuery = posQuery.eq('market_id', effectiveMarketId);
          }
          
          const { data } = await posQuery.order('opened_at', { ascending: false }).limit(1).maybeSingle();
          return data;
        };

        const oppositePosition = await findOpenPosition(oppositeSide);
        const samePosition = await findOpenPosition(positionSide);

        let positionId: string;
        let netted = false;

        if (oppositePosition) {
          const remainingAfterNet = oppositePosition.size - tradeSize;
          
          if (remainingAfterNet > 0.01) {
            const realizedPnl = oppositeSide === 'LONG'
              ? (filledPrice - oppositePosition.entry_price) * tradeSize
              : (oppositePosition.entry_price - filledPrice) * tradeSize;

            const { error: updateError } = await supabase
              .from('bot_positions')
              .update({
                size: remainingAfterNet,
                current_price: filledPrice,
                pnl: (oppositePosition.pnl || 0) + realizedPnl,
                pnl_percent: realizedPnl / (oppositePosition.entry_price * tradeSize) * 100,
                reasons: [...(oppositePosition.reasons || []), `Netted -$${tradeSize.toFixed(0)} @ ${filledPrice} (PnL: $${realizedPnl.toFixed(2)})`],
                updated_at: new Date().toISOString(),
              })
              .eq('id', oppositePosition.id);

            if (updateError) throw new Error(`Netting update failed: ${updateError.message}`);
            positionId = oppositePosition.id;
            netted = true;

          } else if (remainingAfterNet >= -0.01) {
            const realizedPnl = oppositeSide === 'LONG'
              ? (filledPrice - oppositePosition.entry_price) * oppositePosition.size
              : (oppositePosition.entry_price - filledPrice) * oppositePosition.size;

            const { error: closeError } = await supabase
              .from('bot_positions')
              .update({
                size: oppositePosition.size,
                current_price: filledPrice,
                pnl: (oppositePosition.pnl || 0) + realizedPnl,
                pnl_percent: realizedPnl / (oppositePosition.entry_price * oppositePosition.size) * 100,
                closed_at: new Date().toISOString(),
                close_reason: 'trade',
                reasons: [...(oppositePosition.reasons || []), `Closed via netting @ ${filledPrice} (PnL: $${realizedPnl.toFixed(2)})`],
                updated_at: new Date().toISOString(),
              })
              .eq('id', oppositePosition.id);

            if (closeError) throw new Error(`Netting close failed: ${closeError.message}`);
            positionId = oppositePosition.id;
            netted = true;

          } else {
            const closePnl = oppositeSide === 'LONG'
              ? (filledPrice - oppositePosition.entry_price) * oppositePosition.size
              : (oppositePosition.entry_price - filledPrice) * oppositePosition.size;

            const { error: closeError } = await supabase
              .from('bot_positions')
              .update({
                current_price: filledPrice,
                pnl: (oppositePosition.pnl || 0) + closePnl,
                pnl_percent: closePnl / (oppositePosition.entry_price * oppositePosition.size) * 100,
                closed_at: new Date().toISOString(),
                close_reason: 'trade',
                reasons: [...(oppositePosition.reasons || []), `Closed via netting @ ${filledPrice} (PnL: $${closePnl.toFixed(2)})`],
                updated_at: new Date().toISOString(),
              })
              .eq('id', oppositePosition.id);

            if (closeError) throw new Error(`Netting oversize close failed: ${closeError.message}`);

            const excessSize = Math.abs(remainingAfterNet);
            const excessData = {
              bot_config_id: config.id,
              user_id: config.user_id,
              market_id: effectiveMarketId,
              market_question: signal.market_question,
              token_id: tokenId,
              outcome: signal.outcome,
              side: positionSide,
              size: excessSize,
              entry_price: filledPrice,
              current_price: filledPrice,
              pnl: 0,
              pnl_percent: 0,
              triggered_by: `Wallet: ${signal.wallet_address?.slice(0, 8)}...`,
              source_activity_id: signal.activity_id,
              reasons: [`Excess from netting: $${excessSize.toFixed(0)} @ ${filledPrice}`],
            };

            const { data: excessPosition, error: excessError } = await supabase
              .from('bot_positions')
              .insert(excessData)
              .select()
              .single();

            if (excessError) throw new Error(`Excess position insert failed: ${excessError.message}`);
            positionId = excessPosition.id;
            netted = true;
          }

        } else if (samePosition) {
          const newSize = samePosition.size + tradeSize;
          const newEntryPrice = (
            (samePosition.entry_price * samePosition.size) + 
            (filledPrice * tradeSize)
          ) / newSize;

          const { error: updateError } = await supabase
            .from('bot_positions')
            .update({
              size: newSize,
              entry_price: newEntryPrice,
              current_price: filledPrice,
              reasons: [...(samePosition.reasons || []), `Added $${tradeSize.toFixed(0)} @ ${filledPrice}`],
              updated_at: new Date().toISOString(),
            })
            .eq('id', samePosition.id);

          if (updateError) throw new Error(`Position update failed: ${updateError.message}`);
          positionId = samePosition.id;

        } else {
          const positionData = {
            bot_config_id: config.id,
            user_id: config.user_id,
            market_id: effectiveMarketId,
            market_question: signal.market_question,
            token_id: tokenId,
            outcome: signal.outcome,
            side: positionSide,
            size: tradeSize,
            entry_price: filledPrice,
            current_price: filledPrice,
            pnl: 0,
            pnl_percent: 0,
            triggered_by: `Wallet: ${signal.wallet_address?.slice(0, 8)}...`,
            source_activity_id: signal.activity_id,
            reasons: [],
          };

          const { data: position, error: positionError } = await supabase
            .from('bot_positions')
            .insert(positionData)
            .select()
            .single();

          if (positionError) throw new Error(`Position insert failed: ${positionError.message}`);
          positionId = position.id;
        }

        // Create 'order' and 'fill' events
        const fillMessage = netted
          ? `Netted: ${signal.side} ${signal.outcome} @ $${filledPrice.toFixed(4)} (reduced opposite position)`
          : `Filled: ${signal.side} ${signal.outcome} @ $${filledPrice.toFixed(4)} (${(slippage * 100).toFixed(2)}% slippage)`;

        const events = [
          {
            bot_config_id: config.id,
            user_id: config.user_id,
            event_type: 'order',
            message: `Order: ${signal.side} ${signal.outcome} @ $${signal.price.toFixed(4)}`,
            details: {
              order_id: order.id,
              market_question: signal.market_question,
              side: signal.side,
              outcome: signal.outcome,
              size: tradeSize,
              price: signal.price,
              netted,
            },
            reasons: [`From signal: ${signal.id.slice(0, 8)}`],
            timestamp: new Date().toISOString(),
          },
          {
            bot_config_id: config.id,
            user_id: config.user_id,
            event_type: 'fill',
            message: fillMessage,
            details: {
              order_id: order.id,
              position_id: positionId,
              filled_price: filledPrice,
              filled_size: tradeSize,
              slippage,
              orderbook_levels: levels,
              netted,
            },
            reasons: [netted ? `Netted against opposite position` : `Simulated via orderbook`],
            timestamp: new Date().toISOString(),
          }
        ];

        await supabase.from('bot_events').insert(events);

        // Mark signal as processed in queue
        await supabase
          .from('bot_signals_queue')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .eq('id', signal.id);

        results.push({
          signalId: signal.id,
          activityId: signal.activity_id,
          status: 'created',
          orderId: order.id,
          positionId,
          filledPrice,
          slippage,
        });

      } catch (error) {
        console.error('[bot-order-executor] Error processing signal:', error);
        // Mark signal as error in queue
        await supabase
          .from('bot_signals_queue')
          .update({ status: 'error', processed_at: new Date().toISOString() })
          .eq('id', signal.id);
        results.push({
          signalId: signal.id,
          activityId: signal.activity_id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log('[bot-order-executor] Complete:', { created, skipped, errors, hasMore });

    return new Response(JSON.stringify({ 
      success: true, 
      processed: signals.length,
      created,
      skipped,
      errors,
      hasMore,
      results,
      dryRun,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[bot-order-executor] Error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
