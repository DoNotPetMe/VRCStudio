export interface ShaderInfo {
  id: string;
  name: string;
  description: string;
  category: 'toon' | 'effect' | 'utility' | 'transparent';
  color: string;
  code: string;
}

export const builtInShaders: ShaderInfo[] = [
  {
    id: 'toon-cel',
    name: 'VRC Toon Cel',
    description: 'Classic cel-shaded toon shader with adjustable shadow steps, rim lighting, and outline support. Great for anime-style avatars.',
    category: 'toon',
    color: '#f472b6',
    code: `Shader "VRCStudio/ToonCel"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint Color", Color) = (1, 1, 1, 1)
        _ShadowColor ("Shadow Color", Color) = (0.4, 0.35, 0.5, 1)
        _ShadowThreshold ("Shadow Threshold", Range(0, 1)) = 0.5
        _ShadowSoftness ("Shadow Softness", Range(0, 0.5)) = 0.05
        _RimColor ("Rim Light Color", Color) = (1, 1, 1, 1)
        _RimPower ("Rim Power", Range(0.5, 8)) = 3.0
        _RimIntensity ("Rim Intensity", Range(0, 1)) = 0.3
        _OutlineWidth ("Outline Width", Range(0, 0.05)) = 0.003
        _OutlineColor ("Outline Color", Color) = (0.1, 0.1, 0.1, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        // Outline pass
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
            float4 _OutlineColor;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
            };

            v2f vert(appdata v)
            {
                v2f o;
                float3 norm = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                float4 pos = UnityObjectToClipPos(v.vertex);
                float2 offset = TransformViewToProjection(norm.xy);
                pos.xy += offset * _OutlineWidth * pos.w;
                o.pos = pos;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                return _OutlineColor;
            }
            ENDCG
        }

        // Main toon pass
        Pass
        {
            Name "TOON"
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            float4 _ShadowColor;
            float _ShadowThreshold;
            float _ShadowSoftness;
            float4 _RimColor;
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
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float3 lightDir = normalize(_WorldSpaceLightPos0.xyz);
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.worldPos);

                // Cel shading
                float NdotL = dot(normal, lightDir);
                float shadow = smoothstep(_ShadowThreshold - _ShadowSoftness, _ShadowThreshold + _ShadowSoftness, NdotL * 0.5 + 0.5);

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 lit = lerp(_ShadowColor.rgb, float3(1,1,1), shadow) * _LightColor0.rgb;

                // Rim lighting
                float rim = 1.0 - saturate(dot(viewDir, normal));
                rim = pow(rim, _RimPower) * _RimIntensity;
                float3 rimCol = _RimColor.rgb * rim;

                float atten = SHADOW_ATTENUATION(i);
                float3 final = tex.rgb * lit * atten + rimCol;

                return float4(final, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'outline-edge',
    name: 'VRC Edge Outline',
    description: 'Configurable outline shader using inverted hull method. Supports color, width, and distance fade for clean outlines at any distance.',
    category: 'toon',
    color: '#818cf8',
    code: `Shader "VRCStudio/EdgeOutline"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Color", Color) = (1, 1, 1, 1)
        _OutlineColor ("Outline Color", Color) = (0, 0, 0, 1)
        _OutlineWidth ("Outline Width", Range(0, 0.1)) = 0.005
        _OutlineFadeStart ("Outline Fade Start", Float) = 5.0
        _OutlineFadeEnd ("Outline Fade End", Float) = 15.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        // Outline pass - renders backfaces extruded along normals
        Pass
        {
            Name "OUTLINE"
            Cull Front
            ZWrite On
            ColorMask RGB

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float _OutlineWidth;
            float4 _OutlineColor;
            float _OutlineFadeStart;
            float _OutlineFadeEnd;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 color : COLOR;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float dist : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                float3 worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.dist = distance(_WorldSpaceCameraPos, worldPos);

                // Scale outline width with distance for consistent screen-space width
                float distScale = saturate(1.0 - (o.dist - _OutlineFadeStart) / max(_OutlineFadeEnd - _OutlineFadeStart, 0.001));
                float width = _OutlineWidth * distScale;

                float3 norm = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                float4 pos = UnityObjectToClipPos(v.vertex);
                float2 offset = TransformViewToProjection(norm.xy);
                pos.xy += offset * width * pos.w;
                o.pos = pos;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                return _OutlineColor;
            }
            ENDCG
        }

        // Base pass
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
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;

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
                SHADOW_COORDS(2)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float NdotL = max(0, dot(normal, normalize(_WorldSpaceLightPos0.xyz)));
                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float atten = SHADOW_ATTENUATION(i);
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;
                return float4(diffuse + ambient, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'glow-emission',
    name: 'VRC Glow Emission',
    description: 'Emission shader with pulsing glow effect. Supports emission map, pulse speed/intensity, and HDR color for bloom-compatible glowing.',
    category: 'effect',
    color: '#34d399',
    code: `Shader "VRCStudio/GlowEmission"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Base Color", Color) = (1, 1, 1, 1)
        _EmissionMap ("Emission Map", 2D) = "black" {}
        [HDR] _EmissionColor ("Emission Color", Color) = (0, 1, 1, 1)
        _EmissionIntensity ("Emission Intensity", Range(0, 10)) = 2.0
        _PulseSpeed ("Pulse Speed", Range(0, 10)) = 1.5
        _PulseMin ("Pulse Minimum", Range(0, 1)) = 0.3
        _PulseMax ("Pulse Maximum", Range(0, 1)) = 1.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            sampler2D _EmissionMap;
            float4 _EmissionColor;
            float _EmissionIntensity;
            float _PulseSpeed;
            float _PulseMin;
            float _PulseMax;

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
                SHADOW_COORDS(2)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float NdotL = max(0, dot(normal, normalize(_WorldSpaceLightPos0.xyz)));

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float atten = SHADOW_ATTENUATION(i);
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;

                // Pulsing emission
                float pulse = lerp(_PulseMin, _PulseMax, (sin(_Time.y * _PulseSpeed) * 0.5 + 0.5));
                float4 emission = tex2D(_EmissionMap, i.uv) * _EmissionColor * _EmissionIntensity * pulse;

                float3 final = diffuse + ambient + emission.rgb;
                return float4(final, tex.a);
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
    description: 'Iridescent holographic shader with view-angle color shifting, fresnel effect, and scanline overlay. Perfect for sci-fi and futuristic looks.',
    category: 'effect',
    color: '#c084fc',
    code: `Shader "VRCStudio/Holographic"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Base Tint", Color) = (0.1, 0.1, 0.15, 1)
        [HDR] _HoloColor1 ("Holo Color 1", Color) = (0, 2, 2, 1)
        [HDR] _HoloColor2 ("Holo Color 2", Color) = (2, 0, 2, 1)
        [HDR] _HoloColor3 ("Holo Color 3", Color) = (2, 2, 0, 1)
        _HoloSpeed ("Color Shift Speed", Range(0, 5)) = 1.0
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 2.5
        _FresnelIntensity ("Fresnel Intensity", Range(0, 3)) = 1.5
        _ScanlineScale ("Scanline Scale", Range(10, 500)) = 100.0
        _ScanlineSpeed ("Scanline Speed", Range(0, 10)) = 2.0
        _ScanlineIntensity ("Scanline Intensity", Range(0, 1)) = 0.15
        _Opacity ("Opacity", Range(0, 1)) = 0.85
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
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
            float4 _Color;
            float4 _HoloColor1;
            float4 _HoloColor2;
            float4 _HoloColor3;
            float _HoloSpeed;
            float _FresnelPower;
            float _FresnelIntensity;
            float _ScanlineScale;
            float _ScanlineSpeed;
            float _ScanlineIntensity;
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
                float4 screenPos : TEXCOORD3;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.screenPos = ComputeScreenPos(o.pos);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.worldPos);

                // Fresnel
                float fresnel = pow(1.0 - saturate(dot(viewDir, normal)), _FresnelPower) * _FresnelIntensity;

                // View-dependent color shifting
                float angle = dot(viewDir, normal);
                float shift = angle * 3.0 + _Time.y * _HoloSpeed;
                float3 holoColor = _HoloColor1.rgb * saturate(sin(shift) * 0.5 + 0.5)
                                 + _HoloColor2.rgb * saturate(sin(shift + 2.094) * 0.5 + 0.5)
                                 + _HoloColor3.rgb * saturate(sin(shift + 4.189) * 0.5 + 0.5);

                // Scanlines
                float2 screenUV = i.screenPos.xy / i.screenPos.w;
                float scanline = sin(screenUV.y * _ScanlineScale + _Time.y * _ScanlineSpeed) * 0.5 + 0.5;
                scanline = lerp(1.0, scanline, _ScanlineIntensity);

                float4 tex = tex2D(_MainTex, i.uv);
                float3 base = _Color.rgb * tex.rgb;
                float3 final = base + holoColor * fresnel;
                final *= scanline;

                return float4(final, _Opacity);
            }
            ENDCG
        }
    }
    FallBack "Transparent/Diffuse"
}`,
  },
  {
    id: 'dissolve',
    name: 'VRC Dissolve',
    description: 'Dissolve transition shader with noise-based edge burn effect. Control dissolve amount in real-time for dramatic appear/disappear effects.',
    category: 'effect',
    color: '#fb923c',
    code: `Shader "VRCStudio/Dissolve"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Color", Color) = (1, 1, 1, 1)
        _NoiseTex ("Dissolve Noise", 2D) = "white" {}
        _DissolveAmount ("Dissolve Amount", Range(0, 1)) = 0.0
        [HDR] _EdgeColor ("Edge Color", Color) = (3, 0.5, 0, 1)
        _EdgeWidth ("Edge Width", Range(0, 0.2)) = 0.05
        [HDR] _EdgeColor2 ("Edge Color Inner", Color) = (5, 3, 0, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Cull Off

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            sampler2D _NoiseTex;
            float4 _NoiseTex_ST;
            float _DissolveAmount;
            float4 _EdgeColor;
            float _EdgeWidth;
            float4 _EdgeColor2;

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
                float2 noiseUV : TEXCOORD1;
                float3 worldNormal : TEXCOORD2;
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.noiseUV = TRANSFORM_TEX(v.uv, _NoiseTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float noise = tex2D(_NoiseTex, i.noiseUV).r;

                // Clip pixels below dissolve threshold
                clip(noise - _DissolveAmount);

                float3 normal = normalize(i.worldNormal);
                float NdotL = max(0, dot(normal, normalize(_WorldSpaceLightPos0.xyz)));

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float atten = SHADOW_ATTENUATION(i);
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;
                float3 base = diffuse + ambient;

                // Edge glow
                float edge = 1.0 - smoothstep(0.0, _EdgeWidth, noise - _DissolveAmount);
                float innerEdge = 1.0 - smoothstep(0.0, _EdgeWidth * 0.5, noise - _DissolveAmount);
                float3 edgeCol = lerp(_EdgeColor.rgb, _EdgeColor2.rgb, innerEdge);
                base = lerp(base, edgeCol, edge);

                return float4(base, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'metallic-pbr',
    name: 'VRC Metallic PBR',
    description: 'Full physically-based rendering shader with metallic/smoothness workflow, normal maps, ambient occlusion, and emission support.',
    category: 'toon',
    color: '#94a3b8',
    code: `Shader "VRCStudio/MetallicPBR"
{
    Properties
    {
        _MainTex ("Albedo (RGB)", 2D) = "white" {}
        _Color ("Albedo Color", Color) = (1, 1, 1, 1)
        _MetallicGlossMap ("Metallic (R) Smoothness (A)", 2D) = "black" {}
        _Metallic ("Metallic", Range(0, 1)) = 0.0
        _Glossiness ("Smoothness", Range(0, 1)) = 0.5
        _BumpMap ("Normal Map", 2D) = "bump" {}
        _BumpScale ("Normal Scale", Float) = 1.0
        _OcclusionMap ("Occlusion", 2D) = "white" {}
        _OcclusionStrength ("Occlusion Strength", Range(0, 1)) = 1.0
        _EmissionMap ("Emission", 2D) = "black" {}
        [HDR] _EmissionColor ("Emission Color", Color) = (0, 0, 0, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        LOD 200

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0

        sampler2D _MainTex;
        sampler2D _MetallicGlossMap;
        sampler2D _BumpMap;
        sampler2D _OcclusionMap;
        sampler2D _EmissionMap;

        fixed4 _Color;
        half _Metallic;
        half _Glossiness;
        half _BumpScale;
        half _OcclusionStrength;
        fixed4 _EmissionColor;

        struct Input
        {
            float2 uv_MainTex;
            float2 uv_BumpMap;
        };

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            fixed4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
            o.Albedo = c.rgb;
            o.Alpha = c.a;

            fixed4 mg = tex2D(_MetallicGlossMap, IN.uv_MainTex);
            o.Metallic = mg.r * _Metallic;
            o.Smoothness = mg.a * _Glossiness;

            o.Normal = UnpackScaleNormal(tex2D(_BumpMap, IN.uv_BumpMap), _BumpScale);

            fixed occ = tex2D(_OcclusionMap, IN.uv_MainTex).g;
            o.Occlusion = lerp(1.0, occ, _OcclusionStrength);

            o.Emission = tex2D(_EmissionMap, IN.uv_MainTex).rgb * _EmissionColor.rgb;
        }
        ENDCG
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'anime-hair',
    name: 'VRC Anime Hair',
    description: 'Anisotropic hair shader with dual Kajiya-Kay specular highlights and a customisable color shift. Built for stylised anime-look hair.',
    category: 'toon',
    color: '#f9a8d4',
    code: `Shader "VRCStudio/AnimeHair"
{
    Properties
    {
        _MainTex ("Hair Texture", 2D) = "white" {}
        _Color ("Hair Color", Color) = (0.8, 0.3, 0.1, 1)
        _SpecularTex ("Specular Shift Map (RG)", 2D) = "grey" {}
        _Spec1Color ("Specular 1 Color", Color) = (1, 1, 1, 1)
        _Spec1Shift ("Spec 1 Shift", Range(-1, 1)) = 0.0
        _Spec1Size ("Spec 1 Exponent", Range(1, 512)) = 80.0
        _Spec1Intensity ("Spec 1 Intensity", Range(0, 2)) = 0.8
        _Spec2Color ("Specular 2 Color", Color) = (0.8, 0.6, 0.4, 1)
        _Spec2Shift ("Spec 2 Shift", Range(-1, 1)) = 0.1
        _Spec2Size ("Spec 2 Exponent", Range(1, 512)) = 16.0
        _Spec2Intensity ("Spec 2 Intensity", Range(0, 2)) = 0.5
        _ShadowColor ("Shadow Color", Color) = (0.4, 0.2, 0.1, 1)
        _ShadowThreshold ("Shadow Threshold", Range(0, 1)) = 0.5
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;     float4 _MainTex_ST;
            sampler2D _SpecularTex; float4 _SpecularTex_ST;
            float4 _Color, _ShadowColor;
            float4 _Spec1Color, _Spec2Color;
            float _Spec1Shift, _Spec1Size, _Spec1Intensity;
            float _Spec2Shift, _Spec2Size, _Spec2Intensity;
            float _ShadowThreshold;

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
                float3 T : TEXCOORD1;
                float3 B : TEXCOORD2;
                float3 N : TEXCOORD3;
                float3 worldPos : TEXCOORD4;
                SHADOW_COORDS(5)
            };

            float StrandSpecular(float3 T, float3 V, float3 L, float exponent)
            {
                float3 H = normalize(L + V);
                float TdotH = dot(T, H);
                float sinTH = sqrt(max(0, 1.0 - TdotH * TdotH));
                return pow(sinTH, exponent);
            }

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.N = UnityObjectToWorldNormal(v.normal);
                o.T = normalize(mul((float3x3)unity_ObjectToWorld, v.tangent.xyz));
                o.B = cross(o.N, o.T) * v.tangent.w;
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.N);
                float3 T = normalize(i.T);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);

                float4 shiftTex = tex2D(_SpecularTex, i.uv);
                float3 T1 = normalize(T + (shiftTex.r * 2 - 1 + _Spec1Shift) * N);
                float3 T2 = normalize(T + (shiftTex.g * 2 - 1 + _Spec2Shift) * N);

                float NdotL = dot(N, L) * 0.5 + 0.5;
                float shadow = smoothstep(_ShadowThreshold - 0.05, _ShadowThreshold + 0.05, NdotL);
                float atten = SHADOW_ATTENUATION(i);

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 diffuse = lerp(_ShadowColor.rgb, tex.rgb, shadow) * _LightColor0.rgb * atten;

                float spec1 = StrandSpecular(T1, V, L, _Spec1Size) * _Spec1Intensity;
                float spec2 = StrandSpecular(T2, V, L, _Spec2Size) * _Spec2Intensity;
                spec1 *= (NdotL > 0.1) ? 1.0 : 0.0;
                spec2 *= (NdotL > 0.1) ? 1.0 : 0.0;

                float3 final = diffuse + _Spec1Color.rgb * spec1 + _Spec2Color.rgb * spec2;
                return float4(final, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'subsurface-scatter',
    name: 'VRC Subsurface Scatter',
    description: 'Fake subsurface scattering for skin and organic materials. Produces warm light bleed-through on thin geometry without raytracing.',
    category: 'effect',
    color: '#fca5a5',
    code: `Shader "VRCStudio/SubsurfaceScatter"
{
    Properties
    {
        _MainTex ("Albedo", 2D) = "white" {}
        _Color ("Color", Color) = (1, 0.8, 0.7, 1)
        _SSSColor ("SSS Color", Color) = (1, 0.3, 0.1, 1)
        _SSSIntensity ("SSS Intensity", Range(0, 2)) = 0.8
        _SSSRadius ("SSS Radius", Range(0, 3)) = 1.0
        _SSSDistortion ("Light Distortion", Range(0, 1)) = 0.2
        _Smoothness ("Smoothness", Range(0, 1)) = 0.3
        _SpecColor2 ("Specular Color", Color) = (0.5, 0.5, 0.5, 1)
        _SpecPower ("Specular Power", Range(1, 256)) = 32.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex; float4 _MainTex_ST;
            float4 _Color, _SSSColor, _SpecColor2;
            float _SSSIntensity, _SSSRadius, _SSSDistortion;
            float _Smoothness, _SpecPower;

            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; };
            struct v2f
            {
                float4 pos:SV_POSITION; float2 uv:TEXCOORD0;
                float3 worldNormal:TEXCOORD1; float3 worldPos:TEXCOORD2;
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);

                float NdotL = max(0, dot(N, L));
                float atten = SHADOW_ATTENUATION(i);

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;

                // Fake SSS: light from behind the surface
                float3 sssLight = normalize(L + N * _SSSDistortion);
                float VdotSSS = pow(saturate(dot(V, -sssLight)), _SSSRadius) * _SSSIntensity;
                float3 sss = VdotSSS * _SSSColor.rgb * _LightColor0.rgb;

                // Specular
                float3 H = normalize(L + V);
                float NdotH = max(0, dot(N, H));
                float3 spec = _SpecColor2.rgb * pow(NdotH, _SpecPower) * _Smoothness * atten;

                float3 final = diffuse + ambient + sss + spec;
                return float4(final, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'force-field',
    name: 'VRC Force Field',
    description: 'Energy shield / force field with hexagonal grid, animated ripple on impact, and Fresnel edge glow. Great for sci-fi barrier effects.',
    category: 'effect',
    color: '#38bdf8',
    code: `Shader "VRCStudio/ForceField"
{
    Properties
    {
        [HDR] _FieldColor ("Field Color", Color) = (0, 2, 4, 1)
        _HexScale ("Hex Grid Scale", Range(5, 200)) = 40.0
        _HexSoftness ("Hex Line Softness", Range(0.01, 0.5)) = 0.08
        _HexBrightness ("Hex Brightness", Range(0, 2)) = 1.0
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 2.0
        _FresnelIntensity ("Fresnel Intensity", Range(0, 3)) = 2.0
        _PulseSpeed ("Pulse Speed", Range(0, 10)) = 2.0
        _PulseIntensity ("Pulse Intensity", Range(0, 1)) = 0.3
        _Opacity ("Base Opacity", Range(0, 1)) = 0.4
        _ScanlineSpeed ("Scanline Speed", Range(0, 5)) = 0.5
        _ScanlineIntensity ("Scanline Intensity", Range(0, 1)) = 0.08
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

            float4 _FieldColor;
            float _HexScale, _HexSoftness, _HexBrightness;
            float _FresnelPower, _FresnelIntensity;
            float _PulseSpeed, _PulseIntensity;
            float _Opacity, _ScanlineSpeed, _ScanlineIntensity;

            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; };
            struct v2f { float4 pos:SV_POSITION; float2 uv:TEXCOORD0; float3 worldNormal:TEXCOORD1; float3 worldPos:TEXCOORD2; float4 screenPos:TEXCOORD3; };

            // Hexagonal grid SDF
            float hexDist(float2 p)
            {
                p = abs(p);
                float c = dot(p, normalize(float2(1, 1.73)));
                return max(c, p.x);
            }

            float hexGrid(float2 uv, float scale)
            {
                float2 r = float2(1.0, 1.73);
                float2 h = r * 0.5;
                uv *= scale;
                float2 a = fmod(uv, r) - h;
                float2 b = fmod(uv - h, r) - h;
                float da = hexDist(a);
                float db = hexDist(b);
                return min(da, db);
            }

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.screenPos = ComputeScreenPos(o.pos);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);

                float fresnel = pow(1.0 - saturate(dot(V, N)), _FresnelPower) * _FresnelIntensity;

                float hex = hexGrid(i.uv, _HexScale);
                float hexLine = 1.0 - smoothstep(0.42 - _HexSoftness, 0.42, hex);
                hexLine *= _HexBrightness;

                float pulse = sin(_Time.y * _PulseSpeed) * 0.5 + 0.5;
                float pulseMask = hexLine * pulse * _PulseIntensity;

                float2 screenUV = i.screenPos.xy / i.screenPos.w;
                float scanline = sin(screenUV.y * 200.0 + _Time.y * _ScanlineSpeed) * 0.5 + 0.5;
                scanline *= _ScanlineIntensity;

                float brightness = hexLine + fresnel + pulseMask + scanline;
                float alpha = saturate(_Opacity + fresnel * 0.5 + hexLine * 0.3);

                return float4(_FieldColor.rgb * brightness, alpha);
            }
            ENDCG
        }
    }
}`,
  },
  {
    id: 'iridescent',
    name: 'VRC Iridescent',
    description: 'View-dependent iridescence shader mimicking butterfly wings, beetle shells, or oil films. Color shifts smoothly as the viewing angle changes.',
    category: 'effect',
    color: '#a78bfa',
    code: `Shader "VRCStudio/Iridescent"
{
    Properties
    {
        _MainTex ("Base Texture", 2D) = "white" {}
        _Color ("Base Color", Color) = (0.1, 0.1, 0.1, 1)
        [HDR] _IridColor1 ("Iridescence Color A", Color) = (2, 0.5, 0.1, 1)
        [HDR] _IridColor2 ("Iridescence Color B", Color) = (0.1, 0.5, 2, 1)
        [HDR] _IridColor3 ("Iridescence Color C", Color) = (0.1, 2, 0.5, 1)
        _IridStrength ("Iridescence Strength", Range(0, 2)) = 1.0
        _IridFrequency ("Color Frequency", Range(0.5, 20)) = 5.0
        _IridShift ("Color Shift", Range(0, 6.28)) = 0.0
        _FresnelBias ("Fresnel Bias", Range(0, 1)) = 0.0
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 2.0
        _Smoothness ("Smoothness", Range(0, 1)) = 0.8
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex; float4 _MainTex_ST;
            float4 _Color, _IridColor1, _IridColor2, _IridColor3;
            float _IridStrength, _IridFrequency, _IridShift;
            float _FresnelBias, _FresnelPower, _Smoothness;

            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; };
            struct v2f
            {
                float4 pos:SV_POSITION; float2 uv:TEXCOORD0;
                float3 worldNormal:TEXCOORD1; float3 worldPos:TEXCOORD2;
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o);
                return o;
            }

            float3 iridescence(float NdotV, float freq, float shift)
            {
                float t = NdotV * freq + shift;
                float r = saturate(sin(t) * 0.5 + 0.5);
                float g = saturate(sin(t + 2.094) * 0.5 + 0.5);
                float b = saturate(sin(t + 4.189) * 0.5 + 0.5);
                return float3(r, g, b);
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);

                float NdotL = max(0, dot(N, L));
                float NdotV = saturate(dot(N, V));
                float atten = SHADOW_ATTENUATION(i);

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;

                // Iridescence
                float3 iridRGB = iridescence(NdotV, _IridFrequency, _IridShift);
                float3 iridColor = iridRGB.r * _IridColor1.rgb
                                 + iridRGB.g * _IridColor2.rgb
                                 + iridRGB.b * _IridColor3.rgb;

                float fresnel = _FresnelBias + (1.0 - _FresnelBias) * pow(1.0 - NdotV, _FresnelPower);
                float3 irid = iridColor * fresnel * _IridStrength;

                // Specular
                float3 H = normalize(L + V);
                float spec = pow(max(0, dot(N, H)), 64.0 * _Smoothness) * _Smoothness * atten;

                float3 final = diffuse + ambient + irid + spec;
                return float4(final, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'wireframe-geo',
    name: 'VRC Wireframe',
    description: 'Geometry-shader based wireframe overlay with configurable wire color, fill color, and wire width. Shows polygon topology in-game.',
    category: 'utility',
    color: '#4ade80',
    code: `Shader "VRCStudio/Wireframe"
{
    Properties
    {
        [HDR] _WireColor ("Wire Color", Color) = (0, 2, 0.5, 1)
        _WireWidth ("Wire Width", Range(0, 1)) = 0.5
        _FillColor ("Fill Color", Color) = (0.05, 0.05, 0.08, 1)
        _FillOpacity ("Fill Opacity", Range(0, 1)) = 0.7
        _WireSmoothing ("Wire Smoothing", Range(0.001, 0.1)) = 0.01
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma geometry geom
            #pragma fragment frag
            #pragma target 4.0
            #include "UnityCG.cginc"

            float4 _WireColor;
            float _WireWidth;
            float4 _FillColor;
            float _FillOpacity;
            float _WireSmoothing;

            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; };

            struct v2g
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
            };

            struct g2f
            {
                float4 pos : SV_POSITION;
                float3 bary : TEXCOORD0;
            };

            v2g vert(appdata v)
            {
                v2g o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            [maxvertexcount(3)]
            void geom(triangle v2g IN[3], inout TriangleStream<g2f> stream)
            {
                g2f o;
                o.pos = IN[0].pos; o.bary = float3(1,0,0); stream.Append(o);
                o.pos = IN[1].pos; o.bary = float3(0,1,0); stream.Append(o);
                o.pos = IN[2].pos; o.bary = float3(0,0,1); stream.Append(o);
            }

            float edgeFactor(float3 bary)
            {
                float3 d = fwidth(bary);
                float3 a = smoothstep(d * (_WireWidth - _WireSmoothing), d * (_WireWidth + _WireSmoothing), bary);
                return min(min(a.x, a.y), a.z);
            }

            float4 frag(g2f i) : SV_Target
            {
                float wire = 1.0 - edgeFactor(i.bary);
                float3 col = lerp(_FillColor.rgb, _WireColor.rgb, wire);
                float alpha = lerp(_FillOpacity, 1.0, wire);
                return float4(col, alpha);
            }
            ENDCG
        }
    }
}`,
  },
  {
    id: 'water-surface',
    name: 'VRC Water Surface',
    description: 'Animated water surface with vertex displacement waves, Fresnel reflections, depth-based color, and foam edge detection.',
    category: 'transparent',
    color: '#7dd3fc',
    code: `Shader "VRCStudio/WaterSurface"
{
    Properties
    {
        _ShallowColor ("Shallow Color", Color) = (0.2, 0.8, 0.8, 0.6)
        _DeepColor ("Deep Color", Color) = (0.05, 0.15, 0.5, 0.9)
        _DepthFade ("Depth Fade Distance", Range(0.1, 10)) = 2.0
        _WaveSpeed ("Wave Speed", Range(0, 2)) = 0.5
        _WaveHeight ("Wave Height", Range(0, 0.5)) = 0.1
        _WaveFreq ("Wave Frequency", Range(1, 20)) = 6.0
        _NormalStrength ("Normal Strength", Range(0, 3)) = 1.0
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 3.0
        [HDR] _ReflectionColor ("Reflection Color", Color) = (1, 1, 1.2, 1)
        _ReflectionIntensity ("Reflection Intensity", Range(0, 2)) = 0.7
        _FoamColor ("Foam Color", Color) = (1, 1, 1, 1)
        _FoamThreshold ("Foam Threshold", Range(0, 1)) = 0.5
        _Smoothness ("Smoothness", Range(0, 1)) = 0.95
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off

        GrabPass { "_WaterBg" }

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            float4 _ShallowColor, _DeepColor;
            float _DepthFade, _WaveSpeed, _WaveHeight, _WaveFreq, _NormalStrength;
            float _FresnelPower, _ReflectionIntensity, _FoamThreshold, _Smoothness;
            float4 _ReflectionColor, _FoamColor;
            sampler2D _WaterBg;

            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; };
            struct v2f
            {
                float4 pos:SV_POSITION; float2 uv:TEXCOORD0;
                float3 worldNormal:TEXCOORD1; float3 worldPos:TEXCOORD2;
                float4 grabPos:TEXCOORD3; float waveAmt:TEXCOORD4;
            };

            float wave(float2 p, float t) { return sin(p.x * _WaveFreq + t) * cos(p.y * _WaveFreq * 0.7 + t * 0.8); }

            v2f vert(appdata v)
            {
                v2f o;
                float t = _Time.y * _WaveSpeed;
                float2 wp = mul(unity_ObjectToWorld, v.vertex).xz;
                float w = wave(wp, t) * _WaveHeight;
                v.vertex.y += w;
                o.waveAmt = w / max(_WaveHeight, 0.001);

                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float t = _Time.y * _WaveSpeed;
                float2 wp = i.worldPos.xz;
                float nx = wave(wp + float2(0.01, 0), t) - wave(wp, t);
                float nz = wave(wp + float2(0, 0.01), t) - wave(wp, t);
                N = normalize(N + float3(nx, 0, nz) * _NormalStrength * 50.0);

                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float NdotV = saturate(dot(N, V));
                float fresnel = pow(1.0 - NdotV, _FresnelPower);

                float2 distortion = N.xz * 0.03;
                float4 bg = tex2D(_WaterBg, (i.grabPos.xy + distortion * i.grabPos.w) / i.grabPos.w);
                float3 reflection = _ReflectionColor.rgb * fresnel * _ReflectionIntensity;

                float depth = saturate(i.worldPos.y * _DepthFade);
                float4 waterColor = lerp(_ShallowColor, _DeepColor, 1.0 - depth);
                float foam = smoothstep(_FoamThreshold, _FoamThreshold + 0.1, abs(i.waveAmt));
                waterColor.rgb = lerp(waterColor.rgb, _FoamColor.rgb, foam);

                float3 H = normalize(normalize(_WorldSpaceLightPos0.xyz) + V);
                float spec = pow(max(0, dot(N, H)), 256.0 * _Smoothness) * _Smoothness;

                float3 final = lerp(bg.rgb * waterColor.rgb, waterColor.rgb, waterColor.a * 0.5)
                             + reflection + spec;
                return float4(final, waterColor.a);
            }
            ENDCG
        }
    }
    FallBack "Transparent/Diffuse"
}`,
  },
  {
    id: 'fur-shells',
    name: 'VRC Fur Shells',
    description: 'Shell-based fur rendering using multiple offset passes. Configurable length, density, gravity droop, and color gradient from root to tip.',
    category: 'utility',
    color: '#fbbf24',
    code: `Shader "VRCStudio/FurShells"
{
    Properties
    {
        _MainTex ("Fur Albedo", 2D) = "white" {}
        _FurTex ("Fur Density Map (R=density)", 2D) = "white" {}
        _RootColor ("Root Color", Color) = (0.3, 0.2, 0.15, 1)
        _TipColor ("Tip Color", Color) = (0.85, 0.75, 0.6, 1)
        _FurLength ("Fur Length", Range(0, 0.2)) = 0.04
        _FurDensity ("Fur Density", Range(10, 200)) = 80.0
        _ShellCount ("Shell Count (approx)", Float) = 20.0
        _Gravity ("Gravity Strength", Range(0, 1)) = 0.3
        _GravityDir ("Gravity Direction", Vector) = (0, -1, 0, 0)
        _Cutoff ("Alpha Cutoff", Range(0, 1)) = 0.5
    }

    SubShader
    {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        Cull Off

        // Shell pass — rendered multiple times by scripting at different _ShellOffset values
        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            AlphaToMask On

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex; float4 _MainTex_ST;
            sampler2D _FurTex;  float4 _FurTex_ST;
            float4 _RootColor, _TipColor;
            float _FurLength, _FurDensity, _ShellCount, _Gravity, _Cutoff;
            float4 _GravityDir;
            // Set per-shell by MaterialPropertyBlock from script (or use _Time for animation demo)
            float _ShellOffset;

            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; };
            struct v2f
            {
                float4 pos:SV_POSITION; float2 uv:TEXCOORD0;
                float3 worldNormal:TEXCOORD1; float shell:TEXCOORD2;
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                // Use frac(_Time.y * 0.1) as shell offset demo; real use sets _ShellOffset per pass
                float t = saturate(_ShellOffset);
                float3 gravityOffset = _GravityDir.xyz * _Gravity * t * t;
                float3 offset = (v.normal + gravityOffset) * _FurLength * t;
                v.vertex.xyz += offset;

                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.shell = t;
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float NdotL = max(0, dot(N, normalize(_WorldSpaceLightPos0.xyz)));
                float atten = SHADOW_ATTENUATION(i);

                // Fur strand clipping from noise texture
                float4 furSample = tex2D(_FurTex, i.uv * _FurDensity / 100.0);
                float threshold = i.shell;
                clip(furSample.r - threshold - _Cutoff * 0.5);

                float4 albedo = lerp(_RootColor, _TipColor, i.shell);
                float3 diffuse = albedo.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = albedo.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;

                // Ambient occlusion darkens base shells
                float ao = lerp(0.2, 1.0, i.shell);
                return float4((diffuse + ambient) * ao, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Transparent/Cutout/Diffuse"
}`,
  },
  {
    id: 'glass-transparent',
    name: 'VRC Glass',
    description: 'Frosted glass shader with refraction-like distortion, tint color, and adjustable transparency. Ideal for visors, windows, and transparent accessories.',
    category: 'transparent',
    color: '#67e8f9',
    code: `Shader "VRCStudio/Glass"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Glass Tint", Color) = (0.8, 0.9, 1, 0.3)
        _Opacity ("Opacity", Range(0, 1)) = 0.3
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 3.0
        _FresnelOpacity ("Fresnel Opacity Boost", Range(0, 1)) = 0.6
        [HDR] _ReflectionColor ("Reflection Color", Color) = (0.8, 0.85, 1, 1)
        _ReflectionIntensity ("Reflection Intensity", Range(0, 2)) = 0.5
        _Smoothness ("Smoothness", Range(0, 1)) = 0.9
        _DistortionStrength ("Surface Distortion", Range(0, 0.1)) = 0.02
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Back

        // Grab pass for refraction-like distortion
        GrabPass { "_GrabTex" }

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            float _Opacity;
            float _FresnelPower;
            float _FresnelOpacity;
            float4 _ReflectionColor;
            float _ReflectionIntensity;
            float _Smoothness;
            float _DistortionStrength;

            sampler2D _GrabTex;
            float4 _GrabTex_TexelSize;

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
                float4 grabPos : TEXCOORD3;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.worldPos);

                // Fresnel
                float fresnel = pow(1.0 - saturate(dot(viewDir, normal)), _FresnelPower);

                // Distortion
                float2 distortion = normal.xy * _DistortionStrength;
                float2 grabUV = (i.grabPos.xy + distortion * i.grabPos.w) / i.grabPos.w;
                float4 grabbed = tex2D(_GrabTex, grabUV);

                // Fake reflection using view direction
                float3 reflDir = reflect(-viewDir, normal);
                float reflAmount = pow(saturate(reflDir.y * 0.5 + 0.5), 2.0) * _ReflectionIntensity;
                float3 refl = _ReflectionColor.rgb * reflAmount * _Smoothness;

                // Combine
                float4 tex = tex2D(_MainTex, i.uv);
                float3 tint = _Color.rgb * tex.rgb;
                float alpha = lerp(_Opacity, _Opacity + _FresnelOpacity, fresnel);
                alpha = saturate(alpha);

                float3 final = lerp(grabbed.rgb * tint, tint + refl, alpha);

                return float4(final, alpha);
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
