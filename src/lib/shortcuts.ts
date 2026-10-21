export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/** Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z and Ctrl+Y redo. */
export function editCommand(e: ShortcutKey & { shiftKey: boolean }): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !e.shiftKey) return "redo";
  return null;
}

/**
 * Single-key chart shortcuts take only unmodified presses. Ctrl+C, Ctrl+F,
 * Ctrl+R and the like belong to the browser, and a held key must not keep
 * toggling fullscreen or the magnet.
 */
export function isPlainShortcut(e: ShortcutKey): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat;
}
