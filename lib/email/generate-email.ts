// Reusable function to generate market overview email

import { captureTradingViewMarketHeatmap, closeBrowser } from './tradingview-screenshot';
import { fetchAllPrestockData } from './prestock-data';
import { generateEmailTemplate } from './email-template';
import { fetchMarketInsights } from './perplexity-insights';

/**
 * Generates the complete market overview email HTML
 * Returns the HTML content and ensures browser cleanup
 */
export async function generateMarketOverviewEmail(): Promise<{
  html: string;
  error?: string;
}> {
  try {
    // Fetch TradingView heatmap screenshot
    console.log('Capturing TradingView heatmap...');
    const tradingViewScreenshot = await captureTradingViewMarketHeatmap(1200, 800);

    // Fetch Prestock token data
    console.log('Fetching Prestock token data...');
    const prestockTokens = await fetchAllPrestockData();

    // Fetch market insights from Perplexity
    console.log('Fetching market insights from Perplexity...');
    const marketInsights = await fetchMarketInsights();
    console.log(`Fetched ${marketInsights.length} market insights from Perplexity`);

    // Generate HTML email
    console.log('Generating email template...');
    const htmlEmail = generateEmailTemplate(
      tradingViewScreenshot,
      prestockTokens,
      new Date(),
      marketInsights
    );

    // Clean up browser instance
    await closeBrowser();

    return { html: htmlEmail };
  } catch (error) {
    console.error('Error generating market overview email:', error);
    
    // Ensure browser is closed on error
    try {
      await closeBrowser();
    } catch (closeError) {
      console.error('Error closing browser:', closeError);
    }

    return {
      html: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

