import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ExternalLink,
  DollarSign,
  BarChart3,
  Crown,
  Medal,
  Award,
  Twitter,
  CheckCircle2,
  Loader2,
  Users
} from 'lucide-react';

interface LeaderboardTrader {
  rank: string;
  proxyWallet: string;
  userName: string;
  vol: number;
  pnl: number;
  profileImage: string;
  xUsername: string;
  verifiedBadge: boolean;
}

type TimePeriod = 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
type OrderBy = 'PNL' | 'VOL';
type Category = 'OVERALL' | 'POLITICS' | 'SPORTS' | 'CRYPTO' | 'CULTURE';

const TIME_PERIOD_OPTIONS: { label: string; value: TimePeriod }[] = [
  { label: 'Today', value: 'DAY' },
  { label: 'Week', value: 'WEEK' },
  { label: 'Month', value: 'MONTH' },
  { label: 'All Time', value: 'ALL' },
];

const CATEGORY_OPTIONS: { label: string; value: Category }[] = [
  { label: 'All', value: 'OVERALL' },
  { label: 'Politics', value: 'POLITICS' },
  { label: 'Sports', value: 'SPORTS' },
  { label: 'Crypto', value: 'CRYPTO' },
  { label: 'Culture', value: 'CULTURE' },
];

const ORDER_OPTIONS: { label: string; value: OrderBy; icon: React.ReactNode }[] = [
  { label: 'Profit', value: 'PNL', icon: <TrendingUp className="w-3 h-3" /> },
  { label: 'Volume', value: 'VOL', icon: <BarChart3 className="w-3 h-3" /> },
];

export function SmartMoneyLeaderboard() {
  const { t } = useLanguage();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('WEEK');
  const [orderBy, setOrderBy] = useState<OrderBy>('PNL');
  const [category, setCategory] = useState<Category>('OVERALL');
  const [selectedTrader, setSelectedTrader] = useState<LeaderboardTrader | null>(null);

  // Fetch leaderboard from Polymarket
  const { data: traders, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['polymarket-leaderboard', timePeriod, orderBy, category],
    queryFn: async () => {
      // Browser fetches to data-api.polymarket.com are blocked at the network
      // layer despite valid CORS headers. Proxy through the edge function.
      const { data, error } = await supabase.functions.invoke('polymarket-data', {
        body: {
          action: 'leaderboard',
          params: { timePeriod, orderBy, category, limit: 50 },
        },
      });
      if (error) throw error;
      const traders = (data?.data ?? data) as LeaderboardTrader[];
      return Array.isArray(traders) ? traders : [];
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
  });

  // Stats calculations
  const stats = useMemo(() => {
    if (!traders?.length) return { totalProfit: 0, totalVolume: 0, avgProfit: 0, tradersCount: 0 };
    
    const totalProfit = traders.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalVolume = traders.reduce((sum, t) => sum + (t.vol || 0), 0);
    const avgProfit = totalProfit / traders.length;
    
    return { totalProfit, totalVolume, avgProfit, tradersCount: traders.length };
  }, [traders]);

  const formatUSD = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) return `${value >= 0 ? '' : '-'}$${(absValue / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `${value >= 0 ? '' : '-'}$${(absValue / 1000).toFixed(1)}K`;
    return `${value >= 0 ? '' : '-'}$${absValue.toFixed(0)}`;
  };

  const formatAddress = (address: string) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-500/20 to-yellow-500/5 border-yellow-500/30';
    if (rank === 2) return 'bg-gradient-to-r from-gray-400/20 to-gray-400/5 border-gray-400/30';
    if (rank === 3) return 'bg-gradient-to-r from-amber-600/20 to-amber-600/5 border-amber-600/30';
    return 'bg-card hover:bg-accent/50 border-border';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0">
      {/* Stats Overview */}
      <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs">Top Traders</span>
            </div>
            <p className="text-2xl font-bold">{stats.tradersCount}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-400 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Total Profit</span>
            </div>
            <p className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatUSD(stats.totalProfit)}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs">Total Volume</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">{formatUSD(stats.totalVolume)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-purple-400 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Avg Profit</span>
            </div>
            <p className={`text-2xl font-bold ${stats.avgProfit >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
              {formatUSD(stats.avgProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="lg:col-span-2 flex flex-col max-h-[calc(100vh-320px)]">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Smart Money Leaderboard
            {isFetching && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </CardTitle>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mt-3">
            {/* Time Period */}
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              {TIME_PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={timePeriod === option.value ? 'secondary' : 'ghost'}
                  className="h-6 px-2 text-xs"
                  onClick={() => setTimePeriod(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            
            {/* Order By */}
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              {ORDER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={orderBy === option.value ? 'secondary' : 'ghost'}
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setOrderBy(option.value)}
                >
                  {option.icon}
                  {option.label}
                </Button>
              ))}
            </div>
            
            {/* Category */}
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              {CATEGORY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={category === option.value ? 'secondary' : 'ghost'}
                  className="h-6 px-2 text-xs"
                  onClick={() => setCategory(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[calc(100vh-450px)]">
            <div className="p-4 space-y-2">
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : !traders?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-2">No traders found</p>
                  <p className="text-xs">Try a different time period or category</p>
                </div>
              ) : (
                traders.map((trader) => {
                  const rank = parseInt(trader.rank) || 0;
                  const isPositive = trader.pnl >= 0;

                  return (
                    <div
                      key={trader.proxyWallet}
                      onClick={() => setSelectedTrader(trader)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedTrader?.proxyWallet === trader.proxyWallet
                          ? 'ring-2 ring-primary'
                          : ''
                      } ${getRankStyle(rank)}`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Rank */}
                        <div className="flex items-center justify-center w-8">
                          {getRankIcon(rank) || (
                            <span className="text-sm font-bold text-muted-foreground">
                              #{rank}
                            </span>
                          )}
                        </div>
                        
                        {/* Avatar & Name */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={trader.profileImage} alt={trader.userName} />
                            <AvatarFallback className="text-xs">
                              {trader.userName?.slice(0, 2).toUpperCase() || '??'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm truncate">
                                {trader.userName || formatAddress(trader.proxyWallet)}
                              </span>
                              {trader.verifiedBadge && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{formatAddress(trader.proxyWallet)}</span>
                              {trader.xUsername && (
                                <span className="flex items-center gap-0.5">
                                  <Twitter className="w-3 h-3" />
                                  @{trader.xUsername}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Stats */}
                        <div className="text-right shrink-0">
                          <div className={`font-bold text-sm flex items-center gap-1 justify-end ${
                            isPositive ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {isPositive ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {formatUSD(trader.pnl)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Vol: {formatUSD(trader.vol)}
                          </div>
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

      {/* Trader Detail Panel */}
      <Card className="flex flex-col max-h-[calc(100vh-320px)]">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Trader Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden">
          {!selectedTrader ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm mb-1">Select a trader</p>
              <p className="text-xs">Click on a trader to see details</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Profile Header */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedTrader.profileImage} alt={selectedTrader.userName} />
                  <AvatarFallback>
                    {selectedTrader.userName?.slice(0, 2).toUpperCase() || '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {selectedTrader.userName || 'Anonymous'}
                    </span>
                    {selectedTrader.verifiedBadge && (
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Rank #{selectedTrader.rank}</span>
                    {selectedTrader.xUsername && (
                      <a
                        href={`https://twitter.com/${selectedTrader.xUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Twitter className="w-3 h-3" />
                        @{selectedTrader.xUsername}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Profit/Loss</p>
                  <p className={`text-lg font-bold ${
                    selectedTrader.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatUSD(selectedTrader.pnl)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Volume</p>
                  <p className="text-lg font-bold">{formatUSD(selectedTrader.vol)}</p>
                </div>
              </div>

              {/* External Links */}
              <div className="space-y-2">
                <a
                  href={`https://polymarket.com/profile/${selectedTrader.proxyWallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <span className="text-sm">View on Polymarket</span>
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
                <a
                  href={`https://polygonscan.com/address/${selectedTrader.proxyWallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <span className="text-sm">View on PolygonScan</span>
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
              </div>

              {/* Wallet Address */}
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
                <p className="text-xs font-mono break-all">{selectedTrader.proxyWallet}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
