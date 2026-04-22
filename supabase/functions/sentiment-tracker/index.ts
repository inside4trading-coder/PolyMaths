import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, market, markets } = await req.json();
    console.log('[sentiment-tracker] Action:', action);

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'analyze_sentiment') {
      if (!market) {
        throw new Error('Market data is required');
      }

      console.log('[sentiment-tracker] Analyzing sentiment for:', market.question);

      const systemPrompt = `You are an expert market sentiment analyst. Your role is to analyze news and social media sentiment for prediction markets.

You must analyze the current news and public discourse around the topic and determine:
1. Overall sentiment (bullish, bearish, or neutral)
2. A sentiment score from -1 (very bearish) to 1 (very bullish)
3. A brief summary of the key news and events affecting this market
4. List relevant news sources or topics you found

Be objective and data-driven. Focus on recent news and developments.

IMPORTANT: Respond in this exact JSON format:
{
  "sentimentLabel": "bullish" | "bearish" | "neutral",
  "sentimentScore": <number between -1 and 1>,
  "newsSummary": "<brief summary of news affecting this market>",
  "sources": ["<source1>", "<source2>", ...]
}`;

      const userPrompt = `Analyze the current news and social media sentiment for this prediction market:

**Market Question:** ${market.question}
**Category:** ${market.category || 'Unknown'}
**Current YES Price:** ${market.currentPrice ? (market.currentPrice * 100).toFixed(1) : 'N/A'}%

Based on recent news, events, and public discourse, what is the overall sentiment? Consider:
- Recent news articles and headlines
- Social media trends
- Expert opinions
- Upcoming events or catalysts

Provide your sentiment analysis in the required JSON format.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required. Please add credits.' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errorText = await response.text();
        console.error('[sentiment-tracker] AI gateway error:', response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log('[sentiment-tracker] Raw response:', content);

      // Parse JSON from response
      let sentimentData;
      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          sentimentData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[sentiment-tracker] Failed to parse JSON:', parseError);
        // Fallback to heuristic parsing
        const lowerContent = content.toLowerCase();
        let sentimentLabel = 'neutral';
        let sentimentScore = 0;
        
        if (lowerContent.includes('bullish') || lowerContent.includes('positive') || lowerContent.includes('optimistic')) {
          sentimentLabel = 'bullish';
          sentimentScore = 0.5;
        } else if (lowerContent.includes('bearish') || lowerContent.includes('negative') || lowerContent.includes('pessimistic')) {
          sentimentLabel = 'bearish';
          sentimentScore = -0.5;
        }
        
        sentimentData = {
          sentimentLabel,
          sentimentScore,
          newsSummary: content.slice(0, 500),
          sources: [],
        };
      }

      // Save to database
      const { error: insertError } = await supabase
        .from('market_sentiment')
        .insert({
          market_id: market.id,
          market_question: market.question,
          sentiment_score: sentimentData.sentimentScore,
          sentiment_label: sentimentData.sentimentLabel,
          news_summary: sentimentData.newsSummary,
          sources: sentimentData.sources || [],
          price_at_analysis: market.currentPrice,
        });

      if (insertError) {
        console.error('[sentiment-tracker] Failed to save sentiment:', insertError);
      }

      return new Response(JSON.stringify({
        success: true,
        ...sentimentData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'scan_sentiment') {
      if (!markets || !Array.isArray(markets)) {
        throw new Error('Markets array is required');
      }

      console.log('[sentiment-tracker] Scanning sentiment for', markets.length, 'markets');

      const results = [];
      
      for (const market of markets.slice(0, 5)) {
        try {
          const systemPrompt = `You are a quick sentiment scanner. Analyze sentiment for a prediction market and respond with ONLY a JSON object:
{
  "sentimentLabel": "bullish" | "bearish" | "neutral",
  "sentimentScore": <number -1 to 1>,
  "newsSummary": "<one sentence summary>"
}`;

          const userPrompt = `Quick sentiment scan for: "${market.question}" (Category: ${market.category || 'Unknown'})`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-3-flash-preview',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
            }),
          });

          if (!response.ok) {
            console.error('[sentiment-tracker] Scan failed for market:', market.id);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          
          let sentimentData;
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              sentimentData = JSON.parse(jsonMatch[0]);
            } else {
              continue;
            }
          } catch {
            continue;
          }

          // Save to database
          await supabase
            .from('market_sentiment')
            .insert({
              market_id: market.id,
              market_question: market.question,
              sentiment_score: sentimentData.sentimentScore,
              sentiment_label: sentimentData.sentimentLabel,
              news_summary: sentimentData.newsSummary,
              sources: [],
              price_at_analysis: market.currentPrice,
            });

          results.push({
            marketId: market.id,
            ...sentimentData,
          });
        } catch (error) {
          console.error('[sentiment-tracker] Error scanning market:', market.id, error);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        marketsScanned: results.length,
        results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sentiment-tracker] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
