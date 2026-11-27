"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { PAYMENT_METHODS } = require("../src/coins");
const {
  PRICE_CACHE_TTL_MS,
  PriceLookupError,
  buildPaymentEmbed,
  createPaymentCommand,
  createPriceService,
  formatCrypto,
  formatUsd,
  isValidAmount
} = require("../src/utils/payment");

const CONFIG = {
  app: { displayName: "Example", embedColor: 0x90e838, footer: "" },
  addresses: { btc: "bc1qexampleddress0000000000000000000000" }
};

function fakeInteraction(amount = null) {
  const calls = [];
  return {
    options: { getNumber: () => amount },
    reply: async (payload) => calls.push(payload),
    followUp: async (payload) => calls.push(payload),
    calls
  };
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

test("formatUsd drops cents on whole amounts and keeps them otherwise", () => {
  assert.equal(formatUsd(200), "$200");
  assert.equal(formatUsd(199.5), "$199.50");
  assert.equal(formatUsd(1234.567), "$1,234.57");
});

test("formatCrypto trims trailing zeros and flags values below precision", () => {
  assert.equal(formatCrypto(0.004, 8), "0.004");
  assert.equal(formatCrypto(1, 2), "1");
  assert.equal(formatCrypto(0.000000001, 8), "< 0.00000001");
});

test("isValidAmount rejects non-finite, zero, negative and oversized input", () => {
  assert.equal(isValidAmount(200), true);
  assert.equal(isValidAmount(1), true);
  assert.equal(isValidAmount(0), false);
  assert.equal(isValidAmount(-5), false);
  assert.equal(isValidAmount(Number.NaN), false);
  assert.equal(isValidAmount(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidAmount(2_000_000), false);
  assert.equal(isValidAmount("200"), false);
});

test("price lookups are cached within the TTL", async () => {
  let calls = 0;
  const service = createPriceService({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ bitcoin: { usd: 50000 } });
    },
    now: () => 1000
  });

  assert.equal(await service.getUsdPrice("bitcoin"), 50000);
  assert.equal(await service.getUsdPrice("bitcoin"), 50000);
  assert.equal(calls, 1);
});

test("cached prices expire after the TTL", async () => {
  let calls = 0;
  let clock = 0;
  const service = createPriceService({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ bitcoin: { usd: 50000 + calls } });
    },
    now: () => clock
  });

  await service.getUsdPrice("bitcoin");
  clock += PRICE_CACHE_TTL_MS + 1;
  await service.getUsdPrice("bitcoin");

  assert.equal(calls, 2);
});

test("HTTP failures surface as PriceLookupError", async () => {
  const service = createPriceService({
    fetchImpl: async () => jsonResponse({}, false, 429)
  });

  await assert.rejects(() => service.getUsdPrice("bitcoin"), (error) => {
    assert.ok(error instanceof PriceLookupError);
    assert.match(error.message, /HTTP 429/);
    return true;
  });
});

test("malformed price payloads surface as PriceLookupError", async () => {
  const service = createPriceService({ fetchImpl: async () => jsonResponse({ bitcoin: {} }) });
  await assert.rejects(() => service.getUsdPrice("bitcoin"), PriceLookupError);
});

test("network errors surface as PriceLookupError", async () => {
  const service = createPriceService({
    fetchImpl: async () => {
      throw new Error("socket hang up");
    }
  });

  await assert.rejects(() => service.getUsdPrice("bitcoin"), /socket hang up/);
});

test("payment embed shows address and network without an amount", () => {
  const embed = buildPaymentEmbed({
    commandName: "btc",
    method: PAYMENT_METHODS.btc,
    address: CONFIG.addresses.btc,
    config: CONFIG
  }).toJSON();

  const text = JSON.stringify(embed);
  assert.equal(embed.title, "Bitcoin");
  assert.equal(embed.color, 0x90e838);
  assert.match(text, /bc1qexampleddress/);
  assert.match(text, /Bitcoin/);
  assert.match(text, /amount:200/);
});

test("payment embed converts an amount using the supplied rate", () => {
  const embed = buildPaymentEmbed({
    commandName: "btc",
    method: PAYMENT_METHODS.btc,
    address: CONFIG.addresses.btc,
    amountUsd: 200,
    price: 50000,
    config: CONFIG
  }).toJSON();

  const amountField = embed.fields.find((field) => field.name === "Amount");
  assert.match(amountField.value, /\$200/);
  assert.match(amountField.value, /0\.004 BTC/);
  assert.match(amountField.value, /Estimate only/);
});

test("stablecoin embeds disclose the assumed dollar parity", () => {
  const embed = buildPaymentEmbed({
    commandName: "usdceth",
    method: PAYMENT_METHODS.usdceth,
    address: "0x0000000000000000000000000000000000000000",
    amountUsd: 200,
    config: CONFIG
  }).toJSON();

  const amountField = embed.fields.find((field) => field.name === "Amount");
  assert.match(amountField.value, /200 USDC/);
  assert.match(amountField.value, /Assumes 1 USDC = \$1\.00/);
});

test("a failed rate lookup still produces a usable embed", async () => {
  const command = createPaymentCommand("btc", CONFIG, {
    priceService: { getUsdPrice: async () => { throw new Error("down"); } }
  });
  const interaction = fakeInteraction(200);

  await command.execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
  const amountField = embed.fields.find((field) => field.name === "Amount");
  assert.match(amountField.value, /Live rate unavailable/);
  assert.match(JSON.stringify(embed), /bc1qexampleddress/);
});

test("payment command refuses an out of range amount", async () => {
  const command = createPaymentCommand("btc", CONFIG, {
    priceService: { getUsdPrice: async () => 50000 }
  });
  const interaction = fakeInteraction(0);

  await command.execute(interaction);

  assert.match(interaction.calls[0].content, /Amount must be between/);
  assert.equal(interaction.calls[0].flags, 64);
});

test("payment command reports a missing address instead of failing", async () => {
  const command = createPaymentCommand("btc", { ...CONFIG, addresses: {} }, {
    priceService: { getUsdPrice: async () => 50000 }
  });
  const interaction = fakeInteraction(null);

  await command.execute(interaction);

  assert.match(interaction.calls[0].content, /BTC_ADDRESS is not configured/);
});

test("payment command replies with a converted amount", async () => {
  const command = createPaymentCommand("btc", CONFIG, {
    priceService: { getUsdPrice: async () => 50000 }
  });
  const interaction = fakeInteraction(200);

  await command.execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
  const amountField = embed.fields.find((field) => field.name === "Amount");
  assert.match(amountField.value, /0\.004 BTC/);
});
