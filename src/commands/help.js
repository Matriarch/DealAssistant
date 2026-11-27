"use strict";

const { defineCommand } = require("../utils/command");
const { buildEmbed } = require("../utils/embeds");

module.exports = (config, deps = {}) => {
  const getCommands = deps.getCommands ?? (() => []);

  function describeHelp() {
    const commands = getCommands();
    const lines = commands.map(
      (command) => `\`/${command.data.name}\` \u2014 ${command.data.description}`
    );

    return {
      title: `${config.app.displayName} Commands`,
      description: lines.length > 0 ? lines.join("\n") : "_No commands are enabled._"
    };
  }

  return {
    data: defineCommand("help", "List the commands this application provides."),

    async execute(interaction) {
      await interaction.reply({ embeds: [buildEmbed(config, describeHelp())] });
    },

    buildEmbed: () => buildEmbed(config, describeHelp()),
    describe: () => describeHelp()
  };
};
