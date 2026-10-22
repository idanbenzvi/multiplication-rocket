import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (docs/plans/2026-10-21-android.md): the web build (dist/),
// bundled into the app and played in a WebView of its own, offline.
const config: CapacitorConfig = {
  appId: 'com.falcondeergames.multiplicationrocket',
  appName: 'Multiplication Rocket',
  webDir: 'dist',
  backgroundColor: '#241b3f',
  plugins: {
    // the app plays fullscreen (MainActivity hides the bars); the WebView keeps clear of a camera
    // cut-out natively, and follows viewport-fit=cover where it can (Chromium 140 and up)
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
