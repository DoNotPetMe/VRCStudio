// Retro pixel-art spaceship. Draw at origin facing +x; caller applies translate+rotate.
const BLOCKS: [number, number][] = [
  // Nose
  [3, 0],
  // Neck
  [2, 0],
  // Front fuselage
  [1, -1], [1, 0], [1, 1],
  // Main body
  [0, -2], [0, -1], [0, 0], [0, 1], [0, 2],
  // Wing roots
  [-1, -2], [-1, -1], [-1, 0], [-1, 1], [-1, 2],
  // Wing tips (swept back)
  [-2, -3], [-2, -2], [-2, 2], [-2, 3],
  // Engine
  [-3, -1], [-3, 0], [-3, 1],
];

export function drawBlockShip(
  ctx: CanvasRenderingContext2D,
  color: string,
  thruster = false,
  scale = 1,
): void {
  const b = Math.max(1, Math.round(3 * scale));
  const stride = Math.max(2, Math.round(4 * scale));
  ctx.fillStyle = color;
  for (const [cx, cy] of BLOCKS) {
    ctx.fillRect(cx * stride - b / 2, cy * stride - b / 2, b, b);
  }
  if (thruster) {
    const fl = 1 + Math.floor(Math.random() * 2);
    ctx.fillStyle = `rgba(255,${100 + Math.floor(Math.random() * 120)},30,${(0.7 + Math.random() * 0.3).toFixed(2)})`;
    ctx.fillRect((-3 - fl) * stride - b / 2, -stride - b / 2, b, b);
    ctx.fillRect((-3 - fl) * stride - b / 2,  stride - b / 2, b, b);
  }
}
