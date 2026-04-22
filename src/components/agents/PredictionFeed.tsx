import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { History, TrendingUp, TrendingDown, Minus, Brain } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { FreshnessBadge } from '@/components/common/FreshnessBadge';

export function PredictionFeed() {
  const { t } = useLanguage();

  const { data: predictions, isLoading } = useQuery({
    queryKey: ['agent-predictions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_predictions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const getRecommendationIcon = (rec?: string | null) => {
    if (!rec) return <Minus className="w-4 h-4" />;
    if (rec.includes('YES')) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (rec.includes('NO')) return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-yellow-400" />;
  };

  const getRecommendationColor = (rec?: string | null) => {
    if (!rec) return 'bg-muted text-muted-foreground';
    if (rec.includes('YES')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (rec.includes('NO')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  return (
    <Card className="flex flex-col max-h-[calc(100vh-200px)]">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="w-4 h-4" />
          {t('agents.predictionHistory')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
        <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
          <div className="p-4 space-y-3">
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))
            ) : predictions?.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Brain className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-center">{t('agents.noPredictions')}</p>
                <p className="text-sm text-center mt-2">{t('agents.startAnalyzing')}</p>
              </div>
            ) : (
              predictions?.map((prediction) => (
                <div
                  key={prediction.id}
                  className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getRecommendationIcon(prediction.recommendation)}
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getRecommendationColor(prediction.recommendation)}`}
                      >
                        {prediction.recommendation || 'HOLD'}
                      </Badge>
                      {prediction.confidence && (
                        <span className="text-xs text-muted-foreground">
                          {prediction.confidence}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <FreshnessBadge date={prediction.created_at} compact />
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(prediction.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  {/* Market Question */}
                  <p className="text-sm font-medium line-clamp-2 mb-2">
                    {prediction.market_question || 'Unknown market'}
                  </p>

                  {/* Analysis Preview */}
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {prediction.analysis}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      {prediction.model_used?.split('/')[1] || 'AI'}
                    </span>
                    {prediction.tokens_used && (
                      <span className="text-xs text-muted-foreground">
                        {prediction.tokens_used} tokens
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
