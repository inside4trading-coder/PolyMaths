import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

const TAG_TO_TOPLEVEL: Array<[RegExp, string]> = [
  [/^(politics|election|elections|presidential|senate|house|congress|midterms|trump|biden|government|policy)$/i, 'Politics'],
  [/^(nfl|nba|nhl|mlb|mls|fifa|uefa|soccer|football|basketball|baseball|hockey|tennis|golf|f1|formula-1|sports?|college-football|world-cup|premier-league|la-liga|champions-league)$/i, 'Sports'],
  [/^(crypto|bitcoin|ethereum|crypto-prices|tokens?|defi|nft|altcoins?|memecoins?)$/i, 'Crypto'],
  [/^(economy|economic-policy|economics|fed|fed-rates|inflation|jobs|unemployment|tariffs|spending|gdp|recession|fomc|jerome-powell|interest-rates)$/i, 'Economics'],
  [/^(geopolitics|world|middle-east|russia|ukraine|israel|iran|china|taiwan|war|ceasefire|diplomacy|nato|un)$/i, 'World'],
  [/^(entertainment|movies?|music|tv|halftime|oscars?|grammys?|emmys?|celebrities?|gaming|gta)$/i, 'Entertainment'],
];

function deriveTopLevelCategory(tags: Array<{ label?: string; slug?: string }>, fallback?: string | null): string | null {
  for (const t of tags || []) {
    for (const [re, top] of TAG_TO_TOPLEVEL) {
      if ((t.slug && re.test(t.slug)) || (t.label && re.test(String(t.label).replace(/\s+/g, '-')))) {
        return top;
      }
    }
  }
  if (fallback) {
    for (const [re, top] of TAG_TO_TOPLEVEL) {
      if (re.test(String(fallback).replace(/\s+/g, '-'))) return top;
    }
  }
  return fallback || null;
}

/** Fetch a market and try to enrich it with parent event tags. Returns the market enriched with `_eventTags`. */
async function fetchMarketWithTags(conditionId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${GAMMA_API_BASE}/markets?condition_id=${conditionId}&limit=1`);
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const market = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!market) return null;

    // Try to grab parent event with include_tag for the real category
    const events = (market as any).events;
    const eventSlug = Array.isArray(events) && events[0] ? events[0].slug : null;
    let tags: Array<{ label?: string; slug?: string }> = [];
    if (eventSlug) {
      try {
        const evRes = await fetch(`${GAMMA_API_BASE}/events?slug=${encodeURIComponent(eventSlug)}&include_tag=true&limit=1`);
        if (evRes.ok) {
          const evData = await evRes.json();
          const ev = Array.isArray(evData) && evData[0] ? evData[0] : null;
          if (ev?.tags && Array.isArray(ev.tags)) tags = ev.tags;
        }
      } catch { /* ignore */ }
    }
    (market as any)._eventTags = tags;
    return market as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseOutcomes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* ignore */ }
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return ['Yes', 'No'];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500);
    const skipOffset = Number(url.searchParams.get('skip') || '0');
    const mode = url.searchParams.get('mode') || 'missing'; // 'missing' | 'recategorize'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let missingIds: string[] = [];
    if (mode === 'recategorize') {
      // Pull condition_ids of markets WITHOUT a top-level category yet.
      const VALID = ['Politics', 'Sports', 'Crypto', 'Economics', 'World', 'Entertainment'];
      const { data, error } = await supabase
        .from('markets')
        .select('condition_id')
        .or(`category.is.null,category.not.in.(${VALID.join(',')})`)
        .not('condition_id', 'is', null)
        .limit(5000);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      missingIds = (data || []).map((r: any) => r.condition_id).filter(Boolean);
    } else {
      // Step 1: Get missing condition_ids via DB function (fast!)
      const { data: missingRows, error: missingErr } = await supabase.rpc('get_missing_condition_ids');
      if (missingErr) {
        console.error('[backfill] RPC error:', missingErr.message);
        return new Response(JSON.stringify({ success: false, error: missingErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      missingIds = (missingRows as { condition_id: string }[]).map(r => r.condition_id);
    }

    const totalMissing = missingIds.length;
    console.log(`[backfill] mode=${mode}: ${totalMissing} candidates, processing skip=${skipOffset} limit=${limit}`);

    // Apply pagination
    missingIds = missingIds.slice(skipOffset, skipOffset + limit);
    console.log(`[backfill] Processing batch of ${missingIds.length} condition_ids`);

    // Step 2: Batch fetch from Gamma API and upsert
    const batchSize = 5;
    let resolved = 0;
    let failed = 0;
    const resolvedQuestions: { condition_id: string; question: string }[] = [];

    for (let i = 0; i < missingIds.length; i += batchSize) {
      const batch = missingIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (conditionId) => {
          const market = await fetchMarketWithTags(conditionId);
          if (!market) return null;

          const eventTags = ((market as any)._eventTags || []) as Array<{ label?: string; slug?: string }>;
          const tagLabels = eventTags.map(t => t.label).filter(Boolean) as string[];
          const rawCat = (market.category as string | null) || ((market as any).groupItemTitle as string | null) || null;
          const topLevel = deriveTopLevelCategory(eventTags, rawCat);

          const marketRecord = {
            id: String(market.id || market.questionID || conditionId),
            condition_id: conditionId,
            slug: String(market.slug || market.id || conditionId),
            question: String(market.question || 'Unknown'),
            description: market.description ? String(market.description) : null,
            outcomes: parseOutcomes(market.outcomes),
            category: topLevel,
            tags: tagLabels,
            end_date: market.endDate || market.end_date_iso || null,
            volume: market.volume ? Number(market.volume) : 0,
            liquidity: market.liquidity ? Number(market.liquidity) : 0,
            closed: market.closed === true || market.active === false,
          };

          const { error: upsertErr } = await supabase
            .from('markets')
            .upsert(marketRecord, { onConflict: 'id' });

          if (upsertErr) {
            console.error(`[backfill] Upsert failed for ${conditionId}: ${upsertErr.message}`);
            return null;
          }

          return { condition_id: conditionId, question: marketRecord.question };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          resolved++;
          resolvedQuestions.push(r.value);
        } else {
          failed++;
        }
      }

      // Small delay to avoid rate limiting
      if (i + batchSize < missingIds.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`[backfill] Resolved ${resolved}, failed ${failed}`);

    // Step 3: Update wallet_activity.market_question for resolved condition_ids
    let updatedActivities = 0;
    for (const { condition_id, question } of resolvedQuestions) {
      const { data: updated, error: updErr } = await supabase
        .from('wallet_activity')
        .update({ market_question: question })
        .eq('condition_id', condition_id)
        .is('market_question', null)
        .select('id');
      if (!updErr && updated) {
        updatedActivities += updated.length;
      }
    }

    console.log(`[backfill] Updated ${updatedActivities} wallet_activity rows`);

    const hasMore = skipOffset + limit < totalMissing;
    return new Response(JSON.stringify({
      success: true,
      total_missing: totalMissing,
      batch_processed: missingIds.length,
      resolved,
      failed,
      activities_updated: updatedActivities,
      has_more: hasMore,
      next_skip: hasMore ? skipOffset + limit : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[backfill] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
