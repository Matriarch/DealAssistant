"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ConfigError, loadConfig } = require("../src/config");
const { createCommands } = require("../src/commands");
const { LIMITS, checkEmbedLimits, describeEmbed } = require("../src/utils/embeds");
const { assertEmbedsWithinLimits, collectEmbedProblems } = require("../src/validate");
const { validAddresses } = require("./helpers");

const BASE_ENV = {
  DISCORD_TOKEN: "MTA.example-token-value",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_OWNER_ID: "987654321098765432",
  ...validAddresses()
};

const BASE_CONFIG = { app: { embedColor: 0x5865f2, footer: "" } };

function describe(spec) {
  return describeEmbed(BASE_CONFIG, spec);
}

function configWith(overrides, extra) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dealassistant-"));

  if (extra) {
    fs.writeFileSync(path.join(cwd, "config.json"), JSON.stringify(extra));
  }

  return loadConfig({ env: { ...BASE_ENV, ...overrides }, cwd });
}

test("a normal embed reports no limit problems", () => {
  const described = describe({
    title: "Title",
    description: "Description",
    fields: [{ name: "Field", value: "Value" }]
  });

  assert.deepEqual(checkEmbedLimits(described, "/test"), []);
});

test("oversized titles and descriptions are reported", () => {
  const title = describe({ title: "t".repeat(LIMITS.title + 1) });
  assert.match(checkEmbedLimits(title, "/x")[0], /title is/);

  const description = describe({ description: "d".repeat(LIMITS.description + 1) });
  assert.match(checkEmbedLimits(description, "/x")[0], /description is/);
});

test("oversized field values and footers are reported", () => {
  const field = describe({ fields: [{ name: "n", value: "v".repeat(LIMITS.fieldValue + 1) }] });
  assert.match(checkEmbedLimits(field, "/x")[0], /value/);

  const footer = describe({ footer: "f".repeat(LIMITS.footer + 1) });
  assert.match(checkEmbedLimits(footer, "/x")[0], /footer text/);
});

test("the combined character budget is enforced", () => {
  const described = describe({
    description: "d".repeat(4000),
    fields: [{ name: "n", value: "v".repeat(1000) }],
    footer: "f".repeat(1500)
  });

  const problems = checkEmbedLimits(described, "/x");
  assert.ok(problems.some((problem) => /total embed content/.test(problem)));
});

test("a valid configuration passes embed validation", () => {
  const config = configWith({});
  const commands = createCommands(config);

  assert.deepEqual(collectEmbedProblems(config, commands), []);
  assert.doesNotThrow(() => assertEmbedsWithinLimits(config, commands));
});

test("an oversized middleman policy fails at startup", () => {
  const config = configWith({}, { middlemanPolicy: ["p".repeat(4200)] });
  const commands = createCommands(config);

  assert.throws(() => assertEmbedsWithinLimits(config, commands), (error) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /\/middleman/);
    assert.match(error.message, /description is/);
    return true;
  });
});

test("template substitution is measured, not the raw template", () => {
  const config = configWith(
    { DISPLAY_NAME: "Example Display Name" },
    { infoMessage: `${"x".repeat(4085)}{displayName}` }
  );
  const commands = createCommands(config);

  assert.throws(() => assertEmbedsWithinLimits(config, commands), /\/info/);
});

test("an oversized footer fails at startup with a clear message", () => {
  const config = configWith({ EMBED_FOOTER: "f".repeat(LIMITS.footer + 1) });
  const commands = createCommands(config);

  assert.throws(() => assertEmbedsWithinLimits(config, commands), /footer text/);
});
