"use strict";

const { EmbedBuilder } = require("discord.js");

/**
 * Creates an embed that already carries the configured accent colour and,
 * when set, the configured footer. Every command builds on this so the
 * appearance stays consistent and configurable from one place.
 */
function createEmbed(config) {
  const embed = new EmbedBuilder().setColor(config.app.embedColor);

  if (config.app.footer) {
    embed.setFooter({ text: config.app.footer });
  }

  return embed;
}

module.exports = { createEmbed };
