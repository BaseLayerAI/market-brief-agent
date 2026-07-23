// API endpoint to fetch Solana token data using Jupiter HTML page parsing only

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TokenDataRequest {
  addresses: string[];
}

interface PrestockData {
  address: string;
  tvlUSD?: number;
  volumeUSD: number;
  marketCap?: number;
  marketCapFormatted?: string;
  priceChange24h?: number;
}

interface TokenDataResponse {
  chainId: number;
  tokens: PrestockData[];
  error?: string;
}

/**
 * Fetches all token data from Jupiter HTML page by parsing __NEXT_DATA__
 * This includes: market cap, price, 24h price change, volume
 */
async function fetchJupiterTokenData(address: string): Promise<{
  marketCapFormatted?: string;
  marketCap?: number;
  priceChange24h?: number;
  volumeUSD: number;
  price?: number;
}> {
  try {
    const response = await fetch(`https://www.jup.ag/tokens/${address}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      return { volumeUSD: 0 };
    }
    
    const html = await response.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    
    if (!nextDataMatch) {
      return { volumeUSD: 0 };
    }
    
    const nextData = JSON.parse(nextDataMatch[1]);
    const tokenData = nextData?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data;
    
    if (!tokenData) {
      return { volumeUSD: 0 };
    }

    const result: {
      marketCapFormatted?: string;
      marketCap?: number;
      priceChange24h?: number;
      volumeUSD: number;
      price?: number;
    } = {
      volumeUSD: 0,
    };

    // Extract market cap (formatted from stockData)
    if (tokenData.stockData?.mcap) {
      const mcap = tokenData.stockData.mcap;
      // Format market cap
      if (mcap >= 1e12) {
        result.marketCapFormatted = `$${(mcap / 1e12).toFixed(2)}T`;
      } else if (mcap >= 1e9) {
        result.marketCapFormatted = `$${(mcap / 1e9).toFixed(2)}B`;
      } else if (mcap >= 1e6) {
        result.marketCapFormatted = `$${(mcap / 1e6).toFixed(2)}M`;
      } else if (mcap >= 1e3) {
        result.marketCapFormatted = `$${(mcap / 1e3).toFixed(2)}K`;
      } else {
        result.marketCapFormatted = `$${mcap.toFixed(2)}`;
      }
      result.marketCap = mcap;
    }

    // Extract 24h price change from stats24h
    if (tokenData.stats24h?.priceChange !== undefined) {
      result.priceChange24h = tokenData.stats24h.priceChange;
    }

    // Extract 24h volume (buyVolume + sellVolume)
    const buyVolume = tokenData.stats24h?.buyVolume || 0;
    const sellVolume = tokenData.stats24h?.sellVolume || 0;
    result.volumeUSD = buyVolume + sellVolume;

    // Extract current price (optional, for reference)
    if (tokenData.usdPrice) {
      result.price = tokenData.usdPrice;
    }

    return result;
  } catch (error) {
    console.error(`Error fetching Jupiter token data for ${address}:`, error);
    return { volumeUSD: 0 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: TokenDataRequest = await request.json();
    
    if (!body.addresses || !Array.isArray(body.addresses) || body.addresses.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: addresses array is required', chainId: 101, tokens: [] },
        { status: 400 }
      );
    }

    // Fetch data for all tokens in parallel
    const tokensWithData = await Promise.all(
      body.addresses.map(async (address: string) => {
        try {
          const jupiterData = await fetchJupiterTokenData(address);

          const result: PrestockData = {
            address,
            volumeUSD: jupiterData.volumeUSD,
            priceChange24h: jupiterData.priceChange24h,
            marketCap: jupiterData.marketCap,
            marketCapFormatted: jupiterData.marketCapFormatted,
          };

          return result;
        } catch (error) {
          console.error(`Error fetching data for Solana token ${address}:`, error);
          // Return token with zero values on error
          return {
            address,
            volumeUSD: 0,
          };
        }
      })
    );

    const response: TokenDataResponse = {
      chainId: 101, // Solana mainnet
      tokens: tokensWithData,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error processing token data request:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch token data',
        chainId: 101,
        tokens: [],
      },
      { status: 500 }
    );
  }
}
