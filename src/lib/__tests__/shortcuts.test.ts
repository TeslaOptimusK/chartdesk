import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editCommand, isPlainShortcut } from "@/lib/shortcuts";

const press = (key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat", boolean>> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});

describe("workspace shortcuts", () => {
  it("leaves browser combinations alone", () => {
    for (const key of ["c", "v", "x", "a", "f", "r", "l", "t"]) {
      assert.equal(isPlainShortcut(press(key, { ctrlKey: true })), false, `Ctrl+${key}`);
      assert.equal(editCommand(press(key, { ctrlKey: true })), null, `Ctrl+${key}`);
    }
    assert.equal(isPlainShortcut(press("1", { altKey: true })), false);
  });

  it("maps undo and both redo forms", () => {
    assert.equal(editCommand(press("z", { ctrlKey: true })), "undo");
    assert.equal(editCommand(press("Z", { ctrlKey: true, shiftKey: true })), "redo");
    assert.equal(editCommand(press("y", { ctrlKey: true })), "redo");
    assert.equal(editCommand(press("z", { metaKey: true })), "undo");
    assert.equal(editCommand(press("z")), null);
  });

  it("ignores auto-repeat so a held key does not keep toggling", () => {
    assert.equal(isPlainShortcut(press("f")), true);
    assert.equal(isPlainShortcut(press("F", { shiftKey: true })), true);
    assert.equal(isPlainShortcut(press("f", { repeat: true })), false);
  });
});
