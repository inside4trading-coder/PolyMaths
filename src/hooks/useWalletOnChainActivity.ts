import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OnChainActivity {
  id: string;
  wallet_address: string;
  activity_type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY';
  transaction_hash: string | null;
  condition_id: string | null;
  size: number;
  price: number | null;
  timestamp: string;
  source: string;
}

export interface OnChainStats {
  totalTrades: number;
  splitsCount: number;
  mergesCount: number;
  redemptionsCount: number;
  totalFeesPaid: number;
  isSophisticated: boolean;
  makerRatio: number;
  lastSynced: string | null;
}

export interface WalletClassification {
  type: 'whale' | 'market_maker' | 'sophisticated' | 'retail' | 'inactive';
  confidence: number;
  badges: Array<{
    label: string;
    icon: string;
    className: string;
    tooltip: string;
  }>;
}

/**
 * Fetch on-chain activity for a wallet from the database
 */
export function useWalletOnChainActivity(walletAddress: string | null, limit = 100) {
  return useQuery({
    queryKey: ['onchain-activity', walletAddress, limit],
    queryFn: async () => {
      if (!walletAddress) return [];
      
      const { data, error } = await supabase
        .from('wallet_activity')
        .select('id, wallet_address, activity_type, transaction_hash, condition_id, size, price, timestamp, source')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('source', 'onchain')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as OnChainActivity[];
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });
}

export interface MonthlyOnChainData {
  month: string;
  splits: number;
  merges: number;
  redemptions: number;
}

/**
 * Fetch on-chain activity grouped by month for trend chart
 */
export function useWalletOnChainMonthlyTrend(walletAddress: string | null) {
  return useQuery({
    queryKey: ['onchain-monthly-trend', walletAddress],
    queryFn: async (): Promise<MonthlyOnChainData[]> => {
      if (!walletAddress) return [];
      
      const { data, error } = await supabase
        .from('wallet_activity')
        .select('activity_type, timestamp')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('source', 'onchain')
        .in('activity_type', ['SPLIT', 'MERGE', 'REDEEM'])
        .order('timestamp', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Group by month
      const monthlyData: Record<string, { splits: number; merges: number; redemptions: number }> = {};
      
      for (const activity of data) {
        const date = new Date(activity.timestamp);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { splits: 0, merges: 0, redemptions: 0 };
        }
        
        if (activity.activity_type === 'SPLIT') {
          monthlyData[monthKey].splits++;
        } else if (activity.activity_type === 'MERGE') {
          monthlyData[monthKey].merges++;
        } else if (activity.activity_type === 'REDEEM') {
          monthlyData[monthKey].redemptions++;
        }
      }

      // Convert to array and format month labels
      return Object.entries(monthlyData).map(([month, counts]) => {
        const [year, monthNum] = month.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${monthNames[parseInt(monthNum) - 1]} ${year.slice(2)}`;
        
        return {
          month: label,
          splits: counts.splits,
          merges: counts.merges,
          redemptions: counts.redemptions,
        };
      });
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });
}

/**
 * Get on-chain stats for a wallet
 */
export function useWalletOnChainStats(walletAddress: string | null) {
  return useQuery({
    queryKey: ['onchain-stats', walletAddress],
    queryFn: async (): Promise<OnChainStats | null> => {
      if (!walletAddress) return null;

      // Get activity counts by type
      const { data: activities, error } = await supabase
        .from('wallet_activity')
        .select('activity_type, size, price, source')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('source', 'onchain');

      if (error) throw error;

      // Get wallet data for synced timestamp
      const { data: wallet } = await supabase
        .from('wallets')
        .select('onchain_synced_at, splits_count, merges_count, total_fees_paid, maker_ratio')
        .eq('address', walletAddress.toLowerCase())
        .single();

      const counts = {
        TRADE: 0,
        SPLIT: 0,
        MERGE: 0,
        REDEEM: 0,
      };

      for (const activity of activities || []) {
        const type = activity.activity_type as keyof typeof counts;
        if (type in counts) {
          counts[type]++;
        }
      }

      const totalTrades = counts.TRADE;
      const makerRatio = wallet?.maker_ratio || 0;
      const isSophisticated = counts.SPLIT > 0 || counts.MERGE > 0;

      return {
        totalTrades,
        splitsCount: counts.SPLIT || wallet?.splits_count || 0,
        mergesCount: counts.MERGE || wallet?.merges_count || 0,
        redemptionsCount: counts.REDEEM,
        totalFeesPaid: wallet?.total_fees_paid || 0,
        isSophisticated,
        makerRatio,
        lastSynced: wallet?.onchain_synced_at || null,
      };
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });
}

/**
 * Classify a wallet based on on-chain behavior
 */
export function useWalletClassification(walletAddress: string | null) {
  const { data: stats } = useWalletOnChainStats(walletAddress);
  const { data: wallet } = useQuery({
    queryKey: ['wallet-classification-data', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const { data } = await supabase
        .from('wallets')
        .select('total_volume, onchain_verified, maker_ratio, liquidity_provided')
        .eq('address', walletAddress.toLowerCase())
        .single();
      return data;
    },
    enabled: !!walletAddress,
  });

  return useQuery<WalletClassification | null>({
    queryKey: ['wallet-classification', walletAddress, stats, wallet],
    queryFn: () => {
      if (!walletAddress) return null;

      const badges: WalletClassification['badges'] = [];
      let type: WalletClassification['type'] = 'retail';
      let confidence = 0.5;

      const totalVolume = wallet?.total_volume || 0;
      const isVerified = wallet?.onchain_verified || false;
      const makerRatio = stats?.makerRatio || 0;
      const isSophisticated = stats?.isSophisticated || false;

      // Verified badge
      if (isVerified) {
        badges.push({
          label: 'VERIFIED',
          icon: '🔷',
          className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
          tooltip: 'Trades verified on-chain via Polymarket subgraph',
        });
      }

      // Whale classification
      if (totalVolume >= 100000) {
        type = 'whale';
        confidence = 0.9;
        badges.push({
          label: 'WHALE',
          icon: '🐋',
          className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
          tooltip: `Volume: $${(totalVolume / 1000).toFixed(0)}K+`,
        });
      }

      // Market Maker classification
      if (makerRatio >= 60) {
        type = 'market_maker';
        confidence = Math.max(confidence, 0.85);
        badges.push({
          label: 'LIQUIDITY',
          icon: '💧',
          className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
          tooltip: `${makerRatio.toFixed(0)}% maker orders - provides liquidity`,
        });
      }

      // Sophisticated trader (uses splits/merges)
      if (isSophisticated) {
        if (type === 'retail') type = 'sophisticated';
        confidence = Math.max(confidence, 0.8);
        badges.push({
          label: 'SOPHISTICATED',
          icon: '⚡',
          className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
          tooltip: `Uses splits/merges: ${stats?.splitsCount || 0} splits, ${stats?.mergesCount || 0} merges`,
        });
      }

      // Inactive check
      if ((stats?.totalTrades || 0) === 0 && totalVolume < 1000) {
        type = 'inactive';
        confidence = 0.7;
      }

      return { type, confidence, badges };
    },
    enabled: !!walletAddress && (!!stats || !!wallet),
  });
}

/**
 * Trigger deep on-chain sync for a wallet via edge function
 */
export function useSyncWalletOnChain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (walletAddress: string) => {
      console.log('[useWalletOnChainActivity] Deep syncing:', walletAddress);
      
      const { data, error } = await supabase.functions.invoke('polymarket-subgraph', {
        body: {
          action: 'sync_wallet_onchain',
          params: { wallet_address: walletAddress },
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, walletAddress) => {
      queryClient.invalidateQueries({ queryKey: ['onchain-activity', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['onchain-stats', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['wallet-classification', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}

/**
 * Sync all watched wallets on-chain data
 */
export function useSyncAllOnChain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      console.log('[useWalletOnChainActivity] Syncing all watched wallets');
      
      const { data, error } = await supabase.functions.invoke('polymarket-subgraph', {
        body: { action: 'sync_all_watched', params: {} },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onchain-activity'] });
      queryClient.invalidateQueries({ queryKey: ['onchain-stats'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-classification'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}
