"use strict";

const { defineCommand } = require("../utils/command");
const { FIAT_CURRENCIES } = require("../coins");
const { addPaymentAmountOption, addQrOption, sendPayment } = require("../utils/payment");
const { replyEphemeral } = require("../utils/replies");

module.exports = (config, deps = {}) => {
  const methods = config.paymentMethods;
  const choices = [...methods].map(([value, method]) => ({ name: `${value} · ${method.title}`, value }));
  const data = defineCommand("pay", "Share the receiving details for a configured payment method.")
    .addStringOption((option) => option
      .setName("currency")
      .setDescription("Payment method and network.")
      .setRequired(true)
      .addChoices(...choices));

  if ([...methods.values()].some((method) => method.priceId)) {
    addPaymentAmountOption(data);
    data.addStringOption((option) => option
      .setName("fiat")
      .setDescription("Currency for the deal amount (defaults to USD).")
      .addChoices(...FIAT_CURRENCIES.map((value) => ({ name: value, value }))));
  }
  if (config.paymentQrEnabled && [...methods.values()].some((method) => method.supportsQr)) {
    addQrOption(data);
  }

  return {
    data,
    async execute(interaction) {
      const method = methods.get(interaction.options.getString("currency"));
      if (!method) {
        return replyEphemeral(interaction, "That payment method is unavailable. Select a configured method.");
      }
      return sendPayment(interaction, {
        commandName: "pay", method, address: method.address, config, deps
      });
    }
  };
};
