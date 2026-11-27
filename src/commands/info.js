"use strict";

const { renderTemplate } = require("../config");
const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");

function describeInfo(config) {
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

  return {
    title: config.app.displayName,
    description: renderTemplate(config.texts.infoMessage, {
      displayName: config.app.displayName
    }),
    fields: [
      {
        name: "Contact",
        value:
          lines.length > 0
            ? lines.join("\n")
            : "_No contact links are configured. Set them in your .env file._"
      }
    ]
  };
}

module.exports = (config) => ({
  data: defineCommand("info", "Show your name and contact details."),

  async execute(interaction) {
    await interaction.reply({ embeds: [buildEmbed(config, describeInfo(config))] });
  },

  buildEmbed: () => buildEmbed(config, describeInfo(config)),
  describe: () => describeInfo(config)
});
