// CONSTRUIT LA FIXTURE DU BANC 20261111140000 (retrait « partout » et comptes reliés) : le catalogue de PROD RÉDUIT À LA
// CHAÎNE — les définitions de prod (pg_get_functiondef) des fonctions que la chaîne exécute, les tables qu'elles
// lisent (colonnes, contraintes, index de prod) et TOUS les déclencheurs de prod de `inventaire`, de `cross_post_jobs`
// (les deux tables où la règle se déclenche et écrit) et de `inventaire_doublons` (la question posée au compte relié).
// Rien n'est réécrit de mémoire.
//
//   node scripts/essais/20261111140000_fixture.mjs --catalogue <catalogue-complet.json> [--tables-maj <tables.json>]
//        [--droits <droits.json>] [--verifie-le <ISO>]
//
// <catalogue-complet.json> : le catalogue lu en prod EN LECTURE SEULE (`npx supabase db query --linked --read-only`,
// mêmes requêtes que scripts/preuve-vendu-retire-partout.mjs : catalogue système + coin_config + platform_health), gardé
// HORS du dépôt. <tables.json> : la sortie `-o json` de la même requête « tables » pour des tables dont les colonnes ont
// changé depuis. <droits.json> : les politiques RLS, les droits et le propriétaire des tables de la chaîne (pg_policy,
// pg_class.relacl), lus de même — le banc joue la suppression comme l'app : rôle `authenticated`, sous RLS.
//
// ⛔ (11/11, relecture M8) AUCUNE DONNÉE CLIENT DANS LA FIXTURE VERSIONNÉE. Les commentaires des corps de prod citent des
// cas réels (prénoms, pseudos de boutique, numéros d'annonce) : ils sont RETIRÉS ici, par un lecteur SQL qui respecte les
// chaînes ('…', E'…', "…", $tag$…$tag$) — seuls les commentaires (-- … et /* … */) partent, jamais un caractère de code.
// Chaque fonction porte donc deux empreintes :
//   · `md5_prod` : md5 de pg_get_functiondef EN PROD, tel que lu (pour recomparer la fixture à la prod, en lecture seule) ;
//   · `md5`      : md5 du corps SANS commentaires, celui que le décor installe et que la base jetable rend à l'octet.
// Le lecteur est contrôlé à la construction : un second passage ne change rien, et le code (hors commentaires) de chaque
// corps est identique, jeton par jeton, à celui de prod.
// Fixture du 11/11/2026 : catalogue relu en prod le 11/11 vers 15:41 (heure de Paris) ; les 166 fonctions, les
// déclencheurs de inventaire et de cross_post_jobs et les colonnes des tables de la fixture du 08/11 y étaient identiques.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

/**
 * Le code d'un corps SQL / PL/pgSQL sans ses commentaires. Respecte les chaînes ('…' avec '', E'…' avec \', "…" avec "",
 * $tag$…$tag$). Les sauts de ligne d'un commentaire /* … *\/ sont gardés : les lignes restent en face. (pur)
 */
export function sansCommentairesSql(s) {
  let out = '';
  let i = 0;
  const n = s.length;
  const identifiant = (ch) => /[A-Za-z0-9_$]/.test(ch ?? '');
  while (i < n) {
    const ch = s[i], suiv = s[i + 1];
    if (ch === '-' && suiv === '-') { while (i < n && s[i] !== '\n') i++; continue; }
    if (ch === '/' && suiv === '*') {
      let prof = 0, sauts = 0;
      while (i < n) {
        if (s[i] === '/' && s[i + 1] === '*') { prof++; i += 2; continue; }
        if (s[i] === '*' && s[i + 1] === '/') { prof--; i += 2; if (prof === 0) break; continue; }
        if (s[i] === '\n') { out += '\n'; sauts++; }
        i++;
      }
      if (!sauts) out += ' ';   // jamais deux jetons collés (a/*…*/b)
      continue;
    }
    if (ch === "'") {
      const echappe = (s[i - 1] === 'E' || s[i - 1] === 'e') && !identifiant(s[i - 2]);
      let j = i + 1;
      while (j < n) {
        if (echappe && s[j] === '\\') { j += 2; continue; }
        if (s[j] === "'") { if (s[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < n) { if (s[j] === '"') { if (s[j + 1] === '"') { j += 2; continue; } break; } j++; }
      out += s.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '$' && !identifiant(s[i - 1])) {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(s.slice(i, i + 80));
      if (m) {
        const fin = s.indexOf(m[0], i + m[0].length);
        const j = fin < 0 ? n : fin + m[0].length;
        out += s.slice(i, j); i = j; continue;
      }
    }
    out += ch; i++;
  }
  return out;
}

/** Une définition pg_get_functiondef sans les commentaires de son corps (l'en-tête n'en porte jamais). (pur) */
export function definitionSansCommentaires(def) {
  const m = /^AS (\$[A-Za-z_0-9]*\$)$/m.exec(def);
  if (!m) return def;
  const debut = m.index + m[0].length;
  const fin = def.lastIndexOf(m[1]);
  if (fin <= debut) return def;
  const corps = def.slice(debut, fin);
  const avant = corps.split('\n');
  const apres = sansCommentairesSql(corps).split('\n');
  if (avant.length !== apres.length) throw new Error('lecteur SQL : nombre de lignes changé');
  const lignes = [];
  for (let k = 0; k < avant.length; k++) {
    if (apres[k] === avant[k]) { lignes.push(apres[k]); continue; }
    const l = apres[k].replace(/[ \t]+$/, '');
    if (l.trim() === '' && avant[k].trim() !== '') continue;   // une ligne qui n'était qu'un commentaire
    lignes.push(l);
  }
  return def.slice(0, debut) + lignes.join('\n') + def.slice(fin);
}

/** Les jetons du code (hors blancs et commentaires ; le corps lu comme du code) : sert au contrôle du lecteur. (pur) */
export function jetonsSql(def) {
  const m = /^AS (\$[A-Za-z_0-9]*\$)$/m.exec(def);
  if (!m) return def.split(/\s+/).filter(Boolean);
  const debut = m.index + m[0].length, fin = def.lastIndexOf(m[1]);
  return [def.slice(0, debut), sansCommentairesSql(def.slice(debut, fin)), def.slice(fin)].join('\n').split(/\s+/).filter(Boolean);
}

const estPrincipal = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (estPrincipal) construire();

function construire() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const SORTIE = join(ROOT, 'scripts/essais/fixtures/prod-1111-retrait-fiche-liee/catalogue.json');
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const fichier = arg('--catalogue');
  if (!fichier) { console.error('usage : --catalogue <catalogue-complet.json> [--tables-maj <tables.json>] [--droits <droits.json>] [--verifie-le <ISO>]'); process.exit(2); }
  const cat = JSON.parse(readFileSync(fichier, 'utf8'));
  const maj = arg('--tables-maj') ? JSON.parse(readFileSync(arg('--tables-maj'), 'utf8')) : null;
  for (const t of (maj?.rows ?? maj ?? [])) {
    const cible = cat.tables.find((x) => x.nom === t.nom);
    if (!cible) throw new Error(`table inconnue du catalogue : ${t.nom}`);
    cible.cols = t.cols; cible.cons = t.cons; cible.idx = t.idx;
  }

  // Les tables où la règle se déclenche et écrit : tous leurs déclencheurs de prod.
  const TABLES_A_DECLENCHEURS = ['inventaire', 'cross_post_jobs', 'inventaire_doublons'];
  // Les fonctions que le banc appelle ou dont la règle dépend, hors déclencheurs (la clôture ajoute ce qu'elles appellent).
  const RACINES = [
    // la vente entre comptes reliés et ses preuves (jamais réécrites)
    'armer_retraits_copies', 'armer_retrait_job', 'armer_retrait_job_pour', 'vente_prouvee_fiche_liee', 'retrait_job_prouve',
    'rattachement_confirme', 'fiche_annonces_vivantes', 'comptes_sont_lies', 'listing_designe', 'opla_sortie_passee',
    'vinted_annonce_vendue', 'annonce_importee', 'vente_apres_mise_en_ligne', 'annonce_mise_en_ligne', 'vente_instant',
    'annonce_id_de_job', 'leboncoin_transaction_lue', 'opla_copie_a_retirer_noter',
    // la suppression « laisser les annonces en ligne », la lecture de la jumelle par l'app, la boutique partagée
    'inventaire_supprimer_sans_retrait', 'jumelle_occupe_plateformes', 'boutique_partagee_compte_relie', 'copies_fiches_jumelles',
    // la question « Déjà vendu ? » de la vente (le mécanisme repris pour la copie au titre seul) et sa réponse
    'poser_questions_copies_non_prouvees', 'inventaire_doublon_decider', 'inventaire_doublon_decider_corps',
    // ce qui publie ou republie sans geste, et ce qui garde une tâche arrêtée
    'remises_en_vente_tick', 'republish_planifiee_candidats', 'republication_engagee', 'republication_retrait_engage',
    'expire_publish_reservations', 'controler_job_extension', 'ecrire_statut_job_extension',
    'relancer_jobs_connexion', 'relancer_jobs_connexion_echus',
  ];

  const fns = new Map();
  for (const f of cat.fonctions) { if (!fns.has(f.nom)) fns.set(f.nom, []); fns.get(f.nom).push(f); }
  const tables = new Map(cat.tables.map((t) => [t.nom, t]));
  const corps = (f) => sansCommentairesSql(f.def.slice(f.def.indexOf('AS $')));
  const appels = (txt) => { const out = new Set(); for (const m of txt.matchAll(/\b(?:public\.)?([a-z_][a-z_0-9]*)\s*\(/g)) if (fns.has(m[1])) out.add(m[1]); return out; };

  const racines = new Set(RACINES);
  for (const nom of TABLES_A_DECLENCHEURS) for (const g of (tables.get(nom)?.trig ?? [])) racines.add(g.fn);
  const gardees = new Set(), file = [...racines];
  while (file.length) {
    const n = file.pop();
    if (gardees.has(n)) continue;
    if (!fns.has(n)) throw new Error(`fonction absente du catalogue : ${n}`);
    gardees.add(n);
    for (const f of fns.get(n)) for (const a of appels(corps(f))) if (!gardees.has(a)) file.push(a);
  }
  const tablesGardees = new Set(TABLES_A_DECLENCHEURS);
  for (const n of gardees) for (const f of fns.get(n)) for (const m of corps(f).matchAll(/\b(?:public\.)?([a-z_][a-z_0-9]*)\b/g)) if (tables.has(m[1])) tablesGardees.add(m[1]);
  // Les tables rattachées à une fiche par une clé étrangère (la suppression d'une fiche les touche : scripts de réparation).
  for (const t of cat.tables) if ((t.cons ?? []).some((k) => k.type === 'f' && k.ref === 'inventaire')) tablesGardees.add(t.nom);

  const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
  const fonctions = [...gardees].sort().flatMap((n) => fns.get(n).map((f) => {
    const def = definitionSansCommentaires(f.def);
    // Le contrôle du lecteur : idempotent, et le CODE inchangé, jeton par jeton.
    if (definitionSansCommentaires(def) !== def) throw new Error(`lecteur SQL non idempotent : ${f.nom}`);
    if (JSON.stringify(jetonsSql(def)) !== JSON.stringify(jetonsSql(f.def))) throw new Error(`lecteur SQL : le code de ${f.nom} a changé`);
    return { nom: f.nom, args: f.args, def, md5_prod: md5(f.def) };
  }));
  const sortieTables = [...tablesGardees].sort().map((n) => {
    const t = tables.get(n);
    return { nom: t.nom, cols: t.cols, cons: t.cons ?? [], idx: t.idx ?? [], trig: TABLES_A_DECLENCHEURS.includes(n) ? (t.trig ?? []) : [] };
  });
  const sequences = cat.divers.filter((d) => d.k === 'seq' && sortieTables.some((t) => t.cols.some((k) => String(k.d ?? '').includes(d.nom)))).map((d) => d.nom);
  // La configuration : coin_config sans les réglages du Cloud (étrangers à la chaîne) ; platform_health réduite à la pause.
  const coin = (cat.config.find((c) => c.t === 'coin_config')?.lignes ?? []).filter((l) => !/^cloud_/.test(l.key)).map((l) => ({ key: l.key, value: l.value }));
  // Les droits de prod des tables de la chaîne : RLS, droits des rôles clients, politiques.
  const lusDroits = arg('--droits') ? JSON.parse(readFileSync(arg('--droits'), 'utf8')) : null;
  const droits = { tables: [], politiques: [], roles: [] };
  for (const l of (lusDroits?.rows ?? lusDroits ?? [])) {
    if (l.quoi === 'table') droits.tables.push({ nom: l.objet, rls: l.detail.rls, force: l.detail.force, acl: l.detail.acl });
    if (l.quoi === 'politique') droits.politiques.push({ table: l.objet, ...l.detail });
    if (l.quoi === 'role') droits.roles.push({ nom: l.objet, config: l.detail.config ?? null });
  }
  const sante = (cat.config.find((c) => c.t === 'platform_health')?.lignes ?? []).map((l) => ({ platform: l.platform, paused: l.paused }));

  const fixture = {
    source: 'catalogue de PROD réduit à la chaîne du retrait (scripts/essais/20261111140000_fixture.mjs), commentaires des corps retirés',
    lu_le: cat.lu_le, verifie_le: arg('--verifie-le') ?? new Date().toISOString(),
    tables_a_declencheurs: TABLES_A_DECLENCHEURS, racines: RACINES,
    md5: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, md5(f.def)])),
    md5_prod: Object.fromEntries(fonctions.map((f) => [`${f.nom}(${f.args})`, f.md5_prod])),
    fonctions: fonctions.map(({ nom, args, def }) => ({ nom, args, def })), tables: sortieTables, sequences,
    config: { coin_config: coin, platform_health: sante }, droits,
  };
  mkdirSync(dirname(SORTIE), { recursive: true });
  writeFileSync(SORTIE, JSON.stringify(fixture, null, 1) + '\n');
  console.log(`fixture : ${fonctions.length} fonctions, ${sortieTables.length} tables, ${sortieTables.reduce((n, t) => n + t.trig.length, 0)} déclencheurs, `
    + `${sequences.length} séquences, ${coin.length} clés coin_config, ${droits.politiques.length} politiques — ${Math.round(JSON.stringify(fixture).length / 1024)} Ko`);
}
