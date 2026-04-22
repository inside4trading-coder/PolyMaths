import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { OrderbookData } from '@/hooks/useOrderbook';
import { useLanguage } from '@/contexts/LanguageContext';

interface DepthChartProps {
  data: OrderbookData | null;
  isLoading: boolean;
}

interface DepthPoint {
  price: number;
  bidDepth: number | null;
  askDepth: number | null;
}

export function DepthChart({ data, isLoading }: DepthChartProps) {
  const { t } = useLanguage();
  
  const chartData = useMemo(() => {
    if (!data) return [];

    const points: DepthPoint[] = [];

    // Calculate cumulative bids (sorted high to low, cumulative from high price)
    const sortedBids = [...data.bids].sort((a, b) => b.price - a.price);
    let cumulativeBid = 0;
    const bidPoints: DepthPoint[] = [];
    
    for (const bid of sortedBids) {
      cumulativeBid += bid.size;
      bidPoints.push({
        price: bid.price,
        bidDepth: cumulativeBid,
        askDepth: null,
      });
    }
    // Reverse so it goes from low to high price
    bidPoints.reverse();

    // Calculate cumulative asks (sorted low to high, cumulative from low price)
    const sortedAsks = [...data.asks].sort((a, b) => a.price - b.price);
    let cumulativeAsk = 0;
    const askPoints: DepthPoint[] = [];
    
    for (const ask of sortedAsks) {
      cumulativeAsk += ask.size;
      askPoints.push({
        price: ask.price,
        bidDepth: null,
        askDepth: cumulativeAsk,
      });
    }

    // Merge points
    points.push(...bidPoints, ...askPoints);
    
    // Sort by price
    points.sort((a, b) => a.price - b.price);

    return points;
  }, [data]);

  const midpoint = data?.midpoint ?? null;

  if (isLoading && !data) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        {t('depthChart.loading')}
      </div>
    );
  }

  if (!data || chartData.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        {t('depthChart.noData')}
      </div>
    );
  }

  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="bidGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--bull))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--bull))" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="askGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--bear))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--bear))" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          
          <XAxis
            dataKey="price"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}¢`}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={{ stroke: 'hsl(var(--border))' }}
          />
          
          <YAxis
            type="number"
            domain={[0, 'dataMax']}
            tickFormatter={(v) => {
              if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
              return v.toFixed(0);
            }}
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={{ stroke: 'hsl(var(--border))' }}
            width={45}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => {
              const label = name === 'bidDepth' ? t('depthChart.bids') : t('depthChart.asks');
              const formatted = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
              return [formatted, label];
            }}
            labelFormatter={(price: number) => `${t('depthChart.price')}: ${(price * 100).toFixed(2)}¢`}
          />

          {midpoint !== null && (
            <ReferenceLine
              x={midpoint}
              stroke="hsl(var(--primary))"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
          
          <Area
            type="stepAfter"
            dataKey="bidDepth"
            stroke="hsl(var(--bull))"
            fill="url(#bidGradient)"
            strokeWidth={1.5}
            connectNulls={false}
            isAnimationActive={false}
          />
          
          <Area
            type="stepBefore"
            dataKey="askDepth"
            stroke="hsl(var(--bear))"
            fill="url(#askGradient)"
            strokeWidth={1.5}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
