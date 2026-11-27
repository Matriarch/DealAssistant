"use strict";

const { escapeMarkdown, MessageFlags } = require("discord.js");

const { FIAT_CURRENCIES, PAYMENT_METHODS } = require("../coins");
const { buildEmbed: renderEmbed, describeEmbed } = require("./embeds");
const { defineCommand } = require("./command");
const { redactError } = require("./logger");
const { createAddressQr, QR_FILENAME } = require("./qr");
const { replyEphemeral } = require("./replies");
const {
  defaultPriceService, formatRate, formatRetrievedAt, unavailableRateMessage
} = require("./prices");

const MIN_AMOUNT_USD = 1;
const MAX_AMOUNT_USD = 1_000_000;

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
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    return null;
  }

  if (value < 10 ** -decimals) {
    return `< ${(10 ** -decimals).toFixed(decimals)}`;
  }

  return new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: decimals }).format(value);
}

function isValidAmount(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_AMOUNT_USD &&
    value <= MAX_AMOUNT_USD
  );
}

function describePayment({
  commandName, methodId, method, address, amountUsd, fiat = "USD", price, retrievedAt, rateError, includeQr
}) {
  const spec = { title: escapeMarkdown(method.title), fields: [] };

  if (typeof amountUsd === "number") {
    const requested = new Intl.NumberFormat("en-US", {
      style: "currency", currency: fiat, maximumFractionDigits: 20, minimumFractionDigits: 0
    }).format(amountUsd);
    const converted = formatCrypto(amountUsd / price, method.decimals);
    const lines = [`Requested: **${requested} (${fiat})**`];
    if (converted) {
      lines.push(`Approximate: **${converted} ${method.symbol}**`, "_Estimate only._");
      const rateLines = [formatRate(method.symbol, fiat, price)];
      if (retrievedAt !== undefined) {
        rateLines.push(`Retrieved ${formatRetrievedAt(retrievedAt)}`);
      }
      spec.fields.push({ name: "Amount", value: lines.join("\n") });
      spec.fields.push({ name: "Exchange rate", value: rateLines.join("\n") });
    } else {
      lines.push(`_${unavailableRateMessage(rateError ?? {})}_`);
      spec.fields.push({ name: "Amount", value: lines.join("\n") });
    }
  } else if (method.priceId) {
    const example = commandName === "pay" ? `/pay currency:${methodId} amount:200` : `/${commandName} amount:200`;
    spec.description = `_Add \`amount\` to convert from USD, e.g. \`${example}\`._`;
  }

  spec.fields.push(
    { name: method.addressLabel ?? "Address", value: `\`\`\`text\n${address}\n\`\`\`` },
    { name: "Network", value: escapeMarkdown(method.network) }
  );
  if (method.symbol) {
    spec.fields.push({ name: "Currency", value: method.symbol });
  }
  if (method.addressValidated === false) {
    spec.fields.push({ name: "Manual verification", value: "Compare this identifier with the recipient’s details before sending." });
  }
  if (method.instructions) {
    spec.fields.push({ name: "Payment instructions", value: method.instructions });
  }
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

async function sendPayment(interaction, { commandName, methodId, method, address, config, deps = {} }) {
  const amountUsd = interaction.options.getNumber("amount") ?? undefined;
  const fiat = commandName === "pay" ? interaction.options.getString("fiat") ?? "USD" : "USD";
  const wantsQr = config.paymentQrEnabled && interaction.options.getBoolean("qr") === true;

  if (!FIAT_CURRENCIES.includes(fiat)) {
    return replyEphemeral(interaction, "Select a supported fiat currency.");
  }
  if (amountUsd !== undefined && !isValidAmount(amountUsd)) {
    return replyEphemeral(interaction, `Amount must be between 1 and 1,000,000 ${fiat}.`);
  }
  if (amountUsd !== undefined && !method.priceId) {
    return replyEphemeral(interaction, "This method provides payment details only. Run the command without an amount.");
  }
  if (wantsQr && !method.supportsQr) {
    return replyEphemeral(interaction, "QR codes are unavailable for this method. Run the command without the QR option.");
  }

  const needsConversion = amountUsd !== undefined;
  const deferred = needsConversion || wantsQr;
  if (deferred) {
    await interaction.deferReply();
  }

  let price;
  let retrievedAt;
  let rateError;
  if (needsConversion) {
    try {
      const quote = await (deps.priceService ?? defaultPriceService).getPrice(method.priceId, fiat);
      price = quote.rate;
      retrievedAt = quote.retrievedAt;
    } catch (error) {
      rateError = error;
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
    embeds: [buildPaymentEmbed({
      commandName, methodId, method, address, amountUsd, fiat, price, retrievedAt, rateError, config, includeQr: files.length > 0
    })],
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
  addPaymentAmountOption,
  addQrOption,
  buildPaymentEmbed,
  createPaymentCommand,
  formatCrypto,
  formatUsd,
  isValidAmount,
  sendPayment
};
