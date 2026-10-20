import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (docs/plans/2026-10-21-android.md): the web build (dist/),
// bundled into the app and played in a WebView of its own, offline.
const config: CapacitorConfig = {
  appId: 'io.github.idanbenzvi.multiplicationrocket',
  appName: 'Multiplication Rocket',
  webDir: 'dist',
  backgroundColor: '#241b3f',
};

export default config;
