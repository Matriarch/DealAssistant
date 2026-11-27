"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { DENIED_MESSAGE, guardInteraction, isOwner } = require("../src/auth");

function fakeInteraction(options = {}) {
  const {
    userId = "100000000000000001",
    repliable = true,
    replied = false,
    deferred = false,
    failReply = false
  } = options;

  const calls = { reply: 0, followUp: 0, respond: 0, payloads: [] };

  const interaction = {
    user: userId === null ? undefined : { id: userId },
    replied,
    deferred,
    isRepliable: () => repliable,
    reply: async (payload) => {
      if (failReply) {
        throw new Error("interaction is too old");
      }
      calls.reply += 1;
      calls.payloads.push(payload);
    },
    followUp: async (payload) => {
      calls.followUp += 1;
      calls.payloads.push(payload);
    },
    respond: async (choices) => {
      calls.respond += 1;
      calls.payloads.push(choices);
    }
  };

  return { interaction, calls };
}

const OWNER = "100000000000000001";

test("isOwner matches only the exact configured id", () => {
  assert.equal(isOwner(OWNER, OWNER), true);
  assert.equal(isOwner("100000000000000002", OWNER), false);
  assert.equal(isOwner("", OWNER), false);
  assert.equal(isOwner(OWNER, ""), false);
  assert.equal(isOwner(undefined, OWNER), false);
});

test("the owner is allowed through without any reply", async () => {
  const { interaction, calls } = fakeInteraction({ userId: OWNER });

  assert.equal(await guardInteraction(interaction, OWNER), true);
  assert.equal(calls.reply, 0);
  assert.equal(calls.followUp, 0);
});

test("another user is denied with an ephemeral message", async () => {
  const { interaction, calls } = fakeInteraction({ userId: "100000000000000099" });

  assert.equal(await guardInteraction(interaction, OWNER), false);
  assert.equal(calls.reply, 1);
  assert.equal(calls.payloads[0].content, DENIED_MESSAGE);
  assert.equal(calls.payloads[0].flags, 64);
});

test("a user with no id is denied", async () => {
  const { interaction } = fakeInteraction({ userId: null });
  assert.equal(await guardInteraction(interaction, OWNER), false);
});

test("autocomplete from a non-owner returns no choices", async () => {
  const { interaction, calls } = fakeInteraction({ userId: "1", repliable: false });

  assert.equal(await guardInteraction(interaction, OWNER), false);
  assert.equal(calls.respond, 1);
  assert.deepEqual(calls.payloads[0], []);
});

test("a denied interaction that was already answered uses followUp", async () => {
  const { interaction, calls } = fakeInteraction({ userId: "1", replied: true });

  assert.equal(await guardInteraction(interaction, OWNER), false);
  assert.equal(calls.followUp, 1);
});

test("a failing denial never throws", async () => {
  const { interaction } = fakeInteraction({ userId: "1", failReply: true });

  assert.equal(await guardInteraction(interaction, OWNER), false);
});
