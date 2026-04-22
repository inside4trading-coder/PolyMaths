import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Target, 
  TrendingUp, 
  TrendingDown,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Minus,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MarketForecast {
  market_id: string;
  question: string;
  category: string;
  currentPrice: number;
  fairValue: number;
  deviation: number;
  signal: 'UNDERVALUED' | 'OVERVALUED' | 'FAIR';
  confidence: number;
  lastUpdated: string;
}

export function SuperforecasterView() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  // Fetch markets with tokens
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ['markets-for-superforecaster'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id, question, category, volume_24h, liquidity')
        .eq('closed', false)
        .gt('end_date', new Date().toISOString())
        .order('volume_24h', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Fetch token prices
  const { data: tokens } = useQuery({
    queryKey: ['tokens-for-superforecaster', markets?.map(m => m.id)],
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

  // Fetch existing RAG signals for fair value
  const { data: ragSignals } = useQuery({
    queryKey: ['rag-signals-for-superforecaster'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rag_signals')
        .select('market_id, suggested_price, confidence, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Get latest signal per market
      const latestSignals: Record<string, { suggestedPrice: number; confidence: number; createdAt: string }> = {};
      data?.forEach(signal => {
        if (!latestSignals[signal.market_id]) {
          latestSignals[signal.market_id] = {
            suggestedPrice: signal.suggested_price || 0.5,
            confidence: signal.confidence || 50,
            createdAt: signal.created_at,
          };
        }
      });
      return latestSignals;
    },
  });

  // Calculate forecasts
  const forecasts: MarketForecast[] = markets?.map(market => {
    const currentPrice = tokens?.[market.id] || 0.5;
    const ragData = ragSignals?.[market.id];
    const fairValue = ragData?.suggestedPrice || currentPrice;
    const deviation = ((currentPrice - fairValue) / fairValue) * 100;
    
    let signal: 'UNDERVALUED' | 'OVERVALUED' | 'FAIR' = 'FAIR';
    if (deviation < -10) signal = 'UNDERVALUED';
    else if (deviation > 10) signal = 'OVERVALUED';

    return {
      market_id: market.id,
      question: market.question,
      category: market.category || 'Other',
      currentPrice,
      fairValue,
      deviation,
      signal,
      confidence: ragData?.confidence || 0,
      lastUpdated: ragData?.createdAt || '',
    };
  }) || [];

  // Sort by absolute deviation
  const sortedForecasts = [...forecasts].sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  
  // Opportunities (high deviation + high confidence)
  const opportunities = sortedForecasts
    .filter(f => Math.abs(f.deviation) > 10 && f.confidence > 60)
    .slice(0, 5);

  // Generate forecast mutation
  const generateForecast = useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rag-signals-for-superforecaster'] });
      toast({
        title: 'Forecast Generated',
        description: 'Fair value has been updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const selectedForecast = forecasts.find(f => f.market_id === selectedMarketId);

  const getSignalBadge = (signal: string, deviation: number) => {
    if (signal === 'UNDERVALUED') {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
          <ArrowUp className="w-3 h-3" />
          Undervalued {Math.abs(deviation).toFixed(0)}%
        </Badge>
      );
    }
    if (signal === 'OVERVALUED') {
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
          <ArrowDown className="w-3 h-3" />
          Overvalued {Math.abs(deviation).toFixed(0)}%
        </Badge>
      );
    }
    return (
      <Badge className="bg-muted text-muted-foreground gap-1">
        <Minus className="w-3 h-3" />
        Fair Value
      </Badge>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0">
      {/* Top Opportunities */}
      <div className="lg:col-span-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Top Mispriced Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No significant mispricings detected. Generate forecasts to find opportunities.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {opportunities.map((opp) => (
                  <div
                    key={opp.market_id}
                    onClick={() => setSelectedMarketId(opp.market_id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedMarketId === opp.market_id
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card hover:bg-accent/50 border-border'
                    }`}
                  >
                    <p className="text-xs font-medium line-clamp-2 mb-2 h-8">
                      {opp.question}
                    </p>
                    <div className="flex flex-col gap-1">
                      {getSignalBadge(opp.signal, opp.deviation)}
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Conf: {opp.confidence}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Markets List */}
      <Card className="lg:col-span-2 flex flex-col max-h-[calc(100vh-380px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Market Forecasts
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-460px)]">
            <div className="p-4 space-y-2">
              {marketsLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              ) : (
                sortedForecasts.map((forecast) => {
                  const isSelected = selectedMarketId === forecast.market_id;
                  const hasData = forecast.confidence > 0;

                  return (
                    <div
                      key={forecast.market_id}
                      onClick={() => setSelectedMarketId(forecast.market_id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'bg-card hover:bg-accent/50 border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium line-clamp-2 flex-1">
                          {forecast.question}
                        </p>
                        {hasData ? (
                          getSignalBadge(forecast.signal, forecast.deviation)
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            No forecast
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Current</p>
                          <p className="font-mono font-medium">
                            {(forecast.currentPrice * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Fair Value</p>
                          <p className={`font-mono font-medium ${hasData ? 'text-primary' : 'text-muted-foreground'}`}>
                            {hasData ? `${(forecast.fairValue * 100).toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Deviation</p>
                          <p className={`font-mono font-medium ${
                            forecast.deviation > 0 ? 'text-red-400' : 
                            forecast.deviation < 0 ? 'text-green-400' : ''
                          }`}>
                            {hasData ? `${forecast.deviation > 0 ? '+' : ''}${forecast.deviation.toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Confidence</p>
                          <p className="font-medium">
                            {hasData ? `${forecast.confidence}%` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Forecast Detail */}
      <Card className="flex flex-col max-h-[calc(100vh-380px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              Forecast Detail
            </CardTitle>
            {selectedForecast && (
              <Button
                size="sm"
                onClick={() => {
                  const market = markets?.find(m => m.id === selectedMarketId);
                  if (market) generateForecast.mutate(market);
                }}
                disabled={generateForecast.isPending}
              >
                {generateForecast.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Update
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-460px)]">
            <div className="p-4">
              {!selectedForecast ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                  <Target className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-center text-sm">
                    Select a market to view forecast details
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Market Question */}
                  <div className="p-3 rounded-lg bg-accent/30 border border-border">
                    <Badge variant="outline" className="text-xs mb-2">
                      {selectedForecast.category}
                    </Badge>
                    <p className="text-sm font-medium">{selectedForecast.question}</p>
                  </div>

                  {/* Visual Gauge */}
                  <div className="p-4 rounded-lg bg-card border border-border">
                    <p className="text-xs text-muted-foreground mb-3 text-center">
                      Price vs Fair Value
                    </p>
                    
                    {/* Price Bar Visualization */}
                    <div className="relative h-8 bg-muted rounded-full overflow-hidden mb-2">
                      {/* Fair Value Marker */}
                      <div 
                        className="absolute top-0 bottom-0 w-1 bg-primary z-10"
                        style={{ left: `${selectedForecast.fairValue * 100}%` }}
                      />
                      
                      {/* Current Price Marker */}
                      <div 
                        className={`absolute top-1 bottom-1 w-4 h-6 rounded-full ${
                          selectedForecast.signal === 'UNDERVALUED' ? 'bg-green-500' :
                          selectedForecast.signal === 'OVERVALUED' ? 'bg-red-500' :
                          'bg-yellow-500'
                        }`}
                        style={{ left: `calc(${selectedForecast.currentPrice * 100}% - 8px)` }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-xs">
                      <span>0%</span>
                      <span className="text-muted-foreground">
                        <span className="inline-block w-2 h-2 bg-primary rounded-full mr-1" />
                        Fair Value
                      </span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-card border border-border text-center">
                      <p className="text-xs text-muted-foreground mb-1">Current Price</p>
                      <p className="text-2xl font-bold font-mono">
                        {(selectedForecast.currentPrice * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Fair Value</p>
                      <p className="text-2xl font-bold font-mono text-primary">
                        {selectedForecast.confidence > 0 
                          ? `${(selectedForecast.fairValue * 100).toFixed(1)}%`
                          : '—'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Deviation */}
                  {selectedForecast.confidence > 0 && (
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Deviation</span>
                        {getSignalBadge(selectedForecast.signal, selectedForecast.deviation)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={Math.min(Math.abs(selectedForecast.deviation), 50) * 2} 
                          className={`h-2 ${
                            selectedForecast.deviation < 0 ? '[&>div]:bg-green-500' : '[&>div]:bg-red-500'
                          }`}
                        />
                        <span className={`text-sm font-mono font-medium ${
                          selectedForecast.deviation < 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {selectedForecast.deviation > 0 ? '+' : ''}{selectedForecast.deviation.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Confidence */}
                  {selectedForecast.confidence > 0 && (
                    <div className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">AI Confidence</span>
                        <span>{selectedForecast.confidence}%</span>
                      </div>
                      <Progress value={selectedForecast.confidence} className="h-2" />
                    </div>
                  )}

                  {/* Action Recommendation */}
                  {selectedForecast.confidence > 0 && Math.abs(selectedForecast.deviation) > 10 && (
                    <div className={`p-3 rounded-lg border ${
                      selectedForecast.signal === 'UNDERVALUED'
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {selectedForecast.signal === 'UNDERVALUED' ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-sm font-medium">
                          {selectedForecast.signal === 'UNDERVALUED' ? 'Consider YES' : 'Consider NO'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Market is {selectedForecast.signal === 'UNDERVALUED' ? 'underpriced' : 'overpriced'} by {Math.abs(selectedForecast.deviation).toFixed(1)}% relative to AI fair value estimate.
                      </p>
                    </div>
                  )}

                  {/* No Data State */}
                  {selectedForecast.confidence === 0 && (
                    <div className="p-4 rounded-lg bg-muted/50 border border-border text-center">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">
                        No forecast available for this market
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          const market = markets?.find(m => m.id === selectedMarketId);
                          if (market) generateForecast.mutate(market);
                        }}
                        disabled={generateForecast.isPending}
                      >
                        {generateForecast.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Target className="w-4 h-4 mr-1" />
                        )}
                        Generate Forecast
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
