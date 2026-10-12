// SPDX-License-Identifier: GPL-3.0-or-later
// Periodic patterns meet at the sphere seam. Generated only on appearance changes.
export function blendAt(pattern, u, v) {
  const t = Math.PI * 2;
  if (pattern === 'solid') return 0;
  if (pattern === 'gradient') return v;
  const cloud = Math.sin(t * u * 3 + Math.sin(v * 9)) * 0.25
    + Math.cos(t * u * 5 - v * 12) * 0.15 + Math.sin(t * u * 8 + v * 23) * 0.1;
  if (pattern === 'marble') return (Math.sin(v * 23 + cloud * 12) + 1) * 0.5;
  return Math.max(0, Math.min(1, 0.5 + cloud));
}
export function appearancePixels(pattern, color1, color2, size = 128) {
  const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const a = rgb(color1), b = rgb(color2), pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const mix = blendAt(pattern, x / (size - 1), y / (size - 1)), offset = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels[offset + c] = a[c] + (b[c] - a[c]) * mix;
    pixels[offset + 3] = 255;
  }
  return pixels;
}
