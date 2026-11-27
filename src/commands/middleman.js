"use strict";

const { defineCommand } = require("../utils/command");
const { createEmbed } = require("../utils/embeds");

module.exports = (config) => ({
  data: defineCommand("middleman", "Show your middleman policy."),

  async execute(interaction) {
    const embed = createEmbed(config)
      .setTitle("Middleman Policy")
      .setDescription(config.texts.middlemanPolicy.join("\n\n"));

    await interaction.reply({ embeds: [embed] });
  }
});
