import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// RAG SYSTEM WITH REAL-TIME WEB SEARCH SIMULATION
// Emulates Polymarket/agents architecture: NewsAPI/Tavily -> ChromaDB -> LLM
// Using Lovable AI Gateway with optimized web search prompts
// =============================================================================

interface NewsArticle {
  title: string;
  content: string;
  source: string;
  url: string;
  published_date: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance_score: number;
}

interface RAGContext {
  articles: NewsArticle[];
  summary: string;
  key_facts: string[];
  sentiment_distribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

// Generate real semantic embeddings via Lovable AI Gateway
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    console.error('[RAG] Embedding failed:', response.status);
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// =============================================================================
// STEP 1: WEB SEARCH - Simulates Tavily/Perplexity real-time search
// Uses Lovable AI with grounded web search prompts
// =============================================================================
async function performWebSearch(marketQuestion: string, category: string): Promise<RAGContext> {
  console.log(`[RAG] Performing web search for: "${marketQuestion}"`);
  
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Optimized web search prompt - instructs AI to act as a web search aggregator
  const searchPrompt = `You are a real-time news search engine specialized in prediction markets. 
Today's date is ${currentDate}.

TASK: Search and retrieve the most recent, relevant news articles about this prediction market question:
"${marketQuestion}"
Category: ${category}

SEARCH STRATEGY:
1. Focus on news from the last 7 days
2. Prioritize authoritative sources: Reuters, AP, Bloomberg, NYT, WSJ, Financial Times, BBC, CNN, Politico
3. Include social media sentiment from X/Twitter if relevant
4. Look for official announcements, press releases, expert opinions
5. Consider both supporting and opposing viewpoints

RESPOND with a JSON object containing EXACTLY this structure:
{
  "articles": [
    {
      "title": "Headline of the article",
      "content": "2-3 sentence summary of key points",
      "source": "News source name",
      "url": "https://example.com/article",
      "published_date": "YYYY-MM-DD",
      "sentiment": "positive|negative|neutral",
      "relevance_score": 0.0-1.0
    }
  ],
  "summary": "One paragraph synthesis of all findings",
  "key_facts": ["Fact 1", "Fact 2", "Fact 3"],
  "sentiment_distribution": {
    "positive": 0.0-1.0,
    "negative": 0.0-1.0,
    "neutral": 0.0-1.0
  }
}

Return 4-6 articles. Only return valid JSON, no markdown code blocks.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [
          {
            role: 'system',
            content: `You are a specialized news search and retrieval system for prediction markets. 
You have access to recent news and must provide accurate, well-sourced information.
Always cite real news sources and provide real URLs.`
          },
          { role: 'user', content: searchPrompt }
        ],
        temperature: 0.3, // Lower temperature for more factual responses
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[RAG] Web search failed:', error);
      throw new Error(`Web search failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    // Clean and parse JSON
    const cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const parsed = JSON.parse(cleanContent) as RAGContext;
    console.log(`[RAG] Retrieved ${parsed.articles?.length || 0} articles`);
    
    return parsed;
  } catch (e) {
    console.error('[RAG] Web search error:', e);
    return {
      articles: [],
      summary: 'Unable to retrieve news context',
      key_facts: [],
      sentiment_distribution: { positive: 0.33, negative: 0.33, neutral: 0.34 }
    };
  }
}

// =============================================================================
// STEP 2: VECTOR STORAGE - Stores articles with embeddings (like ChromaDB)
// =============================================================================
async function storeInVectorDB(
  supabase: any,
  context: RAGContext,
  marketId: string
): Promise<string[]> {
  const storedIds: string[] = [];
  
  for (const article of context.articles) {
    try {
      const embedding = await generateEmbedding(`${article.title} ${article.content}`);
      
      const { data, error } = await supabase
        .from('news_embeddings')
        .insert({
          title: article.title,
          content: article.content,
          source: article.source,
          url: article.url,
          embedding: embedding,
          sentiment_score: article.sentiment === 'positive' ? 0.7 : 
                          article.sentiment === 'negative' ? -0.7 : 0,
          relevance_markets: [marketId],
          published_at: article.published_date || new Date().toISOString(),
        })
        .select('id')
        .single();

      if (data) storedIds.push(data.id);
      if (error) console.error('[RAG] Failed to store article:', error.message);
    } catch (e) {
      console.error('[RAG] Storage error:', e);
    }
  }
  
  console.log(`[RAG] Stored ${storedIds.length} articles in vector DB`);
  return storedIds;
}

// =============================================================================
// STEP 3: SIGNAL GENERATION - LLM analysis with RAG context
// =============================================================================
async function generateTradingSignal(
  market: any,
  context: RAGContext,
  currentPrice: number
): Promise<any> {
  console.log(`[RAG] Generating signal for market: ${market.id}`);
  
  // Build context string from retrieved articles
  const articlesContext = context.articles
    .map((a, i) => `[${i + 1}] ${a.title} (${a.source}, ${a.published_date})
    ${a.content}
    Sentiment: ${a.sentiment}, Relevance: ${(a.relevance_score * 100).toFixed(0)}%`)
    .join('\n\n');

  const analysisPrompt = `You are a quantitative analyst for prediction markets using RAG (Retrieval-Augmented Generation) methodology.

MARKET INFORMATION:
- Question: "${market.question}"
- Category: ${market.category || 'General'}
- Current YES Price: ${(currentPrice * 100).toFixed(1)}% (implied probability)
- Market ID: ${market.id}

RETRIEVED NEWS CONTEXT (from web search):
${articlesContext || 'No relevant news found.'}

KEY FACTS EXTRACTED:
${context.key_facts?.map(f => `• ${f}`).join('\n') || 'None available'}

OVERALL SENTIMENT:
- Positive: ${((context.sentiment_distribution?.positive || 0) * 100).toFixed(0)}%
- Negative: ${((context.sentiment_distribution?.negative || 0) * 100).toFixed(0)}%
- Neutral: ${((context.sentiment_distribution?.neutral || 0) * 100).toFixed(0)}%

ANALYSIS FRAMEWORK:
1. Compare current price to fair value based on news evidence
2. Assess information freshness and source reliability
3. Consider sentiment alignment with market outcome
4. Factor in any breaking news or recent developments
5. Account for market efficiency and potential mispricing

IMPORTANT: This is a prediction market. The signal should directly answer the market question.
- If evidence suggests the event WILL happen: use STRONG_YES or YES
- If evidence suggests the event WON'T happen: use STRONG_NO or NO  
- If evidence is inconclusive: use UNCERTAIN

RESPOND with a JSON object:
{
  "signal_type": "STRONG_YES|YES|UNCERTAIN|NO|STRONG_NO",
  "confidence": 0-100,
  "fair_value": 0.00-1.00,
  "suggested_price": 0.00-1.00,
  "reasoning": "2-3 sentences explaining WHY you predict YES or NO based on news evidence",
  "key_drivers": ["driver 1", "driver 2"],
  "risks": ["risk 1", "risk 2"],
  "sources_used": 1-6
}

Only return valid JSON, no markdown.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a senior prediction market analyst. 
Provide actionable trading signals based on news evidence.
Be conservative with confidence scores - only high confidence for strong evidence.
Consider both the probability of the event AND the current market price.`
          },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`Signal generation failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const signal = JSON.parse(cleanContent);
    console.log(`[RAG] Generated signal: ${signal.signal_type} (${signal.confidence}% conf)`);
    
    return signal;
  } catch (e) {
    console.error('[RAG] Signal generation error:', e);
    return {
      signal_type: 'UNCERTAIN',
      confidence: 30,
      fair_value: currentPrice,
      suggested_price: currentPrice,
      reasoning: 'Unable to generate prediction due to analysis error',
      key_drivers: [],
      risks: ['Analysis error'],
      sources_used: 0
    };
  }
}

// =============================================================================
// MAIN SERVER
// =============================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, market, markets } = await req.json();

    console.log(`[RAG] Action: ${action}`);

    // =========================================================================
    // ANALYZE SINGLE MARKET - Full RAG pipeline
    // =========================================================================
    if (action === 'analyze_market') {
      if (!market) throw new Error('Market is required');

      // Step 1: Web Search (simulates Tavily/Perplexity)
      const context = await performWebSearch(market.question, market.category || 'General');

      // Step 2: Store in Vector DB (simulates ChromaDB)
      const newsIds = await storeInVectorDB(supabase, context, market.id);

      // Step 3: Generate Signal with RAG context
      const signal = await generateTradingSignal(market, context, market.currentPrice || 0.5);

      // Step 4: Store signal for history
      const { error: signalError } = await supabase
        .from('rag_signals')
        .insert({
          market_id: market.id,
          market_question: market.question,
          signal_type: signal.signal_type,
          confidence: signal.confidence,
          reasoning: signal.reasoning,
          news_sources: newsIds,
          current_price: market.currentPrice,
          suggested_price: signal.suggested_price || signal.fair_value,
        });

      if (signalError) console.error('[RAG] Failed to store signal:', signalError);

      return new Response(JSON.stringify({
        success: true,
        // Signal info
        signal: signal.signal_type,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        suggestedPrice: signal.suggested_price || signal.fair_value,
        fairValue: signal.fair_value,
        keyDrivers: signal.key_drivers,
        risks: signal.risks,
        // News context
        newsCount: context.articles.length,
        news: context.articles,
        summary: context.summary,
        keyFacts: context.key_facts,
        sentimentDistribution: context.sentiment_distribution,
        sourcesUsed: signal.sources_used,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // SCAN MULTIPLE MARKETS
    // =========================================================================
    if (action === 'scan_markets') {
      if (!markets?.length) throw new Error('Markets array is required');

      const results = [];
      const topMarkets = markets.slice(0, 5);

      for (const m of topMarkets) {
        try {
          console.log(`[RAG] Scanning market ${m.id}`);
          
          const context = await performWebSearch(m.question, m.category || 'General');
          const signal = await generateTradingSignal(m, context, m.currentPrice || 0.5);

          await supabase.from('rag_signals').insert({
            market_id: m.id,
            market_question: m.question,
            signal_type: signal.signal_type,
            confidence: signal.confidence,
            reasoning: signal.reasoning,
            current_price: m.currentPrice,
            suggested_price: signal.suggested_price || signal.fair_value,
          });

          results.push({
            marketId: m.id,
            question: m.question,
            signal: signal.signal_type,
            confidence: signal.confidence,
            fairValue: signal.fair_value,
            newsCount: context.articles.length,
          });
        } catch (e) {
          console.error(`[RAG] Failed to analyze market ${m.id}:`, e);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        marketsScanned: results.length,
        signals: results,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // GET SIGNALS HISTORY
    // =========================================================================
    if (action === 'get_signals') {
      const { data: signals, error } = await supabase
        .from('rag_signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        signals,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error('[RAG] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
