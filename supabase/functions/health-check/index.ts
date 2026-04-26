import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProbeResult {
  name: string;
  url: string;
  status: 'ok' | 'degraded' | 'down';
  httpStatus: number | null;
  latencyMs: number | null;
  error?: string;
}

const ENDPOINTS = [
  { name: 'Data API', url: 'https://data-api.polymarket.com/trades?limit=1', method: 'GET' as const },
  { name: 'Gamma API', url: 'https://gamma-api.polymarket.com/markets?limit=1', method: 'GET' as const },
  { name: 'CLOB API', url: 'https://clob.polymarket.com/time', method: 'GET' as const },
  {
    name: 'Subgraph',
    url: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
    method: 'POST' as const,
    body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
    headers: { 'Content-Type': 'application/json' },
  },
];

async function probe(ep: typeof ENDPOINTS[number]): Promise<ProbeResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(ep.url, {
      method: ep.method,
      body: 'body' in ep ? ep.body : undefined,
      headers: 'headers' in ep ? ep.headers : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - start);
    // drain body to free socket
    try { await res.text(); } catch { /* ignore */ }
    const status: ProbeResult['status'] = res.ok
      ? (latencyMs > 3000 ? 'degraded' : 'ok')
      : 'degraded';
    return { name: ep.name, url: ep.url, status, httpStatus: res.status, latencyMs };
  } catch (e) {
    return {
      name: ep.name,
      url: ep.url,
      status: 'down',
      httpStatus: null,
      latencyMs: null,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const results = await Promise.all(ENDPOINTS.map(probe));

  return new Response(JSON.stringify({ checked_at: new Date().toISOString(), results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});