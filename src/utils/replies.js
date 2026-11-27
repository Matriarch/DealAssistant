"use strict";

const { MessageFlags } = require("discord.js");

const { redactError } = require("./logger");

/**
 * Sends a private reply whatever state the interaction is in.
 *
 * A deferred interaction has already produced a public "thinking" message, so it
 * is deleted first; otherwise a failed or unavailable command would leave a
 * permanent loading state visible to everyone in the channel.
 */
async function replyEphemeral(interaction, content) {
  try {
    if (interaction.deferred) {
      await interaction.deleteReply();
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error(`[reply] failed to send a response: ${redactError(error).message}`);

    try {
      if (interaction.deferred) {
        await interaction.editReply({ content });
      }
    } catch {
      // Nothing further can be done for this interaction.
    }
  }
}

module.exports = { replyEphemeral };
