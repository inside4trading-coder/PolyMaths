import { useState, useEffect, useCallback, useRef } from 'react';

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

interface UseOrderbookWebSocketOptions {
  tokenId: string | null;
  enabled?: boolean;
}

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export function useOrderbookWebSocket({ tokenId, enabled = true }: UseOrderbookWebSocketOptions) {
  const [data, setData] = useState<OrderbookData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const parseOrderbook = useCallback((book: any): OrderbookData | null => {
    if (!book) return null;

    const parseLevels = (levels: any[]): OrderbookLevel[] => {
      if (!Array.isArray(levels)) return [];
      return levels
        .map((l) => {
          if (Array.isArray(l)) {
            return { price: parseFloat(l[0]), size: parseFloat(l[1]) };
          }
          return { price: parseFloat(l.price || l.p), size: parseFloat(l.size || l.s) };
        })
        .filter((l) => !isNaN(l.price) && !isNaN(l.size) && l.size > 0);
    };

    const allBids = parseLevels(book.bids || book.buys || []);
    const allAsks = parseLevels(book.asks || book.sells || []);

    // Sort: bids descending (highest first), asks ascending (lowest first)
    allBids.sort((a, b) => b.price - a.price);
    allAsks.sort((a, b) => a.price - b.price);

    // Calculate best bid/ask BEFORE filtering
    const rawBestBid = allBids[0]?.price ?? null;
    const rawBestAsk = allAsks[0]?.price ?? null;
    
    // For binary markets, filter to show only relevant price levels
    // The "relevant" range is near the current best bid/ask, not the entire 0-100¢ range
    const bidThreshold = rawBestBid !== null ? Math.max(rawBestBid - 0.15, 0) : 0;
    const filteredBids = allBids.filter(b => b.price >= bidThreshold).slice(0, 10);
    
    const askThreshold = rawBestAsk !== null ? Math.min(rawBestAsk + 0.15, 1) : 1;
    const filteredAsks = allAsks.filter(a => a.price <= askThreshold).slice(0, 10);

    // Use filtered data for display
    const bestBid = filteredBids[0]?.price ?? rawBestBid;
    const bestAsk = filteredAsks[0]?.price ?? rawBestAsk;
    const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
    const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

    return {
      bids: filteredBids,
      asks: filteredAsks,
      spread,
      midpoint,
      timestamp: Date.now(),
    };
  }, []);

  const connect = useCallback(() => {
    if (!tokenId || !enabled) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      console.log('[OrderbookWS] Connecting to', WS_URL);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[OrderbookWS] Connected');
        setIsConnected(true);
        setError(null);

        // Subscribe to the token's orderbook using correct format
        // Polymarket expects "type": "subscribe" not "type": "Market"
        const subscribeMsg = {
          type: 'subscribe',
          channel: 'market',
          assets_ids: [tokenId],
        };
        console.log('[OrderbookWS] Subscribing:', subscribeMsg);
        ws.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[OrderbookWS] Message:', msg.event_type || msg.type || 'unknown');

          // Handle different message types from Polymarket WS
          if (msg.event_type === 'book' || msg.type === 'book' || msg.book) {
            const parsed = parseOrderbook(msg.book || msg);
            if (parsed) {
              setData(parsed);
            }
          } else if (msg.event_type === 'price_change' || msg.type === 'price_change') {
            // Incremental update - we'd need to merge with existing data
            // For now, just log it
            console.log('[OrderbookWS] Price change:', msg);
          } else if (msg.event_type === 'last_trade_price' || msg.last_trade_price) {
            // Trade happened - orderbook may have changed
            console.log('[OrderbookWS] Trade:', msg);
          }
        } catch (e) {
          console.error('[OrderbookWS] Parse error:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('[OrderbookWS] Error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('[OrderbookWS] Closed:', event.code, event.reason);
        setIsConnected(false);

        // Reconnect after 5 seconds if not intentionally closed
        if (enabled && tokenId) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            console.log('[OrderbookWS] Reconnecting...');
            connect();
          }, 5000);
        }
      };
    } catch (e) {
      console.error('[OrderbookWS] Connection error:', e);
      setError(e instanceof Error ? e.message : 'Connection failed');
    }
  }, [tokenId, enabled, parseOrderbook]);

  // Connect when tokenId changes
  useEffect(() => {
    if (!enabled || !tokenId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setData(null);
      setIsConnected(false);
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [tokenId, enabled, connect]);

  const refresh = useCallback(() => {
    connect();
  }, [connect]);

  return { data, isConnected, isLoading: !data && !error, error, refresh };
}
