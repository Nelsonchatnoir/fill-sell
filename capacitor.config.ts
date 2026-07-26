import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.fillsell.app',
  appName: 'FillSell',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  // (bloc ios.orientation retiré le 2026-07-26 : la clé n'existe pas dans le
  // type iOS de Capacitor — tsc la rejetait — et n'a jamais rien fait. Le
  // portrait iOS est imposé par UISupportedInterfaceOrientations dans
  // ios/App/App/Info.plist, pas ici.)
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      // teal #2F9E90 du design system — remplace #1D9E75, un vert hérité qui
      // n'était plus dans la charte. Doit rester égal à @color/fs_splash_background
      // (Android) et au fond des splash-2732x2732 (iOS) : c'est la couleur qui
      // s'affiche avant et autour de l'image, tout écart se voit au lancement.
      backgroundColor: '#2F9E90',
      // Sans ça le plugin étire le splash (FIT_XY par défaut) : sur un écran
      // 9:20 les assets 9:16 déformaient le logo. CENTER_CROP le laisse
      // proportionné et rogne le fond uni, ce qui ne se voit pas.
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
