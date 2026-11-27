"use strict";

const { defineCommand } = require("../utils/command");
const { createEmbed } = require("../utils/embeds");

module.exports = (config, deps = {}) => {
  const getCommands = deps.getCommands ?? (() => []);

  return {
    data: defineCommand("help", "List the commands this application provides."),

    async execute(interaction) {
      const commands = getCommands();
      const lines = commands.map(
        (command) => `\`/${command.data.name}\` \u2014 ${command.data.description}`
      );

      const embed = createEmbed(config)
        .setTitle(`${config.app.displayName} Commands`)
        .setDescription(lines.length > 0 ? lines.join("\n") : "_No commands are enabled._");

      await interaction.reply({ embeds: [embed] });
    }
  };
};
