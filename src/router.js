"use strict";

const { guardInteraction } = require("./auth");
const { redactError } = require("./utils/logger");
const { replyEphemeral } = require("./utils/replies");

const UNAVAILABLE_COMMAND_MESSAGE =
  "That command is not available. It may be disabled in this configuration, or the " +
  "registered commands may be out of date. Run the command registration step and try again.";

/**
 * Builds the InteractionCreate handler.
 *
 * Authorisation happens once, before command lookup, so an unknown or disabled
 * command never becomes a way to probe the application.
 *
 * @param {object} options
 * @param {string} options.ownerId
 * @param {Map<string, {execute: Function}>} options.commandMap
 */
function createInteractionHandler({ ownerId, commandMap }) {
  return async function handleInteraction(interaction) {
    if (!(await guardInteraction(interaction, ownerId))) {
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandMap.get(interaction.commandName);

    if (!command) {
      await replyEphemeral(interaction, UNAVAILABLE_COMMAND_MESSAGE);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[command] /${interaction.commandName} failed:`, redactError(error));
      await replyEphemeral(interaction, "Something went wrong while running that command.");
    }
  };
}

module.exports = { UNAVAILABLE_COMMAND_MESSAGE, createInteractionHandler };
