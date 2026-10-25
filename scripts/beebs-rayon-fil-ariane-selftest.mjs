// ═══════════════════════════════════════════════════════════════════════════
// LA REPUBLICATION BEEBS REPREND LE RAYON AFFICHÉ SUR L'ANNONCE (25/10, chaouidz)
// `npm run selftest:beebs-rayon-fil-ariane`
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : republication 8a608034 « basket Nike noir et blanche taille
// 18 1/2 » (annonce 32089448). Beebs n'avait rien refusé : la copie (relevé,
// aucune capture) n'avait pas de rayon ; l'extension avait lu la fiche en ligne
// à 02:10 sans reprendre son fil d'Ariane ; le pré-vol s'est arrêté AVANT tout
// retrait (bien), puis le moteur sans genre a posé une question à 579 feuilles
// sous le message « Beebs n'accepte plus la catégorie… » (faux).
// Page publique relevée le 25/10 au matin : BreadcrumbList ld+json « Accueil ›
// Mode › Garçon › Chaussures (garçon) › Baskets (garçon) », InStock, 15 €.
// La règle :
//   1. capturerFicheEnPage lit le fil d'Ariane ld+json (≥ 2 niveaux, sans
//      « Accueil » ni le nom de l'annonce) dans `rayon_fil` ;
//   2. reprendreChampsDeLAnnonce le pose dans beebsCategoryPath quand la copie
//      n'en a pas — on ne comble que le vide (même règle que get-pending-jobs) ;
//   3. à l'étape « captured », une copie sans rayon relit l'annonce AVANT le
//      pré-vol, qui reste le juge ;
//   4. serveur : un rayon ABSENT n'est pas un rayon REFUSÉ (raison et message
//      vrais) ; repli de genre d'après le rayon Vinted de la fiche (garçon ET
//      bébé, jamais bébé seul), seulement quand la fiche ne dit pas le genre.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, n = 0;
const ok = (c, quoi, detail = '') => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

const bg = lire('chrome-extension/background.js');
const extraire = (debut) => {
  const d = bg.indexOf(debut);
  if (d < 0) throw new Error(`absent de background.js : ${debut}`);
  const f = bg.indexOf('\n}\n', d);
  return bg.slice(d, f + 2);
};

// ── 1. LA LECTURE DE LA PAGE ─────────────────────────────────────────────────
console.log('1. capturerFicheEnPage : le fil d’Ariane ld+json de la page Beebs');
const srcCapture = extraire('function capturerFicheEnPage(plateforme, html = null) {');
const PRODUIT = { '@context': 'https://schema.org', '@type': 'Product', name: 'basket Nike noir et blanche taille 18 1/2', sku: '32089448',
  image: ['https://cdn.beebs.app/abcdefabcdefabcdefabcdef/1.jpg'], brand: { '@type': 'Brand', name: 'Nike' }, color: 'Noir',
  offers: { '@type': 'Offer', price: 15, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } };
const FIL = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://www.beebs.app/fr' },
  { '@type': 'ListItem', position: 2, name: 'Mode', item: 'https://www.beebs.app/fr/c/mode' },
  { '@type': 'ListItem', position: 3, name: 'Garçon', item: 'https://www.beebs.app/fr/c/mode/garcon' },
  { '@type': 'ListItem', position: 4, name: 'Chaussures (garçon)', item: 'https://www.beebs.app/fr/c/x' },
  { '@type': 'ListItem', position: 5, name: 'Baskets (garçon)', item: 'https://www.beebs.app/fr/c/y' },
] };
// Un document minimal : les scripts ld+json, et des liens de MENU que le fil ne doit jamais lire.
const documentFactice = (ldObjets, { menu = [] } = {}) => ({
  querySelectorAll(sel) {
    if (sel === "script[type='application/ld+json']") return ldObjets.map((o) => ({ textContent: typeof o === 'string' ? o : JSON.stringify(o) }));
    if (sel === "nav a, [class*='breadcrumb' i] a") return menu.map((t) => ({ textContent: t }));
    return [];
  },
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() { return { set innerHTML(v) { this._t = String(v); }, get textContent() { return this._t ?? ''; } }; },
});
const capturer = (doc) => new Function('document', `${srcCapture}; return capturerFicheEnPage("beebs");`)(doc);
const c1 = capturer(documentFactice([PRODUIT, FIL], { menu: ['Accueil', 'Puériculture', 'Mode', 'Jouets'] }));
ok(JSON.stringify(c1.rayon_fil) === JSON.stringify(['Mode', 'Garçon', 'Chaussures (garçon)', 'Baskets (garçon)']),
  'page de 32089448 : rayon_fil = Mode › Garçon › Chaussures (garçon) › Baskets (garçon)', JSON.stringify(c1.rayon_fil));
ok(c1.categorie === 'Puériculture > Mode > Jouets', 'la `categorie` du relevé (liens de menu) ne change pas — le rayon ne vient que du fil ld+json', c1.categorie);
const melange = { ...FIL, itemListElement: [FIL.itemListElement[3], FIL.itemListElement[0], FIL.itemListElement[4], FIL.itemListElement[1], FIL.itemListElement[2]] };
ok(capturer(documentFactice([PRODUIT, melange])).rayon_fil?.join(' > ') === 'Mode > Garçon > Chaussures (garçon) > Baskets (garçon)', 'ordre par position, jamais par ordre d’apparition');
const avecNom = { ...FIL, itemListElement: [...FIL.itemListElement, { '@type': 'ListItem', position: 6, name: PRODUIT.name }] };
ok(capturer(documentFactice([PRODUIT, avecNom])).rayon_fil?.length === 4, 'le nom de l’annonce en fin de fil n’est pas un rayon');
const graphe = { '@context': 'https://schema.org', '@graph': [PRODUIT, FIL] };
ok(capturer(documentFactice([graphe])).rayon_fil?.length === 4, 'fil rangé dans un @graph : lu aussi');
const court = { ...FIL, itemListElement: FIL.itemListElement.slice(0, 2) };
ok(capturer(documentFactice([PRODUIT, court])).rayon_fil === null, '« Accueil › Mode » seul (un niveau) : null, jamais un rayon partiel');
ok(capturer(documentFactice([PRODUIT])).rayon_fil === null, 'page sans fil d’Ariane : null');
ok(capturer(documentFactice([PRODUIT, '{ pas du json'])).rayon_fil === null, 'ld+json illisible : null, aucune exception');

// ── 2. LA REPRISE SUR LA COPIE ───────────────────────────────────────────────
console.log('\n2. reprendreChampsDeLAnnonce : on ne comble que le vide');
const srcReprise = extraire('const CHAMPS_LUS_SUR_L_ANNONCE = [') ;
const fabrique = (cap) => new Function('getOrCreateWorkTab', 'chrome', 'waitForTabComplete', 'neutralizeBeforeUnload', 'sleep', 'randInt', 'WORK_TAB_FRAGMENT', 'capturerFicheEnPage',
  `${srcReprise}; return reprendreChampsDeLAnnonce;`)(
  async () => 7, { tabs: { get: async () => ({ url: 'https://www.beebs.app/fr/p/32089448' }), update: async () => {} },
    scripting: { executeScript: async () => [{ result: cap }] } },
  async () => {}, async () => {}, async () => {}, () => 0, '#fillsell', () => null);
const capReelle = { source: 'ld_json', etat: 'Neuf, avec étiquette', marque: 'Nike', couleur: 'Noir', format_colis_id: '3yKTvfHdFZrmnGLYPzT7BH',
  rayon_fil: ['Mode', 'Garçon', 'Chaussures (garçon)', 'Baskets (garçon)'] };
const jobB = { id: '8a608034', platform: 'beebs', action: 'republish', listing_url: 'https://www.beebs.app/fr/p/32089448' };
const pf1 = { etat: 'Neuf, avec étiquette', marque: 'Nike' };
const r1 = await fabrique(capReelle)(jobB, pf1);
ok(JSON.stringify(pf1.beebsCategoryPath) === JSON.stringify(capReelle.rayon_fil), '8a608034 : copie sans rayon → beebsCategoryPath = le fil de l’annonce', JSON.stringify(pf1.beebsCategoryPath));
ok(r1?.beebsCategoryPath === 'Mode > Garçon > Chaussures (garçon) > Baskets (garçon)' && pf1.champs_lus_sur_l_annonce?.repris?.beebsCategoryPath, 'tracé dans repris (champs_lus_sur_l_annonce)');
ok(pf1.rayon_repris_de_l_annonce?.source === "fil d'Ariane (ld+json) de l'annonce en ligne" && pf1.champs_lus_sur_l_annonce?.lus?.rayon, 'avec sa source et sa date, et lu même quand rien n’est repris');
const pf2 = { beebsCategoryPath: ['Mode', 'Bébé', 'Chaussures (bébé)'] };
await fabrique(capReelle)(jobB, pf2);
ok(pf2.beebsCategoryPath.join('>') === 'Mode>Bébé>Chaussures (bébé)' && !pf2.rayon_repris_de_l_annonce, 'un rayon déjà posé n’est JAMAIS écrasé');
ok(pf2.champs_lus_sur_l_annonce?.lus?.rayon === 'Mode > Garçon > Chaussures (garçon) > Baskets (garçon)', '… mais le rayon affiché reste lu (trace)');
const pf3 = {};
await fabrique({ ...capReelle, rayon_fil: null })(jobB, pf3);
ok(!('beebsCategoryPath' in pf3), 'pas de fil lisible : rien n’est posé (le pré-vol tranche)');
const pf4 = {};
await fabrique(capReelle)({ ...jobB, platform: 'leboncoin' }, pf4);
ok(!('beebsCategoryPath' in pf4), 'Leboncoin : jamais un rayon Beebs');

// ── 3. LE CÂBLAGE DANS LA REPUBLICATION ─────────────────────────────────────
console.log('\n3. l’étape « captured » relit l’annonce avant le pré-vol');
const iCaptured = bg.indexOf('if (step === "captured") {');
const iPrevol = bg.indexOf('const refus = await appliquerPrevolCopie({ accessToken, job, pf, etape: "avant_retrait" });', iCaptured);
const bloc = bg.slice(iCaptured, iPrevol);
ok(iCaptured > 0 && iPrevol > iCaptured, 'le pré-vol de la copie est bien dans l’étape « captured »');
ok(/job\.platform === "beebs" && !\(Array\.isArray\(pf\.beebsCategoryPath\) && pf\.beebsCategoryPath\.length\)/.test(bloc)
  && /await reprendreChampsDeLAnnonce\(job, pf\)/.test(bloc), 'copie Beebs sans rayon : l’annonce (encore en ligne) est relue AVANT le pré-vol');
ok(/job\.platform_fields = pf;/.test(bloc), 'la copie lue est reportée dans job.platform_fields (c’est elle que le pré-vol lit)');
ok(/function prevolCaptureRepublication\(job, snapExterne = null\) \{\s*const pf = job\.platform_fields \?\? \{\};/.test(bg), '(le pré-vol lit bien job.platform_fields)');
const iA = bg.indexOf('const repris = await reprendreChampsDeLAnnonce(job, pf);');
ok(iA > 0 && iA < iCaptured && bg.indexOf('pf.republish_step = "captured";', iA) > iA, 'et à l’étape « a_capturer », la lecture précède toujours « captured »');

// ── 4. LE SERVEUR ────────────────────────────────────────────────────────────
console.log('\n4. serveur : un rayon absent n’est pas un rayon refusé');
const M = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/rayon-refuse-moteur.js')).href);
const beebs = { platform: 'beebs', action: 'republish', status: 'needs_user', platform_fields: { republish_prevol_manquants: ['le rayon Beebs'] } };
ok(M.rayonRefuseDuJob(beebs)?.raison === M.RAISON_RAYON_ABSENT, 'Beebs, rayon absent de la copie : raison « rayon_absent_de_la_copie »');
const lbcSans = { platform: 'leboncoin', action: 'republish', status: 'pending', platform_fields: { republish_prevol_formulaire: { verdict: 'illisible', detail: 'Catégorie: x' } } };
const lbcRefuse = { ...lbcSans, platform_fields: { ...lbcSans.platform_fields, lbcCategoryPath: ['Mode', 'Vêtements'] } };
ok(M.rayonRefuseDuJob(lbcSans)?.raison === M.RAISON_RAYON_ABSENT && M.rayonRefuseDuJob(lbcRefuse)?.raison === M.RAISON_RAYON_REFUSE, 'Leboncoin : sans rayon → absent ; rayon refusé au pré-vol → refusé');
const horloge = { platform: 'vinted', action: 'republish', status: 'needs_user', platform_fields: { needsUserField: { field_key: 'categoryLevelChoice' }, republish_snapshot: { categoryPath: ['Enfants', 'Jeux et jouets'] } } };
ok(M.rayonRefuseDuJob(horloge)?.raison === M.RAISON_RAYON_REFUSE, 'Vinted (niveau intermédiaire) : refusé, comme avant');
const mAbs = M.messageRayonAChoisir('beebs', [], M.RAISON_RAYON_ABSENT);
ok(/n'a pas retrouvé le rayon Beebs de cette annonce/.test(mAbs) && !/n'accepte plus/.test(mAbs) && /AVANT toute suppression/.test(mAbs) && /intacte/.test(mAbs) && /Compléter/.test(mAbs),
  'message d’un rayon absent : vrai (« FillSell n’a pas retrouvé le rayon Beebs… »), annonce intacte, geste dit', mAbs);
ok(/n'accepte plus la catégorie/.test(M.messageRayonAChoisir('vinted', ['Enfants', 'Jeux et jouets'])), 'message d’un rayon refusé : inchangé (défaut)');
const fb = M.feuillesCandidates({ plateforme: 'beebs', base: [] });
ok(M.questionRayonRefuse({ plateforme: 'beebs', base: [], feuilles: fb, raison: M.RAISON_RAYON_ABSENT }).raison === M.RAISON_RAYON_ABSENT
  && M.questionRayonRefuse({ plateforme: 'beebs', base: [], feuilles: fb }).raison === M.RAISON_RAYON_REFUSE, 'la question porte la même raison (défaut : refusé)');
const hw = lire('supabase/functions/handler-watch/index.ts');
ok(/questionRayonRefuse\(\{ plateforme: plan\.plateforme, base: plan\.base, feuilles, cleChamp: CLE_REPONSE_RAYON, raison: plan\.raison \}\)/.test(hw)
  && /messageRayonAChoisir\(plan\.plateforme, plan\.base, plan\.raison\)/.test(hw), 'handler-watch passe la raison à la question et au message');

console.log('\n5. repli de genre d’après le rayon Vinted de la fiche');
const gv = M.genresDuRayonVinted(1653);
ok(JSON.stringify(gv) === JSON.stringify(['garcon', 'bebe']), 'catalog 1653 (Enfants › Vêtements pour garçons › Chaussures › Chaussures bébé) → garçon ET bébé, jamais bébé seul', JSON.stringify(gv));
ok(M.genresDuRayonVinted(1499) === null && M.genresDuRayonVinted(null) === null, 'hors vêtements genrés (Jeux et jouets) ou sans rayon : aucun élagage');
const titre = 'basket Nike noir et blanche taille 18 1/2';
const sans = M.feuillesCandidates({ plateforme: 'beebs', base: [], titre });
const avec = M.feuillesCandidates({ plateforme: 'beebs', base: [], titre, genresPossibles: gv });
const cle = (f) => f.chemin.join(' > ');
ok(sans.length === 579 && avec.length < sans.length, `élague (${sans.length} → ${avec.length} feuilles)`);
ok(avec.some((f) => cle(f) === 'Mode > Garçon > Chaussures (garçon) > Baskets (garçon)') && avec.some((f) => f.chemin[1] === 'Bébé'), 'garde le rayon de l’annonce ET les rayons bébé');
ok(!avec.some((f) => ['Femme', 'Homme', 'Fille'].includes(f.chemin[1])), 'retire Femme, Homme, Fille');
const lu = M.feuillesCandidates({ plateforme: 'beebs', base: [], titre: 'Basket fille Nike', genresPossibles: gv });
ok(!lu.some((f) => f.chemin[1] === 'Garçon') && lu.some((f) => f.chemin[1] === 'Fille'), 'un genre LU sur la fiche passe devant le repli Vinted');
ok(/genresPossibles: plan\.plateforme !== "vinted" \? genresDuRayonVinted\(fiche\?\.vinted_catalog_id\) : null/.test(hw)
  && /select\("titre, description, type, attributs, vinted_catalog_id"\)/.test(hw), 'handler-watch lit le rayon Vinted de la fiche (Beebs, Leboncoin seulement)');

// ── 5. (25/10, chaouidz) LES ATTRIBUTS AFFICHÉS : « Fermeture — À enfiler » ──────────────────────────────────────
console.log('\n5. les lignes « libellé / valeur » de la fiche comblent les attributs Beebs VIDES de la copie');
{
  // Un DOM minimal : <div><span>Libellé</span><span>Valeur</span></div> × n, sous body.
  const el = (texte, enfants = []) => {
    const e = { _t: texte, children: enfants, parentElement: null };
    Object.defineProperty(e, 'textContent', { get: () => (e.children.length ? e.children.map((c) => c.textContent).join('') : e._t) });
    e.querySelectorAll = (sel) => (sel === '*' ? tous(e) : []);
    for (const c of enfants) c.parentElement = e;
    return e;
  };
  const tous = (e) => e.children.flatMap((c) => [c, ...tous(c)]);
  const lignes = [['Marque', 'Nike'], ['Pointure', '18'], ['Couleur', 'Noir'], ['État', 'Neuf, avec étiquette'], ['Fermeture', 'À enfiler']]
    .map(([l, v]) => el('', [el(l), el(v)]));
  const vendeur = el('', [el('Vendu par'), el('Khalti F.'), el('100 %')]);   // trois feuilles : jamais une paire
  const body = el('', [...lignes, vendeur]);
  const docAttr = {
    ...documentFactice([PRODUIT, FIL]),
    querySelectorAll(sel) {
      if (sel === 'body *') return tous(body);
      return documentFactice([PRODUIT, FIL]).querySelectorAll(sel);
    },
  };
  const c5 = capturer(docAttr);
  ok(c5.taille === '18', 'la « Pointure » d’une chaussure est lue comme sa taille', String(c5.taille));
  ok(c5.attributs_affiches?.Fermeture === 'À enfiler' && c5.attributs_affiches?.Pointure === '18', 'attributs_affiches : Fermeture « À enfiler », Pointure « 18 »', JSON.stringify(c5.attributs_affiches));
  ok(!('Vendu par' in (c5.attributs_affiches ?? {})), 'une ligne de plus de deux feuilles (vendeur) n’est jamais une paire');
  const pf5 = { etat: 'Neuf, avec étiquette', beebsCategoryPath: ['Mode', 'Garçon', 'Chaussures (garçon)', 'Baskets (garçon)'] };
  await fabrique({ ...capReelle, attributs_affiches: c5.attributs_affiches })(jobB, pf5);
  ok(pf5.beebsAspects?.Fermeture === 'À enfiler', '8a608034 : beebsAspects.Fermeture = « À enfiler » (lu sur l’annonce)', JSON.stringify(pf5.beebsAspects));
  ok(!('Marque' in (pf5.beebsAspects ?? {})) && !('Pointure' in (pf5.beebsAspects ?? {})) && !('État' in (pf5.beebsAspects ?? {})), 'les lignes lues par leur propre champ (marque, taille, état…) n’y vont pas');
  ok(pf5.attributs_repris_de_l_annonce?.attributs?.Fermeture === 'À enfiler', 'tracé (attributs_repris_de_l_annonce)');
  const pf6 = { beebsCategoryPath: ['Mode'], beebsAspects: { Fermeture: 'À scratch' } };
  await fabrique({ ...capReelle, attributs_affiches: c5.attributs_affiches })(jobB, pf6);
  ok(pf6.beebsAspects.Fermeture === 'À scratch', 'une valeur déjà posée (copie ou réponse) n’est JAMAIS écrasée');
  const pf7 = {};
  await fabrique({ ...capReelle, attributs_affiches: c5.attributs_affiches })({ ...jobB, platform: 'leboncoin' }, pf7);
  ok(!('beebsAspects' in pf7), 'Leboncoin : jamais un attribut Beebs');
}

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${n} contrôles`);
process.exit(ko ? 1 : 0);
