import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2, Vector3 } from 'three';
import { flight } from '../../game/flight';

// Video-game style motion blur. The rocket flies "up", so the world smears
// vertically, with a little radial zoom toward the screen edges; a clear
// elliptical window around the rocket keeps it crisp (the eye tracks the
// ship, so only the world should blur). At high speed it also splits color
// channels and darkens the edges, a tunnel-vision cue.
const FRAGMENT = /* glsl */ `
uniform float strength;
uniform vec2 center;
uniform vec2 window;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (strength < 0.0005) { outputColor = inputColor; return; }

  vec2 toCenter = uv - center;
  float r = length(toCenter / window);
  float mask = smoothstep(0.85, 1.7, r);

  vec2 radial = normalize(toCenter + vec2(1e-5));
  vec2 dir = normalize(mix(vec2(0.0, 1.0), radial, 0.3));
  vec2 span = dir * strength * mask;

  const int TAPS = 14;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float t = float(i) / float(TAPS - 1) - 0.5;
    vec2 o = span * t;
    // Chromatic split grows with strength: red and blue sample slightly
    // ahead/behind along the motion, like a lens straining at speed.
    vec2 ca = span * 0.12;
    acc.r += texture2D(inputBuffer, uv + o + ca).r;
    acc.g += texture2D(inputBuffer, uv + o).g;
    acc.b += texture2D(inputBuffer, uv + o - ca).b;
  }
  vec3 col = acc / float(TAPS);

  float vignette = 1.0 - smoothstep(0.55, 1.25, length((uv - 0.5) * vec2(aspect, 1.0))) * min(strength * 5.0, 0.55);
  outputColor = vec4(col * vignette, inputColor.a);
}
`;

class SpeedBlurEffect extends Effect {
  constructor() {
    super('SpeedBlurEffect', FRAGMENT, {
      // Samples neighboring pixels, so it must get its own pass rather than
      // being merged with other effects.
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['strength', new Uniform(0)],
        ['center', new Uniform(new Vector2(0.5, 0.6))],
        ['window', new Uniform(new Vector2(0.09, 0.26))],
      ]),
    });
  }
}

// Rocket body center in world space (see FlyingRocket/RocketSprite).
const ROCKET_CENTER = new Vector3(0, 1.15, 0);

export function SpeedBlur() {
  const effect = useMemo(() => new SpeedBlurEffect(), []);
  const { camera, size } = useThree();
  const projected = useMemo(() => new Vector3(), []);

  useEffect(() => () => effect.dispose(), [effect]);

  useFrame(() => {
    const u = effect.uniforms;
    const s = Math.max(0, flight.effective - 0.15); // nothing at cruise
    (u.get('strength') as Uniform<number>).value = Math.min(0.13, s * s * 0.1) * flight.motionScale;

    projected.copy(ROCKET_CENTER).project(camera);
    (u.get('center') as Uniform<Vector2>).value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    // Keep the clear window rocket-shaped regardless of screen aspect.
    const aspect = size.width / Math.max(1, size.height);
    (u.get('window') as Uniform<Vector2>).value.set(0.16 / aspect, 0.26);
  });

  return <primitive object={effect} dispose={null} />;
}
