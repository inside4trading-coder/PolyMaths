import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number | null;
  midpoint: number | null;
  timestamp: number;
}

interface UseOrderbookOptions {
  tokenId: string | null;
  refreshInterval?: number; // ms, default 3000
}

export function useOrderbook({ tokenId, refreshInterval = 3000 }: UseOrderbookOptions) {
  const [data, setData] = useState<OrderbookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const fetchOrderbook = useCallback(async () => {
    if (!tokenId) {
      setData(null);
      return;
    }

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('polymarket-clob', {
        body: {
          action: 'fetch_orderbook',
          params: { token_id: tokenId },
        },
      });

      if (fnError) throw fnError;

      if (result?.success && result?.orderbook) {
        const ob = result.orderbook;
        
        // Parse bids and asks - CLOB API returns { bids: [{price, size}], asks: [{price, size}] }
        const allBids: OrderbookLevel[] = (ob.bids || [])
          .map((b: [string, string] | { price: string; size: string }) => {
            if (Array.isArray(b)) {
              return { price: parseFloat(b[0]), size: parseFloat(b[1]) };
            }
            return { price: parseFloat(b.price), size: parseFloat(b.size) };
          })
          .filter((l: OrderbookLevel) => !isNaN(l.price) && !isNaN(l.size) && l.size > 0);

        const allAsks: OrderbookLevel[] = (ob.asks || [])
          .map((a: [string, string] | { price: string; size: string }) => {
            if (Array.isArray(a)) {
              return { price: parseFloat(a[0]), size: parseFloat(a[1]) };
            }
            return { price: parseFloat(a.price), size: parseFloat(a.size) };
          })
          .filter((l: OrderbookLevel) => !isNaN(l.price) && !isNaN(l.size) && l.size > 0);

        // Sort: bids descending (highest first), asks ascending (lowest first)
        allBids.sort((a, b) => b.price - a.price);
        allAsks.sort((a, b) => a.price - b.price);

        // Calculate best bid/ask and midpoint BEFORE filtering
        const rawBestBid = allBids[0]?.price ?? null;
        const rawBestAsk = allAsks[0]?.price ?? null;
        
        // For binary markets, we need to filter to show only relevant price levels
        // The "relevant" range is near the current best bid/ask, not the entire 0-100¢ range
        // Filter to show bids within reasonable range of best bid
        const bidThreshold = rawBestBid !== null ? Math.max(rawBestBid - 0.15, 0) : 0;
        const filteredBids = allBids.filter(b => b.price >= bidThreshold).slice(0, 10);
        
        // Filter asks within reasonable range of best ask  
        const askThreshold = rawBestAsk !== null ? Math.min(rawBestAsk + 0.15, 1) : 1;
        const filteredAsks = allAsks.filter(a => a.price <= askThreshold).slice(0, 10);

        // Use filtered data for display, but raw for spread/midpoint
        const bestBid = filteredBids[0]?.price ?? rawBestBid;
        const bestAsk = filteredAsks[0]?.price ?? rawBestAsk;
        const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
        const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

        setData({
          bids: filteredBids,
          asks: filteredAsks,
          spread,
          midpoint,
          timestamp: Date.now(),
        });
        setError(null);
      } else if (result?.error) {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Orderbook fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch orderbook');
    }
  }, [tokenId]);

  // Initial fetch
  useEffect(() => {
    if (!tokenId) {
      setData(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    fetchOrderbook().finally(() => setIsLoading(false));
  }, [tokenId, fetchOrderbook]);

  // Polling for updates
  useEffect(() => {
    if (!tokenId) return;

    intervalRef.current = window.setInterval(fetchOrderbook, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [tokenId, refreshInterval, fetchOrderbook]);

  const refresh = useCallback(() => {
    fetchOrderbook();
  }, [fetchOrderbook]);

  return { data, isLoading, error, refresh };
}
