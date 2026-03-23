import axios from "axios";
import NodeCache from "node-cache";

// Cache: 5min for on-chain data, 24h for airdrop listings
const cache = new NodeCache({ stdTTL: 300 });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const TWITTER_RAPIDAPI_HOST = process.env.TWITTER_RAPIDAPI_HOST;

// ============================================================================
// Etherscan — on-chain activity
// ============================================================================

export interface EthTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  isError: string;
  contractAddress: string;
}

export async function getWalletTransactions(address: string, chain: string = "ethereum"): Promise<EthTx[]> {
  const cacheKey = `txns:${chain}:${address}`;
  const cached = cache.get<EthTx[]>(cacheKey);
  if (cached) return cached;

  const chainId = getChainId(chain);
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=100&page=1&apikey=${ETHERSCAN_API_KEY || "YourApiKeyToken"}`;

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const txns = (res.data?.result || []) as EthTx[];
    if (Array.isArray(txns) && txns.length > 0) {
      cache.set(cacheKey, txns, 300); // only cache non-empty results
      return txns;
    }
    return [];
  } catch (err) {
    console.error(`[Etherscan] Error fetching txns for ${address}:`, err);
    return [];
  }
}

export async function getWalletAge(address: string, chain: string = "ethereum"): Promise<number> {
  // Returns age in days
  const txns = await getWalletTransactions(address, chain);
  if (txns.length === 0) return 0;

  const oldest = txns.reduce((min, tx) => {
    const ts = parseInt(tx.timeStamp || "0");
    return ts < min ? ts : min;
  }, Date.now() / 1000);

  return Math.floor((Date.now() / 1000 - oldest) / 86400);
}

export async function getUniqueProtocols(address: string, chain: string = "ethereum"): Promise<string[]> {
  const txns = await getWalletTransactions(address, chain);
  const contracts = new Set<string>();
  txns.forEach((tx) => {
    if (tx.to && tx.to !== address.toLowerCase() && tx.to !== "") {
      contracts.add(tx.to.toLowerCase());
    }
  });
  return Array.from(contracts);
}

function getChainId(chain: string): number {
  const mapping: Record<string, number> = {
    ethereum: 1,
    mainnet: 1,
    base: 8453,
    arbitrum: 42161,
    optimism: 10,
    polygon: 137,
    bsc: 56,
    avalanche: 43114,
  };
  return mapping[chain.toLowerCase()] || 1;
}

// ============================================================================
// DeFiLlama — protocol TVL and discovery
// ============================================================================

export interface DefiProtocol {
  name: string;
  slug: string;
  tvl: number;
  chainTvls: Record<string, number>;
  chains: string[];
  category: string;
  token: string | null;
  description: string;
  url: string;
}

export async function getTokenlessProtocols(minTvl: number = 10_000_000): Promise<DefiProtocol[]> {
  const cacheKey = `defillama:tokenless:${minTvl}`;
  const cached = cache.get<DefiProtocol[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get("https://api.llama.fi/protocols", { timeout: 15000 });
    const protocols = (res.data || []) as DefiProtocol[];

    const tokenless = protocols
      .filter((p) => !p.token && (p.tvl || 0) >= minTvl)
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
      .slice(0, 50);

    cache.set(cacheKey, tokenless, 86400); // 24h cache
    return tokenless;
  } catch (err) {
    console.error("[DeFiLlama] Error fetching protocols:", err);
    return [];
  }
}

// ============================================================================
// Crypto Events Calendar (RapidAPI) — airdrop listings
// ============================================================================

export interface CryptoEvent {
  title: string;
  description: string;
  date: string;
  type: string;
  coin: string;
  source: string;
}

// ============================================================================
// Twitter/X search via RapidAPI wrapper
// ============================================================================

export interface Tweet {
  id: string;
  text: string;
  author: string;
  date: string;
  url: string;
  likes: number;
  retweets: number;
}

export async function searchTwitterAirdrops(query: string, limit = 10): Promise<Tweet[]> {
  if (!TWITTER_RAPIDAPI_HOST || !RAPIDAPI_KEY) return [];

  const cacheKey = `twitter:${query}:${limit}`;
  const cached = cache.get<Tweet[]>(cacheKey);
  if (cached) return cached;

  try {
    // twitter-api45: GET /search.php?query=...&search_type=Top
    const res = await axios.get(`https://${TWITTER_RAPIDAPI_HOST}/search.php`, {
      params: { query, search_type: "Top" },
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": TWITTER_RAPIDAPI_HOST,
      },
      timeout: 10000,
    });

    const data = res.data;
    // twitter-api45 returns { status: "ok", timeline: [{tweet_id, screen_name, text, favorites, retweets, ...}] }
    const rawItems: unknown[] = Array.isArray(data?.timeline)
      ? data.timeline
      : Array.isArray(data)
      ? data
      : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tweets: Tweet[] = (rawItems as any[])
      .filter((item) => item?.type === "tweet" || item?.tweet_id)
      .map((item) => {
        const id = item.tweet_id || item.id_str || item.id || "";
        return {
          id,
          text: item.text || item.full_text || "",
          author: item.screen_name || item.user?.screen_name || "unknown",
          date: item.created_at || "",
          url: id ? `https://x.com/i/status/${id}` : "",
          likes: item.favorites ?? item.favorite_count ?? 0,
          retweets: item.retweets ?? item.retweet_count ?? 0,
        };
      })
      .filter((t) => t.text);

    if (tweets.length > 0) {
      cache.set(cacheKey, tweets, 7200); // 2 hour cache
    }
    return tweets;
  } catch (err) {
    console.error("[Twitter] Error searching tweets:", err);
    return [];
  }
}

export async function getAirdropEvents(): Promise<CryptoEvent[]> {
  const cacheKey = "events:airdrops";
  const cached = cache.get<CryptoEvent[]>(cacheKey);
  if (cached) return cached;

  if (!RAPIDAPI_KEY) {
    return []; // No key — return empty, Claude will fall back to web search
  }

  try {
    const res = await axios.get("https://crypto-events-calendar.p.rapidapi.com/events", {
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": "crypto-events-calendar.p.rapidapi.com",
      },
      timeout: 10000,
    });

    const events = ((res.data?.events || res.data || []) as CryptoEvent[])
      .filter((e) => e.type?.toLowerCase().includes("airdrop") || e.title?.toLowerCase().includes("airdrop"));

    cache.set(cacheKey, events, 86400); // 24h cache — stays within free tier
    return events;
  } catch (err) {
    console.error("[Events Calendar] Error:", err);
    return [];
  }
}
