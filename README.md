*[Versión en español](README.es.md)*

# PolyMath 🧠📈

**PolyMath** is an algorithmic trading terminal for **Polymarket** prediction markets. It combines real-time order-flow analytics, influential-wallet tracking ("smart money"), and an automatic order-execution bot driven by signals, all using real on-chain data.

**Production:** https://poly-maths.vercel.app

Built by **[Inside4Trading](https://twitter.com/Inside4Trading)**.

> ⚠️ Trading analysis and execution tool — not financial advice. Using the automatic execution bot involves real capital risk.

---

## What it does

### Market terminal

- **Market Radar** — active-market discovery panel for Polymarket.
- **Market Detail** — deep view of an individual market.
- **Dual Orderbook** — real-time bid/ask order book over WebSocket, with a depth chart (`DepthChart`).
- **3D order-flow hero** — 4,500 particles following pseudo-curl flows in the brand palette using Three.js; paused outside the viewport.

### Wallet Intelligence

- **On-chain wallet activity tracking** (`useWalletOnChainActivity`).
- Historical **win rates and sparklines** per wallet (`useWalletWinRates`, `useWalletSparklines`).
- Smart-money identification based on wallets with a record of successful calls.

### Trading Bot

- **Bot Builder** — configure strategies and entry/exit rules.
- **Bot Monitor** — live feed, equity curve, session summary, open-positions panel, and status strip.
- **Real order execution** through dedicated edge functions — the bot is not only a simulation.
- **AI Agents** (`AgentsView`) — configuration and automated agent-data cleanup.

### Signals

- **News RAG** to generate trading signals from events.
- **Sentiment tracker** for market-sentiment analysis.

---

## Architecture

### Supabase Edge Functions

| Function | Purpose |
|---|---|
| `polymarket-clob` | Polymarket Central Limit Order Book client |
| `polymarket-data` | General market data |
| `polymarket-subgraph` | On-chain queries through the subgraph |
| `polymarket-agents` | AI-agent backend |
| `sync-markets` / `sync-market-detail` / `sync-tokens` | Periodic market and token synchronization |
| `backfill-markets` | Historical market loading |
| `bot-signal-scanner` | Scans entry conditions according to the configured strategy |
| `bot-order-executor` | **Executes real orders** on Polymarket when a signal fires |
| `bot-position-updater` | Updates open-position status |
| `bot-backfill-session` | Rebuilds a bot-session history |
| `rag-news-signals` | Generates news-based signals through RAG |
| `sentiment-tracker` | Aggregated market sentiment |
| `health-check` / `maintenance-cron` | System health and scheduled maintenance |

### Data hooks

| Hook | Purpose |
|---|---|
| `usePolymarket.ts` | Central Polymarket data hook (74 KB — the repository's largest file) |
| `useOrderbook.ts` / `useOrderbookWebSocket.ts` | Real-time order book |
| `useWalletOnChainActivity.ts` | On-chain activity for a wallet (10.5 KB) |
| `useWalletWinRates.ts` / `useWalletSparklines.ts` | Historical wallet metrics |
| `useAgentConfig.ts` / `useAgentDataCleanup.ts` | AI-agent configuration and cleanup |
| `useAutoSync.ts` | Automatic data synchronization |
| `useMarketNameResolver.ts` | Resolves market IDs to readable names |
| `useWatchlistAutoRefresh.ts` | Automatic watchlist refresh |
| `useRealtimeData.ts` | Supabase realtime subscriptions |

### Folder structure

```text
src/
├── pages/
│   ├── Landing.tsx      # Public landing page with 3D hero
│   ├── Index.tsx        # Main authenticated terminal
│   ├── Auth.tsx         # Login/registration
│   └── Pricing.tsx      # Plans
├── components/
│   ├── views/
│   │   ├── MarketRadar.tsx    # Market discovery
│   │   ├── MarketDetail.tsx   # Market detail
│   │   ├── WalletIntel.tsx    # Wallet Intelligence (29 KB)
│   │   ├── BotBuilder.tsx     # Strategy configuration (34 KB — largest view)
│   │   ├── BotMonitor.tsx     # Live bot monitoring
│   │   ├── AgentsView.tsx     # AI agents
│   │   └── SettingsView.tsx
│   ├── bot/                    # CommandBar, EquityCurve, LiveFeed, PositionsPanel, PortfolioSummary, SessionSummary, StatusStrip, WalletSparkline
│   ├── market/                 # DualOrderbook, DepthChart, Orderbook
│   ├── wallet/
│   ├── agents/
│   ├── auth/
│   ├── landing/                # 3D order-flow hero and marketing sections
│   ├── layout/
│   ├── common/
│   └── ui/                     # shadcn primitives
├── hooks/                      # See table above
└── integrations/supabase/

supabase/
├── functions/                  # 16 edge functions — see table above
└── migrations/                 # 44 migrations (January → April 2026)
```

---

## Technical stack

```text
Frontend      React + TypeScript + Vite
3D            Three.js + @react-three/fiber v8 + drei
Animation     Framer Motion
Charts        Recharts (equity curve, depth chart, sparklines)
State/Data    React Query + React Router
Backend/DB    Supabase (Postgres, Auth, Edge Functions, Realtime)
Trading       Polymarket CLOB API + on-chain Subgraph
Deploy        Vercel
UI            shadcn/ui + Tailwind CSS
```

---

## Local development

### Requirements

Node.js and npm installed.

### Installation

```bash
git clone <REPOSITORY_URL>
cd PolyMaths
npm install
npm run dev      # http://localhost:5173
```

### Production build

```bash
npm run build
```

Supabase environment variables and Polymarket CLOB API credentials are required for the bot to operate in live mode.

---

## Community

Follow **Inside4Trading** for updates, market insights, and new-feature announcements.