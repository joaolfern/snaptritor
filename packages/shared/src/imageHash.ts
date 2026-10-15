/**
 * A perceptual-hash similarity *measurement* for the captured screenshot — arithmetic on pixel
 * values, nothing that reads what the image shows. This is the one pixel-level step the
 * constitution's Article 2 explicitly allows: it answers "how similar are these two pictures?",
 * never "what card is this?".
 *
 * Algorithm: average-hash (aHash). Downscale to a small grid, convert to grayscale, compare each
 * cell against the grid's own mean brightness, and pack the result into a hex string. Two visually
 * similar screenshots produce hashes a small Hamming distance apart; two different ones don't.
 */

const GRID_SIZE = 8; // 8x8 = 64 bits of hash, packed into 16 hex characters

/**
 * @param pixels RGB or RGBA pixel data, channel-interleaved (e.g. R,G,B,R,G,B,… or
 *   R,G,B,A,R,G,B,A,…), as a `Buffer`/`Uint8ClampedArray`/`Uint8Array`. **Must already be in RGB
 *   channel order** — a capture library whose native order is BGR (nut-js's default) needs
 *   converting first; this function does not detect or correct channel order itself, since that's
 *   a capture-library-specific concern, not a hashing one.
 * @param width  the image's width in pixels
 * @param height the image's height in pixels
 * @param channels number of bytes per pixel in `pixels` — 3 for RGB, 4 for RGBA (default 4; only
 *   R, G and B are read, so an alpha channel's presence doesn't otherwise matter)
 * @returns a 16-character hex string
 */
export function perceptualHash(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  channels = 4,
): string {
  if (width <= 0 || height <= 0) {
    throw new Error(`perceptualHash: invalid dimensions ${width}x${height}`);
  }
  if (channels !== 3 && channels !== 4) {
    throw new Error(`perceptualHash: channels must be 3 (RGB) or 4 (RGBA), got ${channels}`);
  }
  if (pixels.length < width * height * channels) {
    throw new Error(
      `perceptualHash: pixel buffer too small for ${width}x${height} at ${channels} channels/pixel ` +
        `(expected at least ${width * height * channels} bytes, got ${pixels.length})`,
    );
  }

  // Downscale to GRID_SIZE x GRID_SIZE by averaging each source cell's grayscale value —
  // cheap, deterministic, and good enough for "did the picture change", not photo editing.
  const cellWidth = width / GRID_SIZE;
  const cellHeight = height / GRID_SIZE;
  const grayscaleGrid: number[] = new Array(GRID_SIZE * GRID_SIZE).fill(0);

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const xStart = Math.floor(gx * cellWidth);
      const xEnd = Math.max(xStart + 1, Math.floor((gx + 1) * cellWidth));
      const yStart = Math.floor(gy * cellHeight);
      const yEnd = Math.max(yStart + 1, Math.floor((gy + 1) * cellHeight));

      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd && y < height; y++) {
        for (let x = xStart; x < xEnd && x < width; x++) {
          const i = (y * width + x) * channels;
          const r = pixels[i] ?? 0;
          const g = pixels[i + 1] ?? 0;
          const b = pixels[i + 2] ?? 0;
          // Standard luma weighting, not an interpretation of content.
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
          count++;
        }
      }
      grayscaleGrid[gy * GRID_SIZE + gx] = count > 0 ? sum / count : 0;
    }
  }

  const mean = grayscaleGrid.reduce((a, b) => a + b, 0) / grayscaleGrid.length;

  let bits = "";
  for (const value of grayscaleGrid) {
    bits += value > mean ? "1" : "0";
  }

  // Pack the 64-bit string into 16 hex characters.
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** The number of differing bits between two hashes of the same length produced by {@link perceptualHash}. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`hammingDistance: hash length mismatch (${a.length} vs ${b.length})`);
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const nibbleA = parseInt(a[i]!, 16);
    const nibbleB = parseInt(b[i]!, 16);
    let xor = nibbleA ^ nibbleB;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * The default "treat as unchanged" threshold (plan.md's Q08 — tuned further during
 * `/implement`'s real-capture tasks, kept here as a named constant so it's adjustable in one
 * place rather than magic numbers scattered through the collector).
 */
export const DEFAULT_CHANGE_THRESHOLD_BITS = 5;

/** Whether two hashes are close enough to be considered "the same shop" (plan.md's RF04 logic). */
export function isSameImage(
  hashA: string,
  hashB: string,
  thresholdBits: number = DEFAULT_CHANGE_THRESHOLD_BITS,
): boolean {
  return hammingDistance(hashA, hashB) <= thresholdBits;
}
