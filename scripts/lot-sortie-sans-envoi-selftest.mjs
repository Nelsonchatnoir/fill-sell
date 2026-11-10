// ═══════════════════════════════════════════════════════════════════════════
// LE LOT PRÊT NE SE QUITTE PLUS EN SILENCE — « C'EST PARTI » SEULEMENT AVEC UN JOB (10/11/2026, URGENT d0ac0538)
//     npm run selftest:lot-sortie-sans-envoi
// ═══════════════════════════════════════════════════════════════════════════
// Le défaut (cliente FillSell Cloud en essai, 10/11 12:00 et 12:07) : deux lots préparés, chaque article « ✓ Réglé »,
// puis quittés — AUCUNE demande d'envoi n'est partie du téléphone (journaux du serveur). « Quitter ? Les textes
// préparés sont gardés » ne disait jamais que rien n'était parti ; elle a cru ses annonces publiées.
// Ce qu'il prouve :
//   1. la feuille « Rien n'est encore parti » (rendue) : la phrase vraie, le MÊME geste que le bouton du bas, et
//      « Quitter sans envoyer » ;
//   2. quitter un lot qui a des articles PRÊTS ouvre cette feuille (jamais une sortie directe) ; sans article prêt,
//      le second appui dit « Rien n'est parti » ; plus jamais « Les textes préparés sont gardés » ;
//   3. l'envoi demandé et la sortie sans envoi se tracent (usage_logs) ;
//   4. un article n'est « en file » que si son job est RELU (jobsDuLot EXÉCUTÉE sur une base simulée) : aucun job
//      relu → « Le serveur n'a pas confirmé » ; lecture en erreur → on ne conclut rien (la confirmation vaut) ;
//   5. l'écran de fin : ✓ et « C'est parti » seulement avec des publications en file ; sinon « Pas envoyé », « ! »,
//      « Rien n'est parti » — et l'écran qui a des publications en file est inchangé.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonctionJs } from './lib/extraire-fonction-js.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 900)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const texte = (html) => String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(ESP, ' ').replace(/\s+/g, ' ').trim();

const src = lire('src/publication/lot/LotPublication.jsx');

// ── 2 et 3 : la sortie, l'envoi, les traces (lecture du code servi) ─────────
console.log('A. Quitter un lot prêt, tracer');
const quitter = src.slice(src.indexOf('const quitter = () => {'), src.indexOf('let cta = null, disabled = false'));
ok(/if \(etape === "avant" && prets\.length > 0\) \{ setSortieAConfirmer\(true\); return; \}/.test(quitter),
  'des articles PRÊTS : « Quitter » ouvre la feuille, jamais une sortie directe');
ok(quitter.indexOf('setSortieAConfirmer(true)') < quitter.indexOf('setQuitterArme(true)') && /quitterSansEnvoyer\(\);\s*\};/.test(quitter),
  'sans article prêt : le second appui, puis la sortie tracée');
ok(!src.includes('"Quitter ? Les textes préparés sont gardés"') && !src.includes('"Leave? Prepared texts are kept"'), 'plus jamais « Les textes préparés sont gardés » sur le bouton');
ok(src.includes('"Rien n\'est parti — quitter ?"') && src.includes('"Nothing sent yet — leave?"'), 'le second appui dit « Rien n\'est parti — quitter ? »');
const qse = src.slice(src.indexOf('const quitterSansEnvoyer = () => {'), src.indexOf('const quitter = () => {'));
ok(/if \(lot && etape === "avant" && !partis\) journaliser\("lot_quitte_sans_envoyer", metaSortie\(\)\);\s*fermer\(\);/.test(qse),
  'la sortie sans envoi se trace (lot_quitte_sans_envoyer), puis le lot se ferme');
ok(/onEnvoyer=\{\(\) => \{ setSortieAConfirmer\(false\); envoyer\(\); \}\}/.test(src) && /onQuitter=\{quitterSansEnvoyer\}/.test(src),
  'la feuille : « Envoyer » = le MÊME envoyer() que le bouton du bas ; « Quitter sans envoyer » = la sortie tracée');
const envoyer = extraireFonctionJs(src, 'envoyer');
ok(/journaliser\("lot_envoi_demande", \{ lot: lot\.id, prets: ids\.length/.test(envoyer) && envoyer.indexOf('lot_envoi_demande') < envoyer.indexOf('envoiEnCoursRef.current = true'),
  'le geste d\'envoi se trace (lot_envoi_demande) avant la boucle');

// ── 4 : « en file » seulement avec un job relu ───────────────────────────────
console.log('B. La preuve du job');
const boucle = extraireFonctionJs(src, 'envoyerUnParUn');
const iPreuve = boucle.indexOf('const preuve = await jobsDuLot(id);');
ok(iPreuve > 0 && iPreuve < boucle.indexOf('phase: "envoye"') && iPreuve < boucle.indexOf('parti++'),
  'la preuve est lue AVANT de dire « en file » et de compter l\'article parti');
ok(/if \(preuve\.lue && preuve\.n === 0\) \{[\s\S]{0,400}phase: "refuse"/.test(boucle), 'aucun job relu → « refuse » (le serveur n\'a pas confirmé)');
ok(!/supabase\.from\("cross_post_jobs"\)\.update\(\{ bulk_batch_id: lot\.id \}\)[\s\S]{0,300}\.then\(/.test(boucle), 'l\'estampille n\'est plus jetée sans être lue');

const corps = extraireFonctionJs(src, 'jobsDuLot');
const fabrique = new Function('supabase', 'userId', 'lot', 'console', `${corps}; return jobsDuLot;`);
const base = ({ maj = [], majErreur = null, compte = 0, compteErreur = null } = {}) => {
  const appels = [];
  const requete = (genre) => {
    const q = {
      filtres: [],
      eq(c, v) { this.filtres.push(['eq', c, v]); return this; },
      filter(c, o, v) { this.filtres.push(['filter', c, o, v]); return this; },
      select(cols, opts) {
        if (genre === 'update') { appels.push({ genre, filtres: this.filtres }); return Promise.resolve({ data: majErreur ? null : maj, error: majErreur }); }
        this.opts = opts; return this;
      },
      then(res, rej) { appels.push({ genre, filtres: this.filtres, opts: this.opts }); return Promise.resolve({ count: compteErreur ? null : compte, error: compteErreur }).then(res, rej); },
    };
    return q;
  };
  return {
    appels,
    from(t) { if (t !== 'cross_post_jobs') throw new Error(t); return { update: () => requete('update'), select: (c, o) => requete('select').select(c, o) }; },
  };
};
const silence = { warn() {} };
const lot = { id: 'lot-1' };
{
  const s = base({ maj: [{ id: 'j1' }, { id: 'j2' }] });
  const r = await fabrique(s, 'u1', lot, silence)('42');
  ok(r.lue && r.n === 2 && s.appels.length === 1, 'jobs estampillés : { lue, n: 2 }, sans seconde lecture', JSON.stringify(r));
  const f = s.appels[0].filtres.map((x) => x.join(':')).join(' ');
  ok(/eq:user_id:u1/.test(f) && /eq:inventaire_id:42/.test(f) && /eq:action:publish/.test(f) && /filter:platform_fields->lot_publication->>id:eq:lot-1/.test(f),
    'le filtre : ce compte, cet article, publish, le marqueur de CE lot', f);
}
{
  const s = base({ maj: [], compte: 0 });
  const r = await fabrique(s, 'u1', lot, silence)('42');
  ok(r.lue && r.n === 0 && s.appels.length === 2, 'rien estampillé ET rien relu : { lue: true, n: 0 } → « refuse »', JSON.stringify(r));
}
{
  const s = base({ maj: [], compte: 3 });
  const r = await fabrique(s, 'u1', lot, silence)('42');
  ok(r.lue && r.n === 3, 'rien estampillé mais 3 jobs relus : en file (jamais un faux « rien »)', JSON.stringify(r));
}
{
  const r1 = await fabrique(base({ majErreur: { message: 'x' } }), 'u1', lot, silence)('42');
  const r2 = await fabrique(base({ maj: [], compteErreur: { message: 'y' } }), 'u1', lot, silence)('42');
  ok(!r1.lue && !r2.lue, 'lecture en erreur : on ne conclut rien (la confirmation du serveur vaut)');
}

// ── 1 et 5 : les écrans rendus ───────────────────────────────────────────────
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
  const h = React.createElement;
  const LOT = await vite.ssrLoadModule('/src/publication/lot/LotPublication.jsx');
  const noop = () => {};

  console.log('C. La feuille « Rien n\'est encore parti »');
  const f3 = texte(renderToStaticMarkup(h(LOT.SortieSansEnvoi, { en: false, nPrets: 3, libelleEnvoi: 'Envoyer 6 publications', onEnvoyer: noop, onQuitter: noop, onRester: noop })));
  ok(/Rien n'est encore parti/.test(f3) && /Tes 3 articles sont prêts mais pas encore envoyés : aucune annonce ne part sur les plateformes tant que tu n'appuies pas sur « Envoyer »/.test(f3), 'la phrase vraie (3 articles)', f3);
  ok(/Envoyer 6 publications/.test(f3) && /Quitter sans envoyer/.test(f3), 'les deux gestes : le libellé du bouton du bas, et « Quitter sans envoyer »', f3);
  const f1 = texte(renderToStaticMarkup(h(LOT.SortieSansEnvoi, { en: false, nPrets: 1, onEnvoyer: noop, onQuitter: noop, onRester: noop })));
  ok(/Ton article est prêt mais pas encore envoyé/.test(f1) && /Envoyer/.test(f1), 'au singulier, libellé par défaut « Envoyer »', f1);
  const fe = texte(renderToStaticMarkup(h(LOT.SortieSansEnvoi, { en: true, nPrets: 2, libelleEnvoi: 'Send 4 publications', onEnvoyer: noop, onQuitter: noop, onRester: noop })));
  ok(/Nothing has been sent yet/.test(fe) && /Your 2 items are ready but not sent/.test(fe) && /Leave without sending/.test(fe), 'en anglais', fe);

  console.log('D. L\'écran de fin');
  const item = (id) => ({ id, titre: `Article ${id}`, photos: [] });
  const parId = new Map([['1', { id: '1', item: item('1') }], ['2', { id: '2', item: item('2') }]]);
  const lotFin = { id: 'l1', le: new Date().toISOString(), ids: ['1', '2'], plateformes: ['vinted', 'leboncoin'] };
  const base0 = { en: false, L: { envoye: 'En file', refuse: 'À toi de jouer' }, lot: lotFin, lignes: ['1', '2'], parId, extensionNeverSeen: false, ebayParServeur: false, onOuvrirArticle: noop, remise: null };
  const rien = renderToStaticMarkup(h(LOT.EcranFin, { ...base0, etats: { 1: { phase: 'refuse', raison: 'Le serveur n\'a pas confirmé — rien n\'a été créé pour cet article.' }, 2: { phase: 'questions' } } }));
  ok(!rien.includes('✓') && />!</.test(rien) && /Rien n'est parti/.test(texte(rien)), 'rien en file : ni ✓ ni « en file », « ! » et « Rien n\'est parti »', texte(rien));
  const parti = renderToStaticMarkup(h(LOT.EcranFin, { ...base0, etats: { 1: { phase: 'envoye', envoyees: ['vinted', 'leboncoin'] }, 2: { phase: 'questions' } } }));
  ok(parti.includes('<div class="fsn-ok-rond">✓</div>') && /2 annonces en file/.test(texte(parti)), 'des publications en file : la coche et « 2 annonces en file », comme avant', texte(parti));
  ok(/const titre = etape === "fin"\s*\? \(partis \? \(en \? "It's under way" : "C'est parti"\) : \(en \? "Not sent" : "Pas envoyé"\)\)/.test(src),
    'le titre de l\'écran 3 : « C\'est parti » seulement avec au moins un article en file');
  ok(src.includes('"Prêt à envoyer — touche la ligne pour revoir."') && !src.includes('"Réglé — touche la ligne pour revoir."'), 'la ligne d\'un article réglé dit « Prêt à envoyer », jamais « Réglé »');

  // ── E : l'adresse de remise manquante (la VRAIE cause du lot bloqué de d0ac0538) ──
  console.log('E. L\'adresse de remise, demandée dans le lot');
  const R = await vite.ssrLoadModule('/src/publication/lot/regles.js');
  const S = await vite.ssrLoadModule('/src/publication/lot/sujetsDuLot.js');
  // Le moteur d'un article importé de Vinted, visé Leboncoin + Beebs, compte SANS adresse de remise : rien de publiable.
  const mSans = { preparationAuRepos: true, ctaDisabled: true, price: 20, plateformesPubliables: new Set(), selected: new Set(['leboncoin', 'beebs']),
    lbcAdresseManquante: { plateformes: ['leboncoin', 'beebs'] }, motifsCtaGris: ['Adresse de remise à indiquer (Leboncoin, Beebs) — Réglages › Expédition.'],
    texteVendeur: { titre: 'T', description: 'D' }, generales: { titre: 'T', description: 'D' }, edited: {}, jumeaux: [], clesQuestions: [] };
  const b = R.bilanArticle(mSans, {}, 'fr');
  ok(!b.pret && b.motifs.some((x) => x.cle === 'adresse') && !b.motifs.some((x) => ['aucune', 'cta'].includes(x.cle)),
    'bilan : le motif « Adresse de remise », jamais « Aucune plateforme » ni « À vérifier »', JSON.stringify(b.motifs));
  const qs = S.questionsDeLArticle(mSans, b.motifs, { lang: 'fr' });
  ok(qs.length === 1 && qs[0].type === 'adresse' && qs[0].libelle === 'Adresse de remise' && qs[0].plateformes.join() === 'leboncoin,beebs',
    'la question du lot : « Adresse de remise » (Leboncoin, Beebs), une seule', JSON.stringify(qs));
  // Une autre plateforme part quand même : l'adresse n'arrête pas l'article (comportement d'avant, inchangé).
  const bAutre = R.bilanArticle({ ...mSans, ctaDisabled: false, plateformesPubliables: new Set(['vinted']), motifsCtaGris: [] }, {}, 'fr');
  ok(bAutre.pret && !bAutre.motifs.length, 'Vinted part : l\'article reste prêt (les plateformes sans adresse sont exclues, comme avant)', JSON.stringify(bAutre));
  const AR = await vite.ssrLoadModule('/src/publication/lot/AdresseRemiseDuLot.jsx');
  const ad = texte(renderToStaticMarkup(h(AR.default, { en: false, plateformes: ['leboncoin', 'beebs'], nArticles: 5, onEnregistree: noop })));
  ok(/Ton adresse de remise/.test(ad) && /Leboncoin et Beebs demandent une adresse de remise à chaque annonce/.test(ad) && /tes 5 articles ne peuvent pas y partir sans elle/.test(ad)
    && /Enregistrer mon adresse/.test(ad), 'le bloc du lot : la phrase vraie et le geste « Enregistrer mon adresse »', ad);
  const arSrc = lire('src/publication/lot/AdresseRemiseDuLot.jsx');
  ok(/fusionnerReglages\(\["leboncoin"\], \{ rue: r, code_postal: p, ville: v, adresse \}\)/.test(arSrc) && /adresseLbcHorsFrance\(/.test(arSrc) && /api-adresse\.data\.gouv\.fr/.test(arSrc),
    'la MÊME écriture que Réglages › Expédition (champs d\'adresse seuls, fusionnés), hors de France averti, vérification BAN');
  const moteur = lire('src/components/ListingPreviewScreen.jsx');
  ok(/relireAdresseLbc: async \(\) => \{\s*const r = await lireAdresseRemiseLbc\(\);\s*if \(r\.lue\) setAdresseLbc\(\{ chargee: true, valeur: r\.valeur \}\);/.test(moteur),
    'le moteur relit l\'adresse à la demande du lot (même lecture qu\'au clic)');
  ok(/if \(publishChips\.length === 0 && cocheesSansAdresse\.length\) \{[\s\S]{0,300}Adresse de remise à indiquer/.test(moteur) && /if \(publishChips\.length === 0 && !cocheesSansAdresse\.length\) \{/.test(moteur),
    'le bouton gris nomme l\'adresse, jamais « Coche eBay, Depop » à qui a coché Leboncoin et Beebs');
  ok(/adresseDuLot\.ids\.length > 0 && blocProtege\("adresse"/.test(src) && /onEnregistree=\{relireAdresseDesMoteurs\}/.test(src) && /q\.type === "adresse"/.test(src),
    'le lot montre le bloc dès qu\'un article l\'attend, et chaque moteur relit l\'adresse enregistrée');
} finally {
  await vite.close();
}

console.log(`\n${rouges === 0 ? '✓' : '✗'} lot-sortie-sans-envoi : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
