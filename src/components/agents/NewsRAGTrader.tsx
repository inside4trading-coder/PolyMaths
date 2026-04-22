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
  Newspaper, 
  TrendingUp, 
  TrendingDown,
  Minus,
  Zap,
  RefreshCw, 
  Loader2,
  Database,
  Brain,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface RAGSignal {
  id: string;
  market_id: string;
  market_question: string;
  signal_type: string;
  confidence: number;
  reasoning: string;
  current_price: number;
  suggested_price: number;
  created_at: string;
}

interface NewsItem {
  title: string;
  content: string;
  source: string;
  url?: string;
  published_date?: string;
  sentiment: string;
  relevance_score?: number;
}

interface AnalysisResult {
  success: boolean;
  signal: string;
  confidence: number;
  reasoning: string;
  suggestedPrice: number;
  fairValue?: number;
  keyDrivers?: string[];
  risks?: string[];
  newsCount: number;
  news: NewsItem[];
  summary?: string;
  keyFacts?: string[];
  sentimentDistribution?: {
    positive: number;
    negative: number;
    neutral: number;
  };
  sourcesUsed?: number;
}

export function NewsRAGTrader() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Fetch markets
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ['markets-for-rag'],
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
    queryKey: ['tokens-for-rag', markets?.map(m => m.id)],
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

  // Fetch RAG signals history
  const { data: signalsHistory, isLoading: signalsLoading } = useQuery({
    queryKey: ['rag-signals-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rag_signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as RAGSignal[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('rag-signals-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rag_signals',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['rag-signals-history'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Analyze market mutation
  const analyzeMarket = useMutation({
    mutationFn: async (market: any) => {
      const { data, error } = await supabase.functions.invoke('rag-news-signals', {
        body: {
          action: 'analyze_market',
          market: {
            id: market.id,
            question: market.question,
            category: market.category,
            currentPrice: tokens?.[market.id] || 0.5,
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ['rag-signals-history'] });
      toast({
        title: 'RAG Analysis Complete',
        description: `Signal: ${data.signal} (${data.confidence}% confidence)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Scan all markets
  const scanMarkets = useMutation({
    mutationFn: async () => {
      if (!markets?.length) throw new Error('No markets available');
      
      const marketsWithPrices = markets.slice(0, 5).map(m => ({
        ...m,
        currentPrice: tokens?.[m.id] || 0.5,
      }));

      const { data, error } = await supabase.functions.invoke('rag-news-signals', {
        body: {
          action: 'scan_markets',
          markets: marketsWithPrices,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rag-signals-history'] });
      toast({
        title: 'Scan Complete',
        description: `Analyzed ${data.marketsScanned} markets`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Scan Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const selectedMarket = markets?.find(m => m.id === selectedMarketId);

  const getSignalIcon = (signal: string) => {
    if (signal.includes('YES')) return <TrendingUp className="w-4 h-4" />;
    if (signal.includes('NO')) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getSignalColor = (signal: string) => {
    if (signal === 'STRONG_YES') return 'bg-green-500/30 text-green-300 border-green-500/50';
    if (signal === 'YES') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (signal === 'STRONG_NO') return 'bg-red-500/30 text-red-300 border-red-500/50';
    if (signal === 'NO') return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'positive') return 'text-green-400';
    if (sentiment === 'negative') return 'text-red-400';
    return 'text-yellow-400';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0">
      {/* Markets Selection */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4" />
              RAG Markets
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scanMarkets.mutate()}
              disabled={scanMarkets.isPending || !markets?.length}
            >
              {scanMarkets.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
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

      {/* RAG Analysis */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4" />
              News RAG Analysis
            </CardTitle>
            {selectedMarket && (
              <Button
                size="sm"
                onClick={() => analyzeMarket.mutate(selectedMarket)}
                disabled={analyzeMarket.isPending}
              >
                {analyzeMarket.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Analyze
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4">
              {!selectedMarket ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Database className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-center text-sm">
                    Select a market to analyze with RAG
                  </p>
                </div>
              ) : analyzeMarket.isPending ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                  <p className="text-muted-foreground text-sm">Fetching news & generating signal...</p>
                </div>
              ) : analysisResult ? (
                <div className="space-y-4">
                  {/* Signal Card */}
                  <div className="p-4 rounded-lg bg-accent/30 border border-border">
                    <h4 className="font-medium mb-3 line-clamp-2">{selectedMarket.question}</h4>
                    
                    <div className="flex items-center gap-3 mb-4">
                      <Badge className={`text-sm px-3 py-1 ${getSignalColor(analysisResult.signal)}`}>
                        {getSignalIcon(analysisResult.signal)}
                        <span className="ml-1">{analysisResult.signal}</span>
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {analysisResult.confidence}% confidence
                      </span>
                    </div>

                    {/* Price Comparison */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="p-2 rounded bg-background/50">
                        <p className="text-xs text-muted-foreground">Current</p>
                        <p className="text-lg font-mono">
                          {((tokens?.[selectedMarket.id] || 0.5) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-2 rounded bg-background/50">
                        <p className="text-xs text-muted-foreground">Fair Value</p>
                        <p className="text-lg font-mono text-primary">
                          {((analysisResult.fairValue || analysisResult.suggestedPrice) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-2 rounded bg-background/50">
                        <p className="text-xs text-muted-foreground">Suggested</p>
                        <p className="text-lg font-mono flex items-center gap-1">
                          {(analysisResult.suggestedPrice * 100).toFixed(1)}%
                          {analysisResult.suggestedPrice > (tokens?.[selectedMarket.id] || 0.5) ? (
                            <ArrowUpRight className="w-4 h-4 text-green-400" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-red-400" />
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Confidence Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Confidence</span>
                        <span>{analysisResult.confidence}%</span>
                      </div>
                      <Progress value={analysisResult.confidence} className="h-2" />
                    </div>

                    {/* Reasoning */}
                    <div className="text-sm text-muted-foreground mb-3">
                      <p>{analysisResult.reasoning}</p>
                    </div>

                    {/* Key Drivers & Risks */}
                    {(analysisResult.keyDrivers?.length || analysisResult.risks?.length) ? (
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {analysisResult.keyDrivers?.length ? (
                          <div>
                            <p className="text-muted-foreground mb-1 font-medium">Key Drivers:</p>
                            <ul className="list-disc list-inside text-green-400/80 space-y-0.5">
                              {analysisResult.keyDrivers.map((d, i) => (
                                <li key={i} className="line-clamp-1">{d}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {analysisResult.risks?.length ? (
                          <div>
                            <p className="text-muted-foreground mb-1 font-medium">Risks:</p>
                            <ul className="list-disc list-inside text-red-400/80 space-y-0.5">
                              {analysisResult.risks.map((r, i) => (
                                <li key={i} className="line-clamp-1">{r}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Summary & Key Facts */}
                  {analysisResult.summary && (
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        RAG Summary
                      </h5>
                      <p className="text-xs text-muted-foreground mb-2">{analysisResult.summary}</p>
                      {analysisResult.keyFacts?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {analysisResult.keyFacts.map((fact, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {fact}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Sentiment Distribution */}
                  {analysisResult.sentimentDistribution && (
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <h5 className="text-sm font-medium mb-2">Sentiment Distribution</h5>
                      <div className="flex gap-2 h-3 rounded-full overflow-hidden">
                        <div 
                          className="bg-green-500 transition-all" 
                          style={{ width: `${(analysisResult.sentimentDistribution.positive || 0) * 100}%` }}
                        />
                        <div 
                          className="bg-yellow-500 transition-all" 
                          style={{ width: `${(analysisResult.sentimentDistribution.neutral || 0) * 100}%` }}
                        />
                        <div 
                          className="bg-red-500 transition-all" 
                          style={{ width: `${(analysisResult.sentimentDistribution.negative || 0) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span className="text-green-400">
                          +{((analysisResult.sentimentDistribution.positive || 0) * 100).toFixed(0)}%
                        </span>
                        <span className="text-yellow-400">
                          ~{((analysisResult.sentimentDistribution.neutral || 0) * 100).toFixed(0)}%
                        </span>
                        <span className="text-red-400">
                          -{((analysisResult.sentimentDistribution.negative || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* News Sources */}
                  {analysisResult.news?.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium flex items-center gap-2">
                        <Newspaper className="w-4 h-4" />
                        News Sources ({analysisResult.newsCount})
                      </h5>
                      <div className="space-y-2">
                        {analysisResult.news.map((item: NewsItem, i: number) => (
                          <div key={i} className="p-3 rounded-lg bg-card border border-border">
                            <div className="flex items-start justify-between mb-1">
                              <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                              <div className="flex items-center gap-1">
                                {item.relevance_score && (
                                  <span className="text-xs text-muted-foreground">
                                    {(item.relevance_score * 100).toFixed(0)}%
                                  </span>
                                )}
                                <Badge variant="outline" className={`text-xs ${getSentimentColor(item.sentiment)}`}>
                                  {item.sentiment}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                              {item.content}
                            </p>
                            <div className="flex items-center justify-between text-xs text-muted-foreground/60">
                              <span>{item.source}</span>
                              {item.published_date && (
                                <span>{item.published_date}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-accent/30 border border-border">
                  <h4 className="font-medium mb-2">{selectedMarket.question}</h4>
                  <p className="text-sm text-muted-foreground">
                    Click Analyze to fetch news and generate RAG-based trading signal
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Signals History */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4" />
            RAG Signals History
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4 space-y-3">
              {signalsLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              ) : !signalsHistory?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No signals yet</p>
                </div>
              ) : (
                signalsHistory.map((signal) => (
                  <div
                    key={signal.id}
                    className="p-3 rounded-lg bg-card border border-border"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <Badge className={`text-xs ${getSignalColor(signal.signal_type)}`}>
                        {getSignalIcon(signal.signal_type)}
                        <span className="ml-1">{signal.signal_type}</span>
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 mb-1">
                      {signal.market_question}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{signal.confidence}% conf</span>
                      <span>
                        {(signal.current_price * 100).toFixed(0)}% → {(signal.suggested_price * 100).toFixed(0)}%
                      </span>
                    </div>
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
