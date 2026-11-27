"use strict";

const { MessageFlags } = require("discord.js");
const { FIAT_CURRENCIES, PRICED_COINS } = require("../coins");
const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");
const { formatCrypto } = require("../utils/payment");
const {
  defaultPriceService, formatNumber, formatRate, formatRetrievedAt, unavailableRateMessage
} = require("../utils/prices");
const { replyEphemeral } = require("../utils/replies");
const { redactError } = require("../utils/logger");

const MIN_CONVERSION = 0.00000001;
const MAX_CONVERSION = 1_000_000_000;

function currencyOption(option, name, description, values, required = true) {
  return option.setName(name)
    .setDescription(description)
    .setRequired(required)
    .addChoices(...[...values].map((value) => ({ name: value, value })));
}

async function replyWithRate(interaction, { config, service, symbol, fiat, describe }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let quote;
  try {
    quote = await service.getPrice(PRICED_COINS.get(symbol).priceId, fiat);
  } catch (error) {
    console.warn("[price]", redactError(error));
    return interaction.editReply({ content: unavailableRateMessage(error) });
  }

  const spec = describe(quote.rate);
  if (!spec) {
    return interaction.editReply({ content: "The converted amount is outside the displayable range." });
  }
  spec.fields = [
    { name: "Exchange rate", value: formatRate(symbol, fiat, quote.rate) },
    { name: "Retrieved", value: formatRetrievedAt(quote.retrievedAt) }
  ];
  return interaction.editReply({ embeds: [buildEmbed(config, spec)], allowedMentions: { parse: [] } });
}

function createPriceCommand(config, { priceService = defaultPriceService } = {}) {
  return {
    data: defineCommand("price", "Look up a cryptocurrency price.")
      .addStringOption((option) => currencyOption(option, "currency", "Cryptocurrency.", PRICED_COINS.keys()))
      .addStringOption((option) => currencyOption(option, "fiat", "Price currency (defaults to USD).", FIAT_CURRENCIES, false)),
    async execute(interaction) {
      const symbol = interaction.options.getString("currency");
      const fiat = interaction.options.getString("fiat") ?? "USD";
      if (!PRICED_COINS.has(symbol) || !FIAT_CURRENCIES.includes(fiat)) {
        return replyEphemeral(interaction, "Select a supported cryptocurrency and fiat currency.");
      }
      return replyWithRate(interaction, {
        config, service: priceService, symbol, fiat,
        describe: () => ({ title: `${symbol} price`, description: "Market estimate from CoinGecko." })
      });
    }
  };
}

function createConvertCommand(config, { priceService = defaultPriceService } = {}) {
  const currencies = [...FIAT_CURRENCIES, ...PRICED_COINS.keys()];
  return {
    data: defineCommand("convert", "Estimate a conversion between fiat and cryptocurrency.")
      .addNumberOption((option) => option.setName("amount").setDescription("Amount to convert.")
        .setRequired(true).setMinValue(MIN_CONVERSION).setMaxValue(MAX_CONVERSION))
      .addStringOption((option) => currencyOption(option, "from", "Source currency.", currencies))
      .addStringOption((option) => currencyOption(option, "to", "Target currency.", currencies)),
    async execute(interaction) {
      const amount = interaction.options.getNumber("amount");
      const from = interaction.options.getString("from");
      const to = interaction.options.getString("to");
      const fromFiat = FIAT_CURRENCIES.includes(from);
      const symbol = fromFiat ? to : from;
      const fiat = fromFiat ? from : to;
      if (!PRICED_COINS.has(symbol) || !FIAT_CURRENCIES.includes(fiat)) {
        return replyEphemeral(interaction, "Choose one supported cryptocurrency and one fiat currency.");
      }
      if (!Number.isFinite(amount) || amount < MIN_CONVERSION || amount > MAX_CONVERSION) {
        return replyEphemeral(interaction, "Enter an amount between 0.00000001 and 1,000,000,000.");
      }
      return replyWithRate(interaction, {
        config, service: priceService, symbol, fiat,
        describe(rate) {
          const converted = formatCrypto(fromFiat ? amount / rate : amount * rate,
            fromFiat ? PRICED_COINS.get(symbol).decimals : 2);
          if (converted === null) {
            return null;
          }
          const input = formatNumber(amount, 20);
          const relation = converted.startsWith("<") ? `→ ${converted}` : `≈ ${converted}`;
          return { title: "Conversion estimate", description: `**${input} ${from} ${relation} ${to}**` };
        }
      });
    }
  };
}

module.exports = { createPriceCommand, createConvertCommand };
