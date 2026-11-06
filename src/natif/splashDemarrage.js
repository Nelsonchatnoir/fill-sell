// ═══════════════════════════════════════════════════════════════════════════
// QUAND CACHER L'ÉCRAN DE LANCEMENT (06/11/2026 soir, point 5 de Nico : « aucun utilisateur ne voit jamais une
// ancienne version, même un instant, sans écran bloqué »)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : App.jsx cachait le splash au premier rendu, TOUJOURS. Au premier lancement d'un binaire neuf (installation
// fraîche ou mise à jour du store), Capgo (autoUpdate 'atInstall') télécharge l'OTA plus récente et RECHARGE la page :
// la personne voyait le web embarqué dans le binaire, puis la page se recharger sous ses yeux — le splash était déjà
// parti (le plugin le cache lui-même à la fin de sa vérification, autoSplashscreen, mais seulement si on ne l'a pas
// devancé).
// Maintenant :
//   · une OTA tourne déjà (bundle ≠ 'builtin') : c'est la page définitive → caché tout de suite (comme avant) ;
//   · web embarqué, mais ce binaire a DÉJÀ été lancé sur ce téléphone : 'atInstall' ne recharge plus jamais au
//     lancement → caché tout de suite (aucune attente réseau ajoutée aux lancements ordinaires) ;
//   · web embarqué ET premier lancement de ce binaire : on laisse le splash jusqu'à ce que Capgo dise « prêt »
//     (événement appReady : pas de mise à jour, ou mise à jour appliquée — la nouvelle page cache alors le splash
//     elle-même), au plus PLAFOND_MS. Passé le plafond : caché quand même (jamais d'écran bloqué), et une mise à jour
//     arrivée en retard attend le prochain passage en arrière-plan (setMultiDelay) au lieu de recharger en pleine
//     utilisation.
// Tout échec = caché tout de suite (le comportement d'avant).
export const PLAFOND_MS = 10000;
export const CLE_BINAIRE_LANCE = 'fs_binaire_lance';

export async function cacherSplashAuBonMoment({ natif, SplashScreen, CapacitorUpdater, CapacitorApp, stockage, plafondMs = PLAFOND_MS, attendre = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!natif) return 'web';
  let cache = false;
  const cacher = () => {
    if (cache) return;
    cache = true;
    SplashScreen.hide({ fadeOutDuration: 350 }).catch(() => {});
  };
  try {
    const { bundle } = await CapacitorUpdater.current();
    if (bundle?.id && bundle.id !== 'builtin') { cacher(); return 'ota'; }
    const info = await CapacitorApp.getInfo();
    const binaire = `${info?.version ?? '?'}+${info?.build ?? '?'}`;
    let deja = null;
    try { deja = stockage.getItem(CLE_BINAIRE_LANCE); } catch { /* stockage indisponible : traité comme déjà lancé */ deja = binaire; }
    if (deja === binaire) { cacher(); return 'deja_lance'; }
    try { stockage.setItem(CLE_BINAIRE_LANCE, binaire); } catch { /* sans mémoire : on attend quand même, une fois */ }
    let ecoute = null;
    const pret = new Promise((resolve) => {
      Promise.resolve(CapacitorUpdater.addListener('appReady', () => resolve('pret'))).then((h) => { ecoute = h; }, () => resolve('pret'));
    });
    const issue = await Promise.race([pret, attendre(plafondMs).then(() => 'plafond')]);
    try { await ecoute?.remove?.(); } catch { /* rien */ }
    if (issue === 'plafond') {
      await CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: 'background' }] }).catch(() => {});
    }
    cacher();
    return issue === 'plafond' ? 'premier_lancement_plafond' : 'premier_lancement_pret';
  } catch {
    cacher();
    return 'echec';
  }
}
