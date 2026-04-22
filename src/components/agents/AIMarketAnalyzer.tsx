import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Sparkles, TrendingUp, AlertCircle, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AgentConfig {
  id?: string;
  name: string;
  model: string;
  categories: string[];
  riskTolerance: string;
  analysisDepth: string;
}

interface AIMarketAnalyzerProps {
  config: AgentConfig;
}

interface AnalysisResult {
  success: boolean;
  analysis: string;
  recommendation?: string;
  confidence?: number;
  tokensUsed?: number;
}

export function AIMarketAnalyzer({ config }: AIMarketAnalyzerProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Fetch available markets
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ['markets-for-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id, question, category, volume_24h, liquidity, end_date')
        .eq('closed', false)
        .gt('end_date', new Date().toISOString())
        .order('volume_24h', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Fetch tokens for price data
  const { data: tokens } = useQuery({
    queryKey: ['tokens-for-agents', markets?.map(m => m.id)],
    queryFn: async () => {
      if (!markets || markets.length === 0) return {};
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
    enabled: !!markets && markets.length > 0,
  });

  // Analyze market mutation
  const analyzeMarket = useMutation({
    mutationFn: async (market: any) => {
      const { data, error } = await supabase.functions.invoke('polymarket-agents', {
        body: {
          action: 'analyze_market',
          market: {
            id: market.id,
            question: market.question,
            category: market.category,
            yesPrice: tokens?.[market.id],
            volume24h: market.volume_24h,
            liquidity: market.liquidity,
            endDate: market.end_date,
          },
          config,
        },
      });
      if (error) throw error;
      return data as AnalysisResult;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: t('agents.analysisComplete'),
        description: `${t('agents.recommendation')}: ${data.recommendation || 'HOLD'}`,
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

  // Scan opportunities mutation
  const scanOpportunities = useMutation({
    mutationFn: async () => {
      if (!markets) throw new Error('No markets available');
      
      const marketsWithPrices = markets.map(m => ({
        ...m,
        yesPrice: tokens?.[m.id],
      }));

      const { data, error } = await supabase.functions.invoke('polymarket-agents', {
        body: {
          action: 'scan_opportunities',
          markets: marketsWithPrices,
          config,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAnalysisResult({
        success: true,
        analysis: data.analysis,
        recommendation: 'SCAN COMPLETE',
      });
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

  const selectedMarket = markets?.find(m => m.id === selectedMarketId);

  const getRecommendationColor = (rec?: string) => {
    if (!rec) return 'bg-muted text-muted-foreground';
    if (rec.includes('YES')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (rec.includes('NO')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
      {/* Markets Panel */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4" />
              {t('agents.selectMarket')}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scanOpportunities.mutate()}
              disabled={scanOpportunities.isPending || !markets?.length}
            >
              {scanOpportunities.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {t('agents.scanAll')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4 space-y-2">
              {marketsLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))
              ) : markets?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('agents.noMarkets')}
                </div>
              ) : (
                markets?.map((market) => {
                  const yesPrice = tokens?.[market.id];
                  const isSelected = selectedMarketId === market.id;
                  
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
                      <p className="text-sm font-medium line-clamp-2 mb-2">
                        {market.question}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {market.category || 'Other'}
                        </Badge>
                        {yesPrice && (
                          <span className="text-green-400">
                            YES: {(yesPrice * 100).toFixed(0)}%
                          </span>
                        )}
                        {market.volume_24h && (
                          <span>
                            Vol: ${(market.volume_24h / 1000).toFixed(0)}K
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

      {/* Analysis Panel */}
      <Card className="flex flex-col max-h-[calc(100vh-200px)]">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4" />
              {t('agents.aiAnalysis')}
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
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {t('agents.analyze')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="p-4">
            {!selectedMarket && !analysisResult ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <Brain className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-center">
                  {t('agents.selectMarketToAnalyze')}
                </p>
              </div>
            ) : analyzeMarket.isPending ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                <p className="text-muted-foreground">{t('agents.analyzing')}</p>
              </div>
            ) : analysisResult ? (
              <div className="space-y-4">
                {/* Recommendation Badge */}
                {analysisResult.recommendation && (
                  <div className="flex items-center gap-3">
                    <Badge className={`text-sm px-3 py-1 ${getRecommendationColor(analysisResult.recommendation)}`}>
                      <TrendingUp className="w-4 h-4 mr-1" />
                      {analysisResult.recommendation}
                    </Badge>
                    {analysisResult.confidence && (
                      <span className="text-sm text-muted-foreground">
                        {analysisResult.confidence}% confidence
                      </span>
                    )}
                  </div>
                )}

                {/* Analysis Text */}
                <div className="prose prose-sm prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {analysisResult.analysis}
                  </div>
                </div>

                {/* Tokens Used */}
                {analysisResult.tokensUsed && (
                  <div className="text-xs text-muted-foreground pt-4 border-t border-border">
                    Tokens used: {analysisResult.tokensUsed}
                  </div>
                )}
              </div>
            ) : selectedMarket ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-accent/30 border border-border">
                  <h4 className="font-medium mb-2">{selectedMarket.question}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>Category: {selectedMarket.category || 'Other'}</div>
                    <div>Volume: ${selectedMarket.volume_24h?.toLocaleString() || 'N/A'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{t('agents.clickAnalyze')}</span>
                </div>
              </div>
            ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
