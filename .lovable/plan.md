## Diagnóstico (deep dive)

Verifiqué la cadena completa Positions Radar → `useWalletPositions` → tabla `wallet_positions` ⨝ `markets` → filtro `categorizeCategoryType`. Todo el código de UI/hook funciona, pero falla por **datos**:

Datos reales en BD ahora mismo:
- 4 705 wallet_positions, 128 wallets, 3 604 condition_ids únicos.
- Solo **2 131/4 705** posiciones (45%) tienen un row matching en `markets`.
- **0/4 705** posiciones apuntan a un market con `category` rellena.
- En toda la tabla `markets`: 99/1 385 tienen categoría, y son valores como `"Algeria"`, `"Boston Celtics"`, `"<5 years"`… subcategorías de evento, no las top‑level (Politics/Sports/Crypto…).
- Columna `tags` (jsonb): **0 filas** rellenas.

Causa raíz: todos los syncs de markets (`sync-markets`, y los upserts dentro de `polymarket-data`: `sync_wallet_positions`, `enrichFromGamma`, `sync_global_activity`) consultan el endpoint **`/markets`** de Gamma. Ese endpoint **no devuelve la categoría real ni los tags útiles** — comprobado con la API en vivo: `category: null`, `events[].category: null`, `events[].tags: []`.

La categoría real (Politics, Crypto, Economy, Sports, Geopolitics…) sólo aparece consultando **`/events?include_tag=true`**, en el array `tags[].label`. Cada market lleva en `m.events[]` un id de evento que permite enriquecer.

Resultado: el filtro `categorizeCategoryType(market?.category)` recibe `null` para casi todas las posiciones → siempre cae en `'Other'` → al filtrar por Crypto/Politics/etc. el resultado son **0 posiciones**.

## Plan de fix

### 1. Sync principal de markets (`supabase/functions/sync-markets/index.ts`)
- Cambiar el fetch a `/events?limit=N&closed=false&order=volume24hr&ascending=false&include_tag=true` y luego iterar `event.markets[]`.
- Por cada market, derivar:
  - `category`: la primera tag relevante del evento, mapeada a una de las 7 top‑level (Politics/Sports/Crypto/Economics/World/Entertainment/Other) usando una función `topLevelFromTags(tags[])` nueva (compartida con el front).
  - `tags`: `event.tags.map(t => t.label)` completo (jsonb), para no perder información granular.
- Mantener fallback al endpoint `/markets` si el evento no tiene tags.

### 2. Enriquecimiento on‑demand en `polymarket-data` (4 puntos)
- En `enrichFromGamma`, `sync_wallet_positions` (bloque "Background synced missing markets") y `sync_global_activity`: cuando se reciba un market sin categoría útil, hacer un fetch adicional `/events?id={event_id}&include_tag=true` (o por slug del evento) y guardar `category` derivada de tags + `tags` jsonb.
- Limitar a 50 enriquecimientos por invocación para no exceder rate limits (ya hay un patrón similar).

### 3. Backfill puntual del estado actual
- Añadir nueva acción `backfill_market_categories` en `polymarket-data` que recorra `markets` con `category IS NULL OR jsonb_array_length(tags) = 0`, en lotes de 100, y los enriquezca vía `/events?include_tag=true&slug=...` o consultando el market individual y resolviendo `events[0].id` → `/events/{id}`.
- Disparar este backfill una vez desde `SystemHealth` (botón "Refresh categories") o automáticamente la primera vez que el usuario abra Positions Radar tras el deploy.

### 4. Consolidar `categorizeCategoryType` (`src/hooks/usePolymarket.ts`)
- Extender el `CATEGORY_TYPE_MAP` con los slugs/labels reales que aparecen en los tags de Polymarket (`geopolitics`, `economic-policy`, `fed`, `fed-rates`, `middle-east`, `crypto-prices`, `nfl`, `nba`, etc.).
- Hacer que la función acepte `(category, tags?)`: si `category` mapea a Other pero algún tag sí mapea, usar el del tag.
- Pasar `market.tags` además de `market.category` desde `useWalletPositions` al filtro y al objeto `WalletPosition` (campo nuevo `market_tags`), para que el filtrado en cliente sea robusto incluso para los markets que aún no se hayan re‑sync‑eado.

### 5. Verificación
- Re‑ejecutar `Sync & Discover` desde Positions Radar y `sync-markets`.
- Query de control: `SELECT category, COUNT(*) FROM markets GROUP BY category` debe mostrar Politics/Sports/Crypto/Economics/World/Entertainment/Other con counts > 0.
- Filtrar por Crypto en la UI debe devolver posiciones (las hay: hay positions en condition_ids cuyos markets son "Bitcoin hits $1m", "Will Bitcoin hit $150k", etc.).

### Archivos afectados
- `supabase/functions/sync-markets/index.ts` (cambio de endpoint + tags + categoría derivada)
- `supabase/functions/polymarket-data/index.ts` (4 upserts + acción `backfill_market_categories`)
- `src/hooks/usePolymarket.ts` (`categorizeCategoryType` ampliada, propagar `tags` en `WalletPosition`, usar tags como fallback de filtro)
- `src/components/views/MarketRadar.tsx` (sin cambios estructurales; usa el hook ya enriquecido)
- `src/components/settings/SystemHealth.tsx` (opcional: botón para lanzar el backfill)
