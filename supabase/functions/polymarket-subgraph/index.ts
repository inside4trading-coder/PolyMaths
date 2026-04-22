import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Goldsky Subgraph endpoints for Polymarket
const SUBGRAPHS = {
  activity: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
  positions: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn',
  orderbook: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn',
  openInterest: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/oi-subgraph/0.0.6/gn',
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function querySubgraph<T>(endpoint: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  console.log(`[polymarket-subgraph] Querying ${endpoint}`);
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Subgraph request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as GraphQLResponse<T>;
  
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
  }

  if (!json.data) {
    throw new Error('No data returned from subgraph');
  }

  return json.data;
}

// Query: Fetch on-chain trades for a wallet
// Try multiple possible entity names as the schema may vary
async function fetchOnChainTrades(walletAddress: string, first = 100, skip = 0) {
  // Try 'trades' entity first (most common)
  const tradesQuery = `
    query WalletTrades($user: String!, $first: Int!, $skip: Int!) {
      trades(
        first: $first
        skip: $skip
        where: { trader: $user }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        timestamp
        side
        size
        price
        outcome
        market
      }
    }
  `;

  const userLower = walletAddress.toLowerCase();

  try {
    const data = await querySubgraph<{ trades: Array<{
      id: string;
      timestamp: string;
      side: string;
      size: string;
      price: string;
      outcome: string;
      market: string;
    }> }>(SUBGRAPHS.activity, tradesQuery, { user: userLower, first, skip });

    return data.trades.map(trade => ({
      id: trade.id,
      transactionHash: trade.id,
      activityType: 'TRADE' as const,
      side: trade.side,
      outcomeIndex: trade.outcome === 'Yes' ? 0 : 1,
      amount: parseFloat(trade.size || '0'),
      collateralAmount: parseFloat(trade.size || '0') * parseFloat(trade.price || '0'),
      feeAmount: 0,
      conditionId: trade.market || null,
      timestamp: new Date(parseInt(trade.timestamp) * 1000).toISOString(),
      blockNumber: 0,
    }));
  } catch (error) {
    console.log('[polymarket-subgraph] trades query failed, trying alternative schema:', String(error).slice(0, 100));
    
    // Try 'transactions' entity as fallback
    try {
      const txQuery = `
        query WalletTransactions($user: String!, $first: Int!) {
          transactions(
            first: $first
            where: { user: $user }
            orderBy: timestamp
            orderDirection: desc
          ) {
            id
            timestamp
            type
            amount
          }
        }
      `;

      const txData = await querySubgraph<{ transactions: Array<{
        id: string;
        timestamp: string;
        type: string;
        amount: string;
      }> }>(SUBGRAPHS.activity, txQuery, { user: userLower, first });

      return txData.transactions.map(tx => ({
        id: tx.id,
        transactionHash: tx.id,
        activityType: 'TRADE' as const,
        side: tx.type || 'UNKNOWN',
        outcomeIndex: 0,
        amount: parseFloat(tx.amount || '0'),
        collateralAmount: parseFloat(tx.amount || '0'),
        feeAmount: 0,
        conditionId: null,
        timestamp: new Date(parseInt(tx.timestamp) * 1000).toISOString(),
        blockNumber: 0,
      }));
    } catch (fallbackError) {
      console.log('[polymarket-subgraph] All trade queries failed, returning empty:', String(fallbackError).slice(0, 100));
      return [];
    }
  }
}

// Query: Fetch splits and merges (sophisticated trader activity)
// Note: The subgraph schema may vary - we use graceful fallbacks
async function fetchSplitsMerges(walletAddress: string, first = 1000) {
  const splitsQuery = `
    query WalletSplits($user: String!, $first: Int!, $skip: Int!) {
      splits(
        first: $first
        skip: $skip
        where: { stakeholder: $user }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        amount
        timestamp
      }
    }
  `;

  const mergesQuery = `
    query WalletMerges($user: String!, $first: Int!, $skip: Int!) {
      merges(
        first: $first
        skip: $skip
        where: { stakeholder: $user }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        amount
        timestamp
      }
    }
  `;

  const userLower = walletAddress.toLowerCase();
  const pageSize = Math.min(first, 500);

  async function paginateQuery<T>(queryStr: string, entityName: string): Promise<T[]> {
    const all: T[] = [];
    let skip = 0;
    while (true) {
      const data = await querySubgraph<Record<string, T[]>>(
        SUBGRAPHS.activity, queryStr, { user: userLower, first: pageSize, skip }
      );
      const items = data[entityName] || [];
      all.push(...items);
      if (items.length < pageSize) break;
      skip += pageSize;
      if (skip >= 500) break; // Cap at 1 page to stay within CPU limits
    }
    return all;
  }

  try {
    // Sequential to reduce peak CPU
    const rawSplits = await paginateQuery<{ id: string; amount: string; timestamp: string }>(splitsQuery, 'splits');
    const rawMerges = await paginateQuery<{ id: string; amount: string; timestamp: string }>(mergesQuery, 'merges');

    console.log(`[polymarket-subgraph] Fetched ${rawSplits.length} splits, ${rawMerges.length} merges`);

    const splits = rawSplits.map(s => ({
      id: s.id,
      activityType: 'SPLIT' as const,
      amount: parseFloat(s.amount) / 1e6,
      timestamp: new Date(parseInt(s.timestamp) * 1000).toISOString(),
      conditionId: null,
      transactionHash: s.id,
      blockNumber: 0,
    }));

    const merges = rawMerges.map(m => ({
      id: m.id,
      activityType: 'MERGE' as const,
      amount: parseFloat(m.amount) / 1e6,
      timestamp: new Date(parseInt(m.timestamp) * 1000).toISOString(),
      conditionId: null,
      transactionHash: m.id,
      blockNumber: 0,
    }));

    return { splits, merges };
  } catch (error) {
    console.error('[polymarket-subgraph] Error fetching splits/merges, returning empty:', error);
    return { splits: [], merges: [] };
  }
}

// Query: Fetch redemptions
async function fetchRedemptions(walletAddress: string, first = 500) {
  const query = `
    query WalletRedemptions($user: String!, $first: Int!, $skip: Int!) {
      redemptions(
        first: $first
        skip: $skip
        where: { redeemer: $user }
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        payout
        timestamp
      }
    }
  `;

  const userLower = walletAddress.toLowerCase();
  const allRedemptions: Array<{ id: string; payout: string; timestamp: string }> = [];
  const pageSize = Math.min(first, 500);
  let skip = 0;

  try {
    // Paginate to get ALL redemptions, not just the first page
    while (true) {
      const data = await querySubgraph<{ redemptions: Array<{
        id: string;
        payout: string;
        timestamp: string;
      }> }>(SUBGRAPHS.activity, query, { user: userLower, first: pageSize, skip });

      allRedemptions.push(...data.redemptions);

      // If we got fewer than pageSize, we've reached the end
      if (data.redemptions.length < pageSize) break;
      skip += pageSize;
      
      // Safety limit: max 1 page (500 results) to stay within CPU limits
      if (skip >= 500) {
        console.log(`[polymarket-subgraph] Redemptions capped at ${allRedemptions.length}`);
        break;
      }
    }

    console.log(`[polymarket-subgraph] Fetched ${allRedemptions.length} total redemptions for ${walletAddress}`);

    return allRedemptions.map(r => ({
      id: r.id,
      activityType: 'REDEEM' as const,
      amount: parseFloat(r.payout) / 1e6,
      timestamp: new Date(parseInt(r.timestamp) * 1000).toISOString(),
      conditionId: null,
      transactionHash: r.id,
      blockNumber: 0,
    }));
  } catch (error) {
    console.error('[polymarket-subgraph] Error fetching redemptions:', error);
    return [];
  }
}

// Query: Get user's P/L from PNL subgraph
// The PNL subgraph uses 'globalUser' entity instead of 'user'
async function fetchUserPnL(walletAddress: string) {
  // Try different entity names that might exist in the PNL subgraph
  const query = `
    query UserPnL($user: ID!) {
      globalUser(id: $user) {
        id
        numTrades
        totalVolume
        realizedPnl
        unrealizedPnl
      }
    }
  `;

  try {
    const data = await querySubgraph<{ globalUser: {
      id: string;
      numTrades: string;
      totalVolume: string;
      realizedPnl: string;
      unrealizedPnl: string;
    } | null }>(SUBGRAPHS.pnl, query, { user: walletAddress.toLowerCase() });

    if (!data.globalUser) {
      console.log('[polymarket-subgraph] No PnL data found for user');
      return null;
    }

    return {
      numTrades: parseInt(data.globalUser.numTrades || '0'),
      totalVolume: parseFloat(data.globalUser.totalVolume || '0') / 1e6,
      realizedPnl: parseFloat(data.globalUser.realizedPnl || '0') / 1e6,
      unrealizedPnl: parseFloat(data.globalUser.unrealizedPnl || '0') / 1e6,
      totalPnl: (parseFloat(data.globalUser.realizedPnl || '0') + parseFloat(data.globalUser.unrealizedPnl || '0')) / 1e6,
      lastTradeTimestamp: null,
    };
  } catch (error) {
    // PnL subgraph may not have this user or entity - this is not critical
    console.log('[polymarket-subgraph] PnL fetch failed (non-critical):', String(error).slice(0, 100));
    return null;
  }
}

// Main sync function: Sync all on-chain data for a wallet
// deno-lint-ignore no-explicit-any
async function syncWalletOnChain(walletAddress: string, supabase: any) {
  console.log(`[polymarket-subgraph] Syncing on-chain data for ${walletAddress}`);
  
  // Skip trades and PnL - subgraph schema doesn't support those entities (always fails)
  const trades: Awaited<ReturnType<typeof fetchOnChainTrades>> = [];
  const splitsMerges = await fetchSplitsMerges(walletAddress, 500);
  const redemptions = await fetchRedemptions(walletAddress, 500);
  const pnl = null;

  // Prepare all activities for unified wallet_activity table
  const activities: Array<{
    wallet_address: string;
    activity_type: string;
    transaction_hash: string;
    condition_id: string | null;
    size: number;
    price: number | null;
    timestamp: string;
    signature: string;
    source: string;
  }> = [];

  // Add trades
  for (const trade of trades) {
    activities.push({
      wallet_address: walletAddress.toLowerCase(),
      activity_type: 'TRADE',
      transaction_hash: trade.transactionHash,
      condition_id: trade.conditionId,
      size: trade.amount,
      price: trade.collateralAmount ? trade.collateralAmount / trade.amount : null,
      timestamp: trade.timestamp,
      signature: trade.transactionHash,
      source: 'onchain',
    });
  }

  // Add splits
  for (const split of splitsMerges.splits) {
    activities.push({
      wallet_address: walletAddress.toLowerCase(),
      activity_type: 'SPLIT',
      transaction_hash: split.transactionHash,
      condition_id: split.conditionId,
      size: split.amount,
      price: null,
      timestamp: split.timestamp,
      signature: split.transactionHash,
      source: 'onchain',
    });
  }

  // Add merges
  for (const merge of splitsMerges.merges) {
    activities.push({
      wallet_address: walletAddress.toLowerCase(),
      activity_type: 'MERGE',
      transaction_hash: merge.transactionHash,
      condition_id: merge.conditionId,
      size: merge.amount,
      price: null,
      timestamp: merge.timestamp,
      signature: merge.transactionHash,
      source: 'onchain',
    });
  }

  // Add redemptions
  for (const redeem of redemptions) {
    activities.push({
      wallet_address: walletAddress.toLowerCase(),
      activity_type: 'REDEEM',
      transaction_hash: redeem.transactionHash,
      condition_id: redeem.conditionId,
      size: redeem.amount,
      price: null,
      timestamp: redeem.timestamp,
      signature: redeem.transactionHash,
      source: 'onchain',
    });
  }

  // Upsert activities into unified wallet_activity table with source='onchain'
  const BATCH_SIZE = 100;
  for (let i = 0; i < activities.length; i += BATCH_SIZE) {
    const batch = activities.slice(i, i + BATCH_SIZE);
    const { error: activityError } = await supabase
      .from('wallet_activity')
      .upsert(batch as any[], {
        onConflict: 'signature',
        ignoreDuplicates: true,
      });

    if (activityError) {
      console.error(`[polymarket-subgraph] Error upserting batch ${i / BATCH_SIZE}:`, activityError);
    }
  }

  // Calculate wallet metrics
  const splitsCount = splitsMerges.splits.length;
  const mergesCount = splitsMerges.merges.length;
  const totalFees = trades.reduce((sum, t) => sum + (t.feeAmount || 0), 0);
  
  // Determine if wallet is sophisticated (uses splits/merges)
  const isSophisticated = splitsCount > 0 || mergesCount > 0;

  // Update wallet with on-chain metrics
  const walletUpdate = {
    splits_count: splitsCount,
    merges_count: mergesCount,
    total_fees_paid: totalFees,
    onchain_verified: true,
    onchain_synced_at: new Date().toISOString(),
    ...(pnl ? { markets_traded: pnl.numTrades } : {}),
  };

  const { error: walletError } = await supabase
    .from('wallets')
    .update(walletUpdate as any)
    .eq('address', walletAddress.toLowerCase());

  if (walletError) {
    console.error('[polymarket-subgraph] Error updating wallet:', walletError);
  }

  return {
    tradesCount: trades.length,
    splitsCount,
    mergesCount,
    redemptionsCount: redemptions.length,
    totalActivities: activities.length,
    pnl,
    isSophisticated,
  };
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, params } = body;

    console.log(`[polymarket-subgraph] Action: ${action}`, params);

    let result: unknown;

    switch (action) {
      case 'fetch_onchain_trades': {
        const { wallet_address, first = 100, skip = 0 } = params;
        result = await fetchOnChainTrades(wallet_address, first, skip);
        break;
      }

      case 'fetch_splits_merges': {
        const { wallet_address, first = 100 } = params;
        result = await fetchSplitsMerges(wallet_address, first);
        break;
      }

      case 'fetch_redemptions': {
        const { wallet_address, first = 100 } = params;
        result = await fetchRedemptions(wallet_address, first);
        break;
      }

      case 'fetch_pnl': {
        const { wallet_address } = params;
        result = await fetchUserPnL(wallet_address);
        break;
      }

      case 'sync_wallet_onchain': {
        const { wallet_address } = params;
        result = await syncWalletOnChain(wallet_address, supabase);
        break;
      }

      case 'sync_all_watched': {
        // Sync all watched wallets
        const { data: wallets, error } = await supabase
          .from('wallets')
          .select('address')
          .eq('is_watched', true);

        if (error) throw error;

        const results = [];
        for (const wallet of wallets || []) {
          try {
            const syncResult = await syncWalletOnChain(wallet.address, supabase);
            results.push({ address: wallet.address, success: true, ...syncResult });
          } catch (e) {
            results.push({ address: wallet.address, success: false, error: String(e) });
          }
        }

        result = { synced: results.length, results };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[polymarket-subgraph] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
