import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  XAxis,
  ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { BotPosition } from '@/hooks/usePolymarket';
import { calculateFloatingPnl } from '@/lib/botPnl';

interface EquityCurveProps {
  events: unknown[];
  positions: BotPosition[];
}

interface ChartPoint {
  time: number;
  pnl: number;
  tradePnl: number;
  label: string;
  market: string;
}

export function EquityCurve({ positions }: EquityCurveProps) {
  const closedPositions = useMemo(
    () => positions.filter(p => p.closed_at),
    [positions]
  );

  const chartData = useMemo(() => {
    if (closedPositions.length === 0) return [];

    const sorted = [...closedPositions].sort(
      (a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()
    );

    // Start at zero
    const points: ChartPoint[] = [
      {
        time: new Date(sorted[0].closed_at!).getTime() - 60_000,
        pnl: 0,
        tradePnl: 0,
        label: '',
        market: 'Start',
      },
    ];

    let cumulative = 0;
    sorted.forEach(p => {
      const tradePnl = p.pnl || 0;
      cumulative += tradePnl;
      points.push({
        time: new Date(p.closed_at!).getTime(),
        pnl: Number(cumulative.toFixed(2)),
        tradePnl: Number(tradePnl.toFixed(2)),
        label: new Date(p.closed_at!).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        market: (p.market_question || 'Unknown').slice(0, 60),
      });
    });

    // Add "now" point with current unrealized
    const unrealized = positions
      .filter(p => !p.closed_at)
      .reduce((s, p) => s + calculateFloatingPnl(p), 0);
    points.push({
      time: Date.now(),
      pnl: Number((cumulative + unrealized).toFixed(2)),
      tradePnl: Number(unrealized.toFixed(2)),
      label: 'Now',
      market: `Unrealized (${positions.filter(p => !p.closed_at).length} open)`,
    });

    return points;
  }, [closedPositions, positions]);

  const currentPnl = chartData.length > 0 ? chartData[chartData.length - 1].pnl : 0;
  const isPositive = currentPnl >= 0;

  // Compute gradient offset for dual-color fill (green above 0, red below)
  const gradientOffset = useMemo(() => {
    if (chartData.length === 0) return 0.5;
    const max = Math.max(...chartData.map(d => d.pnl));
    const min = Math.min(...chartData.map(d => d.pnl));
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [chartData]);

  if (chartData.length < 2) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <TrendingUp className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] font-mono-data text-muted-foreground">
          Equity curve available after first closed position
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-card/30">
      {/* PnL label */}
      <div className="flex flex-col items-start min-w-[72px]">
        <span className="text-[9px] font-mono-data text-muted-foreground uppercase tracking-wider">
          Equity
        </span>
        <span
          className={cn(
            'text-xs font-mono-data font-semibold',
            isPositive ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
          )}
        >
          {isPositive ? '+' : ''}
          {formatCurrency(currentPnl)}
        </span>
        <span className="text-[8px] font-mono-data text-muted-foreground">
          {closedPositions.length} trades
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 h-[72px] min-w-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="equityDualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--bull))" stopOpacity={0.35} />
                <stop
                  offset={`${gradientOffset * 100}%`}
                  stopColor="hsl(var(--bull))"
                  stopOpacity={0.05}
                />
                <stop
                  offset={`${gradientOffset * 100}%`}
                  stopColor="hsl(var(--bear))"
                  stopOpacity={0.05}
                />
                <stop offset="100%" stopColor="hsl(var(--bear))" stopOpacity={0.35} />
              </linearGradient>
              <linearGradient id="equityStrokeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${gradientOffset * 100}%`} stopColor="hsl(var(--bull))" />
                <stop offset={`${gradientOffset * 100}%`} stopColor="hsl(var(--bear))" />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))', fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />

            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as ChartPoint;
                return (
                  <div className="bg-card border border-border rounded-md px-2.5 py-1.5 shadow-lg">
                    <p className="text-[9px] font-mono-data text-muted-foreground mb-0.5 truncate max-w-[200px]">
                      {d.market}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-[11px] font-mono-data font-semibold',
                          d.pnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
                        )}
                      >
                        Σ {d.pnl >= 0 ? '+' : ''}{formatCurrency(d.pnl)}
                      </span>
                      {d.tradePnl !== 0 && d.label !== '' && (
                        <span
                          className={cn(
                            'text-[9px] font-mono-data',
                            d.tradePnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
                          )}
                        >
                          ({d.tradePnl >= 0 ? '+' : ''}{formatCurrency(d.tradePnl)})
                        </span>
                      )}
                    </div>
                    {d.label && (
                      <p className="text-[8px] font-mono-data text-muted-foreground mt-0.5">{d.label}</p>
                    )}
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="pnl"
              stroke="url(#equityStrokeGradient)"
              strokeWidth={1.5}
              fill="url(#equityDualGradient)"
              dot={(props: any) => {
                const { cx, cy, index } = props;
                const isLast = index === chartData.length - 1;
                if (!isLast) return <circle key={index} cx={cx} cy={cy} r={0} />;
                // Pulsing dot on current value
                const color = currentPnl >= 0 ? 'hsl(var(--bull))' : 'hsl(var(--bear))';
                return (
                  <g key="pulse">
                    <circle cx={cx} cy={cy} r={4} fill={color} opacity={0.25}>
                      <animate attributeName="r" from="3" to="8" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={cx} cy={cy} r={3} fill={color} />
                  </g>
                );
              }}
              activeDot={{ r: 3, strokeWidth: 0, fill: 'hsl(var(--foreground))' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
