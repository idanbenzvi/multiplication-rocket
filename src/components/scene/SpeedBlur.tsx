import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Effect, EffectAttribute } from 'postprocessing';
import { Uniform, Vector2, Vector3 } from 'three';
import { flight, portholeScreen } from '../../game/flight';

// Video-game style motion blur. The rocket flies "up", so the world smears
// vertically, with a little radial zoom toward the screen edges; a clear
// elliptical window around the rocket keeps it crisp (the eye tracks the
// ship, so only the world should blur). At high speed it also splits color
// channels and darkens the edges, a tunnel-vision cue.
//
// And as the camera rushes in through the ship's window (into the cockpit,
// or diving to the Academy) or pulls back out, everything smears out from
// the window, a radial zoom blur: none at the window itself, where the eye
// is going, more and more towards the edges of the screen.
const FRAGMENT = /* glsl */ `
uniform float strength;
uniform vec2 center;
uniform vec2 window; // the clear window around the rocket: half its width and height, in screen heights
uniform float course; // the level's course (flight.heading): which way is "up" for the rocket
uniform float zoom; // the rush at the ship's window: how far (a share of the way to it) everything smears
uniform vec2 zoomCenter; // the ship's window on screen

vec2 turn(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (strength < 0.0005 && zoom < 0.0005) { outputColor = inputColor; return; }

  vec2 toCenter = uv - center;
  // measured in the rocket's own frame, so the window leans with it
  float r = length(turn(toCenter * vec2(aspect, 1.0), -course) / window);
  float mask = smoothstep(0.85, 1.7, r);

  vec2 radial = normalize(toCenter + vec2(1e-5));
  // the world smears along the course
  vec2 along = normalize(turn(vec2(0.0, 1.0), course) / vec2(aspect, 1.0));
  vec2 dir = normalize(mix(along, radial, 0.3));
  vec2 span = dir * strength * mask;
  vec2 rush = (uv - zoomCenter) * zoom;
  // (its taps start a little further along at each pixel, so a long smear blurs rather than repeating)
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;

  const int TAPS = 14;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float t = float(i) / float(TAPS - 1) - 0.5;
    vec2 o = span * t + rush * (t + jitter / float(TAPS));
    // Chromatic split grows with strength: red and blue sample slightly
    // ahead/behind along the motion, like a lens straining at speed.
    vec2 ca = span * 0.12 + rush * 0.08;
    acc.r += texture2D(inputBuffer, uv + o + ca).r;
    acc.g += texture2D(inputBuffer, uv + o).g;
    acc.b += texture2D(inputBuffer, uv + o - ca).b;
  }
  vec3 col = acc / float(TAPS);

  float vignette = 1.0 - smoothstep(0.55, 1.25, length((uv - 0.5) * vec2(aspect, 1.0))) * min(max(strength * 5.0, zoom * 2.5), 0.55);
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
        ['window', new Uniform(new Vector2(0.16, 0.26))],
        ['course', new Uniform(0)],
        ['zoom', new Uniform(0)],
        ['zoomCenter', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    });
  }
}

// Rocket body center in world space (see FlyingRocket/RocketSprite): it turns
// onto each level's course about its porthole, right here, so this stays put.
const ROCKET_CENTER = new Vector3(0, 1.15, 0);

/** the rush's smear: how long the "shutter" is open (s), and the most it smears (a share of the way to the window) */
const EXPOSURE = 1 / 30;
const MAX_ZOOM = 0.16;

export function SpeedBlur() {
  const effect = useMemo(() => new SpeedBlurEffect(), []);
  const { camera } = useThree();
  const projected = useMemo(() => new Vector3(), []);

  useEffect(() => () => effect.dispose(), [effect]);

  useFrame(({ size }) => {
    const u = effect.uniforms;
    const s = Math.max(0, flight.effective - 0.15); // nothing at cruise
    (u.get('strength') as Uniform<number>).value = Math.min(0.13, s * s * 0.1) * flight.motionScale;

    projected.copy(ROCKET_CENTER).project(camera);
    (u.get('center') as Uniform<Vector2>).value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    (u.get('course') as Uniform<number>).value = flight.heading;

    (u.get('zoom') as Uniform<number>).value = Math.min(MAX_ZOOM, Math.abs(flight.rush) * EXPOSURE) * flight.motionScale;
    (u.get('zoomCenter') as Uniform<Vector2>).value.set(
      (portholeScreen.x - size.left) / size.width,
      1 - (portholeScreen.y - size.top) / size.height,
    );
  });

  return <primitive object={effect} dispose={null} />;
}
