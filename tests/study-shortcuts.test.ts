import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultBindings, readBindings, restoreBinding, shortcutFromEvent } from "../lib/study-shortcuts.ts";

const flags = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false };

test("normalizes remappable keys while leaving browser and system combinations available", () => {
  assert.equal(shortcutFromEvent({ ...flags, key: " ", code: "Space" }), "Space");
  assert.equal(shortcutFromEvent({ ...flags, key: "K", code: "KeyK", shiftKey: true }), "Shift+K");
  assert.equal(shortcutFromEvent({ ...flags, key: "!", code: "Digit1", shiftKey: true }), "Shift+1");
  assert.equal(shortcutFromEvent({ ...flags, key: "r", code: "KeyR", ctrlKey: true }), null);
  assert.equal(shortcutFromEvent({ ...flags, key: "Escape", code: "Escape" }), null);
});

test("loads valid custom bindings and keeps a full set of unique actions on reset", () => {
  const custom = readBindings({ previous: "Shift+J", next: "ArrowLeft" });
  assert.equal(custom.previous, "Shift+J");
  assert.equal(custom.next, "ArrowLeft");
  assert.deepEqual(readBindings({ previous: "ArrowRight" }), defaultBindings);
  const restored = restoreBinding(custom, "previous");
  assert.equal(restored.previous, "ArrowLeft");
  assert.equal(restored.next, "Shift+J");
  assert.equal(new Set(Object.values(restored)).size, Object.keys(restored).length);
});
