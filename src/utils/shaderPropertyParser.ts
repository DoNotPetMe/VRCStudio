export type ShaderPropType = 'color' | 'range' | 'float' | 'texture' | 'vector' | 'int';

export type ShaderPropDefault =
  | number
  | [number, number, number, number]
  | string;

export interface ShaderProp {
  name: string;
  label: string;
  type: ShaderPropType;
  hdr?: boolean;
  min?: number;
  max?: number;
  default: ShaderPropDefault;
}

export function parseShaderProperties(code: string): ShaderProp[] {
  const propsMatch = code.match(/Properties\s*\{([\s\S]*?)\n\s*\}/);
  if (!propsMatch) return [];

  const block = propsMatch[1];
  const props: ShaderProp[] = [];

  // Match property lines, with optional Unity material-property attributes:
  //   [HDR][NoScaleOffset] _Name ("Label", TypeExpr) = DefaultVal
  // Group 1 = the bracketed attribute prefix (may be empty), 2 = name,
  // 3 = label, 4 = type expression, 5 = default value.
  const lineRe = /^\s*((?:\[[^\]]+\]\s*)*)(\w+)\s*\("([^"]+)",\s*([\w\s\[\](),.-]+)\)\s*=\s*(.+)$/gm;
  let m: RegExpExecArray | null;

  while ((m = lineRe.exec(block)) !== null) {
    const [, attrs, name, label, typeRaw, defaultRaw] = m;
    const typeStr = typeRaw.trim();
    const typeLC = typeStr.toLowerCase();

    if (/^range\s*\(/.test(typeLC)) {
      const rangeM = typeStr.match(/Range\s*\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\)/i);
      props.push({
        name,
        label,
        type: 'range',
        min: rangeM ? parseFloat(rangeM[1]) : 0,
        max: rangeM ? parseFloat(rangeM[2]) : 1,
        default: parseFloat(defaultRaw.trim()) || 0,
      });
    } else if (/color/.test(typeLC)) {
      // [HDR] is an attribute prefix before the property name, not part
      // of the type expression — check the captured attribute group.
      const hdr = /\[hdr\]/i.test(attrs);
      const colorM = defaultRaw.match(/\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\)/);
      props.push({
        name,
        label,
        type: 'color',
        hdr,
        default: colorM
          ? [parseFloat(colorM[1]), parseFloat(colorM[2]), parseFloat(colorM[3]), parseFloat(colorM[4])] as [number, number, number, number]
          : [1, 1, 1, 1] as [number, number, number, number],
      });
    } else if (/^2d$/.test(typeLC) || /texture/.test(typeLC)) {
      props.push({ name, label, type: 'texture', default: '"white" {}' });
    } else if (/^vector$/.test(typeLC)) {
      const vecM = defaultRaw.match(/\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\)/);
      props.push({
        name,
        label,
        type: 'vector',
        default: vecM
          ? [parseFloat(vecM[1]), parseFloat(vecM[2]), parseFloat(vecM[3]), parseFloat(vecM[4])] as [number, number, number, number]
          : [0, 0, 0, 0] as [number, number, number, number],
      });
    } else if (/^int$/.test(typeLC)) {
      props.push({ name, label, type: 'int', default: parseInt(defaultRaw.trim(), 10) || 0 });
    } else if (/^float$/.test(typeLC)) {
      props.push({ name, label, type: 'float', default: parseFloat(defaultRaw.trim()) || 0 });
    }
  }

  return props;
}

export function rgbaToHex([r, g, b]: [number, number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const toHex = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

export function injectPropertyDefaults(
  code: string,
  overrides: Record<string, ShaderPropDefault>
): string {
  let result = code;
  for (const [name, value] of Object.entries(overrides)) {
    // The type expression can itself contain parentheses (e.g.
    // `Range(0, 1)`), so we can't use `[^)]*` for it — that stops at the
    // inner paren and the match fails. Match non-greedily up to the
    // `) = ` that separates the header from the default value.
    if (Array.isArray(value)) {
      const [r, g, b, a] = value as number[];
      result = result.replace(
        new RegExp(`(${name}\\s*\\("[^"]*",[\\s\\S]*?\\)\\s*=\\s*)\\([^)\\n]*\\)`),
        `$1(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, ${a.toFixed(4)})`
      );
    } else {
      result = result.replace(
        new RegExp(`(${name}\\s*\\("[^"]*",[\\s\\S]*?\\)\\s*=\\s*)[\\d.eE+-]+`),
        `$1${value}`
      );
    }
  }
  return result;
}

export function downloadShaderWithDefaults(name: string, code: string) {
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}.shader`;
  a.click();
  URL.revokeObjectURL(url);
}
