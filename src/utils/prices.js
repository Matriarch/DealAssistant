"use strict";

const { FIAT_CURRENCIES } = require("../coins");

const PRICE_CACHE_TTL_MS = 60_000;
const PRICE_TIMEOUT_MS = 6_000;
const PRICE_ENDPOINT = "https://api.coingecko.com/api/v3/simple/price";
const FIAT_QUERY = FIAT_CURRENCIES.map((currency) => currency.toLowerCase()).join(",");

class PriceLookupError extends Error {
  constructor(message, { rateLimited = false } = {}) {
    super(message);
    this.name = "PriceLookupError";
    this.rateLimited = rateLimited;
  }
}

function createPriceService(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const ttlMs = options.ttlMs ?? PRICE_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? PRICE_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const cache = new Map();
  const inFlight = new Map();

  async function fetchPrices(priceId) {
    const url = `${PRICE_ENDPOINT}?ids=${encodeURIComponent(priceId)}&vs_currencies=${FIAT_QUERY}&precision=full`;
    let response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" }
      });
    } catch (error) {
      throw new PriceLookupError(`price request failed: ${error?.message ?? "network error"}`);
    }

    if (response.status === 429) {
      throw new PriceLookupError("price request was rate limited (HTTP 429)", { rateLimited: true });
    }
    if (!response.ok) {
      throw new PriceLookupError(`price request returned HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new PriceLookupError("price response was not valid JSON");
    }

    const rates = new Map();
    for (const fiat of FIAT_CURRENCIES) {
      const rate = payload?.[priceId]?.[fiat.toLowerCase()];
      if (Number.isFinite(rate) && rate > 0) {
        rates.set(fiat, rate);
      }
    }
    if (rates.size === 0) {
      throw new PriceLookupError("price response contained no usable rate");
    }

    return { rates, retrievedAt: now() };
  }

  async function getPrice(priceId, fiat = "USD") {
    if (!FIAT_CURRENCIES.includes(fiat)) {
      throw new PriceLookupError("unsupported fiat currency");
    }

    let prices = cache.get(priceId);
    if (!prices || now() - prices.retrievedAt >= ttlMs) {
      cache.delete(priceId);
      let pending = inFlight.get(priceId);
      if (!pending) {
        pending = fetchPrices(priceId).then((result) => {
          if (inFlight.get(priceId) === pending) {
            cache.set(priceId, result);
          }
          return result;
        }).finally(() => {
          if (inFlight.get(priceId) === pending) {
            inFlight.delete(priceId);
          }
        });
        inFlight.set(priceId, pending);
      }
      prices = await pending;
    }

    const rate = prices.rates.get(fiat);
    if (rate === undefined) {
      throw new PriceLookupError("price response contained no usable rate for the requested fiat currency");
    }
    return { rate, retrievedAt: prices.retrievedAt };
  }

  return {
    getPrice,
    getUsdPrice: async (priceId) => (await getPrice(priceId)).rate,
    clearCache() {
      cache.clear();
      inFlight.clear();
    }
  };
}

function formatRate(symbol, fiat, rate) {
  const value = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 8 }).format(rate);
  return `1 ${symbol} ≈ ${value} ${fiat}`;
}

function formatRetrievedAt(retrievedAt) {
  return `<t:${Math.floor(retrievedAt / 1000)}:F>`;
}

function unavailableRateMessage(error) {
  return error.rateLimited
    ? "Live rate unavailable. CoinGecko is rate limiting requests. Try again later."
    : "Live rate unavailable. Try again later.";
}

module.exports = {
  PRICE_CACHE_TTL_MS,
  PRICE_TIMEOUT_MS,
  PriceLookupError,
  createPriceService,
  defaultPriceService: createPriceService(),
  formatRate,
  formatRetrievedAt,
  unavailableRateMessage
};
