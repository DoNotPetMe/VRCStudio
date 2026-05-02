/**
 * Canvas-based image filtering functions
 * Used by the photo editor to apply effects in real-time
 */

export interface CanvasEditState {
  brightness: number; // 0-200 (100 = normal)
  contrast: number; // 0-200 (100 = normal)
  saturation: number; // 0-200 (100 = normal)
  filters: {
    grayscale: number; // 0-100
    sepia: number; // 0-100
    blur: number; // 0-20 (pixels)
    temperature: number; // -50 to 50 (cool to warm)
    tint: number; // -50 to 50 (green to magenta)
    exposure: number; // -100 to 100
    highlights: number; // -100 to 100
    shadows: number; // -100 to 100
    clarity: number; // 0 to 100
    vibrance: number; // -100 to 100
  };
  borderStyle: {
    width: number;
    color: string;
    style: 'solid' | 'dashed' | 'double' | 'rounded';
    radius: number;
  };
}

export const DEFAULT_EDIT_STATE: CanvasEditState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  filters: {
    grayscale: 0,
    sepia: 0,
    blur: 0,
    temperature: 0,
    tint: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    clarity: 0,
    vibrance: 0,
  },
  borderStyle: {
    width: 0,
    color: '#ffffff',
    style: 'solid',
    radius: 0,
  },
};

/**
 * Apply image adjustments to canvas
 */
export function applyAdjustments(
  ctx: CanvasRenderingContext2D,
  brightness: number,
  contrast: number,
  saturation: number,
  width: number,
  height: number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Brightness & contrast adjustment
  const brightnessValue = (brightness - 100) / 100;
  const contrastValue = (contrast - 100) * 2.55;
  const saturationValue = (saturation - 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Apply brightness
    r += brightnessValue * 100;
    g += brightnessValue * 100;
    b += brightnessValue * 100;

    // Apply contrast
    r = (r - 128) * (contrastValue / 255) + 128;
    g = (g - 128) * (contrastValue / 255) + 128;
    b = (b - 128) * (contrastValue / 255) + 128;

    // Apply saturation
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    r = Math.round(gray + (r - gray) * (1 + saturationValue));
    g = Math.round(gray + (g - gray) * (1 + saturationValue));
    b = Math.round(gray + (b - gray) * (1 + saturationValue));

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply filter effects using CSS filters or imageData
 */
export function applyFilters(
  ctx: CanvasRenderingContext2D,
  grayscale: number,
  sepia: number,
  blur: number,
  temperature: number,
  width: number,
  height: number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Apply grayscale
    if (grayscale > 0) {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      const factor = grayscale / 100;
      r = Math.round(r * (1 - factor) + gray * factor);
      g = Math.round(g * (1 - factor) + gray * factor);
      b = Math.round(b * (1 - factor) + gray * factor);
    }

    // Apply sepia
    if (sepia > 0) {
      const factor = sepia / 100;
      const sr = Math.round((r * 0.393 + g * 0.769 + b * 0.189) * factor + r * (1 - factor));
      const sg = Math.round((r * 0.349 + g * 0.686 + b * 0.168) * factor + g * (1 - factor));
      const sb = Math.round((r * 0.272 + g * 0.534 + b * 0.131) * factor + b * (1 - factor));
      r = sr;
      g = sg;
      b = sb;
    }

    // Apply temperature (cool to warm)
    if (temperature !== 0) {
      const tempFactor = temperature / 100;
      if (temperature > 0) {
        // Warm: increase red, decrease blue
        r = Math.min(255, r + tempFactor * 50);
        b = Math.max(0, b - tempFactor * 50);
      } else {
        // Cool: decrease red, increase blue
        r = Math.max(0, r + tempFactor * 50);
        b = Math.min(255, b - tempFactor * 50);
      }
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);

  // Apply blur as a canvas filter (more efficient)
  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`;
  }
}

export function applyExposure(
  ctx: CanvasRenderingContext2D,
  amount: number, // -100 to 100
  width: number,
  height: number
) {
  if (amount === 0) return;
  const factor = Math.pow(2, amount / 50);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] * factor));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * factor));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * factor));
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyHighlights(
  ctx: CanvasRenderingContext2D,
  amount: number, // -100 to 100
  width: number,
  height: number
) {
  if (amount === 0) return;
  const factor = amount / 100;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    const highlightWeight = luma > 0.5 ? (luma - 0.5) * 2 : 0;
    const adj = factor * highlightWeight * 50;
    data[i] = Math.max(0, Math.min(255, data[i] + adj));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + adj));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + adj));
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyShadows(
  ctx: CanvasRenderingContext2D,
  amount: number, // -100 to 100
  width: number,
  height: number
) {
  if (amount === 0) return;
  const factor = amount / 100;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    const shadowWeight = luma < 0.5 ? (0.5 - luma) * 2 : 0;
    const adj = factor * shadowWeight * 50;
    data[i] = Math.max(0, Math.min(255, data[i] + adj));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + adj));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + adj));
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyClarity(
  ctx: CanvasRenderingContext2D,
  amount: number, // 0 to 100
  width: number,
  height: number
) {
  if (amount === 0) return;
  const factor = (amount / 100) * 0.6;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    // Clarity peaks at midtones
    const midweight = 1 - Math.abs(luma - 0.5) * 2;
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] / 255 - 0.5;
      data[i + c] = Math.max(0, Math.min(255, Math.round((v * (1 + factor * midweight) + 0.5) * 255)));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyVibrance(
  ctx: CanvasRenderingContext2D,
  amount: number, // -100 to 100
  width: number,
  height: number
) {
  if (amount === 0) return;
  const factor = amount / 100;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // More boost to less-saturated colors (protects already-vivid colors)
    const boost = factor * (1 - sat) * 0.5;
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    data[i] = Math.max(0, Math.min(255, Math.round((r + (r - gray) * boost) * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round((g + (g - gray) * boost) * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round((b + (b - gray) * boost) * 255)));
  }
  ctx.putImageData(imageData, 0, 0);
}

export function applyTint(
  ctx: CanvasRenderingContext2D,
  amount: number, // -50 to 50 (negative = green, positive = magenta)
  width: number,
  height: number
) {
  if (amount === 0) return;
  const factor = amount / 100;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (factor > 0) {
      // Magenta tint: boost red + blue, reduce green
      data[i] = Math.min(255, data[i] + factor * 30);
      data[i + 1] = Math.max(0, data[i + 1] - factor * 30);
      data[i + 2] = Math.min(255, data[i + 2] + factor * 30);
    } else {
      // Green tint
      data[i] = Math.max(0, data[i] + factor * 30);
      data[i + 1] = Math.min(255, data[i + 1] - factor * 30);
      data[i + 2] = Math.max(0, data[i + 2] + factor * 30);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draw border/frame on canvas
 */
export function drawBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  borderWidth: number,
  borderColor: string,
  borderStyle: 'solid' | 'dashed' | 'double' | 'rounded',
  radius: number
) {
  if (borderWidth === 0) return;

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;

  if (borderStyle === 'dashed') {
    ctx.setLineDash([5, 5]);
  } else if (borderStyle === 'double') {
    ctx.lineWidth = borderWidth / 3;
  }

  const r = radius;
  const x = borderWidth / 2;
  const y = borderWidth / 2;
  const w = width - borderWidth;
  const h = height - borderWidth;

  // Draw rounded rectangle
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();

  if (borderStyle === 'double') {
    ctx.lineWidth = borderWidth / 3;
    ctx.beginPath();
    ctx.moveTo(x + borderWidth / 1.5 + r, y + borderWidth / 1.5);
    ctx.lineTo(x + w - borderWidth / 1.5 - r, y + borderWidth / 1.5);
    ctx.quadraticCurveTo(
      x + w - borderWidth / 1.5,
      y + borderWidth / 1.5,
      x + w - borderWidth / 1.5,
      y + borderWidth / 1.5 + r
    );
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

/**
 * Preset filters for quick application
 */
export const PRESET_FILTERS = {
  grayscale:    { name: 'Grayscale',    state: { grayscale: 100, sepia: 0,  blur: 0, temperature: 0,   tint: 0,   exposure: 0,   highlights: 0,  shadows: 0, clarity: 0,  vibrance: 0 } },
  sepia:        { name: 'Sepia',        state: { grayscale: 0,   sepia: 100, blur: 0, temperature: 15,  tint: 5,   exposure: 0,   highlights: 0,  shadows: 0, clarity: 0,  vibrance: 0 } },
  cool:         { name: 'Cool',         state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: -30,  tint: -5,  exposure: 0,   highlights: 0,  shadows: 0, clarity: 0,  vibrance: 10 } },
  warm:         { name: 'Warm',         state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: 30,   tint: 0,   exposure: 5,   highlights: 0,  shadows: 5, clarity: 0,  vibrance: 20 } },
  vintage:      { name: 'Vintage',      state: { grayscale: 0,   sepia: 50, blur: 0, temperature: 20,   tint: 5,   exposure: -5,  highlights: -10, shadows: 10, clarity: 10, vibrance: -20 } },
  noir:         { name: 'Noir',         state: { grayscale: 100, sepia: 0,  blur: 0, temperature: -50,  tint: 0,   exposure: -10, highlights: 20, shadows: -20, clarity: 30, vibrance: 0 } },
  neon:         { name: 'Neon',         state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: 50,   tint: -10, exposure: 10,  highlights: 0,  shadows: 0, clarity: 0,  vibrance: 80 } },
  vibrant:      { name: 'Vibrant',      state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: 0,    tint: 0,   exposure: 5,   highlights: 0,  shadows: 0, clarity: 20, vibrance: 60 } },
  soft:         { name: 'Soft',         state: { grayscale: 0,   sepia: 0,  blur: 2, temperature: 10,   tint: 0,   exposure: 5,   highlights: -15, shadows: 10, clarity: -10, vibrance: -10 } },
  highcontrast: { name: 'High Contrast', state: { grayscale: 0,  sepia: 0,  blur: 0, temperature: 0,    tint: 0,   exposure: 0,   highlights: 20, shadows: -20, clarity: 40, vibrance: 10 } },
  anime:        { name: 'Anime',        state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: -10,  tint: 0,   exposure: 5,   highlights: 15, shadows: -10, clarity: 30, vibrance: -20 } },
  vaporwave:    { name: 'Vaporwave',    state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: -20,  tint: 15,  exposure: 5,   highlights: 10, shadows: 0, clarity: 0,  vibrance: 60 } },
  cinematic:    { name: 'Cinematic',    state: { grayscale: 0,   sepia: 10, blur: 0, temperature: -5,   tint: -8,  exposure: -10, highlights: -20, shadows: -15, clarity: 20, vibrance: -20 } },
  horror:       { name: 'Horror',       state: { grayscale: 60,  sepia: 20, blur: 0, temperature: -20,  tint: 0,   exposure: -20, highlights: 30, shadows: -30, clarity: 50, vibrance: -50 } },
  forest:       { name: 'Forest',       state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: 15,   tint: -15, exposure: 5,   highlights: -5,  shadows: 10, clarity: 20, vibrance: 40 } },
  ocean:        { name: 'Ocean',        state: { grayscale: 0,   sepia: 0,  blur: 0, temperature: -30,  tint: -5,  exposure: -5,  highlights: 0,  shadows: 15, clarity: 10, vibrance: 30 } },
  goldenHour:   { name: 'Golden Hour',  state: { grayscale: 0,   sepia: 20, blur: 0, temperature: 45,   tint: 8,   exposure: 10,  highlights: -10, shadows: 15, clarity: 10, vibrance: 30 } },
  fade:         { name: 'Fade',         state: { grayscale: 0,   sepia: 5,  blur: 0, temperature: 5,    tint: 5,   exposure: 10,  highlights: -20, shadows: 20, clarity: -20, vibrance: -40 } },
  duotone:      { name: 'Duotone',      state: { grayscale: 60,  sepia: 30, blur: 0, temperature: -20,  tint: 20,  exposure: 0,   highlights: 0,  shadows: 0, clarity: 20, vibrance: -30 } },
} as const;
