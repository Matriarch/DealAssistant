"use strict";

const { ConfigError } = require("./config");
const { checkEmbedLimits, describeEmbed } = require("./utils/embeds");
const { MAX_AMOUNT_USD } = require("./utils/payment");

/**
 * Renders every command's embed content at its widest possible configuration
 * and checks it against Discord's limits.
 *
 * Configuration text is substituted before measuring, so an oversized info
 * message or middleman policy is reported at startup instead of failing when
 * somebody runs the command. This runs before any EmbedBuilder is constructed,
 * because the builder rejects oversized values with an opaque error.
 */
function collectEmbedProblems(config, commands) {
  const problems = new Set();

  for (const command of commands) {
    if (typeof command.describe !== "function") {
      continue;
    }

    const label = `/${command.data.name}`;

    for (const args of [{ amountUsd: MAX_AMOUNT_USD }, {}]) {
      let described;

      try {
        described = describeEmbed(config, command.describe(args));
      } catch (error) {
        problems.add(`${label} could not be rendered: ${error.message}`);
        continue;
      }

      for (const problem of checkEmbedLimits(described, label)) {
        problems.add(problem);
      }
    }
  }

  return [...problems];
}

function assertEmbedsWithinLimits(config, commands) {
  const problems = collectEmbedProblems(config, commands);

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }
}

module.exports = { assertEmbedsWithinLimits, collectEmbedProblems };
