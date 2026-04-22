/**
 * Centralized Liquidity Score calculation utility.
 * 
 * The score is a 0-100 metric derived from:
 * - Liquidity (60% weight): Raw dollar liquidity in the market
 * - Volume 24h (40% weight): Trading activity over last 24 hours
 * 
 * Uses logarithmic scaling to normalize values up to ~$1M range.
 */

export interface LiquidityScoreInput {
  liquidity_score?: number | null;
  liquidity?: number | null;
  volume_24h?: number | null;
}

/**
 * Calculate liquidity score from raw data.
 * This is the core formula used by sync-markets edge function.
 */
export function computeLiquidityScore(liquidity: number, volume24h: number): number {
  const liq = Math.max(0, liquidity);
  const vol = Math.max(0, volume24h);
  
  // Logarithmic scaling: log10(1M) ≈ 6, so we use 6 as the divisor
  const liqScore = Math.min(60, (Math.log10(liq + 1) / 6) * 60);
  const volScore = Math.min(40, (Math.log10(vol + 1) / 6) * 40);
  
  return Math.max(0, Math.min(100, Math.round(liqScore + volScore)));
}

/**
 * Get the effective liquidity score for a market.
 * 
 * Priority:
 * 1. Use stored score if it exists and is > 0
 * 2. Calculate dynamically if stored score is 0/null but raw data exists
 * 3. Return 0 if no data available
 * 
 * This ensures UI always shows accurate scores even when DB hasn't been updated.
 */
export function getEffectiveLiquidityScore(market: LiquidityScoreInput | null | undefined): number {
  if (!market) return 0;
  
  const storedScore = market.liquidity_score;
  
  // If we have a valid stored score > 0, use it
  if (storedScore !== null && storedScore !== undefined && storedScore > 0) {
    return storedScore;
  }
  
  // Otherwise, calculate from raw data if available
  const liquidity = market.liquidity ?? 0;
  const volume24h = market.volume_24h ?? 0;
  
  // Only calculate if we have some data
  if (liquidity > 0 || volume24h > 0) {
    return computeLiquidityScore(liquidity, volume24h);
  }
  
  return 0;
}
