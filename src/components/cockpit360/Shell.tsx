import { useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { dirOf, type Vec3 } from './geometry';
import { LEDS, QUADS, SCREENS } from './screens';
import { glowLights } from './lights';
import { PANORAMA_URL } from './panorama';

// The cockpit itself: the panorama, on a sphere round the camera. Each
// pixel looks the picture up by the direction it's seen in (so there's no
// seam, and nothing squashed at the poles), and through the glass, cut out of
// it, space shows (Space.tsx, drawn first), with a faint tint and a glint or
// two on the glass. The cockpit is lit a little by what's in it: each
// screen's glow falling on the walls round it (brighter while it's lit up,
// hovered or zoomed into), its little buttons blinking (bright enough to
// bloom), and now and then something passing by outside, its light coming
// in through the glass (lights.ts); a shudder makes it all flicker.

const MAX_LIGHTS = 8;

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uAmbient;
uniform float uFlicker;
uniform vec3 uLightDir[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
/** each light's reach: the cosine of how far round it falls off to nothing */
uniform float uLightReach[${MAX_LIGHTS}];
uniform vec3 uLedDir[${LEDS.length}];
uniform vec3 uLedColor[${LEDS.length}];
uniform float uLedSize[${LEDS.length}];
uniform vec3 uPassDir;
uniform vec3 uPassColor;
varying vec3 vDir;

const float PI = 3.14159265;

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  float yaw = atan(d.x, -d.z);
  float pitch = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(0.5 + yaw / (2.0 * PI), 0.5 + pitch / PI);
  vec4 tex = texture2D(map, uv);
  vec3 albedo = tex.rgb;

  // the light falling on the walls: the screens', and whatever's passing by outside
  vec3 light = vec3(uAmbient * (1.0 - uFlicker * 0.35));
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    float c = dot(d, uLightDir[i]);
    float k = smoothstep(uLightReach[i], 1.0, c);
    light += uLightColor[i] * k * k * (1.0 - uFlicker * 0.6);
  }
  float pass = smoothstep(0.55, 1.0, dot(d, uPassDir));
  light += uPassColor * pass * pass;
  vec3 color = albedo * light;

  // the little buttons, each blinking in its own time, glowing past their edges
  for (int i = 0; i < ${LEDS.length}; i++) {
    float a = 1.0 - dot(d, uLedDir[i]);
    float s = uLedSize[i];
    float fi = float(i);
    float blink = 0.55 + 0.45 * sin(uTime * (1.3 + hash(fi) * 2.7) + hash(fi + 7.0) * 6.28);
    // (now and then one goes dark a moment)
    blink *= step(0.12, fract(uTime * (0.07 + hash(fi + 3.0) * 0.11) + hash(fi + 1.0)));
    color += uLedColor[i] * blink * (exp(-a / (s * s * 0.5)) * 1.7 + exp(-a / (s * s * 5.0)) * 0.16);
  }

  // the glass: a faint tint, and a glint or two catching the light
  float glass = 1.0 - tex.a;
  if (glass > 0.0) {
    float g = sin(dot(d, vec3(0.62, 0.71, 0.33)) * 34.0 + uTime * 0.05);
    float glint = smoothstep(0.985, 1.0, g) * 0.05 + smoothstep(0.9, 1.0, g) * 0.012;
    float edge = smoothstep(0.35, 1.0, abs(d.x)) * 0.02;
    // (how much of the glass itself shows, and its colour: a cool tint, warmed by whatever's passing)
    float ga = glint + edge + 0.03 + pass * 0.04;
    vec3 gc = vec3(0.55, 0.75, 1.0) + uPassColor * pass * 2.0;
    float a = tex.a + glass * ga;
    gl_FragColor = vec4((color * tex.a + gc * glass * ga) / max(a, 1e-4), a);
  } else {
    gl_FragColor = vec4(color, 1.0);
  }
  #include <colorspace_fragment>
}
`;

const toVec = (v: Vec3) => new THREE.Vector3(...v);
const linear = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export function Shell() {
  const texture = useLoader(THREE.TextureLoader, PANORAMA_URL);
  const material = useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    // (it's always seen magnified, never shrunk: no mipmaps, and so no seam round the back)
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        map: { value: texture },
        uTime: { value: 0 },
        uAmbient: { value: 0.9 },
        uFlicker: { value: 0 },
        uLightDir: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0)) },
        uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
        uLightReach: { value: Array.from({ length: MAX_LIGHTS }, () => 0.99) },
        uLedDir: { value: LEDS.map((l) => toVec(dirOf(l.at))) },
        uLedColor: { value: LEDS.map((l) => linear(l.color)) },
        // (its size as an angle: a share of the panorama's width is that share of a full turn)
        uLedSize: { value: LEDS.map((l) => l.size * Math.PI * 2) },
        uPassDir: { value: new THREE.Vector3(0, 1, 0) },
        uPassColor: { value: new THREE.Color(0, 0, 0) },
      },
    });
  }, [texture]);

  // the screens' lights: where each one is, in a fixed order
  const screenDirs = useMemo(() => SCREENS.map((s) => toVec(QUADS[s.id].center).normalize()), []);

  useFrame(({ clock }) => {
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uFlicker.value = glowLights.flicker;
    u.uAmbient.value = glowLights.ambient;
    const dirs = u.uLightDir.value as THREE.Vector3[];
    const colors = u.uLightColor.value as THREE.Color[];
    const reach = u.uLightReach.value as number[];
    SCREENS.forEach((s, i) => {
      dirs[i].copy(screenDirs[i]);
      const k = glowLights.screens[s.id];
      colors[i].set(s.glow).multiplyScalar(0.12 + 0.5 * k);
      // (a big screen's light reaches further)
      reach[i] = s.id === 'modes' || s.id === 'map' ? 0.93 : 0.95;
    });
    // the windscreen's HUD, glowing faintly on the frame round it
    dirs[6].set(0, 0.22, -1).normalize();
    colors[6].set('#ff9d4d').multiplyScalar(0.06 + 0.05 * glowLights.hud);
    reach[6] = 0.9;
    // and the hotspot under the hand
    const hot = glowLights.hot;
    if (hot) {
      dirs[7].set(...hot.dir);
      colors[7].set(hot.color).multiplyScalar(0.55 * hot.k);
      reach[7] = 0.985;
    } else colors[7].setRGB(0, 0, 0);
    const p = glowLights.passing;
    u.uPassDir.value.set(...p.dir);
    (u.uPassColor.value as THREE.Color).set(p.color).multiplyScalar(p.k * 0.55);
  });

  return (
    <mesh material={material} renderOrder={10} frustumCulled={false}>
      <sphereGeometry args={[10, 96, 48]} />
    </mesh>
  );
}
