import { describe, expect, it } from "vitest";
import { DEFAULT_CHANGE_THRESHOLD_BITS, hammingDistance, isSameImage, perceptualHash } from "./imageHash.js";

const WIDTH = 64;
const HEIGHT = 64;

/** Builds a synthetic RGBA buffer from a per-pixel color function — a stand-in for a screen capture. */
function makeImage(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// A simple scene: a light background with one darker "card" rectangle, roughly like a shop
// screenshot would have distinct regions rather than being uniformly colored.
function shopLikeScene(cardLeft: number): Uint8ClampedArray {
  return makeImage(WIDTH, HEIGHT, (x, y) => {
    const insideCard = x >= cardLeft && x < cardLeft + 16 && y >= 20 && y < 44;
    return insideCard ? [40, 40, 40] : [220, 220, 220];
  });
}

describe("perceptualHash / hammingDistance", () => {
  it("hashes identical images to the same value", () => {
    const a = perceptualHash(shopLikeScene(10), WIDTH, HEIGHT);
    const b = perceptualHash(shopLikeScene(10), WIDTH, HEIGHT);
    expect(a).toBe(b);
    expect(hammingDistance(a, b)).toBe(0);
    expect(isSameImage(a, b)).toBe(true);
  });

  it("hashes a near-identical capture (a few noisy pixels) within the default threshold", () => {
    const base = shopLikeScene(10);
    const noisy = new Uint8ClampedArray(base);
    // Flip a handful of pixels slightly — the kind of cosmetic noise a real capture has
    // (compression, a cursor, a subtly different animation frame) without changing the scene.
    for (let i = 0; i < 12; i++) {
      noisy[i * 40] = (noisy[i * 40]! + 30) % 255;
    }

    const hashA = perceptualHash(base, WIDTH, HEIGHT);
    const hashB = perceptualHash(noisy, WIDTH, HEIGHT);

    expect(hammingDistance(hashA, hashB)).toBeLessThanOrEqual(DEFAULT_CHANGE_THRESHOLD_BITS);
    expect(isSameImage(hashA, hashB)).toBe(true);
  });

  it("hashes visibly different scenes far apart", () => {
    const sceneA = shopLikeScene(4); // "card" near the left edge
    const sceneB = shopLikeScene(44); // "card" near the right edge — a different offer

    const hashA = perceptualHash(sceneA, WIDTH, HEIGHT);
    const hashB = perceptualHash(sceneB, WIDTH, HEIGHT);

    expect(hammingDistance(hashA, hashB)).toBeGreaterThan(DEFAULT_CHANGE_THRESHOLD_BITS);
    expect(isSameImage(hashA, hashB)).toBe(false);
  });

  it("rejects mismatched hash lengths rather than comparing garbage", () => {
    expect(() => hammingDistance("ab", "abcd")).toThrow();
  });

  it("rejects a buffer too small for the claimed dimensions", () => {
    expect(() => perceptualHash(new Uint8ClampedArray(4), WIDTH, HEIGHT)).toThrow();
  });
});
