import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Effect, EffectAttribute } from 'postprocessing';
import { Matrix4, Uniform, Vector2, Vector3, type Texture } from 'three';
import { drive } from './drive';
import { flashNow, fx } from './canyon/fx';
import { view } from './view';

// The camera's own effects in the cockpit. Glowing things bloom (the stars,
// the numbers, the comet, the lit buttons: anything brighter than white).
// And the lens: zooming into a screen (or back out) smears everything out
// from the middle of the view, a radial motion blur, none in the middle where
// the eye is going and more and more towards the edges; turning the head
// smears it sideways; and while zoomed in, the edges stay a little blurred
// and dark, a vignette round the screen you're looking at. A faint film
// grain over it all, and a little colour split as it moves.
//
// On a Canyon Run (canyon/), more: the rock rushing past smears in towards
// where the ship's heading, through the glass only (the cockpit's picture
// says where its glass is: its alpha), more the faster it goes and sideways
// as it turns; the sun, when it's ahead and in view, flares (a glare round
// it, a streak across and ghosts along the line through the middle); and the
// run's flashes (the white-out diving in, a bullseye's gold) light it all.

const FRAGMENT = /* glsl */ `
uniform float rush;      // the zoom's smear: a share of the way to the middle (signed: in or out)
uniform vec2 turn;       // the turn's smear, across the screen (a share of its height)
uniform float edge;      // zoomed in: how much the edges stay blurred
uniform float vignette;
uniform float split;     // the colour split
uniform float grain;
uniform float time;
// the Canyon Run's (canyon/fx.ts)
uniform float speed;     // the rock rushing past: a smear in from where the ship's heading
uniform vec2 heading;
uniform vec2 glide;      // a turn's smear past the glass
uniform mat4 projInv;
uniform mat4 camWorld;
uniform sampler2D pano;  // the cockpit's picture: its alpha is its glass
uniform float hasPano;
uniform vec2 sunUV;
uniform float sun;
uniform vec3 flash;
// the afterburner's loop (loop/): time frozen
uniform float mono;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// how much of the view at p is through the glass (1) rather than the cockpit (0)
float glassAt(vec2 p) {
  if (hasPano < 0.5) return 1.0;
  vec4 v = projInv * vec4(p * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize((camWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
  vec2 q = vec2(0.5 + atan(d.x, -d.z) / 6.2831853, 0.5 + asin(clamp(d.y, -1.0, 1.0)) / 3.14159265);
  return 1.0 - texture2D(pano, q).a;
}

// one of the sun's ghosts in the lens: a soft disc
float ghost(vec2 uv, vec2 at, float r, vec2 a) {
  float d = length((uv - at) * a);
  return smoothstep(r, r * 0.55, d) * 0.5 + smoothstep(r * 1.02, r * 0.97, d) * 0.12;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 c = uv - 0.5;
  float r = length(c * vec2(aspect, 1.0));
  // (the middle stays sharp)
  float away = smoothstep(0.12, 0.75, r);
  vec2 radial = c * (rush * away + edge * 0.045 * smoothstep(0.3, 0.9, r));
  vec2 across = turn / vec2(aspect, 1.0) * (0.35 + away);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  vec3 col;
  if (length(radial) + length(across) < 0.0005) {
    col = inputColor.rgb;
  } else {
    const int TAPS = 12;
    vec3 acc = vec3(0.0);
    vec2 ca = (radial + across) * split;
    for (int i = 0; i < TAPS; i++) {
      float t = (float(i) + jitter) / float(TAPS) - 0.5;
      vec2 o = radial * t + across * t;
      acc.r += texture2D(inputBuffer, uv + o + ca).r;
      acc.g += texture2D(inputBuffer, uv + o).g;
      acc.b += texture2D(inputBuffer, uv + o - ca).b;
    }
    col = acc / float(TAPS);
  }

  // the Canyon Run: the rock rushing past, smeared through the glass only, in towards where the ship's heading
  if (speed + abs(glide.x) + abs(glide.y) > 0.0) {
    float g = glassAt(uv);
    if (g > 0.02) {
      vec2 dir = uv - heading;
      vec2 o = dir * speed * smoothstep(0.04, 0.5, length(dir * vec2(aspect, 1.0))) + glide;
      vec2 ca = o * split * 0.6;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float t = (float(i) + jitter + 0.5) / 8.0;
        acc.r += texture2D(inputBuffer, uv - o * t + ca).r;
        acc.g += texture2D(inputBuffer, uv - o * t).g;
        acc.b += texture2D(inputBuffer, uv - o * t - ca).b;
      }
      col = mix(col, acc / 8.0, g);
    }
  }
  // the sun's glare, when it's in view through the glass: a bloom round it, a streak across, and ghosts back through the middle
  if (sun > 0.0) {
    float seen = glassAt(sunUV) * sun;
    vec2 a = vec2(aspect, 1.0);
    vec2 sd = (uv - sunUV) * a;
    col += vec3(1.0, 0.72, 0.45) * seen * (0.22 * exp(-length(sd) * 6.0) + 0.16 * exp(-abs(sd.y) * 85.0) * exp(-abs(sd.x) * 2.0));
    vec2 axis = sunUV - 0.5;
    col += vec3(0.35, 0.6, 1.0) * seen * 0.16 * ghost(uv, 0.5 - axis * 0.4, 0.045, a);
    col += vec3(1.0, 0.55, 0.3) * seen * 0.12 * ghost(uv, 0.5 - axis * 0.85, 0.08, a);
    col += vec3(0.6, 1.0, 0.6) * seen * 0.09 * ghost(uv, 0.5 - axis * 1.3, 0.13, a);
    col += vec3(0.9, 0.5, 1.0) * seen * 0.1 * ghost(uv, 0.5 + axis * 0.3, 0.03, a);
  }

  // time frozen: the colour drained to a cold, inked grey
  if (mono > 0.0) {
    float l = clamp((dot(col, vec3(0.299, 0.587, 0.114)) - 0.04) * 1.3, 0.0, 2.0);
    col = mix(col, vec3(l) * vec3(0.78, 0.93, 1.12), mono);
  }
  col *= 1.0 - smoothstep(0.42, 1.15, r) * vignette;
  col += (hash(uv * 913.0 + fract(time * 7.31) * 71.0) - 0.5) * grain;
  col += flash;
  outputColor = vec4(col, inputColor.a);
}
`;

class LensEffect extends Effect {
  constructor() {
    super('CockpitLensEffect', FRAGMENT, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['rush', new Uniform(0)],
        ['turn', new Uniform(new Vector2())],
        ['edge', new Uniform(0)],
        ['vignette', new Uniform(0.3)],
        ['split', new Uniform(0.15)],
        ['grain', new Uniform(0.035)],
        ['time', new Uniform(0)],
        ['speed', new Uniform(0)],
        ['heading', new Uniform(new Vector2(0.5, 0.6))],
        ['glide', new Uniform(new Vector2())],
        ['projInv', new Uniform(new Matrix4())],
        ['camWorld', new Uniform(new Matrix4())],
        ['pano', new Uniform<Texture | null>(null)],
        ['hasPano', new Uniform(0)],
        ['sunUV', new Uniform(new Vector2(0.5, 0.8))],
        ['sun', new Uniform(0)],
        ['flash', new Uniform(new Vector3())],
        ['mono', new Uniform(0)],
      ]),
    });
  }
}

/** how long the "shutter" is open (s), and the most it smears */
const EXPOSURE = 1 / 24;
const MAX_RUSH = 0.22;
const MAX_TURN = 0.05;

function Lens() {
  const effect = useMemo(() => new LensEffect(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  useFrame(({ clock, camera }) => {
    const u = effect.uniforms;
    const calm = view.calm ? 0 : 1;
    (u.get('rush') as Uniform<number>).value = Math.max(-MAX_RUSH, Math.min(MAX_RUSH, view.rush * EXPOSURE * 1.6)) * calm;
    // (the world slides the other way to the turn)
    const tx = Math.max(-MAX_TURN, Math.min(MAX_TURN, -view.vYaw * EXPOSURE * 0.5));
    const ty = Math.max(-MAX_TURN, Math.min(MAX_TURN, view.vPitch * EXPOSURE * 0.5));
    (u.get('turn') as Uniform<Vector2>).value.set(tx * calm, ty * calm);
    (u.get('edge') as Uniform<number>).value = view.zoom * calm;
    (u.get('vignette') as Uniform<number>).value = 0.32 + view.zoom * 0.38 + view.motion * 0.2 + fx.vignette;
    (u.get('split') as Uniform<number>).value = 0.1 + drive.k * 0.04 + fx.split * calm;
    (u.get('time') as Uniform<number>).value = clock.elapsedTime;
    // the Canyon Run's
    (u.get('speed') as Uniform<number>).value = fx.speed * calm;
    (u.get('heading') as Uniform<Vector2>).value.set(...fx.heading);
    (u.get('glide') as Uniform<Vector2>).value.set(fx.turn[0] * calm, fx.turn[1] * calm);
    (u.get('projInv') as Uniform<Matrix4>).value.copy(camera.projectionMatrixInverse);
    (u.get('camWorld') as Uniform<Matrix4>).value.copy(camera.matrixWorld);
    (u.get('pano') as Uniform<Texture | null>).value = fx.pano;
    (u.get('hasPano') as Uniform<number>).value = fx.pano ? 1 : 0;
    (u.get('sunUV') as Uniform<Vector2>).value.set(...fx.sunUV);
    (u.get('sun') as Uniform<number>).value = fx.sun;
    const [r, g, b] = flashNow();
    (u.get('flash') as Uniform<Vector3>).value.set(r, g, b);
    (u.get('mono') as Uniform<number>).value = fx.mono;
  });
  return <primitive object={effect} dispose={null} />;
}

export function Effects({ low }: { low: boolean }) {
  return (
    <EffectComposer multisampling={low ? 0 : 4}>
      <Bloom luminanceThreshold={1} luminanceSmoothing={0.25} intensity={1.15} mipmapBlur radius={0.72} />
      <Lens />
    </EffectComposer>
  );
}
