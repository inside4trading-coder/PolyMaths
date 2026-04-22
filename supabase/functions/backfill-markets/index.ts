import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

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

async function fetchFromGamma(conditionId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${GAMMA_API_BASE}/markets?condition_id=${conditionId}&limit=1`);
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500);
    const skipOffset = Number(url.searchParams.get('skip') || '0');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Step 1: Get missing condition_ids via DB function (fast!)
    const { data: missingRows, error: missingErr } = await supabase.rpc('get_missing_condition_ids');

    let missingIds: string[] = [];
    if (missingErr) {
      console.error('[backfill] RPC error:', missingErr.message);
      return new Response(JSON.stringify({ success: false, error: missingErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    missingIds = (missingRows as { condition_id: string }[]).map(r => r.condition_id);

    const totalMissing = missingIds.length;
    console.log(`[backfill] Found ${totalMissing} total missing condition_ids, processing skip=${skipOffset} limit=${limit}`);

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
          const market = await fetchFromGamma(conditionId);
          if (!market) return null;

          const marketRecord = {
            id: String(market.id || market.questionID || conditionId),
            condition_id: conditionId,
            slug: String(market.slug || market.id || conditionId),
            question: String(market.question || 'Unknown'),
            description: market.description ? String(market.description) : null,
            outcomes: parseOutcomes(market.outcomes),
            category: market.category ? String(market.category) : null,
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
