"use strict";

require("dotenv").config();

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits
} = require("discord.js");

const { ConfigError, loadConfig } = require("./config");
const { createCommands } = require("./commands");
const { assertEmbedsWithinLimits } = require("./validate");
const { createInteractionHandler } = require("./router");
const { redactError, registerSecret } = require("./utils/logger");

/**
 * Runs startup work that can fail because of configuration, printing every
 * problem before exiting rather than leaving a half-started process.
 */
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

// Register the token so it can never be echoed by a log line.
registerSecret(config.discord.token);

for (const warning of config.warnings) {
  console.warn(`[config] ${warning}`);
}

const commands = withConfigErrors(() => {
  const built = createCommands(config);
  assertEmbedsWithinLimits(config, built);
  return built;
});

const commandMap = new Collection(commands.map((command) => [command.data.name, command]));

if (commandMap.size === 0) {
  console.error("No commands are enabled. Check ENABLED_COMMANDS and your address settings.");
  process.exit(1);
}

// Only the Guilds intent is needed: every response is an interaction reply.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
  console.log(`Commands: ${[...commandMap.keys()].map((name) => `/${name}`).join(", ")}`);
});

client.on(
  Events.InteractionCreate,
  createInteractionHandler({ ownerId: config.discord.ownerId, commandMap })
);

client.on(Events.Error, (error) => {
  console.error("[client]", redactError(error));
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down.`);
  client.destroy().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection:", redactError(reason));
});

client.login(config.discord.token).catch((error) => {
  console.error(`Failed to log in: ${redactError(error).message}`);
  process.exit(1);
});
