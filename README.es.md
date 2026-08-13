# PolyMath 🧠📈

**PolyMath** es un terminal de trading algorítmico para mercados de predicción de **Polymarket**: combina analítica de order flow en tiempo real, tracking de wallets influyentes ("smart money") y un bot de ejecución automática de órdenes basado en señales, todo con datos on-chain reales.

**Producción:** https://poly-maths.vercel.app

Construido por **[Inside4Trading](https://twitter.com/Inside4Trading)**.

> ⚠️ Herramienta de análisis y ejecución de trading — no es asesoría financiera. El uso del bot de ejecución automática implica riesgo real de capital.

---

## Qué hace

### Terminal de mercado

- **Market Radar** — panel de descubrimiento de mercados activos en Polymarket.
- **Market Detail** — vista profunda de un mercado individual.
- **Dual Orderbook** — order book en tiempo real (bid/ask) vía WebSocket, con gráfico de profundidad (`DepthChart`).
- **Hero 3D de order-flow** — 4.500 partículas siguiendo corrientes pseudo-curl en la paleta de marca (Three.js), pausado fuera de viewport.

### Wallet Intelligence

- **Tracking on-chain** de actividad de wallets (`useWalletOnChainActivity`).
- **Win rates y sparklines** históricos por wallet (`useWalletWinRates`, `useWalletSparklines`).
- Identificación de "smart money" — wallets con historial de aciertos.

### Trading Bot

- **Bot Builder** — configuración de estrategias y reglas de entrada/salida.
- **Bot Monitor** — feed en vivo, curva de equity, resumen de sesión, panel de posiciones abiertas y strip de estado.
- **Ejecución real de órdenes** vía edge functions dedicadas — el bot no es solo una simulación.
- **Agentes de IA** (`AgentsView`) — configuración y limpieza automática de datos de agentes.

### Señales

- **RAG sobre noticias** para generar señales de trading a partir de eventos.
- **Sentiment tracker** — análisis de sentimiento de mercado.

---

## Arquitectura

### Edge Functions (Supabase)

| Función | Propósito |
|---|---|
| `polymarket-clob` | Cliente del Central Limit Order Book de Polymarket |
| `polymarket-data` | Datos generales de mercados |
| `polymarket-subgraph` | Consultas on-chain vía subgraph |
| `polymarket-agents` | Backend de los agentes de IA |
| `sync-markets` / `sync-market-detail` / `sync-tokens` | Sincronización periódica de mercados y tokens |
| `backfill-markets` | Carga histórica de mercados |
| `bot-signal-scanner` | Escanea condiciones de entrada según la estrategia configurada |
| `bot-order-executor` | **Ejecuta órdenes reales** en Polymarket cuando se dispara una señal |
| `bot-position-updater` | Actualiza el estado de posiciones abiertas |
| `bot-backfill-session` | Reconstruye el histórico de una sesión del bot |
| `rag-news-signals` | Genera señales a partir de noticias vía RAG |
| `sentiment-tracker` | Sentimiento agregado de mercado |
| `health-check` / `maintenance-cron` | Salud del sistema y tareas de mantenimiento programadas |

### Hooks de datos

| Hook | Para qué |
|---|---|
| `usePolymarket.ts` | Hook central de datos de Polymarket (74 KB — el archivo más grande del repo) |
| `useOrderbook.ts` / `useOrderbookWebSocket.ts` | Order book en tiempo real |
| `useWalletOnChainActivity.ts` | Actividad on-chain de una wallet (10.5 KB) |
| `useWalletWinRates.ts` / `useWalletSparklines.ts` | Métricas históricas de wallets |
| `useAgentConfig.ts` / `useAgentDataCleanup.ts` | Configuración y limpieza de agentes de IA |
| `useAutoSync.ts` | Sincronización automática de datos |
| `useMarketNameResolver.ts` | Resuelve IDs de mercado a nombres legibles |
| `useWatchlistAutoRefresh.ts` | Refresco automático de la watchlist |
| `useRealtimeData.ts` | Suscripciones realtime de Supabase |

---

## Stack técnico

```text
Frontend      React + TypeScript + Vite
3D            Three.js + @react-three/fiber v8 + drei
Animación     Framer Motion
Gráficos      Recharts (equity curve, depth chart, sparklines)
Estado/Data   React Query + React Router
Backend/DB    Supabase (Postgres, Auth, Edge Functions, Realtime)
Trading       Polymarket CLOB API + Subgraph on-chain
Deploy        Vercel
UI            shadcn/ui + Tailwind CSS
```

---

## Desarrollo local

```bash
git clone <URL_DEL_REPOSITORIO>
cd PolyMaths
npm install
npm run dev      # http://localhost:5173
npm run build
```

Requiere variables de entorno de Supabase y credenciales de acceso a la API de Polymarket (CLOB) para que el bot pueda operar en real.

## Comunidad

Sigue a **Inside4Trading** para actualizaciones, insights de mercado y anuncios de nuevas funciones.