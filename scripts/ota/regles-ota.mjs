// ════════════════════════════════════════════════════════════════════════════
// RÈGLES DE L'ENVOI OTA (pures, sans réseau) — lues par scripts/ota/publier-ota.mjs, éprouvées par
// scripts/ota/regles-ota-selftest.mjs (npm run selftest:ota-garde).
//
// Pourquoi (08/11/2026, ordre de Nico : « on doit pouvoir publier une OTA à tout moment ») : le binaire Android
// vc37 avait monté @capgo/capacitor-updater 8.51.2 → 8.53.1 dans package.json ; l'OTA se construit depuis le MÊME
// package.json, donc la prochaine OTA aurait déclaré un module natif que AUCUN téléphone n'a (3 280 appareils lus
// chez Capgo le 08/11 : tous en 8.51.2). Règle : une OTA ne part que si CHAQUE module natif est identique à celui
// du bundle en service sur le canal (vérification Capgo « bundle compatibility »), sinon elle est refusée.
// Un module natif ne change qu'avec un binaire neuf ET un canal qui ne sert ce binaire qu'à lui (décision de Nico).
// ════════════════════════════════════════════════════════════════════════════

/** Version du CLI Capgo, épinglée (un CLI neuf peut changer son affichage ou ses contrôles). */
export const CLI_CAPGO = '@capgo/cli@8.101.1';
export const CANAL = 'production';
// (19/11/2026, ordre de Nico) LE CANAL DE TEST : une OTA part d'abord sur ce canal, attribué à l'appareil de Nico seul
// (canal non public, aucune auto-inscription ; iPhone b1e74335-…, iOS 18.7.3, et Android 68328933-…, Android 11,
// reconnus chez Capgo le 19/11 à l'ouverture de l'app à heure connue — l'iPhone par deux
// ouvertures de l'app à heure connue), l'essai réel se fait dessus, puis `--promouvoir` sert le MÊME bundle sur
// production (aucun rebuild). Le push sur main (qui met le web de tous à jour) attend l'essai : décision de Nico du 19/11.
export const CANAL_TEST = 'test';
export const APPAREILS_TEST = ['b1e74335-c941-461a-9856-d036495383b7', '68328933-f638-46ef-8e62-4e2d91a82c89'];
export const APP_ID = 'app.fillsell.app';

/** « 2.9.168 » → [2, 9, 168] ; null si ce n'est pas une version x.y.z. */
export function decouperVersion(v) {
  const m = String(v ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1 / 0 / 1 ; null si l'une des deux n'est pas lisible. */
export function comparerVersions(a, b) {
  const x = decouperVersion(a);
  const y = decouperVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const nettoyer = (t) => String(t ?? '').replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Lit la sortie de `bundle compatibility --text`. Fermée par défaut : un affichage illisible = refus.
 * @returns {{ lisible: boolean, toutCompatible: boolean, modules: Array<{ nom, local, distant, statut, detail }>, incompatibles: Array }}
 */
export function lireCompatibilite(sortie) {
  const lignes = nettoyer(sortie).split(/\r?\n/);
  const modules = [];
  for (const ligne of lignes) {
    // « │  │ @capgo/x │ 8.51.2 │ 8.51.2 │ OK │ Compatible │ » → ['', '', nom, local, distant, statut, détail, ''] :
    // on retire ce qui précède le 1er trait et suit le dernier, puis la colonne vide du cadre ; une case vide AU MILIEU
    // (module absent du canal) garde sa place.
    const utiles = ligne.split('│').map((c) => c.trim()).slice(1, -1);
    if (utiles[0] === '') utiles.shift();
    if (utiles.length < 5) continue;
    const [nom, local, distant, statut, ...reste] = utiles;
    if (!nom || nom === 'Package' || !/^[@a-z0-9]/i.test(nom)) continue;
    modules.push({ nom, local, distant, statut, detail: reste.join(' ').trim() });
  }
  const phraseOk = /All packages are compatible with channel/i.test(nettoyer(sortie));
  const incompatibles = modules.filter((m) => m.statut !== 'OK' && m.statut !== '✅');
  const lisible = modules.length > 0;
  return { lisible, toutCompatible: lisible && phraseOk && incompatibles.length === 0, modules, incompatibles };
}

/**
 * Décision AVANT le build et l'envoi. Rend la liste des refus (vide = la voie est libre).
 * `canal` : production (défaut) ou CANAL_TEST. Sur le canal de test, le commit peut ne pas être poussé (le web attend
 * l'essai), mais il doit CONTENIR origin/main (`aJour`) : l'essai porte tout ce qui est déjà en ligne.
 * `versionCanal` : la plus haute des versions servies (production ET test) — un numéro ne sert jamais deux fois.
 * @param {{ canal?, branche, propre, poussee, aJour?, worktree, versionPkg, versionLock, versionCanal, versionsBinaires, compat }} e
 */
export function refusAvantEnvoi(e) {
  const refus = [];
  const test = (e.canal ?? CANAL) === CANAL_TEST;
  if (e.canal != null && e.canal !== CANAL && !test) refus.push(`canal « ${e.canal} » inconnu : production ou ${CANAL_TEST}.`);
  if (e.branche !== 'main') refus.push(`branche « ${e.branche} » : une OTA ne part que de main.`);
  if (e.worktree) refus.push('lancé depuis un worktree : OTA jamais depuis un worktree (empreintes natives fausses, 2.9.46).');
  if (!e.propre) refus.push('arbre sale : le build porterait « -dirty » (commiter ou ranger d\'abord).');
  if (test) { if (!e.aJour) refus.push('main local ne contient pas origin/main : se mettre à jour (merge, jamais un rebase d\'un commit déjà envoyé) avant l\'OTA de test.'); }
  else if (!e.poussee) refus.push('main local ≠ origin/main : pousser (ou se mettre à jour) avant l\'OTA, le web et l\'OTA portent le même code.');
  if (!decouperVersion(e.versionPkg)) refus.push(`version de package.json illisible (« ${e.versionPkg} »).`);
  if (e.versionLock !== e.versionPkg) refus.push(`package-lock.json (${e.versionLock}) ≠ package.json (${e.versionPkg}) : npm install --package-lock-only, puis commit.`);
  const c = comparerVersions(e.versionPkg, e.versionCanal);
  if (c === null) refus.push(`version du canal illisible (« ${e.versionCanal} »).`);
  else if (c <= 0) refus.push(`version ${e.versionPkg} ≤ canal ${e.versionCanal} : monter la version (un numéro consommé ne se réutilise jamais).`);
  // Un numéro de binaire (Android build.gradle versionName, iOS codemagic.yaml) n'est jamais celui d'une OTA : le
  // téléphone qui a ce binaire la prendrait pour son propre bundle embarqué (2.9.167 = le binaire Android vc37).
  for (const vb of [].concat(e.versionsBinaires ?? [])) {
    const cb = comparerVersions(e.versionPkg, vb);
    if (cb === null) refus.push(`version de binaire illisible (« ${vb} »).`);
    else if (cb <= 0) refus.push(`version ${e.versionPkg} ≤ binaire ${vb} : une OTA porte un numéro AU-DESSUS du dernier binaire.`);
  }
  if (!e.compat?.lisible) refus.push('vérification de compatibilité Capgo illisible : refus par prudence.');
  else if (!e.compat.toutCompatible) {
    const liste = e.compat.incompatibles.map((m) => `${m.nom} ${m.distant} → ${m.local}`).join(', ') || 'phrase « All packages are compatible » absente';
    refus.push(`module(s) natif(s) différent(s) de ceux du canal : ${liste}. Aucune OTA ne doit atteindre un binaire qui n'a pas ce module : revenir à la version du canal.`);
  }
  return refus;
}

/**
 * (19/11/2026) Servir sur production le bundle ESSAYÉ sur le canal de test (`npm run ota -- --promouvoir`), sans rebuild.
 * Refus : main non poussé ou sale ; le canal de test ne sert pas la version de package.json ; version ≤ production ;
 * le commit du bundle (son commentaire Capgo) n'est pas dans origin/main (le web porterait un autre code) ; modules
 * natifs différents de production.
 * @param {{ branche, propre, poussee, versionPkg, versionTest, versionProd, commitBundle, commitDansMain, compat }} e
 */
export function refusPromotion(e) {
  const refus = [];
  if (e.branche !== 'main') refus.push(`branche « ${e.branche} » : une OTA ne part que de main.`);
  if (!e.propre) refus.push('arbre sale : ranger d\'abord.');
  if (!e.poussee) refus.push('main local ≠ origin/main : pousser AVANT de servir production (le web et l\'app portent le même code).');
  if (!decouperVersion(e.versionPkg)) refus.push(`version de package.json illisible (« ${e.versionPkg} »).`);
  if (e.versionTest !== e.versionPkg) refus.push(`le canal ${CANAL_TEST} sert « ${e.versionTest} », pas ${e.versionPkg} : seule la version essayée passe en production.`);
  const c = comparerVersions(e.versionPkg, e.versionProd);
  if (c === null) refus.push(`version de production illisible (« ${e.versionProd} »).`);
  else if (c <= 0) refus.push(`version ${e.versionPkg} ≤ production ${e.versionProd} : rien à promouvoir.`);
  if (!e.commitBundle) refus.push('commit du bundle illisible chez Capgo : refus par prudence.');
  else if (!e.commitDansMain) refus.push(`le commit du bundle (${e.commitBundle}) n'est pas dans origin/main : le web porterait un autre code.`);
  if (!e.compat?.lisible) refus.push('vérification de compatibilité Capgo illisible : refus par prudence.');
  else if (!e.compat.toutCompatible) refus.push(`module(s) natif(s) différent(s) de production : ${e.compat.incompatibles.map((m) => m.nom).join(', ') || 'phrase absente'}.`);
  return refus;
}

/** Le build web doit porter le commit exact, sans « -dirty ». */
export function buildConforme(empreinte, commitCourt) {
  const e = String(empreinte ?? '');
  return Boolean(commitCourt) && e.endsWith(`+${commitCourt}`) && !/dirty/i.test(e);
}
