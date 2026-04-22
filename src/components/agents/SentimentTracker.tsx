import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Newspaper, 
  RefreshCw, 
  Loader2,
  ExternalLink,
  Clock,
  BarChart3
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { FreshnessBadge } from '@/components/common/FreshnessBadge';

interface SentimentData {
  id: string;
  market_id: string;
  market_question: string;
  sentiment_score: number;
  sentiment_label: 'bullish' | 'bearish' | 'neutral';
  news_summary: string;
  sources: string[];
  price_at_analysis: number;
  analyzed_at: string;
}

export function SentimentTracker() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  // Fetch markets for selection
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ['markets-for-sentiment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id, question, category, volume_24h')
        .eq('closed', false)
        .gt('end_date', new Date().toISOString())
        .order('volume_24h', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  // Fetch tokens for prices
  const { data: tokens } = useQuery({
    queryKey: ['tokens-for-sentiment', markets?.map(m => m.id)],
    queryFn: async () => {
      if (!markets?.length) return {};
      const { data, error } = await supabase
        .from('tokens')
        .select('market_id, outcome, price')
        .in('market_id', markets.map(m => m.id));
      if (error) throw error;
      
      const priceMap: Record<string, number> = {};
      data?.forEach(token => {
        if (token.outcome?.toLowerCase() === 'yes' && token.price) {
          priceMap[token.market_id] = token.price;
        }
      });
      return priceMap;
    },
    enabled: !!markets?.length,
  });

  // Fetch sentiment history
  const { data: sentimentHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['sentiment-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_sentiment')
        .select('*')
        .order('analyzed_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as SentimentData[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('sentiment-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'market_sentiment',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['sentiment-history'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Analyze sentiment mutation
  const analyzeSentiment = useMutation({
    mutationFn: async (market: any) => {
      const { data, error } = await supabase.functions.invoke('sentiment-tracker', {
        body: {
          action: 'analyze_sentiment',
          market: {
            id: market.id,
            question: market.question,
            category: market.category,
            currentPrice: tokens?.[market.id],
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sentiment-history'] });
      toast({
        title: t('agents.sentimentAnalyzed'),
        description: `${t('agents.sentiment')}: ${data.sentimentLabel?.toUpperCase() || 'N/A'}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: t('agents.analysisError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Scan all markets for sentiment
  const scanAllSentiment = useMutation({
    mutationFn: async () => {
      if (!markets?.length) throw new Error('No markets available');
      
      const marketsWithPrices = markets.slice(0, 5).map(m => ({
        ...m,
        currentPrice: tokens?.[m.id],
      }));

      const { data, error } = await supabase.functions.invoke('sentiment-tracker', {
        body: {
          action: 'scan_sentiment',
          markets: marketsWithPrices,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sentiment-history'] });
      toast({
        title: t('agents.scanComplete'),
        description: `${t('agents.marketsScanned')}: ${data.marketsScanned}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: t('agents.scanError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getSentimentIcon = (label: string) => {
    switch (label) {
      case 'bullish':
        return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'bearish':
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getSentimentColor = (label: string) => {
    switch (label) {
      case 'bullish':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'bearish':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  const getSentimentProgress = (score: number) => {
    // Convert from -1..1 to 0..100
    return ((score + 1) / 2) * 100;
  };

  const selectedMarket = markets?.find(m => m.id === selectedMarketId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
      {/* Markets Selection */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Newspaper className="w-4 h-4" />
              {t('agents.selectMarket')}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scanAllSentiment.mutate()}
              disabled={scanAllSentiment.isPending || !markets?.length}
            >
              {scanAllSentiment.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4 space-y-2">
              {marketsLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : (
                markets?.map((market) => {
                  const isSelected = selectedMarketId === market.id;
                  const price = tokens?.[market.id];
                  
                  return (
                    <div
                      key={market.id}
                      onClick={() => setSelectedMarketId(market.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-primary/10 border-primary' 
                          : 'bg-card hover:bg-accent/50 border-border'
                      }`}
                    >
                      <p className="text-sm font-medium line-clamp-2 mb-1">
                        {market.question}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {market.category || 'Other'}
                        </Badge>
                        {price && (
                          <span className="text-green-400">
                            {(price * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Current Sentiment Analysis */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {t('agents.sentimentAnalysis')}
            </CardTitle>
            {selectedMarket && (
              <Button
                size="sm"
                onClick={() => analyzeSentiment.mutate(selectedMarket)}
                disabled={analyzeSentiment.isPending}
              >
                {analyzeSentiment.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t('agents.analyze')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4">
          {!selectedMarket ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Newspaper className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-center text-sm">
                {t('agents.selectMarketToAnalyze')}
              </p>
            </div>
          ) : analyzeSentiment.isPending ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p className="text-muted-foreground text-sm">{t('agents.analyzingSentiment')}</p>
            </div>
          ) : analyzeSentiment.data ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-accent/30 border border-border">
                <h4 className="font-medium mb-2 line-clamp-2">{selectedMarket.question}</h4>
                
                {/* Sentiment Badge */}
                <div className="flex items-center gap-3 mb-4">
                  <Badge className={`text-sm px-3 py-1 ${getSentimentColor(analyzeSentiment.data.sentimentLabel)}`}>
                    {getSentimentIcon(analyzeSentiment.data.sentimentLabel)}
                    <span className="ml-1">{analyzeSentiment.data.sentimentLabel?.toUpperCase()}</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Score: {(analyzeSentiment.data.sentimentScore * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Sentiment Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Bearish</span>
                    <span>Neutral</span>
                    <span>Bullish</span>
                  </div>
                  <Progress 
                    value={getSentimentProgress(analyzeSentiment.data.sentimentScore)} 
                    className="h-2"
                  />
                </div>
              </div>

              {/* News Summary */}
              <div className="space-y-2">
                <h5 className="text-sm font-medium">{t('agents.newsSummary')}</h5>
                <div className="prose prose-sm prose-invert max-w-none">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {analyzeSentiment.data.newsSummary}
                  </p>
                </div>
              </div>

              {/* Sources */}
              {analyzeSentiment.data.sources?.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">{t('agents.sources')}</h5>
                  <div className="space-y-1">
                    {analyzeSentiment.data.sources.slice(0, 3).map((source: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate">{source}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-accent/30 border border-border">
                <h4 className="font-medium mb-2">{selectedMarket.question}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('agents.clickAnalyzeSentiment')}
                </p>
              </div>
            </div>
          )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Sentiment History */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {t('agents.sentimentHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4 space-y-3">
              {historyLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              ) : !sentimentHistory?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">{t('agents.noSentimentHistory')}</p>
                </div>
              ) : (
                sentimentHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-card border border-border"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${getSentimentColor(item.sentiment_label)}`}>
                          {getSentimentIcon(item.sentiment_label)}
                          <span className="ml-1">{item.sentiment_label?.toUpperCase()}</span>
                        </Badge>
                        <FreshnessBadge date={item.analyzed_at} compact />
                      </div>
                      <span className="text-xs text-muted-foreground hidden">
                        {formatDistanceToNow(new Date(item.analyzed_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 mb-1">
                      {item.market_question}
                    </p>
                    {item.news_summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.news_summary}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
