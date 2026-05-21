export interface ShaderInfo {
  id: string;
  name: string;
  description: string;
  category: 'toon' | 'effect' | 'utility' | 'transparent';
  color: string;
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Curated VRChat avatar shader set.
//
// Every lit shader samples baked light probes via ShadeSH9() for its ambient
// term. This is the critical detail most hand-written avatar shaders get
// wrong: VRChat worlds light avatars almost entirely through light probes
// (spherical harmonics), NOT the legacy UNITY_LIGHTMODEL_AMBIENT. A shader
// that only reads _LightColor0 / _WorldSpaceLightPos0 renders pure black in
// any world without a realtime directional light. ShadeSH9 fixes that, and
// the main-light direction is length-guarded so a world with no directional
// light can't produce a NaN.
// ─────────────────────────────────────────────────────────────────────────────

export const builtInShaders: ShaderInfo[] = [
  {
    id: 'toon',
    name: 'VRC Toon',
    description: 'Clean cel-shaded toon shader. Controllable shadow ramp, tinted shadow colour, and an HDR rim light. Samples light probes so it stays lit in any world.',
    category: 'toon',
    color: '#f472b6',
    code: `Shader "VRCStudio/Toon"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _ShadowColor ("Shadow Colour", Color) = (0.55, 0.5, 0.65, 1)
        _ShadowThreshold ("Shadow Threshold", Range(0, 1)) = 0.5
        _ShadowSoftness ("Shadow Softness", Range(0.001, 0.5)) = 0.08
        [HDR] _RimColor ("Rim Colour", Color) = (1, 1, 1, 1)
        _RimPower ("Rim Power", Range(0.5, 12)) = 4.0
        _RimIntensity ("Rim Intensity", Range(0, 2)) = 0.4
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            fixed4 _ShadowColor;
            float _ShadowThreshold;
            float _ShadowSoftness;
            fixed4 _RimColor;
            float _RimPower;
            float _RimIntensity;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);

                // Main directional light, guarded against no-light worlds.
                float3 L = _WorldSpaceLightPos0.xyz;
                float Llen = length(L);
                L = Llen > 1e-4 ? L / Llen : float3(0, 1, 0);

                // Half-Lambert so the terminator is easy to place.
                float ndl = dot(N, L) * 0.5 + 0.5;
                float toon = smoothstep(_ShadowThreshold - _ShadowSoftness,
                                        _ShadowThreshold + _ShadowSoftness, ndl);

                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;

                float3 ramp    = lerp(_ShadowColor.rgb, fixed3(1, 1, 1), toon);
                float3 direct  = ramp * _LightColor0.rgb;
                float3 ambient = ShadeSH9(float4(N, 1.0));   // light probes
                float3 lit     = tex.rgb * (direct + ambient);

                // Fresnel rim light.
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float rim = pow(1.0 - saturate(dot(V, N)), _RimPower);
                lit += _RimColor.rgb * rim * _RimIntensity;

                return fixed4(lit, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },

  {
    id: 'outline',
    name: 'VRC Outline',
    description: 'Toon shader with a clean inverted-hull outline. Adjustable outline width and colour, tinted shadow ramp on the lit base pass.',
    category: 'toon',
    color: '#818cf8',
    code: `Shader "VRCStudio/Outline"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _OutlineColor ("Outline Colour", Color) = (0.05, 0.05, 0.07, 1)
        _OutlineWidth ("Outline Width", Range(0, 0.03)) = 0.004
        _ShadowColor ("Shadow Colour", Color) = (0.55, 0.5, 0.65, 1)
        _ShadowThreshold ("Shadow Threshold", Range(0, 1)) = 0.5
        _ShadowSoftness ("Shadow Softness", Range(0.001, 0.5)) = 0.1
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        // Outline — inverted hull (expanded backfaces).
        Pass
        {
            Name "OUTLINE"
            Cull Front
            ZWrite On

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float _OutlineWidth;
            fixed4 _OutlineColor;

            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f { float4 pos : SV_POSITION; };

            v2f vert(appdata v)
            {
                v2f o;
                float3 n = normalize(v.normal);
                float4 p = v.vertex;
                p.xyz += n * _OutlineWidth;
                o.pos = UnityObjectToClipPos(p);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target { return _OutlineColor; }
            ENDCG
        }

        // Lit base pass.
        Pass
        {
            Name "BASE"
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            fixed4 _ShadowColor;
            float _ShadowThreshold;
            float _ShadowSoftness;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 L = _WorldSpaceLightPos0.xyz;
                float Llen = length(L);
                L = Llen > 1e-4 ? L / Llen : float3(0, 1, 0);

                float ndl = dot(N, L) * 0.5 + 0.5;
                float toon = smoothstep(_ShadowThreshold - _ShadowSoftness,
                                        _ShadowThreshold + _ShadowSoftness, ndl);

                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 direct  = lerp(_ShadowColor.rgb, fixed3(1, 1, 1), toon) * _LightColor0.rgb;
                float3 ambient = ShadeSH9(float4(N, 1.0));
                return fixed4(tex.rgb * (direct + ambient), tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },

  {
    id: 'flat',
    name: 'VRC Flat Color',
    description: 'Pure unlit shader — shows the albedo texture and tint exactly the same in every world, with no lighting. Bulletproof and never goes dark.',
    category: 'utility',
    color: '#4ade80',
    code: `Shader "VRCStudio/FlatColor"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Brightness ("Brightness", Range(0, 2)) = 1.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            float _Brightness;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed4 c = tex2D(_MainTex, i.uv) * _Color;
                c.rgb *= _Brightness;
                return c;
            }
            ENDCG
        }
    }
}`,
  },

  {
    id: 'matcap',
    name: 'VRC Matcap',
    description: 'Material-capture shading — bakes lighting and material into a sphere texture. Looks identical in every world and is a VRChat staple for chrome, gloss, and stylised looks.',
    category: 'utility',
    color: '#38bdf8',
    code: `Shader "VRCStudio/Matcap"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _MatCap ("MatCap (Sphere)", 2D) = "white" {}
        _MatCapStrength ("MatCap Strength", Range(0, 1)) = 1.0
        [HDR] _MatCapAdd ("MatCap Additive", Color) = (0, 0, 0, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            sampler2D _MatCap;
            fixed4 _Color;
            float _MatCapStrength;
            fixed4 _MatCapAdd;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 viewNormal : TEXCOORD1;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                float3 worldN = UnityObjectToWorldNormal(v.normal);
                o.viewNormal = mul((float3x3)UNITY_MATRIX_V, worldN);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;

                // MatCap UV from the view-space normal.
                float2 capUV = normalize(i.viewNormal).xy * 0.5 + 0.5;
                fixed3 cap = tex2D(_MatCap, capUV).rgb;

                fixed3 col = tex.rgb * lerp(fixed3(1, 1, 1), cap, _MatCapStrength);
                col += _MatCapAdd.rgb * cap;
                return fixed4(col, tex.a);
            }
            ENDCG
        }
    }
}`,
  },

  {
    id: 'rim-glow',
    name: 'VRC Rim Glow',
    description: 'Lit shader with a strong HDR fresnel rim light and optional pulsing. Great for energy beings, ghosts, and sci-fi avatars. Bloom-friendly.',
    category: 'effect',
    color: '#34d399',
    code: `Shader "VRCStudio/RimGlow"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        [HDR] _RimColor ("Rim Colour", Color) = (0.3, 1.4, 1.8, 1)
        _RimPower ("Rim Power", Range(0.5, 16)) = 5.0
        _RimIntensity ("Rim Intensity", Range(0, 4)) = 1.5
        _RimSpeed ("Rim Pulse Speed", Range(0, 8)) = 0.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            fixed4 _RimColor;
            float _RimPower;
            float _RimIntensity;
            float _RimSpeed;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 L = _WorldSpaceLightPos0.xyz;
                float Llen = length(L);
                L = Llen > 1e-4 ? L / Llen : float3(0, 1, 0);
                float ndl = max(0.0, dot(N, L));

                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 direct  = _LightColor0.rgb * ndl;
                float3 ambient = ShadeSH9(float4(N, 1.0));
                float3 col = tex.rgb * (direct + ambient);

                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float rim = pow(1.0 - saturate(dot(V, N)), _RimPower);
                float pulse = _RimSpeed > 0.0 ? (sin(_Time.y * _RimSpeed) * 0.5 + 0.5) : 1.0;
                col += _RimColor.rgb * rim * _RimIntensity * pulse;

                return fixed4(col, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },

  {
    id: 'emission',
    name: 'VRC Emission',
    description: 'Lit shader with an emission map, HDR emission colour and optional pulse. The lit base samples light probes; the emission adds on top for bloom.',
    category: 'effect',
    color: '#fbbf24',
    code: `Shader "VRCStudio/Emission"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _EmissionMap ("Emission Map", 2D) = "white" {}
        [HDR] _EmissionColor ("Emission Colour", Color) = (1, 0.6, 0.1, 1)
        _EmissionStrength ("Emission Strength", Range(0, 8)) = 2.0
        _PulseSpeed ("Pulse Speed", Range(0, 8)) = 0.0
        _PulseMin ("Pulse Minimum", Range(0, 1)) = 0.4
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            sampler2D _EmissionMap;
            fixed4 _Color;
            fixed4 _EmissionColor;
            float _EmissionStrength;
            float _PulseSpeed;
            float _PulseMin;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 L = _WorldSpaceLightPos0.xyz;
                float Llen = length(L);
                L = Llen > 1e-4 ? L / Llen : float3(0, 1, 0);
                float ndl = max(0.0, dot(N, L));

                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 direct  = _LightColor0.rgb * ndl;
                float3 ambient = ShadeSH9(float4(N, 1.0));
                float3 col = tex.rgb * (direct + ambient);

                float pulse = _PulseSpeed > 0.0
                    ? lerp(_PulseMin, 1.0, sin(_Time.y * _PulseSpeed) * 0.5 + 0.5)
                    : 1.0;
                float3 emis = tex2D(_EmissionMap, i.uv).rgb
                            * _EmissionColor.rgb * _EmissionStrength * pulse;
                col += emis;

                return fixed4(col, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },

  {
    id: 'holographic',
    name: 'VRC Holographic',
    description: 'Transparent hologram with a full-surface colour wash, glancing-angle edge boost and animated scanlines. Additive blend so it always glows — never goes dark.',
    category: 'effect',
    color: '#c084fc',
    code: `Shader "VRCStudio/Holographic"
{
    Properties
    {
        _MainTex ("Tint Texture", 2D) = "white" {}
        [HDR] _ColorA ("Holo Colour A", Color) = (0.1, 1.2, 1.6, 1)
        [HDR] _ColorB ("Holo Colour B", Color) = (1.4, 0.2, 1.4, 1)
        _ShiftSpeed ("Colour Shift Speed", Range(0, 5)) = 1.0
        _FresnelPower ("Edge Power", Range(0.5, 8)) = 2.5
        _EdgeBoost ("Edge Boost", Range(0, 4)) = 1.5
        _ScanScale ("Scanline Density", Range(20, 600)) = 180.0
        _ScanSpeed ("Scanline Speed", Range(0, 12)) = 3.0
        _ScanDepth ("Scanline Depth", Range(0, 1)) = 0.35
        _Opacity ("Opacity", Range(0, 1)) = 0.75
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha One
        ZWrite Off
        Cull Back

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _ColorA;
            fixed4 _ColorB;
            float _ShiftSpeed;
            float _FresnelPower;
            float _EdgeBoost;
            float _ScanScale;
            float _ScanSpeed;
            float _ScanDepth;
            float _Opacity;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float ndv = saturate(dot(N, V));

                // Colour wash across the whole surface, not just the rim.
                float t = ndv + _Time.y * _ShiftSpeed * 0.2;
                float mixv = sin(t * 3.14159) * 0.5 + 0.5;
                float3 holo = lerp(_ColorA.rgb, _ColorB.rgb, mixv);

                // Brighter at glancing angles.
                float fres = pow(1.0 - ndv, _FresnelPower);
                holo += holo * fres * _EdgeBoost;

                // Animated scanlines.
                float scan = sin(i.worldPos.y * _ScanScale - _Time.y * _ScanSpeed) * 0.5 + 0.5;
                holo *= lerp(1.0, scan, _ScanDepth);

                // Optional tint texture (white by default = no change).
                holo *= tex2D(_MainTex, i.uv).rgb;

                float alpha = saturate(_Opacity * (0.5 + fres));
                return fixed4(holo, alpha);
            }
            ENDCG
        }
    }
}`,
  },

  {
    id: 'glass',
    name: 'VRC Glass',
    description: 'Deluxe glass shader — real GrabPass refraction with chromatic aberration, cubemap reflections, normal-mapped surface, specular glint, thin-film iridescence, rim, inner glow and an animated wobble. 26 properties to dial in anything from clear crystal to oil-slick frost.',
    category: 'transparent',
    color: '#67e8f9',
    code: `Shader "VRCStudio/Glass"
{
    Properties
    {
        [Header(Surface)]
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Glass Tint (A = strength)", Color) = (0.85, 0.92, 1, 0.35)
        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale ("Normal Strength", Range(0, 3)) = 1.0

        [Header(Transparency)]
        _MinAlpha ("Face Opacity", Range(0, 1)) = 0.25
        _MaxAlpha ("Edge Opacity", Range(0, 1)) = 1.0

        [Header(Fresnel)]
        _FresnelPower ("Fresnel Power", Range(0.5, 12)) = 4.0
        _FresnelBias ("Fresnel Bias", Range(0, 1)) = 0.04

        [Header(Refraction)]
        _RefractionStrength ("Refraction Strength", Range(0, 0.3)) = 0.08
        _ChromaticAberration ("Chromatic Aberration", Range(0, 1)) = 0.25
        _Saturation ("Refraction Saturation", Range(0, 2)) = 1.0

        [Header(Reflection)]
        _ReflectionStrength ("Reflection Strength", Range(0, 1)) = 0.5
        _ReflectionTint ("Reflection Tint", Color) = (1, 1, 1, 1)

        [Header(Specular)]
        [HDR] _SpecularColor ("Specular Colour", Color) = (1, 1, 1, 1)
        _SpecPower ("Specular Sharpness", Range(1, 256)) = 64.0
        _SpecIntensity ("Specular Intensity", Range(0, 4)) = 1.5

        [Header(Iridescence)]
        [HDR] _IridA ("Iridescence A", Color) = (0.4, 0.1, 1.0, 1)
        [HDR] _IridB ("Iridescence B", Color) = (0.1, 1.0, 0.7, 1)
        _IridStrength ("Iridescence Strength", Range(0, 2)) = 0.3
        _IridScale ("Iridescence Scale", Range(0.5, 8)) = 3.0

        [Header(Rim)]
        [HDR] _RimColor ("Rim Colour", Color) = (0.8, 0.95, 1.2, 1)
        _RimIntensity ("Rim Intensity", Range(0, 4)) = 0.6

        [Header(Inner Glow)]
        [HDR] _GlowColor ("Inner Glow Colour", Color) = (0, 0, 0, 1)
        _GlowIntensity ("Inner Glow", Range(0, 4)) = 0.0

        [Header(Animated Wobble)]
        _WobbleSpeed ("Wobble Speed", Range(0, 10)) = 0.0
        _WobbleAmount ("Wobble Amount", Range(0, 0.1)) = 0.0
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }

        // Grab the screen behind the glass for true refraction. Shared
        // name => grabbed once per frame for every glass object.
        GrabPass { "_VRCGlassGrab" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            sampler2D _BumpMap;
            sampler2D _VRCGlassGrab;
            fixed4 _Color;
            float _BumpScale;
            float _MinAlpha;
            float _MaxAlpha;
            float _FresnelPower;
            float _FresnelBias;
            float _RefractionStrength;
            float _ChromaticAberration;
            float _Saturation;
            float _ReflectionStrength;
            fixed4 _ReflectionTint;
            fixed4 _SpecularColor;
            float _SpecPower;
            float _SpecIntensity;
            fixed4 _IridA;
            fixed4 _IridB;
            float _IridStrength;
            float _IridScale;
            fixed4 _RimColor;
            float _RimIntensity;
            fixed4 _GlowColor;
            float _GlowIntensity;
            float _WobbleSpeed;
            float _WobbleAmount;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 tangent : TANGENT;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
                float3 worldTangent : TEXCOORD3;
                float3 worldBitangent : TEXCOORD4;
                float4 grabPos : TEXCOORD5;
            };

            v2f vert(appdata v)
            {
                v2f o;

                // Animated wobble — displace along the surface normal.
                float4 pos = v.vertex;
                float wob = sin(_Time.y * _WobbleSpeed
                                + v.vertex.x * 8.0 + v.vertex.y * 6.0) * _WobbleAmount;
                pos.xyz += v.normal * wob;

                o.pos = UnityObjectToClipPos(pos);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldPos = mul(unity_ObjectToWorld, pos).xyz;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldTangent = normalize(mul((float3x3)unity_ObjectToWorld, v.tangent.xyz));
                o.worldBitangent = cross(o.worldNormal, o.worldTangent) * v.tangent.w;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                // --- Normal mapping ---
                float3 nTS = UnpackNormal(tex2D(_BumpMap, i.uv));
                nTS.xy *= _BumpScale;
                nTS = normalize(nTS);
                float3 N = normalize(
                    i.worldTangent   * nTS.x +
                    i.worldBitangent * nTS.y +
                    i.worldNormal    * nTS.z);

                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float ndv = saturate(dot(N, V));

                // --- Fresnel ---
                float fres = saturate(_FresnelBias
                    + (1.0 - _FresnelBias) * pow(1.0 - ndv, _FresnelPower));

                // --- Refraction (GrabPass) with chromatic aberration ---
                float4 gp = i.grabPos;
                gp.xy += N.xy * _RefractionStrength * gp.w;
                float ca = _ChromaticAberration * 0.03;
                float4 gpR = gp; gpR.xy += N.xy * ca * gp.w;
                float4 gpB = gp; gpB.xy -= N.xy * ca * gp.w;
                float3 refracted = float3(
                    tex2Dproj(_VRCGlassGrab, UNITY_PROJ_COORD(gpR)).r,
                    tex2Dproj(_VRCGlassGrab, UNITY_PROJ_COORD(gp)).g,
                    tex2Dproj(_VRCGlassGrab, UNITY_PROJ_COORD(gpB)).b);

                // Saturation of what's seen through the glass.
                float lum = dot(refracted, float3(0.299, 0.587, 0.114));
                refracted = lerp(float3(lum, lum, lum), refracted, _Saturation);

                // --- Tint ---
                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 col = refracted * lerp(float3(1, 1, 1), tex.rgb, _Color.a);

                // --- Cubemap reflection (world reflection probe) ---
                float3 refl = reflect(-V, N);
                float4 envRaw = UNITY_SAMPLE_TEXCUBE(unity_SpecCube0, refl);
                float3 env = DecodeHDR(envRaw, unity_SpecCube0_HDR);
                col += env * _ReflectionTint.rgb * _ReflectionStrength * fres;

                // --- Specular glint (Blinn-Phong) ---
                float3 L = _WorldSpaceLightPos0.xyz;
                float Llen = length(L);
                L = Llen > 1e-4 ? L / Llen : float3(0, 1, 0);
                float3 H = normalize(L + V);
                float spec = pow(saturate(dot(N, H)), _SpecPower);
                col += _SpecularColor.rgb * spec * _SpecIntensity * _LightColor0.rgb;

                // --- Thin-film iridescence ---
                float irMix = sin(ndv * _IridScale + _Time.y * 0.5) * 0.5 + 0.5;
                col += lerp(_IridA.rgb, _IridB.rgb, irMix) * _IridStrength * fres;

                // --- Rim ---
                col += _RimColor.rgb * pow(1.0 - ndv, _FresnelPower) * _RimIntensity;

                // --- Inner glow (strongest face-on) ---
                col += _GlowColor.rgb * _GlowIntensity * (1.0 - fres);

                float alpha = lerp(_MinAlpha, _MaxAlpha, fres);
                return fixed4(col, alpha);
            }
            ENDCG
        }
    }
    FallBack "Transparent/Diffuse"
}`,
  },
];

export function getShaderFileName(shader: ShaderInfo): string {
  return `${shader.name.replace(/\s+/g, '')}.shader`;
}

export function downloadShaderFile(shader: ShaderInfo): void {
  const blob = new Blob([shader.code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getShaderFileName(shader);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
