"use strict";

const { COMMAND_NAMES } = require("../coins");
const { createPriceCommand, createConvertCommand } = require("./exchange");
const { createCustomCommand } = require("./custom");

const factories = {
  btc: require("./btc"),
  ltc: require("./ltc"),
  eth: require("./eth"),
  sol: require("./sol"),
  usdceth: require("./usdceth"),
  usdcsol: require("./usdcsol"),
  cashapp: require("./cashapp"),
  info: require("./info"),
  vouch: require("./vouch"),
  middleman: require("./middleman"),
  pay: require("./pay"),
  price: createPriceCommand,
  convert: createConvertCommand,
  fees: require("./fees"),
  help: require("./help")
};

/**
 * Builds every enabled command for this configuration.
 *
 * The help command receives the list lazily so it always reflects what was
 * actually built, rather than a hand-maintained duplicate list.
 */
function createCommands(config, deps = {}) {
  const built = [];

  for (const name of COMMAND_NAMES) {
    if (name === "help" || !config.isEnabled(name)) {
      continue;
    }

    built.push(factories[name](config, deps));
  }

  for (const command of config.customCommands.values()) {
    if (config.isEnabled(command.name)) {
      built.push(createCustomCommand(config, command));
    }
  }

  if (config.isEnabled("help")) {
    built.push(factories.help(config, { ...deps, getCommands: () => built }));
  }

  return built;
}

module.exports = { createCommands };
