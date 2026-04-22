import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useMarketNameResolver, resolveMarketName } from '@/hooks/useMarketNameResolver';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWallet, useWalletTradesInfinite, useToggleWalletWatch } from '@/hooks/usePolymarket';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatTimeAgo, formatAddress } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OnChainInsights } from '@/components/wallet/OnChainInsights';
import { retryEdgeFunction } from '@/lib/supabaseRetry';
import { toast } from 'sonner';
import {
  X,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  TrendingUp,
  TrendingDown,
  Wallet,
  Check,
  Flame,
  Zap,
  RefreshCw,
  ChevronDown,
  Link2,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, AreaChart, Area, CartesianGrid, ReferenceLine, XAxis } from 'recharts';
import type { Tables } from '@/integrations/supabase/types';

type WalletPosition = Tables<'wallet_positions'>;

interface WalletDetailPanelProps {
  walletAddress: string;
  onClose: () => void;
}

type TabType = 'positions' | 'activity' | 'onchain';

/**
 * Generate a gradient background based on wallet address (similar to Polymarket default avatars)
 */
function generateAddressGradient(address: string): string {
  // Simple hash from address
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate 2 hue values for gradient
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 40 + Math.abs((hash >> 8) % 60)) % 360;
  
  return `linear-gradient(135deg, hsl(${hue1}, 70%, 55%), hsl(${hue2}, 80%, 45%))`;
}

/**
 * Hook to sync wallet positions from Polymarket API and store in DB
 */
function useSyncWalletPositions() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (walletAddress: string) => {
      console.log('[WalletDetailPanel] Syncing positions for:', walletAddress);
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { action: 'sync_wallet_positions', wallet: walletAddress },
        })
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (err: any) => {
      const msg = err?.message || String(err || 'Unknown error');
      toast.error('Sync positions failed', { description: msg });
    },
  });
}

/**
 * Hook to sync wallet activity history (trades, redeems, etc.) from Polymarket API
 */
function useSyncWalletActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (walletAddress: string) => {
      console.log('[WalletDetailPanel] Syncing activity history for:', walletAddress);
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { 
            action: 'fetch_wallet_activity', 
            params: {
              wallet_address: walletAddress,
              deep_fetch: true,
              limit: 500
            }
          },
        })
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_, walletAddress) => {
      queryClient.invalidateQueries({ queryKey: ['walletActivity'] });
      queryClient.invalidateQueries({ queryKey: ['walletTrades'] });
      queryClient.invalidateQueries({ queryKey: ['walletTradesInfinite', walletAddress] });
    },
    onError: (err: any) => {
      const msg = err?.message || String(err || 'Unknown error');
      toast.error('Sync activity failed', { description: msg });
    },
  });
}

/**
 * Hook to sync historical P/L from all wallet activities (BUY/SELL/REDEEM cashflows)
 */
/**
 * Hook to sync historical P/L - polls for completion since edge function runs in background
 */
function useSyncWalletPnl() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (walletAddress: string) => {
      console.log('[WalletDetailPanel] Syncing historical P/L for:', walletAddress);
      
      // Start the background sync
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { action: 'sync_wallet_pnl', wallet: walletAddress },
        })
      );
      if (error) throw error;
      
      // Poll for completion (edge function runs in background)
      const maxAttempts = 60; // Max 60 seconds
      const pollInterval = 1000; // Check every 1 second
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const { data: walletData } = await supabase
          .from('wallets')
          .select('pnl_sync_status, total_pnl, realized_pnl, closed_positions_count')
          .eq('address', walletAddress.toLowerCase())
          .single();
        
        console.log(`[WalletDetailPanel] P/L sync status check ${attempt + 1}: ${walletData?.pnl_sync_status}`);
        
        if (walletData?.pnl_sync_status === 'completed') {
          console.log('[WalletDetailPanel] P/L sync completed:', walletData);
          return { ...data, completed: true, ...walletData };
        }
        
        if (walletData?.pnl_sync_status === 'error') {
          throw new Error('P/L sync failed');
        }
      }
      
      console.log('[WalletDetailPanel] P/L sync timed out, returning partial data');
      return { ...data, completed: false, timedOut: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
    },
    onError: (err: any) => {
      const msg = err?.message || String(err || 'Unknown error');
      toast.error('P/L sync failed', { description: msg });
    },
  });
}

/**
 * API-First: Fetch FRESH wallet metrics directly from Polymarket API
 * This is the source of truth - bypasses any cached/stale DB values
 */
function useRefreshWalletMetrics() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (walletAddress: string) => {
      console.log('[WalletDetailPanel] Refreshing metrics from API for:', walletAddress);
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { action: 'refresh_wallet_metrics', wallet: walletAddress },
        })
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('[WalletDetailPanel] Fresh metrics received:', data);
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
    },
    onError: (err: any) => {
      const msg = err?.message || String(err || 'Unknown error');
      toast.error('Refresh metrics failed', { description: msg });
    },
  });
}

/**
 * Hook to fetch wallet positions from DB (pre-calculated P/L from Polymarket)
 */
function useWalletPositionsFromDB(walletAddress: string) {
  return useQuery({
    queryKey: ['walletPositions', walletAddress],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_positions')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase());
      
      if (error) throw error;
      return data as WalletPosition[];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
}

export function WalletDetailPanel({ walletAddress, onClose }: WalletDetailPanelProps) {
  const { t, translateOutcome } = useLanguage();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const hasAutoSynced = useRef(false);

  // CRITICAL: Pass userId to useWallet so RLS-protected data loads correctly
  const walletQuery = useWallet(walletAddress, user?.id);
  const positionsQuery = useWalletPositionsFromDB(walletAddress);
  const tradesQuery = useWalletTradesInfinite(walletAddress);
  const toggleWatch = useToggleWalletWatch();
  const syncPositions = useSyncWalletPositions();
  const syncActivity = useSyncWalletActivity();
  const syncPnl = useSyncWalletPnl();
  const refreshMetrics = useRefreshWalletMetrics();

  const wallet = walletQuery.data;
  const positions = positionsQuery.data || [];
  
  // Resolve unknown market names from activities
  const allTrades = useMemo(
    () => tradesQuery.data?.pages?.flatMap(p => p.trades) || [],
    [tradesQuery.data]
  );
  const missingConditionIds = useMemo(
    () => [
      ...allTrades.filter(t => !t.market_question).map(t => t.condition_id),
      ...positions.filter(p => !p.title).map(p => p.condition_id),
    ],
    [allTrades, positions]
  );
  const { data: marketNameMap } = useMarketNameResolver(missingConditionIds);
  
  // Smart sync: Only refresh if data is stale (>5 minutes old)
  // This reduces unnecessary API calls while ensuring data freshness
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  
  const isDataStale = useMemo(() => {
    if (!wallet?.updated_at) return true; // No data = stale
    const lastUpdate = new Date(wallet.updated_at).getTime();
    const now = Date.now();
    return (now - lastUpdate) > STALE_THRESHOLD_MS;
  }, [wallet?.updated_at]);

  const isPositionsStale = useMemo(() => {
    if (!positions.length) return true; // No positions = stale
    // Check the most recent synced_at from positions
    const latestSync = positions.reduce((latest, p) => {
      if (!p.synced_at) return latest;
      const syncTime = new Date(p.synced_at).getTime();
      return syncTime > latest ? syncTime : latest;
    }, 0);
    if (latestSync === 0) return true;
    return (Date.now() - latestSync) > STALE_THRESHOLD_MS;
  }, [positions]);

  useEffect(() => {
    if (walletAddress && !hasAutoSynced.current && !refreshMetrics.isPending) {
      hasAutoSynced.current = true;
      
      // Only sync if data is stale
      if (isPositionsStale) {
        console.log('[WalletDetailPanel] Positions stale, syncing...');
        syncPositions.mutate(walletAddress);
      } else {
        console.log('[WalletDetailPanel] Positions fresh, skipping sync');
      }
      
      if (isDataStale) {
        console.log('[WalletDetailPanel] Metrics stale, refreshing from API...');
        refreshMetrics.mutate(walletAddress);
      } else {
        console.log('[WalletDetailPanel] Metrics fresh, skipping refresh');
      }
    }
  }, [walletAddress, isDataStale, isPositionsStale]);

  // Reset auto-sync flag when wallet changes
  useEffect(() => {
    hasAutoSynced.current = false;
  }, [walletAddress]);

  // Calculate stats from positions (pre-calculated by Polymarket)
  const stats = useMemo(() => {
    const activePositions = positions.filter(p => p.size > 0);
    const closedPositions = positions.filter(p => p.size === 0);
    
    // Sum P/L from all positions
    const totalCashPnl = positions.reduce((sum, p) => sum + (p.cash_pnl || 0), 0);
    const totalRealizedPnl = positions.reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    
    // Calculate unrealized P/L for active positions
    const unrealizedPnl = activePositions.reduce((sum, p) => {
      const currentValue = (p.cur_price || 0) * p.size;
      const costBasis = (p.avg_price || 0) * p.size;
      return sum + (currentValue - costBasis);
    }, 0);
    
    // Total positions value
    const positionsValue = activePositions.reduce((sum, p) => 
      sum + ((p.cur_price || 0) * p.size), 0);
    
    // Unique markets traded
    const uniqueMarkets = new Set(positions.map(p => p.condition_id)).size;
    
    return {
      totalPnl: totalCashPnl,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl,
      positionsValue,
      predictions: uniqueMarkets,
      activeCount: activePositions.length,
      closedCount: closedPositions.length,
    };
  }, [positions]);

  // Win Rate: Use ONLY wallets.win_rate from Polymarket API (source of truth)
  // This is synced via refresh_wallet_metrics and represents the complete trading history
  const displayWinRate = (wallet?.win_rate || 0) * 100;

  // Activities for Activity tab (paginated, newest first)
  const paginatedActivities = useMemo(() => {
    const all = tradesQuery.data?.pages.flatMap((page) => page.trades) || [];
    const seen = new Set<string>();
    const unique: typeof all = [];
    for (const t of all) {
      if (!t?.id) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }
    return unique;
  }, [tradesQuery.data]);

  const isLoading = walletQuery.isLoading || positionsQuery.isLoading;
  const isRefreshing = refreshMetrics.isPending || syncPositions.isPending || syncActivity.isPending;
  const hasMoreTrades = tradesQuery.hasNextPage;
  const isLoadingMore = tradesQuery.isFetchingNextPage;

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // user already extracted from useAuth at top of component

  const handleToggleWatch = () => {
    if (wallet && user) {
      toggleWatch.mutate({ address: walletAddress, isWatched: !wallet.is_watched, userId: user.id });
    }
  };

  // Full sync: positions + activity history + metrics from Polymarket API
  const handleSync = () => {
    console.log('[WalletDetailPanel] Full sync triggered - positions, activity & metrics');
    syncPositions.mutate(walletAddress);
    syncActivity.mutate(walletAddress);
    refreshMetrics.mutate(walletAddress);
  };

  const handleSyncPnl = () => {
    syncPnl.mutate(walletAddress);
  };

  const getTradeIndicator = (size: number) => {
    if (size >= 10000) return { label: 'WHALE', icon: <Flame className="w-3 h-3" />, className: 'bg-orange-500/20 text-orange-400' };
    if (size >= 1000) return { label: 'BIG', icon: <Zap className="w-3 h-3" />, className: 'bg-yellow-500/20 text-yellow-400' };
    return null;
  };

  // Group positions by active/closed
  const activePositions = positions.filter(p => p.size > 0);
  const closedPositions = positions.filter(p => p.size === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between">
            {/* Left: Avatar + Info */}
            <div className="flex items-center gap-3">
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-primary/30"
                style={{ background: generateAddressGradient(walletAddress) }}
              >
                {(wallet as any)?.profile_image ? (
                  <img 
                    src={(wallet as any).profile_image} 
                    alt={wallet?.label || 'Wallet'} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // On error, hide image (gradient shows through)
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {wallet?.label ? `@${wallet.label}` : formatAddress(walletAddress)}
                </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{formatAddress(walletAddress)}</span>
                  <button
                    onClick={handleCopy}
                    className="p-0.5 hover:bg-accent rounded transition-colors"
                    title="Copy address"
                  >
                    {copied ? <Check className="w-3 h-3 text-bull" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <a
                    href={`https://polygonscan.com/address/${walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-0.5 hover:bg-accent rounded transition-colors"
                    title="View on Polygonscan"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://polymarket.com/profile/${walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors font-medium"
                    title="View on Polymarket"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Polymarket Profile
                  </a>
                </div>
              </div>
            </div>

            {/* Right: P/L + Actions */}
            <div className="flex items-start gap-4">
              {/* P/L Display - Show BOTH active and historical */}
              <div className="text-right">
                {/* Historical Total P/L (if available) */}
                {(wallet?.total_pnl != null && wallet.total_pnl !== 0) ? (
                  <>
                    <div className="flex items-center gap-1 justify-end mb-1">
                      {wallet.total_pnl >= 0 ? (
                        <TrendingUp className="w-3.5 h-3.5 text-bull" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-bear" />
                      )}
                      <span className="text-xs text-muted-foreground">Total P/L (All-Time)</span>
                    </div>
                    <p className={cn(
                      'text-xl font-mono font-bold',
                      wallet.total_pnl >= 0 ? 'text-bull' : 'text-bear'
                    )}>
                      {wallet.total_pnl >= 0 ? '+' : ''}{formatCurrency(wallet.total_pnl)}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className={wallet.realized_pnl && wallet.realized_pnl >= 0 ? 'text-bull/70' : 'text-bear/70'}>
                        Realized: {formatCurrency(wallet.realized_pnl || 0)}
                      </span>
                      <span className="text-muted-foreground/50">•</span>
                      <span className={stats.totalPnl >= 0 ? 'text-bull/70' : 'text-bear/70'}>
                        Active: {formatCurrency(stats.totalPnl)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1 justify-end mb-1">
                      {stats.totalPnl >= 0 ? (
                        <TrendingUp className="w-3.5 h-3.5 text-bull" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-bear" />
                      )}
                      <span className="text-xs text-muted-foreground">Active P/L</span>
                    </div>
                    <p className={cn(
                      'text-xl font-mono font-bold',
                      stats.totalPnl >= 0 ? 'text-bull' : 'text-bear'
                    )}>
                      {stats.totalPnl >= 0 ? '+' : ''}{formatCurrency(stats.totalPnl)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {positions.length} positions
                    </p>
                    <button
                      onClick={handleSyncPnl}
                      disabled={syncPnl.isPending}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      {syncPnl.isPending ? 'Calculating...' : '→ Calculate All-Time P/L'}
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Sync Button - API-First: fetches fresh data from Polymarket */}
                <button
                  onClick={handleSync}
                  disabled={isRefreshing}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border hover:bg-accent',
                    isRefreshing && 'border-primary/50 bg-primary/10'
                  )}
                  title="Refresh metrics from Polymarket API"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                <button
                  onClick={handleToggleWatch}
                  disabled={toggleWatch.isPending || !wallet}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    wallet?.is_watched
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border hover:bg-accent'
                  )}
                >
                  {wallet?.is_watched ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {wallet?.is_watched ? 'Unwatch' : 'Watch'}
                </button>
                <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/50">
            <div>
              <p className="text-xs text-muted-foreground">Positions Value</p>
              <p className="text-lg font-mono font-semibold text-foreground">
                {formatCurrency(stats.positionsValue)}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-xs text-muted-foreground">Biggest Win</p>
              <p className="text-lg font-mono font-semibold text-bull">
                {(wallet?.biggest_win ?? 0) > 0 ? formatCurrency(wallet?.biggest_win ?? 0) : '—'}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-xs text-muted-foreground">Predictions</p>
              <p className="text-lg font-mono font-semibold text-foreground">
                {wallet?.markets_traded ?? stats.predictions}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                Win Rate
                {displayWinRate > 0 && (
                  <span className="text-[10px] text-primary/70" title="Synced from Polymarket Profile API">✓ API</span>
                )}
              </p>
              <p className={cn(
                'text-lg font-mono font-semibold',
                displayWinRate >= 50 ? 'text-bull' : displayWinRate > 0 ? 'text-bear' : 'text-muted-foreground'
              )}>
                {displayWinRate > 0 ? `${displayWinRate.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-border px-4">
          <button
            onClick={() => setActiveTab('positions')}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'positions'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Positions ({positions.length})
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'activity'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab('onchain')}
            className={cn(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
              activeTab === 'onchain'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Link2 className="w-3.5 h-3.5" />
            On-Chain
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === 'positions' ? (
            <div className="p-4 space-y-6">
              {/* Column Headers */}
              {(activePositions.length > 0 || closedPositions.length > 0) && (
                <div className="grid grid-cols-12 gap-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <div className="col-span-6">Market / Position</div>
                  <div className="col-span-2 text-right">Avg</div>
                  <div className="col-span-2 text-right">Current</div>
                  <div className="col-span-2 text-right">P/L</div>
                </div>
              )}

              {/* Active Positions */}
              {activePositions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-bull animate-pulse" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Active Positions
                    </h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {activePositions.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activePositions.map((pos, idx) => (
                      <PositionRow key={pos.id} position={pos} index={idx} marketNameMap={marketNameMap} />
                    ))}
                  </div>
                </div>
              )}

              {/* Closed/Settled Positions */}
              {closedPositions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      Closed/Settled
                    </h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {closedPositions.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {closedPositions.slice(0, 20).map((pos, idx) => (
                      <PositionRow key={pos.id} position={pos} isClosedView index={idx} marketNameMap={marketNameMap} />
                    ))}
                    {closedPositions.length > 20 && (
                      <div className="flex items-center justify-center py-3">
                        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                          +{closedPositions.length - 20} more closed positions
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {positions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Activity className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No positions found</p>
                  <button
                    onClick={handleSync}
                    disabled={isRefreshing}
                    className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    {isRefreshing ? 'Syncing...' : 'Sync Positions'}
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'activity' ? (
            /* Activity Tab */
            <div className="p-4">
              {paginatedActivities.length > 0 ? (
                <div className="space-y-2">
                  {paginatedActivities.map((activity) => {
                    const indicator = getTradeIndicator(activity.size);
                    return (
                      <div
                        key={activity.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border transition-colors',
                          activity.is_unusual
                            ? 'bg-warning/5 border-warning/30'
                            : 'bg-muted/30 border-border/50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'p-2 rounded-lg',
                            activity.side === 'BUY' ? 'bg-bull/20' : 'bg-bear/20'
                          )}>
                            {activity.side === 'BUY' ? (
                              <ArrowUpRight className="w-4 h-4 text-bull" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4 text-bear" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('text-sm font-semibold', activity.side === 'BUY' ? 'text-bull' : 'text-bear')}>
                                {activity.side}
                              </span>
                              <Badge variant={activity.outcome === 'Yes' ? 'success' : 'danger'} className="text-xs">
                                {activity.outcome}
                              </Badge>
                              {activity.price && (
                                <span className="text-xs text-muted-foreground">@ {(activity.price * 100).toFixed(1)}¢</span>
                              )}
                              {indicator && (
                                <span className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold', indicator.className)}>
                                  {indicator.icon}
                                  {indicator.label}
                                </span>
                              )}
                              {activity.is_unusual && (
                                <Badge variant="warning">Unusual</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {resolveMarketName(activity, marketNameMap)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono font-semibold text-foreground">
                            {formatCurrency(activity.size)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.timestamp ? formatTimeAgo(new Date(activity.timestamp).getTime()) : '—'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Load More */}
                  {hasMoreTrades && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => tradesQuery.fetchNextPage()}
                        disabled={isLoadingMore}
                        className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Load More
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Activity className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No activity found</p>
                </div>
              )}
            </div>
          ) : (
            /* On-Chain Tab */
            <div className="p-4">
              <OnChainInsights walletAddress={walletAddress} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Position Row Component - displays a single position from wallet_positions
 */
function PositionRow({ 
  position, 
  isClosedView = false,
  index = 0,
  marketNameMap 
}: { 
  position: WalletPosition; 
  isClosedView?: boolean;
  index?: number;
  marketNameMap?: Map<string, string>;
}) {
  const pnl = position.cash_pnl || 0;
  const pnlPercent = position.percent_pnl || 0;
  const avgPrice = (position.avg_price || 0) * 100;
  const curPrice = (position.cur_price || 0) * 100;
  
  // Determine if position is winning or losing based on price movement
  const isWinning = !isClosedView && curPrice > avgPrice;
  const isLosing = !isClosedView && curPrice < avgPrice;
  
  return (
    <div 
      className={cn(
        'group grid grid-cols-12 gap-2 p-3 rounded-lg border transition-all duration-200',
        isClosedView 
          ? 'bg-muted/10 border-border/30 opacity-70 hover:opacity-100' 
          : 'bg-card/50 border-border/50 hover:bg-accent/30 hover:border-primary/30',
        index === 0 && !isClosedView && 'ring-1 ring-primary/20'
      )}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Market Info */}
      <div className="col-span-6 min-w-0">
        <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {position.title || (marketNameMap?.get(position.condition_id) || marketNameMap?.get(position.condition_id?.toLowerCase?.() || '') || `Market ${position.condition_id?.slice(0, 10)}…`)}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {/* Outcome Badge */}
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold',
            position.outcome === 'Yes' 
              ? 'bg-bull/20 text-bull border border-bull/30' 
              : 'bg-bear/20 text-bear border border-bear/30'
          )}>
            {position.outcome === 'Yes' ? '▲' : '▼'} {position.outcome || 'Unknown'}
          </span>
          
          {/* Shares Info */}
          {!isClosedView && position.size > 0 && (
            <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              {position.size.toLocaleString(undefined, { maximumFractionDigits: 1 })} @ {avgPrice.toFixed(0)}¢
            </span>
          )}
          
          {/* Status Tags */}
          {position.redeemable && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-warning/20 text-warning border border-warning/30">
              💰 Redeemable
            </span>
          )}
          {position.mergeable && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted/50 text-muted-foreground border border-border">
              Mergeable
            </span>
          )}
        </div>
      </div>
      
      {/* Avg Price */}
      <div className="col-span-2 flex items-center justify-end">
        <span className="font-mono text-sm text-muted-foreground">
          {avgPrice.toFixed(0)}¢
        </span>
      </div>
      
      {/* Current Price */}
      <div className="col-span-2 flex items-center justify-end">
        {isClosedView ? (
          <span className="text-sm text-muted-foreground/50">—</span>
        ) : (
          <span className={cn(
            'font-mono text-sm font-medium',
            isWinning && 'text-bull',
            isLosing && 'text-bear',
            !isWinning && !isLosing && 'text-foreground'
          )}>
            {curPrice.toFixed(0)}¢
          </span>
        )}
      </div>
      
      {/* P/L */}
      <div className="col-span-2 flex flex-col items-end justify-center">
        <span className={cn(
          'font-mono text-sm font-bold',
          pnl >= 0 ? 'text-bull' : 'text-bear'
        )}>
          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
        </span>
        {pnlPercent !== 0 && (
          <span className={cn(
            'text-xs font-mono',
            pnlPercent >= 0 ? 'text-bull/80' : 'text-bear/80'
          )}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
