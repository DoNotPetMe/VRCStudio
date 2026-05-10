// One-shot SVG → PNG rasterizer for the app icon.
// Run with: node scripts/build-icon.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'public', 'icon.svg'), 'utf-8');

const sizes = [
  { name: 'icon.png',       size: 512 },
  { name: 'icon-256.png',   size: 256 },
  { name: 'tray-icon.png',  size: 32  },
];

for (const { name, size } of sizes) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = r.render().asPng();
  writeFileSync(join(root, 'public', name), png);
  console.log(`Wrote public/${name} (${size}×${size}, ${png.length} bytes)`);
}
