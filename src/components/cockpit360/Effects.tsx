import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2 } from 'three';
import { surge } from './drive';
import { view } from './view';

// The camera's own effects in the cockpit. Glowing things bloom (the stars,
// the numbers, the comet, the lit buttons: anything brighter than white).
// And the lens: zooming into a screen (or back out) smears everything out
// from the middle of the view, a radial motion blur, none in the middle where
// the eye is going and more and more towards the edges; turning the head
// smears it sideways; and while zoomed in, the edges stay a little blurred
// and dark, a vignette round the screen you're looking at. A faint film
// grain over it all, and a little colour split as it moves.

const FRAGMENT = /* glsl */ `
uniform float rush;      // the zoom's smear: a share of the way to the middle (signed: in or out)
uniform vec2 turn;       // the turn's smear, across the screen (a share of its height)
uniform float edge;      // zoomed in: how much the edges stay blurred
uniform float vignette;
uniform float split;     // the colour split
uniform float grain;
uniform float time;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 c = uv - 0.5;
  float r = length(c * vec2(aspect, 1.0));
  // (the middle stays sharp)
  float away = smoothstep(0.12, 0.75, r);
  vec2 radial = c * (rush * away + edge * 0.045 * smoothstep(0.3, 0.9, r));
  vec2 across = turn / vec2(aspect, 1.0) * (0.35 + away);
  vec3 col;
  if (length(radial) + length(across) < 0.0005) {
    col = inputColor.rgb;
  } else {
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
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
  col *= 1.0 - smoothstep(0.42, 1.15, r) * vignette;
  col += (hash(uv * 913.0 + fract(time * 7.31) * 71.0) - 0.5) * grain;
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
  useFrame(({ clock }) => {
    const u = effect.uniforms;
    const calm = view.calm ? 0 : 1;
    (u.get('rush') as Uniform<number>).value = Math.max(-MAX_RUSH, Math.min(MAX_RUSH, view.rush * EXPOSURE * 1.6)) * calm;
    // (the world slides the other way to the turn)
    const tx = Math.max(-MAX_TURN, Math.min(MAX_TURN, -view.vYaw * EXPOSURE * 0.5));
    const ty = Math.max(-MAX_TURN, Math.min(MAX_TURN, view.vPitch * EXPOSURE * 0.5));
    (u.get('turn') as Uniform<Vector2>).value.set(tx * calm, ty * calm);
    (u.get('edge') as Uniform<number>).value = view.zoom * calm;
    (u.get('vignette') as Uniform<number>).value = 0.32 + view.zoom * 0.38 + view.motion * 0.2;
    (u.get('split') as Uniform<number>).value = 0.12 + surge.k * 0.1;
    (u.get('time') as Uniform<number>).value = clock.elapsedTime;
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
