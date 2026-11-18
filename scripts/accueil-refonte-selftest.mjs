// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LA REFONTE DE L'ACCUEIL (18/11/2026, lot T1 de Nico, maquettes validées)   npm run selftest:accueil-refonte
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré le 18/11 sur 49 inscrits : 28 « pas d'ordinateur », 27 sur « Choisis ta formule » (3 gros prix, « Passer » en
// haut), 0 vrai clic sur une offre, 19 « Passer », 0 essai, 3 synchros, 2 publications ; « Plus tard » sur les offres ne
// disait nulle part qu'il faut alors un ordinateur. Ce verrou fait tomber :
//   · un « Passer » qui revient en haut, un écran glissé entre « Où tu vends ? » et « As-tu un ordinateur ? » ;
//   · trois écrans Cloud au lieu d'un, un essai annoncé sans la carte qui le porte, Business + Cloud avec un essai ;
//   · « Plus tard » sur le Cloud qui ne mène pas à « il te faut un ordinateur » ; un « Installer l'extension » sur
//     un téléphone ; une sortie ailleurs que dans le Stock ;
//   · un écran vu sans `chemin` ni `appareil`, l'écran Cloud sans `essai_propose`.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .split('\n').map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, '$1')).join('\n');

const K1 = {
  grille_trois_jauges: 1, jauge_annonces_free: 5, jauge_annonces_premium: 40, jauge_annonces_pro: 120, jauge_annonces_business: 0,
  jauge_publications_free: 50, jauge_publications_premium: 400, jauge_publications_pro: 1200, jauge_publications_business: 0,
  jauge_remontees_free: 30, jauge_remontees_premium: 1500, jauge_remontees_pro: 0, jauge_remontees_business: 0, jauge_lens_business: 600,
};

globalThis.document ??= { body: {} };
const magasin = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k) => (k in magasin ? magasin[k] : null), setItem: (k, v) => { magasin[k] = String(v); }, removeItem: (k) => { delete magasin[k]; } },
  configurable: true, writable: true,
});
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { return { __erreur: e?.message ?? String(e) }; } };
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const P = await charger('/src/entree/plan.js');
  const R = await charger('/src/entree/regles.js');
  const TX = await charger('/src/entree/textes.js');
  const AC = await charger('/src/entree/EtapesAccueil.jsx');
  const EXT = await charger('/src/entree/EtapeExtension.jsx');
  const FC = await charger('/src/cloud/formulesCloud.js');

  // ── 1. L'ordre des étapes ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('1. L\'ordre des étapes (plan.js)');
  ok(typeof P.etapesVisibles === 'function', 'plan.js se charge', P.__erreur);
  const cx = ({ tel = true, formules = true, cloud = true, voie = null, actif = false, ouvert = true, plateformes = ['vinted'], pseudo = true } = {}) => ({
    surTelephone: tel, choix: { plateformes }, demanderPseudo: pseudo, voie,
    cloud: { parcours: tel && cloud, actif: tel && cloud && actif, ouvert: tel && ouvert },
    formules: tel && formules ? { parcours: true, actif } : { parcours: false },
  });
  const j = (c) => (typeof P.etapesVisibles === 'function' ? P.etapesVisibles(c).map((e) => e.id).join(' › ') : '');
  const cas = [
    [cx(), 'plateformes › ordinateur › releve › pseudo', 'téléphone, rien choisi : « As-tu un ordinateur ? » en 2e'],
    [cx({ voie: 'cloud' }), 'plateformes › ordinateur › cloud_offre › releve › pseudo', '« Non » : UN écran Cloud, puis la synchro'],
    [cx({ voie: 'cloud', actif: true }), 'plateformes › ordinateur › cloud_offre › cloud_connexion › releve › pseudo', 'essai pris : « Connecte tes comptes »'],
    [cx({ voie: 'sans_cloud' }), 'plateformes › ordinateur › sans_cloud › pseudo', '« Plus tard » sur le Cloud : « il te faut un ordinateur », sans synchro impossible'],
    [cx({ voie: 'extension' }), 'plateformes › ordinateur › extension › releve › pseudo', '« Oui, j\'ai un ordinateur » : l\'extension'],
    [cx({ voie: 'extension', plateformes: [] }), 'plateformes › ordinateur › extension › debut › pseudo', 'rien en ligne : « On part de ta première annonce »'],
    [cx({ tel: false }), 'plateformes › extension › releve › pseudo', 'ordinateur (web) : pas de question, l\'extension tout de suite'],
    [cx({ formules: false, voie: 'cloud' }), 'plateformes › ordinateur › cloud › releve › pseudo', 'Cloud seul (sans formules) : l\'écran Cloud d\'avant'],
    [cx({ pseudo: false, voie: 'cloud' }), 'plateformes › ordinateur › cloud_offre › releve', 'nom déjà connu : pas de pseudo'],
  ];
  for (const [c, attendu, m] of cas) ok(j(c) === attendu, m, j(c));
  const tous = new Set();
  for (const tel of [true, false]) for (const formules of [true, false]) for (const cloud of [true, false]) for (const voie of [null, 'cloud', 'extension', 'sans_cloud'])
    for (const actif of [true, false]) for (const plateformes of [['vinted'], []]) for (const pseudo of [true, false]) {
      const l = typeof P.etapesVisibles === 'function' ? P.etapesVisibles(cx({ tel, formules, cloud, voie, actif, plateformes, pseudo })).map((e) => e.id) : [];
      l.forEach((x) => tous.add(x));
      if (tel && l[1] !== 'ordinateur') tous.add(`ERREUR-2e:${l[1]}`);
      if (!tel && l.includes('ordinateur')) tous.add('ERREUR-ordinateur-web');
    }
  for (const retiree of ['voie', 'cloud_presentation', 'cloud_offres', 'republication', 'formule', 'fin', 'ebay', 'free']) ok(!tous.has(retiree), `jamais l'étape retirée « ${retiree} »`);
  ok(![...tous].some((x) => x.startsWith('ERREUR')), 'téléphone : « As-tu un ordinateur ? » toujours en 2e ; web : jamais', [...tous].join(','));
  const liste = typeof P.etapesVisibles === 'function' ? P.etapesVisibles(cx({ voie: 'cloud' })) : [];
  ok(liste[P.indexDeReprise?.(liste, 'cloud_offres')]?.id === 'ordinateur' && liste[P.indexDeReprise?.(liste, 'fin')]?.id === 'pseudo'
    && liste[P.indexDeReprise?.(liste, 'republication')]?.id === 'pseudo', 'reprise d\'un parcours d\'avant : « Choisis ta formule » → la question, le récap → la dernière étape');

  // ── 2. La coque : plus de « Passer », un retour, la sortie vers le Stock, le journal ──────────────────────────────
  console.log('\n2. La coque (ParcoursEntree.jsx)');
  const coque = sansCommentaires(lire('src/entree/ParcoursEntree.jsx'));
  ok(!/T\.passer/.test(coque) && !/onClick=\{passer\}/.test(coque), 'plus aucun « Passer » dans la coque');
  ok(/aria-label=\{T\.retour\}/.test(coque) && /ArrowLeft/.test(coque) && /retourPossible = index > 0 && !achatEnCours && etape\.id !== 'cloud_connexion'/.test(coque),
    'la flèche de retour (jamais pendant un achat, jamais depuis « Connecte tes comptes »)');
  ok(/if \(index >= liste\.length - 1\) \{ terminer\(\); return; \}/.test(coque), 'la dernière étape fait sortir (plus de récap)');
  ok(/const destination = 'stock';/.test(coque), 'la sortie mène toujours au Stock');
  ok(/journaliser\('etape_vue', \{ etape: etape\.id, rang, total, chemin: c\.voie \?\? \(c\.surTelephone \? 'a_choisir' : 'ordinateur_web'\), appareil: c\.plateforme \}\)/.test(coque),
    'chaque écran vu : etape_vue { etape, rang, total, chemin, appareil }');
  ok(/marquerEntreeFaite\(user\?\.id\)/.test(coque) && /marquerEntreeFaiteAuVol\(user\.id, c\.jetonRef\.current\)/.test(coque), 'onboarded_at toujours posé (fin et sortie en route)');

  // ── 3. L'offre : la décision pure (essai proposé ou non, et pourquoi) ─────────────────────────────────────────────
  console.log('\n3. L\'offre de l\'écran Cloud (regles.offreAccueil)');
  ok(typeof R.offreAccueil === 'function' && typeof FC.cartesFormulesCloud === 'function', 'offreAccueil et cartesFormulesCloud se chargent', R.__erreur ?? FC.__erreur);
  if (typeof R.offreAccueil === 'function') {
    const m = (essaiPermis, canalApp = 'stripe', boutique = 'oui') => FC.cartesFormulesCloud({ palier: 'gratuit', canalApp, essaiPermis, essaiBoutique: () => boutique });
    const a = R.offreAccueil(m(true), true);
    ok(a.essaiPropose === true && a.raison === null && a.carte?.formule === 'pro_cloud', 'droit lu + carte « essai » : essai proposé, Pro + Cloud', JSON.stringify(a));
    const b = R.offreAccueil(m(false), false);
    ok(b.essaiPropose === false && b.raison === 'essai_deja_pris', 'essai déjà pris : jamais proposé, raison dite', JSON.stringify(b));
    const c2 = R.offreAccueil(m(null), null);
    ok(c2.essaiPropose === false && c2.enLecture === true && c2.raison === 'lecture_en_cours', 'pas encore lu : rien n\'est promis');
    const d = R.offreAccueil(m(true, 'google', 'non'), true);
    ok(d.essaiPropose === false && d.raison === 'boutique_sans_semaine', 'Google ne propose pas la semaine : pas d\'essai');
    const e = R.offreAccueil(m(true), true, 'business_cloud');
    ok(e.essaiPropose === false, 'Business + Cloud n\'a JAMAIS d\'essai', JSON.stringify(e));
    ok(R.offreAccueil({ cartes: [] }, true).raison === 'formule_absente', 'aucune carte : raison « formule_absente »');
  }

  // ── 4. Les écrans rendus ──────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n4. Les écrans (rendus)');
  const T = TX.textesEntree('fr');
  const ctx = (o = {}) => ({
    lang: 'fr', fr: true, user: { id: 'u1', email: 'n@exemple.fr' }, surTelephone: o.tel ?? true, plateforme: o.plateforme ?? 'web',
    choix: { plateformes: ['vinted'] }, extensionVue: false, envoi: { etat: o.envoi ?? 'idle', email: 'n@exemple.fr' }, secondesRestantes: 0,
    releve: { etat: 'idle' }, murs: [], journaliser() {}, K: K1, grille: true, palier: 'gratuit', voie: o.voie ?? 'cloud',
    choisirVoie() {}, envoyerLien: async () => ({ ok: true }),
    cloud: { parcours: true, actif: false, ouvert: true, offre: { essai: true } },
    formules: {
      parcours: o.formules ?? true, essaiPermis: o.essaiPermis === undefined ? true : o.essaiPermis, actif: false,
      achat: { etat: 'repos', message: null }, vente: { fermee: false, dispo: null }, dates: { jourFin: 'Mercredi 25 novembre' },
      choisir() {}, lancer: async () => null, noterVoie() {},
    },
  });
  const rendre = (Comp, c) => { try { return renderToStaticMarkup(h(Comp, { c, T, onSuivant() {}, onAller() {}, onTerminer() {} })); } catch (err) { return `ERREUR ${err?.message}`; } };
  const avec = texte(rendre(AC.EtapeCloudOffre, ctx()));
  ok(/7 jours gratuits/.test(avec) && /Commencer mon essai gratuit/.test(avec), 'avec droit à l\'essai : « 7 jours gratuits » et « Commencer mon essai gratuit »', avec);
  ok(/0 € aujourd'hui, puis 49,99 €\/mois, résiliable à tout moment\./.test(avec), 'la ligne de prix validée : « 0 € aujourd\'hui, puis 49,99 €/mois, résiliable à tout moment. »', avec);
  ok(/Pro \+ Cloud/.test(avec) && /120 annonces par mois/.test(avec) && /1 200 publications par mois/.test(avec), 'Pro + Cloud et ses chiffres (coin_config)');
  ok(/Voir les autres formules/.test(avec) && /Plus tard/.test(avec) && !/Passer\b(?! à)/.test(avec), 'les autres formules derrière un lien ; « Plus tard » en bas ; pas de « Passer »', avec);
  ok(/Premier prélèvement le mercredi 25 novembre/.test(avec), 'la date du premier prélèvement est dite avant de valider');
  const sans = texte(rendre(AC.EtapeCloudOffre, ctx({ essaiPermis: false })));
  ok(/Publie sans ordinateur/.test(sans) && /Passer à Pro \+ Cloud/.test(sans) && !/7 jours|jours gratuits|0 € aujourd|Commencer mon essai/.test(sans),
    'sans droit à l\'essai : texte honnête, aucun mot d\'essai', sans);
  ok(/49,99 € prélevés aujourd'hui, puis chaque mois\. Résiliable à tout moment\./.test(sans) && /Ton essai gratuit a déjà servi/.test(sans), 'sans essai : le prix d\'aujourd\'hui, la raison dite', sans);
  const sc = texte(rendre(AC.EtapeSansCloud, ctx({ voie: 'sans_cloud' })));
  ok(/Pour publier, il te faut un ordinateur/.test(sc) && /l'extension FillSell, dans Chrome sur un ordinateur/.test(sc) && /M'envoyer le lien par mail/.test(sc),
    '« Plus tard » : il te faut un ordinateur, le lien par mail', sc);
  ok(/Finalement, essayer 7 jours gratuits/.test(sc) && /Continuer sans publier pour l'instant/.test(sc), 'retour au Cloud possible ; la sortie dit ce qu\'elle implique');
  const sce = texte(rendre(AC.EtapeSansCloud, ctx({ voie: 'sans_cloud', envoi: 'envoye' })));
  ok(/Lien envoyé à n@exemple\.fr/.test(sce) && /Continuer/.test(sce), 'lien envoyé : l\'adresse dite, « Continuer »', sce);
  const ordi = texte(rendre(AC.EtapeOrdinateurAccueil, ctx({ voie: null })));
  ok(/As-tu un ordinateur ?/.test(ordi) && /Oui, j'ai un ordinateur/.test(ordi) && /Non, seulement mon téléphone/.test(ordi) && /FillSell Cloud publie depuis nos serveurs, 7 jours gratuits/.test(ordi),
    '« As-tu un ordinateur ? » : les deux réponses ; l\'essai cité seulement s\'il est vrai', ordi);
  ok(!/7 jours/.test(texte(rendre(AC.EtapeOrdinateurAccueil, ctx({ voie: null, essaiPermis: false })))), 'sans droit à l\'essai : la réponse « Non » ne cite pas l\'essai');
  for (const [nom, html] of [['écran Cloud', avec], ['sans Cloud', sc], ['ordinateur', ordi], ['extension (téléphone)', texte(rendre(EXT.default, ctx({ voie: 'extension' })))]]) {
    ok(!/Installer l'extension/i.test(html), `${nom} : jamais « Installer l'extension » sur un téléphone`);
  }
  const ext = texte(rendre(EXT.default, ctx({ voie: 'extension' })));
  ok(/Ton ordinateur fait le travail/.test(ext) && /M'envoyer le lien pour mon ordinateur/.test(ext) && /Pas envie de le laisser allumé \?/.test(ext) && /Plus tard/.test(ext),
    'extension (téléphone) : le lien par mail, le Cloud en alternative, « Plus tard »', ext);

  // ── 5. Le journal de l'écran Cloud ────────────────────────────────────────────────────────────────────────────────
  console.log('\n5. Le journal (essai_propose)');
  const acSrc = sansCommentaires(lire('src/entree/EtapesAccueil.jsx'));
  ok(/c\.journaliser\('cloud_offre_vue', \{ essai_propose: o\.essaiPropose, formule_proposee: FORMULE, raison_sans_essai: o\.raison, appareil: c\.plateforme \}\)/.test(acSrc)
    && /if \(o\.enLecture\) return;/.test(acSrc), 'cloud_offre_vue { essai_propose, formule_proposee, raison_sans_essai, appareil }, jamais pendant la lecture');
  for (const ev of ['cloud_offre_clic', 'cloud_plus_tard', 'cloud_autres_formules', 'lien_mail_envoye', 'cloud_revu', 'continuer_sans_publier', 'cloud_alternative']) {
    ok(new RegExp(`'${ev}'`).test(acSrc), `trace « ${ev} »`);
  }
  ok(/k\.lancer\(formule, \{ essaiAffiche: essai \}\)/.test(acSrc), 'l\'achat passe par le chemin existant (c.formules.lancer → lancerAchatFormule d\'App)');

  // ── 6. Les mots ───────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n6. Les mots');
  const tous2 = fs.readdirSync(join(ROOT, 'src'), { recursive: true }).filter((f) => /\.(jsx?|ts)$/.test(f)).map((f) => sansCommentaires(lire(`src/${f.replace(/\\/g, '/')}`))).join('\n');
  ok(!/2\s*clics/.test(tous2), 'plus aucun « 2 clics » dans l\'app (décision 1 : « Résiliable à tout moment »)');
  ok(/résiliable à tout moment/.test(lire('src/entree/textes.js')) && /Résiliable à tout moment/.test(lire('src/entree/textes.js')), 'la phrase « résiliable à tout moment » est là');
  const en = TX.textesEntree('en');
  ok(typeof en.acCloudPrixEssai === 'function' && /cancel anytime/.test(en.acCloudPrixEssai('€0', '€49.99')) && !/[éèà]/.test(en.acOrdiTitre), 'anglais : les mêmes clés, sans mot français');
} finally {
  await vite.close();
}

console.log(`\n${rouges ? `✗ accueil-refonte : ${rouges} rouge(s), ${verts} vert(s)` : `✓ accueil-refonte : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
