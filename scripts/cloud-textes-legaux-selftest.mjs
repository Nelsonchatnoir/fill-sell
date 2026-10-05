// Autotest des TEXTES LÉGAUX de l'option « Sans ordinateur » (05/10/2026).
//
//     npm run selftest:cloud-textes-legaux
//
// Prouve, sans réseau :
//   1. les textes disent ce que fait le code : durées lues dans la migration du
//      socle et dans les règles pures (repos 7 j, grâce 2 j → « au plus tard
//      3 jours », empreintes 12 mois, connexions 90 jours), prix et essai lus
//      dans palier.js, IPRoyal = IPRoyal Services FZE LLC (Émirats, clauses
//      contractuelles types), Hetzner Online GmbH (Allemagne) ;
//   2. fr et en ont la même forme ; vouvoiement en confidentialité (ton de la
//      page), jamais de tutoiement ; jamais Beebs ni Opla promis ;
//   3. /legal, interrupteur BAISSÉ : aucune trace de l'option (fr et en) ;
//   4. /legal, interrupteur LEVÉ (module remplacé dans ce test seulement) :
//      article 2 complété, article 7, CGU 3.9, sous-traitants, 4.8 — et les
//      articles 1 à 6 toujours là.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, n = 0;
const ok = (c, m, d = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 300)}` : ''}`); } };
const NBSP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');

const { textesLegauxCloud } = await import(pathToFileURL(join(ROOT, 'src/cloud/textesLegaux.js')).href);
const FR = textesLegauxCloud('fr'), EN = textesLegauxCloud('en');
const tout = (T) => [T.cgvArticle2, T.cgvArticle7.t, ...T.cgvArticle7.ps, T.cgu39, ...T.sousTraitants.flat(),
  T.confidentialite.titre, T.confidentialite.intro, T.confidentialite.conserve, ...T.confidentialite.liste.flat(),
  T.confidentialite.ou, T.confidentialite.duree, T.confidentialite.essai].join('\n').replace(NBSP, ' ');
const fr = tout(FR), en = tout(EN);

console.log('\n1. Les faits, alignés sur le code');
const socle = lire('supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql');
const pool = lire('supabase/functions/_shared/cloud-pool.js');
const repos = Number(socle.match(/cloud_param\('repos_jours', (\d+)\)/)?.[1]);
const grace = Number(socle.match(/cloud_param\('grace_jours', (\d+)\)/)?.[1]);
const mois = Number(socle.match(/cloud_param\('empreintes_conservation_mois', (\d+)\)/)?.[1]);
const connexions = Number(socle.match(/DELETE FROM public\.cloud_connexions WHERE ouverte_le < now\(\) - interval '(\d+) days'/)?.[1]);
ok(repos === 7 && /reposJours: 7,/.test(pool), `repos de l'IP : ${repos} jours (migration et règles pures)`);
ok(new RegExp(`reste ensuite au repos ${repos} jours`).test(fr) && new RegExp(`rests for ${repos} days`).test(en), 'le repos dit est celui du code');
ok(grace === 2 && /au plus tard 3 jours après la fin/.test(fr) && /no later than 3 days after the end/.test(en), `effacement « au plus tard 3 jours » = grâce de ${grace} j + entretien horaire (alerte au-delà d'une heure)`);
ok(/purge\(s\) en retard de plus d'une heure/.test(lire('serveur-cloud/src/entretien.js')), 'l’entretien alerte sur une purge en retard d’une heure');
ok(mois === 12 && /conservées 12 mois après la fin de l'essai, y compris si le compte est supprimé/.test(fr), `empreintes : ${mois} mois, même compte supprimé (ON DELETE SET NULL)`);
ok(/user_id\s+uuid REFERENCES auth\.users \(id\) ON DELETE SET NULL/.test(socle), 'les empreintes survivent bien à la suppression du compte (le texte le dit)');
ok(/effacé au bout de 12 mois/.test(fr) && /SET user_id = NULL WHERE user_id IS NOT NULL AND le < now\(\) - make_interval\(months => v_mois\)/.test(socle), 'journal des IP : identifiant effacé à 12 mois');
ok(connexions === 90 && /« Me connecter »[^:]*: 90 jours/.test(fr) && /90 days/.test(en), `connexions « Me connecter » : ${connexions} jours`);
const P = await import(pathToFileURL(join(ROOT, 'src/utils/palier.js')).href);
ok(P.CLOUD_PRIX_AFFICHE === '20 €' && /20 € TTC par mois/.test(fr) && /€20 including VAT per month/.test(en), 'prix : 20 € TTC (CLOUD_PRIX_AFFICHE)');
ok(P.CLOUD_ESSAI_JOURS === 7 && /Essai gratuit de 7 jours/.test(fr) && /7-day free trial/.test(en), 'essai : 7 jours (CLOUD_ESSAI_JOURS)');
ok(/IPRoyal Services FZE LLC \(Ajman, Émirats arabes unis\)/.test(fr) && /IPRoyal Services FZE LLC \(Ajman, United Arab Emirates\)/.test(en), 'IPRoyal : la société et le pays exacts (relus le 05/10)');
ok(/clauses contractuelles types de la Commission européenne/.test(fr) && /standard contractual clauses/.test(en), 'le transfert hors UE et son encadrement sont dits');
ok(/au moins 6 mois/.test(fr) && /at least 6 months/.test(en), 'la conservation des journaux d’IPRoyal est dite');
ok(/Hetzner Online GmbH \(Gunzenhausen, Allemagne/.test(fr), 'Hetzner : la société et le pays');
ok(/AES-256-GCM/.test(fr) && /chiffrer|AES-256-GCM/.test(lire('serveur-cloud/src/coffre.js')), 'chiffrement des connexions : AES-256-GCM (coffre.js)');
ok(/HMAC-SHA256/.test(fr) && /hmac\(|sha256/i.test(socle), 'empreintes : HMAC-SHA256');
{
  const cx = lire('serveur-cloud/src/connexion.js');
  const journalSaisie = [...cx.matchAll(/journal\.\w+\(([^)]*)\)/g)].some((m) => /\b(t|texte|m\.s)\b/.test(m[1]));
  ok(/Input\.insertText/.test(cx) && !journalSaisie && !/writeFile/.test(cx), 'saisie relayée, jamais journalisée ; image jamais écrite (connexion.js)');
  ok(/sans être enregistré ni journalisé : nous ne conservons jamais votre mot de passe/.test(fr), 'le texte dit que la saisie passe par nos serveurs (et rien de plus)');
}
ok(/Au plus tard la veille de la fin de l'essai, un rappel est adressé à l'utilisateur dans l'application et par e-mail/.test(fr)
  && /ouvertureAvantFinH: 48, forcageAvantFinH: 24/.test(lire('supabase/functions/_shared/cloud-rappel-veille.js')), 'rappel « au plus tard la veille » = la fenêtre J-2 → J-1 du code');
ok(/Le droit de rétractation de l'article 6 s'applique à l'option/.test(fr), 'rétractation : l’article 6 s’applique');

console.log('\n2. La forme et le ton');
const forme = (T) => JSON.stringify([T.cgvArticle7.ps.length, T.sousTraitants.length, T.confidentialite.liste.length, Object.keys(T).sort(), Object.keys(T.confidentialite).sort()]);
ok(forme(FR) === forme(EN), 'fr et en : même forme', `${forme(FR)} ≠ ${forme(EN)}`);
ok(FR.cgvArticle7.t.startsWith('Article 7 — ') && EN.cgvArticle7.t.startsWith('Article 7 — '), 'l’article 7 suit les articles 1 à 6');
const conf = [FR.confidentialite.intro, ...FR.confidentialite.liste.flat(), FR.confidentialite.ou, FR.confidentialite.duree, FR.confidentialite.essai].join(' ');
ok(!/\b(tu|ton|ta|tes|toi)\b/i.test(conf) && /\bvous\b/.test(conf), 'confidentialité : vouvoiement (ton de la page), jamais « tu »');
ok(!/\b(tu|ton|tes)\b/i.test([...FR.cgvArticle7.ps, FR.cgvArticle2, FR.cgu39].join(' ')), 'CGV : « l’utilisateur », jamais « tu »');
ok(!/Beebs|Opla/i.test(fr + en), 'aucune plateforme non prouvée (ni Beebs ni Opla)');
ok(!/\bproxy\b/i.test(fr), 'pas de jargon « proxy » en français');

console.log('\n3. et 4. /legal, interrupteur baissé puis levé');
const cfg = lire('src/config/cloudOffer.js');
ok(/export const CLOUD_TEXTES_LEGAUX = CLOUD_OFFER_ENABLED;/.test(cfg), 'CLOUD_TEXTES_LEGAUX suit le drapeau de l’offre (jamais les témoins)');
globalThis.document ??= { body: {}, getElementById: () => null };
const stockage = new Map();
globalThis.localStorage = { getItem: (k) => stockage.get(k) ?? null, setItem: (k, v) => stockage.set(k, v), removeItem: (k) => stockage.delete(k) };
const { createServer } = await import('vite');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { MemoryRouter } = await import('react-router-dom');
const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(NBSP, ' ').replace(/\s+/g, ' ');
async function rendreLegal(ouvert) {
  const vite = await createServer({
    root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: ouvert ? [{
      name: 'textes-legaux-ouverts', enforce: 'pre',
      resolveId(src, importer) { return importer?.replace(/\\/g, '/').endsWith('/src/pages/Legal.jsx') && /config\/cloudOffer(\.js)?$/.test(src) ? '\0cloud-textes-ouverts' : null; },
      load(id) { return id === '\0cloud-textes-ouverts' ? 'export const CLOUD_TEXTES_LEGAUX = true;' : null; },
    }] : [],
  });
  try {
    const L = await vite.ssrLoadModule('/src/pages/Legal.jsx');
    const out = {};
    for (const lang of ['fr', 'en']) {
      stockage.set('fs_lang', lang);
      out[lang] = texte(renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(L.default))));
    }
    return out;
  } finally { await vite.close(); }
}
const ferme = await rendreLegal(false);
ok(ferme.fr.length > 5000 && /Article 6 — Droit de rétractation/.test(ferme.fr), 'baissé : la page se rend (fr)');
ok(!/Sans ordinateur|IPRoyal|Hetzner|Article 7/.test(ferme.fr) && !/No computer|IPRoyal|Hetzner|Article 7/.test(ferme.en), 'baissé : aucune trace de l’option (fr et en)');
const ouvert = await rendreLegal(true);
const net = (s) => s.replace(NBSP, ' ').replace(/\s+/g, ' ');
for (const lang of ['fr', 'en']) {
  const T = textesLegauxCloud(lang);
  const p = ouvert[lang];
  ok(p.includes(net(T.cgvArticle7.t)) && T.cgvArticle7.ps.every((x) => p.includes(net(x))), `levé (${lang}) : l’article 7 en entier`);
  ok(p.includes(net(T.cgvArticle2)) && p.includes(net(T.cgu39)), `levé (${lang}) : article 2 et CGU 3.9 complétés`);
  ok(T.sousTraitants.every(([nom]) => p.includes(nom)) && p.includes(net(T.confidentialite.titre)) && p.includes(net(T.confidentialite.essai)), `levé (${lang}) : sous-traitants et article 4.8`);
  ok([1, 2, 3, 4, 5, 6].every((i) => p.includes(`Article ${i} — `)), `levé (${lang}) : les articles 1 à 6 sont toujours là`);
  ok(p.indexOf('Article 6 — ') < p.indexOf('Article 7 — '), `levé (${lang}) : l’article 7 vient après le 6`);
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
