import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { retrySupabaseQuery, retryEdgeFunction } from '@/lib/supabaseRetry';
import { withPolymarketDataLimit } from '@/lib/edgeFunctionLimiter';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Auto-refresh interval (60 seconds)
const REFETCH_INTERVAL = 60 * 1000;

// Retry config for queries
const RETRY_CONFIG = { maxRetries: 3, baseDelayMs: 500 };

// Global cache to prevent duplicate sync-market-detail calls
const syncedMarketsCache = new Set<string>();

// Type aliases for convenience
export type Market = Tables<'markets'>;
export type Token = Tables<'tokens'>;
export type Wallet = Tables<'wallets'>;
export type Trade = Tables<'trades'>;
export type WalletActivity = Tables<'wallet_activity'>;
export type BotConfig = Tables<'bot_configs'>;
export type BotPosition = Tables<'bot_positions'>;
export type BotOrder = Tables<'bot_orders'>;
export type BotEvent = Tables<'bot_events'>;
export type MarketMetrics = Tables<'market_metrics'>;
export type News = Tables<'news'>;

// Extended market type with tokens
export interface MarketWithTokens extends Market {
  tokens: Token[];
}

// ============ Markets ============

export function useMarkets(category?: string) {
  return useQuery({
    queryKey: ['markets', category],
    queryFn: async () => {
      const result = await retrySupabaseQuery(async () => {
        let query = supabase
          .from('markets')
          .select('*')
          .eq('closed', false)
          .order('volume_24h', { ascending: false });
        
        if (category && category !== 'All') {
          query = query.eq('category', category);
        }
        
        return await query;
      }, RETRY_CONFIG);
      
      if (result.error) throw result.error;
      return result.data as Market[];
    },
    refetchInterval: REFETCH_INTERVAL,
    retry: 2, // React Query level retry
  });
}

export function useMarket(marketId: string) {
  return useQuery({
    queryKey: ['market', marketId],
    queryFn: async () => {
      const result = await retrySupabaseQuery(async () => {
        return await supabase
          .from('markets')
          .select('*')
          .eq('id', marketId)
          .single();
      }, RETRY_CONFIG);
      
      if (result.error) throw result.error;
      return result.data as Market;
    },
    enabled: !!marketId,
    refetchInterval: REFETCH_INTERVAL,
    retry: 2,
  });
}

export interface MarketsPage {
  markets: MarketWithTokens[];
  totalCount: number;
  hasMore: boolean;
}

export function useMarketsWithTokens(category?: string, pageSize = 50) {
  return useQuery({
    queryKey: ['marketsWithTokens', category, pageSize],
    queryFn: async (): Promise<MarketsPage> => {
      // Count total markets matching filter (with retry)
      const countResult = await retrySupabaseQuery(async () => {
        let countQuery = supabase
          .from('markets')
          .select('*', { count: 'exact', head: true })
          .eq('closed', false);

        if (category && category !== 'All') {
          countQuery = countQuery.eq('category', category);
        }

        return await countQuery;
      }, RETRY_CONFIG);

      const totalCount = countResult.error ? 0 : (countResult as any).count;

      // Fetch first page of markets (with retry)
      const marketsResult = await retrySupabaseQuery(async () => {
        let marketQuery = supabase
          .from('markets')
          .select('*')
          .eq('closed', false)
          .order('volume_24h', { ascending: false })
          .range(0, pageSize - 1);

        if (category && category !== 'All') {
          marketQuery = marketQuery.eq('category', category);
        }

        return await marketQuery;
      }, RETRY_CONFIG);

      if (marketsResult.error) throw marketsResult.error;
      const markets = marketsResult.data;

      if (!markets || markets.length === 0) {
        return { markets: [], totalCount: totalCount || 0, hasMore: false };
      }

      // Fetch tokens for these markets (batch with retry)
      const marketIds = markets.map((m) => m.id);
      const tokensAcc: Token[] = [];
      const chunkSize = 100;

      for (let i = 0; i < marketIds.length; i += chunkSize) {
        const chunk = marketIds.slice(i, i + chunkSize);
        const tokensResult = await retrySupabaseQuery(async () => {
          return await supabase
            .from('tokens')
            .select('*')
            .in('market_id', chunk);
        }, RETRY_CONFIG);

        if (tokensResult.error) throw tokensResult.error;
        if (tokensResult.data?.length) tokensAcc.push(...(tokensResult.data as Token[]));
      }

      const marketsWithTokens: MarketWithTokens[] = markets.map((market) => ({
        ...market,
        tokens: tokensAcc.filter((t) => t.market_id === market.id),
      }));

      return {
        markets: marketsWithTokens,
        totalCount: totalCount || markets.length,
        hasMore: markets.length >= pageSize && (totalCount || 0) > pageSize,
      };
    },
    refetchInterval: REFETCH_INTERVAL,
    retry: 2,
  });
}

export function useLoadMoreMarkets(category?: string, pageSize = 50) {
  return useMutation({
    mutationFn: async (offset: number): Promise<MarketWithTokens[]> => {
      let marketQuery = supabase
        .from('markets')
        .select('*')
        .eq('closed', false)
        .order('volume_24h', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (category && category !== 'All') {
        marketQuery = marketQuery.eq('category', category);
      }

      const { data: markets, error: marketsError } = await marketQuery;
      if (marketsError) throw marketsError;

      if (!markets || markets.length === 0) return [];

      const marketIds = markets.map((m) => m.id);
      const tokensAcc: Token[] = [];
      const chunkSize = 100;

      for (let i = 0; i < marketIds.length; i += chunkSize) {
        const chunk = marketIds.slice(i, i + chunkSize);
        const { data: chunkTokens, error: tokensError } = await supabase
          .from('tokens')
          .select('*')
          .in('market_id', chunk);

        if (tokensError) throw tokensError;
        if (chunkTokens?.length) tokensAcc.push(...(chunkTokens as Token[]));
      }

      return markets.map((market) => ({
        ...market,
        tokens: tokensAcc.filter((t) => t.market_id === market.id),
      }));
    },
    onSuccess: () => {
      // Don't invalidate; caller will merge manually
    },
  });
}

// Category type mapping
const CATEGORY_TYPE_MAP: Record<string, string> = {
  // Politics
  'politics': 'Politics',
  'presidential': 'Politics',
  'nominee': 'Politics',
  'election': 'Politics',
  'senate': 'Politics',
  'house': 'Politics',
  'congress': 'Politics',
  'minister': 'Politics',
  'trump': 'Politics',
  'biden': 'Politics',
  'midterms': 'Politics',
  'speaker': 'Politics',
  'cabinet': 'Politics',
  'party': 'Politics',
  'government': 'Politics',
  // Sports
  'nfl': 'Sports',
  'nba': 'Sports',
  'nhl': 'Sports',
  'fifa': 'Sports',
  'uefa': 'Sports',
  'premier league': 'Sports',
  'la liga': 'Sports',
  'bundesliga': 'Sports',
  'serie a': 'Sports',
  'ligue 1': 'Sports',
  'super bowl': 'Sports',
  'champion': 'Sports',
  'mvp': 'Sports',
  'rookie': 'Sports',
  'coach': 'Sports',
  'college football': 'Sports',
  'afc': 'Sports',
  'nfc': 'Sports',
  'world cup': 'Sports',
  // Crypto
  'crypto': 'Crypto',
  'bitcoin': 'Crypto',
  'ethereum': 'Crypto',
  'token': 'Crypto',
  'microstrategy': 'Crypto',
  'megaeth': 'Crypto',
  'infinex': 'Crypto',
  'fdv': 'Crypto',
  'market cap': 'Crypto',
  // Economics
  'inflation': 'Economics',
  'tariffs': 'Economics',
  'revenue': 'Economics',
  'spending': 'Economics',
  'doge': 'Economics',
  'jobs': 'Economics',
  // World
  'russia': 'World',
  'ukraine': 'World',
  'israel': 'World',
  'iran': 'World',
  'syria': 'World',
  'ceasefire': 'World',
  'war': 'World',
  // Entertainment
  'halftime': 'Entertainment',
  'perform': 'Entertainment',
  'gta': 'Entertainment',
  'weinstein': 'Entertainment',
};

export function categorizeCategoryType(category: string | null | undefined): string {
  if (!category) return 'Other';
  const lower = category.toLowerCase();
  for (const [keyword, type] of Object.entries(CATEGORY_TYPE_MAP)) {
    if (lower.includes(keyword)) {
      return type;
    }
  }
  return 'Other';
}

export interface CategoryGroup {
  type: string;
  categories: string[];
}

export function useMarketCategories(maxCategories = 30) {
  return useQuery({
    queryKey: ['marketCategories', maxCategories],
    queryFn: async (): Promise<CategoryGroup[]> => {
      const { data, error } = await supabase
        .from('markets')
        .select('category, volume_24h')
        .eq('closed', false)
        .not('category', 'is', null)
        .order('volume_24h', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const typeMap = new Map<string, Set<string>>();
      
      for (const row of data || []) {
        const cat = (row as unknown as { category: string | null }).category;
        if (!cat) continue;
        
        const type = categorizeCategoryType(cat);
        if (!typeMap.has(type)) {
          typeMap.set(type, new Set());
        }
        typeMap.get(type)!.add(cat);
      }

      // Order types logically
      const typeOrder = ['Politics', 'Sports', 'Crypto', 'Economics', 'World', 'Entertainment', 'Other'];
      const groups: CategoryGroup[] = [];
      
      for (const type of typeOrder) {
        const cats = typeMap.get(type);
        if (cats && cats.size > 0) {
          groups.push({ type, categories: Array.from(cats).slice(0, 10) });
        }
      }

      return groups;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useTokens(marketId: string) {
  return useQuery({
    queryKey: ['tokens', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('market_id', marketId);
      
      if (error) throw error;
      
      // Filter out invalid tokens (price = 0 or null when other tokens have valid prices)
      // and sort: Yes outcomes first, then by price descending
      const tokens = data as Token[];
      const hasValidPrices = tokens.some(t => (t.price || 0) > 0);
      
      const filteredTokens = hasValidPrices 
        ? tokens.filter(t => (t.price || 0) > 0)
        : tokens;
      
      // Sort: Yes first, then by price descending (for multi-outcome)
      return filteredTokens.sort((a, b) => {
        // Yes before No
        if (a.outcome === 'Yes' && b.outcome !== 'Yes') return -1;
        if (a.outcome !== 'Yes' && b.outcome === 'Yes') return 1;
        // Then by price descending
        return (b.price || 0) - (a.price || 0);
      });
    },
    enabled: !!marketId,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// Fetch tokens for multiple markets at once (for position pricing)
export function useTokensByMarkets(marketIds: string[]) {
  return useQuery({
    queryKey: ['tokensByMarkets', marketIds.sort().join(',')],
    queryFn: async () => {
      if (marketIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .in('market_id', marketIds);
      
      if (error) throw error;
      return data as Token[];
    },
    enabled: marketIds.length > 0,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ============ Wallets ============

// NOTE: These hooks now require userId for RLS-protected operations
// Wallets are private per user, so queries filter by user_id

export function useWallets(watchedOnly = false, userId?: string) {
  return useQuery({
    queryKey: ['wallets', watchedOnly, userId],
    queryFn: async () => {
      // If no userId, return empty array (RLS will block anyway)
      if (!userId) return [] as Wallet[];
      
      let query = supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .order('volume_24h', { ascending: false });
      
      if (watchedOnly) {
        query = query.eq('is_watched', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Wallet[];
    },
    enabled: !!userId,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useWallet(address: string, userId?: string) {
  return useQuery({
    queryKey: ['wallet', address, userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('address', address)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Wallet | null;
    },
    enabled: !!address && !!userId,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useToggleWalletWatch() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ address, isWatched, userId }: { address: string; isWatched: boolean; userId: string }) => {
      if (isWatched) {
        // WATCH: Try insert first (common case for new wallets)
        const { data: inserted, error: insertError } = await supabase
          .from('wallets')
          .insert({ address, is_watched: true, user_id: userId })
          .select()
          .maybeSingle();
        
        // If insert succeeded, done in single call
        if (inserted) return inserted;
        
        // If duplicate (wallet exists), update it
        if (insertError?.code === '23505') {
          const { data: updated, error: updateError } = await supabase
            .from('wallets')
            .update({ is_watched: true })
            .eq('address', address)
            .eq('user_id', userId)
            .select()
            .single();
          
          if (updateError) throw updateError;
          return updated;
        }
        
        throw insertError;
      } else {
        // UNWATCH: Update existing wallet (must exist to unwatch)
        const { data: updated, error: updateError } = await supabase
          .from('wallets')
          .update({ is_watched: false })
          .eq('address', address)
          .eq('user_id', userId)
          .select()
          .single();
        
        if (updateError) throw updateError;
        return updated;
      }
    },
    // Optimistic update: change UI immediately before server responds
    onMutate: async ({ address, isWatched, userId }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['wallets'] });
      await queryClient.cancelQueries({ queryKey: ['wallet', address, userId] });
      
      // Snapshot previous values for rollback
      const previousWallets = queryClient.getQueryData(['wallets', true, userId]);
      const previousWallet = queryClient.getQueryData(['wallet', address, userId]);
      
      // Optimistically update wallet query
      queryClient.setQueryData(['wallet', address, userId], (old: Wallet | null | undefined) => {
        if (old) {
          return { ...old, is_watched: isWatched };
        }
        // If wallet doesn't exist yet, create optimistic entry
        return { address, is_watched: isWatched, user_id: userId } as Wallet;
      });
      
      // Optimistically update wallets list
      queryClient.setQueryData(['wallets', true, userId], (old: Wallet[] | undefined) => {
        if (!old) return old;
        if (isWatched) {
          // Adding to watchlist - add if not present
          const exists = old.some(w => w.address === address);
          if (!exists) {
            return [...old, { address, is_watched: true, user_id: userId } as Wallet];
          }
          return old.map(w => w.address === address ? { ...w, is_watched: true } : w);
        } else {
          // Removing from watchlist
          return old.filter(w => w.address !== address);
        }
      });
      
      // Return context for rollback
      return { previousWallets, previousWallet, address, userId };
    },
    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousWallet !== undefined) {
        queryClient.setQueryData(['wallet', context.address, context.userId], context.previousWallet);
      }
      if (context?.previousWallets !== undefined) {
        queryClient.setQueryData(['wallets', true, context.userId], context.previousWallets);
      }
      toast.error('Failed to update watchlist');
    },
    // Refetch after success to ensure consistency
    onSettled: (_data, _error, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['wallets', true, userId] });
    },
  });
}

// ============ Wallet Activity ============

export type ActivityFilterType = 'all' | 'unusual' | 'whale' | 'buy' | 'sell';

export interface ActivityFeedOptions {
  walletAddress?: string;
  filter?: ActivityFilterType;
  limit?: number;
  minSize?: number;
}

export function useWalletActivity(walletAddress?: string, limit = 50) {
  return useQuery({
    queryKey: ['walletActivity', walletAddress, limit],
    queryFn: async () => {
      let query = supabase
        .from('wallet_activity')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (walletAddress) {
        query = query.eq('wallet_address', walletAddress);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WalletActivity[];
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

// Fetch trades directly for a wallet with infinite pagination
const TRADES_PAGE_SIZE = 100;

type TradesCursor = { ts: string; id: string } | null;

export function useWalletTradesInfinite(walletAddress?: string) {
  return useInfiniteQuery({
    queryKey: ['walletTradesInfinite', walletAddress],
    queryFn: async ({ pageParam = null }: { pageParam: TradesCursor }) => {
      if (!walletAddress) return { trades: [], nextCursor: null as TradesCursor };

      // Read from wallet_activity table which is populated by sync
      let query = supabase
        .from('wallet_activity')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('timestamp', { ascending: false })
        .order('id', { ascending: false })
        .limit(TRADES_PAGE_SIZE);

      if (pageParam?.ts && pageParam?.id) {
        query = query.or(`timestamp.lt.${pageParam.ts},and(timestamp.eq.${pageParam.ts},id.lt.${pageParam.id})`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Dedupe within page
      const seenIds = new Set<string>();
      const uniqueActivities = (data || []).filter((a: any) => {
        if (!a?.id) return false;
        if (seenIds.has(a.id)) return false;
        seenIds.add(a.id);
        return true;
      });

      const trades = uniqueActivities.map((a: any) => ({
        id: a.id,
        wallet_address: a.wallet_address,
        activity_type: a.activity_type || 'trade',
        market_id: a.market_id,
        market_question: a.market_question || 'Unknown Market',
        outcome: a.outcome,
        side: a.side,
        price: a.price,
        size: a.size,
        timestamp: a.timestamp,
        is_unusual: a.is_unusual || a.size >= 10000,
        created_at: a.created_at,
      })) as WalletActivity[];

      const last = uniqueActivities[uniqueActivities.length - 1] as any;
      const nextCursor: TradesCursor =
        uniqueActivities.length === TRADES_PAGE_SIZE && last?.timestamp && last?.id
          ? { ts: new Date(last.timestamp).toISOString(), id: String(last.id) }
          : null;

      return { trades, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null,
    enabled: !!walletAddress,
  });
}

// Hook to fetch ALL trades for P/L calculation (not paginated)
export function useWalletAllTrades(walletAddress?: string) {
  return useQuery({
    queryKey: ['walletAllTrades', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      
      // Fetch all activities for this wallet (for P/L calculation)
      // We need to fetch in batches since Supabase has a 1000 row limit
      const allActivities: WalletActivity[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('wallet_activity')
          .select('*')
          .eq('wallet_address', walletAddress)
          .order('timestamp', { ascending: true }) // Oldest first for P/L calculation
          .range(offset, offset + batchSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const trades = data.map((a: any) => ({
            id: a.id,
            wallet_address: a.wallet_address,
            activity_type: a.activity_type || 'trade',
            market_id: a.market_id,
            market_question: a.market_question || 'Unknown Market',
            outcome: a.outcome,
            side: a.side,
            price: a.price,
            size: a.size,
            timestamp: a.timestamp,
            is_unusual: a.is_unusual || a.size >= 10000,
            created_at: a.created_at,
          })) as WalletActivity[];
          
          allActivities.push(...trades);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`[useWalletAllTrades] Fetched ${allActivities.length} total trades for P/L`);
      return allActivities;
    },
    enabled: !!walletAddress,
    staleTime: 30 * 1000, // Cache for 30s to avoid refetching on every render
  });
}

// Legacy hook for compatibility - returns first 500 trades
export function useWalletTrades(walletAddress?: string, limit = 500) {
  return useQuery({
    queryKey: ['walletTrades', walletAddress, limit],
    queryFn: async () => {
      if (!walletAddress) return [];
      
      const { data, error } = await supabase
        .from('wallet_activity')
        .select('*')
        .eq('wallet_address', walletAddress)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      return (data || []).map((a: any) => ({
        id: a.id,
        wallet_address: a.wallet_address,
        activity_type: a.activity_type || 'trade',
        market_id: a.market_id,
        market_question: a.market_question || 'Unknown Market',
        outcome: a.outcome,
        side: a.side,
        price: a.price,
        size: a.size,
        timestamp: a.timestamp,
        is_unusual: a.is_unusual || a.size >= 10000,
        created_at: a.created_at,
      })) as WalletActivity[];
    },
    enabled: !!walletAddress,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// Strategic activity feed with server-side filtering
export function useActivityFeed(options: ActivityFeedOptions = {}) {
  const { walletAddress, filter = 'all', limit = 100, minSize = 0 } = options;
  
  return useQuery({
    queryKey: ['activityFeed', walletAddress, filter, limit, minSize],
    queryFn: async () => {
      let query = supabase
        .from('wallet_activity')
        .select('*')
        .order('timestamp', { ascending: false });
      
      // Apply wallet filter
      if (walletAddress) {
        query = query.eq('wallet_address', walletAddress);
      }
      
      // Apply strategic filters at DB level
      switch (filter) {
        case 'unusual':
          query = query.eq('is_unusual', true);
          break;
        case 'whale':
          query = query.gte('size', 10000);
          break;
        case 'buy':
          query = query.eq('side', 'BUY');
          break;
        case 'sell':
          query = query.eq('side', 'SELL');
          break;
      }
      
      // Apply minimum size filter
      if (minSize > 0) {
        query = query.gte('size', minSize);
      }
      
      query = query.limit(limit);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WalletActivity[];
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

// Get activity stats summary
export function useActivityStats() {
  return useQuery({
    queryKey: ['activityStats'],
    queryFn: async () => {
      // Parallel queries for stats
      const [unusualResult, whaleResult, totalResult] = await Promise.all([
        supabase
          .from('wallet_activity')
          .select('*', { count: 'exact', head: true })
          .eq('is_unusual', true),
        supabase
          .from('wallet_activity')
          .select('*', { count: 'exact', head: true })
          .gte('size', 10000),
        supabase
          .from('wallet_activity')
          .select('size, side')
          .order('timestamp', { ascending: false })
          .limit(500),
      ]);
      
      const activities = (totalResult.data || []) as { size: number; side: string }[];
      const totalVolume = activities.reduce((sum, a) => sum + a.size, 0);
      const buyVolume = activities.filter(a => a.side === 'BUY').reduce((sum, a) => sum + a.size, 0);
      
      return {
        unusualCount: (unusualResult as any).count || 0,
        whaleCount: (whaleResult as any).count || 0,
        recentVolume: totalVolume,
        buyRatio: totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50,
      };
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useUnusualActivity(limit = 20) {
  return useQuery({
    queryKey: ['unusualActivity', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_activity')
        .select('*')
        .eq('is_unusual', true)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as WalletActivity[];
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ============ Wallet Positions (From Polymarket /positions API) ============

export interface WalletPosition {
  wallet_address: string;
  wallet_label: string | null;
  market_id: string | null;
  market_question: string;
  market_category: string | null;
  market_closed: boolean;
  outcome: string;
  side: string;
  size: number;           // currentValue in USD
  shares: number;         // Number of tokens
  entry_price: number;    // avgPrice
  avg_price: number;
  current_price: number;  // curPrice from Polymarket
  // Market data columns
  chance: number;         // Token price (probability)
  vol_24h: number;        // Market 24h volume
  liquidity: number;      // Market liquidity
  pnl: number;            // cashPnl from Polymarket
  pnl_percent: number;    // percentPnl from Polymarket
  first_trade_time: string;
  last_trade_time: string;
  is_sold: boolean;
  // Extended fields
  condition_id?: string;
  redeemable?: boolean;
  realized_pnl?: number;
}

export interface PositionsFilters {
  hideClosedMarkets: boolean;
  hideSoldPositions: boolean;
  hideInactiveMarkets: boolean;
  showNewOnly: boolean;
  whalesOnly?: boolean;
  walletAddress?: string;
  categories?: string[]; // Filter by category types (Politics, Sports, Crypto, etc.)
}

/**
 * Cached discovery of Top 50 wallets that have positions synced.
 */
export function useTop50Wallets() {
  return useQuery({
    queryKey: ['top50Wallets'],
    queryFn: async (): Promise<string[]> => {
      // Get wallets from wallet_positions ordered by total value
      const { data: positionsWallets, error } = await supabase
        .from('wallet_positions')
        .select('wallet_address, current_value')
        .order('synced_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      
      if (positionsWallets && positionsWallets.length > 0) {
        // Aggregate value per wallet and return top 50
        const walletValues: Record<string, number> = {};
        for (const p of positionsWallets) {
          walletValues[p.wallet_address] = (walletValues[p.wallet_address] || 0) + (p.current_value || 0);
        }
        return Object.entries(walletValues)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 50)
          .map(([address]) => address);
      }

      // Fallback to trades-based discovery if no positions yet
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: recentTrades, error: tradesError } = await supabase
        .from('trades')
        .select('wallet_address, size, price')
        .not('wallet_address', 'is', null)
        .gte('timestamp', oneDayAgo)
        .order('timestamp', { ascending: false })
        .limit(5000);

      if (tradesError) throw tradesError;

      const walletVolumes: Record<string, number> = {};
      for (const t of recentTrades || []) {
        if (!t.wallet_address) continue;
        const tradeValue = (t.size || 0) * (t.price || 0);
        walletVolumes[t.wallet_address] = (walletVolumes[t.wallet_address] || 0) + tradeValue;
      }

      return Object.entries(walletVolumes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 50)
        .map(([address]) => address);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * NEW: Fetch wallet positions directly from wallet_positions table.
 * P/L comes pre-calculated from Polymarket's /positions API.
 */
export function useWalletPositions(filters: PositionsFilters = { hideClosedMarkets: false, hideSoldPositions: false, hideInactiveMarkets: false, showNewOnly: false }) {
  const { data: cachedTop50 } = useTop50Wallets();
  
  return useQuery({
    queryKey: ['walletPositions', filters, cachedTop50],
    queryFn: async (): Promise<WalletPosition[]> => {
      const targetWallets = filters.walletAddress 
        ? [filters.walletAddress] 
        : (cachedTop50 || []);

      if (targetWallets.length === 0) {
        console.log('[useWalletPositions] No wallets to query');
        return [];
      }

      // Fetch positions from wallet_positions table
      const { data: dbPositions, error: posError } = await supabase
        .from('wallet_positions')
        .select('*')
        .in('wallet_address', targetWallets)
        .order('synced_at', { ascending: false });

      if (posError) throw posError;
      if (!dbPositions || dbPositions.length === 0) {
        console.log('[useWalletPositions] No positions found in wallet_positions table');
        return [];
      }

      console.log(`[useWalletPositions] Loaded ${dbPositions.length} positions from wallet_positions`);

      // Get wallet labels
      const walletAddresses = [...new Set(dbPositions.map(p => p.wallet_address))];
      const { data: walletsData } = await supabase
        .from('wallets')
        .select('address, label')
        .in('address', walletAddresses);
      
      const walletsMap = new Map((walletsData || []).map(w => [w.address, w]));

      // Helper: fetch rows in chunks to avoid URL length limits on large IN() filters
      const chunkArray = <T,>(arr: T[], size: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
      };

      // Get market data for condition_ids (to check if closed, get category, etc.)
      const conditionIds = [...new Set(dbPositions.map(p => p.condition_id).filter(Boolean))];
      const marketsRows: Array<{ id: string; condition_id: string; question: string; category: string | null; closed: boolean | null; volume_24h: number | null; liquidity: number | null; }> = [];

      for (const chunk of chunkArray(conditionIds, 200)) {
        const { data, error } = await supabase
          .from('markets')
          .select('id, condition_id, question, category, closed, volume_24h, liquidity')
          .in('condition_id', chunk);
        if (error) throw error;
        if (data) marketsRows.push(...data);
      }

      const marketsMap = new Map(marketsRows.map(m => [m.condition_id, m]));

      // Get token prices for positions (for Chance column)
      const assetIds = [...new Set(dbPositions.map(p => p.asset_id).filter(Boolean))];
      const tokenRows: Array<{ id: string; price: number | null }> = [];

      for (const chunk of chunkArray(assetIds, 200)) {
        const { data, error } = await supabase
          .from('tokens')
          .select('id, price')
          .in('id', chunk);
        if (error) throw error;
        if (data) tokenRows.push(...data);
      }

      const tokensMap = new Map(tokenRows.map(t => [t.id, t]));

      // Transform to WalletPosition format
      const positions: WalletPosition[] = [];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for (const pos of dbPositions) {
        const wallet = walletsMap.get(pos.wallet_address);
        const market = marketsMap.get(pos.condition_id);
        const token = tokensMap.get(pos.asset_id || '');
        
        // Position is "sold" if size is very small
        const isSold = (pos.size || 0) < 0.01;
        
        // Chance: prioritize token price, fallback to cur_price (calculate early for filtering)
        const chance = token?.price ?? pos.cur_price ?? 0;
        
        // Apply filters
        if (filters.hideClosedMarkets && market?.closed) continue;
        if (filters.hideSoldPositions && isSold) continue;
        // Hide inactive: filter positions without market data OR missing key metrics
        if (filters.hideInactiveMarkets) {
          const hasNoMarket = !market;
          const hasNoLiquidity = market && (market.liquidity === null || market.liquidity === undefined || market.liquidity <= 0);
          const hasNoVolume24h = !market || market.volume_24h === null || market.volume_24h === undefined || market.volume_24h <= 0;
          const hasNoChance = chance === 0 || chance === null;
          if (hasNoMarket || hasNoLiquidity || hasNoVolume24h || hasNoChance) continue;
        }
        // Whales only: position size >= $10,000 USD
        if (filters.whalesOnly && (pos.current_value || 0) < 10000) continue;
        
        // Category filter: check if market category matches selected types
        if (filters.categories && filters.categories.length > 0) {
          const marketCategoryType = categorizeCategoryType(market?.category);
          if (!filters.categories.includes(marketCategoryType)) continue;
        }
        
        const syncedAt = new Date(pos.synced_at || pos.created_at);
        if (filters.showNewOnly && syncedAt < sevenDaysAgo) continue;

        positions.push({
          wallet_address: pos.wallet_address,
          wallet_label: wallet?.label || null,
          market_id: market?.id || pos.condition_id || '',
          market_question: pos.title || market?.question || 'Unknown Market',
          market_category: market?.category || null,
          market_closed: market?.closed || false,
          outcome: pos.outcome || 'Unknown',
          side: 'BUY', // Positions are always long in Polymarket
          size: pos.current_value || 0,
          shares: pos.size || 0,
          entry_price: pos.avg_price || 0,
          avg_price: pos.avg_price || 0,
          current_price: pos.cur_price || 0,
          // Market data columns
          chance,
          vol_24h: market?.volume_24h || 0,
          liquidity: market?.liquidity || 0,
          pnl: pos.cash_pnl || 0,
          pnl_percent: pos.percent_pnl || 0,
          first_trade_time: pos.created_at,
          last_trade_time: pos.synced_at,
          is_sold: isSold,
          condition_id: pos.condition_id,
          redeemable: pos.redeemable || false,
          realized_pnl: pos.realized_pnl || 0,
        });
      }

      // Sort by P/L descending
      positions.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

      return positions;
    },
    refetchInterval: REFETCH_INTERVAL,
    enabled: true,
  });
}

// Get positions stats summary
export function usePositionsStats() {
  const { data: positions = [] } = useWalletPositions({ hideClosedMarkets: false, hideSoldPositions: false, hideInactiveMarkets: false, showNewOnly: false });
  
  return useMemo(() => {
    const activePositions = positions.filter(p => !p.is_sold);
    const totalValue = activePositions.reduce((sum, p) => sum + p.size, 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    const winCount = positions.filter(p => p.pnl > 0).length;
    const winRate = positions.length > 0 ? (winCount / positions.length) * 100 : 0;
    const uniqueWallets = new Set(positions.map(p => p.wallet_address)).size;
    const uniqueMarkets = new Set(positions.map(p => p.market_id)).size;

    return {
      totalPositions: positions.length,
      activePositions: activePositions.length,
      totalValue,
      totalPnl,
      winRate,
      uniqueWallets,
      uniqueMarkets,
    };
  }, [positions]);
}

/**
 * Sync wallet positions from Polymarket /positions API
 */
export function useSyncWalletPositions() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (walletAddress: string) => {
      console.log(`[useSyncWalletPositions] Syncing positions for ${walletAddress}`);
      
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { action: 'sync_wallet_positions', params: { wallet_address: walletAddress } }
        })
      );
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data, walletAddress) => {
      console.log(`[useSyncWalletPositions] Synced ${data.positions_synced} positions, P/L: $${data.total_pnl?.toFixed(2)}`);
      queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
      queryClient.invalidateQueries({ queryKey: ['top50Wallets'] });
      toast.success(`Synced ${data.positions_synced} positions`);
    },
    onError: (error) => {
      console.error('[useSyncWalletPositions] Error:', error);
      toast.error('Failed to sync positions');
    },
  });
}

// ============ Trades ============

// Hook to fetch fresh trades from Polymarket API for a specific market
export function useFetchMarketTrades() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ marketId, limit = 100 }: { marketId: string; limit?: number }) => {
      console.log(`Fetching fresh trades for market ${marketId}...`);
      
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: {
            action: 'fetch_trades',
            params: { market_id: marketId, limit }
          }
        })
      );
      
      if (error) throw error;
      console.log(`Synced ${data?.trades_synced || 0} trades for market ${marketId}`);
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate trades query to refetch from local DB
      queryClient.invalidateQueries({ queryKey: ['trades', variables.marketId] });
    },
  });
}

export function useTrades(marketId?: string, limit = 100) {
  return useQuery({
    queryKey: ['trades', marketId, limit],
    queryFn: async () => {
      let query = supabase
        .from('trades')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (marketId) {
        query = query.eq('market_id', marketId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Trade[];
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ============ Bot Config ============

export function useBotConfigs() {
  return useQuery({
    queryKey: ['botConfigs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bot_configs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BotConfig[];
    },
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useBotConfig(configId?: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['botConfig', configId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // If no configId, get the user's config (or create one)
      if (!configId) {
        const { data, error } = await supabase
          .from('bot_configs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (error) throw error;
        
        // If no config exists, create a default one for this user
        if (!data) {
          const { data: newConfig, error: createError } = await supabase
            .from('bot_configs')
            .insert({
              user_id: user.id,
              name: 'Smart Wallet Follower',
              mode: 'paper',
              status: 'paused',
              wallets: [],
              categories: ['Politics', 'Crypto'],
            })
            .select()
            .single();
          
          if (createError) throw createError;
          return newConfig as BotConfig;
        }
        
        return data as BotConfig | null;
      }
      
      const { data, error } = await supabase
        .from('bot_configs')
        .select('*')
        .eq('id', configId)
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data as BotConfig;
    },
    enabled: !!user?.id,
    refetchInterval: REFETCH_INTERVAL,
  });
}

export function useUpdateBotConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BotConfig> & { id: string }) => {
      const { data, error } = await supabase
        .from('bot_configs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['botConfigs'] });
      queryClient.invalidateQueries({ queryKey: ['botConfig', data.id] });
    },
  });
}

// ============ Bot Reset ============

export function useBotReset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ configId }: { configId: string }) => {
      const BATCH_SIZE = 200;

      const deleteInBatches = async (table: 'bot_positions' | 'bot_orders' | 'bot_events') => {
        while (true) {
          const { data: rows, error: selectError } = await supabase
            .from(table)
            .select('id')
            .eq('bot_config_id', configId)
            .limit(BATCH_SIZE);

          if (selectError) throw selectError;
          if (!rows || rows.length === 0) break;

          const ids = rows.map((r) => r.id);
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .in('id', ids);

          if (deleteError) throw deleteError;
          if (rows.length < BATCH_SIZE) break;
        }
      };

      // Sequential to reduce DB pressure and avoid statement timeouts
      await deleteInBatches('bot_positions');
      await deleteInBatches('bot_orders');
      await deleteInBatches('bot_events');

      // Reset config to defaults
      const { data, error } = await supabase
        .from('bot_configs')
        .update({
          status: 'paused',
          mode: 'paper',
          signal_min_trade_size: 100,
          signal_cluster_trigger: false,
          signal_cluster_min_trades: 3,
          signal_cluster_window_minutes: 15,
          signal_min_liquidity_score: 50,
          signal_max_spread: 0.05,
          exec_only_limit_orders: true,
          exec_entry_slices: 2,
          exec_reprice_if_mid_moves: 0.02,
          exec_max_slippage: 0.03,
          risk_max_position_per_market: 500,
          risk_max_total_exposure: 5000,
          risk_daily_loss_limit: 250,
          risk_cooldown_minutes: 30,
          risk_no_trade_near_resolution: true,
          risk_resolution_buffer_hours: 24,
          last_signal_scan_at: new Date().toISOString(),
          wallets: [],
        })
        .eq('id', configId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['botConfig'] });
      queryClient.invalidateQueries({ queryKey: ['botConfigs'] });
      queryClient.invalidateQueries({ queryKey: ['botPositions'] });
      queryClient.invalidateQueries({ queryKey: ['botOrders'] });
      queryClient.invalidateQueries({ queryKey: ['botEvents'] });
    },
  });
}

// ============ Bot Signal Scanner ============

export function useBotSignalScanner() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ configId, dryRun = false }: { configId?: string; dryRun?: boolean } = {}) => {
      const { data, error } = await supabase.functions.invoke('bot-signal-scanner', {
        body: { configId, dryRun },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['botEvents'] });
      queryClient.invalidateQueries({ queryKey: ['botConfig'] });
    },
  });
}

// ============ Bot Order Executor ============

export function useBotOrderExecutor() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ configId, dryRun = false, limit = 10 }: { configId?: string; dryRun?: boolean; limit?: number } = {}) => {
      const { data, error } = await supabase.functions.invoke('bot-order-executor', {
        body: { configId, dryRun, limit },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['botEvents'] });
      queryClient.invalidateQueries({ queryKey: ['botOrders'] });
      queryClient.invalidateQueries({ queryKey: ['botPositions'] });
    },
  });
}

// ============ Paginated fetch helper ============

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => ReturnType<ReturnType<typeof supabase.from>['select']>
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
}

// ============ Bot Positions ============

export function useBotPositions(configId?: string, includeClosedSession = true) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['botPositions', configId, includeClosedSession, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from('bot_positions')
        .select('*')
        .eq('user_id', user.id)
        .order('opened_at', { ascending: false })
        .limit(1000);
      
      if (configId) {
        query = query.eq('bot_config_id', configId);
      }
      if (!includeClosedSession) {
        query = query.is('closed_at', null);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BotPosition[];
    },
    enabled: !!user?.id,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ============ Bot Orders ============

export function useBotOrders(configId?: string, status?: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['botOrders', configId, status, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from('bot_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (configId) {
        query = query.eq('bot_config_id', configId);
      }
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BotOrder[];
    },
    enabled: !!user?.id,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ============ Bot Events ============

export function useBotEvents(configId?: string, limit = 200) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['botEvents', configId, limit, user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Two parallel queries: main events + dedicated info events
      // This ensures info events (splits, merges, redeems) are always visible
      // even when high-volume signal/fill events dominate the top N rows
      let mainQuery = supabase
        .from('bot_events')
        .select('*')
        .eq('user_id', user.id)
        .neq('event_type', 'info')
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      let infoQuery = supabase
        .from('bot_events')
        .select('*')
        .eq('user_id', user.id)
        .eq('event_type', 'info')
        .order('timestamp', { ascending: false })
        .limit(50);
      
      if (configId) {
        mainQuery = mainQuery.eq('bot_config_id', configId);
        infoQuery = infoQuery.eq('bot_config_id', configId);
      }
      
      const [mainResult, infoResult] = await Promise.all([mainQuery, infoQuery]);
      
      if (mainResult.error) throw mainResult.error;
      if (infoResult.error) throw infoResult.error;
      
      // Merge and deduplicate by id
      const seen = new Set<string>();
      const merged: BotEvent[] = [];
      for (const e of [...(mainResult.data || []), ...(infoResult.data || [])]) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          merged.push(e as BotEvent);
        }
      }
      
      return merged;
    },
    enabled: !!user?.id,
    refetchInterval: REFETCH_INTERVAL,
  });
}

// ============ Market Metrics ============

export function useMarketMetrics(marketId: string) {
  return useQuery({
    queryKey: ['marketMetrics', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_metrics')
        .select('*')
        .eq('market_id', marketId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as MarketMetrics | null;
    },
    enabled: !!marketId,
  });
}

// ============ News ============

export function useNews(limit = 20) {
  return useQuery({
    queryKey: ['news', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as News[];
    },
  });
}

// ============ Sync Functions (Separated - Options A, D, E) ============

// Sync markets incrementally (Option A)
export function useSyncMarkets() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (incremental?: boolean) => {
      const shouldIncremental = incremental ?? true;
      const { data, error } = await supabase.functions.invoke('sync-markets', {
        body: { incremental: shouldIncremental, limit: 100 },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['marketsWithTokens'] });
    },
  });
}

// Sync tokens with price history cleanup (includes Option C)
export function useSyncTokens() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (marketIds?: string[]) => {
      const { data, error } = await supabase.functions.invoke('sync-tokens', {
        body: { marketIds: marketIds || [] },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['marketsWithTokens'] });
    },
  });
}

// Sync trades globally or for specific market (migrated from sync-trades to polymarket-data)
export function useSyncTrades() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (marketId?: string) => {
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: {
            action: 'fetch_trades',
            params: { market_id: marketId, limit: 200 },
          },
        })
      );
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['walletActivity'] });
      queryClient.invalidateQueries({ queryKey: ['walletTradesInfinite'] });
    },
  });
}

// Sync activity for all watched wallets + discover top wallets
export function useSyncAllActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      console.log('[Sync & Discover v3] Starting Discovery Engine v3...');
      
      // Step 0: Sync Global Activity Feed FIRST (for Unusual/Whale discovery)
      console.log('[Sync & Discover v3] Step 0: Syncing global activity feed...');
      let globalActivityStats = { trades_fetched: 0, unusual_count: 0, whale_count: 0, new_wallets_discovered: 0 };
      
      try {
        const { data: activityResult, error: activityError } = await retryEdgeFunction(() =>
          supabase.functions.invoke('polymarket-data', {
            body: { 
              action: 'sync_global_activity', 
              params: { limit: 500 } 
            },
          })
        );
        
        if (activityError) {
          console.error('[Sync & Discover v3] Global activity error:', activityError);
        } else {
          globalActivityStats = activityResult || globalActivityStats;
          console.log(`[Sync & Discover v3] Global activity synced:`, globalActivityStats);
        }
      } catch (e) {
        console.error('[Sync & Discover v3] Global activity exception:', e);
      }
      
      // Step 1: Get watched wallets first
      const { data: watchedWallets, error: watchedError } = await supabase
        .from('wallets')
        .select('address')
        .eq('is_watched', true);
      
      if (watchedError) throw watchedError;
      
      const watchedAddresses = new Set((watchedWallets || []).map(w => w.address));
      console.log(`[Sync & Discover v3] Found ${watchedAddresses.size} watched wallets`);

      // Step 2: Get existing wallet addresses to exclude from discovery
      const { data: existingWallets } = await supabase
        .from('wallets')
        .select('address')
        .limit(1000);
      
      const existingAddresses = (existingWallets || []).map(w => w.address);

      // Step 3: Get rotating offset from localStorage (cycles through 0, 50, 100, 150, 0...)
      const STORAGE_KEY = 'discovery_offset';
      const currentOffset = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      const nextOffset = currentOffset >= 150 ? 0 : currentOffset + 50;
      localStorage.setItem(STORAGE_KEY, String(nextOffset));
      
      console.log(`[Sync & Discover v3] Using offset ${currentOffset}, next will be ${nextOffset}`);

      // Step 4: Call Discovery Engine v2 on edge function
      const { data: discoveryResult, error: discoveryError } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { 
            action: 'discover_fresh_wallets', 
            params: { 
              offset: currentOffset,
              leaderboard_limit: 100,
              trades_limit: 5000,
              exclude_addresses: existingAddresses
            } 
          },
        })
      );

      if (discoveryError) {
        console.error('[Sync & Discover v3] Discovery error:', discoveryError);
      }

      const freshWallets = discoveryResult?.wallets || [];
      const sourceBreakdown = discoveryResult?.source_breakdown || {};
      
      console.log(`[Sync & Discover v3] Discovered ${freshWallets.length} fresh wallets from API`, sourceBreakdown);

      // Step 5: Build final list - watched first, then fresh discoveries
      const discoveredAddresses = freshWallets
        .filter((w: { address: string }) => !watchedAddresses.has(w.address))
        .slice(0, 50 - watchedAddresses.size)
        .map((w: { address: string }) => w.address);
      
      const allWallets = [...Array.from(watchedAddresses), ...discoveredAddresses];
      
      console.log(`[Sync & Discover v3] Syncing ${watchedAddresses.size} watched + ${discoveredAddresses.length} discovered (offset: ${currentOffset})`);

      // Step 6: Sync POSITIONS for all wallets
      const BATCH_SIZE = 5;
      let watchedPositions = 0;
      let discoveredPositions = 0;
      let totalPnl = 0;
      
      for (let i = 0; i < allWallets.length; i += BATCH_SIZE) {
        const batch = allWallets.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(address =>
            retryEdgeFunction(() =>
              supabase.functions.invoke('polymarket-data', {
                body: { 
                  action: 'sync_wallet_positions', 
                  params: { wallet_address: address } 
                },
              })
            )
          )
        );
        
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const address = batch[j];
          if (result.status === 'fulfilled' && result.value.data) {
            const posCount = result.value.data.positions_synced || 0;
            if (watchedAddresses.has(address)) {
              watchedPositions += posCount;
            } else {
              discoveredPositions += posCount;
            }
            totalPnl += result.value.data.total_pnl || 0;
          }
        }
        
        if (i + BATCH_SIZE < allWallets.length) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      console.log(`[Sync & Discover v3] Done: ${watchedPositions + discoveredPositions} positions synced, Total P/L: $${totalPnl.toFixed(2)}`);
      return { 
        watchedWallets: watchedAddresses.size,
        discoveredWallets: discoveredAddresses.length,
        watchedPositions,
        discoveredPositions,
        totalPnl,
        sourceBreakdown: sourceBreakdown,
        offset: currentOffset,
        newWalletAddresses: discoveredAddresses,
        globalActivity: globalActivityStats,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['walletPositions'] });
      queryClient.invalidateQueries({ queryKey: ['top50Wallets'] });
      queryClient.invalidateQueries({ queryKey: ['activityFeed'] });
      queryClient.invalidateQueries({ queryKey: ['activityStats'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['positionsStats'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-win-rates'] });
      
      if (result) {
        const parts: string[] = [];
        if (result.watchedWallets > 0) {
          parts.push(`${result.watchedPositions} from ${result.watchedWallets} watchlist`);
        }
        if (result.discoveredWallets > 0) {
          parts.push(`${result.discoveredPositions} from ${result.discoveredWallets} discovered`);
        }
        
        // Show discovery source breakdown
        const sourceInfo = result.sourceBreakdown 
          ? ` (🏆${result.sourceBreakdown.leaderboard || 0} 📈${result.sourceBreakdown.global_trades || 0})` 
          : '';
        
        // Show global activity stats
        const ga = result.globalActivity;
        const activityInfo = ga 
          ? `🐋 ${ga.whale_count || 0} whale | ⚡ ${ga.unusual_count || 0} unusual`
          : '';
        
        toast.success(`Synced positions: ${parts.join(' + ')}${sourceInfo}`, {
          description: `${activityInfo} | Tier: ${result.offset}-${result.offset + 50}`
        });
      }
    },
  });
}

// On-demand wallet sync using Polymarket public Data API (via backend function)
export function useSyncWalletFromPolymarket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ walletAddress, limit = 500 }: { walletAddress: string; limit?: number }) => {
      const [activityRes, statsRes] = await Promise.allSettled([
        retryEdgeFunction(() =>
          supabase.functions.invoke('polymarket-data', {
            body: { action: 'fetch_wallet_activity', params: { wallet_address: walletAddress, limit } },
          })
        ),
        retryEdgeFunction(() =>
          supabase.functions.invoke('polymarket-data', {
            body: { action: 'fetch_wallet_stats', params: { wallet_address: walletAddress } },
          })
        ),
      ]);

      const errors: string[] = [];
      if (activityRes.status === 'rejected') errors.push(String(activityRes.reason));
      else if (activityRes.value.error) errors.push(activityRes.value.error.message);

      if (statsRes.status === 'rejected') errors.push(String(statsRes.reason));
      else if (statsRes.value.error) errors.push(statsRes.value.error.message);

      if (errors.length) throw new Error(errors.join(' | '));

      return {
        activity: activityRes.status === 'fulfilled' ? activityRes.value.data : null,
        stats: statsRes.status === 'fulfilled' ? statsRes.value.data : null,
      };
    },
    onSuccess: (result, variables) => {
      const activityCount = result?.activity?.activities_synced || result?.activity?.length || 0;
      console.log(`[useSyncWalletFromPolymarket] Synced ${activityCount} activities for ${variables.walletAddress}`);
      
      queryClient.invalidateQueries({ queryKey: ['wallet', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['walletActivity', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletTradesInfinite', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletAllTrades', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['activityFeed'] });
      queryClient.invalidateQueries({ queryKey: ['activityStats'] });
      queryClient.invalidateQueries({ queryKey: ['tokensByMarkets'] });
      
      toast.success(`Synced ${activityCount} activities`);
    },
    onError: (error) => {
      console.error('[useSyncWalletFromPolymarket] Error:', error);
      toast.error('Failed to sync wallet activity');
    },
  });
}

// Deep fetch: paginated full history sync with cursor
export function useDeepFetchWalletHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      walletAddress, 
      cursor,
      onProgress 
    }: { 
      walletAddress: string; 
      cursor?: string | null;
      onProgress?: (loaded: number, hasMore: boolean) => void;
    }) => {
      const RATE_LIMIT_MS = 250; // Rate limit between pages
      let currentCursor = cursor;
      let totalLoaded = 0;
      let hasMore = true;
      let iterations = 0;
      const MAX_ITERATIONS = 20; // Safety limit per call

      while (hasMore && iterations < MAX_ITERATIONS) {
        iterations++;
        
        const { data, error } = await retryEdgeFunction(() =>
          supabase.functions.invoke('polymarket-data', {
            body: {
              action: 'fetch_wallet_activity',
              params: {
                wallet_address: walletAddress,
                limit: 500,
                cursor: currentCursor,
                deep_fetch: true,
              },
            },
          })
        );

        if (error) throw error;

        const synced = data?.activities_synced || 0;
        totalLoaded = data?.total_loaded || totalLoaded + synced;
        currentCursor = data?.oldest_timestamp || null;
        hasMore = data?.has_more || false;

        onProgress?.(totalLoaded, hasMore);

        if (hasMore && iterations < MAX_ITERATIONS) {
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
        }
      }

      return {
        total_loaded: totalLoaded,
        cursor: currentCursor,
        has_more: hasMore,
        completed: !hasMore,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallet', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['walletActivity', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletTradesInfinite', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletAllTrades', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['tokensByMarkets'] });
    },
  });
}

// On-demand sync for a specific market (Option D)
export function useSyncMarketDetail() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (marketId: string) => {
      const { data, error } = await supabase.functions.invoke('sync-market-detail', {
        body: { marketId },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, marketId) => {
      queryClient.invalidateQueries({ queryKey: ['market', marketId] });
      queryClient.invalidateQueries({ queryKey: ['tokens', marketId] });
      queryClient.invalidateQueries({ queryKey: ['trades', marketId] });
    },
  });
}

// Cleanup old history data — now uses consolidated maintenance-cron
export function useCleanupHistory() {
  return useMutation({
    mutationFn: async (daysToKeep?: number) => {
      const days = daysToKeep ?? 7;
      const { data, error } = await supabase.functions.invoke('maintenance-cron', {
        body: { priceHistoryDays: days, walletActivityDays: 30, agentDataDays: days },
      });
      
      if (error) throw error;
      return data;
    },
  });
}

export function useSyncTokenPrices() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (tokenIds?: string[]) => {
      const { data, error } = await supabase.functions.invoke('polymarket-clob', {
        body: { action: 'prices', tokenIds },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
      queryClient.invalidateQueries({ queryKey: ['marketsWithTokens'] });
    },
  });
}

// Lightweight full sync using unified polymarket-data (migrated from sync-trades)
export function useFullSync() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      // Run syncs in parallel for speed - now using polymarket-data for global activity
      const [marketsResult, activityResult] = await Promise.allSettled([
        supabase.functions.invoke('sync-markets', { body: { incremental: true, limit: 100 } }),
        retryEdgeFunction(() =>
          withPolymarketDataLimit(() =>
            supabase.functions.invoke('polymarket-data', {
              body: { action: 'sync_global_activity', params: { limit: 100 } },
            })
          )
        ),
      ]);
      
      const results = {
        markets: marketsResult.status === 'fulfilled' ? marketsResult.value.data : null,
        activity: activityResult.status === 'fulfilled' ? activityResult.value.data : null,
      };
      
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useBackfillWallets() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (limit?: number) => {
      const actualLimit = limit ?? 500;
      console.log('Starting wallet backfill...');
      const { data, error } = await retryEdgeFunction(() =>
        supabase.functions.invoke('polymarket-data', {
          body: { action: 'backfill_wallets', params: { limit: actualLimit } },
        })
      );
      
      if (error) throw error;
      console.log('Backfill complete:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}

// ============ Bot Position Price Updater ============

export function useBotPositionUpdater() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ configId, dryRun = false }: { configId?: string; dryRun?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('bot-position-updater', {
        body: { configId, dryRun },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['botPositions', variables.configId] });
    },
  });
}

// ============ Stats Helpers ============

export function useMarketStats() {
  const { data } = useMarketsWithTokens();
  const markets = data?.markets;

  const stats = {
    totalVolume24h: markets?.reduce((sum, m) => sum + (m.volume_24h || 0), 0) || 0,
    activeMarkets: markets?.filter((m) => !m.closed).length || 0,
    topMover: markets?.reduce((max, m) => {
      const change = Math.abs(m.tokens[0]?.change_24h || 0);
      const maxChange = Math.abs(max?.tokens[0]?.change_24h || 0);
      return change > maxChange ? m : max;
    }, markets?.[0]),
    avgLiquidity:
      markets && markets.length > 0
        ? markets.reduce((sum, m) => sum + (m.liquidity || 0), 0) / markets.length
        : 0,
  };

  return stats;
}

export function useWalletStats() {
  // Get current user for RLS-protected queries
  const { user } = useAuth();
  const { data: wallets } = useWallets(true, user?.id);
  const { data: activities } = useUnusualActivity();
  
  const stats = {
    totalTrackedVolume: wallets?.reduce((sum, w) => sum + (w.total_volume || 0), 0) || 0,
    watchedCount: wallets?.length || 0,
    highActivityCount: wallets?.filter(w => (w.unusual_score || 0) >= 80).length || 0,
    unusualSignals: activities?.length || 0,
    avgWinRate: wallets && wallets.length > 0
      ? wallets.reduce((sum, w) => sum + (w.win_rate || 0), 0) / wallets.length
      : 0,
  };
  
  return stats;
}
