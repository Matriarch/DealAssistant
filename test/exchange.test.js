"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPriceCommand, createConvertCommand } = require("../src/commands/exchange");
const { createInteractionHandler } = require("../src/router");
const { createPriceService } = require("../src/utils/prices");
const { createInteraction } = require("./helpers");

const config = { app: { embedColor: 0x5865f2 } };

test("parallel fiat lookups share one request and retain the original retrieval timestamp", async () => {
  let calls = 0;
  let now = 10_000;
  const service = createPriceService({
    now: () => now,
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(new URL(url).searchParams.get("vs_currencies"), "usd,eur,gbp,cad");
      return { ok: true, json: async () => ({ bitcoin: { usd: 50_000, eur: 45_000, cad: "invalid" } }) };
    }
  });
  assert.deepEqual(await Promise.all([service.getPrice("bitcoin"), service.getPrice("bitcoin", "EUR")]), [
    { rate: 50_000, retrievedAt: 10_000 },
    { rate: 45_000, retrievedAt: 10_000 }
  ]);
  now += 1000;
  assert.equal((await service.getPrice("bitcoin", "EUR")).retrievedAt, 10_000);
  await assert.rejects(() => service.getPrice("bitcoin", "CAD"), /no usable rate/);
  await assert.rejects(() => service.getPrice("bitcoin", "XYZ"), /unsupported/);
  assert.equal(calls, 1);
});

test("price responds privately with the observed USDC price, currency and retrieval time", async () => {
  const command = createPriceCommand(config, {
    priceService: { getPrice: async (id, fiat) => {
      assert.deepEqual([id, fiat], ["usd-coin", "CAD"]);
      return { rate: 1.351234, retrievedAt: 123_456 };
    } }
  });
  const interaction = createInteraction({ strings: { currency: "USDC", fiat: "CAD" } });
  await command.execute(interaction);
  assert.equal(interaction.calls[0].payload.flags, 64);
  const embed = interaction.calls[1].payload.embeds[0].toJSON();
  assert.match(embed.fields[0].value, /1 USDC ≈ 1\.351234 CAD/);
  assert.equal(embed.fields[1].value, "<t:123:F>");
  assert.doesNotMatch(JSON.stringify(embed), /address/i);
});

test("convert uses the same rate in both directions and labels values below display precision", async () => {
  const command = createConvertCommand(config, {
    priceService: { getPrice: async () => ({ rate: 50_000, retrievedAt: 1000 }) }
  });
  for (const [amount, from, to, expected] of [
    [200, "GBP", "BTC", "200 GBP ≈ 0.004 BTC"],
    [0.5, "BTC", "EUR", "0.5 BTC ≈ 25000 EUR"],
    [0.00000001, "CAD", "BTC", "0.00000001 CAD → < 0.00000001 BTC"]
  ]) {
    const interaction = createInteraction({ amount, strings: { from, to } });
    await command.execute(interaction);
    assert.ok(interaction.calls[1].payload.embeds[0].toJSON().description.includes(expected));
  }
});

test("convert rejects invalid pairs and amounts without a network request", async () => {
  const command = createConvertCommand(config, {
    priceService: { getPrice: async () => assert.fail("Unexpected price lookup") }
  });
  for (const [amount, from, to] of [[200, "EUR", "USD"], [1, "DOGE", "USD"], [Infinity, "USD", "BTC"]]) {
    const interaction = createInteraction({ amount, strings: { from, to } });
    await command.execute(interaction);
    assert.equal(interaction.calls[0].type, "reply");
    assert.equal(interaction.calls[0].payload.flags, 64);
  }
});

test("a rate-limited lookup clears the private deferral without retrying", async () => {
  let calls = 0;
  const command = createPriceCommand(config, {
    priceService: createPriceService({ fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 429 };
    } })
  });
  const interaction = createInteraction({ strings: { currency: "BTC" } });
  await command.execute(interaction);
  assert.equal(interaction.calls[1].type, "editReply");
  assert.match(interaction.calls[1].payload.content, /rate limiting/);
  assert.equal(calls, 1);
});

test("price and convert are owner-only through the command router", async () => {
  const commands = [createPriceCommand(config), createConvertCommand(config)];
  const commandMap = new Map(commands.map((command) => [command.data.name, command]));
  const handle = createInteractionHandler({ ownerId: "owner", commandMap });
  for (const commandName of commandMap.keys()) {
    const interaction = createInteraction({ commandName, userId: "other" });
    interaction.options.getString = () => assert.fail("Unexpected command execution");
    await handle(interaction);
    assert.equal(interaction.calls[0].payload.flags, 64);
  }
});
