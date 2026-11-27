"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const { loadConfig } = require("../src/config");
const { createCommands } = require("../src/commands");
const { createInteractionHandler } = require("../src/router");
const { createInteraction, validAddresses } = require("./helpers");

const OWNER = "987654321098765432";
const ADDRESSES = validAddresses();

function build(t, overrides, deps) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-pay-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const config = loadConfig({ cwd, env: {
    DISCORD_TOKEN: "mock-token",
    DISCORD_CLIENT_ID: "1".repeat(18),
    DISCORD_OWNER_ID: OWNER,
    ...overrides
  } });
  return new Map(createCommands(config, deps).map((command) => [command.data.name, command]));
}

test("/pay is registered only with configured methods and lists distinct networks", (t) => {
  assert.equal(build(t, {}).has("pay"), false);
  const commands = build(t, { BTC_ADDRESS: ADDRESSES.BTC_ADDRESS, USDC_SOL_ADDRESS: ADDRESSES.USDC_SOL_ADDRESS });
  const [currency, ...options] = commands.get("pay").data.toJSON().options;
  assert.deepEqual(currency.choices.map(({ value }) => value), ["BTC", "USDC-SOL"]);
  assert.equal(currency.required, true);
  assert.deepEqual(options.map(({ name }) => name), ["amount", "fiat"]);
});

test("obsolete method selections and unsupported amount or QR options are rejected", async (t) => {
  const commands = build(t, { CASHAPP_TAG: "exampletag", PAYMENT_QR_ENABLED: "true" });
  const command = commands.get("pay");
  assert.deepEqual(command.data.toJSON().options.map(({ name }) => name), ["currency"]);

  for (const settings of [
    { strings: { currency: "BTC" } },
    { strings: { currency: "CASHAPP" }, amount: 50 },
    { strings: { currency: "CASHAPP" }, booleans: { qr: true } }
  ]) {
    const interaction = createInteraction(settings);
    await command.execute(interaction);
    assert.equal(interaction.calls[0].payload.flags, 64);
  }
});

test("the payment hint uses the selected method instead of an unconfigured currency", async (t) => {
  const command = build(t, { LTC_ADDRESS: ADDRESSES.LTC_ADDRESS }).get("pay");
  const interaction = createInteraction({ strings: { currency: "LTC" } });
  await command.execute(interaction);
  assert.match(interaction.calls[0].payload.embeds[0].toJSON().description, /currency:LTC/);
});

test("the unified payment attachment decodes to the exact configured address without an amount", async (t) => {
  const { decodeQR } = await import("qr/decode.js");
  const interaction = createInteraction({
    strings: { currency: "ETH" }, amount: 25, booleans: { qr: true }
  });
  const commands = build(t, { ETH_ADDRESS: ADDRESSES.ETH_ADDRESS, PAYMENT_QR_ENABLED: "true" }, {
    priceService: { getPrice: async () => ({ rate: 2500, retrievedAt: 1000 }) }
  });
  await commands.get("pay").execute(interaction);

  assert.deepEqual(interaction.calls.map(({ type }) => type), ["deferReply", "editReply"]);
  const { embeds, files } = interaction.calls[1].payload;
  const embed = embeds[0].toJSON();
  const { width, height, data } = PNG.sync.read(files[0].attachment);
  assert.equal(files[0].name, "receiving-address.png");
  assert.equal(decodeQR({ width, height, data }), ADDRESSES.ETH_ADDRESS);
  assert.equal(embed.image.url, `attachment://${files[0].name}`);
  assert.ok(embed.fields.find(({ name }) => name === "Address").value.includes(ADDRESSES.ETH_ADDRESS));
  assert.deepEqual(embed.fields.slice(0, 2).map(({ name }) => name), ["Network", "Address"]);
  assert.ok(embed.fields.every(({ name }) => name !== "Currency"));
});

test("crypto shortcuts support QR opt-in and preserve plain replies by default", async (t) => {
  const commands = build(t, { ...ADDRESSES, PAYMENT_QR_ENABLED: "true" });
  for (const name of ["btc", "ltc", "eth", "sol", "usdceth", "usdcsol"]) {
    const command = commands.get(name);
    assert.ok(command.data.toJSON().options.some((option) => option.name === "qr"));
    const interaction = createInteraction();
    await command.execute(interaction);
    assert.equal(interaction.calls[0].type, "reply");
    assert.equal(interaction.calls[0].payload.files, undefined);
  }
});

test("central authorization rejects /pay before method selection or rate lookup", async (t) => {
  const commandMap = build(t, { BTC_ADDRESS: ADDRESSES.BTC_ADDRESS, PAYMENT_QR_ENABLED: "true" });
  const handle = createInteractionHandler({ ownerId: OWNER, commandMap });
  const interaction = createInteraction({ userId: "other", commandName: "pay" });
  interaction.options.getString = () => assert.fail("Unauthorized command execution");
  await handle(interaction);
  assert.equal(interaction.calls[0].payload.flags, 64);
});
