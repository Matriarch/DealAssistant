"use strict";

const { MessageFlags } = require("discord.js");

const { PAYMENT_METHODS } = require("../coins");
const { buildEmbed: renderEmbed, describeEmbed } = require("./embeds");
const { defineCommand } = require("./command");
const { redactError } = require("./logger");
const { createAddressQr, QR_FILENAME } = require("./qr");
const { replyEphemeral } = require("./replies");

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
 * Cached wrapper around the CoinGecko simple price endpoint.
 *
 * Simultaneous requests for the same currency share one in-flight promise, so a
 * burst of commands issues one HTTP request instead of several. Failures are
 * surfaced as PriceLookupError; there is no retry loop, because the public
 * endpoint rate limits aggressively and the command can still show the address.
 */
function createPriceService(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const ttlMs = options.ttlMs ?? PRICE_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? PRICE_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const cache = new Map();
  const inFlight = new Map();

  async function fetchPrice(priceId) {
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

    if (response.status === 429) {
      throw new PriceLookupError("price request was rate limited (HTTP 429)");
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

  async function getUsdPrice(priceId) {
    const cached = cache.get(priceId);
    if (cached && now() - cached.at < ttlMs) {
      return cached.usd;
    }

    let pending = inFlight.get(priceId);

    if (!pending) {
      pending = fetchPrice(priceId).finally(() => inFlight.delete(priceId));
      inFlight.set(priceId, pending);
    }

    return pending;
  }

  return {
    getUsdPrice,
    clearCache: () => {
      cache.clear();
      inFlight.clear();
    }
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

/**
 * Formats a crypto amount at a coin's precision.
 *
 * Returns null for values that must never be shown as a payment amount
 * (non-finite, zero or negative), so callers fall back to "rate unavailable"
 * instead of printing something misleading.
 */
function formatCrypto(value, decimals) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  let text = value.toFixed(decimals);

  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }

  if (Number(text) === 0) {
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

function describePayment({ commandName, method, address, amountUsd, price, includeQr }) {
  const spec = { title: method.title, fields: [] };

  if (typeof amountUsd === "number") {
    const lines = [];
    const converted =
      method.usdPeg || typeof price !== "number" ? null : formatCrypto(amountUsd / price, method.decimals);

    if (method.usdPeg) {
      const pegAmount = formatCrypto(amountUsd, method.decimals);
      lines.push(`${formatUsd(amountUsd)} \u2248 **${pegAmount ?? "?"} ${method.symbol}**`);
      lines.push(`_Assumes 1 ${method.symbol} = $1.00._`);
    } else if (converted) {
      lines.push(`${formatUsd(amountUsd)} \u2248 **${converted} ${method.symbol}**`);
      lines.push(`Rate: ${formatUsd(price)} per ${method.symbol}`);
      lines.push("_Estimate only \u2014 the rate moves._");
    } else {
      lines.push(`${formatUsd(amountUsd)} worth of ${method.symbol}`);
      lines.push("_Live rate unavailable right now \u2014 check the rate before sending._");
    }

    spec.fields.push({ name: "Amount", value: lines.join("\n") });
  } else if (method.priceId || method.usdPeg) {
    const example = commandName === "pay" ? "/pay currency:BTC amount:200" : `/${commandName} amount:200`;
    spec.description = `_Add \`amount\` to convert from USD, e.g. \`${example}\`._`;
  }

  spec.fields.push(
    { name: method.addressLabel ?? "Address", value: `\`\`\`text\n${address}\n\`\`\`` },
    { name: "Network", value: method.network }
  );
  if (includeQr) {
    spec.image = `attachment://${QR_FILENAME}`;
  }

  return spec;
}

function buildPaymentEmbed(args) {
  return renderEmbed(args.config, describePayment(args));
}

function addPaymentAmountOption(data) {
  return data.addNumberOption((option) =>
    option
      .setName("amount")
      .setDescription("Deal amount in USD (for example 200) to convert into crypto.")
      .setMinValue(MIN_AMOUNT_USD)
      .setMaxValue(MAX_AMOUNT_USD)
  );
}

function addQrOption(data) {
  return data.addBooleanOption((option) =>
    option.setName("qr").setDescription("Attach a QR code containing the receiving address.")
  );
}

async function sendPayment(interaction, { commandName, method, address, config, deps = {} }) {
  const amountUsd = interaction.options.getNumber("amount") ?? undefined;
  const wantsQr = config.paymentQrEnabled && interaction.options.getBoolean("qr") === true;

  if (amountUsd !== undefined && !isValidAmount(amountUsd)) {
    return replyEphemeral(interaction, `Amount must be between $${MIN_AMOUNT_USD} and $${MAX_AMOUNT_USD.toLocaleString("en-US")}.`);
  }
  if (amountUsd !== undefined && !method.priceId && !method.usdPeg) {
    return replyEphemeral(interaction, "This method provides payment details only. Run the command without an amount.");
  }
  if (wantsQr && !method.supportsQr) {
    return replyEphemeral(interaction, "QR codes are unavailable for this method. Run the command without the QR option.");
  }

  const needsConversion = amountUsd !== undefined && !method.usdPeg;
  const deferred = needsConversion || wantsQr;
  if (deferred) {
    await interaction.deferReply();
  }

  let price;
  if (needsConversion) {
    try {
      price = await (deps.priceService ?? defaultPriceService).getUsdPrice(method.priceId);
    } catch (error) {
      console.warn(`[price] ${method.symbol}: ${redactError(error).message}`);
    }
  }

  const files = [];
  if (wantsQr) {
    try {
      files.push({ attachment: await createAddressQr(address), name: QR_FILENAME });
    } catch {
      console.warn("[payment] Could not generate address QR code.");
    }
  }

  const payload = {
    embeds: [buildPaymentEmbed({ commandName, method, address, amountUsd, price, config, includeQr: files.length > 0 })],
    allowedMentions: { parse: [] }
  };
  if (files.length) {
    payload.files = files;
  } else if (wantsQr) {
    payload.content = "The QR code could not be generated. The receiving address is shown below.";
  }

  return deferred ? interaction.editReply(payload) : interaction.reply(payload);
}

/**
 * Builds a payment command for one of the supported currencies.
 *
 * The command is only created for currencies that have a configured address.
 * Any conversion path defers the interaction first, because a price lookup can
 * take several seconds while Discord requires an acknowledgement within three.
 */
function createPaymentCommand(commandName, config, deps = {}) {
  const method = { ...PAYMENT_METHODS[commandName], supportsQr: true };

  const data = addPaymentAmountOption(defineCommand(
    commandName,
    `Show the ${method.title} payment address, with an optional USD amount.`
  ));
  if (config.paymentQrEnabled) {
    addQrOption(data);
  }

  function describe({ amountUsd, price } = {}) {
    return describePayment({
      commandName,
      method,
      address: config.addresses[commandName] ?? "address",
      amountUsd,
      price: typeof price === "number" ? price : 50_000,
      config
    });
  }

  function buildEmbed(args = {}) {
    return renderEmbed(config, describe(args));
  }

  async function execute(interaction) {
    const address = config.addresses[commandName];

    if (!address) {
      await interaction.reply({
        content: `${method.envKey} is not configured. Add it to your .env file and restart the app.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    return sendPayment(interaction, { commandName, method, address, config, deps });
  }

  return { data, execute, buildEmbed, describe };
}

module.exports = {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  PRICE_CACHE_TTL_MS,
  PRICE_TIMEOUT_MS,
  PriceLookupError,
  addPaymentAmountOption,
  addQrOption,
  buildPaymentEmbed,
  createPaymentCommand,
  createPriceService,
  formatCrypto,
  formatUsd,
  isValidAmount,
  sendPayment
};
