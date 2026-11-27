"use strict";

const { createHash, randomBytes } = require("node:crypto");

const { base58, base58check, bech32, bech32m } = require("@scure/base");
const { keccak256 } = require("js-sha3");

const sha256 = (data) => new Uint8Array(createHash("sha256").update(data).digest());
const base58Check = base58check(sha256);

function bitcoinLegacyAddress(version = 0x00) {
  const payload = Buffer.concat([Buffer.from([version]), randomBytes(20)]);
  return base58Check.encode(new Uint8Array(payload));
}

function litecoinLegacyAddress(version = 0x30) {
  return bitcoinLegacyAddress(version);
}

function segwitAddress(hrp, version = 0, length = 20) {
  const program = new Uint8Array(randomBytes(length));
  const coder = version === 0 ? bech32 : bech32m;
  return coder.encode(hrp, [version, ...coder.toWords(program)]);
}

function ethereumAddress({ checksum = true } = {}) {
  const hex = randomBytes(20).toString("hex");

  if (!checksum) {
    return `0x${hex}`;
  }

  const hash = keccak256(hex);
  let output = "0x";

  for (let index = 0; index < 40; index += 1) {
    output += parseInt(hash[index], 16) >= 8 ? hex[index].toUpperCase() : hex[index];
  }

  return output;
}

function solanaAddress() {
  return base58.encode(new Uint8Array(randomBytes(32)));
}

/** A complete set of addresses that must pass validation. */
function validAddresses() {
  return {
    BTC_ADDRESS: bitcoinLegacyAddress(),
    LTC_ADDRESS: litecoinLegacyAddress(),
    ETH_ADDRESS: ethereumAddress(),
    SOL_ADDRESS: solanaAddress(),
    USDC_ETH_ADDRESS: ethereumAddress(),
    USDC_SOL_ADDRESS: solanaAddress()
  };
}

/**
 * Minimal stand-in for a Discord chat input interaction that records the order
 * and type of every response call.
 */
function createInteraction(options = {}) {
  const {
    amount = null,
    commandName = "test",
    userId = "987654321098765432",
    deferred = false,
    replied = false,
    repliable = true
  } = options;

  const state = { deferred, replied };
  const calls = [];

  const interaction = {
    commandName,
    user: { id: userId },
    options: { getNumber: () => amount },
    isRepliable: () => repliable,
    isChatInputCommand: () => true,

    deferReply: async (payload) => {
      calls.push({ type: "deferReply", payload });
      state.deferred = true;
    },
    reply: async (payload) => {
      calls.push({ type: "reply", payload });
      state.replied = true;
    },
    editReply: async (payload) => {
      calls.push({ type: "editReply", payload });
    },
    followUp: async (payload) => {
      calls.push({ type: "followUp", payload });
    },
    deleteReply: async () => {
      calls.push({ type: "deleteReply" });
    },
    respond: async (payload) => {
      calls.push({ type: "respond", payload });
    },

    calls
  };

  Object.defineProperty(interaction, "deferred", { get: () => state.deferred });
  Object.defineProperty(interaction, "replied", { get: () => state.replied });

  return interaction;
}

module.exports = {
  bitcoinLegacyAddress,
  createInteraction,
  ethereumAddress,
  litecoinLegacyAddress,
  segwitAddress,
  solanaAddress,
  validAddresses
};
