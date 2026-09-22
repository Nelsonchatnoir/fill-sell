// ═══════════════════════════════════════════════════════════════════════════
// CONTRÔLE — LE PARCOURS eBAY (2026-09-22, dossier Romain)
// ═══════════════════════════════════════════════════════════════════════════
// Il exécute le module LIVRÉ (src/utils/ebayParcours.js), jamais une copie.
// Ce qu'il refuse de laisser passer :
//   1. un mot de développeur ou d'eBay sous les yeux d'un vendeur — la liste
//      est LUE dans le module (MOTS_INTERDITS_ECRAN), jamais retapée ici ;
//   2. une étape sans titre, sans « ce que c'est », sans « pourquoi », ou avec
//      autre chose qu'UN seul geste ;
//   3. un ordre qui ne serait pas celui d'eBay ;
//   4. un lien non vérifié ;
//   5. un désaccord entre les deux sources de vérité (l'état gratuit et le
//      relevé complet) sur une même réalité de compte ;
//   6. une phrase courte qui ne NOMMERAIT pas l'étape qui reste — c'est tout
//      le dossier : « pas évident de savoir ce qu'il y avait à faire ».
// ═══════════════════════════════════════════════════════════════════════════
import {
  ETAPES_EBAY, LIENS_EBAY, ETAPES_FAISABLES_ICI, MOTS_INTERDITS_ECRAN,
  motsEbay, etapesEbay, etapeCouranteEbay, progressionEbay,
  etatsEbayDepuisEtat, etatsEbayDepuisChecklist, resumeEbay,
} from '../src/utils/ebayParcours.js';

let echecs = 0;
const ok = (nom) => console.log(`  ✓ ${nom}`);
const ko = (nom, detail) => { echecs++; console.log(`  ✗ ${nom}\n      ${detail}`); };
const verifier = (nom, condition, detail = '') => (condition ? ok(nom) : ko(nom, detail));

// ── 1. L'ORDRE D'eBAY ──────────────────────────────────────────────────────
console.log("\n1. L'ordre d'eBay");
const ORDRE_ATTENDU = [
  'inscription_vendeur',      // rien ne se vend sans elle
  'politiques_activees',      // rien ne se crée sans elles
  'politique_livraison',
  'politique_paiement',
  'politique_retours',
  'lieu_expedition',
];
verifier('les six étapes, dans l\'ordre qu\'eBay impose',
  JSON.stringify(ETAPES_EBAY) === JSON.stringify(ORDRE_ATTENDU),
  `lu : ${ETAPES_EBAY.join(' → ')}`);

// ── 2. AUCUN MOT DE DÉVELOPPEUR NI D'eBAY À L'ÉCRAN ────────────────────────
console.log('\n2. Le vocabulaire montré');
const phrasesLivrees = [];
for (const lang of ['fr', 'en']) {
  const m = motsEbay(lang);
  const pousser = (ou, v) => {
    if (typeof v === 'string') phrasesLivrees.push({ lang, ou, texte: v });
    else if (typeof v === 'function') {
      // Les phrases à trous se jugent remplies : c'est ce que voit la personne.
      try { phrasesLivrees.push({ lang, ou, texte: String(v('Comment tu livres', 3)) }); } catch { /* rien */ }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) pousser(`${ou}.${k}`, x);
    }
  };
  for (const [k, v] of Object.entries(m)) pousser(`${lang}.${k}`, v);
}
const fautes = phrasesLivrees.filter(({ texte }) => {
  const t = ` ${texte.toLowerCase()} `;
  return MOTS_INTERDITS_ECRAN.some((mot) => t.includes(mot.toLowerCase()));
});
verifier(`${phrasesLivrees.length} phrases livrées, 0 mot interdit`,
  fautes.length === 0,
  fautes.map((f) => `${f.ou} → « ${f.texte} »`).join('\n      '));

// ── 3. CHAQUE ÉTAPE DIT TOUT, ET NE PORTE QU'UN GESTE ─────────────────────
console.log('\n3. Ce que porte chaque étape');
for (const lang of ['fr', 'en']) {
  const m = motsEbay(lang);
  for (const cle of ETAPES_EBAY) {
    const e = m.etapes[cle];
    const complet = e && ['titre', 'cestQuoi', 'pourquoi', 'bouton', 'apres']
      .every((champ) => typeof e[champ] === 'string' && e[champ].trim().length > 0);
    verifier(`${lang} · ${cle} — titre, ce que c'est, pourquoi, un geste`, complet,
      e ? `manque : ${['titre', 'cestQuoi', 'pourquoi', 'bouton', 'apres'].filter((c) => !e[c]).join(', ')}` : 'étape absente');
  }
}
// « UN seul bouton » : un libellé de geste ne contient pas deux gestes.
const deuxGestes = [];
for (const lang of ['fr', 'en']) {
  const m = motsEbay(lang);
  for (const cle of ETAPES_EBAY) {
    const b = m.etapes[cle].bouton;
    if (/ ou | or |\/|,/.test(b)) deuxGestes.push(`${lang}.${cle} → « ${b} »`);
  }
}
verifier('un seul geste par étape', deuxGestes.length === 0, deuxGestes.join('\n      '));

// ── 4. LES LIENS ───────────────────────────────────────────────────────────
console.log('\n4. Les liens');
// LES TROIS ADRESSES VÉRIFIÉES, et rien d'autre. Un lien ajouté au module sans
// avoir été ouvert fait tomber ce contrôle — c'est le but.
const LIENS_VERIFIES = new Set([
  'https://www.ebay.fr/bp/policyoptin',
  'https://www.ebay.fr/bp/manage',
  'https://www.ebay.fr/sl/sell',
]);
const liensInconnus = Object.entries(LIENS_EBAY).filter(([, url]) => !LIENS_VERIFIES.has(url));
verifier('aucun lien exposé qui n\'ait été vérifié', liensInconnus.length === 0,
  liensInconnus.map(([k, u]) => `${k} → ${u}`).join('\n      '));
// Tout ce qui se fait chez nous ne doit PAS pousser la personne dehors en
// premier geste : le lien y est un secours, jamais le bouton de l'étape.
verifier('tout ce qui peut se faire dans FillSell y est faisable',
  ['politiques_activees', 'politique_livraison', 'politique_paiement', 'politique_retours', 'lieu_expedition']
    .every((c) => ETAPES_FAISABLES_ICI.has(c)),
  [...ETAPES_FAISABLES_ICI].join(', '));
verifier('l\'inscription vendeur est la SEULE étape qui sorte de l\'app',
  !ETAPES_FAISABLES_ICI.has('inscription_vendeur') && ETAPES_FAISABLES_ICI.size === 5);

// ── 5. LES DEUX SOURCES DISENT LA MÊME CHOSE ──────────────────────────────
console.log('\n5. Les deux sources de vérité');
// LE CAS ROMAIN, tel qu'il est en base le 22/09 : compte relié, inscription
// faite, conditions de vente activées, des politiques existent chez eBay —
// mais AUCUNE n'est retenue pour FillSell, et le lieu d'expédition manque.
// C'est exactement là qu'il s'est arrêté, sans qu'un seul job naisse.
const ROMAIN_ETAT = {
  connecte: true,
  a_reconnecter: false,
  politiques: { fulfillment: null, payment: null, return: null },
  seller_state: {
    inscription_vendeur: true,
    politiques_activees: true,
    politiques: { livraison: 2, paiement: 1, retours: 1 },
    lieu_expedition: false,
  },
};
const ROMAIN_CHECKLIST = {
  lignes: [
    { cle: 'inscription_vendeur', etat: 'ok' },
    { cle: 'politiques_activees', etat: 'ok' },
    { cle: 'politique_livraison', etat: 'manque', existantes: [{ id: 'a' }, { id: 'b' }] },
    { cle: 'politique_paiement', etat: 'manque', existantes: [{ id: 'c' }] },
    { cle: 'politique_retours', etat: 'manque', existantes: [{ id: 'd' }] },
    { cle: 'lieu_expedition', etat: 'manque' },
  ],
};
const parEtat = etatsEbayDepuisEtat(ROMAIN_ETAT);
const parChecklist = etatsEbayDepuisChecklist(ROMAIN_CHECKLIST);
verifier('l\'état gratuit et le relevé complet donnent le même verdict (cas Romain)',
  JSON.stringify(parEtat) === JSON.stringify(parChecklist),
  `gratuit : ${JSON.stringify(parEtat)}\n      complet : ${JSON.stringify(parChecklist)}`);
verifier('avoir des politiques chez eBay sans en retenir une ne suffit pas',
  parEtat.politique_livraison === 'manque',
  `lu : ${parEtat.politique_livraison}`);
verifier('l\'étape courante est bien celle où Romain s\'est arrêté',
  etapeCouranteEbay(parEtat) === 'politique_livraison',
  `lu : ${etapeCouranteEbay(parEtat)}`);
const progRomain = progressionEbay(parEtat);
verifier('la progression compte 2 faites sur 6, non prêt',
  progRomain.faites === 2 && progRomain.total === 6 && progRomain.pret === false,
  JSON.stringify(progRomain));

// Un compte dont on n'a JAMAIS rien lu ne se déclare ni prêt, ni en faute.
const jamaisLu = etatsEbayDepuisEtat({ connecte: true, politiques: null, seller_state: null });
verifier('un compte jamais relevé n\'est pas déclaré prêt',
  progressionEbay(jamaisLu).pret === false && etapesEbay(jamaisLu, 'fr').length === 0,
  JSON.stringify(jamaisLu));

// ── 6. LA PHRASE COURTE NOMME L'ÉTAPE ─────────────────────────────────────
console.log('\n6. La phrase courte, ailleurs dans l\'app');
for (const lang of ['fr', 'en']) {
  const r = resumeEbay(ROMAIN_ETAT, lang);
  const titre = motsEbay(lang).etapes.politique_livraison.titre.toLowerCase();
  verifier(`${lang} · elle nomme l'étape qui reste`,
    !r.pret && r.cle === 'politique_livraison' && r.phrase.toLowerCase().includes(titre),
    `lu : « ${r.phrase} »`);
  verifier(`${lang} · elle porte un geste`, Boolean(r.bouton), JSON.stringify(r));
}
const pret = resumeEbay({
  connecte: true, a_reconnecter: false,
  politiques: { fulfillment: 'a', payment: 'b', return: 'c' },
  seller_state: { inscription_vendeur: true, politiques_activees: true, politiques: { livraison: 1, paiement: 1, retours: 1 }, lieu_expedition: true },
}, 'fr');
verifier('un compte fini dit « eBay est prêt »', pret.pret === true && /prêt/i.test(pret.phrase), pret.phrase);
const pasRelie = resumeEbay(null, 'fr');
verifier('un compte non relié le dit, et propose de le relier',
  pasRelie.motif === 'non_connecte' && Boolean(pasRelie.bouton), JSON.stringify(pasRelie));
const aReconnecter = resumeEbay({ connecte: false, a_reconnecter: true }, 'fr');
verifier('une reconnexion se dit sans accuser personne',
  aReconnecter.motif === 'a_reconnecter' && !/erreur|échec|problème/i.test(aReconnecter.phrase),
  aReconnecter.phrase);

// ── VERDICT ────────────────────────────────────────────────────────────────
console.log(`\n${echecs === 0 ? '✅ parcours eBay : tout passe' : `❌ ${echecs} contrôle(s) en échec`}\n`);
process.exit(echecs === 0 ? 0 : 1);
