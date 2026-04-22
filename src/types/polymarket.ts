// Core Polymarket Types

export interface Market {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  outcomes: string[];
  tokens: Token[];
  volume: number;
  volume24h: number;
  liquidity: number;
  liquidityScore: number;
  endDate: string;
  closed: boolean;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface Token {
  tokenId: string;
  outcome: string;
  price: number;
  change1h: number;
  change24h: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
  cumulative: number;
}

export interface Orderbook {
  tokenId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  midPrice: number;
  timestamp: number;
}

export interface Trade {
  id: string;
  marketId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  timestamp: number;
  maker: string;
  taker: string;
  outcome: string;
}

export interface Wallet {
  address: string;
  proxyAddress?: string;
  label?: string;
  volume24h: number;
  volume7d: number;
  totalVolume: number;
  avgTradeSize: number;
  marketsTraded: number;
  winRate: number;
  pnl: number;
  unusualScore: number;
  lastActive: number;
  isWatched: boolean;
}

export interface WalletActivity {
  id: string;
  wallet: string;
  type: 'TRADE' | 'SPLIT' | 'MERGE' | 'REDEEM' | 'REWARD';
  marketId: string;
  marketQuestion: string;
  outcome: string;
  side?: 'BUY' | 'SELL';
  size: number;
  price?: number;
  timestamp: number;
  isUnusual: boolean;
  unusualReason?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  summary: string;
  publishedAt: number;
  relatedMarkets: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// Bot Types
export interface BotConfig {
  id: string;
  name: string;
  mode: 'paper' | 'live';
  status: 'running' | 'paused' | 'stopped';
  wallets: string[];
  categories: string[];
  signals: SignalRules;
  execution: ExecutionRules;
  risk: RiskRules;
  createdAt: number;
  updatedAt: number;
}

export interface SignalRules {
  minTradeSize: number;
  clusterTrigger: boolean;
  clusterMinTrades: number;
  clusterWindowMinutes: number;
  minLiquidityScore: number;
  maxSpread: number;
}

export interface ExecutionRules {
  onlyLimitOrders: boolean;
  entrySlices: number;
  repriceIfMidMoves: number;
  maxSlippage: number;
}

export interface RiskRules {
  maxPositionPerMarket: number;
  maxTotalExposure: number;
  dailyLossLimit: number;
  cooldownMinutes: number;
  noTradeNearResolution: boolean;
  resolutionBufferHours: number;
  blocklist: string[];
}

export interface BotPosition {
  id: string;
  marketId: string;
  marketQuestion: string;
  tokenId: string;
  outcome: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: number;
  triggeredBy: string;
  reasons: string[];
}

export interface BotOrder {
  id: string;
  marketId: string;
  tokenId: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  status: 'pending' | 'filled' | 'partial' | 'cancelled';
  filledSize: number;
  filledPrice?: number;
  createdAt: number;
  updatedAt: number;
  reasons: string[];
}

export interface BotEvent {
  id: string;
  type: 'signal' | 'order' | 'fill' | 'cancel' | 'risk' | 'error';
  timestamp: number;
  message: string;
  details: Record<string, any>;
  reasons: string[];
}

// Metrics
export interface MarketMetrics {
  marketId: string;
  timestamp: number;
  price: number;
  volume1h: number;
  volume24h: number;
  trades1h: number;
  trades24h: number;
  liquidityScore: number;
  spread: number;
  netFlow1h: number;
  netFlow24h: number;
}
