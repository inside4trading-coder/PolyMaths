import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SparklinePoint {
  day: string;
  volume: number;
  trades: number;
}

export function useWalletSparklines(addresses: string[]) {
  return useQuery({
    queryKey: ['wallet-sparklines', addresses],
    queryFn: async () => {
      if (!addresses.length) return {};

      // Fetch last 14 days of activity for all watched wallets
      const since = new Date();
      since.setDate(since.getDate() - 14);

      const { data, error } = await supabase
        .from('wallet_activity')
        .select('wallet_address, timestamp, size, usdc_size')
        .in('wallet_address', addresses)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Group by wallet + day
      const map: Record<string, SparklinePoint[]> = {};

      for (const row of data || []) {
        const day = row.timestamp.slice(0, 10); // YYYY-MM-DD
        if (!map[row.wallet_address]) map[row.wallet_address] = [];

        const existing = map[row.wallet_address].find(p => p.day === day);
        if (existing) {
          existing.volume += Math.abs(row.usdc_size || row.size || 0);
          existing.trades += 1;
        } else {
          map[row.wallet_address].push({
            day,
            volume: Math.abs(row.usdc_size || row.size || 0),
            trades: 1,
          });
        }
      }

      return map;
    },
    enabled: addresses.length > 0,
    staleTime: 60_000,
  });
}
