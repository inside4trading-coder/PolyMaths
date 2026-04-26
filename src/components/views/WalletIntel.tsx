import { useState, useEffect, forwardRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMarketNameResolver, resolveMarketName } from '@/hooks/useMarketNameResolver';
import { WalletActivityChart } from '@/components/wallet/WalletActivityChart';
import { cn, formatCurrency, formatAddress, formatTimeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { WalletDetailPanel } from '@/components/wallet/WalletDetailPanel';
import { 
  useWallets, 
  useActivityFeed, 
  useActivityStats,
  useWalletStats, 
  useToggleWalletWatch, 
  useSyncAllActivity,
  useSyncWalletFromPolymarket,
  type Wallet, 
  type WalletActivity,
  type ActivityFilterType 
} from '@/hooks/usePolymarket';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  Eye, EyeOff, Plus, Copy, ExternalLink, AlertTriangle,
  TrendingUp, Users, Activity, Zap, Loader2, Flame, Filter,
  ArrowUpRight, ArrowDownRight, Target, RefreshCw, ChevronDown,
  Radio, Wallet as WalletIcon
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Trade size indicators
const getTradeSize = (size: number): { label: string; icon: React.ReactNode; className: string } | null => {
  if (size >= 10000) return { label: 'WHALE', icon: <Flame className="w-3 h-3" />, className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
  if (size >= 1000) return { label: 'BIG', icon: <Zap className="w-3 h-3" />, className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
  return null;
};

interface WalletIntelProps {
  initialWallet?: string | null;
  onClearInitialWallet?: () => void;
}

const ACTIVITY_LIMITS = [50, 100, 250, 500, 1000] as const;

/* ─── Section header (matches BotBuilder) ─── */
function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs font-mono uppercase tracking-widest text-foreground">{label}</span>
    </div>
  );
}

export function WalletIntel({ initialWallet, onClearInitialWallet }: WalletIntelProps) {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [hasSynced, setHasSynced] = useState(false);
  const [detailWallet, setDetailWallet] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilterType>('all');
  const [activityLimit, setActivityLimit] = useState<number>(150);
  const [showLimitDropdown, setShowLimitDropdown] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (initialWallet) {
      setDetailWallet(initialWallet);
      onClearInitialWallet?.();
    }
  }, [initialWallet, onClearInitialWallet]);

  const { user } = useAuth();
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(true, user?.id);
  const handleAddWallet = async () => {
    const address = newAddress.trim().toLowerCase();
    if (!user) {
      toast.error('You must be signed in to add a wallet');
      return;
    }
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      toast.error('Invalid Ethereum address');
      return;
    }
    setAdding(true);
    try {
      await toggleWatch.mutateAsync({ address, isWatched: true, userId: user.id });
      if (newLabel.trim()) {
        await supabase.from('wallets').update({ label: newLabel.trim() }).eq('address', address).eq('user_id', user.id);
      }
      toast.success('Wallet added to watchlist');
      syncSingleWallet.mutate({ walletAddress: address, limit: 500 });
      setNewAddress('');
      setNewLabel('');
      setAddOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add wallet');
    } finally {
      setAdding(false);
    }
  };
  const { data: activities = [], isLoading: activitiesLoading, refetch: refetchActivities } = useActivityFeed({
    walletAddress: selectedWallet || undefined,
    filter: activityFilter,
    limit: activityLimit,
  });

  // Fetch position counts per wallet — query each wallet individually to avoid 1000-row limit
  const walletAddresses = useMemo(() => wallets.map(w => w.address), [wallets]);
  const { data: positionCounts = {} } = useQuery({
    queryKey: ['wallet-position-counts', walletAddresses.join(',')],
    queryFn: async () => {
      if (walletAddresses.length === 0) return {};
      const counts: Record<string, number> = {};
      // Query each wallet individually with head:true count to avoid row limits
      await Promise.all(
        walletAddresses.map(async (addr) => {
          const { count, error } = await supabase
            .from('wallet_positions')
            .select('*', { count: 'exact', head: true })
            .eq('wallet_address', addr)
            .gt('size', 0);
          if (!error && count !== null) {
            counts[addr] = count;
          }
        })
      );
      return counts;
    },
    enabled: walletAddresses.length > 0,
    staleTime: 30_000,
  });

  const missingConditionIds = useMemo(
    () => activities.filter(a => !a.market_question).map(a => a.condition_id),
    [activities]
  );
  const { data: marketNameMap } = useMarketNameResolver(missingConditionIds);

  const marketIdsInFeed = useMemo(
    () => [...new Set(activities.map(a => a.market_id).filter((id): id is string => !!id))],
    [activities]
  );

  const { data: activeMarketIdSet = new Set<string>() } = useQuery({
    queryKey: ['wallet-activity-active-market-ids', marketIdsInFeed.join(',')],
    queryFn: async () => {
      if (marketIdsInFeed.length === 0) return new Set<string>();
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('markets')
        .select('id')
        .in('id', marketIdsInFeed)
        .or(`closed.is.false,end_date.is.null,end_date.gt.${nowIso}`);

      if (error) throw error;
      return new Set((data || []).map((m) => m.id));
    },
    enabled: marketIdsInFeed.length > 0,
    staleTime: 60_000,
  });

  const visibleActivities = useMemo(
    () => activities.filter((a) => !a.market_id || activeMarketIdSet.has(a.market_id)),
    [activities, activeMarketIdSet]
  );

  const syncAllActivity = useSyncAllActivity();
  const syncSingleWallet = useSyncWalletFromPolymarket();
  const { data: activityStats } = useActivityStats();
  const walletStats = useWalletStats();
  const toggleWatch = useToggleWalletWatch();

  const selectedWalletData = selectedWallet 
    ? wallets.find(w => w.address === selectedWallet)
    : null;

  // Auto-sync wallet activity when a wallet is selected
  useEffect(() => {
    if (selectedWallet && !syncSingleWallet.isPending) {
      syncSingleWallet.mutate({ walletAddress: selectedWallet, limit: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWallet]);

  const feedStats = useMemo(() => {
    const totalVolume = visibleActivities.reduce((sum, a) => sum + a.size, 0);
    const buyVolume = visibleActivities.filter(a => a.side === 'BUY').reduce((sum, a) => sum + a.size, 0);
    const sellVolume = visibleActivities.filter(a => a.side === 'SELL').reduce((sum, a) => sum + a.size, 0);
    const whaleCount = visibleActivities.filter(a => a.size >= 10000).length;
    const unusualCount = visibleActivities.filter(a => a.is_unusual).length;
    return {
      totalVolume, buyVolume, sellVolume,
      buyRatio: totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50,
      whaleCount, unusualCount,
      avgSize: visibleActivities.length > 0 ? totalVolume / visibleActivities.length : 0,
    };
  }, [visibleActivities]);

  const totalPositions = useMemo(() => {
    return Object.values(positionCounts).reduce((sum, c) => sum + c, 0);
  }, [positionCounts]);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
  };


  const filterButtons: { value: ActivityFilterType; label: string; icon?: React.ReactNode }[] = [
    { value: 'all', label: 'All' },
    { value: 'unusual', label: `Unusual (${feedStats.unusualCount})`, icon: <AlertTriangle className="w-3 h-3" /> },
    { value: 'whale', label: `Whale (${feedStats.whaleCount})`, icon: <Flame className="w-3 h-3" /> },
    { value: 'buy', label: 'Buys', icon: <ArrowUpRight className="w-3 h-3" /> },
    { value: 'sell', label: 'Sells', icon: <ArrowDownRight className="w-3 h-3" /> },
  ];

  const isSyncing = syncAllActivity.isPending || syncSingleWallet.isPending;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col h-full font-mono">
        {/* ─── Status Strip (matches BotBuilder/Monitor) ─── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 text-[11px]">
          <div className="flex items-center gap-4">
            <Badge variant={wallets.length > 0 ? 'success' : 'outline'} pulse={isSyncing}>
              <Radio className="w-3 h-3 mr-1" />
              {isSyncing ? 'SYNCING' : 'TRACKING'}
            </Badge>
            <span className="text-muted-foreground">
              Wallets: <span className="text-primary font-bold">{wallets.length}</span>
            </span>
            <span className="text-muted-foreground">
              Volume: <span className="text-foreground font-bold">{formatCurrency(walletStats.totalTrackedVolume)}</span>
            </span>
            <span className="text-muted-foreground">
              Positions: <span className="text-primary font-bold">{totalPositions}</span>
            </span>
            <span className="text-muted-foreground">
              Unusual: <span className="text-warning font-bold">{feedStats.unusualCount}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedWallet) {
                  syncSingleWallet.mutate({ walletAddress: selectedWallet, limit: 500 });
                } else {
                  syncAllActivity.mutate(undefined, { onSuccess: () => setHasSynced(true) });
                }
                setHasSynced(true);
              }}
              disabled={isSyncing}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded text-[10px] uppercase tracking-wider font-bold transition-all',
                isSyncing
                  ? 'bg-primary/10 text-primary cursor-wait'
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
              )}
            >
              <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
              {selectedWallet ? 'Sync Wallet' : 'Sync All'}
            </button>
          </div>
        </div>

        {/* ─── Main content ─── */}
        <div className="flex-1 flex overflow-hidden">
          {/* ═══ Left Panel — Watchlist ═══ */}
          <div className="w-72 border-r border-border flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border/50">
              <div className="flex items-center justify-between">
                <SectionHeader icon={WalletIcon} label="Watchlist" />
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {walletsLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : wallets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <Users className="w-6 h-6 text-muted-foreground mb-2" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No wallets tracked</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-1">
                  {wallets.map(wallet => (
                    <WalletListItem
                      key={wallet.address}
                      wallet={wallet}
                      isSelected={selectedWallet === wallet.address}
                      positionCount={positionCounts[wallet.address] || 0}
                      onSelect={() => setSelectedWallet(selectedWallet === wallet.address ? null : wallet.address)}
                      onViewDetail={() => setDetailWallet(wallet.address)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══ Right Panel — Activity Feed ═══ */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected Wallet Detail */}
            {selectedWalletData && (
              <WalletDetail
                wallet={selectedWalletData}
                onCopy={copyAddress}
                onToggleWatch={(isWatched) => user && toggleWatch.mutate({ address: selectedWalletData.address, isWatched, userId: user.id })}
                onViewFull={() => setDetailWallet(selectedWalletData.address)}
              />
            )}

            {/* ─── Filter / Stats Bar ─── */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 text-[11px]">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  <span className="font-bold text-foreground">{visibleActivities.length}</span> activities
                </span>
                <span className="text-muted-foreground">
                  Vol: <span className="text-foreground">{formatCurrency(feedStats.totalVolume)}</span>
                </span>
                <span>
                  <span className="text-bull">{feedStats.buyRatio.toFixed(0)}%B</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-bear">{(100 - feedStats.buyRatio).toFixed(0)}%S</span>
                </span>
                {feedStats.whaleCount > 0 && (
                  <span className="flex items-center gap-1 text-orange-400">
                    <Flame className="w-3 h-3" /> {feedStats.whaleCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {/* Limit Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowLimitDropdown(!showLimitDropdown)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <span>{activityLimit}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showLimitDropdown && (
                    <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded shadow-lg z-10 py-1 min-w-[60px]">
                      {ACTIVITY_LIMITS.map(limit => (
                        <button
                          key={limit}
                          onClick={() => { setActivityLimit(limit); setShowLimitDropdown(false); }}
                          className={cn(
                            'w-full px-2 py-1 text-left text-[10px] hover:bg-accent transition-colors font-mono',
                            activityLimit === limit ? 'text-primary font-bold' : 'text-muted-foreground'
                          )}
                        >
                          {limit}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-3 w-px bg-border" />

                {filterButtons.map(btn => (
                  <button
                    key={btn.value}
                    onClick={() => setActivityFilter(btn.value)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider transition-colors',
                      activityFilter === btn.value
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'hover:bg-accent text-muted-foreground'
                    )}
                  >
                    {btn.icon}
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Activity Feed ─── */}
            <div className="flex-1 overflow-auto">
              <div className="p-3">
                {!hasSynced ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
                    <RefreshCw className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-mono">
                      Pulsa <span className="text-primary font-bold">Sync All</span> para cargar actividad en tiempo real
                    </p>
                    <button
                      onClick={() => { syncAllActivity.mutate(); setHasSynced(true); }}
                      disabled={isSyncing}
                      className="flex items-center gap-2 px-4 py-2 rounded bg-primary/20 text-primary hover:bg-primary/30 text-xs uppercase tracking-wider font-bold transition-all"
                    >
                      <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
                      Sync All
                    </button>
                  </div>
                ) : activitiesLoading ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : visibleActivities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <Activity className="w-6 h-6 text-muted-foreground mb-2" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {activityFilter !== 'all' ? 'No matching activities' : 'No activity recorded'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {visibleActivities.map(activity => (
                      <ActivityCard 
                        key={activity.id} 
                        activity={activity} 
                        onWalletClick={() => setDetailWallet(activity.wallet_address)}
                        marketNameMap={marketNameMap}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Detail Panel */}
        {detailWallet && (
          <WalletDetailPanel 
            walletAddress={detailWallet} 
            onClose={() => setDetailWallet(null)} 
          />
        )}

        {/* Add Wallet Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Wallet to Watchlist</DialogTitle>
              <DialogDescription>
                Enter a Polymarket wallet address (0x…) to start tracking its activity.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Address</label>
                <Input
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-xs"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Label (optional)</label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Whale #1"
                  className="text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setAddOpen(false)}
                className="px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddWallet}
                disabled={adding || !newAddress.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding && <Loader2 className="w-3 h-3 animate-spin" />}
                Add Wallet
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

/* ═══ Sub-components ═══ */

function WalletListItem({ wallet, isSelected, positionCount, onSelect, onViewDetail }: { 
  wallet: Wallet; 
  isSelected: boolean; 
  positionCount: number;
  onSelect: () => void;
  onViewDetail: () => void;
}) {
  const unusualScore = wallet.unusual_score ?? 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-2.5 p-2 rounded-lg border transition-all text-left group',
        isSelected
          ? 'bg-primary/5 border-primary/30'
          : 'bg-transparent border-border/50 hover:border-primary/20'
      )}
    >
      <div className={cn(
        'w-2 h-2 rounded-full flex-shrink-0 transition-all',
        isSelected ? 'bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]' : 'bg-muted-foreground/50'
      )} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-foreground truncate">
            {wallet.label || formatAddress(wallet.address)}
          </span>
          <div className="flex items-center gap-1.5">
            {unusualScore >= 80 && (
              <AlertTriangle className="w-3 h-3 text-warning" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
              className="p-0.5 hover:bg-primary/20 rounded transition-colors opacity-0 group-hover:opacity-100"
              title="View details"
            >
              <Target className="w-3 h-3 text-primary" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[10px]">
          <span className="font-mono text-primary">
            {positionCount} pos
          </span>
          {unusualScore >= 50 && (
            <span className="font-mono text-warning">{unusualScore}u</span>
          )}
        </div>
        {wallet.last_active && (
          <span className="text-[9px] text-muted-foreground">
            {formatTimeAgo(new Date(wallet.last_active).getTime())}
          </span>
        )}
      </div>
    </button>
  );
}

const WalletDetail = forwardRef<HTMLDivElement, {
  wallet: Wallet;
  onCopy: (address: string) => void;
  onToggleWatch: (isWatched: boolean) => void;
  onViewFull: () => void;
}>(function WalletDetail({ wallet, onCopy, onToggleWatch, onViewFull }, ref) {
  return (
    <div className="px-4 py-3 border-b border-border bg-card/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-foreground">
            {wallet.label || 'Unknown Wallet'}
          </span>
          <code className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {formatAddress(wallet.address)}
          </code>
          <button onClick={() => onCopy(wallet.address)} className="p-0.5 hover:bg-accent rounded">
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
          <a 
            href={`https://polygonscan.com/address/${wallet.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-0.5 hover:bg-accent rounded"
          >
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onViewFull}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider font-bold rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
          >
            Full Profile
          </button>
          <button 
            onClick={() => onToggleWatch(!wallet.is_watched)}
            className="p-1 hover:bg-accent rounded"
          >
            {wallet.is_watched ? (
              <Eye className="w-4 h-4 text-primary" />
            ) : (
              <EyeOff className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>
      
      {/* Activity Chart */}
      <div className="mt-2">
        <WalletActivityChart walletAddress={wallet.address} />
      </div>
    </div>
  );
});

function ActivityCard({ activity, onWalletClick, marketNameMap }: { activity: WalletActivity; onWalletClick: () => void; marketNameMap?: Map<string, string> }) {
  const tradeSize = getTradeSize(activity.size);
  
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border transition-all text-[11px]',
        activity.is_unusual
          ? 'bg-warning/5 border-warning/30'
          : 'bg-card/50 border-border/50 hover:border-border'
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Badge variant={activity.activity_type === 'TRADE' ? 
            (activity.side === 'BUY' ? 'success' : 'danger') : 
            'outline'
          }>
            {activity.side === 'BUY' ? (
              <ArrowUpRight className="w-3 h-3 mr-0.5" />
            ) : (
              <ArrowDownRight className="w-3 h-3 mr-0.5" />
            )}
            {activity.side || activity.activity_type}
          </Badge>
          {tradeSize && (
            <span className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border',
              tradeSize.className
            )}>
              {tradeSize.icon}
              {tradeSize.label}
            </span>
          )}
          {activity.is_unusual && (
            <Badge variant="warning" pulse>
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              Unusual
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {formatTimeAgo(new Date(activity.timestamp).getTime())}
        </span>
      </div>
      <p className="text-foreground mb-1 line-clamp-1 text-[11px]">
        {resolveMarketName(activity, marketNameMap)}
      </p>
      <div className="flex items-center gap-3 text-[10px]">
        <button 
          onClick={onWalletClick}
          className="text-muted-foreground hover:text-primary transition-colors group"
        >
          <code className="font-mono group-hover:text-primary">{formatAddress(activity.wallet_address)}</code>
        </button>
        {activity.outcome && (
          <span className={activity.side === 'BUY' ? 'text-bull' : 'text-bear'}>
            {activity.outcome}
          </span>
        )}
        <span className="font-mono font-bold text-foreground">
          {formatCurrency(activity.size)}
        </span>
        {activity.price && (
          <span className="font-mono text-muted-foreground">
            @{(activity.price * 100).toFixed(1)}¢
          </span>
        )}
      </div>
      {activity.unusual_reason && (
        <p className="mt-1.5 text-[10px] text-warning bg-warning/10 px-2 py-0.5 rounded font-mono">
          {activity.unusual_reason}
        </p>
      )}
    </div>
  );
}
