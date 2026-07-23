// Perplexity API integration for market insights

export interface MarketInsight {
  title: string;
  description: string;
  link: string;
}

/**
 * Whitelist of reputable financial news domains
 */
const REPUTABLE_NEWS_DOMAINS = [
  'bloomberg.com',
  'reuters.com',
  'wsj.com',
  'ft.com',
  'financialtimes.com',
  'cnbc.com',
  'marketwatch.com',
  'yahoo.com',
  'finance.yahoo.com',
  'economist.com',
  'forbes.com',
  'businessinsider.com',
  'nasdaq.com',
  // Removed tradingeconomics.com - it's a data/analytics site, not a news source
];

/**
 * Checks if a URL belongs to a reputable news source
 */
function isReputableSource(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    // Handle URLs that might not have protocol
    let urlToCheck = url.trim();
    if (!urlToCheck.startsWith('http://') && !urlToCheck.startsWith('https://')) {
      urlToCheck = 'https://' + urlToCheck;
    }
    
    const urlObj = new URL(urlToCheck);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Remove 'www.' prefix if present
    const cleanHostname = hostname.replace(/^www\./, '');
    
    // Check if hostname matches any reputable domain
    const isReputable = REPUTABLE_NEWS_DOMAINS.some(domain => {
      return cleanHostname === domain || cleanHostname.endsWith('.' + domain);
    });
    
    if (!isReputable) {
      console.log(`URL ${url} (hostname: ${cleanHostname}) did not match any reputable domain`);
    }
    
    return isReputable;
  } catch (error) {
    console.error('Error parsing URL:', url, error);
    return false;
  }
}

/**
 * Fetches market insights from Perplexity API
 */
export async function fetchMarketInsights(): Promise<MarketInsight[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
    if (!apiKey) {
    console.error('PERPLEXITY_API_KEY not found in environment variables');
    console.error('Please set PERPLEXITY_API_KEY in your environment variables');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('PERPLEXITY')));
    return [];
  }
  
  console.log('Fetching market insights from Perplexity API...');
  console.log('API Key present:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT FOUND');

  try {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const prompt = `Generate an AI-powered market summary for ${today}. Synthesize and analyze current market conditions to create EXACTLY 5-7 comprehensive insights. This should be your analytical summary of the markets today, not just a list of news stories.

Create insights that provide:
- Market-wide analysis: Overall market performance, key indices movements, and major trends
- Sector deep-dive: Which sectors are outperforming/underperforming and why
- Economic context: How economic data, policy decisions, and macro trends are shaping markets
- Sentiment analysis: Market psychology, investor behavior, and risk appetite
- Forward-looking perspective: What the current conditions suggest about near-term market direction

CRITICAL REQUIREMENTS:
1. This should be an AI-GENERATED SUMMARY with your own analysis and synthesis. Draw insights from multiple sources and data points to create a cohesive market narrative.
2. Use current market data, indices, sector performance, and economic indicators from reputable sources (Bloomberg, Reuters, WSJ, Financial Times, CNBC, MarketWatch, Yahoo Finance, etc.) to inform your analysis.
3. Each insight should include a reference link to a reputable source that supports the insight. The link should:
   - Be a complete, valid HTTPS URL
   - Come from reputable financial sources (Bloomberg, Reuters, WSJ, Financial Times, CNBC, MarketWatch, Yahoo Finance, The Economist, Forbes, Business Insider, or Nasdaq)
   - Be relevant to the insight (can be a news article, data source, or analysis piece)
4. You MUST return ONLY valid JSON with no additional text, comments, or markdown formatting.
5. The JSON structure must be exactly:
{
  "insights": [
    {
      "title": "Brief, descriptive title of the market insight",
      "description": "2-4 sentence AI-generated summary synthesizing market conditions, trends, and analysis",
      "link": "relevant URL from a reputable source that supports this insight"
    }
  ]
}

IMPORTANT: 
- You MUST provide at least 5 insights (preferably 5-7).
- Each insight should reflect YOUR ANALYSIS of market conditions, not just report individual news stories.
- Synthesize information from multiple sources to create comprehensive market insights.
- Return ONLY the JSON object. Do not include any text before or after the JSON.
- Links should support the insight but the insight itself should be your synthesized analysis.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a senior financial market analyst creating AI-generated market summaries. Synthesize market data, news, economic indicators, and sector performance to provide comprehensive market analysis. Your insights should reflect analytical synthesis and market understanding, not just reporting individual news stories. Always return responses in valid JSON format. Use reputable financial sources (WSJ, Bloomberg, Reuters, Financial Times, CNBC, MarketWatch, Yahoo Finance, The Economist, Forbes, Business Insider, Nasdaq) to inform your analysis, but create your own summarized insights from the broader market picture.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'market_insights',
            schema: {
              type: 'object',
              properties: {
                insights: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      link: { type: 'string' }
                    },
                    required: ['title', 'description', 'link']
                  }
                }
              },
              required: ['insights']
            }
          }
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status);
      console.error('Error response:', errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error('Parsed error:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error('Error response is not JSON');
      }
      return [];
    }

    const data = await response.json();
    console.log('Perplexity API response received. Status:', response.status);
    console.log('Response structure keys:', Object.keys(data));
    console.log('Has choices:', !!data.choices);
    console.log('Choices length:', data.choices?.length || 0);
    
    // Extract citations from the API response
    // Perplexity API returns citations in search_results array with url, title, and date fields
    // Also check other possible locations: data.citations, data.choices[0].citations, or data.choices[0].message.citations
    let citations: string[] = [];
    let rawCitations: any[] = [];
    
    // First, try search_results (the standard Perplexity API format)
    // Perplexity returns citations in data.search_results array
    if (data.search_results && Array.isArray(data.search_results)) {
      rawCitations = data.search_results;
      console.log(`Found ${rawCitations.length} citations in search_results`);
    } else if (data.citations && Array.isArray(data.citations)) {
      rawCitations = data.citations;
      console.log(`Found ${rawCitations.length} citations in data.citations`);
    } else if (data.choices?.[0]?.citations && Array.isArray(data.choices[0].citations)) {
      rawCitations = data.choices[0].citations;
      console.log(`Found ${rawCitations.length} citations in choices[0].citations`);
    } else if (data.choices?.[0]?.message?.citations && Array.isArray(data.choices[0].message.citations)) {
      rawCitations = data.choices[0].message.citations;
      console.log(`Found ${rawCitations.length} citations in choices[0].message.citations`);
    } else {
      // Try to find citations in any array field
      for (const key of Object.keys(data)) {
        const lowerKey = key.toLowerCase();
        if ((lowerKey.includes('citation') || lowerKey.includes('search_result')) && Array.isArray(data[key])) {
          rawCitations = data[key];
          console.log(`Found ${rawCitations.length} citations in ${key}`);
          break;
        }
      }
    }
    
    // Log raw citations structure for debugging
    if (rawCitations.length > 0) {
      console.log('Sample raw citation structure:', JSON.stringify(rawCitations[0], null, 2));
    }
    
    // Convert citations to URLs (handle both string URLs and objects with url property)
    citations = rawCitations.map((cite: any) => {
      if (typeof cite === 'string') {
        return cite;
      } else if (cite && typeof cite === 'object') {
        // Try multiple possible property names
        return cite.url || cite.link || cite.href || cite.source_url || cite.article_url || null;
      }
      return null;
    }).filter((url): url is string => {
      // Filter out invalid URLs
      if (!url || typeof url !== 'string') return false;
      // Must be a valid HTTP/HTTPS URL
      try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
      } catch {
        return false;
      }
    });
    
    console.log(`Citations found: ${citations.length} total`);
    if (citations.length > 0) {
      console.log('Citation URLs:', citations.slice(0, 5).map(url => {
        try {
          const hostname = new URL(url).hostname;
          const isReputable = isReputableSource(url);
          return `${hostname} (${isReputable ? 'reputable' : 'not reputable'}) - ${url.substring(0, 60)}...`;
        } catch {
          return url.substring(0, 60) + '...';
        }
      }).join('\n  '));
    }
    
    // Filter citations to only include reputable sources and valid article URLs
    const validCitations = citations.filter(url => {
      // Must be from a reputable source
      if (!isReputableSource(url)) {
        return false;
      }
      
      // Must be a valid article URL (not data pages, homepages, etc.)
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        
        // Reject obvious non-article pages
        if (pathname === '/' || pathname === '' || 
            pathname === '/stock-market' || 
            pathname === '/united-states/stock-market' ||
            pathname.includes('/data/') || 
            pathname.includes('/dashboard/')) {
          return false;
        }
        
        // Must have at least one path segment (not just homepage)
        const pathSegments = pathname.split('/').filter(seg => seg.length > 0);
        if (pathSegments.length < 1) {
          return false;
        }
        
        return true;
      } catch {
        return false;
      }
    });
    
    console.log(`Valid citations (reputable sources with article URLs): ${validCitations.length}`);
    if (validCitations.length > 0) {
      console.log('Valid citation URLs:', validCitations.slice(0, 10).map(url => {
        try {
          const hostname = new URL(url).hostname;
          return `${hostname} - ${url.substring(0, 80)}...`;
        } catch {
          return url.substring(0, 80) + '...';
        }
      }).join('\n  '));
    }
    
    // Use only valid citations from now on
    citations = validCitations;
    
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in Perplexity API response');
      console.error('Full response:', JSON.stringify(data, null, 2));
      return [];
    }
    
    console.log('Content length:', content.length);

    console.log('Received Perplexity JSON response');
    console.log('Response content preview:', content.substring(0, 500));

    // Clean content - remove markdown code blocks if present
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    cleanedContent = cleanedContent.trim();

    // Parse JSON response
    let parsedData: { insights?: MarketInsight[] };
    try {
      parsedData = JSON.parse(cleanedContent);
      console.log('Successfully parsed JSON. Structure:', Object.keys(parsedData));
    } catch (parseError) {
      console.error('Failed to parse JSON response from Perplexity:', parseError);
      console.error('Attempted to parse:', cleanedContent.substring(0, 200));
      console.log('Full response content:', content);
      return [];
    }

    // Extract insights array - try different possible keys
    let insights: MarketInsight[] = [];
    if (parsedData.insights) {
      insights = parsedData.insights;
    } else if (Array.isArray(parsedData)) {
      insights = parsedData;
    } else {
      // Try to find any array in the response
      const keys = Object.keys(parsedData);
      for (const key of keys) {
        if (Array.isArray(parsedData[key as keyof typeof parsedData])) {
          insights = parsedData[key as keyof typeof parsedData] as MarketInsight[];
          console.log(`Found insights array under key: ${key}`);
          break;
        }
      }
    }
    
    console.log(`Found ${insights.length} insights in response`);
    
    if (insights.length === 0) {
      console.warn('No insights found in Perplexity response');
      console.log('Parsed data structure:', JSON.stringify(parsedData, null, 2));
      return [];
    }

    // Validate and filter insights
    const validInsights: MarketInsight[] = [];
    
    for (const insight of insights) {
      // Validate required fields
      if (!insight.title || !insight.description) {
        console.warn('Insight missing required fields:', insight);
        continue;
      }

      // Extract citation numbers from description (e.g., [1], [2], [1][2])
      let cleanedDescription = insight.description.trim();
      const citationMatches = cleanedDescription.match(/\[(\d+)\]/g);
      let citationUrl = '';
      let isFromCitation = false;
      
      // ALWAYS prioritize citations from Perplexity's search results over JSON response URLs
      if (citations.length > 0) {
        // Priority 1: Try to match citation number from description (e.g., [1], [2])
        if (citationMatches && citationMatches.length > 0) {
          const firstCitationMatch = citationMatches[0].match(/\[(\d+)\]/);
          if (firstCitationMatch) {
            const citationIndex = parseInt(firstCitationMatch[1], 10) - 1;
            if (citationIndex >= 0 && citationIndex < citations.length) {
              citationUrl = citations[citationIndex];
              isFromCitation = true;
              console.log(`Using citation [${firstCitationMatch[1]}] URL: ${citationUrl}`);
            }
          }
        }
        
        // Priority 2: If no citation number match, assign citations cyclically based on insight index
        if (!citationUrl) {
          const insightIndex = validInsights.length;
          const citationIndex = insightIndex % citations.length;
          citationUrl = citations[citationIndex];
          isFromCitation = true;
          console.log(`Assigning citation ${citationIndex + 1}/${citations.length} to insight ${insightIndex + 1}: ${citationUrl}`);
        }
      }
      
      // Priority 3: Only fall back to JSON response link if NO citations are available at all
      if (!citationUrl && insight.link) {
        citationUrl = insight.link.trim();
        console.log(`Using link from JSON response (no citations available in API response): ${citationUrl}`);
      }
      
      // Skip if we still don't have a valid URL
      if (!citationUrl) {
        console.warn('Insight has no valid URL (no link field and no citations available):', insight.title);
        continue;
      }

      // Validate that the URL is from a reputable source
      if (!isReputableSource(citationUrl)) {
        console.warn(`Insight URL is not from a reputable source: ${citationUrl}`, insight.title);
        continue;
      }

      // Validate that the URL is a direct article link (not homepage, category, or search)
      // Be very lenient with citations from Perplexity since they're verified, real URLs
      try {
        const urlObj = new URL(citationUrl);
        const pathname = urlObj.pathname.toLowerCase();
        const hostname = urlObj.hostname.toLowerCase();
        
        // Ensure URL has a meaningful path with article-like structure
        const pathSegments = pathname.split('/').filter(seg => seg.length > 0);
        
        // If it's from a citation, trust Perplexity and only reject obvious non-articles
        if (isFromCitation) {
          // For citations, only reject homepage or obvious data pages
          if (pathname === '/' || pathname === '' || pathname === '/stock-market' || pathname === '/united-states/stock-market' || pathname.includes('/data/') || pathname.includes('/dashboard/')) {
            console.warn(`Citation URL appears to be a non-article page: ${citationUrl}`, insight.title);
            continue;
          }
          // Citations from Perplexity are generally trusted if they pass basic checks
          console.log(`Using verified citation URL: ${citationUrl}`);
        } else {
          // For non-citation URLs (from JSON), apply stricter validation
          if (pathname === '/' || pathname === '') {
            console.warn(`Insight URL is homepage: ${citationUrl}`, insight.title);
            continue;
          }
          
          if (pathname.includes('/category/') || 
              pathname.includes('/search?') ||
              pathname.includes('/tag/') ||
              pathname.includes('/author/') ||
              pathname.includes('/archive/') ||
              pathname === '/stock-market' ||
              pathname === '/united-states/stock-market' ||
              pathname.includes('/dashboard/')) {
            console.warn(`Insight URL appears to be a non-article page: ${citationUrl}`, insight.title);
            continue;
          }
          
          if (pathSegments.length < 1) {
            console.warn(`Insight URL has insufficient path segments: ${citationUrl}`, insight.title);
            continue;
          }
        }
      } catch (urlError) {
        console.warn(`Invalid URL format: ${citationUrl}`, insight.title);
        continue;
      }

      // Remove citations from description (e.g., [1], [2], etc.)
      // Remove citation markers like [1], [2], [1][2], etc.
      cleanedDescription = cleanedDescription.replace(/\[\d+\]/g, '').trim();
      // Clean up any double spaces or trailing punctuation issues
      cleanedDescription = cleanedDescription.replace(/\s+/g, ' ').trim();
      
      validInsights.push({
        title: insight.title.trim(),
        description: cleanedDescription,
        link: citationUrl,
      });
    }

    if (validInsights.length === 0) {
      console.warn('No insights passed validation');
      console.warn('This might indicate:');
      console.warn('1. All insights were filtered out by domain whitelist');
      console.warn('2. Insights did not have valid URLs from citations');
      console.warn('3. No citations were found in the API response');
      
      // If we have insights but they were all filtered, try to use citations anyway
      if (insights.length > 0 && citations.length > 0) {
        console.log('Attempting to create insights using citations...');
        const fallbackInsights: MarketInsight[] = [];
        
        for (let i = 0; i < Math.min(insights.length, 5); i++) {
          const insight = insights[i];
          if (!insight.title || !insight.description) continue;
          
          // Use citation URL (cycle through available citations if we have more insights than citations)
          const citationIndex = Math.min(i, citations.length - 1);
          const citationUrl = citations[citationIndex];
          
          // Validate that the URL is from a reputable source
          if (!isReputableSource(citationUrl)) {
            console.warn(`Fallback insight URL is not from a reputable source: ${citationUrl}`, insight.title);
            continue;
          }
          
          // Validate that the URL is a direct article link
          try {
            const urlObj = new URL(citationUrl);
            const pathname = urlObj.pathname.toLowerCase();
            const hostname = urlObj.hostname.toLowerCase();
            
            // Skip if URL appears to be a homepage, category page, or search results
            // Be more lenient - only reject obvious non-article pages
            const fallbackPathSegments = pathname.split('/').filter(seg => seg.length > 0);
            if (pathname === '/' || 
                pathname === '' || 
                pathname.includes('/category/') || 
                pathname.includes('/search?') ||
                pathname.includes('/tag/') ||
                pathname.includes('/author/') ||
                pathname.includes('/archive/') ||
                (pathname.includes('/markets/') && fallbackPathSegments.length < 2) ||
                (pathname.includes('/market/') && fallbackPathSegments.length < 2) ||
                pathname === '/stock-market' ||
                pathname === '/united-states/stock-market' ||
                (pathname.includes('/data/') && fallbackPathSegments.length < 3) ||
                pathname.includes('/dashboard/')) {
              console.warn(`Fallback insight URL appears to be a non-article page: ${citationUrl}`, insight.title);
              continue;
            }
            
            // Ensure URL has a meaningful path
            const pathSegments = pathname.split('/').filter(seg => seg.length > 0);
            if (pathSegments.length < 1) {
              console.warn(`Fallback insight URL has insufficient path segments: ${citationUrl}`, insight.title);
              continue;
            }
            
            // Additional check for tradingeconomics
            if (hostname.includes('tradingeconomics.com')) {
              if (pathname === '/united-states/stock-market' || (fallbackPathSegments.length < 2 && fallbackPathSegments[0] === 'united-states')) {
                console.warn(`Fallback TradingEconomics URL appears to be a data page: ${citationUrl}`, insight.title);
                continue;
              }
            }
          } catch (urlError) {
            console.warn(`Invalid fallback URL format: ${citationUrl}`, insight.title);
            continue;
          }
          
          // Remove citations from description
          let cleanedDescription = insight.description.trim();
          cleanedDescription = cleanedDescription.replace(/\[\d+\]/g, '').trim();
          cleanedDescription = cleanedDescription.replace(/\s+/g, ' ').trim();
          
          fallbackInsights.push({
            title: insight.title.trim(),
            description: cleanedDescription,
            link: citationUrl,
          });
        }
        
        if (fallbackInsights.length > 0) {
          console.warn(`Using ${fallbackInsights.length} insights with citation URLs (bypassed domain filtering)`);
          return fallbackInsights;
        }
      }
      
      return [];
    }

    console.log(`Successfully parsed ${validInsights.length} insights from Perplexity`);
    validInsights.forEach((insight, idx) => {
      console.log(`  Insight ${idx + 1}: "${insight.title}" - ${insight.link}`);
    });

    // Ensure we have at least 5 insights, warn if we don't
    if (validInsights.length < 5) {
      console.warn(`WARNING: Only ${validInsights.length} valid insights found. Expected at least 5.`);
      console.warn('This may indicate:');
      console.warn('1. Perplexity did not return enough insights');
      console.warn('2. Too many insights were filtered out by source/URL validation');
      console.warn('3. Citations from Perplexity were not from reputable sources');
    }

    // Return up to 5 insights (prefer first 5 if more are available)
    return validInsights.slice(0, 5);
  } catch (error) {
    console.error('Error fetching market insights from Perplexity:', error);
    return [];
  }
}