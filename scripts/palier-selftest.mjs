// Autotest du PALIER (04/10/2026, Louis, compte Business).
//
//     node --import ./scripts/loader-ext.mjs scripts/palier-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. UN calcul de palier (src/utils/palier.js), emboîté : Business ⇒ Pro ⇒
//      Premium. Un Business sans le drapeau is_pro garde les droits Pro ;
//      is_founder et les identifiants de store ne valent jamais un palier ;
//   1 bis. l'option Cloud (conception du 04/10) : seule sur un compte Free ou en
//      plus d'un palier, essai de 7 jours, un seul par compte, arrêt immédiat en essai ;
//   2. ce calcul est le SEUL : l'app ne pose plus trois drapeaux à la main
//      (setIsPro/setIsPremium/setIsBusiness), et aucun écran ne recalcule
//      « business ? pro ? premium » de son côté ;
//   3. le droit à la republication automatique : le serveur fait foi QUAND il
//      a répondu ; sans réponse (lecture en cours ou ratée), aucun refus ;
//   4. les ÉCRANS, rendus pour de vrai (Vite SSR + react-dom/server) pour
//      Premium, Pro et Business — chargé, en lecture, lecture ratée :
//        · Business en lecture : ni « Réservée au plan Pro » ni « Non réglée »,
//          la pastille dit « Business » (c'était l'écran de Louis le 04/10) ;
//        · « Non réglée » se lit sur `configure` de CHAQUE plateforme ;
//        · Premium chargé : le refus est dit (c'est vrai pour lui) ;
//   5. la publication en lot est NOMMÉE sur le Stock (« Publier plusieurs
//      articles d'un coup ») et n'est gardée par AUCUN palier ;
//   6. « Dupliquer » n'est gardé par aucun palier (seul le plafond de stock
//      du compte gratuit, comme tout ajout).
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => {
  if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); }
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lignesDeCode = (texte) => texte.split('\n').filter((l) => {
  const t = l.trim();
  return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*');
});

const P = await charger('src/utils/palier.js');
const L = await charger('src/publication/lot/regles.js');

// ── 1. Le calcul, emboîté ────────────────────────────────────────────────────
{
  const cas = [
    [{}, 'gratuit'],
    [{ is_founder: true, apple_original_transaction_id: 'x', google_purchase_token: 'y' }, 'gratuit'],
    [{ is_comped: true }, 'premium'],
    [{ is_premium: true }, 'premium'],
    [{ is_premium: true, is_pro: true }, 'pro'],
    [{ is_pro: true }, 'pro'],
    [{ is_premium: true, is_pro: true, is_business: true }, 'business'],   // Louis
    [{ is_business: true }, 'business'],                                    // drapeaux incomplets
    [{ is_premium: true, is_business: true }, 'business'],
  ];
  for (const [profil, attendu] of cas) {
    verifier(P.palierDuProfil(profil) === attendu, `palierDuProfil(${JSON.stringify(profil)}) = ${attendu}`, P.palierDuProfil(profil));
  }
  verifier(egal(P.droitsDuPalier('business'), { isPremium: true, isPro: true, isBusiness: true }), 'Business a TOUT ce qu’a Pro et Premium');
  verifier(egal(P.droitsDuPalier('pro'), { isPremium: true, isPro: true, isBusiness: false }), 'Pro a tout ce qu’a Premium');
  verifier(egal(P.droitsDuPalier('premium'), { isPremium: true, isPro: false, isBusiness: false }), 'Premium seul');
  verifier(egal(P.droitsDuPalier('gratuit'), { isPremium: false, isPro: false, isBusiness: false }), 'gratuit : rien');
  verifier(P.aAuMoins('business', 'pro') && P.aAuMoins('pro', 'premium') && !P.aAuMoins('premium', 'pro'), 'aAuMoins suit l’ordre des paliers');
  verifier(P.aAuMoins('free', 'gratuit') && !P.aAuMoins('free', 'premium'), 'le « free » du serveur se lit comme « gratuit »');
  verifier(P.palierNormalise('inconnu') === null && P.palierNormalise(undefined) === null, 'un palier inconnu n’est pas deviné');
  verifier(P.palierLePlusHaut('business', 'pro') === 'business' && P.palierLePlusHaut('premium', 'pro') === 'pro', 'un achat ne fait jamais descendre le palier');
  for (const pal of P.PALIERS) {
    const d = P.droitsDuPalier(pal);
    verifier(L.palierCourant(d) === pal && P.palierDesDrapeaux(d) === pal, `le lot et l’app lisent le même palier (${pal})`);
  }
  verifier(L.PALIERS === P.PALIERS, 'le lot n’a plus sa propre liste de paliers');
}

// ── 1 bis. L'option Cloud (conception du 04/10, décisions finales du soir) ──
// Le Cloud n'est pas un palier : une option, SEULE sur un compte Free (qui garde
// ses quotas Free) ou en plus d'un palier payant ; essai de 7 jours, un seul par
// compte ; arrêtée pendant l'essai : tout de suite ; payée : jusqu'à la fin de
// la période ; résilier la formule ne l'arrête pas.
{
  const t = (iso) => Date.parse(iso);
  const n = t('2026-10-10T12:00:00Z');
  const essai = { cloud_essai_debut: '2026-10-08T10:00:00Z', cloud_essai_fin: '2026-10-15T10:00:00Z' };
  const passe = { cloud_essai_debut: '2026-09-01T00:00:00Z', cloud_essai_fin: '2026-09-08T00:00:00Z' };
  const cas = [
    [{}, 'aucun', false],
    [{ is_premium: true }, 'aucun', false],
    [{ is_premium: true, ...essai }, 'essai', true],
    [{ is_business: true, ...essai }, 'essai', true],
    [{ ...essai }, 'essai', true],                                        // Free + essai : tourne (04/10 soir)
    [{ is_pro: true, is_cloud: true }, 'paye', true],
    [{ is_cloud: true }, 'paye', true],                                   // formule résiliée : Free + Sans ordinateur continue
    [{ is_founder: true, is_cloud: true }, 'paye', true],                 // is_founder ne change rien à l'option
    [{ is_premium: true, ...passe }, 'essai_termine', false],
    [{ ...essai, cloud_essai_arrete: true }, 'essai_termine', false],    // arrêtée pendant l'essai : tout de suite
    [{ is_premium: true, is_cloud: true, ...passe }, 'paye', true],
  ];
  for (const [profil, etat, actif] of cas) {
    const c = P.cloudDuProfil(profil, n);
    verifier(c.etat === etat && c.actif === actif, `cloudDuProfil(${JSON.stringify(profil)}) = ${etat}`, JSON.stringify(c));
  }
  verifier(P.CLOUD_EXIGE_UN_PALIER === false, 'le Cloud se prend sans formule (décision du 04/10 soir)');
  verifier(P.cloudDuProfil({ ...essai }, n).avecFormule === false && P.cloudDuProfil({ is_pro: true, ...essai }, n).avecFormule === true,
    'avecFormule dit Free + option ou formule + option');
  const arret = P.cloudDuProfil({ is_cloud: true, cloud_periode_fin: '2026-11-08T10:00:00Z', cloud_arret_fin_periode: true }, n);
  verifier(arret.etat === 'paye' && arret.actif === true && arret.arretPrevuLe === '2026-11-08T10:00:00.000Z',
    'payée et arrêtée : elle tourne jusqu’à la fin de la période, qui est dite', JSON.stringify(arret));
  verifier(P.cloudDuProfil({ is_cloud: true, cloud_periode_fin: '2026-11-08T10:00:00Z' }, n).arretPrevuLe === null, 'sans arrêt demandé, aucune date d’arrêt');
  verifier(P.cloudDuProfil({ ...essai, cloud_essai_arrete: true }, n).essaiArrete === true, 'l’essai arrêté par la personne se dit comme tel');
  verifier(P.cloudDuProfil({ is_premium: true, ...essai }, n).joursRestants === 5, 'essai : jours restants arrondis au jour entamé (J-5)');
  verifier(P.cloudDuProfil({ is_premium: true, ...essai }, t('2026-10-15T09:59:00Z')).joursRestants === 1, 'dernière minute de l’essai : J-1, jamais J-0');
  verifier(P.cloudDuProfil({ is_premium: true, ...essai }, t('2026-10-15T10:00:00Z')).etat === 'essai_termine', 'à l’heure de fin, l’essai est terminé');
  verifier(P.cloudDuProfil({ is_premium: true, ...essai }, '2026-10-10T12:00:00Z').etat === 'essai', 'l’instant se lit en nombre comme en texte');
  verifier(P.essaiCloudProposable({}, n) && P.essaiCloudProposable({ is_premium: true }, n)
    && !P.essaiCloudProposable({ ...essai }, n) && !P.essaiCloudProposable({ is_premium: true, ...passe }, n),
    'essai proposable au Free comme aux payants, et un seul par compte');
  const d = P.droitsDuCompte({ is_business: true, is_cloud: true }, n);
  verifier(d.palier === 'business' && d.isPro === true && d.cloud.actif === true, 'droitsDuCompte : le palier emboîté ET l’option', JSON.stringify(d));
  const dFree = P.droitsDuCompte({ is_cloud: true }, n);
  verifier(dFree.palier === 'gratuit' && dFree.isPremium === false && dFree.cloud.actif === true, 'Free + Sans ordinateur : quotas Free, option active', JSON.stringify(dFree));
  verifier(egal(P.PALIERS, ['gratuit', 'premium', 'pro', 'business']), 'le Cloud n’ajoute aucun palier');
  verifier(P.CLOUD_ESSAI_JOURS === 7 && P.CLOUD_PRIX_AFFICHE === '20 €', 'essai 7 jours, 20 € affichés (décision Nico du 04/10)');
}

// ── 2. Un seul calcul, nulle part ailleurs ───────────────────────────────────
{
  const app = lignesDeCode(lire('src/App.jsx')).join('\n');
  verifier(!/setIsPro\(|setIsPremium\(|setIsBusiness\(/.test(app), 'l’app ne pose plus trois drapeaux à la main');
  verifier(/droitsDuPalier\(palier\)/.test(app) && /palierDuProfil\(p\.data\)/.test(app), 'l’app dérive isPremium/isPro/isBusiness du palier lu sur profiles');
  const fichiers = [];
  const parcourir = (d) => {
    for (const e of fs.readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) parcourir(p);
      else if (/\.(jsx?|mjs)$/.test(e.name) && p !== 'src/utils/palier.js') fichiers.push(p);
    }
  };
  parcourir('src');
  const fautifs = [];
  for (const f of fichiers) {
    const code = lignesDeCode(lire(f)).join('\n');
    if (/isBusiness\s*\?\s*['"]business['"]\s*:\s*isPro\s*\?/.test(code)) fautifs.push(`${f} (recalcule le palier)`);
    if (/isBusiness\s*\?\s*3\s*:\s*isPro\s*\?\s*2/.test(code)) fautifs.push(`${f} (recalcule le rang)`);
    if (/\.palier\s*===\s*['"]business['"]\s*\?\s*['"]Business['"]\s*:\s*['"]Pro['"]/.test(code)) fautifs.push(`${f} (nom du palier sans repli)`);
    if (/etat(Multi)?\?\.autorise\s*===\s*true\s*\|\|/.test(code)) fautifs.push(`${f} (droit sans repli sur le palier)`);
  }
  verifier(fautifs.length === 0, 'aucun écran ne recalcule le palier de son côté', fautifs.join(' · '));
}

// ── 3. Le droit à la republication automatique ───────────────────────────────
const { droitRepublication } = await charger('src/hooks/useRepublicationPlanifiee.js');
{
  const d0 = droitRepublication(null, { palierApp: 'business', lecture: 'en_cours' });
  verifier(d0.connu === false && d0.refuse === false && d0.autorise === null && d0.nomPalier === 'Business' && d0.lecture === 'en_cours',
    'Business, état pas encore lu : rien n’est refusé, la pastille dit Business', JSON.stringify(d0));
  const d1 = droitRepublication(null, { palierApp: 'business', lecture: 'echec' });
  verifier(d1.refuse === false && d1.lecture === 'echec', 'Business, lecture ratée : toujours aucun refus');
  const d2 = droitRepublication({ error: 'unauthorized' }, { palierApp: 'pro' });
  verifier(d2.connu === false && d2.refuse === false, 'une réponse d’erreur du serveur n’est pas un refus');
  const d3 = droitRepublication({ palier: 'premium', autorise: false }, { palierApp: 'premium' });
  verifier(d3.connu && d3.refuse === true && d3.nomPalier === 'Pro', 'Premium lu : refusé, et le module se dit « Pro »');
  const d4 = droitRepublication({ palier: 'business', autorise: true }, { palierApp: 'gratuit' });
  verifier(d4.autorise === true && d4.nomPalier === 'Business', 'le serveur fait foi quand il a répondu');
  const d5 = droitRepublication({ palier: 'pro', autorise: true });
  verifier(d5.autorise === true && d5.nomPalier === 'Pro', 'Pro lu : autorisé');
}

// ── 4. Les écrans, rendus ────────────────────────────────────────────────────
// Vite SSR transforme le JSX et résout les imports de src/ ; react-dom/server
// rend le HTML. createPortal est remplacé par un rendu en place (le portail
// n'existe pas côté serveur) — c'est le CONTENU qu'on vérifie.
// `createPortal(…, document.body)` évalue son second argument : un `document`
// minimal suffit (le portail est rendu en place, document.body n'est jamais lu).
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const portail = join(ROOT, 'scripts/lib/portail-en-place.mjs');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: portail }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const RP = await vite.ssrLoadModule('/src/components/RepublicationPlanifiee.jsx');
  const H = await vite.ssrLoadModule('/src/stock/Haut.jsx');
  const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  // Un état serveur au FORMAT de republish_planifiee_etat_multi() — calqué sur
  // celui de Louis le 04/10 (Leboncoin, Beebs, Opla réglés 19h–22h, Vinted
  // jamais réglé), sans aucune donnée personnelle.
  const reglage = (jours) => ({ a: '22:00', de: '19:00', actif: true, creneau: 'soir', fuseau: 'Europe/Paris', jours, ordre: 'anciennes', age_jours: 7, plafond_jour: 100000, plafond_boutique: {} });
  const pfEtat = (platform, palier, autorise, r) => ({
    platform, palier, autorise, ouverte: true, configure: r != null, actif: r?.actif === true, reglage: r,
    plafond_palier: palier === 'business' ? 100000 : 50, annonces_en_ligne: 12, attendu: 3, borne: 'eligibles',
    fenetre: { dans_creneau: false, prochain_debut: '2026-10-04T17:00:00Z', prochain_fin: '2026-10-04T20:00:00Z' },
  });
  const etatMulti = (palier, autorise, avecReglages) => {
    const pfs = [
      pfEtat('vinted', palier, autorise, null),
      pfEtat('leboncoin', palier, autorise, avecReglages ? reglage([1, 5]) : null),
      pfEtat('beebs', palier, autorise, avecReglages ? reglage([2, 6]) : null),
      pfEtat('opla', palier, autorise, avecReglages ? reglage([3, 7]) : null),
    ];
    return { palier, autorise, plafond_palier: pfs[0].plafond_palier, interrupteur_global: 1, actives: pfs.filter((p) => p.actif).length,
      enveloppe: { plafond_compte: pfs[0].plafond_palier, crees_compte: 0, restants_compte: pfs[0].plafond_palier }, plateformes: pfs };
  };
  const parPf = (m) => Object.fromEntries(['vinted', 'leboncoin', 'beebs', 'opla'].map((pf) => [pf, m?.plateformes?.find((p) => p.platform === pf) ?? null]));
  const ext = { lastSeenAt: new Date().toISOString() };
  const ecran = (m, palierApp, lecture = 'ok') => texte(React.createElement(RP.RepublicationPlanifieePlateformes, {
    lang: 'fr', etatMulti: m, parPlateforme: parPf(m), sessions: {}, interrupteur: 1, extensionStatus: ext, busy: false, erreur: null,
    palierApp, lecture, onReessayer: () => {},
  }));
  const RESERVE = /Réservée au plan Pro|La republication automatique est réservée au plan Pro/;

  // Business (Louis), chargé
  const b = ecran(etatMulti('business', true, true), 'business');
  verifier(!RESERVE.test(b), 'Business chargé : aucun « réservée au plan Pro »', b.slice(0, 200));
  verifier(/BUSINESS|Business/.test(b) && !/>\s*Pro\s*</.test(b), 'Business chargé : la pastille dit Business');
  verifier((b.match(/Non réglée/g) ?? []).length === 1, 'Business chargé : « Non réglée » sur Vinted SEULEMENT (lu sur configure)', b);
  verifier((b.match(/19h–22h/g) ?? []).length === 3, 'Business chargé : Leboncoin, Beebs et Opla affichent leur créneau 19h–22h', b);
  verifier(/3 plateformes actives/.test(b), 'Business chargé : « 3 plateformes actives »');

  // Business, état pas encore lu (l'écran de Louis le 04/10)
  const bl = ecran(null, 'business', 'en_cours');
  verifier(!RESERVE.test(bl), 'Business en lecture : aucun « réservée au plan Pro »', bl);
  verifier(!/Non réglée/.test(bl), 'Business en lecture : aucun « Non réglée »', bl);
  verifier(/Business/.test(bl), 'Business en lecture : la pastille dit Business, pas Pro');
  verifier(/Lecture de tes réglages/.test(bl), 'Business en lecture : l’écran dit qu’il lit');

  // Business, lecture ratée
  const be = ecran(null, 'business', 'echec');
  verifier(!RESERVE.test(be) && !/Non réglée/.test(be), 'Business, lecture ratée : ni refus ni « Non réglée »', be);
  verifier(/n’ont pas pu être lus/.test(be) && /Réessayer/.test(be), 'Business, lecture ratée : on le dit, et on propose de réessayer');

  // Pro, chargé, rien de réglé
  const p = ecran(etatMulti('pro', true, false), 'pro');
  verifier(!RESERVE.test(p), 'Pro chargé : aucun refus');
  verifier((p.match(/Non réglée/g) ?? []).length === 4, 'Pro sans réglage : « Non réglée » sur les quatre (lu sur configure)', p);
  // Pro, en lecture
  const pl = ecran(null, 'pro', 'en_cours');
  verifier(!RESERVE.test(pl) && !/Non réglée/.test(pl), 'Pro en lecture : ni refus ni « Non réglée »');

  // Premium, chargé : le refus est VRAI pour lui, on le dit
  const pr = ecran(etatMulti('premium', false, false), 'premium');
  verifier(RESERVE.test(pr), 'Premium chargé : « réservée au plan Pro » (c’est vrai pour lui)');
  // Premium, en lecture : on ne sait pas encore → on ne refuse pas encore
  const prl = ecran(null, 'premium', 'en_cours');
  verifier(!RESERVE.test(prl), 'Premium en lecture : pas de refus avant la réponse du serveur');

  // L'écran d'UNE plateforme (Leboncoin de Louis)
  const reglagesPf = (etat, palierApp, lecture = 'ok') => texte(React.createElement(RP.RepublicationPlanifieeReglages, {
    lang: 'fr', platform: 'leboncoin', session: null, etat, interrupteur: 1, extensionStatus: ext, busy: false, erreur: null,
    regler: async () => ({ ok: true }), onClose: () => {}, onOuvrirHistorique: () => {}, palierApp, lecture,
  }));
  const lbcB = reglagesPf(etatMulti('business', true, true).plateformes[1], 'business');
  verifier(!RESERVE.test(lbcB) && /Business/.test(lbcB), 'Leboncoin de Louis : Business, aucun refus');
  const lbcBl = reglagesPf(null, 'business', 'en_cours');
  verifier(!RESERVE.test(lbcBl) && /Business/.test(lbcBl) && /Lecture de tes réglages/.test(lbcBl), 'Leboncoin, état pas encore lu : lecture, Business, aucun refus', lbcBl.slice(0, 300));
  const lbcPr = reglagesPf(etatMulti('premium', false, false).plateformes[1], 'premium');
  verifier(RESERVE.test(lbcPr), 'Leboncoin d’un Premium : le refus est dit');

  // ── 5. La publication en lot, sans palier ──────────────────────────────────
  // (07/10, Nico) La ligne « Publier plusieurs articles d’un coup » est retirée :
  // doublon de la tuile « Publier », qui ouvre la même sélection, pour tous.
  verifier(!H.LignePublierEnLot, 'la ligne « Publier plusieurs articles d’un coup » est retirée (doublon de la tuile « Publier »)');
  const stock = lignesDeCode(lire('src/tabs/StockTab.jsx')).join('\n');
  verifier(!/<LignePublierEnLot/.test(stock), 'le Stock ne monte plus la ligne du lot');
  const tuile = texte(React.createElement(H.Gestes, { lang: 'fr', variante: 'tuiles', publier: { n: 12, onOuvrir: () => {} }, aRegler: { n: 0, onOuvrir: () => {} } }));
  verifier(/Publier/.test(tuile) && /pas encore sur toutes les plateformes/.test(tuile), 'la tuile « Publier » dit ce qu’elle ouvre', tuile);
  verifier(/<Gestes lang=\{lang\} variante="tuiles" publier=\{gestePublier\}/.test(stock), 'la tuile « Publier » est montée sur le Stock');
  const geste = stock.match(/const gestePublier = [^\n]*/)?.[0] ?? '';
  verifier(geste && !/isPro|isPremium|isBusiness|palier|autorise/.test(geste) && /setGesteOuvert\('publier'\)/.test(geste), 'la tuile « Publier » ouvre la sélection du lot sans aucun palier', geste);
  const regles = lignesDeCode(lire('src/publication/lot/regles.js')).join('\n');
  const selectionnable = regles.slice(regles.indexOf('export function articleSelectionnable'), regles.indexOf('export function resumeParPlateforme'));
  verifier(selectionnable && !/palier|isPro|isPremium|isBusiness/.test(selectionnable), 'le choix des articles du lot ne teste aucun palier');

  // ── 6. « Dupliquer » : aucun palier ─────────────────────────────────────────
  const app = lignesDeCode(lire('src/App.jsx')).join('\n');
  const dup = app.slice(app.indexOf('async function dupliquerFiche'), app.indexOf('async function dupliquerFiche') + 1200);
  verifier(dup && !/isPro|isBusiness|palier/.test(dup), '« Dupliquer » n’est gardé par aucun palier');
  verifier(/onDupliquer=\{\(item\)=>dupliquerFiche\(item,'carte'\)\}/.test(app), '« Dupliquer » est câblé sur le menu des cartes pour tous');
} finally {
  await vite.close();
}

console.log(ko ? `\n${ko} échec(s), ${ok} vérification(s) passée(s)` : `palier : ${ok} vérifications passées`);
process.exit(ko ? 1 : 0);
