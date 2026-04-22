import { useState, useMemo, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PriceChange } from '@/components/common/PriceChange';
import {
  useWalletPositions,
  usePositionsStats,
  useSyncAllActivity,
  categorizeCategoryType,
  type WalletPosition,
} from '@/hooks/usePolymarket';
import { formatCurrency, formatAddress, formatTimeAgo } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  TrendingUp,
  Users,
  Wallet,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  DollarSign,
  Percent,
  Clock,
  ExternalLink,
  Trophy,
  Zap,
  Filter,
  Activity,
} from 'lucide-react';

// Discovery stats stored in localStorage
interface DiscoveryStats {
  lastSyncTime: number;
  discoveredWallets: number;
  watchlistWallets: number;
  leaderboardCount: number;
  tradesCount: number;
  discoveryTier: string;
  newWalletAddresses: string[];
}

const DISCOVERY_STATS_KEY = 'discovery_stats';

interface MarketRadarProps {
  onSelectMarket: (marketId: string | null, marketQuestion?: string) => void;
  onSelectWallet?: (walletAddress: string) => void;
}

type SortField = 'name' | 'size' | 'time' | 'price' | 'entry' | 'avg' | 'chance' | 'vol24h' | 'liquidity' | 'pnl';
type SortDirection = 'asc' | 'desc';

// Category emoji mapping
const getCategoryEmoji = (category: string | null): string => {
  if (!category) return '📊';
  const lower = category.toLowerCase();
  if (lower.includes('politic') || lower.includes('election') || lower.includes('trump') || lower.includes('biden')) return '🏛️';
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('eth')) return '₿';
  if (lower.includes('sport') || lower.includes('nfl') || lower.includes('nba') || lower.includes('soccer')) return '⚽';
  if (lower.includes('tech') || lower.includes('ai') || lower.includes('apple')) return '💻';
  if (lower.includes('entertainment') || lower.includes('oscar') || lower.includes('movie')) return '🎬';
  if (lower.includes('economy') || lower.includes('fed') || lower.includes('rate')) return '💵';
  if (lower.includes('science') || lower.includes('space') || lower.includes('nasa')) return '🚀';
  if (lower.includes('weather') || lower.includes('climate')) return '🌤️';
  if (lower.includes('health') || lower.includes('covid') || lower.includes('fda')) return '🏥';
  return '📊';
};

// Category options
const CATEGORY_OPTIONS = [
  { value: 'Politics', label: 'Politics', emoji: '🏛️' },
  { value: 'Sports', label: 'Sports', emoji: '⚽' },
  { value: 'Crypto', label: 'Crypto', emoji: '₿' },
  { value: 'Economics', label: 'Economics', emoji: '💵' },
  { value: 'World', label: 'World', emoji: '🌍' },
  { value: 'Entertainment', label: 'Entertainment', emoji: '🎬' },
  { value: 'Other', label: 'Other', emoji: '📊' },
];

export function MarketRadar({ onSelectMarket, onSelectWallet }: MarketRadarProps) {
  const { t } = useLanguage();
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [hideClosedMarkets, setHideClosedMarkets] = useState(true);
  const [hideSoldPositions, setHideSoldPositions] = useState(false);
  const [hideInactiveMarkets, setHideInactiveMarkets] = useState(true);
  const [showNewOnly, setShowNewOnly] = useState(false);
  const [whalesOnly, setWhalesOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [discoveryStats, setDiscoveryStats] = useState<DiscoveryStats | null>(() => {
    try {
      const stored = localStorage.getItem(DISCOVERY_STATS_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const { data: positions = [], isLoading, refetch } = useWalletPositions({
    hideClosedMarkets,
    hideSoldPositions,
    hideInactiveMarkets,
    showNewOnly,
    whalesOnly,
    categories: selectedCategories.length > 0 ? selectedCategories : undefined,
  });
  
  const stats = useMemo(() => {
    const activePositions = positions.filter(p => !p.is_sold);
    const totalValue = activePositions.reduce((sum, p) => sum + p.size, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    const winCount = positions.filter(p => p.pnl > 0).length;
    const winRate = positions.length > 0 ? (winCount / positions.length) * 100 : 0;
    const uniqueWallets = new Set(positions.map(p => p.wallet_address)).size;
    const uniqueMarkets = new Set(positions.map(p => p.market_id)).size;

    return { totalPositions: positions.length, activePositions: activePositions.length, totalValue, totalPnl, winRate, uniqueWallets, uniqueMarkets };
  }, [positions]);

  const syncAll = useSyncAllActivity();

  useEffect(() => {
    if (syncAll.isSuccess && syncAll.data) {
      const newStats: DiscoveryStats = {
        lastSyncTime: Date.now(),
        discoveredWallets: syncAll.data.discoveredWallets || 0,
        watchlistWallets: syncAll.data.watchedWallets || 0,
        leaderboardCount: syncAll.data.sourceBreakdown?.leaderboard || 0,
        tradesCount: syncAll.data.sourceBreakdown?.global_trades || 0,
        discoveryTier: `${syncAll.data.offset}-${syncAll.data.offset + 50}`,
        newWalletAddresses: syncAll.data.newWalletAddresses || [],
      };
      setDiscoveryStats(newStats);
      localStorage.setItem(DISCOVERY_STATS_KEY, JSON.stringify(newStats));
    }
  }, [syncAll.isSuccess, syncAll.data]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const multiplier = sortDirection === 'desc' ? 1 : -1;
      switch (sortField) {
        case 'name': return multiplier * ((a.wallet_label || a.wallet_address).localeCompare(b.wallet_label || b.wallet_address));
        case 'size': return multiplier * (b.size - a.size);
        case 'time': return multiplier * (new Date(b.last_trade_time).getTime() - new Date(a.last_trade_time).getTime());
        case 'price': return multiplier * (b.current_price - a.current_price);
        case 'entry': return multiplier * (b.entry_price - a.entry_price);
        case 'avg': return multiplier * (b.avg_price - a.avg_price);
        case 'chance': return multiplier * (b.chance - a.chance);
        case 'vol24h': return multiplier * (b.vol_24h - a.vol_24h);
        case 'liquidity': return multiplier * (b.liquidity - a.liquidity);
        case 'pnl': return multiplier * (b.pnl - a.pnl);
        default: return 0;
      }
    });
  }, [positions, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />;
    return sortDirection === 'desc' 
      ? <ChevronDown className="w-2.5 h-2.5" /> 
      : <ChevronUp className="w-2.5 h-2.5" />;
  };

  const handleSync = () => {
    syncAll.mutate(undefined, { onSuccess: () => refetch() });
  };

  return (
    <div className="flex flex-col h-full font-mono bg-background">
      {/* ── Status Strip ── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-card/50">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Positions Radar</span>
        </div>
        <div className="h-3 w-px bg-border" />

        {/* Metrics */}
        <StatusMetric label="Active" value={stats.activePositions.toString()} />
        <StatusMetric label="Value" value={formatCurrency(stats.totalValue)} />
        <StatusMetric
          label="P/L"
          value={`${stats.totalPnl >= 0 ? '+' : ''}${formatCurrency(stats.totalPnl)}`}
          className={stats.totalPnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'}
        />
        <StatusMetric label="Win%" value={`${stats.winRate.toFixed(0)}%`} />
        <StatusMetric label="Wallets" value={stats.uniqueWallets.toString()} />
        <StatusMetric label="Markets" value={stats.uniqueMarkets.toString()} />

        {discoveryStats && discoveryStats.discoveredWallets > 0 && (
          <>
            <div className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-semibold">
              <Zap className="w-2.5 h-2.5" />
              +{discoveryStats.discoveredWallets} discovered
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={syncAll.isPending}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all',
            syncAll.isPending
              ? 'bg-primary/10 text-primary cursor-wait'
              : 'bg-primary/20 text-primary hover:bg-primary/30'
          )}
        >
          <RefreshCw className={cn('w-3 h-3', syncAll.isPending && 'animate-spin')} />
          {syncAll.isPending ? 'Syncing...' : 'Sync & Discover'}
        </button>

        {discoveryStats && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[9px] text-muted-foreground font-mono">
                Tier {discoveryStats.discoveryTier}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Next sync explores ranks {parseInt(discoveryStats.discoveryTier.split('-')[1]) || 50}-{(parseInt(discoveryStats.discoveryTier.split('-')[1]) || 50) + 50}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ── Filters Bar ── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border">
        {/* Category Filter */}
        <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
          <PopoverTrigger asChild>
            <button className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all',
              selectedCategories.length > 0 ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}>
              <Filter className="w-3 h-3" />
              Cat
              {selectedCategories.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 px-1 py-0 text-[8px] h-3.5 bg-primary/30">{selectedCategories.length}</Badge>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1.5 bg-card border-border z-50" align="start" sideOffset={4}>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Category</span>
                {selectedCategories.length > 0 && (
                  <button onClick={() => setSelectedCategories([])} className="text-[9px] text-primary hover:underline">Clear</button>
                )}
              </div>
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = selectedCategories.includes(cat.value);
                return (
                  <label key={cat.value} className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-[11px]',
                    isSelected ? 'bg-primary/10' : 'hover:bg-accent'
                  )}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedCategories([...selectedCategories, cat.value]);
                        else setSelectedCategories(selectedCategories.filter(c => c !== cat.value));
                      }}
                      className="w-3 h-3 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <div className="h-4 w-px bg-border" />

        {/* Toggle filters */}
        <FilterChip active={showNewOnly} onClick={() => setShowNewOnly(!showNewOnly)} label="New" />
        <FilterChip active={hideClosedMarkets} onClick={() => setHideClosedMarkets(!hideClosedMarkets)} label="Hide Closed" />
        <FilterChip active={hideInactiveMarkets} onClick={() => setHideInactiveMarkets(!hideInactiveMarkets)} label="Hide Inactive" />
        <FilterChip active={hideSoldPositions} onClick={() => setHideSoldPositions(!hideSoldPositions)} label="Hide Sold" />
        <FilterChip active={whalesOnly} onClick={() => setWhalesOnly(!whalesOnly)} label="🐋 Whales" />

        <div className="flex-1" />
        <span className="text-[9px] text-muted-foreground font-mono">
          {sortedPositions.length} positions
        </span>
      </div>

      {/* ── Positions Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : sortedPositions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Wallet className="w-5 h-5 text-muted-foreground mb-2" />
            <p className="text-[10px] text-muted-foreground font-mono">No positions found</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Add wallets and sync to see positions</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
              <tr className="text-left text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-2 py-1.5 cursor-pointer hover:text-foreground" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-0.5">Name <SortIcon field="name" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('size')}>
                  <div className="flex items-center justify-end gap-0.5">Size <SortIcon field="size" /></div>
                </th>
                <th className="px-2 py-1.5 text-center">Bet</th>
                <th className="px-2 py-1.5">Market</th>
                <th className="px-2 py-1.5 text-center cursor-pointer hover:text-foreground" onClick={() => handleSort('time')}>
                  <div className="flex items-center justify-center gap-0.5">Time <SortIcon field="time" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('price')}>
                  <div className="flex items-center justify-end gap-0.5">Price <SortIcon field="price" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('entry')}>
                  <div className="flex items-center justify-end gap-0.5">Entry <SortIcon field="entry" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('avg')}>
                  <div className="flex items-center justify-end gap-0.5">Avg <SortIcon field="avg" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('chance')}>
                  <div className="flex items-center justify-end gap-0.5">Chance <SortIcon field="chance" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('vol24h')}>
                  <div className="flex items-center justify-end gap-0.5">Vol24h <SortIcon field="vol24h" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('liquidity')}>
                  <div className="flex items-center justify-end gap-0.5">Liq <SortIcon field="liquidity" /></div>
                </th>
                <th className="px-2 py-1.5 text-right cursor-pointer hover:text-foreground" onClick={() => handleSort('pnl')}>
                  <div className="flex items-center justify-end gap-0.5">P/L <SortIcon field="pnl" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedPositions.map((position, idx) => (
                <PositionRow
                  key={`${position.wallet_address}-${position.market_id}-${position.outcome}-${idx}`}
                  position={position}
                  onWalletClick={() => onSelectWallet?.(position.wallet_address)}
                  onMarketClick={() => onSelectMarket(position.market_id, position.market_question)}
                  isNewlyDiscovered={discoveryStats?.newWalletAddresses?.includes(position.wallet_address) || false}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function StatusMetric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className={cn('text-[10px] font-semibold font-mono', className || 'text-foreground')}>{value}</span>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded text-[9px] font-semibold transition-all',
        active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      {label}
    </button>
  );
}

function PositionRow({ 
  position, 
  onWalletClick, 
  onMarketClick,
  isNewlyDiscovered = false,
}: { 
  position: WalletPosition; 
  onWalletClick: () => void;
  onMarketClick: () => void;
  isNewlyDiscovered?: boolean;
}) {
  const timeAgo = formatTimeAgo(new Date(position.last_trade_time).getTime());
  const emoji = getCategoryEmoji(position.market_category);
  
  return (
    <tr className="group hover:bg-accent/20 transition-colors">
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <button onClick={onWalletClick} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors font-mono">
            {position.wallet_label ? `@${position.wallet_label}` : formatAddress(position.wallet_address)}
          </button>
          {isNewlyDiscovered && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-primary/20 text-primary text-[8px] font-bold animate-pulse">
              <Zap className="w-2 h-2" />NEW
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-[11px] font-mono font-semibold text-foreground">{formatCurrency(position.size)}</span>
      </td>
      <td className="px-2 py-1.5 text-center">
        <Badge variant={position.outcome.toLowerCase() === 'yes' ? 'success' : 'danger'} className="text-[9px] px-1 py-0 h-4">
          {position.outcome}
        </Badge>
      </td>
      <td className="px-2 py-1.5 max-w-[250px]">
        <button onClick={onMarketClick} className="flex items-center gap-1.5 text-left group/market">
          <span className="text-xs">{emoji}</span>
          <span className="text-[10px] text-muted-foreground group-hover/market:text-foreground transition-colors line-clamp-1">
            {position.market_question.length > 45 ? position.market_question.slice(0, 45) + '…' : position.market_question}
          </span>
          {position.market_closed && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">CLOSED</Badge>
          )}
        </button>
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className="text-[10px] text-muted-foreground font-mono">{timeAgo}</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-[10px] font-mono text-foreground">{(position.current_price * 100).toFixed(0)}¢</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-[10px] font-mono text-muted-foreground">{(position.entry_price * 100).toFixed(0)}¢</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-[10px] font-mono text-muted-foreground">{(position.avg_price * 100).toFixed(0)}¢</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className={cn(
          'text-[10px] font-mono font-medium',
          position.chance >= 0.7 ? 'text-[hsl(var(--bull))]' : position.chance <= 0.3 ? 'text-[hsl(var(--bear))]' : 'text-foreground'
        )}>
          {position.chance > 0 ? `${(position.chance * 100).toFixed(0)}%` : '—'}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-[10px] font-mono text-muted-foreground">{position.vol_24h > 0 ? formatCurrency(position.vol_24h) : '—'}</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="text-[10px] font-mono text-muted-foreground">{position.liquidity > 0 ? formatCurrency(position.liquidity) : '—'}</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="flex flex-col items-end">
          <span className={cn(
            'text-[10px] font-mono font-semibold',
            position.pnl >= 0 ? 'text-[hsl(var(--bull))]' : 'text-[hsl(var(--bear))]'
          )}>
            {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
          </span>
          {!position.is_sold && (
            <span className="text-[8px] text-muted-foreground">unreal</span>
          )}
        </div>
      </td>
    </tr>
  );
}
