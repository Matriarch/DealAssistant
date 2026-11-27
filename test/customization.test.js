"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadConfig } = require("../src/config");
const { createCommands } = require("../src/commands");
const { createInteractionHandler } = require("../src/router");
const { assertEmbedsWithinLimits } = require("../src/validate");
const { createInteraction, validAddresses } = require("./helpers");

const ownerId = "9".repeat(18);
const rules = {
  name: "rules",
  description: "Show the deal rules.",
  title: "{displayName} rules",
  body: "Reference: **{reference}**",
  color: "#123456",
  footer: "Example footer",
  fields: [{ name: "Terms", value: "Confirm before sending." }],
  links: [{ label: "Trading [rules]", url: "https://example.invalid/rules" }],
  options: [{ name: "reference", description: "Optional reference.", maxLength: 15 }]
};
const customCash = {
  id: "EXAMPLE",
  displayName: "Example payments",
  symbol: "USD",
  network: "Example payment service",
  recipient: "ExampleRecipient",
  instructions: "Include your invoice reference."
};

function load(t, fileConfig = {}, overrides = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-custom-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "config.json"), JSON.stringify(fileConfig));
  return loadConfig({ cwd, env: {
    DISCORD_TOKEN: "mock-token",
    DISCORD_CLIENT_ID: "1".repeat(18),
    DISCORD_OWNER_ID: ownerId,
    DISPLAY_NAME: "Example",
    ...overrides
  } });
}

test("custom commands register as user installs and render static fields, links and bounded text", async (t) => {
  const config = load(t, { customCommands: [rules] }, { ENABLED_COMMANDS: "rules,help" });
  const commands = createCommands(config);
  assert.deepEqual(commands.map(({ data }) => data.name), ["rules", "help"]);
  const [command] = commands;
  const registration = command.data.toJSON();
  assert.deepEqual(registration.integration_types, [1]);
  assert.deepEqual(registration.contexts, [0, 1, 2]);
  assert.equal(registration.options[0].max_length, 15);
  assert.equal(registration.options[0].required, false);

  for (const [input, rendered] of [[undefined, "—"], ["Order-42", "Order\\-42"]]) {
    const interaction = createInteraction({ strings: { reference: input } });
    await command.execute(interaction);
    const { embeds, allowedMentions } = interaction.calls[0].payload;
    const embed = embeds[0].toJSON();
    assert.equal(embed.title, "Example rules");
    assert.ok(embed.description.includes(`**${rendered}**`));
    assert.ok(embed.description.includes("[Trading \\[rules\\]](<https://example.invalid/rules>)"));
    assert.equal(embed.color, 0x123456);
    assert.equal(embed.footer.text, "Example footer");
    assert.deepEqual(embed.fields, [{ name: "Terms", value: "Confirm before sending." }]);
    assert.deepEqual(allowedMentions, { parse: [] });
  }
});

test("unauthorized users and unsafe parameters cannot render custom responses", async (t) => {
  const config = load(t, { customCommands: [rules] });
  const commandMap = new Map(createCommands(config).map((command) => [command.data.name, command]));
  const handler = createInteractionHandler({ ownerId, commandMap });
  const denied = createInteraction({ userId: "other", commandName: "rules" });
  denied.options.getString = () => assert.fail("Unexpected custom command execution");
  await handler(denied);
  assert.equal(denied.calls[0].payload.flags, 64);
  for (const reference of ["@everyone", "[test](https://example.invalid)", "a".repeat(16)]) {
    const interaction = createInteraction({ userId: ownerId, commandName: "rules", strings: { reference } });
    await handler(interaction);
    assert.equal(interaction.calls[0].payload.flags, 64);
    assert.equal(interaction.calls[0].payload.embeds, undefined);
  }
});

test("invalid custom command definitions fail before registration and diagnostics omit values", (t) => {
  for (const [overrides, error] of [
    [{ name: "price" }, /unique lowercase/],
    [{ name: "Uppercase" }, /unique lowercase/],
    [{ options: Array(6).fill(rules.options[0]) }, /at most 5/],
    [{ options: [rules.options[0], rules.options[0]] }, /unique lowercase alphanumeric/],
    [{ body: "{missing}" }, /matching option/],
    [{ title: "{reference}".repeat(20) }, /limit is 256/],
    [{ fields: Array(26).fill(rules.fields[0]) }, /at most 25/],
    [{ title: "t".repeat(256), body: "b".repeat(4000), footer: "f".repeat(2048) }, /total embed content/],
    [{ links: [{ label: "Example", url: "https://secret:password@example.invalid/" }] }, /URL credentials/]
  ]) {
    assert.throws(() => load(t, { customCommands: [{ ...rules, ...overrides }] }),
      (problem) => error.test(problem.message) && !problem.message.includes("secret:password"));
  }
  assert.throws(() => load(t, { customCommands: [rules, rules] }), /unique lowercase/);
});

test("the global command limit counts enabled commands and help fits at the limit", (t) => {
  const customCommands = Array.from({ length: 99 }, (_, index) => ({
    name: `example-command-${String(index).padStart(2, "0")}-long-label`,
    description: "d".repeat(100),
    body: "Example body"
  }));
  assert.throws(() => load(t, { customCommands }), /100 global slash commands/);
  const config = load(t, { customCommands }, {
    ENABLED_COMMANDS: ["help", ...customCommands.map(({ name }) => name)].join(","),
    EMBED_FOOTER: "f".repeat(2048)
  });
  const commands = createCommands(config);
  assert.equal(commands.length, 100);
  assertEmbedsWithinLimits(config, commands);
  assert.ok(commands.at(-1).describe().description.includes(customCommands.at(-1).name));
});

test("additional payment methods display the exact identifier and instructions without an automatic quote", async (t) => {
  const config = load(t, { paymentMethods: [customCash] });
  const command = createCommands(config).find(({ data }) => data.name === "pay");
  assert.deepEqual(command.data.toJSON().options.map(({ name }) => name), ["currency"]);
  const interaction = createInteraction({ strings: { currency: "EXAMPLE" } });
  await command.execute(interaction);
  const fields = interaction.calls[0].payload.embeds[0].toJSON().fields;
  assert.ok(fields.find(({ name }) => name === "Payment identifier").value.includes(customCash.recipient));
  assert.ok(fields.some(({ name }) => name === "Manual verification"));
  assert.equal(fields.find(({ name }) => name === "Payment instructions").value, customCash.instructions);
});

test("custom conversion and QR require supported definitions, and configured choices stay within Discord’s limit", async (t) => {
  const ethProfile = {
    ...customCash, id: "ETH-BACKUP", symbol: "ETH", network: "Ethereum",
    addressFormat: "eth", recipient: validAddresses().ETH_ADDRESS, priceId: "ethereum", decimals: 4, qr: true
  };
  const config = load(t, { paymentMethods: [ethProfile] }, { PAYMENT_QR_ENABLED: "true" });
  const command = createCommands(config, { priceService: { getPrice: async (id, fiat) => {
    assert.deepEqual([id, fiat], ["ethereum", "GBP"]);
    return { rate: 2000, retrievedAt: 1000 };
  } } }).find(({ data }) => data.name === "pay");
  const interaction = createInteraction({ amount: 201, strings: { currency: "ETH-BACKUP", fiat: "GBP" } });
  await command.execute(interaction);
  assert.match(interaction.calls[1].payload.embeds[0].toJSON().fields[0].value, /0\.1005 ETH/);
  assert.throws(() => load(t, { paymentMethods: [{ ...ethProfile, network: "Other" }] }), /supported asset/);
  assert.throws(() => load(t, { paymentMethods: [{ ...ethProfile, recipient: "InvalidAddress" }] }), /selected address format/);
  assert.throws(() => load(t, { paymentMethods: [{ ...customCash, qr: true }] }), /requires an address format/);
  assert.throws(() => load(t, { paymentMethods: [{ ...customCash, id: "BTC" }] }), /avoid built-in IDs/);
  assert.throws(() => load(t, { paymentMethods: [customCash, customCash] }), /must be unique/);
  const paymentMethods = Array.from({ length: 25 }, (_, index) => ({ ...customCash, id: `EXAMPLE-${index}` }));
  assert.throws(() => load(t, { paymentMethods }, { CASHAPP_TAG: "exampletag" }), /25 configured payment methods/);
});

test("fees registers by opt-in and rounds percentage fees to minor currency units before subtracting", async (t) => {
  assert.equal(createCommands(load(t)).some(({ data }) => data.name === "fees"), false);
  const config = load(t, { feesEnabled: true });
  const commandMap = new Map(createCommands(config).map((command) => [command.data.name, command]));
  const handler = createInteractionHandler({ ownerId, commandMap });
  const base = { commandName: "fees", userId: ownerId, amount: 0.15, strings: { fiat: "EUR" } };
  for (const [numbers, expected] of [[{ percent: 10 }, ["0.02", "0.13"]], [{ fixed: 0.05 }, ["0.05", "0.10"]]]) {
    const interaction = createInteraction({ ...base, numbers });
    await handler(interaction);
    const { embeds } = interaction.calls[0].payload;
    const values = embeds[0].toJSON().fields.slice(1).map(({ value }) => value.slice(-4));
    assert.deepEqual(values, expected);
  }
  for (const [numbers, userId] of [
    [{ percent: 10, fixed: 0.04 }, ownerId], [{ fixed: 0.20 }, ownerId], [{ percent: 10 }, "other"]
  ]) {
    const interaction = createInteraction({ ...base, numbers, userId });
    await handler(interaction);
    assert.equal(interaction.calls[0].payload.flags, 64);
    assert.equal(interaction.calls[0].payload.embeds, undefined);
  }
});
