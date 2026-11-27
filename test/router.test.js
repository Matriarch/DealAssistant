"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createInteractionHandler, UNAVAILABLE_COMMAND_MESSAGE } = require("../src/router");
const { DENIED_MESSAGE } = require("../src/auth");
const { createInteraction } = require("./helpers");

const OWNER = "987654321098765432";

function handlerWith(commandMap) {
  return createInteractionHandler({ ownerId: OWNER, commandMap: new Map(Object.entries(commandMap)) });
}

test("the owner can run a registered command", async () => {
  let runs = 0;
  const handler = handlerWith({ btc: { execute: async () => { runs += 1; } } });
  const interaction = createInteraction({ commandName: "btc", userId: OWNER });

  await handler(interaction);

  assert.equal(runs, 1);
  assert.equal(interaction.calls.length, 0);
});

test("another user cannot run a registered command", async () => {
  let runs = 0;
  const handler = handlerWith({ btc: { execute: async () => { runs += 1; } } });
  const interaction = createInteraction({ commandName: "btc", userId: "111111111111111111" });

  await handler(interaction);

  assert.equal(runs, 0);
  assert.equal(interaction.calls[0].type, "reply");
  assert.equal(interaction.calls[0].payload.content, DENIED_MESSAGE);
});

test("a disabled or outdated command gets a helpful private reply", async () => {
  const handler = handlerWith({ info: { execute: async () => {} } });
  const interaction = createInteraction({ commandName: "confirm", userId: OWNER });

  await handler(interaction);

  assert.equal(interaction.calls[0].type, "reply");
  assert.equal(interaction.calls[0].payload.content, UNAVAILABLE_COMMAND_MESSAGE);
  assert.equal(interaction.calls[0].payload.flags, 64);
});

test("a failing command reports an error instead of leaving silence", async () => {
  const handler = handlerWith({
    info: {
      execute: async () => {
        throw new Error("boom");
      }
    }
  });
  const interaction = createInteraction({ commandName: "info", userId: OWNER });

  await handler(interaction);

  assert.equal(interaction.calls[0].type, "reply");
  assert.match(interaction.calls[0].payload.content, /Something went wrong/);
});

test("a failure after a deferral clears the loading message", async () => {
  const handler = handlerWith({
    btc: {
      execute: async (interaction) => {
        await interaction.deferReply();
        throw new Error("boom");
      }
    }
  });
  const interaction = createInteraction({ commandName: "btc", userId: OWNER });

  await handler(interaction);

  const types = interaction.calls.map((call) => call.type);
  assert.deepEqual(types, ["deferReply", "deleteReply", "followUp"]);
  assert.equal(interaction.calls[2].payload.flags, 64);
});

test("non-command interactions are ignored", async () => {
  const handler = handlerWith({ info: { execute: async () => {} } });
  const interaction = createInteraction({ userId: OWNER });
  interaction.isChatInputCommand = () => false;

  await handler(interaction);

  assert.equal(interaction.calls.length, 0);
});
