"use strict";

const { defineCommand } = require("../utils/command");
const { buildEmbed, LIMITS } = require("../utils/embeds");

module.exports = (config, deps = {}) => {
  const getCommands = deps.getCommands ?? (() => []);

  function describeHelp() {
    const commands = getCommands();
    const lines = commands.map(
      (command) => `\`/${command.data.name}\` \u2014 ${command.data.description}`
    );
    const title = `${config.app.displayName} Commands`;
    let description = lines.join("\n") || "_No commands are enabled._";
    if (description.length > Math.min(LIMITS.description, LIMITS.total - title.length - config.app.footer.length)) {
      description = commands.map((command) => `\`/${command.data.name}\``).join(" ");
    }

    return { title, description };
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
