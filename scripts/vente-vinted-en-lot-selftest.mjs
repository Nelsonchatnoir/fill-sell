// selftest:vente-vinted-en-lot — UNE VENTE VINTED EN LOT = UNE VENTE PAR ARTICLE
// (17/10, point 11 — Amiral/Louis ; migration 20261017120000).
//
//   npm run selftest:vente-vinted-en-lot            contrôles du dépôt (hors ligne)
//   npm run selftest:vente-vinted-en-lot -- --prod  + la base, en LECTURE seule (après application)
//
//   A. la migration remplace deux définitions DEPUIS la prod (garde md5) ; l'inverse
//      les rend à l'octet ; les fonctions du point 12 (vente_commande_annulee_vinted,
//      inventaire_vendu_vinted_par_la_vente) ne sont jamais réécrites ;
//   B. la composition = transaction.order.item_ids, jamais le titre ; une vente par
//      article (commande_ref '<ref>:<article>') ; tout ou rien ; circuit normal ;
//      un inconnu = vente sans fiche + question, jamais un retrait ;
//   C. une commande payée prouve chaque article ; failed / cancelled jamais (R4) ;
//   D. UN mail par commande de moins de 24 h, qui liste tous ses articles ;
//   E. le prix : Vinted, sinon prorata au plus grand reste, base manquante = NULL ;
//   F. l'essai à blanc embarque la migration à l'octet ; la réparation : périmètre
//      par la composition lue, sauvegardes, 0 mail compté, inverse ;
//   G. push-ventes : les articles de la note, rétrocompatible ;
//   H. l'extension : item_ids de toute commande, relecture lots_v1 bornée,
//      normalisation '<ref>:<article>', veille → commandes_vinted_noter (3 au plus),
//      tolérante à une RPC absente (404, PGRST202 : rien, aucune erreur visible).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261017120000_ventes_vinted_en_lot.sql');
const INV = lire('supabase/rollbacks/20261017120000_ventes_vinted_en_lot.sql');
const ESSAI = lire('scripts/essais/20261017120000_essai.sql');
const REP = lire('scripts/reparations/20261017_ventes_vinted_en_lot.sql');
const REP_INV = lire('scripts/reparations/20261017_ventes_vinted_en_lot_INVERSE.sql');
const PUSH = lire('supabase/functions/push-ventes/index.ts');
const EXT = lire('chrome-extension/background.js');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
// Le corps tel que pg_get_functiondef le rend : de CREATE à la fin de $function$, saut de ligne compris.
const fonction = (txt, nom) => {
  const i = txt.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10) + '\n';
};
const MD5_ERV = '5d1980a5c3eda3f772c48d23803a7dbe';
const MD5_PVE = '369018f6704cb31ddb348183b333b368';

// ── A. Depuis la prod, à l'octet ─────────────────────────────────────────────
const ervProd = fonction(INV, 'enregistrer_ventes_relevees');
const pveProd = fonction(INV, 'push_ventes_a_envoyer');
const ervMig = fonction(MIG, 'enregistrer_ventes_relevees');
const pveMig = fonction(MIG, 'push_ventes_a_envoyer');
ok(md5(ervProd) === MD5_ERV && md5(pveProd) === MD5_PVE, 'A1. l\'inverse rend les deux définitions de prod à l\'octet (md5 du 17/10)');
ok(MIG.includes(`["enregistrer_ventes_relevees(text,jsonb,uuid)","${MD5_ERV}"]`) && MIG.includes(`["push_ventes_a_envoyer(integer)","${MD5_PVE}"]`)
  && /RAISE EXCEPTION 'définition de % changée en prod/.test(MIG), 'A2. garde md5 : la migration s\'arrête si une définition a bougé');
// Retirer les seuls blocs de la règle (17/10) rend la prod à l'octet.
const ervRamene = ervMig
  .replace("  -- (17/10, lots Vinted — point 11)\n  v_ex_lot jsonb; c_compositions int := 0; c_lots_eclates int := 0; c_lots_a_reparer int := 0; c_lots_en_doute int := 0;\n", '')
  .replace(/\n    -- \(17\/10, lots Vinted — point 11, Louis\) LA COMPOSITION[\s\S]*?c_compositions := c_compositions \+ 1;\n      END IF;\n    END IF;\n/, '')
  .replace("                  -- (17/10) les lignes d'une commande éclatée (une vente par article)\n"
    + '                  OR v.id IN (SELECT ca.vente_id FROM vinted_commandes_articles ca\n'
    + '                               WHERE ca.user_id = v_user AND ca.commande_ref = v_ref AND ca.vente_id IS NOT NULL)\n', '')
  .replace(/    -- \(17\/10, R1 — point 12\)[\s\S]*?PERFORM public\.vinted_commande_lue_tracer\(v_user, v_ref, v_statut, v_row, v_listing\);\n    END IF;\n/, '')
  .replace(/\n    -- \(17\/10, lots Vinted\) Une commande déjà ÉCLATÉE[\s\S]*?HAVING count\(\*\) = 1;\n    END IF;\n(?=\n    v_inv := NULL;)/, '')
  .replace(/    -- \(17\/10, lots Vinted — point 11\) UNE COMMANDE VINTED À PLUSIEURS ARTICLES[\s\S]*?c_lots_en_doute := c_lots_en_doute \+ 1;\n      END IF;\n    END IF;\n\n/, '')
  .replace("    'annulees_retirees', c_annulees_retirees, 'annulees_signalees', c_annulees_signalees,\n"
    + "    'compositions', c_compositions, 'lots_eclates', c_lots_eclates, 'lots_a_reparer', c_lots_a_reparer,\n"
    + "    'lots_en_doute', c_lots_en_doute);\n",
  "    'annulees_retirees', c_annulees_retirees, 'annulees_signalees', c_annulees_signalees);\n");
ok(ervMig && ervRamene === ervProd, 'A3. enregistrer_ventes_relevees = la prod + les seuls blocs de la règle (17/10)');
const pveRamene = pveMig
  .replace("        -- (17/10, point 11) la note d'une commande Vinted porte SES articles : UN mail les liste tous.\n"
    + "        'vente_id', r.vente_id, 'articles', r.articles,\n", "        'vente_id', r.vente_id,\n")
  .replace("        -- (17/10, point 11) la note d'une commande Vinted porte SES articles : UN mail les liste tous.\n"
    + "        'vente_id', r.vente_id, 'articles', r.articles, 'appareils', v_app,", "        'vente_id', r.vente_id, 'appareils', v_app,");
ok(pveMig && pveRamene === pveProd, 'A4. push_ventes_a_envoyer = la prod + les seuls articles de la note (17/10)');
ok(!/FUNCTION public\.vente_commande_annulee_vinted\(/.test(MIG) && !/FUNCTION public\.inventaire_vendu_vinted_par_la_vente\(/.test(MIG),
  'A5. les fonctions du point 12 ne sont jamais réécrites ici');
ok(/DROP FUNCTION IF EXISTS public\.commandes_vinted_noter\(jsonb\)/.test(INV) && /RENAME TO _rollback_20261017120000_vinted_commandes_articles/.test(INV)
  && /DROP COLUMN IF EXISTS articles/.test(INV) && /DELETE FROM public\.coin_config WHERE key = 'ventes_vinted_lot_depuis'/.test(INV),
  'A6. l\'inverse retire les objets neufs ; une composition non vide est gardée (renommée), jamais jetée');

// ── B. La composition, une vente par article, tout ou rien ───────────────────
const eclater = fonction(MIG, 'vente_vinted_lot_eclater');
const composer = fonction(MIG, 'vinted_lot_composer');
const noter = fonction(MIG, 'vente_vinted_lot_noter');
ok(/jsonb_array_elements_text\(p_ids\)/.test(composer) && !/titre/.test(composer.replace(/titre_vinted/g, '').replace(/'titre'/g, '')),
  'B1. composition = les numéros reçus (item_ids), jamais un titre');
ok(/IF p_platform = 'vinted' AND jsonb_typeof\(v_row -> 'item_ids'\) = 'array'/.test(ervMig) && /public\.vinted_lot_composer\(v_user, v_ref, v_row -> 'item_ids'/.test(ervMig),
  'B2. le relevé garde la composition de toute commande détaillée (tout statut)');
ok(/ca\.eclatee_le IS NOT NULL\) THEN\n\s+c_deja := c_deja \+ 1;\n\s+CONTINUE;/.test(ervMig), 'B3. une commande éclatée : la liste ne recrée jamais sa ligne d\'attente');
ok(/HAVING count\(\*\) >= 2\) THEN\n\s+v_ex_lot := public\.vente_vinted_lot_noter\(v_user, v_ref, v_statut, 'releve'\)/.test(ervMig),
  'B4. un lot (≥ 2 articles lus) passe par la règle, après la ligne d\'attente');
ok(/OR v\.id IN \(SELECT ca\.vente_id FROM vinted_commandes_articles ca/.test(ervMig), 'B5. une commande annulée retire aussi ses lignes éclatées');
ok(/v_ref_art := CASE WHEN v_n > 1 THEN p_ref \|\| ':' \|\| c\.item_id ELSE p_ref END/.test(eclater), 'B6. une vente par article : commande_ref \'<ref>:<article>\'');
ok(/EXCEPTION WHEN OTHERS THEN[\s\S]*decision = 'en_doute'/.test(eclater) && /'vente_vinted_lot_doute'/.test(eclater), 'B7. tout ou rien : au premier doute, rien n\'est écrit (décision et trace)');
ok(/enregistrer_vente_atomique\(p_user, NULL, p_job := v_job, p_prix := coalesce\(v_part, v_prix_job\)\)/.test(eclater)
  && /UPDATE inventaire x SET statut = 'vendu', quantite = 0/.test(eclater) && /armer_retraits_copies\(v_inv, 'vente_commande_vinted', NULL, 'vinted'/.test(eclater),
  'B8. circuit normal : enregistrer_vente_atomique (annonce vivante), fiche vendue (import), copies prouvées');
ok(/-- \(D6\) inconnu de FillSell[\s\S]*VALUES \(p_user, NULL, v_titre/.test(eclater) && /'vente_vinted_article_inconnu'/.test(eclater)
  && !/armer_retrait/.test(eclater.slice(eclater.indexOf('-- (D6)'), eclater.indexOf("v_dec := 'article_inconnu'"))),
  'B9. un article inconnu : vente sans fiche + question, jamais un retrait');
ok(/DELETE FROM ventes WHERE id = v_hdr\.id AND user_id = p_user/.test(eclater) && /'vente_lot_eclatee', jsonb_build_object\(\s*'commande', p_ref, 'avant', to_jsonb\(v_hdr\)/.test(eclater),
  'B10. la ligne « lot » retirée avec sa trace entière');
ok(!/titre\s*(~|ilike|LIKE|=)/i.test(eclater.replace(/v_titre :=/g, '')), 'B11. aucune décision sur un titre dans la règle');
ok(/v_hdr_le < to_timestamp\(v_depuis\)/.test(noter) && /decision = 'a_reparer'/.test(noter), 'B12. une ligne née avant la règle attend la réparation');
ok(/floor\(extract\(epoch FROM now\(\)\)\)::integer/.test(MIG), 'B13. date d\'effet arrondie à la seconde INFÉRIEURE (jamais une ligne d\'après prise pour une d\'avant)');

// ── C. La commande payée prouve ; annulée jamais (R4) ────────────────────────
const veille = fonction(MIG, 'commandes_vinted_noter');
ok(/v_user\s+uuid := auth\.uid\(\)/.test(veille) && /LIMIT 10/.test(veille), 'C1. la veille : son compte, 10 lignes au plus par appel');
ok(/IF vinted_commande_annulee\(v_statut\) THEN[\s\S]*signal_vente_lever\(v_job, 'commande_vinted_annulee'/.test(veille) && /CONTINUE;\n\s+END IF;\n\s+IF NOT coalesce\(v_paye, false\)/.test(veille),
  'C2. failed / cancelled : jamais une vente, la preuve de commande posée est levée');
ok(/IF NOT coalesce\(v_paye, false\) THEN c_non_payees/.test(veille) && /interval '48 hours'/.test(veille), 'C3. non payée : rien ; plus de 48 h : le relevé de nuit tranche');
ok(/IF vinted_commande_annulee\(v_statut\) THEN RETURN jsonb_build_object\('ok', false, 'issue', 'commande_annulee'\)/.test(eclater), 'C4. la règle elle-même refuse une commande annulée');
ok(/SELECT lower\(btrim\(coalesce\(p_statut, ''\)\)\) IN \('failed', 'canceled', 'cancelled'\)/.test(MIG), 'C5. « annulée » = failed, canceled, cancelled');

// ── D. UN mail par commande ──────────────────────────────────────────────────
const note = fonction(MIG, 'push_noter_commande_vinted');
ok(/UPDATE push_ventes SET statut = 'doublon', motif = 'dans_la_commande'/.test(eclater) && /PERFORM set_config\('fillsell\.vente_declaree', '1', true\)/.test(eclater),
  'D1. les notes nées pour les articles ne partent jamais seules');
ok(/v_le >= now\(\) - interval '24 hours'[\s\S]*coalesce\(p_source, ''\) <> 'reparation'/.test(eclater), 'D2. UNE note pour une commande de moins de 24 h, jamais pour la réparation');
ok(/'articles'|articles\)/.test(note) && /'commande', 'vinted', p_vente/.test(note) && /public\.cron_secret\(\)/.test(note) && !/x-cron-secret', '[^']/.test(note),
  'D3. la note porte ses articles ; le secret n\'est jamais écrit (cron_secret())');
ok(/'vente_id', r\.vente_id, 'articles', r\.articles,/.test(pveMig) && (pveMig.match(/'articles', r\.articles/g) ?? []).length === 2,
  'D4. push_ventes_a_envoyer rend les articles (relances et décidées)');
ok(/IF NOT EXISTS \(SELECT 1 FROM jsonb_array_elements\(p_articles\) x WHERE \(x ->> 'inventaire_id'\) IS NOT NULL\) THEN RETURN NULL/.test(note),
  'D5. aucune note si aucun article n\'est suivi par FillSell');

// ── E. Le prix ───────────────────────────────────────────────────────────────
const parts = fonction(MIG, 'vinted_lot_parts');
ok(/'vinted'::text FROM generate_series/.test(parts), 'E1. le montant de chaque article donné par Vinted : tel quel');
ok(/floor\(v_reste_c \* v_base\[v_k\] \/ v_somme\)/.test(parts) && /ORDER BY \(v_reste_c \* v_base\[k\] \/ v_somme\) - floor/.test(parts) && /length\(v_ids\[k\]\), v_ids\[k\]/.test(parts),
  'E2. prorata : centimes au plus grand reste, égalité au numéro croissant');
ok(/v_src\[v_k\] := 'saisie'/.test(parts) && /o\.cle = 'annonce:vinted:' \|\| v_ids\[v_k\]/.test(parts), 'E3. un prix saisi par la personne (sans reçu d\'annonce) garde son prix');
ok(/IF v_t IS NULL OR v_t <= 0 THEN\n\s+v_manque := v_manque \+ 1;/.test(parts) && /IF v_manque = 0 THEN/.test(parts) && !/coalesce\([^)]*,\s*0\)\s*AS prix/.test(parts),
  'E4. une base manquante : NULL (inconnu), jamais 0');
// La règle de prix, rejouée ici (même calcul en centimes).
const prorata = (total, bases) => {
  const rc = Math.round(total * 100), s = bases.reduce((a, b) => a + b, 0);
  const brut = bases.map((b) => (rc * b) / s);
  const c = brut.map(Math.floor);
  let reste = rc - c.reduce((a, b) => a + b, 0);
  const ordre = brut.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of ordre) { if (reste <= 0) break; c[i]++; reste--; }
  return c.map((x) => (x / 100).toFixed(2)).join('/');
};
ok(prorata(5.10, [1.5, 1.5, 1.5, 1.5]) === '1.28/1.28/1.27/1.27' && prorata(5.10, [1, 1, 1.5, 1.5]) === '1.02/1.02/1.53/1.53'
  && prorata(3.40, [2, 1, 1]) === '1.70/0.85/0.85', 'E5. 5,10 € → 1,28/1,28/1,27/1,27 et 1,02/1,02/1,53/1,53 ; somme = total');

// ── F. Essai, réparation, inverse ────────────────────────────────────────────
const corpsMig = MIG.slice(MIG.indexOf('-- ── 0. Les définitions de prod'), MIG.lastIndexOf('\nCOMMIT;\n'));
ok(ESSAI.includes(corpsMig) && /\nROLLBACK;\s*$/.test(ESSAI) && !/\nCOMMIT;/.test(ESSAI), 'F1. l\'essai embarque la migration à l\'octet et finit par ROLLBACK');
const comptes = new Set(ESSAI.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []);
ok(comptes.size === 1 && comptes.has('f44b5917-bccc-4431-ba41-f40571a2ed18'), 'F2. l\'essai ne touche que le compte de Nico (numéros fictifs)');
ok(['S1 ', 'S1b', 'S2 ', 'S2b', 'S3 ', 'S4 ', 'S5 ', 'S6 ', 'S7 ', 'S8 ', 'S9 ', 'S10', 'S11', 'Z1', 'Z2', 'Z3', 'Z4'].every((s) => ESSAI.includes(`'${s}`)),
  'F3. l\'essai couvre S1 à S11 et Z1 à Z4');
const perimetre = REP.slice(REP.indexOf('CREATE TABLE public._backup_1710_lots_entetes AS'), REP.indexOf('CREATE TEMP TABLE _avant'));
ok(/c\.eclatee_le IS NULL\) >= 2/.test(perimetre) && !/titre/.test(perimetre) && /interval '30 days'/.test(perimetre),
  'F4. réparation : périmètre par la composition LUE (≥ 2 articles), 30 jours, jamais le titre');
ok(/vente_vinted_lot_eclater\(e\.user_id, e\.commande_ref, 'reparation'\)/.test(REP) && /statut = 'doublon', motif = 'reparation_1710_ventes_lot'/.test(REP)
  && /email_logs a bougé pendant la réparation : tout est annulé/.test(REP) && /une note de vente partirait : tout est annulé/.test(REP),
  'F5. réparation : la règle elle-même, 0 mail compté (email_logs, notes) sinon tout est annulé');
ok(['_backup_1710_lots_entetes', '_backup_1710_lots_composition', '_backup_1710_lots_ventes', '_backup_1710_lots_inventaire', '_backup_1710_lots_jobs', '_backup_1710_lots_recus']
  .every((t) => REP.includes(`CREATE TABLE public.${t} AS`)) && /INSERT INTO public\.ventes SELECT \* FROM public\._backup_1710_lots_entetes/.test(REP_INV)
  && /set_config\('fillsell\.sans_retrait', '1', true\)/.test(REP_INV), 'F6. sauvegardes complètes ; l\'inverse rend tout, sans retrait ni note');

// ── G. push-ventes ───────────────────────────────────────────────────────────
ok(/const articles: ArticleNote\[\] = Array\.isArray\(n\.articles\) && n\.articles\.length \? n\.articles : \[n\];/.test(PUSH)
  && /aConfirmer: n\.a_decider === true/.test(PUSH) && /const prixVente = prixVenteConnu\(n\.prix\);/.test(PUSH),
  'G1. push-ventes : les articles de la note, une note sans articles reste un article (rétrocompatible)');

// ── H. L'extension ───────────────────────────────────────────────────────────
ok(/^const VINTED_LOTS_ARRIERE_JOURS = 30;/m.test(EXT) && /const lotsFaits = new Set\(etat\.vinted\?\.lots_v1 \?\? \[\]\);/.test(EXT)
  && /\|\| \(r\.lot === true && !lotsFaits\.has\(r\.ref\)\)/.test(EXT) && /lots_v1: lots\.slice\(-VINTED_DETAIL_MEMOIRE\)/.test(EXT),
  'H1. un lot d\'avant la règle est relu UNE fois (lots_v1), 30 jours, bornes du détail');
ok(/const lots = serveurCompose \?/.test(EXT), 'H2. un lot n\'est noté relu que si le serveur garde les compositions');
ok(/vues\.add\(platform === "vinted" \? String\(r\.commande_ref\)\.split\(":"\)\[0\] : String\(r\.commande_ref\)\)/.test(EXT), 'H3. \'<ref>:<article>\' = la commande <ref> déjà connue');
ok(/\.filter\(\(r\) => r\.ref && !r\.ref\.includes\(":"\)\)/.test(EXT), 'H4. une ligne d\'article n\'est jamais relue comme une commande');

// H5. La veille rejouée dans un vm : la commande neuve part au serveur, 3 au plus ;
//     une RPC absente (404, PGRST202) ne dit rien et la relecture continue.
const DOSSIER = path.join(RACINE, 'chrome-extension');
const memoire = {};
const consoles = [];
function charger() {
  const rien = { addListener: () => {} };
  const local = {
    get: async (k) => (typeof k === 'string' ? { [k]: memoire[k] } : { ...memoire }),
    set: async (o) => { Object.assign(memoire, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { delete memoire[k]; },
  };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const journal = (n) => (...a) => consoles.push([n, a.map(String).join(' ')]);
  const ctx = {
    console: { log: () => {}, warn: journal('warn'), error: journal('error'), info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    importScripts: (f) => vm.runInContext(readFileSync(path.join(DOSSIER, f), 'utf8'), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: 'selftest', getManifest: () => ({ version: '0.0.0' }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local, session: aire(), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }), remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] }, cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} }, notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(DOSSIER, 'background.js'), 'utf8'), contexte, { filename: 'background.js' });
  return ctx;
}
const ctx = charger();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64({ alg: 'HS256' })}.${b64({ sub: '00000000-0000-4000-8000-0000000000aa' })}.sig`;
const appelsRpc = [];
let reponseRpc = { status: 200, corps: { recues: 1 } };
ctx.fetch = async (url, init = {}) => {
  if (String(url).includes('/rest/v1/rpc/commandes_vinted_noter')) {
    appelsRpc.push(JSON.parse(init.body));
    return { ok: reponseRpc.status < 300, status: reponseRpc.status, json: async () => reponseRpc.corps, text: async () => JSON.stringify(reponseRpc.corps) };
  }
  return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
};
const details = {};
ctx.executerDansOngletPlateforme = async (platform, func, args) => {
  const src = String(func);
  if (platform === 'vinted' && src.includes('/api/v2/transactions/')) {
    const refs = args[0];
    return { ok: true, requetes: refs.length, bot: false, articles: refs.map((ref) => ({ ref, ...(details[ref] ?? { item_ids: [] }) })) };
  }
  return { ok: false, motif: 'inattendu' };
};
const jobs = [{ id: '00000000-0000-4000-8000-000000000001', platform_listing_id: '111' }];
ctx.restRequest = async (chemin) => {
  if (chemin.startsWith('cross_post_jobs')) {
    const ids = (chemin.match(/platform_listing_id=in\.\(([^)]*)\)/)?.[1] ?? '').split(',');
    return jobs.filter((j) => ids.includes(j.platform_listing_id)).map((j) => ({ id: j.id }));
  }
  return [];
};
const etatVeille = { vinted: {} };
const maintenant = new Date(Date.now() - 600_000).toISOString();
Object.assign(details, {
  c1: { item_ids: ['111', '222'], paye: true, prix: 5.1, devise: 'EUR', etat: 200 },
  c2: { item_ids: ['333'], paye: true, prix: 2, devise: 'EUR', etat: 500 },
  c3: { item_ids: ['444'], paye: false, prix: 3, devise: 'EUR', etat: 100 },
  c4: { item_ids: ['555'], paye: true, prix: 1, devise: 'EUR', etat: 200 },
});
const commandes = ['c1', 'c2', 'c3', 'c4'].map((ref) => ({ ref, titre: ref, date: maintenant, statut: ref === 'c3' ? 'in_progress' : 'completed' }));
const relus = await ctx.jobsARelirePourCommandes('vinted', commandes, TOKEN, etatVeille);
const lignes = appelsRpc[0]?.p_rows ?? [];
ok(appelsRpc.length === 1 && lignes.length === 3, 'H5. la veille envoie ses commandes neuves au serveur, 3 au plus par passage');
ok(lignes[0]?.ref === 'c1' && lignes[0]?.paye === true && JSON.stringify(lignes[0]?.item_ids) === '["111","222"]' && lignes[0]?.prix === 5.1
  && lignes[0]?.date === maintenant && lignes[0]?.statut === 'completed', 'H6. une ligne : numéro, statut, payée, date, montant, numéros des articles');
ok(lignes[1]?.ref === 'c2' && lignes[1]?.statut === 'cancelled', 'H7. une transaction à 500 part comme ANNULÉE (jamais une vente, R4)');
ok(lignes[2]?.ref === 'c3' && lignes[2]?.paye === false, 'H8. une commande non payée part non payée (le serveur n\'en fait rien)');
ok(JSON.stringify(relus) === JSON.stringify([jobs[0].id]), 'H9. la relecture prioritaire suit son cours (annonce FillSell 111)');
for (const [status, corps] of [[404, { message: 'introuvable' }], [400, { code: 'PGRST202', message: 'Could not find the function' }]]) {
  appelsRpc.length = 0; consoles.length = 0; reponseRpc = { status, corps };
  const r = await ctx.jobsARelirePourCommandes('vinted', commandes.slice(0, 1), TOKEN, etatVeille);
  ok(appelsRpc.length === 1 && consoles.length === 0 && JSON.stringify(r) === JSON.stringify([jobs[0].id]),
    `H10. RPC absente (${status}${corps.code ? ' ' + corps.code : ''}) : rien, aucune erreur visible, la veille continue`);
}

// ── --prod : la règle en place (LECTURE seule, après application) ────────────
if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'table', to_regclass('public.vinted_commandes_articles') is not null,
    'colonne', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_ventes' and column_name = 'articles'),
    'interrupteur', coalesce((select value from public.coin_config where key = 'ventes_vinted_lot_depuis'), 0) > 0,
    'erv_change', md5(pg_get_functiondef('public.enregistrer_ventes_relevees(text,jsonb,uuid)'::regprocedure)) <> '${MD5_ERV}',
    'pve_change', md5(pg_get_functiondef('public.push_ventes_a_envoyer(integer)'::regprocedure)) <> '${MD5_PVE}',
    'veille_app', has_function_privilege('authenticated', 'public.commandes_vinted_noter(jsonb)', 'execute'),
    'regle_fermee', not has_function_privilege('authenticated', 'public.vente_vinted_lot_eclater(uuid,text,text)', 'execute'),
    'rls', (select relrowsecurity from pg_class where oid = 'public.vinted_commandes_articles'::regclass)) as r;`;
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', sql], { cwd: RACINE, encoding: 'utf8', shell: true });
  const txt = String(res.stdout ?? '');
  let r = null;
  try { r = JSON.parse(txt.slice(txt.indexOf('{'))).rows?.[0]?.r; } catch { r = null; }
  ok(r && r.table && r.colonne && r.interrupteur && r.erv_change && r.pve_change && r.veille_app && r.regle_fermee && r.rls,
    `PROD. règle en place : ${JSON.stringify(r)}`);
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
