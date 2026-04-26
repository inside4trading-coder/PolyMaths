## Diagnóstico

Los 3 indicadores rojos en **Polymarket API Connectivity** ("Data API / Gamma API / CLOB API → Offline") son una **falsa alarma de CORS**, no una caída real. Lo verifiqué desde el servidor:

| Endpoint | Resultado servidor | Resultado navegador |
|---|---|---|
| `gamma-api.polymarket.com/markets` | **200 OK** | ❌ bloqueado (sin cabeceras CORS) |
| `clob.polymarket.com/time` | **200 OK** | ❌ bloqueado (sin cabeceras CORS) |
| `data-api.polymarket.com/markets` | **404** (endpoint inexistente) | ❌ |
| `data-api.polymarket.com/trades` | **200 OK** | ❌ bloqueado |
| Subgraph (Goldsky) | **200 OK** | ✅ (sí permite CORS) → único en verde |

Y la base de datos **sí tiene datos sincronizados**:
- 1.134 markets, 202 tokens, 3.372 wallet_positions, 3.036 wallet_activity, 2 wallets, 1 bot config.

**Conclusión:** las APIs funcionan, el sync funciona, los datos están. El problema es que `SystemHealth.tsx` hace `fetch()` directo al dominio de Polymarket desde el navegador, y Polymarket no devuelve `Access-Control-Allow-Origin`. Por eso siempre se ven "Offline".

## Plan de reparación

### 1. Probe de conectividad correcto (raíz del falso "Offline")
- Crear edge function nueva `health-check` que, server-side (sin CORS), haga ping a:
  - Gamma API: `GET /markets?limit=1`
  - CLOB API: `GET /time`
  - Data API: `GET /trades?limit=1` (corregir el endpoint roto `/markets`)
  - Subgraph: `POST { _meta { block { number } } }`
  - Devuelve `{ name, status, latencyMs }` por cada uno.
- Refactor `useApiConnectivity()` en `src/components/settings/SystemHealth.tsx` para llamar a esa edge function en lugar del `fetch` directo.
- Resultado: los 4 indicadores reflejarán el estado real (todos verdes según mi prueba).

### 2. Verificar pipeline de sincronización end-to-end
- Disparar manualmente las edge functions clave y mostrarte el resultado:
  - `sync-markets` (alimenta Market Radar)
  - `sync-tokens` (precios + change_24h)
  - `bot-signal-scanner` (alimenta el bot)
  - `rag-news-signals` (alimenta Predictions)
  - `polymarket-subgraph` (alimenta Wallet Intel)
- Revisar logs de cada una y reportar errores si los hay.

### 3. Validar cron de mantenimiento
- Confirmar que `maintenance-cron` (sync periódico) esté agendado vía `pg_cron`. Si no, agendarlo cada 5 min para `sync-markets` + `sync-tokens` y cada 15 min para `bot-signal-scanner`.

### 4. Auto-sync inicial al cargar la app
- Revisar `useAutoSync.ts` para asegurar que dispare un sync inmediato si la última actualización tiene más de N minutos (evita pantallas vacías tras inactividad).

### 5. Mensaje de error útil en UI
- Añadir tooltip en `SystemHealth` que muestre el `latencyMs` y, si falla, el código HTTP real (no solo "Offline").

## Detalles técnicos

- Nueva ruta: `supabase/functions/health-check/index.ts` con `verify_jwt = false` (es solo lectura pública).
- Cambia `useApiConnectivity()` para usar `supabase.functions.invoke('health-check')`.
- Marca el endpoint Data API correcto en cualquier otro lugar del código que use `data-api.polymarket.com/markets` (búsqueda con `rg`).
- Ningún cambio de schema. Ninguna migración.

## Lo que NO voy a tocar
- Esquema de base de datos (ya está correcto y poblado).
- Lógica de bot, agentes IA o RAG (funciona, solo necesita que los crons estén activos).
- Auth (resuelto en el turno anterior).