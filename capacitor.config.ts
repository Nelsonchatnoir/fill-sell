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
      // 2000 ms n'est plus la durée réelle : App.jsx appelle SplashScreen.hide()
      // au premier render, bien avant. Ce couple est voulu — launchAutoHide:true
      // + launchShowDuration = PLAFOND de sécurité si le render n'arrive jamais
      // (un splash sans plafond = écran bloqué, pas une lenteur).
      launchAutoHide: true,
      launchShowDuration: 2000,
      // Fondu du splash système Android 12+ à la fermeture (l'API launch ignore
      // le fadeOutDuration passé à hide() — c'est CETTE clé qui agit là-bas).
      launchFadeOutDuration: 350,
      // ink #10201B du design system — glyphe blanc pur sur fond noir (parti
      // pris du 26/07, remplace l'aplat teal #2F9E90). Doit rester égal à
      // @color/fs_splash_background (Android) et au fond des splash-2732x2732
      // (iOS) : c'est la couleur qui s'affiche avant et autour de l'image,
      // tout écart se voit au lancement.
      backgroundColor: '#10201B',
      // Sans ça le plugin étire le splash (FIT_XY par défaut) : sur un écran
      // 9:20 les assets 9:16 déformaient le logo. CENTER_CROP le laisse
      // proportionné et rogne le fond uni, ce qui ne se voit pas.
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
