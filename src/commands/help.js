"use strict";

const { defineCommand } = require("../utils/command");
const { buildEmbed, LIMITS } = require("../utils/embeds");
const { PAYMENT_COMMAND_NAMES } = require("../coins");

const CATEGORIES = new Map([
  ["Payments", new Set(["pay", ...PAYMENT_COMMAND_NAMES, "cashapp"])],
  ["Utilities", new Set(["info", "vouch", "middleman", "help"])],
  ["Calculations", new Set(["price", "convert", "fees"])]
]);

function formatCategories(commands, compact) {
  const grouped = new Map([...CATEGORIES.keys(), "Custom commands"].map((name) => [name, []]));
  for (const { data } of commands) {
    const category = [...CATEGORIES].find(([, names]) => names.has(data.name))?.[0] ?? "Custom commands";
    const name = `\`/${data.name}\``;
    grouped.get(category).push(compact ? name : `${name} — ${data.description}`);
  }
  return [...grouped]
    .filter(([, commands]) => commands.length > 0)
    .map(([category, commands]) => `**${category}**\n${commands.join(compact ? " " : "\n")}`)
    .join("\n\n");
}

module.exports = (config, deps = {}) => {
  const getCommands = deps.getCommands ?? (() => []);

  function describeHelp() {
    const commands = getCommands();
    const title = `${config.app.displayName} Commands`;
    let description = formatCategories(commands, false) || "_No commands are enabled._";
    if (description.length > Math.min(LIMITS.description, LIMITS.total - title.length - config.app.footer.length)) {
      description = formatCategories(commands, true);
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
