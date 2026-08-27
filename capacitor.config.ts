import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuracao para empacotar o PWA como app nativo.
 *
 * O app funciona como PWA sem nada disto. Quando quiser um APK instalavel:
 *
 *   npm install @capacitor/core @capacitor/cli @capacitor/android
 *   npm run build
 *   npx cap add android
 *   npx cap sync
 *   npx cap open android
 *
 * Para iOS troque android por ios (exige macOS com Xcode).
 */
const config: CapacitorConfig = {
  appId: 'app.championslab.vgc',
  appName: 'Champions Lab',
  webDir: 'dist',
  android: {
    // O app usa HashRouter, entao nao depende de reescrita de rota do servidor.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
