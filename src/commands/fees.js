"use strict";

const { MessageFlags } = require("discord.js");
const { FIAT_CURRENCIES } = require("../coins");
const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");
const { replyEphemeral } = require("../utils/replies");

const MAX_GROSS = 1_000_000;

function toHundredths(value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  const scaled = Math.round(value * 100);
  return scaled / 100 === value ? scaled : null;
}

module.exports = (config) => {
  const data = defineCommand("fees", "Calculate a fee and the amount remaining after it is deducted.")
    .addNumberOption((option) => option.setName("amount").setDescription("Gross amount.")
      .setRequired(true).setMinValue(0.01).setMaxValue(MAX_GROSS))
    .addNumberOption((option) => option.setName("percent").setDescription("Percentage fee, for example 2.50.")
      .setMinValue(0).setMaxValue(100))
    .addNumberOption((option) => option.setName("fixed").setDescription("Fixed fee in the selected currency.")
      .setMinValue(0).setMaxValue(MAX_GROSS))
    .addStringOption((option) => option.setName("fiat").setDescription("Currency (defaults to USD).")
      .addChoices(...FIAT_CURRENCIES.map((value) => ({ name: value, value }))));

  return {
    data,
    async execute(interaction) {
      const gross = toHundredths(interaction.options.getNumber("amount"), 0.01, MAX_GROSS);
      const percent = interaction.options.getNumber("percent");
      const fixed = interaction.options.getNumber("fixed");
      const fiat = interaction.options.getString("fiat") ?? "USD";
      if (gross === null || !FIAT_CURRENCIES.includes(fiat)) {
        return replyEphemeral(interaction, "Enter a supported currency and a gross amount from 0.01 to 1,000,000 with at most two decimals.");
      }
      if ((percent === null) === (fixed === null)) {
        return replyEphemeral(interaction, "Enter one fee using either percent or fixed.");
      }

      let fee;
      if (percent !== null) {
        const basisPoints = toHundredths(percent, 0, 100);
        fee = basisPoints === null ? null : Math.floor((gross * basisPoints + 5000) / 10_000);
      } else {
        fee = toHundredths(fixed, 0, gross / 100);
      }
      if (fee === null) {
        return replyEphemeral(interaction, "Enter a fee with at most two decimals. A percentage must be 0–100 and a fixed fee must fit within the gross amount.");
      }

      const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: fiat, currencyDisplay: "code" });
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [buildEmbed(config, {
          title: "Fee estimate",
          fields: [["Gross amount", gross], ["Fee", fee], ["Net amount", gross - fee]]
            .map(([name, cents]) => ({ name, value: formatter.format(cents / 100) }))
        })]
      });
    }
  };
};
