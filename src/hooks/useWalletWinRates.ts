import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface WalletWinRateData {
  wallet_address: string;
  winRate: number;
  wins: number;
  losses: number;
  totalPositions: number;
}

/**
 * Calculates win rates dynamically from wallet_positions table.
 * A "Win" is defined as cash_pnl > 0 to match WalletDetailPanel logic.
 */
export function useWalletWinRates(walletAddresses: string[]) {
  return useQuery({
    queryKey: ['wallet-win-rates', walletAddresses.sort().join(',')],
    queryFn: async (): Promise<Map<string, WalletWinRateData>> => {
      if (walletAddresses.length === 0) {
        return new Map();
      }

      const { data: positions, error } = await supabase
        .from('wallet_positions')
        .select('wallet_address, cash_pnl')
        .in('wallet_address', walletAddresses);

      if (error) {
        console.error('[useWalletWinRates] Error fetching positions:', error);
        throw error;
      }

      // Group by wallet and calculate stats
      const walletStats = new Map<string, { wins: number; losses: number }>();

      for (const pos of positions || []) {
        const addr = pos.wallet_address;
        const pnl = pos.cash_pnl || 0;
        
        if (!walletStats.has(addr)) {
          walletStats.set(addr, { wins: 0, losses: 0 });
        }
        
        const stats = walletStats.get(addr)!;
        if (pnl > 0) {
          stats.wins++;
        } else if (pnl < 0) {
          stats.losses++;
        }
      }

      // Convert to final format
      const result = new Map<string, WalletWinRateData>();
      
      for (const [addr, stats] of walletStats.entries()) {
        const total = stats.wins + stats.losses;
        result.set(addr, {
          wallet_address: addr,
          winRate: total > 0 ? (stats.wins / total) * 100 : 0,
          wins: stats.wins,
          losses: stats.losses,
          totalPositions: total,
        });
      }

      return result;
    },
    enabled: walletAddresses.length > 0,
    staleTime: 30_000, // 30 seconds
  });
}
