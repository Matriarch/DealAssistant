"use strict";

const { describeCustomCommand, readOptionValues } = require("../custom-commands");
const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");
const { replyEphemeral } = require("../utils/replies");

function createCustomCommand(config, command) {
  const data = defineCommand(command.name, command.description);
  for (const option of command.options) {
    data.addStringOption((builder) => builder
      .setName(option.name)
      .setDescription(option.description)
      .setMaxLength(option.maxLength));
  }

  return {
    data,
    async execute(interaction) {
      const values = readOptionValues(command.options, interaction);
      if (!values) {
        return replyEphemeral(interaction, "Enter plain text using letters, numbers, spaces, commas, apostrophes or hyphens within the option’s character limit.");
      }
      return interaction.reply({
        embeds: [buildEmbed(config, describeCustomCommand(command, config.app, values))],
        allowedMentions: { parse: [] }
      });
    }
  };
}

module.exports = { createCustomCommand };
