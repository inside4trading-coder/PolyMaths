import type { BotPosition } from '@/hooks/usePolymarket';

/**
 * Calculate floating PnL for a single position based on entry/current price, size, and side.
 * LONG: profit when current > entry → pnl = (current - entry) * size
 * SHORT: profit when current < entry → pnl = (entry - current) * size
 */
export function calculateFloatingPnl(pos: BotPosition): number {
  const entry = pos.entry_price;
  const current = pos.current_price ?? entry;
  const size = pos.size;

  if (pos.side === 'LONG') {
    return (current - entry) * size;
  } else {
    return (entry - current) * size;
  }
}

/**
 * Get the effective PnL for a position:
 * - Closed positions: use the persisted pnl field
 * - Open positions: calculate on-the-fly from prices
 */
export function getEffectivePnl(pos: BotPosition): number {
  if (pos.closed_at && pos.pnl !== null && pos.pnl !== 0) {
    return pos.pnl;
  }
  return calculateFloatingPnl(pos);
}

/**
 * Aggregate PnL across positions, splitting realized vs floating,
 * and further splitting realized into trade vs redeem.
 * "Today" is determined by comparing closed_at to the start of the current UTC day.
 */
export function aggregatePnl(positions: BotPosition[]) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  let realizedToday = 0;
  let floating = 0;
  let realizedTrade = 0;
  let realizedRedeem = 0;

  for (const pos of positions) {
    if (pos.closed_at) {
      const pnl = pos.pnl ?? 0;
      const closeReason = (pos as any).close_reason as string | null;

      if (closeReason === 'redeem') {
        realizedRedeem += pnl;
      } else {
        realizedTrade += pnl;
      }

      // Only count today's realized PnL
      if (pos.closed_at >= todayIso) {
        realizedToday += pnl;
      }
    } else {
      floating += calculateFloatingPnl(pos);
    }
  }

  return {
    realizedToday,
    floating,
    realizedTrade,
    realizedRedeem,
    total: realizedTrade + realizedRedeem + floating,
  };
}
