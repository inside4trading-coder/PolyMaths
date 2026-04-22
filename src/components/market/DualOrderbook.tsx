import { useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useOrderbook, OrderbookData } from '@/hooks/useOrderbook';
import { useOrderbookWebSocket } from '@/hooks/useOrderbookWebSocket';
import { Loader2, RefreshCw, AlertCircle, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

interface Token {
  id: string;
  outcome: string;
  price?: number | null;
}

interface DualOrderbookProps {
  tokens: Token[];
}

export function DualOrderbook({ tokens }: DualOrderbookProps) {
  const { t, translateOutcome } = useLanguage();

  // Find Yes and No tokens - ensure correct matching
  const yesToken = tokens.find(t => (t.outcome || '').toLowerCase() === 'yes') || tokens[0];
  const noToken = tokens.find(t => (t.outcome || '').toLowerCase() === 'no') || tokens[1];

  // Debug log token IDs
  useEffect(() => {
    if (yesToken || noToken) {
      console.log('[DualOrderbook] Tokens:', {
        yes: { id: yesToken?.id?.slice(0, 16), outcome: yesToken?.outcome, price: yesToken?.price },
        no: { id: noToken?.id?.slice(0, 16), outcome: noToken?.outcome, price: noToken?.price },
      });
    }
  }, [yesToken, noToken]);

  // WebSocket + Polling for Yes token
  const { 
    data: wsYesData, 
    isConnected: wsYesConnected 
  } = useOrderbookWebSocket({
    tokenId: yesToken?.id || null,
    enabled: !!yesToken?.id,
  });

  const { 
    data: pollingYesData, 
    isLoading: pollingYesLoading, 
    error: pollingYesError, 
    refresh: refreshYes 
  } = useOrderbook({
    tokenId: yesToken?.id || null,
    refreshInterval: wsYesConnected ? 30000 : 3000,
  });

  // WebSocket + Polling for No token
  const { 
    data: wsNoData, 
    isConnected: wsNoConnected 
  } = useOrderbookWebSocket({
    tokenId: noToken?.id || null,
    enabled: !!noToken?.id,
  });

  const { 
    data: pollingNoData, 
    isLoading: pollingNoLoading, 
    error: pollingNoError, 
    refresh: refreshNo 
  } = useOrderbook({
    tokenId: noToken?.id || null,
    refreshInterval: wsNoConnected ? 30000 : 3000,
  });

  // Use WebSocket data if available, otherwise polling
  const yesOrderbook = wsYesData || pollingYesData;
  const noOrderbook = wsNoData || pollingNoData;
  const yesLoading = !wsYesData && pollingYesLoading;
  const noLoading = !wsNoData && pollingNoLoading;
  const yesError = !wsYesData && pollingYesError ? pollingYesError : null;
  const noError = !wsNoData && pollingNoError ? pollingNoError : null;

  const isAnyLive = wsYesConnected || wsNoConnected;

  // Debug log orderbook data
  useEffect(() => {
    if (yesOrderbook) {
      console.log('[DualOrderbook] Yes orderbook:', {
        midpoint: yesOrderbook.midpoint,
        spread: yesOrderbook.spread,
        topBid: yesOrderbook.bids[0]?.price,
        topAsk: yesOrderbook.asks[0]?.price,
      });
    }
    if (noOrderbook) {
      console.log('[DualOrderbook] No orderbook:', {
        midpoint: noOrderbook.midpoint,
        spread: noOrderbook.spread,
        topBid: noOrderbook.bids[0]?.price,
        topAsk: noOrderbook.asks[0]?.price,
      });
    }
  }, [yesOrderbook, noOrderbook]);

  const handleRefresh = () => {
    refreshYes();
    refreshNo();
  };

  if (!yesToken && !noToken) {
    return (
      <div className="flex items-center justify-center text-muted-foreground p-4">
        <span className="text-sm">{t('orderbook.noOrders')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('marketDetail.orderBook')}</h3>
          {isAnyLive && (
            <span className="flex items-center gap-1 text-[10px] text-bull font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          className="p-1 hover:bg-accent rounded transition-colors"
          title={t('orderbook.refresh')}
        >
          <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', (yesLoading || noLoading) && 'animate-spin')} />
        </button>
      </div>

      {/* Dual Orderbook Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Yes Orderbook */}
        <div className="rounded-lg border border-border bg-card/50 p-3 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
            <span className="text-xs font-semibold text-bull">{translateOutcome('Yes')}</span>
            {yesToken?.price != null && (
              <span className="text-xs font-mono text-muted-foreground">
                {(yesToken.price * 100).toFixed(1)}¢
              </span>
            )}
          </div>
          <SingleOrderbook 
            data={yesOrderbook} 
            isLoading={yesLoading} 
            error={yesError}
            side="yes"
          />
        </div>

        {/* No Orderbook */}
        <div className="rounded-lg border border-border bg-card/50 p-3 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
            <span className="text-xs font-semibold text-bear">{translateOutcome('No')}</span>
            {noToken?.price != null && (
              <span className="text-xs font-mono text-muted-foreground">
                {(noToken.price * 100).toFixed(1)}¢
              </span>
            )}
          </div>
          <SingleOrderbook 
            data={noOrderbook} 
            isLoading={noLoading} 
            error={noError}
            side="no"
          />
        </div>
      </div>

      {/* Combined Depth Chart */}
      <CombinedDepthChart 
        yesData={yesOrderbook} 
        noData={noOrderbook} 
        isLoading={yesLoading || noLoading} 
      />
    </div>
  );
}

interface SingleOrderbookProps {
  data: OrderbookData | null;
  isLoading: boolean;
  error: string | null;
  side: 'yes' | 'no';
}

function SingleOrderbook({ data, isLoading, error, side }: SingleOrderbookProps) {
  const { t } = useLanguage();
  
  const maxSize = useMemo(() => {
    if (!data) return 1;
    const allSizes = [...data.bids, ...data.asks].map((l) => l.size);
    return Math.max(...allSizes, 1);
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">{t('orderbook.loading')}</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-1 p-2">
        <AlertCircle className="w-4 h-4 text-destructive" />
        <span className="text-xs text-center">{error}</span>
      </div>
    );
  }

  if (!data || (data.bids.length === 0 && data.asks.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <span className="text-xs">{t('orderbook.noOrders')}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-1">
      {/* Column headers */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 mb-1">
        <span>{t('orderbook.price')}</span>
        <span>{t('orderbook.size')}</span>
      </div>

      {/* Asks (sells) - reversed so best ask is at bottom */}
      <div className="flex flex-col-reverse gap-0.5">
        {data.asks.slice(0, 4).map((level, idx) => (
          <OrderbookRow
            key={`ask-${idx}`}
            price={level.price}
            size={level.size}
            type="ask"
            maxSize={maxSize}
          />
        ))}
      </div>

      {/* Spread indicator */}
      <div className={cn(
        "flex items-center justify-center py-1 my-1 border-y border-border text-[10px]",
        data.spread !== null && data.spread > 0.10 ? "bg-warning/10" : "bg-muted/30"
      )}>
        {data.midpoint !== null && (
          <span className="font-mono font-semibold text-foreground mr-2">
            {(data.midpoint * 100).toFixed(1)}¢
          </span>
        )}
        {data.spread !== null && (
          <span className={cn(
            data.spread > 0.10 ? "text-warning" : "text-muted-foreground"
          )}>
            {(data.spread * 100).toFixed(1)}¢
          </span>
        )}
        {data.spread !== null && data.spread > 0.10 && (
          <AlertTriangle className="w-2.5 h-2.5 ml-1 text-warning" />
        )}
      </div>

      {/* Bids (buys) */}
      <div className="flex flex-col gap-0.5">
        {data.bids.slice(0, 4).map((level, idx) => (
          <OrderbookRow
            key={`bid-${idx}`}
            price={level.price}
            size={level.size}
            type="bid"
            maxSize={maxSize}
          />
        ))}
      </div>
    </div>
  );
}

interface OrderbookRowProps {
  price: number;
  size: number;
  type: 'bid' | 'ask';
  maxSize: number;
}

function OrderbookRow({ price, size, type, maxSize }: OrderbookRowProps) {
  const fillPercent = (size / maxSize) * 100;
  const isBid = type === 'bid';

  return (
    <div className="relative flex items-center justify-between px-1.5 py-0.5 rounded-sm overflow-hidden">
      {/* Background fill */}
      <div
        className={cn(
          'absolute inset-y-0 transition-all',
          isBid ? 'left-0 bg-bull/15' : 'right-0 bg-bear/15'
        )}
        style={{ width: `${fillPercent}%` }}
      />

      {/* Content */}
      <span
        className={cn(
          'relative z-10 text-[10px] font-mono',
          isBid ? 'text-bull' : 'text-bear'
        )}
      >
        {(price * 100).toFixed(1)}¢
      </span>
      <span className="relative z-10 text-[10px] font-mono text-foreground">
        {size >= 1000 ? `${(size / 1000).toFixed(1)}k` : size.toFixed(0)}
      </span>
    </div>
  );
}

// Combined Depth Chart showing both Yes and No liquidity in dual panels
interface CombinedDepthChartProps {
  yesData: OrderbookData | null;
  noData: OrderbookData | null;
  isLoading: boolean;
}

interface SingleDepthPoint {
  price: number;
  bidDepth: number | null;
  askDepth: number | null;
}

// Single depth panel for one outcome
function SingleDepthPanel({ 
  data, 
  side, 
  midpoint,
  spread 
}: { 
  data: SingleDepthPoint[]; 
  side: 'yes' | 'no'; 
  midpoint: number | null;
  spread: number | null;
}) {
  const isYes = side === 'yes';
  const colorVar = isYes ? 'bull' : 'bear';
  const gradientId = `${side}Gradient`;
  const askGradientId = `${side}AskGradient`;
  
  if (data.length === 0) {
    return (
      <div className="flex-1 h-full flex items-center justify-center text-muted-foreground text-[10px]">
        No data
      </div>
    );
  }
  
  // Calculate domain from data
  const prices = data.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = 0.02;
  
  return (
    <div className="flex-1 h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0.6} />
              <stop offset="50%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0.2} />
              <stop offset="100%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={askGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0.35} />
              <stop offset="100%" stopColor={`hsl(var(--${colorVar}))`} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
            horizontal={true}
            vertical={false}
          />
          
          <XAxis
            dataKey="price"
            type="number"
            domain={[Math.max(0, minPrice - padding), Math.min(1, maxPrice + padding)]}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}¢`}
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={{ stroke: 'hsl(var(--border))' }}
            tickCount={5}
          />
          
          <YAxis
            type="number"
            domain={[0, 'auto']}
            tickFormatter={(v) => {
              if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
              return v >= 1 ? v.toFixed(0) : '';
            }}
            tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
            width={35}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '10px',
              padding: '6px 8px',
            }}
            formatter={(value: number, name: string) => {
              const label = name === 'bidDepth' ? 'Bids' : 'Asks';
              const formatted = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
              return [formatted, label];
            }}
            labelFormatter={(price: number) => `${(price * 100).toFixed(1)}¢`}
          />

          {midpoint !== null && (
            <ReferenceLine
              x={midpoint}
              stroke={`hsl(var(--${colorVar}))`}
              strokeWidth={2}
              strokeOpacity={0.8}
              label={{
                value: `${(midpoint * 100).toFixed(1)}¢`,
                position: 'top',
                fill: `hsl(var(--${colorVar}))`,
                fontSize: 9,
                fontWeight: 600,
              }}
            />
          )}
          
          {/* Bid depth - solid fill */}
          <Area
            type="stepAfter"
            dataKey="bidDepth"
            stroke={`hsl(var(--${colorVar}))`}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
          />
          
          {/* Ask depth - lighter fill */}
          <Area
            type="stepBefore"
            dataKey="askDepth"
            stroke={`hsl(var(--${colorVar}))`}
            fill={`url(#${askGradientId})`}
            strokeWidth={1}
            strokeDasharray="3 3"
            strokeOpacity={0.7}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CombinedDepthChart({ yesData, noData, isLoading }: CombinedDepthChartProps) {
  const { t } = useLanguage();
  
  // Calculate midpoints
  const yesMidpoint = yesData?.midpoint ?? null;
  const noMidpoint = noData?.midpoint ?? null;
  const yesSpread = yesData?.spread ?? null;
  const noSpread = noData?.spread ?? null;
  
  // Process Yes data into single depth points
  const yesChartData = useMemo(() => {
    if (!yesData) return [];
    
    const points: SingleDepthPoint[] = [];
    
    // Cumulative bids (high to low price)
    const sortedBids = [...yesData.bids].sort((a, b) => b.price - a.price);
    let cumBid = 0;
    for (const bid of sortedBids) {
      cumBid += bid.size;
      points.push({ price: bid.price, bidDepth: cumBid, askDepth: null });
    }
    
    // Cumulative asks (low to high price)
    const sortedAsks = [...yesData.asks].sort((a, b) => a.price - b.price);
    let cumAsk = 0;
    for (const ask of sortedAsks) {
      cumAsk += ask.size;
      points.push({ price: ask.price, bidDepth: null, askDepth: cumAsk });
    }
    
    return points.sort((a, b) => a.price - b.price);
  }, [yesData]);
  
  // Process No data into single depth points
  const noChartData = useMemo(() => {
    if (!noData) return [];
    
    const points: SingleDepthPoint[] = [];
    
    // Cumulative bids
    const sortedBids = [...noData.bids].sort((a, b) => b.price - a.price);
    let cumBid = 0;
    for (const bid of sortedBids) {
      cumBid += bid.size;
      points.push({ price: bid.price, bidDepth: cumBid, askDepth: null });
    }
    
    // Cumulative asks
    const sortedAsks = [...noData.asks].sort((a, b) => a.price - b.price);
    let cumAsk = 0;
    for (const ask of sortedAsks) {
      cumAsk += ask.size;
      points.push({ price: ask.price, bidDepth: null, askDepth: cumAsk });
    }
    
    return points.sort((a, b) => a.price - b.price);
  }, [noData]);

  if (isLoading && !yesData && !noData) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">{t('depthChart.combined') || 'Combined Depth'}</h4>
        <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          {t('depthChart.loading')}
        </div>
      </div>
    );
  }

  if (yesChartData.length === 0 && noChartData.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">{t('depthChart.combined') || 'Combined Depth'}</h4>
        <div className="h-36 flex items-center justify-center text-muted-foreground text-xs">
          {t('depthChart.noData')}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-foreground">{t('depthChart.combined') || 'Liquidity Depth'}</h4>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded bg-muted/50 font-mono">±15¢</span>
        </div>
      </div>
      
      {/* Dual panels */}
      <div className="grid grid-cols-2 gap-3">
        {/* Yes Panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-bull" />
              <span className="text-xs font-medium text-bull">Yes</span>
            </div>
            {yesMidpoint !== null && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {(yesMidpoint * 100).toFixed(1)}¢
                {yesSpread !== null && (
                  <span className="ml-1 text-muted-foreground/60">
                    ({(yesSpread * 100).toFixed(1)}¢ spread)
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="h-28 rounded-md border border-bull/20 bg-bull/5 overflow-hidden">
            <SingleDepthPanel 
              data={yesChartData} 
              side="yes" 
              midpoint={yesMidpoint}
              spread={yesSpread}
            />
          </div>
        </div>
        
        {/* No Panel */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-bear" />
              <span className="text-xs font-medium text-bear">No</span>
            </div>
            {noMidpoint !== null && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {(noMidpoint * 100).toFixed(1)}¢
                {noSpread !== null && (
                  <span className="ml-1 text-muted-foreground/60">
                    ({(noSpread * 100).toFixed(1)}¢ spread)
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="h-28 rounded-md border border-bear/20 bg-bear/5 overflow-hidden">
            <SingleDepthPanel 
              data={noChartData} 
              side="no" 
              midpoint={noMidpoint}
              spread={noSpread}
            />
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border/50">
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <div className="w-3 h-1 rounded-sm bg-current opacity-60" />
          <span>Bids (buy orders)</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <div className="w-3 h-1 rounded-sm bg-current opacity-30 border border-current border-dashed" />
          <span>Asks (sell orders)</span>
        </div>
      </div>
    </div>
  );
}
