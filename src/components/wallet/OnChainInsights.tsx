import { cn } from '@/lib/utils';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';
import { useWalletOnChainStats, useWalletClassification, useSyncWalletOnChain, useWalletOnChainMonthlyTrend } from '@/hooks/useWalletOnChainActivity';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  RefreshCw,
  Link2,
  Zap,
  GitMerge,
  GitBranch,
  DollarSign,
  CheckCircle2,
  Clock,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface OnChainInsightsProps {
  walletAddress: string;
  compact?: boolean;
}

export function OnChainInsights({ walletAddress, compact = false }: OnChainInsightsProps) {
  const { data: stats, isLoading: statsLoading } = useWalletOnChainStats(walletAddress);
  const { data: classification } = useWalletClassification(walletAddress);
  const { data: monthlyTrend, isLoading: trendLoading } = useWalletOnChainMonthlyTrend(walletAddress);
  const syncOnChain = useSyncWalletOnChain();

  const handleSync = () => {
    syncOnChain.mutate(walletAddress);
  };

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Compact version for list items
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {classification?.badges.slice(0, 2).map((badge, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium border',
                  badge.className
                )}>
                  <span>{badge.icon}</span>
                  <span className="hidden sm:inline">{badge.label}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {badge.tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        {stats?.isSophisticated && !classification?.badges.some(b => b.label === 'SOPHISTICATED') && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                  <Zap className="w-3 h-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Sophisticated trader - uses splits/merges
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  // Full panel version
  return (
    <div className="space-y-4">
      {/* Header with badges and sync button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <h4 className="text-sm font-semibold text-foreground cursor-help">On-Chain Insights</h4>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">Verified blockchain data showing advanced trading behavior like splits, merges, and redemptions. Higher activity indicates a sophisticated trader.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {stats?.lastSynced && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(new Date(stats.lastSynced).getTime())}
            </span>
          )}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSync}
                disabled={syncOnChain.isPending}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  syncOnChain.isPending
                    ? 'bg-primary/10 text-primary cursor-wait'
                    : 'bg-primary/20 text-primary hover:bg-primary/30'
                )}
              >
                <RefreshCw className={cn('w-3 h-3', syncOnChain.isPending && 'animate-spin')} />
                {syncOnChain.isPending ? 'Syncing...' : 'Deep Sync'}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">Fetch latest on-chain data from Polygon blockchain via Goldsky subgraphs. This reveals advanced trading patterns not visible in standard activity.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Classification badges */}
      {classification && classification.badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {classification.badges.map((badge, idx) => (
            <TooltipProvider key={idx}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border',
                    badge.className
                  )}>
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{badge.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      )}

      {/* Monthly Trend Chart */}
      {monthlyTrend && monthlyTrend.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h5 className="text-xs font-semibold text-foreground cursor-help">Activity Trend</h5>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">Monthly breakdown of on-chain activities. Increasing trend indicates growing sophistication and market engagement.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <ChartContainer
            config={{
              splits: { label: 'Splits', color: 'hsl(var(--chart-1))' },
              merges: { label: 'Merges', color: 'hsl(var(--chart-2))' },
              redemptions: { label: 'Redemptions', color: 'hsl(var(--chart-3))' },
            }}
            className="h-[140px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="splitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mergeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="redeemGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="splits"
                  stroke="hsl(var(--chart-1))"
                  fill="url(#splitGradient)"
                  strokeWidth={2}
                  name="Splits"
                />
                <Area
                  type="monotone"
                  dataKey="merges"
                  stroke="hsl(var(--chart-2))"
                  fill="url(#mergeGradient)"
                  strokeWidth={2}
                  name="Merges"
                />
                <Area
                  type="monotone"
                  dataKey="redemptions"
                  stroke="hsl(var(--chart-3))"
                  fill="url(#redeemGradient)"
                  strokeWidth={2}
                  name="Redemptions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--chart-1))]" />
              <span className="text-muted-foreground">Splits</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--chart-2))]" />
              <span className="text-muted-foreground">Merges</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--chart-3))]" />
              <span className="text-muted-foreground">Redemptions</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<GitBranch className="w-4 h-4 text-yellow-400" />}
            label="Splits"
            value={stats.splitsCount.toString()}
            highlight={stats.splitsCount > 0}
          />
          <StatCard
            icon={<GitMerge className="w-4 h-4 text-purple-400" />}
            label="Merges"
            value={stats.mergesCount.toString()}
            highlight={stats.mergesCount > 0}
          />
          <StatCard
            icon={<CheckCircle2 className="w-4 h-4 text-bull" />}
            label="Redemptions"
            value={stats.redemptionsCount.toString()}
            highlight={stats.redemptionsCount > 0}
          />
          <StatCard
            icon={<DollarSign className="w-4 h-4 text-muted-foreground" />}
            label="Total Activities"
            value={(stats.splitsCount + stats.mergesCount + stats.redemptionsCount + stats.totalTrades).toLocaleString()}
          />
        </div>
      )}

      {/* Sophistication indicator */}
      {stats?.isSophisticated && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Zap className="w-4 h-4 text-yellow-400" />
          <div className="text-xs">
            <span className="font-medium text-yellow-400">Sophisticated Trader</span>
            <span className="text-muted-foreground ml-1">
              - Uses advanced strategies (splits/merges) to optimize positions
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stats && (
        <div className="text-center py-6 text-muted-foreground">
          <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No on-chain data synced yet</p>
          <p className="text-xs mt-1">Click "Deep Sync" to fetch verified blockchain data</p>
        </div>
      )}
    </div>
  );
}

const statTooltips: Record<string, string> = {
  'Splits': 'Position splits divide a single outcome token into YES/NO pairs. Used to hedge or manage risk across multiple positions.',
  'Merges': 'Position merges combine YES/NO token pairs back into collateral. Indicates active portfolio management and profit-taking.',
  'Redemptions': 'Redemptions occur when a market resolves and the trader claims their winnings. High count = experienced trader.',
  'Total Activities': 'Sum of all on-chain interactions: splits, merges, redemptions, and trades. Higher = more active blockchain user.',
};

function StatCard({ 
  icon, 
  label, 
  value, 
  highlight = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string;
  highlight?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'p-3 rounded-lg border cursor-help',
            highlight ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'
          )}>
            <div className="flex items-center gap-2 mb-1">
              {icon}
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={cn(
              'text-lg font-mono font-semibold',
              highlight ? 'text-primary' : 'text-foreground'
            )}>
              {value}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{statTooltips[label] || `${label} count for this wallet`}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact badges component for activity feed items
 */
export function OnChainBadges({ walletAddress }: { walletAddress: string }) {
  return <OnChainInsights walletAddress={walletAddress} compact />;
}
