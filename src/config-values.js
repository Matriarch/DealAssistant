"use strict";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseColor(value, problems, label) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) {
    problems.push(`${label} must be a hex colour such as #5865F2.`);
    return null;
  }
  let hex = input.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((character) => character + character).join("");
  }
  return parseInt(hex, 16);
}

function parseUrl(value, problems, label) {
  let parsed;
  try {
    if (typeof value !== "string" || /[\s<>()[\]"'\\`]/u.test(value)) {
      throw new Error();
    }
    parsed = new URL(value);
  } catch {
    problems.push(`${label} must be a full URL including https://.`);
    return null;
  }
  if (!/^https?:\/\/[^/]/i.test(value) || !["https:", "http:"].includes(parsed.protocol)) {
    problems.push(`${label} must use http or https with a full URL.`);
    return null;
  }
  if (parsed.username || parsed.password) {
    problems.push(`${label} must not contain URL credentials.`);
    return null;
  }
  return value;
}

function renderTemplate(template, variables) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match
  );
}

module.exports = { isObject, parseColor, parseUrl, renderTemplate };
