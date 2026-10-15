import { getWindows, type Window } from "@nut-tree-fork/nut-js";

export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FoundWindow {
  window: Window;
  title: string;
  rect: WindowRect;
}

/**
 * Finds the first open window whose title contains `titleSubstring`. Returns `null` rather than
 * throwing when nothing matches — `--inspect` (T010) needs to log that and exit cleanly (NF06),
 * not crash.
 *
 * `getWindows()` returns real `Window` instances (unlike the package's `windowWithTitle()` helper,
 * which returns a lazy *query descriptor* meant for `screen.find()` — not an instance with a
 * resolvable `.title`/`.region`; confirmed by inspection, not assumed).
 */
export async function findWindow(titleSubstring: string): Promise<FoundWindow | null> {
  const windows = await getWindows();
  for (const window of windows) {
    const title = await window.title;
    if (title && title.includes(titleSubstring)) {
      const region = await window.region;
      return {
        window,
        title,
        rect: { left: region.left, top: region.top, width: region.width, height: region.height },
      };
    }
  }
  return null;
}

/** Brings a found window to the foreground (constitution Article 4: simulated-input-equivalent, no file or process-memory access). */
export async function focusWindow(found: FoundWindow): Promise<void> {
  await found.window.focus();
}
