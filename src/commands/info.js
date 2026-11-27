"use strict";

const { renderTemplate } = require("../config");
const { defineCommand } = require("../utils/command");
const { createEmbed } = require("../utils/embeds");

module.exports = (config) => ({
  data: defineCommand("info", "Show your name, contact details, and links."),

  async execute(interaction) {
    const lines = [];

    if (config.contacts.marketplaceUrl) {
      lines.push(`**Marketplace:** ${config.contacts.marketplaceUrl}`);
    }
    if (config.contacts.telegramUrl) {
      lines.push(`**Telegram:** ${config.contacts.telegramUrl}`);
    }
    if (config.contacts.websiteUrl) {
      lines.push(`**Website:** ${config.contacts.websiteUrl}`);
    }
    if (config.contacts.email) {
      lines.push(`**Email:** ${config.contacts.email}`);
    }

    const embed = createEmbed(config)
      .setTitle(config.app.displayName)
      .setDescription(
        renderTemplate(config.texts.infoMessage, { displayName: config.app.displayName })
      );

    embed.addFields({
      name: "Contact",
      value:
        lines.length > 0
          ? lines.join("\n")
          : "_No contact links are configured. Set them in your .env file._"
    });

    await interaction.reply({ embeds: [embed] });
  }
});
