"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ConfigError,
  DEFAULT_TEXTS,
  loadConfig,
  parseColor,
  renderTemplate
} = require("../src/config");
const { litecoinLegacyAddress, validAddresses } = require("./helpers");

const BASE_ENV = {
  DISCORD_TOKEN: "MTA.example-token-value",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_OWNER_ID: "987654321098765432"
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"));
}

function load(overrides = {}, options = {}) {
  return loadConfig({
    env: { ...BASE_ENV, ...overrides },
    cwd: options.cwd ?? tempDir()
  });
}

test("minimal valid configuration applies neutral defaults", () => {
  const config = load();

  assert.equal(config.app.displayName, "Deal Assistant");
  assert.equal(config.app.embedColor, 0x5865f2);
  assert.equal(config.app.footer, "");
  assert.equal(config.discord.ownerId, BASE_ENV.DISCORD_OWNER_ID);
  assert.ok(config.isEnabled("info"));
  assert.ok(config.isEnabled("help"));
  assert.ok(config.isEnabled("middleman"));
  assert.equal(config.isEnabled("btc"), false);
});

test("missing credentials report every problem at once", () => {
  assert.throws(
    () => loadConfig({ env: {}, cwd: tempDir() }),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.problems.length, 3);
      assert.match(error.problems.join(" "), /DISCORD_TOKEN/);
      assert.match(error.problems.join(" "), /DISCORD_CLIENT_ID/);
      assert.match(error.problems.join(" "), /DISCORD_OWNER_ID/);
      return true;
    }
  );
});

test("example placeholder token is rejected", () => {
  assert.throws(() => load({ DISCORD_TOKEN: "your-bot-token-here" }), ConfigError);
});

test("non-numeric client id is rejected", () => {
  assert.throws(() => load({ DISCORD_CLIENT_ID: "abc123" }), ConfigError);
});

test("owner id equal to the application id is rejected", () => {
  assert.throws(
    () => load({ DISCORD_OWNER_ID: BASE_ENV.DISCORD_CLIENT_ID }),
    /personal Discord user ID/
  );
});

test("invalid embed colour is rejected without echoing the value", () => {
  assert.throws(
    () => load({ EMBED_COLOR: "chartreuse" }),
    (error) => {
      assert.match(error.message, /hex colour/);
      assert.equal(error.message.includes("chartreuse"), false);
      return true;
    }
  );
});

test("three digit hex colours expand correctly", () => {
  assert.equal(parseColor("#0f0", []), 0x00ff00);
  assert.equal(parseColor("abc", []), 0xaabbcc);
});

test("display name and footer are applied", () => {
  const config = load({ DISPLAY_NAME: "Example Trader", EMBED_FOOTER: "example footer" });

  assert.equal(config.app.displayName, "Example Trader");
  assert.equal(config.app.footer, "example footer");
});

test("every supported network accepts a valid address", () => {
  const addresses = validAddresses();
  const config = load(addresses);

  for (const commandName of ["btc", "ltc", "eth", "sol", "usdceth", "usdcsol"]) {
    assert.ok(config.isEnabled(commandName), `${commandName} should be enabled`);
  }
});

test("an address from the wrong network is rejected", () => {
  const config = () => load({ BTC_ADDRESS: litecoinLegacyAddress() });

  assert.throws(config, (error) => {
    assert.match(error.message, /BTC_ADDRESS is not a valid Bitcoin address/);
    return true;
  });
});

test("an Ethereum address with a broken EIP-55 checksum is rejected", () => {
  const invalid = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD";
  assert.throws(() => load({ ETH_ADDRESS: invalid }), /EIP-55 checksum/);
});

test("surrounding whitespace is rejected rather than trimmed", () => {
  const address = validAddresses().BTC_ADDRESS;

  assert.throws(() => load({ BTC_ADDRESS: ` ${address}` }), /leading or trailing whitespace/);
});

test("a malformed address is rejected without echoing it", () => {
  assert.throws(
    () => load({ BTC_ADDRESS: "not-an-address-at-all-000000" }),
    (error) => {
      assert.match(error.message, /not a valid Bitcoin address/);
      assert.equal(error.message.includes("not-an-address-at-all"), false);
      return true;
    }
  );
});

test("duplicate addresses produce a warning, not an error", () => {
  const address = validAddresses().ETH_ADDRESS;
  const config = load({ ETH_ADDRESS: address, USDC_ETH_ADDRESS: address });

  assert.ok(config.isEnabled("eth"));
  assert.match(config.warnings.join(" "), /identical to ETH_ADDRESS/);
});

test("unknown ENABLED_COMMANDS entries are rejected", () => {
  assert.throws(() => load({ ENABLED_COMMANDS: "btc,nope" }), /unknown command/);
});

test("ENABLED_COMMANDS filters commands", () => {
  const config = load({ ENABLED_COMMANDS: "info,middleman" });

  assert.ok(config.isEnabled("info"));
  assert.ok(config.isEnabled("middleman"));
  assert.equal(config.isEnabled("help"), false);
});

test("cash app tag is normalised with a dollar sign", () => {
  assert.equal(load({ CASHAPP_TAG: "exampletag" }).cashAppTag, "$exampletag");
  assert.equal(load({ CASHAPP_TAG: "$exampletag" }).cashAppTag, "$exampletag");
});

test("malformed URLs are rejected", () => {
  assert.throws(() => load({ TELEGRAM_URL: "not a url" }), /full URL/);
  assert.throws(() => load({ WEBSITE_URL: "ftp://example.com" }), /http or https/);
});

test("config.json overrides long form text", () => {
  const cwd = tempDir();
  fs.writeFileSync(
    path.join(cwd, "config.json"),
    JSON.stringify({
      infoMessage: "Custom info for {displayName}.",
      middlemanPolicy: ["Line one.", "Line two."],
      vouchTemplate: "> Custom {amount} vouch."
    })
  );

  const config = loadConfig({ env: BASE_ENV, cwd });

  assert.equal(config.texts.infoMessage, "Custom info for {displayName}.");
  assert.deepEqual(config.texts.middlemanPolicy, ["Line one.", "Line two."]);
  assert.equal(config.texts.vouchTemplate, "> Custom {amount} vouch.");
});

test("missing config.json falls back to default text", () => {
  const config = load();
  assert.equal(config.texts.infoMessage, DEFAULT_TEXTS.infoMessage);
  assert.deepEqual(config.texts.middlemanPolicy, DEFAULT_TEXTS.middlemanPolicy);
});

test("invalid config.json is reported as a configuration problem", () => {
  const cwd = tempDir();
  fs.writeFileSync(path.join(cwd, "config.json"), "{ not json");

  assert.throws(() => loadConfig({ env: BASE_ENV, cwd }), /could not be parsed/);
});

test("renderTemplate replaces known keys and preserves unknown ones", () => {
  assert.equal(renderTemplate("Hello {name}, {missing}", { name: "Example" }), "Hello Example, {missing}");
});
