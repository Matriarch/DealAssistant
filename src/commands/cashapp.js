"use strict";

const { MessageFlags } = require("discord.js");

const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");

function describeCashApp(config) {
  return {
    title: "Cash App",
    description: `\`${config.cashAppTag}\`\n\n_Verify the tag before sending._`
  };
}

module.exports = (config) => ({
  data: defineCommand("cashapp", "Show the configured Cash App tag."),

  async execute(interaction) {
    if (!config.cashAppTag) {
      await interaction.reply({
        content: "CASHAPP_TAG is not configured. Add it to your .env file and restart the app.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({ embeds: [buildEmbed(config, describeCashApp(config))] });
  },

  buildEmbed: () => buildEmbed(config, describeCashApp(config)),
  describe: () => describeCashApp(config)
});
