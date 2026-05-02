export interface MaterialSettings {
  albedo: string;
  metallic: number;
  smoothness: number;
  emissionEnabled: boolean;
  emissionColor: string;
  emissionIntensity: number;
  renderMode: 'Opaque' | 'Cutout' | 'Fade' | 'Transparent';
  cullMode: 'Back' | 'Front' | 'Off';
  alphaCutoff: number;
  zWrite: boolean;
  tilingX: number;
  tilingY: number;
  offsetX: number;
  offsetY: number;
  normalScale: number;
  shadowColor: string;
  shadowThreshold: number;
  shadowSoftness: number;
  rimColor: string;
  rimPower: number;
  rimIntensity: number;
  outlineWidth: number;
  outlineColor: string;
  alpha: number;
}

export interface SavedMaterial {
  id: string;
  name: string;
  shaderType: 'standard' | 'unlit' | 'toon' | 'custom';
  customShaderId?: string;
  settings: MaterialSettings;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_MATERIAL_SETTINGS: MaterialSettings = {
  albedo: '#ffffff',
  metallic: 0,
  smoothness: 0.5,
  emissionEnabled: false,
  emissionColor: '#ffffff',
  emissionIntensity: 1,
  renderMode: 'Opaque',
  cullMode: 'Back',
  alphaCutoff: 0.5,
  zWrite: true,
  tilingX: 1,
  tilingY: 1,
  offsetX: 0,
  offsetY: 0,
  normalScale: 1,
  shadowColor: '#4488bb',
  shadowThreshold: 0.5,
  shadowSoftness: 0.1,
  rimColor: '#88aaff',
  rimPower: 3,
  rimIntensity: 0.5,
  outlineWidth: 0.002,
  outlineColor: '#000000',
  alpha: 1,
};

function hexToUnityColor(hex: string, intensity = 1): string {
  const clean = hex.replace('#', '');
  const r = (parseInt(clean.slice(0, 2), 16) / 255 * intensity).toFixed(4);
  const g = (parseInt(clean.slice(2, 4), 16) / 255 * intensity).toFixed(4);
  const b = (parseInt(clean.slice(4, 6), 16) / 255 * intensity).toFixed(4);
  return `{r: ${r}, g: ${g}, b: ${b}, a: 1.00000}`;
}

const RENDER_MODE_MAP = { Opaque: 0, Cutout: 1, Fade: 2, Transparent: 3 };
const SRC_BLEND_MAP = { Opaque: 1, Cutout: 1, Fade: 5, Transparent: 5 };
const DST_BLEND_MAP = { Opaque: 0, Cutout: 0, Fade: 10, Transparent: 10 };

export function exportUnityMaterial(mat: SavedMaterial): string {
  const s = mat.settings;

  let shaderFileID = '46';
  let shaderGUID = '0000000000000000f000000000000000';
  let shaderName = 'Standard';

  if (mat.shaderType === 'unlit') {
    shaderFileID = '7';
    shaderGUID = '0000000000000000e000000000000000';
    shaderName = 'Unlit/Color';
  } else if (mat.shaderType === 'toon') {
    shaderFileID = '0';
    shaderGUID = '00000000000000000000000000000001';
    shaderName = 'VRCStudio/ToonCel';
  } else if (mat.shaderType === 'custom') {
    shaderFileID = '0';
    shaderGUID = mat.customShaderId || '00000000000000000000000000000000';
    shaderName = 'Custom/Shader';
  }

  const keywords: string[] = [];
  if (s.emissionEnabled) keywords.push('_EMISSION');
  if (s.renderMode === 'Fade' || s.renderMode === 'Transparent') keywords.push('_ALPHAPREMULTIPLY_ON');
  if (s.renderMode !== 'Opaque') keywords.push('_ALPHABLEND_ON');
  if (s.renderMode === 'Cutout') keywords.push('_ALPHATEST_ON');

  const renderMode = RENDER_MODE_MAP[s.renderMode];
  const srcBlend = SRC_BLEND_MAP[s.renderMode];
  const dstBlend = DST_BLEND_MAP[s.renderMode];
  const albedoColor = hexToUnityColor(s.albedo);
  const emissionColor = s.emissionEnabled
    ? hexToUnityColor(s.emissionColor, s.emissionIntensity)
    : '{r: 0.00000, g: 0.00000, b: 0.00000, a: 1.00000}';

  const isToon = mat.shaderType === 'toon';

  let texEnvs = `    - _MainTex:
        m_Texture: {fileID: 0}
        m_Scale: {x: ${s.tilingX}, y: ${s.tilingY}}
        m_Offset: {x: ${s.offsetX}, y: ${s.offsetY}}`;

  if (mat.shaderType === 'standard') {
    texEnvs += `
    - _BumpMap:
        m_Texture: {fileID: 0}
        m_Scale: {x: ${s.tilingX}, y: ${s.tilingY}}
        m_Offset: {x: ${s.offsetX}, y: ${s.offsetY}}
    - _EmissionMap:
        m_Texture: {fileID: 0}
        m_Scale: {x: 1, y: 1}
        m_Offset: {x: 0, y: 0}`;
  }

  let floats = `    - _Metallic: ${s.metallic.toFixed(4)}
    - _Glossiness: ${s.smoothness.toFixed(4)}
    - _BumpScale: ${s.normalScale.toFixed(4)}
    - _Mode: ${renderMode}
    - _SrcBlend: ${srcBlend}
    - _DstBlend: ${dstBlend}
    - _ZWrite: ${s.zWrite ? 1 : 0}
    - _Cutoff: ${s.alphaCutoff.toFixed(4)}`;

  if (isToon) {
    floats += `
    - _ShadowThreshold: ${s.shadowThreshold.toFixed(4)}
    - _ShadowSoftness: ${s.shadowSoftness.toFixed(4)}
    - _RimPower: ${s.rimPower.toFixed(4)}
    - _RimIntensity: ${s.rimIntensity.toFixed(4)}
    - _OutlineWidth: ${s.outlineWidth.toFixed(5)}`;
  }

  let colors = `    - _Color: ${albedoColor}
    - _EmissionColor: ${emissionColor}`;

  if (isToon) {
    colors += `
    - _ShadowColor: ${hexToUnityColor(s.shadowColor)}
    - _RimColor: ${hexToUnityColor(s.rimColor)}
    - _OutlineColor: ${hexToUnityColor(s.outlineColor)}`;
  }

  return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  serializedVersion: 6
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_Name: ${mat.name}
  m_Shader: {fileID: ${shaderFileID}, guid: ${shaderGUID}, type: 0}
  m_ShaderKeywords: ${keywords.join(' ')}
  m_LightmapFlags: 4
  m_EnableInstancingVariants: 0
  m_DoubleSidedGI: 0
  m_CustomRenderQueue: -1
  stringTagMap:
    RenderType: ${s.renderMode === 'Opaque' ? 'Opaque' : s.renderMode === 'Cutout' ? 'TransparentCutout' : 'Transparent'}
  disabledShaderPasses: []
  m_SavedProperties:
    serializedVersion: 3
    m_TexEnvs:
${texEnvs}
    m_Floats:
${floats}
    m_Colors:
${colors}
`;
}

export function exportMaterialJSON(mat: SavedMaterial): string {
  return JSON.stringify(
    {
      name: mat.name,
      shaderType: mat.shaderType,
      customShaderId: mat.customShaderId,
      settings: mat.settings,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    },
    null,
    2
  );
}

export function downloadMaterialFile(mat: SavedMaterial, format: 'mat' | 'json') {
  const content = format === 'mat' ? exportUnityMaterial(mat) : exportMaterialJSON(mat);
  const mime = format === 'mat' ? 'text/plain' : 'application/json';
  const ext = format === 'mat' ? '.mat' : '.json';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mat.name.replace(/\s+/g, '_')}${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

const MATERIALS_KEY = 'vrcstudio_materials';

export function loadSavedMaterials(): SavedMaterial[] {
  try {
    const raw = localStorage.getItem(MATERIALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMaterials(materials: SavedMaterial[]) {
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(materials.slice(0, 50)));
}
