import { useMemo } from 'react';
import { getToonGradientMap } from './toonGradient';

const ROCK_COLORS = ['#8a7a68', '#9c8b76', '#786a5c', '#a89a82'];
const ROCK_COUNT = 10;

interface RockSpec {
  position: [number, number, number];
  scale: number;
  rotation: [number, number, number];
  color: string;
}

function buildRocks(): RockSpec[] {
  const rocks: RockSpec[] = [];
  for (let i = 0; i < ROCK_COUNT; i++) {
    const angle = (i / ROCK_COUNT) * Math.PI * 2 + Math.random() * 0.6;
    const radius = 1.7 + Math.random() * 1.4;
    rocks.push({
      position: [Math.cos(angle) * radius, -0.85 + Math.random() * 0.06, Math.sin(angle) * radius],
      scale: 0.12 + Math.random() * 0.22,
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
      color: ROCK_COLORS[i % ROCK_COLORS.length],
    });
  }
  return rocks;
}

// A handful of small flat-shaded low-poly rocks scattered around the pad —
// static set dressing, not tied to game state, so the launch site reads as a
// place rather than a rocket floating in empty space.
export function ScatteredRocks() {
  const gradientMap = getToonGradientMap();
  const rocks = useMemo(buildRocks, []);

  return (
    <group>
      {rocks.map((rock, i) => (
        <mesh key={i} position={rock.position} rotation={rock.rotation} scale={rock.scale}>
          <icosahedronGeometry args={[1, 0]} />
          <meshToonMaterial color={rock.color} gradientMap={gradientMap} />
        </mesh>
      ))}
    </group>
  );
}
