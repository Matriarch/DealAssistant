"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { createCommands } = require("../src/commands");

const ENV = {
  DISCORD_TOKEN: "MTA.example-token-value",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_OWNER_ID: "987654321098765432",
  DISPLAY_NAME: "Example",
  EMBED_COLOR: "#90E838",
  EMBED_FOOTER: "example footer",
  BTC_ADDRESS: "bc1qexampleddress0000000000000000000000",
  CASHAPP_TAG: "exampletag",
  TELEGRAM_URL: "https://t.me/example",
  MARKETPLACE_PROFILE_URL: "https://example.com/profile",
  VOUCH_THREAD_URL: "https://example.com/thread"
};

function build(overrides = {}, options = {}) {
  const cwd = options.cwd ?? fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"));
  const config = loadConfig({ env: { ...ENV, ...overrides }, cwd });
  return { config, commands: createCommands(config) };
}

function fakeInteraction(amount = null) {
  const calls = [];
  return {
    options: { getNumber: () => amount },
    reply: async (payload) => calls.push(payload),
    followUp: async (payload) => calls.push(payload),
    calls
  };
}

function find(commands, name) {
  return commands.find((command) => command.data.name === name);
}

test("only configured payment commands are registered", () => {
  const { commands } = build();
  const names = commands.map((command) => command.data.name);

  assert.deepEqual(names, ["btc", "cashapp", "info", "vouch", "middleman", "help"]);
  assert.equal(names.includes("eth"), false);
});

test("ENABLED_COMMANDS removes commands from the build", () => {
  const { commands } = build({ ENABLED_COMMANDS: "info,help" });

  assert.deepEqual(commands.map((command) => command.data.name), ["info", "help"]);
});

test("help lists only the enabled commands", async () => {
  const { commands } = build();
  const interaction = fakeInteraction();

  await find(commands, "help").execute(interaction);

  const description = interaction.calls[0].embeds[0].toJSON().description;
  assert.match(description, /\/btc/);
  assert.match(description, /\/vouch/);
  assert.equal(description.includes("/eth"), false);
});

test("vouch renders the configured deal amount", async () => {
  const { commands } = build();
  const interaction = fakeInteraction(200);

  await find(commands, "vouch").execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
  assert.equal(embed.description, "> **$200 deal, quick and easy.**");
  assert.match(JSON.stringify(embed), /example\.com\/thread/);
});

test("vouch falls back to the no-amount template", async () => {
  const { commands } = build();
  const interaction = fakeInteraction(null);

  await find(commands, "vouch").execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
  assert.match(embed.description, /leave a vouch/);
});

test("vouch template is customisable through config.json", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"));
  fs.writeFileSync(
    path.join(cwd, "config.json"),
    JSON.stringify({ vouchTemplate: "> {amount} deal, smooth." })
  );

  const { commands } = build({}, { cwd });
  const interaction = fakeInteraction(50);

  await find(commands, "vouch").execute(interaction);

  assert.equal(interaction.calls[0].embeds[0].toJSON().description, "> $50 deal, smooth.");
});

test("vouch reports missing links instead of showing empty fields", async () => {
  // The command is normally not registered without links, so this covers the
  // defensive guard inside the command itself.
  const config = loadConfig({
    env: { ...ENV, MARKETPLACE_PROFILE_URL: "", VOUCH_THREAD_URL: "" },
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"))
  });
  const command = require("../src/commands/vouch")(config);

  const interaction = fakeInteraction(null);
  await command.execute(interaction);

  assert.match(interaction.calls[0].content, /Vouch links are not configured/);
});

test("info lists only the configured contact links", async () => {
  const { commands } = build({ WEBSITE_URL: "", EMAIL_ADDRESS: "" });
  const interaction = fakeInteraction();

  await find(commands, "info").execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
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

  const interaction = fakeInteraction();
  await find(commands, "info").execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
  assert.match(embed.fields[0].value, /No contact links are configured/);
});

test("middleman policy comes from configuration", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"));
  fs.writeFileSync(
    path.join(cwd, "config.json"),
    JSON.stringify({ middlemanPolicy: ["First rule.", "Second rule."] })
  );

  const { commands } = build({}, { cwd });
  const interaction = fakeInteraction();

  await find(commands, "middleman").execute(interaction);

  assert.equal(interaction.calls[0].embeds[0].toJSON().description, "First rule.\n\nSecond rule.");
});

test("cashapp shows the configured tag", async () => {
  const { commands } = build();
  const interaction = fakeInteraction();

  await find(commands, "cashapp").execute(interaction);

  const embed = interaction.calls[0].embeds[0].toJSON();
  assert.match(embed.description, /\$exampletag/);
});

test("every embed uses the configured colour and footer", async () => {
  const { commands } = build();

  for (const name of ["cashapp", "info", "middleman", "help"]) {
    const interaction = fakeInteraction();
    await find(commands, name).execute(interaction);

    const embed = interaction.calls[0].embeds[0].toJSON();
    assert.equal(embed.color, 0x90e838, `${name} colour`);
    assert.equal(embed.footer.text, "example footer", `${name} footer`);
  }
});
