"use strict";

/**
 * Static description of the supported cryptocurrency payment methods.
 *
 * Keeping this in one place means the configuration loader, the command
 * factory and the help text can never drift out of sync.
 */
const PAYMENT_METHODS = {
  btc: {
    symbol: "BTC",
    title: "Bitcoin",
    network: "Bitcoin",
    envKey: "BTC_ADDRESS",
    priceId: "bitcoin",
    decimals: 8,
    pricePrecision: 2
  },
  ltc: {
    symbol: "LTC",
    title: "Litecoin",
    network: "Litecoin",
    envKey: "LTC_ADDRESS",
    priceId: "litecoin",
    decimals: 8,
    pricePrecision: 2
  },
  eth: {
    symbol: "ETH",
    title: "Ethereum",
    network: "Ethereum",
    envKey: "ETH_ADDRESS",
    priceId: "ethereum",
    decimals: 6,
    pricePrecision: 2
  },
  sol: {
    symbol: "SOL",
    title: "Solana",
    network: "Solana",
    envKey: "SOL_ADDRESS",
    priceId: "solana",
    decimals: 6,
    pricePrecision: 2
  },
  usdceth: {
    symbol: "USDC",
    title: "USDC on Ethereum",
    network: "Ethereum (ERC-20)",
    envKey: "USDC_ETH_ADDRESS",
    decimals: 2,
    usdPeg: true
  },
  usdcsol: {
    symbol: "USDC",
    title: "USDC on Solana",
    network: "Solana (SPL)",
    envKey: "USDC_SOL_ADDRESS",
    decimals: 2,
    usdPeg: true
  }
};

const PAYMENT_COMMAND_NAMES = Object.keys(PAYMENT_METHODS);

const NON_PAYMENT_COMMANDS = ["cashapp", "info", "vouch", "middleman", "pay", "help"];

const COMMAND_NAMES = [...PAYMENT_COMMAND_NAMES, ...NON_PAYMENT_COMMANDS];

module.exports = {
  PAYMENT_METHODS,
  PAYMENT_COMMAND_NAMES,
  NON_PAYMENT_COMMANDS,
  COMMAND_NAMES
};
