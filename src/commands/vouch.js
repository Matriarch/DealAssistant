"use strict";

const { MessageFlags } = require("discord.js");

const { renderTemplate } = require("../config");
const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");
const {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  formatUsd,
  isValidAmount
} = require("../utils/payment");

function describeVouch(config, amount) {
  const template =
    typeof amount === "number" ? config.texts.vouchTemplate : config.texts.vouchTemplateNoAmount;

  const spec = {
    title: "Vouch",
    description: renderTemplate(template, {
      amount: typeof amount === "number" ? formatUsd(amount) : "",
      displayName: config.app.displayName
    }),
    fields: []
  };

  if (config.contacts.marketplaceUrl) {
    spec.fields.push({ name: "Marketplace Profile", value: config.contacts.marketplaceUrl });
  }

  if (config.contacts.vouchThreadUrl) {
    spec.fields.push({ name: "Vouch Thread", value: config.contacts.vouchThreadUrl });
  }

  return spec;
}

module.exports = (config) => ({
  data: defineCommand("vouch", "Share your marketplace profile and vouch thread.").addNumberOption(
    (option) =>
      option
        .setName("amount")
        .setDescription("Deal amount in USD (for example 200) to mention in the vouch.")
        .setRequired(false)
        .setMinValue(MIN_AMOUNT_USD)
        .setMaxValue(MAX_AMOUNT_USD)
  ),

  async execute(interaction) {
    if (!config.contacts.marketplaceUrl && !config.contacts.vouchThreadUrl) {
      await interaction.reply({
        content:
          "Vouch links are not configured. Set MARKETPLACE_PROFILE_URL and/or VOUCH_THREAD_URL.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const amount = interaction.options.getNumber("amount");

    if (amount !== null && !isValidAmount(amount)) {
      await interaction.reply({
        content: `Amount must be between $${MIN_AMOUNT_USD} and $${MAX_AMOUNT_USD.toLocaleString("en-US")}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({ embeds: [buildEmbed(config, describeVouch(config, amount))] });
  },

  buildEmbed: ({ amountUsd } = {}) => buildEmbed(config, describeVouch(config, amountUsd)),
  describe: ({ amountUsd } = {}) => describeVouch(config, amountUsd)
});
