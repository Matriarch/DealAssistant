"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { createCommands } = require("../src/commands");
const { createInteraction, validAddresses } = require("./helpers");

const ENV = {
  DISCORD_TOKEN: "MTA.example-token-value",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_OWNER_ID: "987654321098765432",
  DISPLAY_NAME: "Example",
  EMBED_COLOR: "#90E838",
  EMBED_FOOTER: "example footer",
  CASHAPP_TAG: "exampletag",
  TELEGRAM_URL: "https://t.me/example",
  MARKETPLACE_PROFILE_URL: "https://example.com/profile",
  VOUCH_THREAD_URL: "https://example.com/thread",
  ...validAddresses()
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"));
}

function build(overrides = {}, options = {}) {
  const cwd = options.cwd ?? tempDir();
  const config = loadConfig({ env: { ...ENV, ...overrides }, cwd });
  return { config, commands: createCommands(config) };
}

function find(commands, name) {
  return commands.find((command) => command.data.name === name);
}

test("only configured payment commands are registered", () => {
  const { commands } = build({ ETH_ADDRESS: undefined, SOL_ADDRESS: undefined });
  const names = commands.map((command) => command.data.name);

  assert.ok(names.includes("btc"));
  assert.equal(names.includes("eth"), false);
  assert.equal(names.includes("sol"), false);
  assert.ok(names.includes("help"));
});

test("ENABLED_COMMANDS removes commands from the build", () => {
  const { commands } = build({ ENABLED_COMMANDS: "info,help" });

  assert.deepEqual(commands.map((command) => command.data.name), ["info", "help"]);
});

test("help lists only the enabled commands", async () => {
  const { commands } = build();
  const interaction = createInteraction();

  await find(commands, "help").execute(interaction);

  const description = interaction.calls[0].payload.embeds[0].toJSON().description;
  assert.match(description, /\/btc/);
  assert.match(description, /\/vouch/);
});

test("vouch renders the configured deal amount", async () => {
  const { commands } = build();
  const interaction = createInteraction({ amount: 200 });

  await find(commands, "vouch").execute(interaction);

  const embed = interaction.calls[0].payload.embeds[0].toJSON();
  assert.equal(embed.description, "> **$200 deal, quick and easy.**");
  assert.match(JSON.stringify(embed), /example\.com\/thread/);
});

test("vouch rejects an invalid amount", async () => {
  const { commands } = build();
  const interaction = createInteraction({ amount: -5 });

  await find(commands, "vouch").execute(interaction);

  assert.equal(interaction.calls[0].type, "reply");
  assert.match(interaction.calls[0].payload.content, /Amount must be between/);
});

test("vouch falls back to the no-amount template", async () => {
  const { commands } = build();
  const interaction = createInteraction({ amount: null });

  await find(commands, "vouch").execute(interaction);

  const embed = interaction.calls[0].payload.embeds[0].toJSON();
  assert.match(embed.description, /leave a vouch/);
});

test("vouch template is customisable through config.json", async () => {
  const cwd = tempDir();
  fs.writeFileSync(
    path.join(cwd, "config.json"),
    JSON.stringify({ vouchTemplate: "> {amount} deal, smooth." })
  );

  const { commands } = build({}, { cwd });
  const interaction = createInteraction({ amount: 50 });

  await find(commands, "vouch").execute(interaction);

  assert.equal(interaction.calls[0].payload.embeds[0].toJSON().description, "> $50 deal, smooth.");
});

test("vouch reports missing links instead of showing empty fields", async () => {
  const config = loadConfig({
    env: { ...ENV, MARKETPLACE_PROFILE_URL: "", VOUCH_THREAD_URL: "" },
    cwd: tempDir()
  });
  const command = require("../src/commands/vouch")(config);

  const interaction = createInteraction({ amount: null });
  await command.execute(interaction);

  assert.match(interaction.calls[0].payload.content, /Vouch links are not configured/);
});

test("info lists only the configured contact links", async () => {
  const { commands } = build({ WEBSITE_URL: "", EMAIL_ADDRESS: "" });
  const interaction = createInteraction();

  await find(commands, "info").execute(interaction);

  const embed = interaction.calls[0].payload.embeds[0].toJSON();
  const contact = embed.fields[0].value;

  assert.equal(embed.title, "Example");
  assert.match(contact, /Telegram/);
  assert.match(contact, /Marketplace/);
  assert.equal(contact.includes("Website"), false);
  assert.equal(contact.includes("Email"), false);
});

test("info reports when no contact links are configured", async () => {
  const { commands } = build({
    TELEGRAM_URL: "",
    WEBSITE_URL: "",
    EMAIL_ADDRESS: "",
    MARKETPLACE_PROFILE_URL: "",
    ENABLED_COMMANDS: "info,help"
  });

  const interaction = createInteraction();
  await find(commands, "info").execute(interaction);

  const embed = interaction.calls[0].payload.embeds[0].toJSON();
  assert.match(embed.fields[0].value, /No contact links are configured/);
});

test("middleman policy comes from configuration", async () => {
  const cwd = tempDir();
  fs.writeFileSync(
    path.join(cwd, "config.json"),
    JSON.stringify({ middlemanPolicy: ["First rule.", "Second rule."] })
  );

  const { commands } = build({}, { cwd });
  const interaction = createInteraction();

  await find(commands, "middleman").execute(interaction);

  assert.equal(
    interaction.calls[0].payload.embeds[0].toJSON().description,
    "First rule.\n\nSecond rule."
  );
});

test("cashapp shows the configured tag", async () => {
  const { commands } = build();
  const interaction = createInteraction();

  await find(commands, "cashapp").execute(interaction);

  const embed = interaction.calls[0].payload.embeds[0].toJSON();
  assert.match(embed.description, /\$exampletag/);
});

test("every embed uses the configured colour and footer", async () => {
  const { commands } = build();

  for (const name of ["cashapp", "info", "middleman", "help"]) {
    const interaction = createInteraction();
    await find(commands, name).execute(interaction);

    const embed = interaction.calls[0].payload.embeds[0].toJSON();
    assert.equal(embed.color, 0x90e838, `${name} colour`);
    assert.equal(embed.footer.text, "example footer", `${name} footer`);
  }
});
