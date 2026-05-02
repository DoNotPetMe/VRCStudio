import { useState, useRef, useCallback } from 'react';
import {
  Paintbrush, Copy, Check, Download, Upload, FileCode, X,
  Sparkles, Box, Droplets, ChevronDown, ChevronUp, Sliders,
  Wrench, Zap, Smile, FlaskConical, Info, Code,
} from 'lucide-react';
import { builtInShaders, downloadShaderFile, type ShaderInfo } from '../data/shaders';
import { unityTools, categoryMeta, downloadUnityTool, type UnityTool } from '../data/unityTools';
import { parseShaderProperties, rgbaToHex, hexToRgba, injectPropertyDefaults, downloadShaderWithDefaults, type ShaderProp } from '../utils/shaderPropertyParser';
import MaterialMaker from '../components/MaterialMaker';

// ─── Shader Section ────────────────────────────────────────────────────────────

const categoryIcons: Record<string, typeof Sparkles> = {
  toon: Paintbrush,
  effect: Sparkles,
  utility: Box,
  transparent: Droplets,
};

const categoryLabels: Record<string, string> = {
  toon: 'Toon',
  effect: 'Effects',
  utility: 'Utility',
  transparent: 'Transparent',
};

interface ImportedFile {
  name: string;
  size: number;
  type: 'asset' | 'shader';
  extension: string;
}

// ─── Shader Property Editor ────────────────────────────────────────────────────

function ShaderPropertyEditor({ shader, onClose }: { shader: ShaderInfo; onClose: () => void }) {
  const props = parseShaderProperties(shader.code);
  const [values, setValues] = useState<Record<string, number | string | [number, number, number, number]>>(() => {
    const init: Record<string, number | string | [number, number, number, number]> = {};
    props.forEach(p => { init[p.name] = p.default; });
    return init;
  });
  const [copyDone, setCopyDone] = useState(false);

  const handleApply = () => {
    const modified = injectPropertyDefaults(shader.code, values);
    downloadShaderWithDefaults(shader.name, modified);
  };

  const handleCopy = () => {
    const modified = injectPropertyDefaults(shader.code, values);
    navigator.clipboard.writeText(modified);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  if (props.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-surface-800 p-4 text-center animate-fade-in">
        <p className="text-xs text-surface-500">No editable properties found in this shader.</p>
        <button onClick={onClose} className="mt-2 btn-ghost text-xs"><X size={12} className="inline mr-1" />Close</button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-surface-800 bg-surface-900/40 animate-fade-in">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-800">
        <span className="text-sm font-medium flex items-center gap-2">
          <Sliders size={14} className="text-accent-400" /> Edit Properties — {shader.name}
        </span>
        <button onClick={onClose} className="btn-ghost p-1"><X size={14} /></button>
      </div>
      <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
        {props.map(prop => (
          <ShaderPropRow key={prop.name} prop={prop} value={values[prop.name]} onChange={v => setValues(prev => ({ ...prev, [prop.name]: v }))} />
        ))}
      </div>
      <div className="flex gap-2 px-4 pb-4 pt-2 border-t border-surface-800">
        <button onClick={handleApply} className="btn-primary text-xs flex items-center gap-1.5 flex-1">
          <Download size={12} /> Apply & Export .shader
        </button>
        <button onClick={handleCopy} className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors flex-1 justify-center ${copyDone ? 'bg-green-500/15 text-green-400' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}>
          <Copy size={12} /> {copyDone ? 'Copied!' : 'Copy Modified'}
        </button>
      </div>
    </div>
  );
}

function ShaderPropRow({ prop, value, onChange }: {
  prop: ShaderProp;
  value: number | string | [number, number, number, number];
  onChange: (v: number | string | [number, number, number, number]) => void;
}) {
  if (prop.type === 'range') {
    return (
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-xs text-surface-400">{prop.label}</label>
          <span className="text-xs font-semibold text-surface-300 tabular-nums">{Number(value).toFixed(3)}</span>
        </div>
        <input type="range" min={prop.min} max={prop.max} step={(prop.max! - prop.min!) / 100}
          value={Number(value)} onChange={e => onChange(Number(e.target.value))} className="w-full accent-accent-500" />
        <div className="flex justify-between text-[10px] text-surface-600 mt-0.5">
          <span>{prop.min}</span><span>{prop.max}</span>
        </div>
      </div>
    );
  }
  if (prop.type === 'color') {
    const arr = value as [number, number, number, number];
    const hex = rgbaToHex(arr);
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs text-surface-400">{prop.label}{prop.hdr && <span className="ml-1 text-[10px] text-amber-400">HDR</span>}</label>
        <div className="flex items-center gap-2">
          <input type="color" value={hex} onChange={e => onChange(hexToRgba(e.target.value))}
            className="w-7 h-6 rounded cursor-pointer border-0 bg-transparent p-0" />
          <input type="text" value={hex} onChange={e => onChange(hexToRgba(e.target.value))}
            className="w-20 input-field text-xs py-0.5 font-mono" />
        </div>
      </div>
    );
  }
  if (prop.type === 'float' || prop.type === 'int') {
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs text-surface-400">{prop.label}</label>
        <input type="number" value={Number(value)} step={prop.type === 'int' ? 1 : 0.01}
          onChange={e => onChange(Number(e.target.value))} className="input-field text-xs w-24 py-0.5 text-right" />
      </div>
    );
  }
  if (prop.type === 'vector') {
    const arr = value as [number, number, number, number];
    return (
      <div>
        <label className="text-xs text-surface-400 block mb-1">{prop.label}</label>
        <div className="grid grid-cols-4 gap-1">
          {(['X','Y','Z','W'] as const).map((axis, i) => (
            <div key={axis}>
              <label className="text-[10px] text-surface-600 block mb-0.5">{axis}</label>
              <input type="number" value={arr[i]} step={0.01} onChange={e => {
                const next: [number, number, number, number] = [...arr] as [number, number, number, number];
                next[i] = Number(e.target.value);
                onChange(next);
              }} className="input-field text-xs w-full py-0.5" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (prop.type === 'texture') {
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs text-surface-400">{prop.label}</label>
        <span className="text-xs text-surface-600 italic">Texture slot (assign in Unity)</span>
      </div>
    );
  }
  return null;
}

// ─── Unity Tools Section ───────────────────────────────────────────────────────

const toolCategoryIcons: Record<string, typeof Wrench> = {
  avatar: Wrench,
  helpers: Zap,
  fun: Smile,
  unconventional: FlaskConical,
};

function UnityToolCard({ tool }: { tool: UnityTool }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tool.code);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  return (
    <div className="rounded-lg border border-surface-800 bg-surface-800/20 hover:border-surface-700 transition-colors">
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-surface-200">{tool.name}</span>
              {tool.isNew && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-500/20 text-accent-400 font-bold">NEW</span>}
            </div>
            <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">{tool.description}</p>
          </div>
        </div>

        {showDetails && (
          <div className="mt-2.5 p-2.5 bg-surface-900/50 rounded-lg space-y-1.5 animate-fade-in">
            <p className="text-xs text-surface-400">{tool.details}</p>
            <div className="flex items-center gap-1.5">
              <Code size={10} className="text-surface-600 flex-shrink-0" />
              <code className="text-[10px] text-surface-500 font-mono">{tool.menuPath}</code>
            </div>
          </div>
        )}

        <div className="flex gap-1.5 mt-2.5">
          <button onClick={() => setShowDetails(!showDetails)}
            className="text-xs px-2 py-1 rounded bg-surface-800 text-surface-400 hover:bg-surface-700 transition-colors flex items-center gap-1">
            <Info size={10} /> {showDetails ? 'Hide' : 'Details'}
          </button>
          <button onClick={e => { e.stopPropagation(); downloadUnityTool(tool); }}
            className="flex-1 text-xs py-1 rounded bg-accent-600/15 text-accent-400 hover:bg-accent-600/25 transition-colors flex items-center justify-center gap-1">
            <Download size={10} /> Download .cs
          </button>
          <button onClick={handleCopy}
            className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${copyDone ? 'bg-green-500/15 text-green-400' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
            {copyDone ? <Check size={10} /> : <Copy size={10} />} {copyDone ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnityToolsSection() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['avatar']));
  const categories = Object.entries(categoryMeta);

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {categories.map(([key, meta]) => {
        const catTools = unityTools.filter(t => t.category === key);
        const Icon = toolCategoryIcons[key] || Wrench;
        const isOpen = expandedCategories.has(key);
        return (
          <div key={key} className="rounded-lg border border-surface-800 overflow-hidden">
            <button onClick={() => toggleCategory(key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800/30 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-surface-800 flex items-center justify-center">
                  <Icon size={14} className="text-accent-400" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">{meta.label}</div>
                  <div className="text-[11px] text-surface-500">{meta.description}</div>
                </div>
                <span className="text-[10px] bg-surface-800 text-surface-500 px-2 py-0.5 rounded-full font-semibold ml-1">
                  {catTools.length}
                </span>
              </div>
              {isOpen ? <ChevronUp size={16} className="text-surface-500 flex-shrink-0" /> : <ChevronDown size={16} className="text-surface-500 flex-shrink-0" />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2 animate-fade-in">
                {catTools.map(tool => <UnityToolCard key={tool.id} tool={tool} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main AvatarEditor ─────────────────────────────────────────────────────────

export default function AvatarEditor() {
  const [selectedShader, setSelectedShader] = useState<ShaderInfo | null>(null);
  const [showPropertyEditor, setShowPropertyEditor] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importedAssets, setImportedAssets] = useState<ImportedFile[]>([]);
  const [importedShaders, setImportedShaders] = useState<ImportedFile[]>([]);
  const [expandedSection, setExpandedSection] = useState<string>('shaders');
  const assetInputRef = useRef<HTMLInputElement>(null);
  const shaderInputRef = useRef<HTMLInputElement>(null);

  const handleCopyCode = (shader: ShaderInfo) => {
    navigator.clipboard.writeText(shader.code);
    setCopiedId(shader.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAssetImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setImportedAssets(prev => [...prev, ...Array.from(e.target.files!).map(f => ({ name: f.name, size: f.size, type: 'asset' as const, extension: f.name.split('.').pop()?.toLowerCase() || '' }))]);
    e.target.value = '';
  };

  const handleShaderImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setImportedShaders(prev => [...prev, ...Array.from(e.target.files!).map(f => ({ name: f.name, size: f.size, type: 'shader' as const, extension: f.name.split('.').pop()?.toLowerCase() || '' }))]);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent, type: 'asset' | 'shader') => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).map(f => ({ name: f.name, size: f.size, type, extension: f.name.split('.').pop()?.toLowerCase() || '' }));
    if (type === 'asset') setImportedAssets(prev => [...prev, ...files]);
    else setImportedShaders(prev => [...prev, ...files]);
  }, []);

  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const toggleSection = (s: string) => setExpandedSection(expandedSection === s ? '' : s);

  const handleShaderSelect = (shader: ShaderInfo) => {
    if (selectedShader?.id === shader.id) {
      setSelectedShader(null); setShowPropertyEditor(false);
    } else {
      setSelectedShader(shader); setShowPropertyEditor(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Paintbrush size={24} /> Avatar Editor</h1>
        <p className="text-surface-400 text-sm mt-1">Custom shaders, material maker, asset management, and Unity editor tools</p>
      </div>

      {/* ── Shaders ── */}
      <section className="glass-panel-solid">
        <button onClick={() => toggleSection('shaders')} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent-400" />
            <h2 className="text-lg font-semibold">Custom Shaders</h2>
            <span className="text-xs text-surface-500 ml-2">{builtInShaders.length} shaders</span>
          </div>
          {expandedSection === 'shaders' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSection === 'shaders' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-4">Ready-to-use Unity shaders for VRChat avatars. Select a shader to preview its code and edit properties.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {builtInShaders.map(shader => {
                const CategoryIcon = categoryIcons[shader.category] || Box;
                const isSelected = selectedShader?.id === shader.id;
                return (
                  <div key={shader.id}
                    className={`rounded-lg border transition-all cursor-pointer ${isSelected ? 'border-accent-500 bg-accent-500/5' : 'border-surface-800 bg-surface-800/30 hover:border-surface-700 hover:bg-surface-800/50'}`}
                    onClick={() => handleShaderSelect(shader)}>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: shader.color + '20' }}>
                            <CategoryIcon size={16} style={{ color: shader.color }} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{shader.name}</h3>
                            <span className="text-[10px] text-surface-500 uppercase tracking-wide">{categoryLabels[shader.category]}</span>
                          </div>
                        </div>
                        <div className="w-4 h-4 rounded-full flex-shrink-0 mt-1 ring-1 ring-surface-700" style={{ backgroundColor: shader.color }} />
                      </div>
                      <p className="text-xs text-surface-400 mt-2 line-clamp-2">{shader.description}</p>
                      <div className="flex gap-1.5 mt-3">
                        <button onClick={e => { e.stopPropagation(); handleCopyCode(shader); }}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all ${copiedId === shader.id ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}>
                          {copiedId === shader.id ? <Check size={12} /> : <Copy size={12} />} {copiedId === shader.id ? 'Copied' : 'Copy'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); downloadShaderFile(shader); }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-surface-800 text-surface-300 hover:bg-surface-700 transition-all">
                          <Download size={12} /> Download
                        </button>
                        <button onClick={e => { e.stopPropagation(); setSelectedShader(shader); setShowPropertyEditor(v => selectedShader?.id === shader.id ? !v : true); }}
                          title="Edit Properties"
                          className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${showPropertyEditor && isSelected ? 'bg-accent-600/20 text-accent-400' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}>
                          <Sliders size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Code preview + property editor */}
            {selectedShader && (
              <div className="mt-4 rounded-lg border border-surface-800 overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between px-4 py-2 bg-surface-800/50 border-b border-surface-800">
                  <div className="flex items-center gap-2">
                    <FileCode size={14} className="text-accent-400" />
                    <span className="text-sm font-medium">{selectedShader.name}</span>
                    <span className="text-xs text-surface-500">.shader</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowPropertyEditor(v => !v); }}
                      className={`btn-ghost text-xs flex items-center gap-1 px-2 py-1 ${showPropertyEditor ? 'text-accent-400' : ''}`}>
                      <Sliders size={12} /> {showPropertyEditor ? 'Hide Properties' : 'Edit Properties'}
                    </button>
                    <button onClick={() => handleCopyCode(selectedShader)} className="btn-ghost text-xs flex items-center gap-1 px-2 py-1">
                      {copiedId === selectedShader.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === selectedShader.id ? 'Copied' : 'Copy Code'}
                    </button>
                    <button onClick={() => { setSelectedShader(null); setShowPropertyEditor(false); }} className="btn-ghost p-1"><X size={14} /></button>
                  </div>
                </div>
                {showPropertyEditor ? (
                  <div className="p-4 bg-surface-950/50">
                    <ShaderPropertyEditor shader={selectedShader} onClose={() => setShowPropertyEditor(false)} />
                  </div>
                ) : (
                  <pre className="p-4 text-xs text-surface-300 overflow-auto max-h-96 bg-surface-950/50 font-mono leading-relaxed">
                    {selectedShader.code}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Material Maker ── */}
      <section className="glass-panel-solid">
        <button onClick={() => toggleSection('material')} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Paintbrush size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold">Material Maker</h2>
            <span className="text-xs text-surface-500 ml-2">Create & export Unity .mat files</span>
          </div>
          {expandedSection === 'material' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSection === 'material' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-4">
              Design Unity materials visually — adjust properties, preview with a live material ball, then export as a valid Unity <code className="font-mono">.mat</code> YAML file ready to drop into your project.
            </p>
            <MaterialMaker />
          </div>
        )}
      </section>

      {/* ── Asset Library ── */}
      <section className="glass-panel-solid">
        <button onClick={() => toggleSection('assets')} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-400" />
            <h2 className="text-lg font-semibold">Asset Library</h2>
            {importedAssets.length > 0 && <span className="text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full font-semibold">{importedAssets.length}</span>}
          </div>
          {expandedSection === 'assets' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSection === 'assets' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-3">Import 3D models, textures, and materials to organise for your avatar projects.</p>
            <div onDrop={e => handleDrop(e, 'asset')} onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-surface-700 rounded-lg p-6 text-center hover:border-surface-600 hover:bg-surface-800/20 transition-all cursor-pointer"
              onClick={() => assetInputRef.current?.click()}>
              <Upload size={24} className="mx-auto text-surface-500 mb-2" />
              <p className="text-sm text-surface-400">Drop files here or click to browse</p>
              <p className="text-xs text-surface-600 mt-1">.fbx, .obj, .png, .tga, .mat, .prefab</p>
            </div>
            <input ref={assetInputRef} type="file" multiple accept=".fbx,.obj,.png,.tga,.jpg,.jpeg,.mat,.prefab,.asset,.blend" onChange={handleAssetImport} className="hidden" />
            {importedAssets.length > 0 && (
              <div className="mt-3 space-y-1">
                {importedAssets.map((asset, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-surface-800/40 rounded-lg group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-surface-500 uppercase w-8">.{asset.extension}</span>
                      <span className="text-sm text-surface-300 truncate">{asset.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-surface-500">{formatSize(asset.size)}</span>
                      <button onClick={() => setImportedAssets(p => p.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-all"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Shader Library ── */}
      <section className="glass-panel-solid">
        <button onClick={() => toggleSection('shader-import')} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <FileCode size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold">Shader Library</h2>
            {importedShaders.length > 0 && <span className="text-xs bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full font-semibold">{importedShaders.length}</span>}
          </div>
          {expandedSection === 'shader-import' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSection === 'shader-import' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-3">Import your own custom shaders to organise and manage across projects.</p>
            <div onDrop={e => handleDrop(e, 'shader')} onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-surface-700 rounded-lg p-6 text-center hover:border-surface-600 hover:bg-surface-800/20 transition-all cursor-pointer"
              onClick={() => shaderInputRef.current?.click()}>
              <FileCode size={24} className="mx-auto text-surface-500 mb-2" />
              <p className="text-sm text-surface-400">Drop shader files here or click to browse</p>
              <p className="text-xs text-surface-600 mt-1">.shader, .cginc, .hlsl, .glsl, .compute</p>
            </div>
            <input ref={shaderInputRef} type="file" multiple accept=".shader,.cginc,.hlsl,.glsl,.compute" onChange={handleShaderImport} className="hidden" />
            {importedShaders.length > 0 && (
              <div className="mt-3 space-y-1">
                {importedShaders.map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-surface-800/40 rounded-lg group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-purple-400 uppercase w-12">.{s.extension}</span>
                      <span className="text-sm text-surface-300 truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-surface-500">{formatSize(s.size)}</span>
                      <button onClick={() => setImportedShaders(p => p.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-all"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Unity Editor Tools ── */}
      <section className="glass-panel-solid">
        <button onClick={() => toggleSection('unity-tools')} className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-green-400" />
            <h2 className="text-lg font-semibold">Unity Editor Tools</h2>
            <span className="text-xs text-surface-500 ml-2">{unityTools.length} tools</span>
          </div>
          {expandedSection === 'unity-tools' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSection === 'unity-tools' && (
          <div className="px-4 pb-4">
            <div className="mb-4 p-3 rounded-lg bg-green-500/8 border border-green-500/20 text-xs text-green-300">
              <strong>How to use:</strong> Download any <code className="font-mono">.cs</code> file → place it in an <code className="font-mono">Editor/</code> folder inside your Unity project → tools will appear in Unity's top menu under <strong>VRC Studio Tools</strong>.
            </div>
            <UnityToolsSection />
          </div>
        )}
      </section>
    </div>
  );
}
