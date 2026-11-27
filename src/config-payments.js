"use strict";

const { PAYMENT_METHODS } = require("./coins");
const { isObject } = require("./config-values");
const { validateAddress } = require("./utils/address");

const ADDRESS_FORMATS = ["btc", "ltc", "eth", "sol"];
const BUILT_IN_IDS = ["BTC", "LTC", "ETH", "SOL", "USDC-ETH", "USDC-SOL", "CASHAPP"];
const MAX_PAYMENT_CHOICES = 25;

function addCustomPaymentMethods(methods, entries, problems) {
  if (entries === undefined) {
    return;
  }
  if (!Array.isArray(entries) || entries.length > MAX_PAYMENT_CHOICES) {
    problems.push(`config.json paymentMethods must be an array with at most ${MAX_PAYMENT_CHOICES} entries.`);
    return;
  }

  for (const [index, entry] of entries.entries()) {
    const at = `config.json paymentMethods[${index}]`;
    if (!isObject(entry)) {
      problems.push(`${at} must be an object.`);
      continue;
    }
    const { id, displayName, symbol, network, recipient, addressFormat, priceId, decimals, instructions, qr } = entry;
    const before = problems.length;
    if (typeof id !== "string" || !/^[A-Z0-9][A-Z0-9-]{0,23}$/.test(id) || BUILT_IN_IDS.includes(id) || methods.has(id)) {
      problems.push(`${at}.id must be unique, use up to 24 uppercase letters, digits or hyphens, and avoid built-in IDs.`);
    }
    for (const [key, value] of [["displayName", displayName], ["network", network]]) {
      if (typeof value !== "string" || !value.trim() || value.length > 60 || /[\p{C}\p{Zl}\p{Zp}]/u.test(value)) {
        problems.push(`${at}.${key} must contain 1–60 characters of single-line text.`);
      }
    }
    if (typeof symbol !== "string" || !/^[A-Z0-9]{1,12}$/.test(symbol)) {
      problems.push(`${at}.symbol must use 1–12 uppercase letters or digits.`);
    }
    if (typeof recipient !== "string" || !/^[A-Za-z0-9$+@][A-Za-z0-9._:@+$-]{0,127}$/.test(recipient)) {
      problems.push(`${at}.recipient must be a public address or identifier of up to 128 characters without spaces.`);
    }
    if (addressFormat !== undefined) {
      if (!ADDRESS_FORMATS.includes(addressFormat)) {
        problems.push(`${at}.addressFormat must be btc, ltc, eth, or sol.`);
      } else if (!validateAddress(addressFormat, recipient).valid) {
        problems.push(`${at}.recipient does not match the selected address format.`);
      }
    }
    const knownAsset = Object.values(PAYMENT_METHODS).find((method) => method.symbol === symbol &&
      method.network === network && method.priceId === priceId);
    const requiredFormat = { Bitcoin: "btc", Litecoin: "ltc", Ethereum: "eth", Solana: "sol",
      "Ethereum (ERC-20)": "eth", "Solana (SPL)": "sol" };
    if (priceId !== undefined && (!knownAsset || addressFormat !== requiredFormat[network])) {
      problems.push(`${at}.priceId requires a supported asset, network, and matching address format.`);
    }
    if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0 || decimals > (knownAsset?.decimals ?? 8))) {
      problems.push(`${at}.decimals must be an integer within the supported display precision.`);
    }
    if (instructions !== undefined && (typeof instructions !== "string" || !instructions.trim() || instructions.length > 1000)) {
      problems.push(`${at}.instructions must contain 1–1000 characters of text.`);
    }
    if (qr !== undefined && (typeof qr !== "boolean" || (qr && !addressFormat))) {
      problems.push(`${at}.qr must be a boolean and requires an address format when enabled.`);
    }
    if (problems.length === before) {
      methods.set(id, {
        title: displayName,
        symbol,
        network,
        address: recipient,
        addressLabel: addressFormat ? "Address" : "Payment identifier",
        addressValidated: Boolean(addressFormat),
        priceId,
        decimals: decimals ?? knownAsset?.decimals,
        instructions,
        supportsQr: qr === true
      });
    }
  }

  if (methods.size > MAX_PAYMENT_CHOICES) {
    problems.push(`/pay supports up to ${MAX_PAYMENT_CHOICES} configured payment methods, including built-ins.`);
  }
}

module.exports = { addCustomPaymentMethods };
