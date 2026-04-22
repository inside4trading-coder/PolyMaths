import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentConfig {
  id?: string;
  name: string;
  model: string;
  categories: string[];
  riskTolerance: string;
  analysisDepth: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  name: 'My Agent',
  model: 'google/gemini-3-flash-preview',
  categories: ['Politics', 'Sports', 'Crypto'],
  riskTolerance: 'medium',
  analysisDepth: 'balanced',
};

export function useAgentConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

  const config: AgentConfig = data
    ? {
        id: data.id,
        name: data.name,
        model: data.model,
        categories: (data.categories as string[] | null) || DEFAULT_CONFIG.categories,
        riskTolerance: data.risk_tolerance || DEFAULT_CONFIG.riskTolerance,
        analysisDepth: data.analysis_depth || DEFAULT_CONFIG.analysisDepth,
      }
    : DEFAULT_CONFIG;

  return { config, isLoading };
}
