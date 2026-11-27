"use strict";

const { MessageFlags } = require("discord.js");
const { redactError } = require("./utils/logger");

const DENIED_MESSAGE = "This application is private. Only its configured owner can run its commands.";

/**
 * True only when the interacting user is exactly the configured owner.
 * Fails closed: a missing or malformed id is never treated as authorised.
 */
function isOwner(userId, ownerId) {
  return (
    typeof userId === "string" &&
    typeof ownerId === "string" &&
    userId.length > 0 &&
    ownerId.length > 0 &&
    userId === ownerId
  );
}

/**
 * Rejects an interaction that did not come from the owner.
 *
 * Covers every interaction shape the application can receive, so buttons,
 * modals and autocomplete can never be used to bypass command authorisation.
 */
async function denyInteraction(interaction) {
  try {
    if (typeof interaction.isRepliable === "function" && interaction.isRepliable()) {
      const payload = { content: DENIED_MESSAGE, flags: MessageFlags.Ephemeral };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
      return;
    }

    // Autocomplete interactions cannot send messages, only choices.
    if (typeof interaction.respond === "function") {
      await interaction.respond([]);
    }
  } catch (error) {
    // Never let a failed denial crash the process.
    console.error(`[auth] failed to reject interaction: ${redactError(error).message}`);
  }
}

/**
 * Central authorisation gate. Returns true when the caller may proceed.
 *
 * @param {import("discord.js").Interaction} interaction
 * @param {string} ownerId
 */
async function guardInteraction(interaction, ownerId) {
  const userId = interaction?.user?.id;

  if (isOwner(userId, ownerId)) {
    return true;
  }

  await denyInteraction(interaction);
  return false;
}

module.exports = {
  DENIED_MESSAGE,
  denyInteraction,
  guardInteraction,
  isOwner
};
