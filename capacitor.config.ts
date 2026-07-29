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
    // ── Capgo live updates (2026-07-29) ─────────────────────────────────────
    // AUCUN SECRET ICI, et il n'en faut aucun : au runtime l'app s'identifie
    // par son appId auprès de plugin.capgo.app (updateUrl par défaut, laissé
    // tel quel). La clé API Capgo ne sert QU'AU CLI, à l'upload d'un bundle,
    // côté CI — jamais embarquée dans le binaire.
    CapacitorUpdater: {
      // 'atBackground' = le défaut du plugin, et le moins brutal : le bundle
      // est téléchargé en tâche de fond, puis appliqué au PROCHAIN passage en
      // arrière-plan. L'utilisateur ne voit jamais l'app se recharger sous ses
      // doigts en pleine publication. ('always' appliquerait immédiatement à
      // chaque retour au premier plan — à proscrire ici : un cross-post en
      // cours ne doit pas être interrompu par un rechargement de webview.)
      autoUpdate: 'atBackground',
      // Le canal doit EXISTER sous ce nom exact côté Capgo, sinon le serveur
      // ne renvoie jamais de bundle et les updates ne partent tout simplement
      // pas — en silence, sans erreur visible côté app.
      defaultChannel: 'production',
      // Fenêtre de rollback : délai laissé au JS pour appeler notifyAppReady
      // (src/main.jsx, 1re instruction). Au-delà, le natif considère le bundle
      // comme mort-né et revient au précédent. 10 s = le défaut, largement
      // suffisant ici puisque l'acquittement part avant tout appel réseau.
      appReadyTimeout: 10000,
      // Une mise à jour NATIVE (nouveau binaire App Store / Play) purge les
      // bundles OTA téléchargés. C'est le comportement voulu : le code livré
      // par le store fait toujours autorité sur un OTA plus ancien.
      resetWhenUpdate: true,
    },
  },
};

export default config;
