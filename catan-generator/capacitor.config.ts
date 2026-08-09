import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Hex Settlement Coach — iOS shell.
 * Generate the native project on a Mac: `npm run cap:add:ios` then `npm run build:ios`.
 */
const config: CapacitorConfig = {
  appId: 'com.hexsettlement.coach',
  appName: 'Hex Settlement Coach',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#1a3a4a',
    },
  },
};

export default config;
