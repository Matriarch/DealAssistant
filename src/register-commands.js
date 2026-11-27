"use strict";

require("dotenv").config();

const { REST, Routes } = require("discord.js");

const { ConfigError, loadConfig } = require("./config");
const { createCommands } = require("./commands");

function readConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("Configuration error:");
      for (const problem of error.problems) {
        console.error(`  - ${problem}`);
      }
      console.error("\nCopy .env.example to .env and fill in the required values.");
      process.exit(1);
    }

    throw error;
  }
}

const config = readConfig();

for (const warning of config.warnings) {
  console.warn(`[config] ${warning}`);
}

const commands = createCommands(config).map((command) => command.data.toJSON());

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
  console.error(`Failed to register commands: ${error.message}`);
  process.exit(1);
});
