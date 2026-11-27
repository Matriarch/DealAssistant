"use strict";

require("dotenv").config();

const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags
} = require("discord.js");

const { ConfigError, loadConfig } = require("./config");
const { guardInteraction } = require("./auth");
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

const commands = createCommands(config);
const commandMap = new Collection(commands.map((command) => [command.data.name, command]));

if (commandMap.size === 0) {
  console.error("No commands are enabled. Check ENABLED_COMMANDS and your address settings.");
  process.exit(1);
}

// Only the Guilds intent is needed: every response is an interaction reply,
// so message content access is never required.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);
  console.log(`Owner ID: ${config.discord.ownerId}`);
  console.log(`Commands: ${[...commandMap.keys()].map((name) => `/${name}`).join(", ")}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Single authorisation gate for every interaction type.
  if (!(await guardInteraction(interaction, config.discord.ownerId))) {
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandMap.get(interaction.commandName);

  if (!command) {
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[command] /${interaction.commandName} failed:`, error);

    const payload = {
      content: "Something went wrong while running that command.",
      flags: MessageFlags.Ephemeral
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyError) {
      console.error(`[command] could not report the error: ${replyError.message}`);
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("[client]", error);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down.`);
  client.destroy().finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection:", reason);
});

client.login(config.discord.token).catch((error) => {
  console.error(`Failed to log in: ${error.message}`);
  process.exit(1);
});
