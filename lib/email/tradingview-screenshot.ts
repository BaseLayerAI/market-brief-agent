// TradingView heatmap screenshot service using Puppeteer

import puppeteer, { Browser } from 'puppeteer';

let browser: Browser | null = null;

/**
 * Gets or creates a browser instance (reused for efficiency)
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });
  }
  return browser;
}

/**
 * Closes the browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Capture screenshot from TradingView's market heatmap page
 * This uses the actual heatmap page instead of widget
 */
export async function captureTradingViewMarketHeatmap(
  width: number = 1200,
  height: number = 800
): Promise<string> {
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    await page.setViewport({ width, height });

    // Navigate to TradingView stock heatmap with SPX500 configuration
    const heatmapUrl = 'https://www.tradingview.com/heatmap/stock/#%7B%22dataSource%22%3A%22SPX500%22%2C%22blockColor%22%3A%22change%22%2C%22blockSize%22%3A%22market_cap_basic%22%2C%22grouping%22%3A%22sector%22%7D';
    
    await page.goto(heatmapUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for page to load and heatmap to render
    await page.waitForTimeout(5000);

    // Wait for heatmap content to be visible
    try {
      await page.waitForSelector('[class*="heatmap"], [class*="chart"], canvas, svg', { timeout: 10000 });
    } catch (e) {
      console.warn('Heatmap selector not found, proceeding with screenshot');
    }

    // Calculate crop dimensions: remove top 15% and bottom 10%
    const topCropPercent = 0.21;
    const bottomCropPercent = 0.05;
    const cropY = Math.round(height * topCropPercent);
    const cropHeight = Math.round(height * (1 - topCropPercent - bottomCropPercent));

    // Take screenshot of the heatmap section with cropping
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      encoding: 'base64',
      clip: {
        x: 0,
        y: cropY,
        width: width,
        height: cropHeight,
      },
    });

    return screenshot as string;
  } catch (error) {
    console.error('Error capturing TradingView market heatmap:', error);
    throw error;
  } finally {
    await page.close();
  }
}

