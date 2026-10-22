// The smoke of FlyingButton from React Bits
// (https://reactbits.dev/micro/flying-button), by David Haz, MIT + Commons
// Clause (its notice below; used here as part of the game, as the licence
// allows): its jets and the smoke they blast out, a fluid simulation on the
// GPU (stable fluids: the smoke's velocity advected, pushed by the jets, the
// floor's splash, buoyancy and curl, then made incompressible; the smoke
// itself carried along, lit and shaded as it's drawn). Here it's the launch
// bay's pad (components/bay/PadSmoke.tsx), its jets firing down under its rim
// and the smoke billowing out over the floor; there's no button flying in it,
// so the jets are given straight in. The shaders and the simulation are
// upstream's (createSim); JetSmoke drives them.
//
// Copyright (c) 2026 David Haz. Permission is hereby granted, free of charge,
// to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy, modify,
// merge, publish, and distribute the Software as part of an application,
// website, or product, subject to the following conditions: the above
// copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software. Commons Clause
// Restriction: you may use this Software, including for any commercial
// purpose, so long as you do not sell, sublicense, or redistribute the
// components themselves, whether alone, in a bundle, or as a ported version.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

const MAX_JETS = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rgb = (hex?: string): [number, number, number] => {
  const h = String(hex || '').replace('#', '');
  const v = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(v, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`;

const JETS = `
uniform vec4 uJetA[${MAX_JETS}];
uniform vec4 uJetB[${MAX_JETS}];
uniform float uJetBend[${MAX_JETS}];
float jetWeight(vec2 p, vec4 a, vec4 b, out float along) {
  vec2 rel = p - a.xy;
  along = dot(rel, a.zw);
  vec2 off = rel - a.zw * clamp(along, 0.0, b.z);
  return exp(-dot(off, off) / (b.y * b.y)) * smoothstep(-b.y, 0.0, along);
}
`;

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const ADVECT = `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uWorld;
uniform float uDt;
uniform float uKeep;
void main() {
  vec2 v = textureLod(uVelocity, vUv, 0.0).xy;
  if (!(abs(v.x) < 4000.0 && abs(v.y) < 4000.0)) v = vec2(0.0);
  vec4 c = textureLod(uSource, vUv - uDt * v / uWorld, 0.0) * uKeep;
  outColor = all(lessThan(abs(c), vec4(1e4))) ? c : vec4(0.0);
}`;

const FORCE = `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform vec2 uWorld;
uniform float uDt;
uniform float uBuoyancy;
uniform float uLift;
uniform float uDamping;
uniform float uSpread;
uniform float uSplash;
uniform float uFriction;
uniform float uWind;
uniform vec3 uKick;
uniform vec4 uCraft;
uniform vec4 uCraftMotion;
uniform vec2 uTurb;
uniform float uTime;
uniform float uObstacle;
${JETS}
${NOISE}
vec2 curlNoise(vec2 p) {
  float e = 0.35;
  float a = noise(p + vec2(0.0, e));
  float b = noise(p - vec2(0.0, e));
  float c = noise(p + vec2(e, 0.0));
  float d = noise(p - vec2(e, 0.0));
  return vec2(a - b, d - c) / (2.0 * e);
}
void main() {
  vec2 p = vUv * uWorld;
  vec2 v = textureLod(uVelocity, vUv, 0.0).xy;
  vec2 d = textureLod(uDye, vUv, 1.0).xy;
  float smokeHere = smoothstep(0.02, 0.4, d.x + d.y);
  vec2 tq = p / uTurb.y;
  vec2 turb = curlNoise(tq + vec2(uTime * 0.21, -uTime * 0.37)) + 0.5 * curlNoise(tq * 2.3 + vec2(-uTime * 0.53, uTime * 0.29) + 7.0);
  v += turb * uTurb.x * smokeHere * uDt;
  v.y += (uBuoyancy * d.y + uLift * d.x) * uDt;
  v /= 1.0 + uDamping * uDt;
  v.x /= 1.0 + uFriction * exp(-p.y / 18.0) * uDt;
  v.x += (uWind - v.x) * (1.0 - exp(-0.35 * uDt)) * smoothstep(0.0, 60.0, p.y);
  for (int i = 0; i < ${MAX_JETS}; i++) {
    vec4 b = uJetB[i];
    if (b.w <= 0.0) continue;
    vec4 a = uJetA[i];
    vec2 rel = p - a.xy;
    float along = dot(rel, a.zw);
    float across = dot(rel, vec2(-a.w, a.z));
    float reach = a.w < -0.2 ? a.y / -a.w : max(b.z, 1.0);
    float bn = clamp(along / max(reach, 1.0), 0.0, 1.0);
    across -= uJetBend[i] * bn * bn;
    vec2 dir = normalize(a.zw + vec2(-a.w, a.z) * (2.0 * uJetBend[i] * bn / max(reach, 1.0)));
    float sN = clamp(along / max(b.z, 1.0), 0.0, 1.0);
    float R = b.y + uSpread * clamp(along, 0.0, b.z);
    float wr = exp(-across * across / (R * R));
    float wa = smoothstep(-b.y, 0.0, along) * (1.0 - smoothstep(0.55, 1.0, sN));
    float rate = mix(46.0, 7.0, sN);
    float w = (1.0 - exp(-uDt * rate)) * wr * wa * clamp(b.w * 3.0, 0.0, 1.0);
    float U = b.x * sqrt(b.y / R);
    v = mix(v, dir * U, w);
  }
  for (int i = 0; i < ${MAX_JETS}; i++) {
    vec4 b = uJetB[i];
    if (b.w <= 0.0) continue;
    vec4 a = uJetA[i];
    if (a.w > -0.2) continue;
    float reach = a.y / -a.w;
    float gx = a.x + a.z * reach - a.w * uJetBend[i];
    float near = exp(-reach / uKick.x);
    float sx = uKick.y + reach * 0.25;
    float kx = (p.x - gx) / (sx * 1.6);
    float ky = p.y / (uKick.z * 1.5);
    float k = exp(-kx * kx - ky * ky);
    float side = clamp((p.x - gx) / sx, -1.0, 1.0);
    v += uDt * uSplash * b.w * near * k * vec2(side * 0.7, 0.9);
  }
  vec2 q = p - uCraft.xy;
  float c = cos(uCraftMotion.z);
  float s = sin(uCraftMotion.z);
  vec2 lq = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  vec2 e = abs(lq) - uCraft.zw + uCraft.w;
  float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - uCraft.w;
  float inside = smoothstep(2.0, -2.0, sd) * uObstacle;
  vec2 cv = uCraftMotion.xy + uCraftMotion.w * vec2(-q.y, q.x);
  v = mix(v, cv, inside);
  float speed = length(v);
  if (!(speed < 1e5)) v = vec2(0.0);
  else if (speed > 2600.0) v *= 2600.0 / speed;
  outColor = vec4(v, 0.0, 1.0);
}`;

const CURL = `${HEAD}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = textureLod(uVelocity, vUv - vec2(uTexel.x, 0.0), 0.0).y;
  float R = textureLod(uVelocity, vUv + vec2(uTexel.x, 0.0), 0.0).y;
  float B = textureLod(uVelocity, vUv - vec2(0.0, uTexel.y), 0.0).x;
  float T = textureLod(uVelocity, vUv + vec2(0.0, uTexel.y), 0.0).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uDt;
void main() {
  float L = textureLod(uCurl, vUv - vec2(uTexel.x, 0.0), 0.0).x;
  float R = textureLod(uCurl, vUv + vec2(uTexel.x, 0.0), 0.0).x;
  float B = textureLod(uCurl, vUv - vec2(0.0, uTexel.y), 0.0).x;
  float T = textureLod(uCurl, vUv + vec2(0.0, uTexel.y), 0.0).x;
  float C = textureLod(uCurl, vUv, 0.0).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uStrength * C;
  f.y *= -1.0;
  vec2 v = textureLod(uVelocity, vUv, 0.0).xy + f * uDt;
  if (!(abs(v.x) < 4000.0 && abs(v.y) < 4000.0)) v = vec2(0.0);
  outColor = vec4(v, 0.0, 1.0);
}`;

const DIVERGENCE = `${HEAD}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 C = textureLod(uVelocity, vUv, 0.0).xy;
  float L = textureLod(uVelocity, vUv - vec2(uTexel.x, 0.0), 0.0).x;
  float R = textureLod(uVelocity, vUv + vec2(uTexel.x, 0.0), 0.0).x;
  float B = textureLod(uVelocity, vUv - vec2(0.0, uTexel.y), 0.0).y;
  float T = textureLod(uVelocity, vUv + vec2(0.0, uTexel.y), 0.0).y;
  if (vUv.y - uTexel.y < 0.0) B = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const PRESSURE_SAMPLE = `
float pressureAt(sampler2D tex, vec2 uv, vec2 texel, float c, int side) {
  if (side == 0 && uv.x - texel.x < 0.0) return 0.0;
  if (side == 1 && uv.x + texel.x > 1.0) return 0.0;
  if (side == 2 && uv.y - texel.y < 0.0) return c;
  if (side == 3 && uv.y + texel.y > 1.0) return 0.0;
  vec2 o = side == 0 ? vec2(-texel.x, 0.0) : side == 1 ? vec2(texel.x, 0.0) : side == 2 ? vec2(0.0, -texel.y) : vec2(0.0, texel.y);
  return textureLod(tex, uv + o, 0.0).x;
}
`;

const PRESSURE = `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
${PRESSURE_SAMPLE}
void main() {
  float C = textureLod(uPressure, vUv, 0.0).x;
  float L = pressureAt(uPressure, vUv, uTexel, C, 0);
  float R = pressureAt(uPressure, vUv, uTexel, C, 1);
  float B = pressureAt(uPressure, vUv, uTexel, C, 2);
  float T = pressureAt(uPressure, vUv, uTexel, C, 3);
  float div = textureLod(uDivergence, vUv, 0.0).x;
  float pr = (L + R + B + T - div) * 0.25;
  outColor = vec4(abs(pr) < 1e6 ? pr : 0.0, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `${HEAD}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
${PRESSURE_SAMPLE}
void main() {
  float C = textureLod(uPressure, vUv, 0.0).x;
  float L = pressureAt(uPressure, vUv, uTexel, C, 0);
  float R = pressureAt(uPressure, vUv, uTexel, C, 1);
  float B = pressureAt(uPressure, vUv, uTexel, C, 2);
  float T = pressureAt(uPressure, vUv, uTexel, C, 3);
  vec2 v = textureLod(uVelocity, vUv, 0.0).xy - 0.5 * vec2(R - L, T - B);
  if (vUv.y - uTexel.y < 0.0) v.y = max(v.y, 0.0);
  if (!(abs(v.x) < 4000.0 && abs(v.y) < 4000.0)) v = vec2(0.0);
  outColor = vec4(v, 0.0, 1.0);
}`;

const BLUR = `${HEAD}
uniform sampler2D uSource;
uniform vec2 uStep;
void main() {
  vec2 c = textureLod(uSource, vUv, 0.0).xy * 0.2270270;
  c += textureLod(uSource, vUv + uStep * 1.3846154, 0.0).xy * 0.3162162;
  c += textureLod(uSource, vUv - uStep * 1.3846154, 0.0).xy * 0.3162162;
  c += textureLod(uSource, vUv + uStep * 3.2307692, 0.0).xy * 0.0702703;
  c += textureLod(uSource, vUv - uStep * 3.2307692, 0.0).xy * 0.0702703;
  outColor = vec4(c, 0.0, 1.0);
}`;

const SCALE = `${HEAD}
uniform sampler2D uSource;
uniform float uScale;
void main() {
  outColor = textureLod(uSource, vUv, 0.0) * uScale;
}`;

const DYE = `${HEAD}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uWorld;
uniform float uDt;
uniform vec2 uKeep;
uniform vec4 uRate;
uniform vec4 uCol;
uniform vec3 uKick;
uniform float uDisperse;
uniform float uDispV;
uniform vec4 uCraft;
uniform vec4 uCraftMotion;
uniform vec2 uGap;
uniform float uJetX[${MAX_JETS}];
uniform float uJetN;
uniform float uFloor;
uniform float uTime;
${JETS}
${NOISE}
void main() {
  vec2 v = textureLod(uVelocity, vUv, 0.0).xy;
  vec2 val = textureLod(uSource, vUv - uDt * v / uWorld, 0.0).xy * uKeep;
  val.x *= exp(-uDisperse * max(length(v) - uDispV, 0.0) * 0.01 * uDt);
  {
    vec2 q = vUv * uWorld - uCraft.xy;
    float c = cos(uCraftMotion.z);
    float sn = sin(uCraftMotion.z);
    vec2 lq = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y);
    float belly = uCraft.y - uCraft.w - 7.0;
    float depth = 0.68 * belly * smoothstep(40.0, 110.0, belly);
    float below = -lq.y - uCraft.w;
    float wy = smoothstep(-4.0, 6.0, below) * (1.0 - smoothstep(depth * 0.7, depth, below));
    float nearest = 1e4;
    float outer = 0.0;
    for (int k = 0; k < ${MAX_JETS}; k++) {
      if (float(k) >= uJetN) break;
      nearest = min(nearest, abs(lq.x - uJetX[k]));
      outer = max(outer, abs(uJetX[k]));
    }
    float wx = uGap.x > 1.0 ? smoothstep(uGap.x * 0.22, uGap.x * 0.4, nearest) * (1.0 - smoothstep(outer - uGap.x * 0.1, outer, abs(lq.x))) : 0.0;
    val.x *= exp(-uGap.y * wx * wy * uDt);
  }
  val.x = max(val.x - uFloor * uDt, 0.0);
  vec2 p = vUv * uWorld;
  for (int i = 0; i < ${MAX_JETS}; i++) {
    vec4 jb = uJetB[i];
    if (jb.w <= 0.0) continue;
    vec4 ja = uJetA[i];
    vec2 rel = p - ja.xy;
    float along = dot(rel, ja.zw);
    float across = dot(rel, vec2(-ja.w, ja.z));
    vec2 off = rel - ja.zw * clamp(along, 0.0, 6.0);
    float wn = exp(-dot(off, off) / (jb.y * jb.y)) * smoothstep(-jb.y, 0.0, along);
    float pulse = 0.6 + 0.8 * noise(vec2(uTime * 6.0 + float(i) * 13.1, along * 0.06 + float(i)));
    val.x += uRate.x * jb.w * wn * pulse * uDt;
    val.y += uRate.y * jb.w * wn * uDt;
    float reach = ja.w < -0.2 ? ja.y / -ja.w : 1e4;
    float sN = clamp(along / max(reach, 1.0), 0.0, 1.0);
    across -= uJetBend[i] * sN * sN;
    float R = uCol.y + uCol.x * clamp(along, 0.0, reach);
    float wc = exp(-across * across / (R * R)) * smoothstep(0.45, 0.8, sN) * (1.0 - step(reach + 2.0, along));
    float grain = 0.45 + 1.1 * noise(vec2(across * 0.12 + float(i) * 3.0, along * 0.05 - uTime * 9.0));
    val.x += uRate.w * jb.w * wc * grain * uDt;
    val.y += uRate.y * 0.25 * jb.w * wc * uDt;
    if (reach < 1e3) {
      float gx = ja.x + ja.z * reach - ja.w * uJetBend[i];
      float near = exp(-reach / uKick.x);
      float spread = uKick.y + reach * 0.25;
      float kx = (p.x - gx) / spread;
      float ky = p.y / uKick.z;
      float k = exp(-kx * kx - ky * ky);
      float g2 = 0.5 + noise(vec2(p.x * 0.08, uTime * 4.0 + float(i) * 9.0));
      val.x += uRate.z * jb.w * near * k * g2 * uDt;
      val.y += uRate.y * 0.4 * jb.w * near * k * uDt;
    }
  }
  if (!(val.x < 1e3 && val.y < 1e3 && val.x >= 0.0 && val.y >= 0.0)) val = vec2(0.0);
  outColor = vec4(val, 0.0, 1.0);
}`;

const RENDER = `${HEAD}
uniform sampler2D uDye;
uniform vec2 uWorld;
uniform vec2 uDyeSize;
uniform float uTime;
uniform float uLightTheme;
uniform vec3 uSmoke;
uniform vec3 uShade;
uniform vec3 uThrust;
uniform vec4 uLook;
uniform vec4 uLook2;
uniform vec4 uLook3;
uniform vec4 uCol;
uniform float uGamma;
uniform float uTone;
uniform vec3 uLight2;
uniform float uThreshold;
uniform float uScale;
uniform vec4 uCraft;
uniform vec4 uCraftMotion;
${JETS}
${NOISE}
float dens(vec2 p, float lod) {
  return textureLod(uDye, p / uWorld, lod).x;
}
float hash1(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}
float fbm2(vec2 p) {
  return noise(p) * 0.65 + noise(p * 2.13 + 17.0) * 0.35;
}
float flowNoise(float q, float xn, float t, float id, float rate) {
  float c = t / 0.7;
  float f1 = fract(c);
  float f2 = fract(c + 0.5);
  float k1 = floor(c);
  float k2 = floor(c + 0.5);
  float n1 = fbm2(vec2(q - f1 * 0.7 * rate + hash1(k1 + id * 7.0) * 41.0, xn * 1.15 + id * 3.7));
  float n2 = fbm2(vec2(q - f2 * 0.7 * rate + hash1(k2 + id * 7.0 + 0.5) * 41.0, xn * 1.15 + id * 3.7 + 11.0));
  float w1 = 1.0 - abs(2.0 * f1 - 1.0);
  float w2 = 1.0 - w1;
  return 0.5 + (n1 * w1 + n2 * w2 - 0.5) / sqrt(w1 * w1 + w2 * w2);
}
float column(vec2 p, vec4 a, float str, float id, float t, float bend, out float xn, out float s) {
  vec2 rel = p - a.xy;
  s = dot(rel, a.zw);
  float x = dot(rel, vec2(-a.w, a.z));
  float S = a.w < -0.2 ? a.y / -a.w : 1e4;
  float bn = clamp(s / max(S, 1.0), 0.0, 1.0);
  x -= bend * bn * bn;
  xn = 0.0;
  if (s < -4.0 || s > S + 6.0) return 0.0;
  float sc = clamp(s, 0.0, S);
  float R = uCol.y + uCol.x * sc;
  float flare = smoothstep(S - 32.0 * uScale, S + 2.0, sc);
  R *= 1.0 + 1.3 * flare * flare;
  xn = x / R;
  if (abs(xn) > 3.2) return 0.0;
  float q = log(1.0 + 0.22 * sc / (9.0 * uScale)) / 0.22;
  float lam = 9.0 * uScale + 0.22 * sc;
  float U = uCol.w * sqrt(str) * sqrt(uCol.y / R);
  float n = flowNoise(q, xn, t, id, U / lam);
  float amp = 0.12 + 0.5 * smoothstep(4.0, 70.0, sc);
  float u = abs(xn) * (1.0 - amp * (n - 0.5) * 1.8);
  float prof = exp(-u * u * 1.7);
  float dil = pow(uCol.y / R, 0.5);
  float onset = smoothstep(2.0 * uScale, 16.0 * uScale, s);
  float tail = 1.0 - smoothstep(S - 2.0, S + 6.0, s);
  return uCol.z * str * prof * dil * onset * tail * (0.7 + 0.6 * n);
}
float shape(vec2 p, float lod) {
  return log(1.0 + 3.0 * dens(p, lod));
}
void main() {
  vec2 p = vUv * uWorld;
  float texel = uWorld.x / uDyeSize.x;
  float D = textureLod(uDye, vUv, uLook.w).x;
  float heat = textureLod(uDye, vUv, 0.5).y;

  float e = uLook3.x;
  float lodN = max(log2(e / texel), 0.0) + uLook3.y;
  vec2 g = vec2(shape(p + vec2(e, 0.0), lodN) - shape(p - vec2(e, 0.0), lodN), shape(p + vec2(0.0, e), lodN) - shape(p - vec2(0.0, e), lodN)) / (2.0 * e);
  float e2 = e * 3.0;
  float lodB = lodN + 1.6;
  vec2 g2 = vec2(shape(p + vec2(e2, 0.0), lodB) - shape(p - vec2(e2, 0.0), lodB), shape(p + vec2(0.0, e2), lodB) - shape(p - vec2(0.0, e2), lodB)) / (2.0 * e2);
  vec3 nS = normalize(vec3(-(g * uLook3.z + g2 * uLook3.w) * uLook.y, 1.0));

  float colD = 0.0;
  vec2 colN = vec2(0.0);
  float colHot = 0.0;
  float colNear = 0.0;
  for (int i = 0; i < ${MAX_JETS}; i++) {
    vec4 jb = uJetB[i];
    if (jb.w <= 0.0) continue;
    vec4 ja = uJetA[i];
    float xn;
    float sa;
    float cd = column(p, ja, min(jb.w, 1.6), float(i), uTime, uJetBend[i], xn, sa);
    colD += cd;
    colN += vec2(-ja.w, ja.z) * clamp(xn, -1.6, 1.6) * cd;
    colHot += cd * exp(-max(sa, 0.0) / 45.0);
    colNear += cd * exp(-max(sa, 0.0) / 16.0);
  }
  float Dt = D + colD;
  float alpha = 1.0 - exp(-uLook.x * pow(max(D - uThreshold, 0.0) + colD, uGamma));
  vec2 cn = colD > 1e-5 ? colN / colD : vec2(0.0);
  vec3 nC = normalize(vec3(cn * 0.85, sqrt(max(1.0 - dot(cn, cn) * 0.72, 0.08))));
  float wC = colD / max(Dt, 1e-5);
  vec3 n = normalize(mix(nS, nC, wC));
  vec3 L = normalize(vec3(-0.38, 0.6, 0.72));
  float diff = clamp((dot(n, L) + uLook2.z) / (1.0 + uLook2.z), 0.0, 1.0);

  vec2 ld = normalize(L.xy);
  float tau = 0.0;
  float dist = 2.0;
  float stepLen = 3.0;
  for (int i = 0; i < 9; i++) {
    float lod = max(log2(stepLen / texel), 0.0);
    tau += dens(p + ld * dist, lod) * stepLen;
    dist += stepLen;
    stepLen *= 1.4;
  }
  float sun = mix(exp(-uLook.z * tau), 1.0, wC * 0.6);
  float ao = mix(exp(-uLook2.w * dens(p, 4.5)), 1.0, wC);

  vec3 amb = vec3(0.84, 0.88, 1.0) * uLook2.x;
  vec3 key = vec3(1.0, 0.985, 0.96) * uLook2.y;
  vec3 lit = amb * ao + key * sun * diff;

  vec3 jl = vec3(0.0);
  vec3 core = vec3(0.0);
  for (int i = 0; i < ${MAX_JETS}; i++) {
    vec4 jb = uJetB[i];
    if (jb.w <= 0.0) continue;
    vec4 ja = uJetA[i];
    vec2 rel = p - ja.xy;
    float along = dot(rel, ja.zw);
    float across = dot(rel, vec2(-ja.w, ja.z));
    float str = min(jb.w, 1.6);
    float flick = 0.9 + 0.2 * noise(vec2(uTime * 38.0, float(i) * 5.0));
    float len = (8.0 + 12.0 * str) * flick * uScale;
    float sN = along / len;
    float wid = 3.2 * uScale * (0.9 - 0.5 * clamp(sN, 0.0, 1.0)) + 0.3;
    float radial = exp(-across * across / (wid * wid));
    float axial = smoothstep(-0.12, 0.04, sN) * pow(clamp(1.0 - sN, 0.0, 1.0), 1.5);
    float c = radial * axial * str;
    core += mix(uThrust, vec3(1.0), smoothstep(0.25, 0.9, c)) * c * 1.3;
    float d = length(rel - ja.zw * clamp(along, 0.0, len));
    core += uThrust * str * (0.22 * exp(-d / (5.0 * uScale)) + 0.06 * exp(-d / (18.0 * uScale)));
    jl += uThrust * str * uLight2.x * (exp(-d / (30.0 * uScale)) + 0.45 * exp(-d / (100.0 * uScale)));
  }

  vec3 jlNear = jl * 0.35 + uThrust * colNear / max(Dt, 1e-4) * 0.9;
  jl += uThrust * colHot / max(Dt, 1e-4) * 0.9;
  if (uLightTheme > 0.5) {
    float shade = dot(lit + jl * 0.8, vec3(0.3333)) * uLight2.z;
    vec3 ink = mix(uShade, uSmoke, smoothstep(0.15, 1.2, shade));
    alpha = 1.0 - pow(1.0 - alpha, 1.25);
    ink = mix(ink, uThrust, clamp(dot(jlNear, vec3(0.3333)) * 0.5, 0.0, 0.3));
    float ca = clamp(max(core.r, max(core.g, core.b)) * 0.85, 0.0, 1.0);
    vec3 coreInk = mix(uThrust, vec3(1.0), 0.35 * smoothstep(0.7, 1.0, ca));
    vec3 lc = ink * alpha * (1.0 - ca) + coreInk * ca;
    float la = alpha + ca * (1.0 - alpha);
    outColor = vec4(lc, la);
    return;
  }
  vec3 smoke = uSmoke * (lit + jl) * uLight2.z;
  smoke = mix(smoke / (1.0 + 0.35 * max(smoke - 0.8, 0.0)), 1.0 - exp(-smoke * 1.35), uTone);
  vec3 emit = mix(uThrust, vec3(1.0), 0.5) * heat * heat * uLight2.y;
  vec3 col = (smoke + emit) * alpha + core;
  float a = clamp(max(alpha, max(col.r, max(col.g, col.b))), 0.0, 1.0);
  col = min(col, vec3(a));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * a;
  outColor = vec4(max(col, 0.0), a);
}`;

const SMOKE = {
  colSpread: 0.1,
  colR: 3.6,
  colD: 1.25,
  colU: 420,
  splash: 400,
  friction: 5,
  disperse: 0.6,
  dispV: 60,
  gap: 10,
  wind: 8,
  turb: 350,
  turbScale: 34,
  jetLight: 0.3,
  threshold: 0.035,
  blur: 3,
  emit: 0,
  exposure: 1.3,
  tone: 1,
  gamma: 0.6,
  kickNear: 45,
  kickW: 18,
  kickH: 14,
  vort: 6,
  spread: 0.1,
  floor: 0.02,
  keepD: 0.3,
  keepIdle: 0.45,
  keepH: 1.6,
  rateN: 0,
  rateH: 6,
  rateK: 20,
  rateC: 3,
  buoy: 330,
  lift: 22,
  damp: 0.55,
  radius: 6,
  speed: 380,
  reach: 0.9,
  forceMax: 240,
  alphaK: 4,
  relief: 9,
  shadow: 0.026,
  alphaLod: 0,
  ambient: 0.58,
  key: 0.82,
  wrap: 0.35,
  ao: 0.35,
  normalE: 3,
  normalLod: -0.8,
  fine: 0.35,
  broad: 0.9,
  iters: 28
};

interface Target {
  tex: WebGLTexture | null;
  fbo: WebGLFramebuffer | null;
  w: number;
  h: number;
  mips: boolean;
}

interface Pair {
  read: Target;
  write: Target;
  swap: () => void;
}

interface Program {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

type Uniform = number | number[] | Float32Array | Target | { f1: number[] };

interface Jets {
  a: Float32Array;
  b: Float32Array;
  bend: number[];
}

/** some of SMOKE's values changed for this frame (JetSmoke's addition) */
type Tune = Partial<typeof SMOKE>;

interface SimShared {
  tune?: Tune;
  jets: Jets;
  craft: number[];
  motion: number[];
  scale: number;
  activity: number;
  time: number;
}

interface StepInput extends SimShared {
  jetX: number[];
  jetN: number;
  spacing: number;
  calm: number;
  wind: number;
  smoke: number;
  turbulence: number;
}

interface RenderInput extends SimShared {
  light: boolean;
  smokeColor: number[];
  shadeColor: number[];
  thrustColor: number[];
}


function createSim(gl: WebGL2RenderingContext) {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type) as WebGLShader;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(log || 'shader');
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const programs: Program[] = [];
  const make = (src: string): Program => {
    const fs = compile(gl.FRAGMENT_SHADER, src);
    const p = gl.createProgram() as WebGLProgram;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program');
    gl.deleteShader(fs);
    const u: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i += 1) {
      const info = gl.getActiveUniform(p, i) as WebGLActiveInfo;
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    const prog = { p, u };
    programs.push(prog);
    return prog;
  };

  const P = {
    advect: make(ADVECT),
    force: make(FORCE),
    curl: make(CURL),
    vorticity: make(VORTICITY),
    divergence: make(DIVERGENCE),
    pressure: make(PRESSURE),
    gradient: make(GRADIENT),
    scale: make(SCALE),
    blur: make(BLUR),
    dye: make(DYE),
    render: make(RENDER)
  };

  const vao = gl.createVertexArray();
  const targets: Target[] = [];

  const target = (w: number, h: number, internal: number, mips: boolean): Target => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    gl.texStorage2D(gl.TEXTURE_2D, levels, internal, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const t = { tex, fbo, w, h, mips };
    targets.push(t);
    return t;
  };
  const pair = (w: number, h: number, internal: number, mips: boolean): Pair => {
    const p = { read: target(w, h, internal, mips), write: target(w, h, internal, mips) } as Pair;
    p.swap = () => {
      const t = p.read;
      p.read = p.write;
      p.write = t;
    };
    return p;
  };

  let f: {
    vw: number;
    vh: number;
    dw: number;
    dh: number;
    velocity: Pair;
    pressure: Pair;
    divergence: Target;
    curl: Target;
    dye: Pair;
    soft: Target;
    temp: Target;
  } | null = null;
  let world = [1, 1];

  const free = () => {
    targets.forEach(t => {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    });
    targets.length = 0;
  };

  const resize = (W: number, H: number) => {
    const cell = Math.max(2, W / 520, H / 300);
    const vw = Math.max(16, Math.round(W / cell));
    const vh = Math.max(16, Math.round(H / cell));
    const dw = Math.max(16, Math.round(W / (cell / 2)));
    const dh = Math.max(16, Math.round(H / (cell / 2)));
    world = [W, H];
    if (f && f.vw === vw && f.vh === vh && f.dw === dw && f.dh === dh) return;
    free();
    f = {
      vw,
      vh,
      dw,
      dh,
      velocity: pair(vw, vh, gl.RG16F, false),
      pressure: pair(vw, vh, gl.R16F, false),
      divergence: target(vw, vh, gl.R16F, false),
      curl: target(vw, vh, gl.R16F, false),
      dye: pair(dw, dh, gl.RG16F, false),
      soft: target(dw, dh, gl.RG16F, true),
      temp: target(dw, dh, gl.RG16F, false)
    };
  };

  let unit = 0;
  const bind = (prog: Program, values: Record<string, Uniform>) => {
    gl.useProgram(prog.p);
    unit = 0;
    Object.entries(values).forEach(([name, v]) => {
      const loc = prog.u[name];
      if (loc === undefined || loc === null) return;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if ('f1' in v) gl.uniform1fv(loc, v.f1);
      else if ('tex' in v) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v.tex);
        gl.uniform1i(loc, unit);
        unit += 1;
      } else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else gl.uniform4fv(loc, v);
    });
  };
  const run = (prog: Program, values: Record<string, Uniform>, out?: Target) => {
    bind(prog, values);
    if (out) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
      gl.viewport(0, 0, out.w, out.h);
    }
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const step = (dt: number, o: StepInput) => {
    if (!f) return;
    const K = { ...SMOKE, ...o.tune };
    gl.disable(gl.BLEND);
    const vt = [1 / f.vw, 1 / f.vh];
    run(
      P.advect,
      { uVelocity: f.velocity.read, uSource: f.velocity.read, uWorld: world, uDt: dt, uKeep: 1 },
      f.velocity.write
    );
    f.velocity.swap();
    run(
      P.force,
      {
        uVelocity: f.velocity.read,
        uDye: f.soft,
        uWorld: world,
        uDt: dt,
        uBuoyancy: K.buoy,
        uLift: K.lift,
        uDamping: K.damp,
        uSpread: K.spread,
        uSplash: K.splash,
        uFriction: K.friction,
        uWind: o.wind,
        uTurb: [K.turb * (0.35 + 0.65 * o.activity), K.turbScale],
        uTime: o.time,
        uObstacle: o.calm,
        uKick: [K.kickNear * o.scale, K.kickW * o.scale, K.kickH * o.scale],
        uCraft: o.craft,
        uCraftMotion: o.motion,
        uJetA: o.jets.a,
        uJetB: o.jets.b,
        uJetBend: { f1: o.jets.bend }
      },
      f.velocity.write
    );
    f.velocity.swap();
    run(P.curl, { uVelocity: f.velocity.read, uTexel: vt }, f.curl);
    run(
      P.vorticity,
      {
        uVelocity: f.velocity.read,
        uCurl: f.curl,
        uTexel: vt,
        uStrength: K.vort * o.turbulence * (0.4 + 0.6 * o.activity),
        uDt: dt
      },
      f.velocity.write
    );
    f.velocity.swap();
    run(P.divergence, { uVelocity: f.velocity.read, uTexel: vt }, f.divergence);
    run(P.scale, { uSource: f.pressure.read, uScale: 0.8 }, f.pressure.write);
    f.pressure.swap();
    for (let i = 0; i < K.iters; i += 1) {
      run(P.pressure, { uPressure: f.pressure.read, uDivergence: f.divergence, uTexel: vt }, f.pressure.write);
      f.pressure.swap();
    }
    run(P.gradient, { uPressure: f.pressure.read, uVelocity: f.velocity.read, uTexel: vt }, f.velocity.write);
    f.velocity.swap();

    run(
      P.dye,
      {
        uVelocity: f.velocity.read,
        uSource: f.dye.read,
        uWorld: world,
        uDt: dt,
        uKeep: [Math.exp(-(K.keepD + K.keepIdle * (1 - o.activity)) * dt), Math.exp(-K.keepH * dt)],
        uRate: [K.rateN * o.smoke, K.rateH, K.rateK * o.smoke, K.rateC * o.smoke],
        uSpread: K.spread,
        uCol: [K.colSpread, K.colR * o.scale, K.colD, K.colU],
        uKick: [K.kickNear * o.scale, K.kickW * o.scale, K.kickH * o.scale],
        uDisperse: K.disperse,
        uDispV: K.dispV,
        uCraft: o.craft,
        uCraftMotion: o.motion,
        uGap: [o.spacing, K.gap * o.calm],
        uJetX: { f1: o.jetX },
        uJetN: o.jetN,
        uFloor: K.floor,
        uTime: o.time,
        uJetA: o.jets.a,
        uJetB: o.jets.b,
        uJetBend: { f1: o.jets.bend }
      },
      f.dye.write
    );
    f.dye.swap();
    const spread = K.blur / 2;
    run(P.blur, { uSource: f.dye.read, uStep: [spread / f.dw, 0] }, f.temp);
    run(P.blur, { uSource: f.temp, uStep: [0, spread / f.dh] }, f.soft);
    gl.bindTexture(gl.TEXTURE_2D, f.soft.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const render = (cw: number, ch: number, o: RenderInput) => {
    if (!f) return;
    const K = { ...SMOKE, ...o.tune };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.BLEND);
    run(P.render, {
      uDye: f.soft,
      uWorld: world,
      uDyeSize: [f.dw, f.dh],
      uTime: o.time,
      uLightTheme: o.light ? 1 : 0,
      uSmoke: o.smokeColor,
      uShade: o.shadeColor,
      uThrust: o.thrustColor,
      uLook: [K.alphaK * (0.6 + 0.4 * o.activity), K.relief, K.shadow, K.alphaLod],
      uLook2: [K.ambient, K.key, K.wrap, K.ao],
      uLook3: [K.normalE, K.normalLod, K.fine, K.broad],
      uCol: [K.colSpread, K.colR * o.scale, K.colD, K.colU],
      uScale: o.scale,
      uGamma: K.gamma,
      uTone: K.tone,
      uLight2: [K.jetLight, K.emit, K.exposure],
      uThreshold: K.threshold * (0.3 + 0.7 * o.activity),
      uCraft: o.craft,
      uCraftMotion: o.motion,
      uJetA: o.jets.a,
      uJetB: o.jets.b,
      uJetBend: { f1: o.jets.bend }
    });
  };

  const clear = () => {
    if (!f) return;
    [
      f.velocity.read,
      f.velocity.write,
      f.pressure.read,
      f.pressure.write,
      f.dye.read,
      f.dye.write,
      f.soft,
      f.temp
    ].forEach(t => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindTexture(gl.TEXTURE_2D, f.soft.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  const dispose = () => {
    free();
    programs.forEach(p => gl.deleteProgram(p.p));
    gl.deleteShader(vs);
    gl.deleteVertexArray(vao);
  };

  return { step, render, resize, clear, dispose };
}

type Sim = ReturnType<typeof createSim>;

/**
 * A jet: its nozzle (px from the canvas's left, and up from its bottom, which
 * is the floor the smoke splashes on), which way it fires (a unit vector;
 * straight down is dy = -1) and how hard (0 off … 2 flat out).
 */
export interface Jet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  thrust: number;
}

export interface SmokeLook {
  /** how big the jets and their smoke are (1: the button's own, medium size) */
  scale: number;
  /** 0 idling … 1 all out: the smoke livelier, swirling more and lasting longer */
  activity: number;
  /** how much smoke (1: upstream's) */
  smoke?: number;
  turbulence?: number;
  /** a breeze along the floor, px a second (+ to the right) */
  wind?: number;
  /** how strongly hot smoke rises (1: upstream's) */
  buoyancy?: number;
  /** how quickly the smoke thins away (1: upstream's) */
  fade?: number;
  smokeColor: string;
  thrustColor: string;
}

/** (no button in the smoke: its body is out of the way, and nothing is held still around it) */
const NO_CRAFT = [-1e4, -1e4, 1, 1];

export class JetSmoke {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly sim: Sim;
  private time = 0;

  /** null without WebGL 2 or float render targets: no smoke then */
  static create(canvas: HTMLCanvasElement): JetSmoke | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    try {
      return new JetSmoke(canvas, gl, createSim(gl));
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, sim: Sim) {
    this.canvas = canvas;
    this.gl = gl;
    this.sim = sim;
  }

  /** the smoke's world: `width` × `height` px (CSS), drawn at `dpr` */
  resize(width: number, height: number, dpr: number) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.sim.resize(Math.max(1, width), Math.max(1, height));
  }

  /** moves the smoke on by `dt` seconds with these jets firing, and draws it */
  frame(dt: number, jets: readonly Jet[], look: SmokeLook) {
    const a = new Float32Array(MAX_JETS * 4);
    const b = new Float32Array(MAX_JETS * 4);
    const K = SMOKE;
    jets.slice(0, MAX_JETS).forEach((q, i) => {
      const str = clamp(q.thrust, 0, 2);
      const reach = q.dy < -0.2 ? q.y / -q.dy : K.forceMax;
      a.set([q.x, q.y, q.dx, q.dy], i * 4);
      b.set([K.speed * Math.sqrt(str), K.radius * look.scale, Math.min(K.forceMax, reach * K.reach), str > 0.004 ? str : 0], i * 4);
    });
    const buoyancy = look.buoyancy ?? 1;
    const fade = look.fade ?? 1;
    const shared = {
      tune: { buoy: K.buoy * buoyancy, lift: K.lift * buoyancy, keepD: K.keepD * fade, keepIdle: K.keepIdle * fade, floor: K.floor * fade },
      jets: { a, b, bend: [0, 0, 0, 0] },
      craft: NO_CRAFT,
      motion: [0, 0, 0, 0],
      scale: look.scale,
      activity: clamp(look.activity, 0, 1),
    };
    if (dt > 0) {
      this.time += dt;
      this.sim.step(dt, {
        ...shared,
        time: this.time,
        jetX: [0, 0, 0, 0],
        jetN: 0,
        spacing: 0,
        calm: 0,
        wind: look.wind ?? 0,
        smoke: look.smoke ?? 1,
        turbulence: look.turbulence ?? 1,
      });
    }
    const smoke = rgb(look.smokeColor);
    this.sim.render(this.canvas.width, this.canvas.height, {
      ...shared,
      time: this.time,
      light: false,
      smokeColor: smoke,
      shadeColor: smoke.map((v, i) => v * 0.74 + [0.0, 0.012, 0.045][i]),
      thrustColor: rgb(look.thrustColor),
    });
  }

  dispose() {
    this.sim.dispose();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
