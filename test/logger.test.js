"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { redact, redactError, registerSecret } = require("../src/utils/logger");

// Split so no credential-shaped literal lives in the repository.
const BOT_TOKEN = ["MTA5NzQ2NTQzMjEwOTg3NjU0", "GaBbCc", "dEfGhIjKlMnOpQrStUvWxYz0123456789abcd"].join(".");
const WEBHOOK = ["https://discord.com/api/webhooks", "123456789012345678", "abcdefghijklmnopqrstuvwxyz"].join("/");

test("a registered secret is removed from any message", () => {
  registerSecret("super-secret-value");
  assert.equal(redact("token=super-secret-value done"), "token=[redacted] done");
});

test("token shaped strings are removed even if never registered", () => {
  const output = redact(`login failed for ${BOT_TOKEN}`);
  assert.equal(output.includes(BOT_TOKEN), false);
  assert.match(output, /\[redacted\]/);
});

test("webhook URLs are removed", () => {
  const output = redact(`posting to ${WEBHOOK} now`);
  assert.equal(output.includes(WEBHOOK), false);
  assert.match(output, /\[redacted\]/);
});

test("bearer headers are removed", () => {
  assert.equal(redact("Authorization: Bearer abc.def.ghi"), "Authorization: Bearer [redacted]");
});

test("redactError keeps only safe fields", () => {
  const error = new Error(`request failed with ${BOT_TOKEN}`);
  error.code = 50035;
  error.status = 400;
  error.requestBody = { token: BOT_TOKEN };

  const summary = redactError(error);

  assert.equal(summary.name, "Error");
  assert.equal(summary.message.includes(BOT_TOKEN), false);
  assert.equal(summary.code, 50035);
  assert.equal(summary.status, 400);
  assert.equal("requestBody" in summary, false);
});

test("redactError handles missing and non-error values", () => {
  assert.equal(redactError(undefined).message, "unknown error");
  assert.equal(redactError("plain string").message, "plain string");
});

test("non-string values pass through unchanged", () => {
  assert.equal(redact(42), 42);
  assert.equal(redact(null), null);
});
