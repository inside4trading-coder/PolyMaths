import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Batch-resolves market questions from the markets table for activities
 * that have a condition_id but no market_question.
 * Uses a single query with deduped condition_ids and caches for 5 minutes.
 */
export function useMarketNameResolver(conditionIds: (string | null | undefined)[]) {
  const uniqueIds = [...new Set(conditionIds.filter((id): id is string => !!id && id.length > 5))];

  return useQuery({
    queryKey: ['marketNameResolver', uniqueIds.sort().join(',')],
    queryFn: async () => {
      if (uniqueIds.length === 0) return new Map<string, string>();

      // Query markets by condition_id
      const { data, error } = await supabase
        .from('markets')
        .select('condition_id, question')
        .in('condition_id', uniqueIds);

      if (error) throw error;

      const map = new Map<string, string>();
      for (const m of data || []) {
        if (m.condition_id && m.question) {
          map.set(m.condition_id, m.question);
          map.set(m.condition_id.toLowerCase(), m.question);
        }
      }
      return map;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache 5 min
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Resolves a market_question for an activity, using the resolver map as fallback.
 */
export function resolveMarketName(
  activity: { market_question?: string | null; condition_id?: string | null; market_id?: string | null },
  resolverMap?: Map<string, string>
): string {
  if (activity.market_question) return activity.market_question;
  
  if (resolverMap && activity.condition_id) {
    const resolved = resolverMap.get(activity.condition_id) || resolverMap.get(activity.condition_id.toLowerCase());
    if (resolved) return resolved;
  }

  // Truncate condition_id as last resort
  if (activity.condition_id) {
    return `Market ${activity.condition_id.slice(0, 10)}…`;
  }
  
  return 'Unknown market';
}
