import { Region, saveImage, screen, type Image } from "@nut-tree-fork/nut-js";
import type { WindowRect } from "./findWindow.ts";

/**
 * Captures the given screen region (or the whole screen, if omitted) into memory.
 *
 * Verified against this exact installed version's real `.d.ts` files, not the published docs —
 * the docs (nutjs.dev) describe a `screen.capture(region?)` signature that doesn't match what's
 * actually installed here. The real API: `screen.grab()` / `screen.grabRegion(region)` return an
 * in-memory `Image`; `screen.capture(fileName, ...)` is a different, capture-and-save-to-disk
 * method with an unrelated signature. Easy to call the wrong one and get a confusing runtime
 * error ("path argument must be of type string. Received an instance of Region") — which is
 * exactly what happened once here before reading the real declarations.
 */
export async function capture(rect?: WindowRect): Promise<Image> {
  if (!rect) return screen.grab();
  return screen.grabRegion(new Region(rect.left, rect.top, rect.width, rect.height));
}

/** Saves a captured image to disk (format inferred from the file extension). */
export async function saveCapture(image: Image, filePath: string): Promise<void> {
  await saveImage({ image, path: filePath });
}

/**
 * Converts a captured `Image` into RGB-ordered pixel bytes, ready for
 * `@snaptritor/shared`'s `perceptualHash`. Needed because `Image.colorMode` defaults to **BGR**,
 * not RGB — confirmed from the installed package's own `.d.ts` (`image.class.d.ts`) before
 * writing this, not assumed. Returns the channel count too, since it varies (3 without alpha, 4
 * with) and `perceptualHash` needs to know the real stride rather than guessing 4.
 */
export async function toHashablePixels(
  image: Image,
): Promise<{ data: Uint8Array; width: number; height: number; channels: number }> {
  const rgb = await image.toRGB();
  return { data: new Uint8Array(rgb.data), width: rgb.width, height: rgb.height, channels: rgb.channels };
}
