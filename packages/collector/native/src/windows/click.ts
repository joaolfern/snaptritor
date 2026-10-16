import { Button, Key, keyboard, mouse, Point, straightTo } from "@nut-tree-fork/nut-js";

/** Taps Escape once (press + release) in whatever window currently has focus. */
export async function pressEscape(): Promise<void> {
  await keyboard.pressKey(Key.Escape);
  await keyboard.releaseKey(Key.Escape);
}
import type { WindowRect } from "./findWindow.ts";

/**
 * Moves to and left-clicks a point computed as a fraction of the given window's rect — never an
 * absolute screen coordinate (plan.md's design), so navigation keeps working regardless of where
 * the window sits on screen.
 *
 * @param rect the window's rect (from {@link findWindow})
 * @param xFraction 0 = left edge, 1 = right edge
 * @param yFraction 0 = top edge, 1 = bottom edge
 *
 * Verified against this exact installed version's `.d.ts` files (`mouse.class.d.ts`,
 * `point.class.d.ts`, `button.enum.d.ts`) before writing this, after T007 already showed the
 * published docs can lag the real API — these three happened to match the docs exactly, but that
 * was confirmed, not assumed.
 */
export async function clickProportional(rect: WindowRect, xFraction: number, yFraction: number): Promise<void> {
  const target = new Point(
    Math.round(rect.left + rect.width * xFraction),
    Math.round(rect.top + rect.height * yFraction),
  );
  await mouse.move(straightTo(target));
  await mouse.click(Button.LEFT);
}
