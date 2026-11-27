"use strict";

const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");

function describeMiddleman(config) {
  return {
    title: "Middleman Policy",
    description: config.texts.middlemanPolicy.join("\n\n")
  };
}

module.exports = (config) => ({
  data: defineCommand("middleman", "Show your middleman policy."),

  async execute(interaction) {
    await interaction.reply({ embeds: [buildEmbed(config, describeMiddleman(config))] });
  },

  buildEmbed: () => buildEmbed(config, describeMiddleman(config)),
  describe: () => describeMiddleman(config)
});
