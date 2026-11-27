"use strict";

const { MessageFlags } = require("discord.js");

const { renderTemplate } = require("../config");
const { defineCommand } = require("../utils/command");
const { createEmbed } = require("../utils/embeds");
const { formatUsd, MAX_AMOUNT_USD, MIN_AMOUNT_USD } = require("../utils/payment");

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

    const template =
      typeof amount === "number"
        ? config.texts.vouchTemplate
        : config.texts.vouchTemplateNoAmount;

    const embed = createEmbed(config)
      .setTitle("Vouch")
      .setDescription(
        renderTemplate(template, {
          amount: typeof amount === "number" ? formatUsd(amount) : "",
          displayName: config.app.displayName
        })
      );

    if (config.contacts.marketplaceUrl) {
      embed.addFields({ name: "Marketplace Profile", value: config.contacts.marketplaceUrl });
    }

    if (config.contacts.vouchThreadUrl) {
      embed.addFields({ name: "Vouch Thread", value: config.contacts.vouchThreadUrl });
    }

    await interaction.reply({ embeds: [embed] });
  }
});
