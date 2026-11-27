"use strict";

/**
 * Strips anything that must never reach a log file.
 *
 * Bot tokens, webhook URLs and bearer headers are matched by shape, and any
 * value registered at startup (such as the configured token) is removed
 * literally, in case it does not match the expected pattern.
 */
const SECRET_PATTERNS = [
  { pattern: /[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, replacement: "[redacted]" },
  { pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^\s"']+/gi, replacement: "[redacted]" },
  { pattern: /(Bearer\s+)[A-Za-z0-9._-]+/gi, replacement: "$1[redacted]" }
];

const registeredSecrets = new Set();

function registerSecret(value) {
  if (typeof value === "string" && value.length >= 8) {
    registeredSecrets.add(value);
  }
}

function redact(value) {
  if (typeof value !== "string") {
    return value;
  }

  let output = value;

  for (const secret of registeredSecrets) {
    output = output.split(secret).join("[redacted]");
  }

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

/**
 * Reduces an error to the fields worth logging, with every string redacted.
 * The original object is never passed through, because Discord errors can carry
 * request bodies.
 */
function redactError(error) {
  if (!error) {
    return { name: "Error", message: "unknown error" };
  }

  const summary = {
    name: redact(String(error.name ?? "Error")),
    message: redact(String(error.message ?? error))
  };

  if (typeof error.code === "number") {
    summary.code = error.code;
  }
  if (typeof error.status === "number") {
    summary.status = error.status;
  }

  return summary;
}

module.exports = { redact, redactError, registerSecret };
