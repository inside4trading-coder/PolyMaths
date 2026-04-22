import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, Cell, XAxis, ReferenceLine,
} from 'recharts';
import { Clock, Hash, TrendingUp, Activity, Banknote } from 'lucide-react';
import type { BotPosition } from '@/hooks/usePolymarket';

interface SessionSummaryProps {
  positions: BotPosition[];
}

export function SessionSummary({ positions }: SessionSummaryProps) {
  const closedPositions = useMemo(
    () => positions.filter(p => !!p.closed_at).sort(
      (a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()
    ),
    [positions]
  );

  const metrics = useMemo(() => {
    if (positions.length === 0) return null;

    const allTimes = positions.map(p => new Date(p.opened_at).getTime());
    const closeTimes = closedPositions.map(p => new Date(p.closed_at!).getTime());
    const earliest = Math.min(...allTimes);
    const hasActive = positions.some(p => !p.closed_at);
    const latest = hasActive ? Date.now() : (closeTimes.length > 0 ? Math.max(...closeTimes) : Date.now());
    const durationMs = latest - earliest;

    const totalPnl = closedPositions.reduce((s, p) => s + (p.pnl || 0), 0);
    const avgPnl = closedPositions.length > 0 ? totalPnl / closedPositions.length : 0;
    const winners = closedPositions.filter(p => (p.pnl || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (winners / closedPositions.length) * 100 : 0;
    const redeemed = closedPositions
      .filter(p => (p as any).close_reason === 'redeem')
      .reduce((s, p) => s + (p.pnl || 0), 0);
    const totalTrades = positions.length;
    const totalVolume = positions.reduce((s, p) => s + p.size, 0);
    const bestTrade = closedPositions.reduce((best, p) => (p.pnl || 0) > best ? (p.pnl || 0) : best, -Infinity);
    const worstTrade = closedPositions.reduce((worst, p) => (p.pnl || 0) < worst ? (p.pnl || 0) : worst, Infinity);

    return {
      durationMs,
      totalTrades,
      closedTrades: closedPositions.length,
      totalPnl,
      avgPnl,
      winRate,
      totalVolume,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade,
      redeemed,
    };
  }, [positions, closedPositions]);

  // Cumulative PnL chart data per closed position
  const chartData = useMemo(() => {
    if (closedPositions.length === 0) return [];
    let cumPnl = 0;
    return closedPositions.map((p, i) => {
      cumPnl += p.pnl || 0;
      // Extract short label from market_question (e.g. "7:30-7:35")
      const timeMatch = (p.market_question || '').match(/(\d{1,2}:\d{2}[AP]M)-(\d{1,2}:\d{2}[AP]M)/i);
      const label = timeMatch ? timeMatch[0] : `#${i + 1}`;
      return {
        label,
        pnl: Number((p.pnl || 0).toFixed(2)),
        cumPnl: Number(cumPnl.toFixed(2)),
        outcome: p.outcome,
        side: p.side,
      };
    });
  }, [closedPositions]);

  if (!metrics || positions.length === 0) return null;

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return '<1m';
  };

  return (
    <div className="px-3 py-2 border-b border-border space-y-2 bg-card/30">
      {/* Title */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono-data text-muted-foreground uppercase tracking-wider">
          Session Summary
        </span>
        <span className={cn(
          'text-[11px] font-mono-data font-bold',
          metrics.totalPnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
        )}>
          {metrics.totalPnl >= 0 ? '+' : ''}{formatCurrency(metrics.totalPnl)}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-5 gap-1.5">
        <MiniMetric
          icon={<Clock className="w-2.5 h-2.5" />}
          label="Duration"
          value={formatDuration(metrics.durationMs)}
        />
        <MiniMetric
          icon={<Hash className="w-2.5 h-2.5" />}
          label="Trades"
          value={`${metrics.closedTrades}/${metrics.totalTrades}`}
        />
        <MiniMetric
          icon={<TrendingUp className="w-2.5 h-2.5" />}
          label="Avg PnL"
          value={`${metrics.avgPnl >= 0 ? '+' : ''}${formatCurrency(metrics.avgPnl)}`}
          valueClass={metrics.avgPnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'}
        />
        <MiniMetric
          icon={<Activity className="w-2.5 h-2.5" />}
          label="Win Rate"
          value={`${metrics.winRate.toFixed(0)}%`}
          valueClass={metrics.winRate >= 50 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'}
        />
        <MiniMetric
          icon={<Banknote className="w-2.5 h-2.5" />}
          label="Redeemed"
          value={`${metrics.redeemed >= 0 ? '+' : ''}${formatCurrency(metrics.redeemed)}`}
          valueClass={metrics.redeemed > 0 ? 'text-[hsl(var(--bull))]' : 'text-muted-foreground'}
        />
      </div>

      {/* Best/Worst row */}
      <div className="flex items-center gap-3 text-[9px] font-mono-data">
        <span className="text-muted-foreground">Best:</span>
        <span className="text-[hsl(var(--bull))]">+{formatCurrency(metrics.bestTrade)}</span>
        <span className="text-muted-foreground">Worst:</span>
        <span className="text-[hsl(var(--bear))]">{formatCurrency(metrics.worstTrade)}</span>
        <span className="text-muted-foreground ml-auto">Vol: {formatCurrency(metrics.totalVolume)}</span>
      </div>

      {/* Cumulative PnL chart */}
      {chartData.length >= 2 && (
        <div className="h-[56px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '4px 8px',
                }}
                formatter={(value: number, name: string) => {
                  const label = name === 'pnl' ? 'Trade PnL' : 'Cumul. PnL';
                  return [formatCurrency(value), label];
                }}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.pnl >= 0 ? 'hsl(var(--bull))' : 'hsl(var(--bear))'}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cumulative line below chart */}
      {chartData.length >= 2 && (
        <div className="flex items-center justify-between text-[8px] font-mono-data text-muted-foreground">
          <span>Cumul. PnL: {chartData.map(d => `${d.cumPnl >= 0 ? '+' : ''}${formatCurrency(d.cumPnl)}`).pop()}</span>
        </div>
      )}
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5 text-muted-foreground">
        {icon}
        <span className="text-[7px] uppercase tracking-wider">{label}</span>
      </div>
      <span className={cn('text-[10px] font-mono-data font-semibold text-foreground', valueClass)}>
        {value}
      </span>
    </div>
  );
}
