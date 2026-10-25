import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import { PANORAMA_URL } from './panorama';

/** fetch what the cockpit needs ahead of time (its picture), so it opens straight away */
export function preloadCockpit() {
  useLoader.preload(TextureLoader, PANORAMA_URL);
}
