import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, TrendingUp, TrendingDown, BarChart3, Shield } from 'lucide-react';
import type { BotPosition } from '@/hooks/usePolymarket';
import { aggregatePnl, getEffectivePnl } from '@/lib/botPnl';

interface PortfolioSummaryProps {
  positions: BotPosition[];
}

interface MarketGroup {
  question: string;
  positions: BotPosition[];
  totalSize: number;
  hasAutoHedge: boolean;
  duplicateCount: number;
}

export function PortfolioSummary({ positions }: PortfolioSummaryProps) {
  const metrics = useMemo(() => {
    const openPositions = positions.filter(p => !p.closed_at);
    const totalExposure = openPositions.reduce((sum, p) => sum + p.size, 0);
    const pnlData = aggregatePnl(positions);
    
    // Use effective PnL (calculated for open, persisted for closed)
    const winners = openPositions.filter(p => getEffectivePnl(p) > 0);
    const losers = openPositions.filter(p => getEffectivePnl(p) < 0);
    const flat = openPositions.filter(p => getEffectivePnl(p) === 0);

    // Group by market
    const marketMap = new Map<string, MarketGroup>();
    for (const pos of openPositions) {
      const key = pos.market_question || pos.market_id || 'unknown';
      if (!marketMap.has(key)) {
        marketMap.set(key, {
          question: pos.market_question || 'Unknown',
          positions: [],
          totalSize: 0,
          hasAutoHedge: false,
          duplicateCount: 0,
        });
      }
      const group = marketMap.get(key)!;
      group.positions.push(pos);
      group.totalSize += pos.size;
    }

    // Detect auto-hedges and duplicates
    let autoHedgeCapital = 0;
    let autoHedgeCount = 0;
    let duplicatePositions = 0;
    const marketGroups: MarketGroup[] = [];

    for (const [, group] of marketMap) {
      const sides = new Set(group.positions.map(p => `${p.outcome}-${p.side}`));
      const outcomes = group.positions.map(p => p.outcome);
      const uniqueOutcomeSides = new Set(group.positions.map(p => `${p.outcome}|${p.side}`));

      // Auto-hedge: same outcome with LONG and SHORT, or opposing outcomes
      const hasLong = group.positions.some(p => p.side === 'LONG');
      const hasShort = group.positions.some(p => p.side === 'SHORT');
      if (hasLong && hasShort) {
        group.hasAutoHedge = true;
        autoHedgeCount++;
        const longTotal = group.positions.filter(p => p.side === 'LONG').reduce((s, p) => s + p.size, 0);
        const shortTotal = group.positions.filter(p => p.side === 'SHORT').reduce((s, p) => s + p.size, 0);
        autoHedgeCapital += Math.min(longTotal, shortTotal) * 2;
      }

      // Duplicates: multiple positions same outcome+side
      if (group.positions.length > uniqueOutcomeSides.size) {
        group.duplicateCount = group.positions.length - uniqueOutcomeSides.size;
        duplicatePositions += group.duplicateCount;
      }

      marketGroups.push(group);
    }

    // Concentration: top market by exposure
    const sortedMarkets = marketGroups.sort((a, b) => b.totalSize - a.totalSize);
    const topMarket = sortedMarkets[0];
    const topConcentration = totalExposure > 0 && topMarket
      ? (topMarket.totalSize / totalExposure) * 100
      : 0;

    return {
      totalExposure,
      totalPnl: pnlData.total,
      realizedToday: pnlData.realizedToday,
      realizedTrade: pnlData.realizedTrade,
      realizedRedeem: pnlData.realizedRedeem,
      floating: pnlData.floating,
      winnersCount: winners.length,
      losersCount: losers.length,
      flatCount: flat.length,
      winnersPnl: winners.reduce((s, p) => s + getEffectivePnl(p), 0),
      losersPnl: losers.reduce((s, p) => s + getEffectivePnl(p), 0),
      uniqueMarkets: marketMap.size,
      autoHedgeCount,
      autoHedgeCapital,
      duplicatePositions,
      topMarket: topMarket?.question || '',
      topConcentration,
      topMarketSize: topMarket?.totalSize || 0,
    };
  }, [positions]);

  if (positions.length === 0) return null;

  const hasWarnings = metrics.autoHedgeCount > 0 || metrics.duplicatePositions > 0;

  return (
    <div className="px-3 py-2 border-b border-border space-y-2">
      {/* Row 1: Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCell
          label="Exposure"
          value={formatCurrency(metrics.totalExposure)}
          icon={<BarChart3 className="w-2.5 h-2.5" />}
        />
        <MetricCell
          label="Total PnL"
          value={`${metrics.totalPnl >= 0 ? '+' : ''}${formatCurrency(metrics.totalPnl)}`}
          valueClass={metrics.totalPnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'}
          icon={metrics.totalPnl >= 0
            ? <TrendingUp className="w-2.5 h-2.5 text-[hsl(var(--bull))]" />
            : <TrendingDown className="w-2.5 h-2.5 text-[hsl(var(--bear))]" />
          }
          subtitle={`💰${formatCurrency(metrics.realizedRedeem)} 📊${formatCurrency(metrics.realizedTrade)} F:${formatCurrency(metrics.floating)}`}
        />
        <MetricCell
          label="Markets"
          value={`${metrics.uniqueMarkets}`}
          icon={<Shield className="w-2.5 h-2.5" />}
        />
      </div>

      {/* Row 2: W/L breakdown */}
      <div className="flex items-center gap-2 text-[9px] font-mono-data">
        <span className="text-[hsl(var(--bull))]">
          {metrics.winnersCount}W (+{formatCurrency(metrics.winnersPnl)})
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-[hsl(var(--bear))]">
          {metrics.losersCount}L ({formatCurrency(metrics.losersPnl)})
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {metrics.flatCount} flat
        </span>
      </div>

      {/* Row 3: Concentration bar */}
      {metrics.topConcentration > 40 && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500/70 transition-all"
              style={{ width: `${Math.min(100, metrics.topConcentration)}%` }}
            />
          </div>
          <span className="text-[8px] text-amber-500 font-mono-data whitespace-nowrap">
            {metrics.topConcentration.toFixed(0)}% in 1 market
          </span>
        </div>
      )}

      {/* Row 4: Warnings */}
      {hasWarnings && (
        <div className="space-y-1">
          {metrics.autoHedgeCount > 0 && (
            <WarningRow
              text={`${metrics.autoHedgeCount} auto-hedge${metrics.autoHedgeCount > 1 ? 's' : ''} — ~${formatCurrency(metrics.autoHedgeCapital)} trapped`}
            />
          )}
          {metrics.duplicatePositions > 0 && (
            <WarningRow
              text={`${metrics.duplicatePositions} duplicate position${metrics.duplicatePositions > 1 ? 's' : ''} detected`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  valueClass,
  icon,
  subtitle,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[8px] uppercase tracking-wider">{label}</span>
      </div>
      <span className={cn('text-[11px] font-mono-data font-semibold text-foreground', valueClass)}>
        {value}
      </span>
      {subtitle && (
        <span className="text-[8px] font-mono-data text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}

function WarningRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
      <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />
      <span className="text-[9px] font-mono-data text-amber-500">{text}</span>
    </div>
  );
}
