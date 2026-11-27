"use strict";

const { MessageFlags } = require("discord.js");

const { defineCommand } = require("../utils/command");
const { createEmbed } = require("../utils/embeds");

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

    const embed = createEmbed(config)
      .setTitle("Cash App")
      .setDescription(`\`${config.cashAppTag}\`\n\n_Verify the tag before sending._`);

    await interaction.reply({ embeds: [embed] });
  }
});
