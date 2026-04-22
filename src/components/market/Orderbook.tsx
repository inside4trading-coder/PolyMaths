import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { OrderbookData } from '@/hooks/useOrderbook';
import { Loader2, RefreshCw, AlertCircle, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface OrderbookProps {
  data: OrderbookData | null;
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

export function Orderbook({ data, isLoading, error, onRefresh }: OrderbookProps) {
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
        <span className="text-sm">{t('orderbook.loading')}</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 p-4">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <span className="text-sm text-center">{error}</span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            {t('orderbook.retry')}
          </button>
        )}
      </div>
    );
  }

  if (!data || (data.bids.length === 0 && data.asks.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <span className="text-sm">{t('orderbook.noOrders')}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{t('orderbook.price')}</span>
        <span>{t('orderbook.size')}</span>
      </div>

      {/* Asks (sells) - reversed so best ask is at bottom */}
      <div className="flex flex-col-reverse gap-0.5">
        {data.asks.slice(0, 5).map((level, idx) => (
          <OrderbookRow
            key={`ask-${idx}`}
            price={level.price}
            size={level.size}
            side="ask"
            maxSize={maxSize}
          />
        ))}
      </div>

      {/* Spread indicator */}
      <div className={cn(
        "flex flex-col items-center justify-center py-1.5 border-y border-border",
        data.spread !== null && data.spread > 0.10 ? "bg-warning/10" : "bg-muted/30"
      )}>
        <div className="flex items-center gap-3 text-xs">
          {data.midpoint !== null && (
            <span className="font-mono font-semibold text-foreground">
              {(data.midpoint * 100).toFixed(2)}¢
            </span>
          )}
          {data.spread !== null && (
            <span className={cn(
              data.spread > 0.10 ? "text-warning font-medium" : "text-muted-foreground"
            )}>
              {t('orderbook.spread')}: {(data.spread * 100).toFixed(2)}¢
            </span>
          )}
        </div>
        {data.spread !== null && data.spread > 0.10 && (
          <div className="flex items-center gap-1 mt-1 text-warning">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-[10px] font-medium">{t('orderbook.lowLiquidity')}</span>
          </div>
        )}
      </div>

      {/* Bids (buys) */}
      <div className="flex flex-col gap-0.5">
        {data.bids.slice(0, 5).map((level, idx) => (
          <OrderbookRow
            key={`bid-${idx}`}
            price={level.price}
            size={level.size}
            side="bid"
            maxSize={maxSize}
          />
        ))}
      </div>

      {/* Last update */}
      {data.timestamp && (
        <div className="flex items-center justify-between mt-auto pt-2 text-xs text-muted-foreground">
          <span>
            {t('orderbook.updated')}: {new Date(data.timestamp).toLocaleTimeString()}
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="hover:text-foreground transition-colors"
              title={t('orderbook.refresh')}
            >
              <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface OrderbookRowProps {
  price: number;
  size: number;
  side: 'bid' | 'ask';
  maxSize: number;
}

function OrderbookRow({ price, size, side, maxSize }: OrderbookRowProps) {
  const fillPercent = (size / maxSize) * 100;
  const isBid = side === 'bid';

  return (
    <div className="relative flex items-center justify-between px-2 py-1 rounded-sm overflow-hidden">
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
          'relative z-10 text-xs font-mono',
          isBid ? 'text-bull' : 'text-bear'
        )}
      >
        {(price * 100).toFixed(2)}¢
      </span>
      <span className="relative z-10 text-xs font-mono text-foreground">
        {size >= 1000 ? `${(size / 1000).toFixed(1)}k` : size.toFixed(0)}
      </span>
    </div>
  );
}
