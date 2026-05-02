export type UnityToolCategory = 'avatar' | 'helpers' | 'fun' | 'unconventional';

export interface UnityTool {
  id: string;
  name: string;
  category: UnityToolCategory;
  description: string;
  details: string;
  menuPath: string;
  filename: string;
  code: string;
  tags: string[];
  isNew?: boolean;
}

export const categoryMeta: Record<UnityToolCategory, { label: string; color: string; description: string }> = {
  avatar:        { label: 'Avatar Creation',  color: '#818cf8', description: 'Tools for building, optimising, and analysing VRChat avatars' },
  helpers:       { label: 'Helpers',          color: '#34d399', description: 'General-purpose Unity Editor utilities to speed up your workflow' },
  fun:           { label: 'Fun',              color: '#f472b6', description: 'Playful tools for experimenting, testing, and messing around' },
  unconventional:{ label: 'Unconventional',   color: '#fb923c', description: 'Niche and experimental tools you won\'t find anywhere else' },
};

export const unityTools: UnityTool[] = [

  // ── AVATAR CREATION ────────────────────────────────────────────────────────

  {
    id: 'triangle-counter',
    name: 'Triangle Counter',
    category: 'avatar',
    description: 'Opens an editor window showing triangle count per mesh with VRChat performance rank colour coding.',
    details: 'Scans every SkinnedMeshRenderer and MeshRenderer on the selected GameObject hierarchy. Displays each mesh\'s triangle count alongside a colour-coded performance rating (Excellent / Good / Medium / Poor / Very Poor) matching VRChat\'s official avatar rank thresholds. Total count is shown at the bottom. Select an avatar root in the hierarchy before running.',
    menuPath: 'VRC Studio Tools/Avatar Creation/Triangle Counter',
    filename: 'VRCStudio_TriangleCounter.cs',
    tags: ['mesh', 'performance', 'optimisation'],
    isNew: true,
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;
using System.Linq;

public class VRCStudio_TriangleCounter : EditorWindow
{
    private Vector2 scroll;
    private List<(string name, int tris)> results = new();
    private int total;

    [MenuItem("VRC Studio Tools/Avatar Creation/Triangle Counter")]
    public static void Open()
    {
        var win = GetWindow<VRCStudio_TriangleCounter>("Triangle Counter");
        win.minSize = new Vector2(360, 300);
        win.Scan();
    }

    private void Scan()
    {
        results.Clear();
        total = 0;
        var go = Selection.activeGameObject;
        if (go == null) return;

        foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            if (smr.sharedMesh != null)
            {
                int t = smr.sharedMesh.triangles.Length / 3;
                results.Add((smr.gameObject.name + " (Skinned)", t));
                total += t;
            }

        foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
            if (mf.sharedMesh != null)
            {
                int t = mf.sharedMesh.triangles.Length / 3;
                results.Add((mf.gameObject.name, t));
                total += t;
            }

        results = results.OrderByDescending(r => r.tris).ToList();
    }

    private Color RankColor(int tris)
    {
        if (tris < 7500)  return new Color(0.2f, 0.8f, 0.3f);   // Excellent
        if (tris < 10000) return new Color(0.6f, 0.9f, 0.2f);   // Good
        if (tris < 15000) return new Color(1f,   0.8f, 0.1f);   // Medium
        if (tris < 20000) return new Color(1f,   0.4f, 0.1f);   // Poor
        return new Color(0.9f, 0.1f, 0.1f);                     // Very Poor
    }

    private string RankLabel(int tris)
    {
        if (tris < 7500)  return "Excellent";
        if (tris < 10000) return "Good";
        if (tris < 15000) return "Medium";
        if (tris < 20000) return "Poor";
        return "Very Poor";
    }

    private void OnGUI()
    {
        EditorGUILayout.Space(6);
        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Scan Selected", GUILayout.Height(28))) Scan();
        EditorGUILayout.EndHorizontal();
        EditorGUILayout.Space(4);

        if (results.Count == 0)
        {
            EditorGUILayout.HelpBox("Select an avatar root and click Scan.", MessageType.Info);
            return;
        }

        scroll = EditorGUILayout.BeginScrollView(scroll);
        foreach (var (name, tris) in results)
        {
            EditorGUILayout.BeginHorizontal("box");
            var prev = GUI.color;
            GUI.color = RankColor(tris);
            GUILayout.Label($"[{RankLabel(tris)}]", GUILayout.Width(80));
            GUI.color = prev;
            GUILayout.Label(name, GUILayout.ExpandWidth(true));
            GUILayout.Label($"{tris:N0} tris", GUILayout.Width(90));
            EditorGUILayout.EndHorizontal();
        }
        EditorGUILayout.EndScrollView();

        EditorGUILayout.Space(4);
        var totalColor = RankColor(total);
        var prev2 = GUI.color;
        GUI.color = totalColor;
        EditorGUILayout.LabelField($"Total: {total:N0} triangles  [{RankLabel(total)}]",
            EditorStyles.boldLabel);
        GUI.color = prev2;
    }
}
#endif`,
  },

  {
    id: 'material-slot-cleaner',
    name: 'Material Slot Cleaner',
    category: 'avatar',
    description: 'Removes null/empty material slots from all renderers on the selected avatar.',
    details: 'Iterates every Renderer in the selected hierarchy and strips any null entries from their sharedMaterials array. Unity can accumulate empty slots after deleted materials, which wastes draw calls. Logs each removed slot to the Console. Supports undo.',
    menuPath: 'VRC Studio Tools/Avatar Creation/Clean Material Slots',
    filename: 'VRCStudio_MaterialSlotCleaner.cs',
    tags: ['materials', 'cleanup', 'optimisation'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Linq;

public static class VRCStudio_MaterialSlotCleaner
{
    [MenuItem("VRC Studio Tools/Avatar Creation/Clean Material Slots")]
    public static void Clean()
    {
        var go = Selection.activeGameObject;
        if (go == null) { Debug.LogWarning("[VRC Studio] No GameObject selected."); return; }

        int removed = 0;
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
        {
            var mats = r.sharedMaterials;
            var clean = mats.Where(m => m != null).ToArray();
            if (clean.Length != mats.Length)
            {
                Undo.RecordObject(r, "Clean Material Slots");
                r.sharedMaterials = clean;
                removed += mats.Length - clean.Length;
                Debug.Log($"[VRC Studio] Cleaned {mats.Length - clean.Length} slot(s) on '{r.gameObject.name}'");
            }
        }

        if (removed == 0) Debug.Log("[VRC Studio] No empty material slots found.");
        else Debug.Log($"[VRC Studio] Removed {removed} empty material slot(s) total.");
    }

    [MenuItem("VRC Studio Tools/Avatar Creation/Clean Material Slots", true)]
    public static bool Validate() => Selection.activeGameObject != null;
}
#endif`,
  },

  {
    id: 'bounds-recalculator',
    name: 'Avatar Bounds Recalculator',
    category: 'avatar',
    description: 'Calls RecalculateBounds() on every SkinnedMeshRenderer in the selection, fixing invisible avatar issues.',
    details: 'A common cause of avatars disappearing at certain camera angles is stale mesh bounds. This tool forces Unity to recalculate bounds for every SkinnedMeshRenderer in the selected hierarchy. Fixes view-frustum culling errors without needing to enter play mode. Supports undo via SerializedObject patch.',
    menuPath: 'VRC Studio Tools/Avatar Creation/Recalculate All Bounds',
    filename: 'VRCStudio_BoundsRecalculator.cs',
    tags: ['mesh', 'bounds', 'culling', 'bugfix'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class VRCStudio_BoundsRecalculator
{
    [MenuItem("VRC Studio Tools/Avatar Creation/Recalculate All Bounds")]
    public static void Recalculate()
    {
        var go = Selection.activeGameObject;
        if (go == null) { Debug.LogWarning("[VRC Studio] No GameObject selected."); return; }

        int count = 0;
        foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
        {
            Undo.RecordObject(smr, "Recalculate Bounds");
            smr.sharedMesh?.RecalculateBounds();
            smr.ResetBounds();
            smr.ResetLocalBounds();
            count++;
        }

        Debug.Log($"[VRC Studio] Recalculated bounds on {count} SkinnedMeshRenderer(s).");
        EditorUtility.SetDirty(go);
    }

    [MenuItem("VRC Studio Tools/Avatar Creation/Recalculate All Bounds", true)]
    public static bool Validate() => Selection.activeGameObject != null;
}
#endif`,
  },

  {
    id: 'texture-analyzer',
    name: 'Texture Memory Analyzer',
    category: 'avatar',
    description: 'Reports every texture on the selected avatar with dimensions, format, and estimated VRAM usage in a sortable window.',
    details: 'Collects all unique textures from every material on every renderer in the selected hierarchy. For each texture shows: name, dimensions, format, mip count, and an estimate of GPU memory footprint. Rows are sorted by VRAM cost descending. Useful for identifying which textures are blowing your avatar\'s memory budget.',
    menuPath: 'VRC Studio Tools/Avatar Creation/Texture Memory Report',
    filename: 'VRCStudio_TextureAnalyzer.cs',
    tags: ['texture', 'vram', 'performance', 'memory'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;
using System.Linq;

public class VRCStudio_TextureAnalyzer : EditorWindow
{
    private class TexInfo
    {
        public Texture tex;
        public string name;
        public int width, height, mips;
        public string format;
        public long vramBytes;
    }

    private List<TexInfo> rows = new();
    private Vector2 scroll;

    [MenuItem("VRC Studio Tools/Avatar Creation/Texture Memory Report")]
    public static void Open()
    {
        var w = GetWindow<VRCStudio_TextureAnalyzer>("Texture Report");
        w.minSize = new Vector2(520, 360);
        w.Analyze();
    }

    private void Analyze()
    {
        rows.Clear();
        var go = Selection.activeGameObject;
        if (go == null) return;

        var seen = new HashSet<int>();
        foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            foreach (var mat in r.sharedMaterials)
            {
                if (mat == null) continue;
                var shader = mat.shader;
                for (int p = 0; p < ShaderUtil.GetPropertyCount(shader); p++)
                    if (ShaderUtil.GetPropertyType(shader, p) == ShaderUtil.ShaderPropertyType.TexEnv)
                    {
                        var t = mat.GetTexture(ShaderUtil.GetPropertyName(shader, p)) as Texture2D;
                        if (t == null || !seen.Add(t.GetInstanceID())) continue;
                        long bytes = (long)t.width * t.height * 4;
                        if (t.mipmapCount > 1) bytes = (long)(bytes * 1.33f);
                        rows.Add(new TexInfo {
                            tex = t, name = t.name,
                            width = t.width, height = t.height,
                            mips = t.mipmapCount,
                            format = t.format.ToString(),
                            vramBytes = bytes
                        });
                    }
            }

        rows = rows.OrderByDescending(r => r.vramBytes).ToList();
    }

    private void OnGUI()
    {
        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Refresh", GUILayout.Height(26))) Analyze();
        EditorGUILayout.LabelField($"Total textures: {rows.Count}  |  Est. VRAM: {rows.Sum(r => r.vramBytes) / 1048576f:F1} MB",
            EditorStyles.miniLabel);
        EditorGUILayout.EndHorizontal();

        EditorGUILayout.BeginHorizontal("box");
        GUILayout.Label("Name",        GUILayout.Width(200));
        GUILayout.Label("Size",        GUILayout.Width(90));
        GUILayout.Label("Format",      GUILayout.Width(110));
        GUILayout.Label("Est. VRAM",   GUILayout.Width(80));
        EditorGUILayout.EndHorizontal();

        scroll = EditorGUILayout.BeginScrollView(scroll);
        foreach (var row in rows)
        {
            EditorGUILayout.BeginHorizontal("box");
            if (GUILayout.Button(row.name, EditorStyles.linkLabel, GUILayout.Width(200)))
                EditorGUIUtility.PingObject(row.tex);
            GUILayout.Label($"{row.width}×{row.height}", GUILayout.Width(90));
            GUILayout.Label(row.format, GUILayout.Width(110));
            GUILayout.Label($"{row.vramBytes / 1024f:F0} KB", GUILayout.Width(80));
            EditorGUILayout.EndHorizontal();
        }
        EditorGUILayout.EndScrollView();
    }
}
#endif`,
  },

  {
    id: 'blendshape-preview',
    name: 'Blend Shape Preview',
    category: 'avatar',
    description: 'Interactive sliders for all blend shapes on the selected SkinnedMeshRenderer — preview without entering play mode.',
    details: 'Opens a scrollable window listing every blend shape on the active SkinnedMeshRenderer. Each shape has a 0–100 slider that updates in real time in the Scene view. No play mode required. Values are reset on window close. Great for testing facial expressions, lip sync shapes, and body morphs.',
    menuPath: 'VRC Studio Tools/Avatar Creation/Blend Shape Preview',
    filename: 'VRCStudio_BlendShapePreview.cs',
    tags: ['blendshape', 'animation', 'preview'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;

public class VRCStudio_BlendShapePreview : EditorWindow
{
    private SkinnedMeshRenderer target;
    private Vector2 scroll;
    private List<float> values = new();
    private string searchFilter = "";

    [MenuItem("VRC Studio Tools/Avatar Creation/Blend Shape Preview")]
    public static void Open()
    {
        var w = GetWindow<VRCStudio_BlendShapePreview>("Blend Shape Preview");
        w.minSize = new Vector2(320, 400);
        w.LoadTarget();
    }

    private void LoadTarget()
    {
        target = Selection.activeGameObject?.GetComponent<SkinnedMeshRenderer>()
              ?? Selection.activeGameObject?.GetComponentInChildren<SkinnedMeshRenderer>();
        values.Clear();
        if (target?.sharedMesh == null) return;
        for (int i = 0; i < target.sharedMesh.blendShapeCount; i++)
            values.Add(target.GetBlendShapeWeight(i));
    }

    private void OnDestroy()
    {
        if (target == null) return;
        for (int i = 0; i < values.Count; i++)
            target.SetBlendShapeWeight(i, 0f);
    }

    private void OnGUI()
    {
        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button("Reload", GUILayout.Width(70))) LoadTarget();
        if (GUILayout.Button("Reset All", GUILayout.Width(70)))
        {
            for (int i = 0; i < values.Count; i++) { values[i] = 0f; target?.SetBlendShapeWeight(i, 0f); }
        }
        EditorGUILayout.EndHorizontal();

        searchFilter = EditorGUILayout.TextField("Search", searchFilter);

        if (target == null || target.sharedMesh == null)
        {
            EditorGUILayout.HelpBox("Select a SkinnedMeshRenderer.", MessageType.Info);
            return;
        }

        EditorGUILayout.LabelField($"{target.sharedMesh.blendShapeCount} shapes on '{target.gameObject.name}'",
            EditorStyles.miniLabel);

        scroll = EditorGUILayout.BeginScrollView(scroll);
        for (int i = 0; i < target.sharedMesh.blendShapeCount; i++)
        {
            string shapeName = target.sharedMesh.GetBlendShapeName(i);
            if (!string.IsNullOrEmpty(searchFilter) &&
                !shapeName.ToLower().Contains(searchFilter.ToLower())) continue;

            EditorGUILayout.BeginHorizontal();
            GUILayout.Label(shapeName, GUILayout.Width(180));
            float newVal = EditorGUILayout.Slider(values[i], 0f, 100f);
            if (!Mathf.Approximately(newVal, values[i]))
            {
                values[i] = newVal;
                target.SetBlendShapeWeight(i, newVal);
                SceneView.RepaintAll();
            }
            EditorGUILayout.EndHorizontal();
        }
        EditorGUILayout.EndScrollView();
    }
}
#endif`,
  },

  // ── HELPERS ────────────────────────────────────────────────────────────────

  {
    id: 'missing-script-finder',
    name: 'Missing Script Finder',
    category: 'helpers',
    description: 'Scans the entire scene for GameObjects with missing MonoBehaviour references and lets you ping each one.',
    details: 'Iterates every GameObject in the open scene (or the selected hierarchy if something is selected). Reports each object with a missing script component and provides a Ping button to highlight it in the Hierarchy window. Essential for cleaning up avatar projects after script refactoring or package removal.',
    menuPath: 'VRC Studio Tools/Helpers/Find Missing Scripts',
    filename: 'VRCStudio_MissingScriptFinder.cs',
    tags: ['debug', 'cleanup', 'scripts'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;

public class VRCStudio_MissingScriptFinder : EditorWindow
{
    private List<GameObject> found = new();
    private Vector2 scroll;

    [MenuItem("VRC Studio Tools/Helpers/Find Missing Scripts")]
    public static void Open()
    {
        var w = GetWindow<VRCStudio_MissingScriptFinder>("Missing Scripts");
        w.minSize = new Vector2(340, 300);
        w.Scan();
    }

    private void Scan()
    {
        found.Clear();
        var root = Selection.activeGameObject;
        GameObject[] objects = root != null
            ? root.GetComponentsInChildren<Transform>(true).ToGameObjects()
            : Resources.FindObjectsOfTypeAll<GameObject>();

        foreach (var go in objects)
        {
            var comps = go.GetComponents<Component>();
            foreach (var c in comps)
                if (c == null) { found.Add(go); break; }
        }
    }

    private void OnGUI()
    {
        if (GUILayout.Button("Scan Scene", GUILayout.Height(26))) Scan();

        if (found.Count == 0)
        {
            EditorGUILayout.HelpBox("No missing scripts found.", MessageType.Info);
            return;
        }

        EditorGUILayout.LabelField($"Found {found.Count} object(s) with missing scripts:", EditorStyles.boldLabel);
        scroll = EditorGUILayout.BeginScrollView(scroll);
        foreach (var go in found)
        {
            EditorGUILayout.BeginHorizontal("box");
            EditorGUILayout.LabelField(go != null ? go.name : "(destroyed)", GUILayout.ExpandWidth(true));
            if (go != null && GUILayout.Button("Ping", GUILayout.Width(48)))
                EditorGUIUtility.PingObject(go);
            EditorGUILayout.EndHorizontal();
        }
        EditorGUILayout.EndScrollView();
    }
}

internal static class TransformExtensions
{
    public static GameObject[] ToGameObjects(this Transform[] transforms)
    {
        var arr = new GameObject[transforms.Length];
        for (int i = 0; i < transforms.Length; i++) arr[i] = transforms[i].gameObject;
        return arr;
    }
}
#endif`,
  },

  {
    id: 'component-copier',
    name: 'Component Copier',
    category: 'helpers',
    description: 'Copies all components (except Transform) from the first selected object to every other selected object.',
    details: 'Select two or more GameObjects. The first selected acts as the source. Every non-Transform component on the source is copied (using UnityEditorInternal.ComponentUtility) to each remaining selected object. Useful for applying collider or animator setups across many similar objects at once. Supports undo.',
    menuPath: 'VRC Studio Tools/Helpers/Copy Components To Selected',
    filename: 'VRCStudio_ComponentCopier.cs',
    tags: ['components', 'batch', 'workflow'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEditorInternal;

public static class VRCStudio_ComponentCopier
{
    [MenuItem("VRC Studio Tools/Helpers/Copy Components To Selected")]
    public static void Copy()
    {
        var selection = Selection.gameObjects;
        if (selection.Length < 2)
        {
            Debug.LogWarning("[VRC Studio] Select 2+ objects. First = source, rest = targets.");
            return;
        }

        var source = selection[0];
        var comps = source.GetComponents<Component>();
        int copied = 0;

        foreach (var target in selection)
        {
            if (target == source) continue;
            Undo.RecordObject(target, "Copy Components");
            foreach (var c in comps)
            {
                if (c is Transform) continue;
                ComponentUtility.CopyComponent(c);
                ComponentUtility.PasteComponentAsNew(target);
                copied++;
            }
        }

        Debug.Log($"[VRC Studio] Copied {copied} component(s) to {selection.Length - 1} object(s).");
    }

    [MenuItem("VRC Studio Tools/Helpers/Copy Components To Selected", true)]
    public static bool Validate() => Selection.gameObjects.Length >= 2;
}
#endif`,
  },

  {
    id: 'hierarchy-dividers',
    name: 'Hierarchy Dividers',
    category: 'helpers',
    description: 'Inserts a disabled separator GameObject at the top of the selection to visually organise the Hierarchy panel.',
    details: 'Creates a new disabled GameObject named "═══ ─── ═══" at the position of the first selected object in the Hierarchy. You can rename it to any label you like. These separators are ignored by VRChat\'s build process (disabled GameObjects without components are stripped) but make large hierarchies much easier to read.',
    menuPath: 'VRC Studio Tools/Helpers/Insert Hierarchy Divider',
    filename: 'VRCStudio_HierarchyDividers.cs',
    tags: ['hierarchy', 'organisation', 'workflow'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class VRCStudio_HierarchyDividers
{
    [MenuItem("VRC Studio Tools/Helpers/Insert Hierarchy Divider")]
    public static void Insert()
    {
        var parent = Selection.activeTransform?.parent;
        var divider = new GameObject("═══ ─── ═══");
        divider.SetActive(false);

        if (parent != null)
            divider.transform.SetParent(parent, false);

        if (Selection.activeTransform != null)
            divider.transform.SetSiblingIndex(Selection.activeTransform.GetSiblingIndex());

        Undo.RegisterCreatedObjectUndo(divider, "Insert Hierarchy Divider");
        Selection.activeGameObject = divider;
        Debug.Log("[VRC Studio] Divider inserted. Rename it to label your section.");
    }
}
#endif`,
  },

  {
    id: 'prefab-sync-checker',
    name: 'Prefab Override Inspector',
    category: 'helpers',
    description: 'Lists all property overrides on scene prefab instances so you can review or revert them in bulk.',
    details: 'Scans every prefab instance in the scene (or selection). For each, shows a list of modified properties with their overridden value. Includes a "Revert All" button per object and a per-property revert button. Helps keep prefab instances clean and predictable, especially important when packaging avatar projects.',
    menuPath: 'VRC Studio Tools/Helpers/Check Prefab Overrides',
    filename: 'VRCStudio_PrefabSyncChecker.cs',
    tags: ['prefab', 'overrides', 'cleanup'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;

public class VRCStudio_PrefabSyncChecker : EditorWindow
{
    private class OverrideInfo { public GameObject go; public List<PropertyModification> mods; }
    private List<OverrideInfo> infos = new();
    private Vector2 scroll;

    [MenuItem("VRC Studio Tools/Helpers/Check Prefab Overrides")]
    public static void Open()
    {
        var w = GetWindow<VRCStudio_PrefabSyncChecker>("Prefab Overrides");
        w.minSize = new Vector2(420, 360);
        w.Scan();
    }

    private void Scan()
    {
        infos.Clear();
        var gos = Selection.gameObjects.Length > 0
            ? Selection.gameObjects
            : Resources.FindObjectsOfTypeAll<GameObject>();

        foreach (var go in gos)
        {
            if (!PrefabUtility.IsPartOfPrefabInstance(go)) continue;
            var mods = new List<PropertyModification>(PrefabUtility.GetPropertyModifications(go) ?? new PropertyModification[0]);
            if (mods.Count > 0) infos.Add(new OverrideInfo { go = go, mods = mods });
        }
    }

    private void OnGUI()
    {
        if (GUILayout.Button("Refresh", GUILayout.Height(26))) Scan();
        if (infos.Count == 0) { EditorGUILayout.HelpBox("No prefab overrides found.", MessageType.Info); return; }

        scroll = EditorGUILayout.BeginScrollView(scroll);
        foreach (var info in infos)
        {
            EditorGUILayout.BeginVertical("box");
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Ping", GUILayout.Width(42))) EditorGUIUtility.PingObject(info.go);
            EditorGUILayout.LabelField(info.go.name, EditorStyles.boldLabel);
            if (GUILayout.Button("Revert All", GUILayout.Width(80)))
            {
                PrefabUtility.RevertPrefabInstance(info.go, InteractionMode.UserAction);
                Scan(); return;
            }
            EditorGUILayout.EndHorizontal();

            foreach (var mod in info.mods)
                EditorGUILayout.LabelField($"  • {mod.propertyPath}: {mod.value}", EditorStyles.miniLabel);
            EditorGUILayout.EndVertical();
        }
        EditorGUILayout.EndScrollView();
    }
}
#endif`,
  },

  {
    id: 'multi-angle-screenshot',
    name: 'Multi-Angle Screenshot',
    category: 'helpers',
    description: 'Renders 4 clean 1024×1024 screenshots (front, back, left, right) of the selected object into Assets/Screenshots/.',
    details: 'Temporarily creates an offscreen camera, positions it at each of the 4 cardinal angles around the selected object\'s bounds centre, renders to a RenderTexture, and saves PNG files to Assets/Screenshots/<ObjectName>/. No scene lighting is modified. The temporary camera is destroyed after capture. Results are imported into the project automatically.',
    menuPath: 'VRC Studio Tools/Helpers/Screenshot Selected (4 Angles)',
    filename: 'VRCStudio_MultiAngleScreenshot.cs',
    tags: ['screenshot', 'documentation', 'preview'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.IO;

public static class VRCStudio_MultiAngleScreenshot
{
    private const int RES = 1024;

    [MenuItem("VRC Studio Tools/Helpers/Screenshot Selected (4 Angles)")]
    public static void Capture()
    {
        var go = Selection.activeGameObject;
        if (go == null) { Debug.LogWarning("[VRC Studio] No GameObject selected."); return; }

        var bounds = GetBounds(go);
        float dist = bounds.extents.magnitude * 2.5f;
        float camY = bounds.center.y;

        var angles = new[] {
            ("Front",  new Vector3(0,   0,   -dist)),
            ("Back",   new Vector3(0,   0,    dist)),
            ("Left",   new Vector3(-dist, 0,  0)),
            ("Right",  new Vector3( dist, 0,  0)),
        };

        string folder = $"Assets/Screenshots/{go.name}";
        Directory.CreateDirectory(Path.Combine(Application.dataPath, "..", folder));

        var rt  = new RenderTexture(RES, RES, 24);
        var cam = new GameObject("__VRCStudio_Cam").AddComponent<Camera>();
        cam.targetTexture = rt;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Color.clear;
        cam.fieldOfView = 40f;

        foreach (var (label, offset) in angles)
        {
            cam.transform.position = bounds.center + offset + Vector3.up * (camY - bounds.center.y);
            cam.transform.LookAt(bounds.center);
            cam.Render();

            RenderTexture.active = rt;
            var tex = new Texture2D(RES, RES, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, RES, RES), 0, 0);
            tex.Apply();
            RenderTexture.active = null;

            string path = $"{folder}/{go.name}_{label}.png";
            File.WriteAllBytes(Path.Combine(Application.dataPath, "..", path), tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            Debug.Log($"[VRC Studio] Saved {path}");
        }

        Object.DestroyImmediate(cam.gameObject);
        Object.DestroyImmediate(rt);
        AssetDatabase.Refresh();
        Debug.Log($"[VRC Studio] 4 screenshots saved to {folder}/");
    }

    private static Bounds GetBounds(GameObject go)
    {
        var renderers = go.GetComponentsInChildren<Renderer>();
        if (renderers.Length == 0) return new Bounds(go.transform.position, Vector3.one);
        var b = renderers[0].bounds;
        foreach (var r in renderers) b.Encapsulate(r.bounds);
        return b;
    }

    [MenuItem("VRC Studio Tools/Helpers/Screenshot Selected (4 Angles)", true)]
    public static bool Validate() => Selection.activeGameObject != null;
}
#endif`,
  },

  // ── FUN ────────────────────────────────────────────────────────────────────

  {
    id: 'random-color-assigner',
    name: 'Random Color Assigner',
    category: 'fun',
    description: 'Gives every renderer on selected objects a unique randomly-coloured material for quick visual debugging.',
    details: 'Creates temporary Unlit/Color materials with random hues for every Renderer in the selection. Original materials are NOT modified — the original sharedMaterials are stored in the Undo stack so Ctrl+Z restores everything instantly. Great for visually separating meshes that all look the same in the scene.',
    menuPath: 'VRC Studio Tools/Fun/Assign Random Colors',
    filename: 'VRCStudio_RandomColorAssigner.cs',
    tags: ['debug', 'colours', 'testing'],
    isNew: true,
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class VRCStudio_RandomColorAssigner
{
    [MenuItem("VRC Studio Tools/Fun/Assign Random Colors")]
    public static void Assign()
    {
        var gos = Selection.gameObjects;
        if (gos.Length == 0) { Debug.LogWarning("[VRC Studio] Nothing selected."); return; }

        float hueStep = 1f / Mathf.Max(1, CountRenderers(gos));
        float hue = Random.value;

        foreach (var go in gos)
            foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            {
                Undo.RecordObject(r, "Random Colors");
                var mat = new Material(Shader.Find("Unlit/Color"));
                mat.color = Color.HSVToRGB(hue, 0.75f, 0.95f);
                r.sharedMaterial = mat;
                hue = (hue + hueStep) % 1f;
            }

        Debug.Log("[VRC Studio] Random colours applied. Ctrl+Z to revert.");
    }

    private static int CountRenderers(GameObject[] gos)
    {
        int n = 0;
        foreach (var g in gos) n += g.GetComponentsInChildren<Renderer>(true).Length;
        return n;
    }

    [MenuItem("VRC Studio Tools/Fun/Assign Random Colors", true)]
    public static bool Validate() => Selection.gameObjects.Length > 0;
}
#endif`,
  },

  {
    id: 'physics-party',
    name: 'Physics Party Mode',
    category: 'fun',
    description: 'Adds a Rigidbody to every renderer in the selected hierarchy — enter play mode and watch the chaos.',
    details: 'Iterates every MeshRenderer in the selection and adds a Rigidbody with gravity enabled. Mass is scaled by the mesh\'s bounding box volume. Enter play mode and watch everything collapse. Fully undoable with Ctrl+Z before you press Play. NOTE: Do not use on a production avatar without undoing first.',
    menuPath: 'VRC Studio Tools/Fun/Physics Party Mode',
    filename: 'VRCStudio_PhysicsParty.cs',
    tags: ['physics', 'rigidbody', 'chaos'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class VRCStudio_PhysicsParty
{
    [MenuItem("VRC Studio Tools/Fun/Physics Party Mode")]
    public static void Activate()
    {
        var go = Selection.activeGameObject;
        if (go == null) { Debug.LogWarning("[VRC Studio] Nothing selected."); return; }

        int added = 0;
        foreach (var r in go.GetComponentsInChildren<MeshRenderer>(true))
        {
            if (r.GetComponent<Rigidbody>() != null) continue;
            Undo.AddComponent<Rigidbody>(r.gameObject);
            var rb = r.GetComponent<Rigidbody>();
            if (rb != null)
            {
                rb.mass = Mathf.Max(0.1f, r.bounds.size.x * r.bounds.size.y * r.bounds.size.z);
                rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
            }
            added++;
        }

        Debug.Log($"[VRC Studio] Physics Party: added Rigidbody to {added} objects. Press Play! (Ctrl+Z to undo)");
    }

    [MenuItem("VRC Studio Tools/Fun/Physics Party Mode", true)]
    public static bool Validate() => Selection.activeGameObject != null;
}
#endif`,
  },

  {
    id: 'avatar-spin-preview',
    name: 'Avatar Spin Preview',
    category: 'fun',
    description: 'Slowly rotates the selected GameObject in the Scene view — great for previewing avatar proportions from all angles.',
    details: 'Hooks into EditorApplication.update to rotate the selected object 1° per tick around its Y axis. The scene view is repainted each frame so you see smooth rotation without entering play mode. Run the menu item again to stop. Original rotation is saved and can be restored with the Stop option.',
    menuPath: 'VRC Studio Tools/Fun/Toggle Avatar Spin',
    filename: 'VRCStudio_AvatarSpin.cs',
    tags: ['preview', 'rotation', 'animation'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

[InitializeOnLoad]
public static class VRCStudio_AvatarSpin
{
    private static bool spinning = false;
    private static GameObject target;
    private static Quaternion originalRot;

    [MenuItem("VRC Studio Tools/Fun/Toggle Avatar Spin")]
    public static void Toggle()
    {
        if (!spinning)
        {
            target = Selection.activeGameObject;
            if (target == null) { Debug.LogWarning("[VRC Studio] Select a GameObject first."); return; }
            originalRot = target.transform.rotation;
            EditorApplication.update += Tick;
            spinning = true;
            Debug.Log("[VRC Studio] Spin started. Run again to stop.");
        }
        else
        {
            EditorApplication.update -= Tick;
            spinning = false;
            if (target != null) target.transform.rotation = originalRot;
            Debug.Log("[VRC Studio] Spin stopped. Rotation restored.");
        }
    }

    private static void Tick()
    {
        if (target == null) { EditorApplication.update -= Tick; spinning = false; return; }
        target.transform.Rotate(Vector3.up, 1f, Space.World);
        SceneView.RepaintAll();
    }
}
#endif`,
  },

  {
    id: 'scale-randomizer',
    name: 'Scale Randomizer',
    category: 'fun',
    description: 'Randomises the local scale of each selected object between configurable min and max values.',
    details: 'Opens a small window with Min Scale and Max Scale sliders. Clicking Apply randomises each axis (or uniform scale) of every selected GameObject within that range. Useful for quickly scattering prop variants or testing how an avatar looks at different scales. Supports undo.',
    menuPath: 'VRC Studio Tools/Fun/Randomize Scale',
    filename: 'VRCStudio_ScaleRandomizer.cs',
    tags: ['scale', 'randomise', 'props'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public class VRCStudio_ScaleRandomizer : EditorWindow
{
    private float minScale = 0.8f;
    private float maxScale = 1.2f;
    private bool uniform = true;

    [MenuItem("VRC Studio Tools/Fun/Randomize Scale")]
    public static void Open() => GetWindow<VRCStudio_ScaleRandomizer>("Scale Randomizer");

    private void OnGUI()
    {
        EditorGUILayout.Space(6);
        uniform   = EditorGUILayout.Toggle("Uniform Scale", uniform);
        minScale  = EditorGUILayout.Slider("Min Scale", minScale, 0.01f, 10f);
        maxScale  = EditorGUILayout.Slider("Max Scale", maxScale, 0.01f, 10f);
        if (maxScale < minScale) maxScale = minScale;

        EditorGUILayout.Space(6);
        if (GUILayout.Button("Apply to Selection", GUILayout.Height(30)))
        {
            foreach (var go in Selection.gameObjects)
            {
                Undo.RecordObject(go.transform, "Randomize Scale");
                if (uniform)
                {
                    float s = Random.Range(minScale, maxScale);
                    go.transform.localScale = new Vector3(s, s, s);
                }
                else
                    go.transform.localScale = new Vector3(
                        Random.Range(minScale, maxScale),
                        Random.Range(minScale, maxScale),
                        Random.Range(minScale, maxScale));
            }
        }
    }
}
#endif`,
  },

  {
    id: 'name-generator',
    name: 'Avatar Name Generator',
    category: 'fun',
    description: 'Generates creative avatar names from a curated wordlist — click to copy to clipboard.',
    details: 'Opens a small window with a Generate button. Each click produces a new name in the style of "AdjNoun", "NounVerber", or "The AdjectiveNoun" using a built-in list of VRChat-flavoured words. Copy the result to clipboard with one click. Useful for naming test avatars, world objects, or just finding inspiration.',
    menuPath: 'VRC Studio Tools/Fun/Generate Avatar Name',
    filename: 'VRCStudio_NameGenerator.cs',
    tags: ['names', 'creative', 'clipboard'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public class VRCStudio_NameGenerator : EditorWindow
{
    private string generated = "Click Generate!";

    private static readonly string[] adjectives = {
        "Neon","Void","Cyber","Holographic","Astral","Phantom","Crystal","Solar",
        "Lunar","Velvet","Arcane","Radiant","Shadow","Glitch","Prismatic","Quantum"
    };
    private static readonly string[] nouns = {
        "Fox","Specter","Drift","Comet","Echo","Nebula","Surge","Paradox",
        "Wisp","Titan","Cipher","Flux","Oracle","Prism","Nexus","Aura"
    };
    private static readonly string[] suffixes = {
        "","","","","X","Zero","Prime","Mk2","EX","Alpha",".exe",""
    };

    [MenuItem("VRC Studio Tools/Fun/Generate Avatar Name")]
    public static void Open() => GetWindow<VRCStudio_NameGenerator>("Name Generator");

    private void OnGUI()
    {
        EditorGUILayout.Space(10);
        GUIStyle big = new GUIStyle(EditorStyles.boldLabel) { fontSize = 18, alignment = TextAnchor.MiddleCenter };
        EditorGUILayout.LabelField(generated, big, GUILayout.Height(40));
        EditorGUILayout.Space(8);

        if (GUILayout.Button("Generate", GUILayout.Height(32)))
        {
            string adj  = adjectives[Random.Range(0, adjectives.Length)];
            string noun = nouns[Random.Range(0, nouns.Length)];
            string suf  = suffixes[Random.Range(0, suffixes.Length)];
            generated = adj + noun + suf;
        }

        if (GUILayout.Button("Copy to Clipboard", GUILayout.Height(28)))
        {
            EditorGUIUtility.systemCopyBuffer = generated;
            Debug.Log($"[VRC Studio] Copied '{generated}' to clipboard.");
        }
    }
}
#endif`,
  },

  // ── UNCONVENTIONAL ────────────────────────────────────────────────────────

  {
    id: 'uv-seam-visualizer',
    name: 'UV Seam Visualizer',
    category: 'unconventional',
    description: 'Draws UV seam edges as bright coloured lines in the Scene view so you can see exactly where texture seams fall on a mesh.',
    details: 'Hooks into SceneView.duringSceneGui to draw every UV seam edge (edges where adjacent triangles have discontinuous UVs) as a coloured Handles line on the selected MeshFilter. Run again to toggle off. Invaluable for diagnosing visible seam lines in avatars and finding where to hide UV islands.',
    menuPath: 'VRC Studio Tools/Unconventional/Toggle UV Seam Visualizer',
    filename: 'VRCStudio_UVSeamVisualizer.cs',
    tags: ['uv', 'seams', 'debug', 'mesh'],
    isNew: true,
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;

[InitializeOnLoad]
public static class VRCStudio_UVSeamVisualizer
{
    private static bool active = false;
    private static MeshFilter cachedMF;
    private static List<(Vector3 a, Vector3 b)> seamEdges = new();

    [MenuItem("VRC Studio Tools/Unconventional/Toggle UV Seam Visualizer")]
    public static void Toggle()
    {
        active = !active;
        if (active)
        {
            BuildSeams();
            SceneView.duringSceneGui += Draw;
            Debug.Log("[VRC Studio] UV Seam Visualizer ON (select a MeshFilter).");
        }
        else
        {
            SceneView.duringSceneGui -= Draw;
            seamEdges.Clear();
            Debug.Log("[VRC Studio] UV Seam Visualizer OFF.");
        }
        SceneView.RepaintAll();
    }

    private static void BuildSeams()
    {
        seamEdges.Clear();
        cachedMF = Selection.activeGameObject?.GetComponent<MeshFilter>();
        if (cachedMF?.sharedMesh == null) return;

        var mesh = cachedMF.sharedMesh;
        var verts = mesh.vertices;
        var uvs   = mesh.uv;
        var tris  = mesh.triangles;

        var edgeUV = new Dictionary<(int, int), Vector2[]>();
        for (int i = 0; i < tris.Length; i += 3)
            for (int e = 0; e < 3; e++)
            {
                int a = tris[i + e], b = tris[i + (e + 1) % 3];
                int ka = Mathf.Min(a, b), kb = Mathf.Max(a, b);
                var key = (ka, kb);
                if (!edgeUV.ContainsKey(key))
                    edgeUV[key] = new[] { uvs.Length > a ? uvs[a] : Vector2.zero,
                                          uvs.Length > b ? uvs[b] : Vector2.zero };
                else
                {
                    var prev = edgeUV[key];
                    var curA = uvs.Length > a ? uvs[a] : Vector2.zero;
                    var curB = uvs.Length > b ? uvs[b] : Vector2.zero;
                    if (Vector2.Distance(prev[0], curA) > 0.001f || Vector2.Distance(prev[1], curB) > 0.001f)
                        seamEdges.Add((cachedMF.transform.TransformPoint(verts[ka]),
                                       cachedMF.transform.TransformPoint(verts[kb])));
                }
            }
    }

    private static void Draw(SceneView sv)
    {
        if (!active || cachedMF == null) return;
        Handles.color = new Color(1f, 0.3f, 0.1f, 0.9f);
        foreach (var (a, b) in seamEdges) Handles.DrawLine(a, b);
    }
}
#endif`,
  },

  {
    id: 'shader-property-logger',
    name: 'Shader Property Logger',
    category: 'unconventional',
    description: 'Logs every shader property name, type, and current value of the selected renderer\'s materials to the Console.',
    details: 'Iterates all materials on the selected Renderer and uses ShaderUtil to enumerate every exposed property. For each one it logs the property name, display name, type, and current value. Useful when you\'re trying to set shader properties from scripts and need to know the exact internal names without opening the shader source.',
    menuPath: 'VRC Studio Tools/Unconventional/Log Shader Properties',
    filename: 'VRCStudio_ShaderPropertyLogger.cs',
    tags: ['shader', 'debug', 'properties'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class VRCStudio_ShaderPropertyLogger
{
    [MenuItem("VRC Studio Tools/Unconventional/Log Shader Properties")]
    public static void Log()
    {
        var r = Selection.activeGameObject?.GetComponent<Renderer>()
             ?? Selection.activeGameObject?.GetComponentInChildren<Renderer>();
        if (r == null) { Debug.LogWarning("[VRC Studio] No Renderer found on selection."); return; }

        foreach (var mat in r.sharedMaterials)
        {
            if (mat == null) continue;
            Debug.Log($"[VRC Studio] === Material: {mat.name} | Shader: {mat.shader.name} ===");
            int count = ShaderUtil.GetPropertyCount(mat.shader);
            for (int i = 0; i < count; i++)
            {
                var pName = ShaderUtil.GetPropertyName(mat.shader, i);
                var pDesc = ShaderUtil.GetPropertyDescription(mat.shader, i);
                var pType = ShaderUtil.GetPropertyType(mat.shader, i);
                string val = pType switch {
                    ShaderUtil.ShaderPropertyType.Color   => mat.GetColor(pName).ToString(),
                    ShaderUtil.ShaderPropertyType.Float   => mat.GetFloat(pName).ToString("F4"),
                    ShaderUtil.ShaderPropertyType.Range   => mat.GetFloat(pName).ToString("F4"),
                    ShaderUtil.ShaderPropertyType.Vector  => mat.GetVector(pName).ToString(),
                    ShaderUtil.ShaderPropertyType.TexEnv  => mat.GetTexture(pName)?.name ?? "null",
                    _ => "?"
                };
                Debug.Log($"  [{pType,-8}] {pName,-35} \"{pDesc}\" = {val}");
            }
        }
    }

    [MenuItem("VRC Studio Tools/Unconventional/Log Shader Properties", true)]
    public static bool Validate() => Selection.activeGameObject != null;
}
#endif`,
  },

  {
    id: 'vertex-heatmap',
    name: 'Vertex Density Heatmap',
    category: 'unconventional',
    description: 'Colour-codes sub-meshes of the selected avatar by vertex density in the Scene view — dense areas red, sparse areas blue.',
    details: 'Draws Gizmos-style coloured mesh wireframes in the Scene view, using a heat colour scale from blue (low density) to red (high density) based on the vertex count of each sub-mesh relative to the maximum. Helps identify overly dense regions where you can reduce polygon count without visual impact. Toggle off by running again.',
    menuPath: 'VRC Studio Tools/Unconventional/Toggle Vertex Density Heatmap',
    filename: 'VRCStudio_VertexHeatmap.cs',
    tags: ['vertices', 'density', 'optimisation', 'debug'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;

[InitializeOnLoad]
public static class VRCStudio_VertexHeatmap
{
    private static bool active = false;
    private static List<(Mesh mesh, Matrix4x4 mat, Color color)> draws = new();

    [MenuItem("VRC Studio Tools/Unconventional/Toggle Vertex Density Heatmap")]
    public static void Toggle()
    {
        active = !active;
        if (active) { Build(); SceneView.duringSceneGui += Draw; }
        else         { SceneView.duringSceneGui -= Draw; draws.Clear(); }
        SceneView.RepaintAll();
        Debug.Log($"[VRC Studio] Vertex Heatmap {(active ? "ON" : "OFF")}.");
    }

    private static void Build()
    {
        draws.Clear();
        var go = Selection.activeGameObject;
        if (go == null) return;

        var entries = new List<(Mesh m, Matrix4x4 mat)>();
        foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
            if (mf.sharedMesh != null)
                entries.Add((mf.sharedMesh, mf.transform.localToWorldMatrix));
        foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            if (smr.sharedMesh != null)
                entries.Add((smr.sharedMesh, smr.transform.localToWorldMatrix));

        if (entries.Count == 0) return;
        int maxV = 0;
        foreach (var (m, _) in entries) if (m.vertexCount > maxV) maxV = m.vertexCount;

        foreach (var (m, mat) in entries)
        {
            float t = maxV > 0 ? (float)m.vertexCount / maxV : 0f;
            Color c = Color.Lerp(Color.blue, Color.red, t);
            c.a = 0.6f;
            draws.Add((m, mat, c));
        }
    }

    private static void Draw(SceneView sv)
    {
        foreach (var (mesh, mat, color) in draws)
        {
            Handles.color = color;
            Handles.matrix = mat;
            Handles.DrawWireMesh(mesh);
        }
        Handles.matrix = Matrix4x4.identity;
    }
}
#endif`,
  },

  {
    id: 'animation-frame-locker',
    name: 'Animation Frame Locker',
    category: 'unconventional',
    description: 'Locks the Animator on the selected object to a specific frame without entering play mode — perfect for inspecting poses.',
    details: 'Uses Unity\'s AnimationMode API to sample an AnimationClip at a specific normalised time (0–1). Select an Animator with a valid controller, choose a clip, and drag the slider to scrub through the animation. The Scene view updates in real time. Exit the window or click Stop to restore the original pose. Great for fine-tuning blend shapes at a specific frame.',
    menuPath: 'VRC Studio Tools/Unconventional/Animation Frame Locker',
    filename: 'VRCStudio_AnimationFrameLocker.cs',
    tags: ['animation', 'preview', 'animator'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;

public class VRCStudio_AnimationFrameLocker : EditorWindow
{
    private Animator animator;
    private AnimationClip[] clips;
    private int clipIndex;
    private float normalizedTime;
    private bool isLocked;

    [MenuItem("VRC Studio Tools/Unconventional/Animation Frame Locker")]
    public static void Open()
    {
        var w = GetWindow<VRCStudio_AnimationFrameLocker>("Frame Locker");
        w.minSize = new Vector2(320, 200);
        w.LoadAnimator();
    }

    private void LoadAnimator()
    {
        animator = Selection.activeGameObject?.GetComponent<Animator>()
                ?? Selection.activeGameObject?.GetComponentInChildren<Animator>();
        clips = null;
        if (animator?.runtimeAnimatorController == null) return;
        clips = animator.runtimeAnimatorController.animationClips;
    }

    private void OnDestroy()
    {
        if (isLocked) { AnimationMode.StopAnimationMode(); isLocked = false; }
    }

    private void OnGUI()
    {
        if (GUILayout.Button("Reload Animator")) LoadAnimator();

        if (animator == null) { EditorGUILayout.HelpBox("Select a GameObject with an Animator.", MessageType.Info); return; }
        if (clips == null || clips.Length == 0) { EditorGUILayout.HelpBox("No clips found.", MessageType.Info); return; }

        string[] names = new string[clips.Length];
        for (int i = 0; i < clips.Length; i++) names[i] = clips[i].name;
        clipIndex = EditorGUILayout.Popup("Clip", clipIndex, names);

        normalizedTime = EditorGUILayout.Slider("Normalised Time", normalizedTime, 0f, 1f);

        EditorGUILayout.LabelField($"Frame: {Mathf.FloorToInt(normalizedTime * clips[clipIndex].frameRate * clips[clipIndex].length)}  /  {Mathf.FloorToInt(clips[clipIndex].frameRate * clips[clipIndex].length)}",
            EditorStyles.miniLabel);

        EditorGUILayout.BeginHorizontal();
        if (GUILayout.Button(isLocked ? "Update Pose" : "Lock to Frame", GUILayout.Height(28)))
        {
            if (!isLocked) { AnimationMode.StartAnimationMode(); isLocked = true; }
            AnimationMode.SampleAnimationClip(animator.gameObject, clips[clipIndex], normalizedTime * clips[clipIndex].length);
            SceneView.RepaintAll();
        }
        if (isLocked && GUILayout.Button("Stop", GUILayout.Width(60), GUILayout.Height(28)))
        {
            AnimationMode.StopAnimationMode(); isLocked = false;
        }
        EditorGUILayout.EndHorizontal();
    }
}
#endif`,
  },

  {
    id: 'component-relationship-graph',
    name: 'Component Relationship Graph',
    category: 'unconventional',
    description: 'Draws a live node graph of every component on the selected GameObject and the references between them.',
    details: 'Opens an EditorWindow that renders a simple node graph using GUI.Box and Handles.DrawBezier. Each component is a node; serialised fields that reference other components on the same object draw connecting bezier curves. Pan the graph by dragging the background. Useful for understanding complex setups like VRCFury or ModularAvatar chains without reading every inspector.',
    menuPath: 'VRC Studio Tools/Unconventional/Component Relationship Graph',
    filename: 'VRCStudio_ComponentGraph.cs',
    tags: ['graph', 'components', 'debug', 'visualise'],
    code: `#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;
using System.Reflection;

public class VRCStudio_ComponentGraph : EditorWindow
{
    private class Node { public Component comp; public Rect rect; }

    private List<Node> nodes = new();
    private List<(Node from, Node to)> edges = new();
    private Vector2 pan;
    private bool panning;
    private Vector2 panStart;

    [MenuItem("VRC Studio Tools/Unconventional/Component Relationship Graph")]
    public static void Open()
    {
        var w = GetWindow<VRCStudio_ComponentGraph>("Component Graph");
        w.minSize = new Vector2(500, 400);
        w.Build();
    }

    private void Build()
    {
        nodes.Clear(); edges.Clear();
        var go = Selection.activeGameObject;
        if (go == null) return;

        var comps = go.GetComponents<Component>();
        float x = 40, y = 40;
        foreach (var c in comps)
        {
            if (c == null) continue;
            nodes.Add(new Node { comp = c, rect = new Rect(x, y, 180, 40) });
            x += 200; if (x > 800) { x = 40; y += 70; }
        }

        var nodeMap = new Dictionary<Component, Node>();
        foreach (var n in nodes) nodeMap[n.comp] = n;

        foreach (var n in nodes)
        {
            foreach (var field in n.comp.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
            {
                if (!typeof(Component).IsAssignableFrom(field.FieldType)) continue;
                var val = field.GetValue(n.comp) as Component;
                if (val != null && nodeMap.TryGetValue(val, out var target))
                    edges.Add((n, target));
            }
        }
    }

    private void OnGUI()
    {
        var e = Event.current;
        if (e.type == EventType.MouseDown && e.button == 2) { panning = true; panStart = e.mousePosition; }
        if (e.type == EventType.MouseUp   && e.button == 2) panning = false;
        if (panning && e.type == EventType.MouseDrag) { pan += e.mousePosition - panStart; panStart = e.mousePosition; Repaint(); }

        if (GUILayout.Button("Refresh", GUILayout.Width(80))) Build();

        if (nodes.Count == 0) { EditorGUILayout.HelpBox("Select a GameObject.", MessageType.Info); return; }

        // Draw edges
        foreach (var (from, to) in edges)
        {
            var p1 = new Vector3(from.rect.center.x + pan.x, from.rect.center.y + pan.y);
            var p2 = new Vector3(to.rect.center.x   + pan.x, to.rect.center.y   + pan.y);
            Handles.DrawBezier(p1, p2, p1 + Vector3.right * 50, p2 - Vector3.right * 50,
                new Color(0.4f, 0.8f, 1f, 0.7f), null, 2f);
        }

        // Draw nodes
        foreach (var n in nodes)
        {
            var r = new Rect(n.rect.x + pan.x, n.rect.y + pan.y, n.rect.width, n.rect.height);
            GUI.Box(r, "");
            GUI.Label(new Rect(r.x + 6, r.y + 4, r.width - 12, r.height - 8),
                n.comp.GetType().Name, EditorStyles.miniLabel);
        }
    }
}
#endif`,
  },
];

export function downloadUnityTool(tool: UnityTool): void {
  const blob = new Blob([tool.code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = tool.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
