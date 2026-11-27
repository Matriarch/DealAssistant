"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  PAYMENT_METHODS,
  PAYMENT_COMMAND_NAMES,
  COMMAND_NAMES
} = require("./coins");
const { VALIDATORS, validateAddress } = require("./utils/address");

const DEFAULT_EMBED_COLOR = "#5865F2";
const DEFAULT_DISPLAY_NAME = "Deal Assistant";

const SNOWFLAKE_RE = /^\d{17,20}$/;
const HEX_COLOR_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_TEXTS = {
  infoMessage:
    "Hi, I'm {displayName}. Use the commands here to get my payment details, contact links, and deal information.",
  middlemanPolicy: [
    "I do not middleman deals.",
    "Always verify who you are dealing with before sending funds."
  ],
  vouchTemplate: "> **{amount} deal, quick and easy.**",
  vouchTemplateNoAmount: "> Thanks for the deal \u2014 here is where to leave a vouch."
};

class ConfigError extends Error {
  constructor(problems) {
    super(`Configuration is invalid:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function looksLikePlaceholder(value) {
  const lower = value.trim().toLowerCase();
  return (
    lower.startsWith("your-") ||
    lower.startsWith("your_") ||
    lower.includes("<") ||
    lower === "changeme" ||
    lower === "todo"
  );
}

function parseColor(value, problems, label) {
  const input = String(value).trim();

  if (!HEX_COLOR_RE.test(input)) {
    problems.push(`${label} must be a hex colour such as #5865F2.`);
    return null;
  }

  let hex = input.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }

  return parseInt(hex, 16);
}

function parseUrl(value, problems, label) {
  let parsed;

  try {
    if (/[\s<>()[\]"'\\`]/u.test(value)) {
      throw new Error();
    }
    parsed = new URL(value);
  } catch {
    problems.push(`${label} must be a full URL including https://.`);
    return null;
  }

  if (!/^https?:\/\//i.test(value) || !["https:", "http:"].includes(parsed.protocol)) {
    problems.push(`${label} must use http or https with a full URL.`);
    return null;
  }

  if (parsed.username || parsed.password) {
    problems.push(`${label} must not contain URL credentials.`);
    return null;
  }

  return value;
}

function parseEnabledCommands(value, problems) {
  if (isBlank(value)) {
    return new Set(COMMAND_NAMES);
  }

  const requested = value
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  const unknown = requested.filter((name) => !COMMAND_NAMES.includes(name));
  if (unknown.length > 0) {
    problems.push(
      "ENABLED_COMMANDS contains an unknown command. " +
        `Valid names are: ${COMMAND_NAMES.join(", ")}.`
    );
    return new Set(COMMAND_NAMES);
  }

  return new Set(requested);
}

function readTextConfig(configPath, problems) {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    problems.push("config.json could not be parsed. Check its JSON syntax and file permissions.");
    return {};
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push("config.json must contain a JSON object.");
    return {};
  }

  return parsed;
}

function normalizePolicy(value, problems) {
  if (value === undefined) {
    return DEFAULT_TEXTS.middlemanPolicy;
  }

  const lines = Array.isArray(value) ? value : [value];

  if (lines.some((line) => typeof line !== "string")) {
    problems.push("config.json middlemanPolicy must be a string or an array of strings.");
    return DEFAULT_TEXTS.middlemanPolicy;
  }

  return lines.map((line) => line.trim()).filter((line) => line.length > 0);
}

function renderTemplate(template, variables) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
  );
}

/**
 * Reads .env-style values plus an optional config.json and returns a validated
 * configuration object.
 *
 * @param {object} [options]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {string} [options.cwd]
 * @param {string} [options.configFile]
 */
function loadConfig(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configFile ?? path.join(cwd, "config.json");

  const problems = [];
  const warnings = [];

  // --- credentials -------------------------------------------------------
  const token = (env.DISCORD_TOKEN ?? "").trim();
  if (!token) {
    problems.push("DISCORD_TOKEN is required. Copy the bot token from the Discord Developer Portal.");
  } else if (looksLikePlaceholder(token)) {
    problems.push("DISCORD_TOKEN still contains the example value. Paste your real bot token.");
  }

  const clientId = (env.DISCORD_CLIENT_ID ?? "").trim();
  if (!clientId) {
    problems.push("DISCORD_CLIENT_ID is required. It is the Application ID from the Developer Portal.");
  } else if (!SNOWFLAKE_RE.test(clientId)) {
    problems.push("DISCORD_CLIENT_ID must be a numeric Discord application ID (17-20 digits).");
  }

  const ownerId = (env.DISCORD_OWNER_ID ?? "").trim();
  if (!ownerId) {
    problems.push(
      "DISCORD_OWNER_ID is required. This is the Discord user ID allowed to run commands, " +
        "not your application ID."
    );
  } else if (!SNOWFLAKE_RE.test(ownerId)) {
    problems.push("DISCORD_OWNER_ID must be a numeric Discord user ID (17-20 digits).");
  } else if (ownerId === clientId) {
    problems.push(
      "DISCORD_OWNER_ID must be your personal Discord user ID, not the application ID. " +
        "Enabling Developer Mode in Discord lets you copy it."
    );
  }

  // --- appearance --------------------------------------------------------
  const displayName = isBlank(env.DISPLAY_NAME)
    ? DEFAULT_DISPLAY_NAME
    : env.DISPLAY_NAME.trim();

  if (displayName.length > 80) {
    problems.push("DISPLAY_NAME must be 80 characters or fewer.");
  }

  const embedColor = parseColor(
    isBlank(env.EMBED_COLOR) ? DEFAULT_EMBED_COLOR : env.EMBED_COLOR,
    problems,
    "EMBED_COLOR"
  );

  const footer = isBlank(env.EMBED_FOOTER) ? "" : env.EMBED_FOOTER.trim();
  const paymentQrSetting = (env.PAYMENT_QR_ENABLED ?? "").trim().toLowerCase();
  if (!["", "true", "false"].includes(paymentQrSetting)) {
    problems.push("PAYMENT_QR_ENABLED must be true or false.");
  }
  const paymentQrEnabled = paymentQrSetting === "true";

  // --- payment addresses -------------------------------------------------
  const addresses = {};
  const rawAddresses = {};

  for (const [commandName, method] of Object.entries(PAYMENT_METHODS)) {
    const raw = env[method.envKey] ?? "";

    if (raw.trim() === "") {
      continue;
    }

    if (raw !== raw.trim()) {
      problems.push(`${method.envKey} has leading or trailing whitespace. Remove it.`);
      continue;
    }

    if (/\s/.test(raw)) {
      problems.push(`${method.envKey} must not contain spaces.`);
      continue;
    }

    const result = validateAddress(commandName, raw);
    if (!result.valid) {
      problems.push(
        `${method.envKey} is not a valid ${VALIDATORS[commandName].label} address (${result.reason}).`
      );
      continue;
    }

    const duplicate = Object.entries(rawAddresses).find(([, other]) => other === raw);
    if (duplicate) {
      warnings.push(
        `${method.envKey} is identical to ${PAYMENT_METHODS[duplicate[0]].envKey}. ` +
          "Double-check that this is intentional."
      );
    }

    rawAddresses[commandName] = raw;
    addresses[commandName] = raw;
  }

  // --- contact links -----------------------------------------------------
  const contacts = {
    telegramUrl: isBlank(env.TELEGRAM_URL) ? "" : env.TELEGRAM_URL.trim(),
    websiteUrl: isBlank(env.WEBSITE_URL) ? "" : env.WEBSITE_URL.trim(),
    email: isBlank(env.EMAIL_ADDRESS) ? "" : env.EMAIL_ADDRESS.trim(),
    marketplaceUrl: isBlank(env.MARKETPLACE_PROFILE_URL)
      ? ""
      : env.MARKETPLACE_PROFILE_URL.trim(),
    vouchThreadUrl: isBlank(env.VOUCH_THREAD_URL) ? "" : env.VOUCH_THREAD_URL.trim()
  };

  if (contacts.telegramUrl) {
    parseUrl(contacts.telegramUrl, problems, "TELEGRAM_URL");
  }
  if (contacts.websiteUrl) {
    parseUrl(contacts.websiteUrl, problems, "WEBSITE_URL");
  }
  if (contacts.marketplaceUrl) {
    parseUrl(contacts.marketplaceUrl, problems, "MARKETPLACE_PROFILE_URL");
  }
  if (contacts.vouchThreadUrl) {
    parseUrl(contacts.vouchThreadUrl, problems, "VOUCH_THREAD_URL");
  }
  if (contacts.email && (!EMAIL_RE.test(contacts.email) || /[<>`()[\]"'\\]/u.test(contacts.email))) {
    problems.push("EMAIL_ADDRESS must look like name@example.com.");
  }

  // --- cash app ----------------------------------------------------------
  let cashAppTag = isBlank(env.CASHAPP_TAG) ? "" : env.CASHAPP_TAG.trim();

  if (cashAppTag) {
    if (!/^\$?[a-z0-9]+$/i.test(cashAppTag)) {
      problems.push("CASHAPP_TAG must contain only letters and numbers after the optional dollar sign.");
    } else if (!cashAppTag.startsWith("$")) {
      cashAppTag = `$${cashAppTag}`;
    }
  }

  // --- long-form text ----------------------------------------------------
  const fileConfig = readTextConfig(configPath, problems);
  const texts = {
    infoMessage:
      typeof fileConfig.infoMessage === "string" && fileConfig.infoMessage.trim()
        ? fileConfig.infoMessage.trim()
        : DEFAULT_TEXTS.infoMessage,
    middlemanPolicy: normalizePolicy(fileConfig.middlemanPolicy, problems),
    vouchTemplate:
      typeof fileConfig.vouchTemplate === "string" && fileConfig.vouchTemplate.trim()
        ? fileConfig.vouchTemplate.trim()
        : DEFAULT_TEXTS.vouchTemplate,
    vouchTemplateNoAmount:
      typeof fileConfig.vouchTemplateNoAmount === "string" && fileConfig.vouchTemplateNoAmount.trim()
        ? fileConfig.vouchTemplateNoAmount.trim()
        : DEFAULT_TEXTS.vouchTemplateNoAmount
  };

  if (!texts.vouchTemplate.includes("{amount}")) {
    warnings.push("config.json vouchTemplate has no {amount} placeholder, so deal amounts will not appear.");
  }

  // --- command selection -------------------------------------------------
  const enabledCommands = parseEnabledCommands(env.ENABLED_COMMANDS, problems);
  const paymentMethods = new Map();
  for (const [name, address] of Object.entries(addresses)) {
    const id = { usdceth: "USDC-ETH", usdcsol: "USDC-SOL" }[name] ?? name.toUpperCase();
    paymentMethods.set(id, { ...PAYMENT_METHODS[name], address, supportsQr: true });
  }
  if (cashAppTag) {
    paymentMethods.set("CASHAPP", {
      title: "Cash App",
      network: "Cash App",
      address: cashAppTag,
      addressLabel: "Cashtag"
    });
  }
  if (enabledCommands.has("pay") && paymentMethods.size === 0) {
    enabledCommands.delete("pay");
    warnings.push("/pay is disabled because no payment methods are configured.");
  }

  for (const commandName of PAYMENT_COMMAND_NAMES) {
    if (!enabledCommands.has(commandName)) {
      continue;
    }

    if (!addresses[commandName]) {
      enabledCommands.delete(commandName);
      warnings.push(
        `/${commandName} is disabled because ${PAYMENT_METHODS[commandName].envKey} is not set.`
      );
    }
  }

  if (enabledCommands.has("cashapp") && !cashAppTag) {
    enabledCommands.delete("cashapp");
    warnings.push("/cashapp is disabled because CASHAPP_TAG is not set.");
  }

  if (enabledCommands.has("vouch") && !contacts.marketplaceUrl && !contacts.vouchThreadUrl) {
    enabledCommands.delete("vouch");
    warnings.push(
      "/vouch is disabled because neither MARKETPLACE_PROFILE_URL nor VOUCH_THREAD_URL is set."
    );
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    discord: { token, clientId, ownerId },
    app: { displayName, embedColor, footer },
    addresses,
    paymentMethods,
    paymentQrEnabled,
    cashAppTag,
    contacts,
    texts,
    enabledCommands,
    warnings,
    configPath: fs.existsSync(configPath) ? configPath : null,
    isEnabled: (name) => enabledCommands.has(name)
  };
}

module.exports = {
  ConfigError,
  DEFAULT_EMBED_COLOR,
  DEFAULT_DISPLAY_NAME,
  DEFAULT_TEXTS,
  loadConfig,
  parseColor,
  renderTemplate
};
