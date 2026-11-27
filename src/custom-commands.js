"use strict";

const { escapeMarkdown } = require("discord.js");
const { COMMAND_NAMES } = require("./coins");
const { isObject, parseColor, parseUrl, renderTemplate } = require("./config-values");
const { LIMITS, checkEmbedLimits, describeEmbed } = require("./utils/embeds");

const MAX_GLOBAL_COMMANDS = 100;
const MAX_OPTIONS = 5;
const MAX_OPTION_LENGTH = 64;
const COMMAND_NAME = /^[-_\p{L}\p{N}\p{sc=Devanagari}\p{sc=Thai}]{1,32}$/u;
const PARAMETER_NAME = /^[a-z][a-z0-9]{0,31}$/;
const PARAMETER_TEXT = /^[\p{L}\p{M}\p{N} ,'-]+$/u;
const OPTION_FALLBACK = "—";

function isText(value, limit) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit &&
    !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value);
}

function readOptions(source, at, problems) {
  if (source === undefined) {
    return [];
  }
  if (!Array.isArray(source) || source.length > MAX_OPTIONS) {
    problems.push(`${at}.options must be an array with at most ${MAX_OPTIONS} optional text parameters.`);
    return [];
  }
  const options = new Map();
  for (const [index, option] of source.entries()) {
    if (!isObject(option) || typeof option.name !== "string" || !PARAMETER_NAME.test(option.name) ||
        options.has(option.name) || !isText(option.description, 100)) {
      problems.push(`${at}.options[${index}] needs a unique lowercase alphanumeric name and a description of 1–100 characters.`);
      continue;
    }
    const maxLength = option.maxLength ?? MAX_OPTION_LENGTH;
    if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > MAX_OPTION_LENGTH) {
      problems.push(`${at}.options[${index}].maxLength must be between 1 and ${MAX_OPTION_LENGTH}.`);
      continue;
    }
    options.set(option.name, { name: option.name, description: option.description, maxLength });
  }
  return [...options.values()];
}

function readEmbedEntries(source, keys, limits, at, problems) {
  if (source === undefined) {
    return [];
  }
  if (!Array.isArray(source) || source.length > LIMITS.fields) {
    problems.push(`${at} must be an array with at most ${LIMITS.fields} entries.`);
    return [];
  }
  return source.flatMap((entry, index) => {
    if (!isObject(entry) || !keys.every((key, i) => isText(entry[key], limits[i]))) {
      problems.push(`${at}[${index}] must have non-empty ${keys.join(" and ")} within Discord’s limits.`);
      return [];
    }
    return [Object.fromEntries(keys.map((key) => [key, entry[key]]))];
  });
}

function readCustomCommands(source, app, problems) {
  const commands = new Map();
  if (source === undefined) {
    return commands;
  }
  if (!Array.isArray(source) || source.length > MAX_GLOBAL_COMMANDS) {
    problems.push(`config.json customCommands must be an array with at most ${MAX_GLOBAL_COMMANDS} entries.`);
    return commands;
  }

  for (const [index, entry] of source.entries()) {
    const at = `config.json customCommands[${index}]`;
    if (!isObject(entry)) {
      problems.push(`${at} must be an object.`);
      continue;
    }
    const { name, description, title, body, footer, color } = entry;
    const before = problems.length;
    if (typeof name !== "string" || name.length > 32 || !COMMAND_NAME.test(name) || name !== name.toLowerCase() ||
        COMMAND_NAMES.includes(name) || commands.has(name)) {
      problems.push(`${at}.name must be a unique lowercase Discord slash command name and avoid built-in names.`);
    }
    if (!isText(description, 100)) {
      problems.push(`${at}.description must contain 1–100 characters.`);
    }
    for (const [key, value, limit] of [
      ["title", title, LIMITS.title], ["body", body, LIMITS.description], ["footer", footer, LIMITS.footer]
    ]) {
      if (value !== undefined && !(key === "footer" && value === "") && !isText(value, limit)) {
        problems.push(`${at}.${key} must contain 1–${limit} characters.`);
      }
    }

    const options = readOptions(entry.options, at, problems);
    const fields = readEmbedEntries(entry.fields, ["name", "value"], [LIMITS.fieldName, LIMITS.fieldValue],
      `${at}.fields`, problems);
    const links = readEmbedEntries(entry.links, ["label", "url"], [100, LIMITS.fieldValue], `${at}.links`, problems)
      .map(({ label, url }, linkIndex) => ({
        label,
        url: parseUrl(url, problems, `${at}.links[${linkIndex}].url`)
      }));
    const embedColor = color === undefined ? app.embedColor : parseColor(color, problems, `${at}.color`);
    if (problems.length !== before) {
      continue;
    }
    if (!title && !body && fields.length === 0 && links.length === 0) {
      problems.push(`${at} needs an embed title, body, field or link.`);
      continue;
    }

    const permitted = new Set(["displayName", ...options.map((option) => option.name)]);
    const templates = [title, body, footer, ...fields.flatMap((field) => [field.name, field.value])];
    if (templates.some((template) => [...(template ?? "").matchAll(/\{(\w+)\}/g)]
      .some(([, placeholder]) => !permitted.has(placeholder)))) {
      problems.push(`${at} contains a placeholder without a matching option or {displayName}.`);
      continue;
    }

    const command = { name, description, title, body, footer, embedColor, fields, links, options };
    // An escaped hyphen occupies two characters, the largest expansion we allow for option text.
    const widestOptions = Object.fromEntries(options.map((option) =>
      [option.name, "\\-".repeat(option.maxLength)]));
    const spec = describeEmbed({ app }, describeCustomCommand(command, app, widestOptions));
    const embedProblems = checkEmbedLimits(spec, at);
    problems.push(...embedProblems);
    if (embedProblems.length === 0) {
      commands.set(name, command);
    }
  }
  return commands;
}

function escapeOption(value) {
  return value.replace(/-/g, "\\-");
}

function readOptionValues(options, interaction) {
  const result = Object.create(null);
  for (const { name, maxLength } of options) {
    const value = interaction.options.getString(name);
    if (value === null) {
      result[name] = OPTION_FALLBACK;
      continue;
    }
    if (typeof value !== "string" || value.length > maxLength || !value.trim() || !PARAMETER_TEXT.test(value)) {
      return null;
    }
    result[name] = escapeOption(value.trim());
  }
  return result;
}

function describeCustomCommand(command, app, options) {
  const render = (template) => template === undefined
    ? undefined
    : renderTemplate(template, { ...options, displayName: escapeMarkdown(app.displayName) });
  const links = command.links.map(({ label, url }) =>
    `[${escapeMarkdown(label).replace(/[\[\]]/g, "\\$&")}](<${url}>)`);
  const description = [render(command.body), ...links].filter(Boolean).join("\n");
  return {
    title: render(command.title),
    description,
    fields: command.fields.map(({ name, value }) => ({ name: render(name), value: render(value) })),
    color: command.embedColor,
    footer: render(command.footer)
  };
}

module.exports = { MAX_GLOBAL_COMMANDS, describeCustomCommand, readCustomCommands, readOptionValues };
