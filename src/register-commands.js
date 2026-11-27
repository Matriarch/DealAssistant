"use strict";

require("dotenv").config();

const { REST, Routes } = require("discord.js");

const { ConfigError, loadConfig } = require("./config");
const { createCommands } = require("./commands");
const { assertEmbedsWithinLimits } = require("./validate");
const { redactError, registerSecret } = require("./utils/logger");

function withConfigErrors(work) {
  try {
    return work();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("Configuration error:");
      for (const problem of error.problems) {
        console.error(`  - ${problem}`);
      }
      console.error("\nCopy .env.example to .env and correct the values above.");
      process.exit(1);
    }

    throw error;
  }
}

const config = withConfigErrors(() => loadConfig());
registerSecret(config.discord.token);

for (const warning of config.warnings) {
  console.warn(`[config] ${warning}`);
}

const commands = withConfigErrors(() => {
  const built = createCommands(config);
  assertEmbedsWithinLimits(config, built);
  return built;
}).map((command) => command.data.toJSON());

if (commands.length === 0) {
  console.error("No commands are enabled, so there is nothing to register.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(config.discord.token);

(async () => {
  const registered = await rest.put(Routes.applicationCommands(config.discord.clientId), {
    body: commands
  });

  console.log(`Registered ${registered.length} global command(s):`);
  for (const command of registered) {
    console.log(`  /${command.name}`);
  }
  console.log("\nRe-run this after changing command names, options, or enabled payout methods.");
  console.log("Discord can take up to an hour to propagate global commands.");
})().catch((error) => {
  console.error(`Failed to register commands: ${redactError(error).message}`);
  process.exit(1);
});
