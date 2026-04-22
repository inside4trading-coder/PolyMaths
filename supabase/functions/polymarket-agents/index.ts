import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;
    console.log('[polymarket-agents] Authenticated user:', userId);

    const { action, market, markets, config } = await req.json();
    console.log('[polymarket-agents] Action:', action);

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'analyze_market') {
      if (!market) {
        throw new Error('Market data is required');
      }

      const systemPrompt = `You are an expert prediction market analyst. Your role is to analyze Polymarket prediction markets and provide actionable trading insights.

You have deep knowledge of:
- Political events and elections
- Sports outcomes
- Crypto and financial markets
- Current global events

When analyzing a market, provide:
1. A brief summary of the current situation
2. Key factors that could affect the outcome
3. Your prediction with confidence level (0-100%)
4. A clear recommendation: BUY YES, BUY NO, or HOLD

Be concise but thorough. Use data-driven reasoning.`;

      const userPrompt = `Analyze this Polymarket prediction market:

**Question:** ${market.question}
**Category:** ${market.category || 'Unknown'}
**Current Price (YES):** ${market.yesPrice ? (market.yesPrice * 100).toFixed(1) : 'N/A'}%
**24h Volume:** $${market.volume24h ? market.volume24h.toLocaleString() : 'N/A'}
**Liquidity:** $${market.liquidity ? market.liquidity.toLocaleString() : 'N/A'}
**End Date:** ${market.endDate || 'Unknown'}

Provide your analysis and trading recommendation.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config?.model || 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required. Please add credits.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errorText = await response.text();
        console.error('[polymarket-agents] AI gateway error:', response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.choices?.[0]?.message?.content || 'No analysis generated';
      const tokensUsed = data.usage?.total_tokens || 0;

      let recommendation = 'HOLD';
      const lowerAnalysis = analysisText.toLowerCase();
      if (lowerAnalysis.includes('buy yes') || lowerAnalysis.includes('recommendation: yes')) {
        recommendation = 'BUY YES';
      } else if (lowerAnalysis.includes('buy no') || lowerAnalysis.includes('recommendation: no')) {
        recommendation = 'BUY NO';
      }

      let confidence = null;
      const confidenceMatch = analysisText.match(/(\d{1,3})%?\s*confidence/i) || 
                              analysisText.match(/confidence[:\s]+(\d{1,3})%?/i);
      if (confidenceMatch) {
        confidence = parseInt(confidenceMatch[1]);
      }

      // Save prediction with user_id
      const { error: insertError } = await supabase
        .from('agent_predictions')
        .insert({
          user_id: userId,
          agent_config_id: config?.id || null,
          market_id: market.id,
          market_question: market.question,
          analysis: analysisText,
          prediction: recommendation,
          confidence,
          reasoning: analysisText,
          recommendation,
          model_used: config?.model || 'google/gemini-3-flash-preview',
          tokens_used: tokensUsed,
        });

      if (insertError) {
        console.error('[polymarket-agents] Failed to save prediction:', insertError);
      }

      return new Response(JSON.stringify({
        success: true,
        analysis: analysisText,
        recommendation,
        confidence,
        tokensUsed,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'scan_opportunities') {
      if (!markets || !Array.isArray(markets)) {
        throw new Error('Markets array is required');
      }

      const marketsContext = markets.slice(0, 10).map((m: any, i: number) => 
        `${i + 1}. "${m.question}" - YES: ${m.yesPrice ? (m.yesPrice * 100).toFixed(1) : 'N/A'}%, Vol: $${m.volume24h?.toLocaleString() || 'N/A'}`
      ).join('\n');

      const systemPrompt = `You are a prediction market scanner looking for trading opportunities. Analyze multiple markets and identify the best opportunities based on:
- Mispriced probabilities
- High volume/momentum
- Upcoming catalysts
- Information asymmetry

Return your top 3 recommendations with brief reasoning.`;

      const userPrompt = `Scan these Polymarket markets for trading opportunities:

${marketsContext}

Identify the top 3 opportunities with brief reasoning for each.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config?.model || 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.choices?.[0]?.message?.content || 'No opportunities found';

      return new Response(JSON.stringify({
        success: true,
        analysis: analysisText,
        marketsScanned: markets.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'chat') {
      const { messages } = await req.json();
      
      const systemPrompt = `You are an expert Polymarket trading assistant. You help users:
- Analyze prediction markets
- Find trading opportunities
- Understand market dynamics
- Make informed trading decisions

You have access to real-time Polymarket data. Be helpful, concise, and data-driven.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config?.model || 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            ...(messages || [])
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[polymarket-agents] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
