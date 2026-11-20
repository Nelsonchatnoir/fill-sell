// VERROU (20/11/2026 nuit, ordre de Nico — compte Business + Cloud Google f5fab0e0) : « PAR CRÉNEAUX » DIT TOUJOURS LE
// GESTE QUI ACTIVE, ET UN COMPTE AUTORISÉ PEUT ACTIVER.
// Le cas : BUSINESS, « Aucune plateforme active », 0/4, « Non réglée » partout, « je ne peux pas l'activer ». Relu :
// palier_de = business, republish_planifiee_etat_multi (en tant que lui, lecture annulée) autorise = true sur les quatre,
// republish_planifiee_regler accepte un Business ; toutes les offres « + Cloud » en base donnent le palier de la formule
// (business_cloud → business, pro_cloud → pro, premium_cloud → premium ; Stripe, Apple, Google). Rejoué sur les VRAIS
// écrans avec son état (scripts/apercu/capture-creneaux-business-cloud.mjs, 412 et 390 px) : l'interrupteur de chaque
// plateforme marche — mais la liste n'avait AUCUN geste (0 interrupteur, rien ne disait d'ouvrir une plateforme).
// Rouge sur 9459cd0, vert après.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, ko = 0;
const verifier = (c, m, d = '') => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 240)}` : ''}`); } };
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const RP = await vite.ssrLoadModule('/src/components/RepublicationPlanifiee.jsx');
  // L'état relu le 20/11 (champs lus par l'écran seulement, aucune donnée personnelle).
  const pf = (platform, autorise, enLigne, actif = false, ouverte = true) => ({
    platform, actif, autorise, configure: actif, ouverte, moteur: 'aucun', reglage: actif ? { actif: true, creneau: 'soir', de: '19:00', a: '22:00', jours: [1, 2, 3, 4, 5, 6, 7] } : null,
    legacy: null, palier: autorise ? 'business' : 'free', annonces_en_ligne: enLigne, quota_mensuel: null, faits_mois: null,
  });
  const etat = (autorise, actifVinted = false) => {
    const pfs = [pf('vinted', autorise, 113, actifVinted), pf('leboncoin', autorise, 110), pf('beebs', autorise, 0), pf('opla', autorise, 0, false, false), pf('depop', autorise, 0)];
    return { palier: autorise ? 'business' : 'free', autorise, interrupteur_global: 1, actives: pfs.filter((p) => p.actif).length, enveloppe: { crees_compte: 0 }, plateformes: pfs };
  };
  const parPf = (m) => Object.fromEntries((m?.plateformes ?? []).map((p) => [p.platform, p]));
  const liste = (m, lecture = 'ok') => renderToStaticMarkup(React.createElement(RP.RepublicationPlanifieePlateformes, {
    lang: 'fr', etatMulti: m, parPlateforme: m ? parPf(m) : null, sessions: {}, interrupteur: 1, extensionStatus: null, busy: false, erreur: null,
    palierApp: 'business', lecture, onReessayer: () => {}, plateformesCompte: ['vinted', 'leboncoin', 'beebs', 'depop'],
  }));
  const geste = (html) => html.includes('data-geste-activer');

  const b = liste(etat(true));
  verifier(/BUSINESS|Business/.test(b) && /Aucune plateforme active/.test(b) && /0\/4/.test(b), 'rejeu f5fab0e0 : la liste du client (Business, aucune active, 0/4)');
  verifier(!/role="switch"/.test(b), '… aucun interrupteur sur cette liste (le cas)');
  verifier(geste(b) && /touche une plateforme ci-dessous, puis son interrupteur/.test(b.replace(/&#x27;|&#39;|’/g, "'")), '… le geste qui active est DIT');
  verifier(!geste(liste(etat(true, true))), 'une plateforme active : plus de phrase (l’interrupteur du haut existe)');
  verifier(!geste(liste(etat(false))), 'compte non autorisé : l’aperçu et l’offre, jamais cette phrase');
  verifier(!geste(liste(null, 'en_cours')) && !geste(liste(null, 'echec')), 'état pas encore lu ou illisible : rien d’affirmé');

  // L'écran d'une plateforme : l'interrupteur d'un compte autorisé n'est jamais grisé.
  const ecranPf = (e) => renderToStaticMarkup(React.createElement(RP.RepublicationPlanifieeReglages, {
    lang: 'fr', platform: 'vinted', session: null, etat: e, interrupteur: 1, extensionStatus: null, busy: false, erreur: null,
    regler: async () => ({ ok: true }), onClose: () => {}, onOuvrirHistorique: () => {}, palierApp: 'business', lecture: 'ok',
  }));
  const sw = (ecranPf(parPf(etat(true)).vinted).match(/<button[^>]*role="switch"[^>]*>/) ?? [''])[0];
  verifier(sw && !/\sdisabled(=|\s|>)/.test(sw), 'écran Vinted d’un Business : interrupteur actif (non grisé)', sw);
} finally {
  await vite.close();
}
console.log(ko ? `✗ creneaux-geste-activer-2011 : ${ok}/${ok + ko}` : `✓ creneaux-geste-activer-2011 : ${ok}/${ok}`);
process.exit(ko ? 1 : 0);
