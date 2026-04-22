import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CleanupResult {
  success: boolean;
  dry_run: boolean;
  deleted?: {
    price_history: number;
    wallet_activity: number;
    agent_predictions: number;
    market_sentiment: number;
    rag_signals: number;
  };
  expired_markets_cleaned?: number;
  errors?: string[];
  error?: string;
}

export function useAgentDataCleanup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cleanupMutation = useMutation({
    mutationFn: async (options: {
      priceHistoryDays?: number;
      walletActivityDays?: number;
      agentDataDays?: number;
      cleanExpiredMarkets?: boolean;
      dryRun?: boolean;
    } = {}): Promise<CleanupResult> => {
      const { data, error } = await supabase.functions.invoke('maintenance-cron', {
        body: {
          priceHistoryDays: options.priceHistoryDays ?? 7,
          walletActivityDays: options.walletActivityDays ?? 30,
          agentDataDays: options.agentDataDays ?? 7,
          cleanExpiredMarkets: options.cleanExpiredMarkets ?? true,
          dryRun: options.dryRun ?? false,
        },
      });

      if (error) throw error;
      return data as CleanupResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['sentiment-history'] });
      queryClient.invalidateQueries({ queryKey: ['rag-signals'] });

      const d = data.deleted;
      const total = d
        ? d.price_history + d.wallet_activity + d.agent_predictions + d.market_sentiment + d.rag_signals
        : 0;

      toast({
        title: 'Maintenance Complete',
        description: `Removed ${total} stale records`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Maintenance Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    cleanup: cleanupMutation.mutate,
    isLoading: cleanupMutation.isPending,
    result: cleanupMutation.data,
  };
}
