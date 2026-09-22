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
      // ⛔ launchAutoHide PASSE À false (2026-09-22) — EXIGENCE DU PLUGIN.
      // `autoSplashscreen` (CapacitorUpdater, plus bas) ne s'active QUE si le
      // splash n'est pas auto-masqué : c'est lui qui doit tenir l'écran
      // pendant que la mise à jour du premier lancement s'applique. Avec
      // launchAutoHide:true, le splash tombait au bout de launchShowDuration
      // et la personne voyait la webview se recharger sous ses yeux.
      //
      // ⚠️ ON PERD LE PLAFOND `launchShowDuration` (ignoré quand l'auto-hide
      //    est coupé). Deux ceintures le remplacent, et il en faut DEUX parce
      //    qu'un splash sans fin est un écran bloqué :
      //      1. `autoSplashscreenTimeout` (10 s) — le plugin rend la main même
      //         si le téléchargement traîne, et reporte la pose au prochain
      //         passage en arrière-plan ;
      //      2. `SplashScreen.hide()` dans App.jsx, au premier render. VÉRIFIÉ
      //         le 22/09 : sur natif, `/` redirige vers `/login`, qui monte
      //         <App loginOnly> — et `/app` monte <App>. Les deux seules
      //         portes d'entrée natives montent donc App, et l'effet part.
      launchAutoHide: false,
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
      // ══ LE NOUVEL INSCRIT DÉMARRE SUR LE CODE DU JOUR (2026-09-22) ══════
      // MESURÉ : 26 inscrits depuis le 20/09 ont fait TOUTE leur première
      // session sur le bundle du 16/09 embarqué dans le binaire 2.7 — ancien
      // parcours d'entrée, ancien bouton « Synchroniser mon compte Vinted »,
      // premier relevé compris. 4 d'entre eux n'ont JAMAIS basculé (aucune
      // seconde session), dont un avec 11 gestes journalisés. Pour ceux qui
      // ont basculé : médiane ~6 h, jusqu'à 45 h.
      // Cause : 'atBackground' télécharge au lancement mais n'APPLIQUE qu'au
      // prochain passage en arrière-plan. Le premier lancement — le seul qui
      // décide si la personne reste — se fait donc toujours en retard.
      //
      // 'atInstall' = applique TOUT DE SUITE, mais uniquement après une
      // installation fraîche ou une mise à jour du store ; ensuite le plugin
      // reprend exactement le comportement 'atBackground'.
      // ⛔ CE N'EST PAS 'always' NI 'onLaunch', et c'est le cœur du réglage :
      //    'always' recharge la webview à CHAQUE retour au premier plan, et
      //    'onLaunch' à chaque démarrage à froid — les deux peuvent couper un
      //    cross-post en vol ou vider un formulaire en pleine saisie. Avec
      //    'atInstall' il n'existe qu'UN seul rechargement possible, celui du
      //    tout premier lancement, quand il n'y a encore ni saisie ni file.
      autoUpdate: 'atInstall',
      // Le splash tient l'écran pendant ce rechargement-là : ni écran blanc,
      // ni webview qui se recharge à vue. Exige launchAutoHide:false (ci-dessus).
      autoSplashscreen: true,
      // Un indicateur natif pendant le téléchargement. Le splash reste muet
      // par ailleurs (showSpinner:false) : ce loader-ci ne se montre QUE
      // pendant une mise à jour directe, donc au premier lancement — quelques
      // secondes d'attente sans rien à l'écran se lisent comme un plantage.
      autoSplashscreenLoader: true,
      // La borne qui interdit le splash sans fin : passé ce délai, le plugin
      // rend la main, l'app démarre sur le bundle embarqué, et la mise à jour
      // s'appliquera au prochain passage en arrière-plan — le comportement
      // d'avant, jamais un blocage.
      autoSplashscreenTimeout: 10000,
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
