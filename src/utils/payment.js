"use strict";

const { MessageFlags } = require("discord.js");

const { PAYMENT_METHODS } = require("../coins");
const { createEmbed } = require("./embeds");
const { defineCommand } = require("./command");

const MIN_AMOUNT_USD = 1;
const MAX_AMOUNT_USD = 1_000_000;

const PRICE_CACHE_TTL_MS = 60 * 1000;
const PRICE_TIMEOUT_MS = 6 * 1000;
const PRICE_ENDPOINT = "https://api.coingecko.com/api/v3/simple/price";

class PriceLookupError extends Error {
  constructor(message) {
    super(message);
    this.name = "PriceLookupError";
  }
}

/**
 * Small cached wrapper around the CoinGecko simple price endpoint.
 *
 * The cache exists to keep the application well inside the public rate limit,
 * and every failure mode is surfaced as a PriceLookupError so callers can fall
 * back to showing the address without a conversion.
 */
function createPriceService(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const ttlMs = options.ttlMs ?? PRICE_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? PRICE_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map();

  async function getUsdPrice(priceId) {
    const cached = cache.get(priceId);
    if (cached && now() - cached.at < ttlMs) {
      return cached.usd;
    }

    if (typeof fetchImpl !== "function") {
      throw new PriceLookupError("no fetch implementation is available");
    }

    const url = `${PRICE_ENDPOINT}?ids=${encodeURIComponent(priceId)}&vs_currencies=usd`;

    let response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" }
      });
    } catch (error) {
      throw new PriceLookupError(`price request failed: ${error.message}`);
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

    const usd = payload?.[priceId]?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
      throw new PriceLookupError("price response contained no usable rate");
    }

    cache.set(priceId, { usd, at: now() });
    return usd;
  }

  return {
    getUsdPrice,
    clearCache: () => cache.clear()
  };
}

const defaultPriceService = createPriceService();

function formatUsd(value) {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

function formatCrypto(value, decimals) {
  let text = value.toFixed(decimals);

  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }

  if (Number(text) === 0 && value > 0) {
    return `< 0.${"0".repeat(decimals - 1)}1`;
  }

  return text;
}

function isValidAmount(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_AMOUNT_USD &&
    value <= MAX_AMOUNT_USD
  );
}

function buildPaymentEmbed({ commandName, method, address, amountUsd, price, priceUnavailable, config }) {
  const embed = createEmbed(config).setTitle(method.title);
  const safeAddress = String(address).replace(/`/g, "");

  if (typeof amountUsd === "number") {
    const lines = [];

    if (method.usdPeg) {
      lines.push(
        `${formatUsd(amountUsd)} \u2248 **${formatCrypto(amountUsd, method.decimals)} ${method.symbol}**`
      );
      lines.push(`_Assumes 1 ${method.symbol} = $1.00._`);
    } else if (typeof price === "number") {
      const cryptoAmount = amountUsd / price;
      lines.push(
        `${formatUsd(amountUsd)} \u2248 **${formatCrypto(cryptoAmount, method.decimals)} ${method.symbol}**`
      );
      lines.push(`Rate: ${formatUsd(price)} per ${method.symbol}`);
      lines.push("_Estimate only \u2014 the rate moves._");
    } else {
      lines.push(`${formatUsd(amountUsd)} worth of ${method.symbol}`);
      if (priceUnavailable) {
        lines.push("_Live rate unavailable right now \u2014 check the rate before sending._");
      }
    }

    embed.addFields({ name: "Amount", value: lines.join("\n") });
  } else {
    embed.setDescription(
      `_Add \`amount\` to convert from USD, e.g. \`/${commandName} amount:200\`._`
    );
  }

  embed.addFields(
    { name: "Address", value: `\`\`\`text\n${safeAddress}\n\`\`\`` },
    { name: "Network", value: method.network }
  );

  return embed;
}

/**
 * Builds a payment command for one of the supported currencies.
 *
 * The command is only created for currencies that have a configured address,
 * so users never see a command that cannot answer.
 */
function createPaymentCommand(commandName, config, deps = {}) {
  const method = PAYMENT_METHODS[commandName];
  const priceService = deps.priceService ?? defaultPriceService;

  const data = defineCommand(
    commandName,
    `Show the ${method.title} payment address, with an optional USD amount.`
  )
    .addNumberOption((option) =>
      option
        .setName("amount")
        .setDescription("Deal amount in USD (for example 200) to convert into crypto.")
        .setRequired(false)
        .setMinValue(MIN_AMOUNT_USD)
        .setMaxValue(MAX_AMOUNT_USD)
    );

  async function execute(interaction) {
    const address = config.addresses[commandName];

    if (!address) {
      await interaction.reply({
        content: `${method.envKey} is not configured. Add it to your .env file and restart the app.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const requestedAmount = interaction.options.getNumber("amount");
    const amountUsd = requestedAmount === null ? undefined : requestedAmount;

    if (amountUsd !== undefined && !isValidAmount(amountUsd)) {
      await interaction.reply({
        content: `Amount must be between $${MIN_AMOUNT_USD} and $${MAX_AMOUNT_USD.toLocaleString("en-US")}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    let price;
    let priceUnavailable = false;

    if (typeof amountUsd === "number" && !method.usdPeg) {
      try {
        price = await priceService.getUsdPrice(method.priceId);
      } catch (error) {
        console.error(`[price] ${method.symbol}: ${error.message}`);
        priceUnavailable = true;
      }
    }

    await interaction.reply({
      embeds: [
        buildPaymentEmbed({
          commandName,
          method,
          address,
          amountUsd,
          price,
          priceUnavailable,
          config
        })
      ]
    });
  }

  return { data, execute };
}

module.exports = {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  PRICE_CACHE_TTL_MS,
  PriceLookupError,
  buildPaymentEmbed,
  createPaymentCommand,
  createPriceService,
  formatCrypto,
  formatUsd,
  isValidAmount
};
