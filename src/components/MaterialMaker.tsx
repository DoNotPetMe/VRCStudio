import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, Copy, Download, Save, ChevronDown, Edit2, Check, X } from 'lucide-react';
import {
  MaterialSettings, SavedMaterial, DEFAULT_MATERIAL_SETTINGS,
  exportUnityMaterial, exportMaterialJSON, downloadMaterialFile,
  loadSavedMaterials, saveMaterials,
} from '../utils/materialExport';

// ─── Material Ball Canvas ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amount)},${Math.min(255, g + amount)},${Math.min(255, b + amount)})`;
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amount)},${Math.max(0, g - amount)},${Math.max(0, b - amount)})`;
}

function drawMaterialBall(canvas: HTMLCanvasElement, settings: MaterialSettings, shaderType: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 8;
  ctx.clearRect(0, 0, W, H);

  // Checkerboard background for transparency
  if (settings.renderMode !== 'Opaque') {
    const sq = 12;
    for (let y = 0; y < H; y += sq) {
      for (let x = 0; x < W; x += sq) {
        ctx.fillStyle = (Math.floor(x / sq) + Math.floor(y / sq)) % 2 === 0 ? '#404040' : '#2a2a2a';
        ctx.fillRect(x, y, sq, sq);
      }
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Base ambient gradient (albedo)
  const ambient = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.05, cx, cy, r);
  ambient.addColorStop(0, lightenHex(settings.albedo, 55));
  ambient.addColorStop(0.5, settings.albedo);
  ambient.addColorStop(1, darkenHex(settings.albedo, 90));
  ctx.fillStyle = ambient;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Specular highlight (scaled by metallic + smoothness)
  const specSize = 15 + settings.smoothness * 70 + settings.metallic * 20;
  const specAlpha = 0.25 + settings.metallic * 0.65 + settings.smoothness * 0.1;
  const specX = cx + r * 0.28, specY = cy - r * 0.35;
  const spec = ctx.createRadialGradient(specX, specY, 0, specX, specY, specSize);
  spec.addColorStop(0, `rgba(255,255,255,${specAlpha})`);
  spec.addColorStop(0.4, `rgba(255,255,255,${specAlpha * 0.3})`);
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Metallic tint (reflects albedo back into spec)
  if (settings.metallic > 0.3) {
    const metSpec = ctx.createRadialGradient(specX, specY, 0, specX, specY, specSize * 0.6);
    const [mr, mg, mb] = hexToRgb(settings.albedo);
    metSpec.addColorStop(0, `rgba(${mr},${mg},${mb},${settings.metallic * 0.4})`);
    metSpec.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = metSpec;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Emission overlay
  if (settings.emissionEnabled && settings.emissionIntensity > 0) {
    const [er, eg, eb] = hexToRgb(settings.emissionColor);
    ctx.globalAlpha = Math.min(0.85, settings.emissionIntensity * 0.25);
    ctx.fillStyle = `rgb(${er},${eg},${eb})`;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    // Glow bloom
    const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    glow.addColorStop(0, `rgba(${er},${eg},${eb},${Math.min(0.3, settings.emissionIntensity * 0.1)})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Toon flat shading overlay
  if (shaderType === 'toon') {
    const toonLine = cy + r * (settings.shadowThreshold - 0.5) * 2;
    ctx.fillStyle = settings.shadowColor + 'aa';
    ctx.fillRect(cx - r, toonLine, r * 2, r - (toonLine - cy));
  }

  // Transparency mask
  if (settings.renderMode !== 'Opaque') {
    ctx.globalAlpha = settings.alpha ?? 1;
    const alphaOverlay = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    alphaOverlay.addColorStop(0, `rgba(0,0,0,0)`);
    alphaOverlay.addColorStop(1, `rgba(0,0,0,${1 - (settings.alpha ?? 1)})`);
    ctx.fillStyle = alphaOverlay; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // Rim darkening (edge shading)
  const rim = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = rim; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.restore();

  // Outline circle
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
}

// ─── Property Editors ─────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-surface-400 flex-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent p-0 overflow-hidden" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="w-20 input-field text-xs py-0.5 font-mono" />
      </div>
    </div>
  );
}

function SliderInput({ label, value, min, max, step = 0.01, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-xs text-surface-400">{label}</label>
        <span className="text-xs font-semibold text-surface-300 tabular-nums">{value.toFixed(step < 0.1 ? 3 : 2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full accent-accent-500" />
    </div>
  );
}

function SelectInput({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-surface-400">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="input-field text-xs py-0.5 w-32">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── MaterialMaker Component ──────────────────────────────────────────────────

export default function MaterialMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shaderType, setShaderType] = useState<'standard' | 'unlit' | 'toon' | 'custom'>('standard');
  const [settings, setSettings] = useState<MaterialSettings>({ ...DEFAULT_MATERIAL_SETTINGS });
  const [matName, setMatName] = useState('New Material');
  const [savedMaterials, setSavedMaterials] = useState<SavedMaterial[]>(loadSavedMaterials);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [copyYamlDone, setCopyYamlDone] = useState(false);

  const updateSetting = <K extends keyof MaterialSettings>(key: K, value: MaterialSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Redraw material ball whenever settings change
  useEffect(() => {
    if (canvasRef.current) drawMaterialBall(canvasRef.current, settings, shaderType);
  }, [settings, shaderType]);

  const getCurrentMaterial = useCallback((): SavedMaterial => ({
    id: `mat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: matName,
    shaderType,
    settings,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }), [matName, shaderType, settings]);

  const handleSave = () => {
    const mat = getCurrentMaterial();
    const updated = [mat, ...savedMaterials].slice(0, 50);
    setSavedMaterials(updated);
    saveMaterials(updated);
  };

  const handleDelete = (id: string) => {
    const updated = savedMaterials.filter(m => m.id !== id);
    setSavedMaterials(updated);
    saveMaterials(updated);
  };

  const handleLoad = (mat: SavedMaterial) => {
    setShaderType(mat.shaderType);
    setSettings({ ...DEFAULT_MATERIAL_SETTINGS, ...mat.settings });
    setMatName(mat.name);
  };

  const handleDuplicate = (mat: SavedMaterial) => {
    const dup: SavedMaterial = { ...mat, id: `mat_${Date.now()}`, name: `${mat.name} Copy`, createdAt: Date.now(), updatedAt: Date.now() };
    const updated = [dup, ...savedMaterials].slice(0, 50);
    setSavedMaterials(updated); saveMaterials(updated);
  };

  const commitRename = (id: string) => {
    const updated = savedMaterials.map(m => m.id === id ? { ...m, name: renameValue, updatedAt: Date.now() } : m);
    setSavedMaterials(updated); saveMaterials(updated);
    setRenamingId(null);
  };

  const handleCopyYaml = () => {
    const mat = getCurrentMaterial();
    navigator.clipboard.writeText(exportUnityMaterial(mat));
    setCopyYamlDone(true);
    setTimeout(() => setCopyYamlDone(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

      {/* Left: Properties */}
      <div className="xl:col-span-2 space-y-3">
        {/* Name + Shader type */}
        <div className="glass-panel-solid p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-surface-500 block mb-1">Material Name</label>
              <input type="text" value={matName} onChange={e => setMatName(e.target.value)}
                className="input-field text-sm w-full" placeholder="My Material" />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Shader</label>
              <div className="flex gap-1">
                {(['standard','unlit','toon','custom'] as const).map(t => (
                  <button key={t} onClick={() => setShaderType(t)}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium capitalize transition-colors ${shaderType === t ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Surface properties */}
        <div className="glass-panel-solid p-4 space-y-3">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Surface</h3>
          <ColorInput label="Albedo" value={settings.albedo} onChange={v => updateSetting('albedo', v)} />
          {shaderType === 'standard' && (
            <>
              <SliderInput label="Metallic" value={settings.metallic} min={0} max={1} onChange={v => updateSetting('metallic', v)} />
              <SliderInput label="Smoothness" value={settings.smoothness} min={0} max={1} onChange={v => updateSetting('smoothness', v)} />
              <SliderInput label="Normal Scale" value={settings.normalScale} min={0} max={2} onChange={v => updateSetting('normalScale', v)} />
            </>
          )}
          {shaderType === 'unlit' && (
            <p className="text-xs text-surface-500">Unlit materials ignore lighting — only Albedo color and transparency are used.</p>
          )}
          {shaderType === 'toon' && (
            <>
              <ColorInput label="Shadow Color" value={settings.shadowColor} onChange={v => updateSetting('shadowColor', v)} />
              <SliderInput label="Shadow Threshold" value={settings.shadowThreshold} min={0} max={1} onChange={v => updateSetting('shadowThreshold', v)} />
              <SliderInput label="Shadow Softness" value={settings.shadowSoftness} min={0} max={0.5} onChange={v => updateSetting('shadowSoftness', v)} />
            </>
          )}
        </div>

        {/* Toon rim + outline */}
        {shaderType === 'toon' && (
          <div className="glass-panel-solid p-4 space-y-3">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Rim Light & Outline</h3>
            <ColorInput label="Rim Color" value={settings.rimColor} onChange={v => updateSetting('rimColor', v)} />
            <SliderInput label="Rim Power" value={settings.rimPower} min={0.5} max={8} onChange={v => updateSetting('rimPower', v)} />
            <SliderInput label="Rim Intensity" value={settings.rimIntensity} min={0} max={1} onChange={v => updateSetting('rimIntensity', v)} />
            <ColorInput label="Outline Color" value={settings.outlineColor} onChange={v => updateSetting('outlineColor', v)} />
            <SliderInput label="Outline Width" value={settings.outlineWidth} min={0} max={0.05} step={0.001} onChange={v => updateSetting('outlineWidth', v)} />
          </div>
        )}

        {/* Emission */}
        <div className="glass-panel-solid p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Emission</h3>
            <button onClick={() => updateSetting('emissionEnabled', !settings.emissionEnabled)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${settings.emissionEnabled ? 'bg-accent-600' : 'bg-surface-700'}`}>
              <div className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${settings.emissionEnabled ? 'translate-x-[21px]' : 'translate-x-[3px]'}`} />
            </button>
          </div>
          {settings.emissionEnabled && (
            <>
              <ColorInput label="Emission Color" value={settings.emissionColor} onChange={v => updateSetting('emissionColor', v)} />
              <SliderInput label="Intensity (HDR)" value={settings.emissionIntensity} min={0} max={5} step={0.1} onChange={v => updateSetting('emissionIntensity', v)} />
            </>
          )}
        </div>

        {/* Rendering */}
        <div className="glass-panel-solid p-4 space-y-3">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Rendering</h3>
          <SelectInput label="Render Mode" value={settings.renderMode} options={['Opaque','Cutout','Fade','Transparent']} onChange={v => updateSetting('renderMode', v as MaterialSettings['renderMode'])} />
          <SelectInput label="Cull Mode" value={settings.cullMode} options={['Back','Front','Off']} onChange={v => updateSetting('cullMode', v as MaterialSettings['cullMode'])} />
          {settings.renderMode === 'Cutout' && (
            <SliderInput label="Alpha Cutoff" value={settings.alphaCutoff} min={0} max={1} onChange={v => updateSetting('alphaCutoff', v)} />
          )}
          {(settings.renderMode === 'Fade' || settings.renderMode === 'Transparent') && (
            <SliderInput label="Alpha" value={settings.alpha ?? 1} min={0} max={1} onChange={v => updateSetting('alpha', v)} />
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs text-surface-400">ZWrite</label>
            <button onClick={() => updateSetting('zWrite', !settings.zWrite)}
              className={`w-10 h-5 rounded-full transition-colors relative ${settings.zWrite ? 'bg-accent-600' : 'bg-surface-700'}`}>
              <div className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${settings.zWrite ? 'translate-x-[21px]' : 'translate-x-[3px]'}`} />
            </button>
          </div>
        </div>

        {/* Tiling & Offset */}
        <div className="glass-panel-solid p-4 space-y-3">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Tiling & Offset</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-surface-500 block mb-1">Tiling X</label>
              <input type="number" value={settings.tilingX} step={0.1} onChange={e => updateSetting('tilingX', Number(e.target.value))} className="input-field text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Tiling Y</label>
              <input type="number" value={settings.tilingY} step={0.1} onChange={e => updateSetting('tilingY', Number(e.target.value))} className="input-field text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Offset X</label>
              <input type="number" value={settings.offsetX} step={0.01} onChange={e => updateSetting('offsetX', Number(e.target.value))} className="input-field text-xs w-full" />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Offset Y</label>
              <input type="number" value={settings.offsetY} step={0.01} onChange={e => updateSetting('offsetY', Number(e.target.value))} className="input-field text-xs w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Right: Preview + Saved + Export */}
      <div className="space-y-3">
        {/* Material ball preview */}
        <div className="glass-panel-solid p-4">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Preview</h3>
          <div className="flex justify-center">
            <canvas ref={canvasRef} width={260} height={260} className="rounded-xl bg-surface-950/60" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-800 text-surface-400 capitalize">{shaderType}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-800 text-surface-400">{settings.renderMode}</span>
            {settings.emissionEnabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">Emissive</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="glass-panel-solid p-4 space-y-2">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Export</h3>
          <button onClick={handleSave} className="btn-primary text-xs w-full flex items-center justify-center gap-1.5">
            <Save size={12} /> Save Material
          </button>
          <button onClick={() => downloadMaterialFile(getCurrentMaterial(), 'mat')}
            className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5">
            <Download size={12} /> Export .mat (Unity YAML)
          </button>
          <button onClick={() => downloadMaterialFile(getCurrentMaterial(), 'json')}
            className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5">
            <Download size={12} /> Export .json
          </button>
          <button onClick={handleCopyYaml}
            className={`text-xs w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-colors ${copyYamlDone ? 'bg-green-500/15 text-green-400' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}>
            <Copy size={12} /> {copyYamlDone ? 'Copied!' : 'Copy YAML'}
          </button>
        </div>

        {/* Saved Materials */}
        <div className="glass-panel-solid p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Saved Materials</h3>
            <span className="text-[10px] text-surface-600">{savedMaterials.length}/50</span>
          </div>
          {savedMaterials.length === 0 ? (
            <p className="text-xs text-surface-600 text-center py-4">No saved materials yet.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {savedMaterials.map(mat => (
                <div key={mat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-800/40 hover:bg-surface-800/70 group transition-colors">
                  <div className="w-4 h-4 rounded-full flex-shrink-0 ring-1 ring-surface-700" style={{ backgroundColor: mat.settings.albedo }} />
                  {renamingId === mat.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(mat.id); if (e.key === 'Escape') setRenamingId(null); }}
                        className="input-field text-xs flex-1 py-0 h-6" />
                      <button onClick={() => commitRename(mat.id)} className="text-green-400 hover:text-green-300"><Check size={11} /></button>
                      <button onClick={() => setRenamingId(null)} className="text-surface-500 hover:text-surface-300"><X size={11} /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => handleLoad(mat)} className="flex-1 text-left min-w-0">
                        <div className="text-xs font-medium truncate text-surface-200">{mat.name}</div>
                        <div className="text-[10px] text-surface-500 capitalize">{mat.shaderType}</div>
                      </button>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => { setRenamingId(mat.id); setRenameValue(mat.name); }} className="text-surface-500 hover:text-surface-300"><Edit2 size={11} /></button>
                        <button onClick={() => handleDuplicate(mat)} className="text-surface-500 hover:text-surface-300"><Copy size={11} /></button>
                        <button onClick={() => downloadMaterialFile(mat, 'mat')} className="text-surface-500 hover:text-surface-300"><Download size={11} /></button>
                        <button onClick={() => handleDelete(mat.id)} className="text-surface-500 hover:text-red-400"><Trash2 size={11} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
