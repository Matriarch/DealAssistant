"use strict";

const { EmbedBuilder } = require("discord.js");

// Discord's documented limits for a single embed, plus the combined character
// budget for the embeds attached to one message.
const LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  footer: 2048,
  authorName: 256,
  total: 6000
};

/**
 * Normalises an embed into plain data.
 *
 * Embeds are described before they are built so configuration can be measured
 * against Discord's limits with useful messages. The builder itself rejects
 * oversized values with an opaque "Received one or more errors".
 */
function describeEmbed(config, spec = {}) {
  return {
    title: spec.title ?? "",
    description: spec.description ?? "",
    fields: (spec.fields ?? []).map((field) => ({
      name: String(field.name),
      value: String(field.value)
    })),
    footer: spec.footer ?? config.app.footer ?? ""
  };
}

function buildEmbed(config, spec) {
  const described = describeEmbed(config, spec);
  const embed = new EmbedBuilder().setColor(config.app.embedColor);

  if (described.title) {
    embed.setTitle(described.title);
  }
  if (described.description) {
    embed.setDescription(described.description);
  }
  if (described.fields.length > 0) {
    embed.addFields(described.fields);
  }
  if (described.footer) {
    embed.setFooter({ text: described.footer });
  }

  return embed;
}

/**
 * Returns a list of Discord limit violations for one described embed.
 */
function checkEmbedLimits(described, label) {
  const problems = [];

  const check = (field, value, limit) => {
    if (typeof value === "string" && value.length > limit) {
      problems.push(`${label}: ${field} is ${value.length} characters, the limit is ${limit}.`);
    }
  };

  check("title", described.title, LIMITS.title);
  check("description", described.description, LIMITS.description);
  check("footer text", described.footer, LIMITS.footer);

  const fields = described.fields ?? [];

  if (fields.length > LIMITS.fields) {
    problems.push(`${label}: has ${fields.length} fields, the limit is ${LIMITS.fields}.`);
  }

  for (const field of fields) {
    check("field name", field.name, LIMITS.fieldName);
    check("field value", field.value, LIMITS.fieldValue);
  }

  const total =
    (described.title?.length ?? 0) +
    (described.description?.length ?? 0) +
    (described.footer?.length ?? 0) +
    fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

  if (total > LIMITS.total) {
    problems.push(`${label}: total embed content is ${total} characters, the limit is ${LIMITS.total}.`);
  }

  return problems;
}

module.exports = { LIMITS, buildEmbed, checkEmbedLimits, describeEmbed };
