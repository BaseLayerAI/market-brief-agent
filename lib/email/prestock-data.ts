// Prestock token data fetcher using the solana/token-data API endpoint

/**
 * PrestockData interface representing all available information about a prestock token
 */
export interface PrestockData {
  /** Solana token address */
  address: string;
  /** Total Value Locked in USD from Jupiter (optional) */
  tvlUSD?: number;
  /** 24h trading volume in USD from CoinGecko */
  volumeUSD: number;
  /** Raw market cap number (optional) */
  marketCap?: number;
  /** Formatted market cap like "$472B" from Jupiter HTML parsing (optional) */
  marketCapFormatted?: string;
  /** 24h price change percentage from CoinGecko or yfinance (optional) */
  priceChange24h?: number;
}

/**
 * API response structure from the solana/token-data endpoint
 */
interface SolanaTokenDataResponse {
  chainId: number;
  tokens: PrestockData[];
  error?: string;
}

/**
 * Fetches all required information about prestocks (private company tokens on Solana) from the API endpoint.
 * 
 * @param addresses - Array of Solana token addresses to fetch data for
 * @param baseURL - Optional base URL for the API endpoint. If not provided:
 *                  - In browser: uses relative URL `/api/solana/token-data`
 *                  - In Node.js: defaults to `http://localhost:3000` (should be provided)
 * @returns Promise resolving to an array of PrestockData objects, one per input address
 */
export async function fetchPrestockData(
  addresses: string[],
  baseURL?: string
): Promise<PrestockData[]> {
  // Validate input
  if (!Array.isArray(addresses) || addresses.length === 0) {
    console.warn('fetchPrestockData: addresses must be a non-empty array');
    return [];
  }

  // Validate all addresses are non-empty strings
  const validAddresses = addresses.filter(
    (addr) => typeof addr === 'string' && addr.trim().length > 0
  );

  if (validAddresses.length === 0) {
    console.warn('fetchPrestockData: no valid addresses provided');
    return [];
  }

  // Determine API URL
  let apiUrl: string;
  if (baseURL) {
    // Remove trailing slash from baseURL if present
    const cleanBaseURL = baseURL.replace(/\/$/, '');
    apiUrl = `${cleanBaseURL}/api/solana/token-data`;
  } else {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      // Browser: use relative URL
      apiUrl = '/api/solana/token-data';
    } else {
      // Node.js: default to localhost (user should provide baseURL)
      console.warn(
        'fetchPrestockData: baseURL not provided in Node.js environment, defaulting to http://localhost:3000'
      );
      apiUrl = 'http://localhost:3000/api/solana/token-data';
    }
  }

  // Add cache-busting query parameter
  const urlWithTimestamp = `${apiUrl}?t=${Date.now()}`;

  try {
    // Make POST request to API endpoint
    const response = await fetch(urlWithTimestamp, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addresses: validAddresses }),
      cache: 'no-store',
    });

    // Handle HTTP errors
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If JSON parsing fails, use status text
        errorMessage = response.statusText || errorMessage;
      }

      console.error('fetchPrestockData: API request failed', {
        status: response.status,
        error: errorMessage,
      });

      // Return array with zero values for all addresses
      return validAddresses.map((address) => ({
        address,
        volumeUSD: 0,
      }));
    }

    // Parse JSON response
    let data: SolanaTokenDataResponse;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('fetchPrestockData: Failed to parse JSON response', parseError);
      // Return array with zero values for all addresses
      return validAddresses.map((address) => ({
        address,
        volumeUSD: 0,
      }));
    }

    // Validate response structure
    if (!data || !Array.isArray(data.tokens)) {
      console.error('fetchPrestockData: Invalid response structure', data);
      return validAddresses.map((address) => ({
        address,
        volumeUSD: 0,
      }));
    }

    // Create a map for quick lookup by address
    const dataMap = new Map<string, PrestockData>();
    data.tokens.forEach((token) => {
      if (token.address) {
        dataMap.set(token.address, token);
      }
    });

    // Return data in the same order as input addresses, with fallback for missing addresses
    return validAddresses.map((address) => {
      const tokenData = dataMap.get(address);
      if (tokenData) {
        return tokenData;
      }
      // If address not found in response, return with zero values
      return {
        address,
        volumeUSD: 0,
      };
    });
  } catch (error) {
    // Handle network errors and other exceptions
    console.error('fetchPrestockData: Network or other error', error);

    // Return array with zero values for all addresses
    return validAddresses.map((address) => ({
      address,
      volumeUSD: 0,
    }));
  }
}

// Prestock token definitions with metadata
export interface PrestockToken {
  address: string;
  symbol: string;
  name: string;
  logoPath: string;
  marketCapFormatted?: string;
  volumeUSD: number;
  priceChange24h?: number;
}

export const PRESTOCK_TOKENS = [
  {
    address: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
    symbol: "Anduril",
    name: "Anduril",
    logoPath: "/Private Companies/anduril.webp",
  },
  {
    address: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
    symbol: "Anthropic",
    name: "Anthropic",
    logoPath: "/Private Companies/anthropic.webp",
  },
  {
    address: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    symbol: "OpenAI",
    name: "OpenAI",
    logoPath: "/Private Companies/openai.webp",
  },
  {
    address: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    symbol: "SpaceX",
    name: "SpaceX",
    logoPath: "/Private Companies/spacex.webp",
  },
  {
    address: "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx",
    symbol: "xAI",
    name: "xAI",
    logoPath: "/Private Companies/xai.webp",
  },
];

/**
 * Fetches all Prestock token data using the API endpoint
 */
export async function fetchAllPrestockData(): Promise<PrestockToken[]> {
  // Extract addresses from token definitions
  const addresses = PRESTOCK_TOKENS.map((token) => token.address);

  // Fetch data from API endpoint
  // In Node.js environment, use localhost as baseURL
  const prestockData = await fetchPrestockData(
    addresses,
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  );

  // Create a map for quick lookup
  const dataMap = new Map<string, PrestockData>();
  prestockData.forEach((data) => {
    dataMap.set(data.address, data);
  });

  // Merge token metadata with fetched data
  const tokensWithData: PrestockToken[] = PRESTOCK_TOKENS.map((token) => {
    const data = dataMap.get(token.address);
    if (data) {
      return {
        ...token,
        marketCapFormatted: data.marketCapFormatted,
        volumeUSD: data.volumeUSD,
        priceChange24h: data.priceChange24h,
      };
    }
    // Fallback if data not found
    return {
      ...token,
      volumeUSD: 0,
    };
  });

  return tokensWithData;
}
