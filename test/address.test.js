"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateAddress,
  validateBitcoinAddress,
  validateEthereumAddress,
  validateLitecoinAddress,
  validateSolanaAddress
} = require("../src/utils/address");
const {
  bitcoinLegacyAddress,
  ethereumAddress,
  litecoinLegacyAddress,
  segwitAddress,
  solanaAddress
} = require("./helpers");

const BTC_LEGACY = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const BTC_BECH32 = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const ETH_CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

test("well known Bitcoin addresses are accepted", () => {
  assert.equal(validateBitcoinAddress(BTC_LEGACY).valid, true);
  assert.equal(validateBitcoinAddress(BTC_BECH32).valid, true);
  assert.equal(validateBitcoinAddress(bitcoinLegacyAddress(0x05)).valid, true);
  assert.equal(validateBitcoinAddress(segwitAddress("bc", 1, 32)).valid, true);
});

test("a corrupted Bitcoin checksum is rejected", () => {
  const corrupted = `${BTC_BECH32.slice(0, -1)}x`;
  const result = validateBitcoinAddress(corrupted);

  assert.equal(result.valid, false);
  assert.match(result.reason, /checksum|bech32/);
});

test("Bitcoin rejects wrong network versions and malformed input", () => {
  assert.equal(validateBitcoinAddress(bitcoinLegacyAddress(0x30)).valid, false);
  assert.equal(validateBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5").valid, false);
  assert.equal(validateBitcoinAddress("").valid, false);
  assert.equal(validateBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7Kv8f3t4").valid, false);
});

test("Litecoin accepts legacy and bech32 addresses", () => {
  assert.equal(validateLitecoinAddress(litecoinLegacyAddress(0x30)).valid, true);
  assert.equal(validateLitecoinAddress(litecoinLegacyAddress(0x32)).valid, true);
  assert.equal(validateLitecoinAddress(segwitAddress("ltc")).valid, true);
});

test("Litecoin rejects Bitcoin addresses", () => {
  assert.equal(validateLitecoinAddress(BTC_LEGACY).valid, false);
  assert.equal(validateLitecoinAddress(BTC_BECH32).valid, false);
});

test("Ethereum accepts checksummed and all-lowercase addresses", () => {
  assert.equal(validateEthereumAddress(ETH_CHECKSUMMED).valid, true);
  assert.equal(validateEthereumAddress(ETH_CHECKSUMMED.toLowerCase()).valid, true);
  assert.equal(validateEthereumAddress(ethereumAddress()).valid, true);
});

test("Ethereum rejects an invalid EIP-55 checksum", () => {
  const invalid = `${ETH_CHECKSUMMED.slice(0, -1)}D`;
  const result = validateEthereumAddress(invalid);

  assert.equal(result.valid, false);
  assert.match(result.reason, /EIP-55/);
});

test("Ethereum rejects wrong length and missing prefix", () => {
  assert.equal(validateEthereumAddress("0x1234").valid, false);
  assert.equal(validateEthereumAddress("5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed").valid, false);
  assert.equal(validateEthereumAddress(`0x${"g".repeat(40)}`).valid, false);
});

test("Solana accepts a 32 byte base58 key", () => {
  assert.equal(validateSolanaAddress("11111111111111111111111111111111").valid, true);
  assert.equal(validateSolanaAddress(solanaAddress()).valid, true);
});

test("Solana rejects wrong lengths and non-base58 characters", () => {
  assert.equal(validateSolanaAddress("1111").valid, false);
  assert.equal(validateSolanaAddress("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl").valid, false);
  assert.equal(validateSolanaAddress("1".repeat(33)).valid, false);
});

test("validateAddress maps each command to its network", () => {
  assert.equal(validateAddress("btc", BTC_LEGACY).valid, true);
  assert.equal(validateAddress("usdceth", ETH_CHECKSUMMED).valid, true);
  assert.equal(validateAddress("usdcsol", "11111111111111111111111111111111").valid, true);
  assert.equal(validateAddress("btc", ETH_CHECKSUMMED).valid, false);
  assert.equal(validateAddress("unknown", BTC_LEGACY).valid, false);
});

test("validateAddress rejects non-string input", () => {
  assert.equal(validateAddress("btc", undefined).valid, false);
  assert.equal(validateAddress("btc", 12345).valid, false);
});
