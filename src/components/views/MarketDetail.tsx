import { useMemo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getEffectiveLiquidityScore } from '@/lib/liquidityScore';
import { Badge } from '@/components/ui/badge';
import { PriceChange } from '@/components/common/PriceChange';
import {
  useMarket,
  useTokens,
  useTrades,
  useSyncMarketDetail,
  type Market,
  type Token,
  type Trade,
} from '@/hooks/usePolymarket';
import { DualOrderbook } from '@/components/market/DualOrderbook';
import { WalletDetailPanel } from '@/components/wallet/WalletDetailPanel';
import { formatCurrency, formatTimeAgo, formatAddress } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Star,
  Bell,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Activity,
  Loader2,
  Flame,
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MarketDetailProps {
  marketId: string | null;
}

function safePercent(numerator: number, denominator: number) {
  if (!denominator) return 50;
  return (numerator / denominator) * 100;
}

export function MarketDetail({ marketId }: MarketDetailProps) {
  const { t, translateOutcome, translateCategory } = useLanguage();
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [minTradeAmount, setMinTradeAmount] = useState<0 | 100 | 1000 | 10000>(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const marketQuery = useMarket(marketId || '');
  const tokensQuery = useTokens(marketId || '');
  const tradesQuery = useTrades(marketId || undefined, 500);
  const syncMarketDetail = useSyncMarketDetail();

  // On-demand sync when marketId changes
  useEffect(() => {
    if (marketId) {
      syncMarketDetail.mutate(marketId);
    }
  }, [marketId]);

  const market = marketQuery.data as Market | undefined;
  const tokens = (tokensQuery.data || []) as Token[];
  const trades = (tradesQuery.data || []) as Trade[];

  const isLoading = !!marketId && (marketQuery.isLoading || tokensQuery.isLoading || tradesQuery.isLoading);
  const isError = !!marketId && (marketQuery.isError || tokensQuery.isError || tradesQuery.isError);

  // Filter trades by minimum amount
  const filteredTrades = useMemo(() => {
    return trades
      .filter((t) => {
        const tradeValue = (t.size || 0) * (t.price || 1);
        return tradeValue >= minTradeAmount;
      })
      .sort((a, b) => {
        const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tsB - tsA; // Most recent first
      });
  }, [trades, minTradeAmount]);

  const netFlow = useMemo(() => {
    const yesBuys = filteredTrades
      .filter((t) => t.side === 'BUY' && (t.outcome || '').toLowerCase() === 'yes')
      .reduce((sum, t) => sum + (t.size || 0), 0);

    const noBuys = filteredTrades
      .filter((t) => t.side === 'BUY' && (t.outcome || '').toLowerCase() === 'no')
      .reduce((sum, t) => sum + (t.size || 0), 0);

    return { yesBuys, noBuys, net: yesBuys - noBuys, tradeCount: filteredTrades.length };
  }, [filteredTrades]);

  const amountFilterLabel = (amount: number) => {
    if (amount === 0) return 'All';
    if (amount >= 1000) return `$${amount / 1000}K+`;
    return `$${amount}+`;
  };

  if (!marketId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-semibold text-foreground">{t('marketDetail.selectMarket')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('marketDetail.goToRadar')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        {isLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('marketDetail.loadingMarket')}
          </div>
        ) : isError || !market ? (
          <div className="text-sm text-muted-foreground">{t('marketDetail.errorLoading')}</div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{translateCategory(market.category || t('common.unknown'))}</Badge>
                  <Badge variant={market.closed ? 'danger' : 'success'} pulse={!market.closed}>
                    {market.closed ? t('common.closed') : t('common.active')}
                  </Badge>
                </div>
                <h1 className="text-xl font-semibold text-foreground mb-2">{market.question}</h1>
                {market.description && (
                  <div className="relative">
                    <p className={cn(
                      "text-sm text-muted-foreground transition-all",
                      !isDescriptionExpanded && "line-clamp-2"
                    )}>
                      {market.description}
                    </p>
                    {market.description.length > 150 && (
                      <button
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors"
                      >
                        {isDescriptionExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            {t('common.showLess') || 'Ver menos'}
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            {t('common.showMore') || 'Ver más'}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className={cn(
                    'p-2 rounded-lg border transition-colors',
                    isFavorite ? 'bg-warning/20 border-warning text-warning' : 'border-border hover:bg-accent'
                  )}
                >
                  <Star className={cn('w-5 h-5', isFavorite && 'fill-current')} />
                </button>
                <button className="p-2 rounded-lg border border-border hover:bg-accent transition-colors">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                </button>
                <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Bot className="w-4 h-4" />
                  {t('marketDetail.addToBot')}
                </button>
              </div>
            </div>

            {/* Outcome price cards - compact display */}
            <div className="flex gap-3">
              {(tokens.length ? tokens : [{ id: 'na', outcome: 'N/A', price: null, change_24h: null, change_1h: null } as unknown as Token]).map(
                (token) => {
                  const isYes = (token.outcome || '').toLowerCase() === 'yes';
                  return (
                    <div
                      key={token.id}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-lg border bg-card transition-all',
                        isYes ? 'border-bull/30' : 'border-bear/30'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'text-xs font-medium',
                          isYes ? 'text-bull' : 'text-bear'
                        )}>{translateOutcome(token.outcome || 'N/A')}</span>
                        <PriceChange value={token.change_24h || 0} />
                      </div>
                      <div className="text-xl font-mono font-bold text-foreground">
                        {token.price != null ? `${(token.price * 100).toFixed(1)}¢` : '—'}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Dual Orderbook Panel */}
        <div className="w-[400px] border-r border-border p-4 flex flex-col overflow-auto">
          <DualOrderbook tokens={tokens} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{t('marketDetail.netFlow')}</h3>
                <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                  {([0, 100, 1000, 10000] as const).map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setMinTradeAmount(amount)}
                      className={cn(
                        'px-2 py-0.5 text-xs font-medium rounded transition-colors',
                        minTradeAmount === amount
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {amountFilterLabel(amount)}
                    </button>
                  ))}
                </div>
              </div>
              <span className={cn('flex items-center gap-1 text-sm font-mono font-medium', netFlow.net >= 0 ? 'text-bull' : 'text-bear')}>
                {netFlow.net >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {formatCurrency(Math.abs(netFlow.net))} {netFlow.net >= 0 ? translateOutcome('Yes') : translateOutcome('No')}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-bull transition-all" style={{ width: `${safePercent(netFlow.yesBuys, netFlow.yesBuys + netFlow.noBuys)}%` }} />
              <div className="h-full bg-bear transition-all" style={{ width: `${safePercent(netFlow.noBuys, netFlow.yesBuys + netFlow.noBuys)}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>{translateOutcome('Yes')} {formatCurrency(netFlow.yesBuys)}</span>
              <span>{translateOutcome('No')} {formatCurrency(netFlow.noBuys)} <span className="opacity-60">({netFlow.tradeCount} trades)</span></span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t('marketDetail.tradesHistory')}
                {minTradeAmount > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">({amountFilterLabel(minTradeAmount)})</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {syncMarketDetail.isPending && (
                  <span className="flex items-center gap-1.5 text-xs text-primary">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t('marketDetail.fetchingFresh')}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{filteredTrades.length} trades</span>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('marketDetail.loadingTrades')}
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
                {syncMarketDetail.isPending ? t('marketDetail.fetchingFresh') : t('marketDetail.noTradesInPeriod')}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTrades.map((trade) => {
                  const tradeValue = trade.size * (trade.price || 1);
                  const isWhale = tradeValue >= 10000;
                  const isBigTrade = tradeValue >= 1000 && !isWhale;
                  
                  return (
                    <div
                      key={trade.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border transition-colors',
                        isWhale 
                          ? 'bg-gradient-to-r from-warning/10 to-warning/5 border-warning/50 shadow-sm shadow-warning/20' 
                          : isBigTrade 
                            ? 'bg-primary/5 border-primary/30' 
                            : 'bg-card border-border hover:border-primary/30'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'p-1.5 rounded relative',
                          trade.side === 'BUY' ? 'bg-bull/20' : 'bg-bear/20'
                        )}>
                          {trade.side === 'BUY' ? (
                            <ArrowUpRight className="w-4 h-4 text-bull" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-bear" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-sm font-medium', trade.side === 'BUY' ? 'text-bull' : 'text-bear')}>
                              {trade.side === 'BUY' ? t('trade.buy') : t('trade.sell')} {translateOutcome(trade.outcome || '')}
                            </span>
                            <span className="text-xs text-muted-foreground">@ {(trade.price * 100).toFixed(1)}¢</span>
                            {isWhale && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/20 text-warning text-[10px] font-bold">
                                <Flame className="w-3 h-3" />
                                {t('trade.whale')}
                              </span>
                            )}
                            {isBigTrade && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold">
                                <Zap className="w-3 h-3" />
                                {t('trade.big')}
                              </span>
                            )}
                          </div>
                          {(() => {
                            const addr = trade.taker || trade.maker || trade.wallet_address;
                            return addr ? (
                              <button
                                onClick={() => setSelectedWallet(addr)}
                                className="text-xs font-mono text-muted-foreground hover:text-primary hover:underline transition-colors text-left"
                              >
                                {formatAddress(addr)}
                              </button>
                            ) : (
                              <span className="text-xs font-mono text-muted-foreground">—</span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-sm font-mono font-medium',
                          isWhale ? 'text-warning' : isBigTrade ? 'text-primary' : 'text-foreground'
                        )}>
                          {formatCurrency(trade.size)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {trade.timestamp ? formatTimeAgo(new Date(trade.timestamp).getTime()) : '—'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Market Stats Sidebar */}
        <div className="w-64 border-l border-border p-4 overflow-auto">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('marketDetail.marketStats')}</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <span className="text-xs text-muted-foreground">{t('marketDetail.24hVolume')}</span>
              <span className="text-sm font-mono text-foreground">{formatCurrency(market?.volume_24h || 0)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <span className="text-xs text-muted-foreground">{t('marketDetail.liquidity')}</span>
              <span className="text-sm font-mono text-foreground">{formatCurrency(market?.liquidity || 0)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                      {t('marketDetail.liquidityScore')}
                      <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">
                      <strong>0-30:</strong> Low liquidity - high slippage risk<br />
                      <strong>30-60:</strong> Moderate - acceptable for small trades<br />
                      <strong>60-80:</strong> Good - suitable for most trades<br />
                      <strong>80-100:</strong> Excellent - deep orderbook
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-sm font-mono text-foreground">{getEffectiveLiquidityScore(market)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border">
              <span className="text-xs text-muted-foreground">{t('marketDetail.endDate')}</span>
              <span className="text-sm font-mono text-foreground">
                {market?.end_date ? new Date(market.end_date).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Wallet Detail Panel */}
      {selectedWallet && (
        <WalletDetailPanel
          walletAddress={selectedWallet}
          onClose={() => setSelectedWallet(null)}
        />
      )}
    </div>
  );
}
