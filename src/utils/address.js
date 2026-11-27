"use strict";

const { createHash } = require("node:crypto");

const { base58, base58check, bech32, bech32m } = require("@scure/base");
const { keccak256 } = require("js-sha3");

const MAX_ADDRESS_LENGTH = 128;
const MIN_WITNESS_PROGRAM = 2;
const MAX_WITNESS_PROGRAM = 40;

const sha256 = (data) => new Uint8Array(createHash("sha256").update(data).digest());
const decodeBase58Check = base58check(sha256).decode;

function valid() {
  return { valid: true, reason: null };
}

function invalid(reason) {
  return { valid: false, reason };
}

function validateSegwit(address, expectedHrp, label) {
  const lower = address.toLowerCase();

  if (address !== lower && address !== address.toUpperCase()) {
    return invalid("mixed case is not allowed in bech32");
  }

  let decoded;
  let coder;

  try {
    decoded = bech32.decode(lower);
    coder = bech32;
  } catch {
    try {
      decoded = bech32m.decode(lower);
      coder = bech32m;
    } catch {
      return invalid("bech32 checksum failed");
    }
  }

  if (decoded.prefix !== expectedHrp) {
    return invalid(`wrong prefix, expected ${expectedHrp}1`);
  }

  const version = decoded.words[0];
  if (!Number.isInteger(version) || version > 16) {
    return invalid("witness version must be between 0 and 16");
  }

  // BIP-350: version 0 uses bech32, version 1 and above use bech32m.
  if (version === 0 && coder !== bech32) {
    return invalid("version 0 programs must use bech32");
  }
  if (version !== 0 && coder !== bech32m) {
    return invalid("version 1+ programs must use bech32m");
  }

  let program;
  try {
    program = coder.fromWords(decoded.words.slice(1));
  } catch {
    return invalid(`invalid ${label} witness program`);
  }

  if (program.length < MIN_WITNESS_PROGRAM || program.length > MAX_WITNESS_PROGRAM) {
    return invalid(`witness program is ${program.length} bytes`);
  }

  if (version === 0 && program.length !== 20 && program.length !== 32) {
    return invalid("version 0 programs must be 20 or 32 bytes");
  }

  return valid();
}

function validateBitcoinAddress(address) {
  if (address.length > MAX_ADDRESS_LENGTH) {
    return invalid("longer than any valid address");
  }

  if (address.toLowerCase().startsWith("bc1")) {
    return validateSegwit(address, "bc", "Bitcoin");
  }

  let payload;
  try {
    payload = decodeBase58Check(address);
  } catch {
    return invalid("invalid Base58Check encoding");
  }

  if (payload.length !== 21) {
    return invalid("unexpected Base58Check payload length");
  }

  // 0x00 P2PKH, 0x05 P2SH
  if (payload[0] !== 0x00 && payload[0] !== 0x05) {
    return invalid("version byte belongs to another network");
  }

  return valid();
}

function validateLitecoinAddress(address) {
  if (address.length > MAX_ADDRESS_LENGTH) {
    return invalid("longer than any valid address");
  }

  if (address.toLowerCase().startsWith("ltc1")) {
    return validateSegwit(address, "ltc", "Litecoin");
  }

  let payload;
  try {
    payload = decodeBase58Check(address);
  } catch {
    return invalid("invalid Base58Check encoding");
  }

  if (payload.length !== 21) {
    return invalid("unexpected Base58Check payload length");
  }

  // 0x30 legacy P2PKH (L), 0x32 P2SH (M), 0x05 legacy P2SH (3)
  if (![0x30, 0x32, 0x05].includes(payload[0])) {
    return invalid("version byte belongs to another network");
  }

  return valid();
}

function validateEthereumAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return invalid("expected 0x followed by 40 hex characters");
  }

  const body = address.slice(2);

  // All lower or all upper case carries no checksum to verify.
  if (body === body.toLowerCase() || body === body.toUpperCase()) {
    return valid();
  }

  const hash = keccak256(body.toLowerCase());

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];

    if (!/[a-fA-F]/.test(character)) {
      continue;
    }

    const shouldBeUpper = parseInt(hash[index], 16) >= 8;
    const isUpper = character === character.toUpperCase();

    if (shouldBeUpper !== isUpper) {
      return invalid("EIP-55 checksum mismatch");
    }
  }

  return valid();
}

function validateSolanaAddress(address) {
  if (address.length < 32 || address.length > 44) {
    return invalid("not a plausible Solana address length");
  }

  let bytes;
  try {
    bytes = base58.decode(address);
  } catch {
    return invalid("invalid Base58 encoding");
  }

  if (bytes.length !== 32) {
    return invalid(`decoded to ${bytes.length} bytes, expected 32`);
  }

  return valid();
}

const VALIDATORS = {
  btc: { label: "Bitcoin", validate: validateBitcoinAddress },
  ltc: { label: "Litecoin", validate: validateLitecoinAddress },
  eth: { label: "Ethereum", validate: validateEthereumAddress },
  usdceth: { label: "Ethereum", validate: validateEthereumAddress },
  sol: { label: "Solana", validate: validateSolanaAddress },
  usdcsol: { label: "Solana", validate: validateSolanaAddress }
};

/**
 * Validates a receiving address for a specific payment command.
 *
 * Validation only proves the string is well formed for that network. It cannot
 * prove ownership of the address, and it cannot prove that a wallet or exchange
 * supports receiving a particular token on that network.
 */
function validateAddress(commandName, address) {
  const entry = VALIDATORS[commandName];

  if (!entry) {
    return invalid(`no validator for "${commandName}"`);
  }

  if (typeof address !== "string" || address.length === 0) {
    return invalid("empty");
  }

  return entry.validate(address);
}

module.exports = {
  MAX_ADDRESS_LENGTH,
  VALIDATORS,
  validateAddress,
  validateBitcoinAddress,
  validateEthereumAddress,
  validateLitecoinAddress,
  validateSolanaAddress
};
