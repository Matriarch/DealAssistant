"use strict";

const {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder
} = require("discord.js");

const INTERACTION_CONTEXTS = [
  InteractionContextType.Guild,
  InteractionContextType.BotDM,
  InteractionContextType.PrivateChannel
];

/**
 * Every command in this project is a user-install command that works in
 * servers, the app's own DM, and private group chats.
 *
 * Centralising this keeps installation behaviour identical across commands,
 * which is easy to get subtly wrong when it is repeated per file.
 */
function defineCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
    .setContexts(...INTERACTION_CONTEXTS);
}

module.exports = { defineCommand, INTERACTION_CONTEXTS };
