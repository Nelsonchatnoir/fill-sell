// ═══════════════════════════════════════════════════════════════════════════
// CINQ POINTS DU 22/10 — `npm run selftest:cinq-points-2210`
// ═══════════════════════════════════════════════════════════════════════════
// Rapport : docs/enquetes/cinq-points-2210/RAPPORT.md. Contrôles hors ligne :
//   5. le chargement de l'app a une fin (lectures bornées corps compris — vrai serveur HTTP local qui
//      envoie ses en-têtes puis se tait —, un seul fetchAll en vol, un rechargement par onglet) ;
//   1. Leboncoin « Achat en cours » = vente ; 2. retrait en retard dit ; 3. Opla : plus rien ; 4. tailles Depop, fiche jamais écrasée.
// Les essais en base (ROLLBACK) : scripts/essais/20261022*_essai.sql.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const importer = (f) => import(pathToFileURL(join(RACINE, f)).href);
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 5. Le chargement a une fin ──────────────────────────────────────────────
console.log('5. Le chargement de l\'app a une fin (Sébastien, 22/10)');
const cb = await importer('src/utils/chargementBorne.js');

// 5.1 Un vrai serveur : en-têtes envoyés, corps qui cale (le cas vécu), corps normal, écriture lente.
const serveur = createServer((req, res) => {
  if (req.url.startsWith('/rest/v1/cale')) {
    res.writeHead(200, { 'content-type': 'application/json', 'content-range': '0-0/*' });
    res.write('[{"id":');           // puis plus rien : le corps n'arrive jamais
    return;
  }
  if (req.url.startsWith('/rest/v1/vite')) {
    res.writeHead(200, { 'content-type': 'application/json', 'content-range': '0-1/2' });
    res.end('[{"id":1},{"id":2}]');
    return;
  }
  if (req.url.startsWith('/rest/v1/vide')) { res.writeHead(204); res.end(); return; }
  if (req.url.startsWith('/rest/v1/rpc/lente') || req.url.startsWith('/auth/v1/')) {
    setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }, 400);
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const fb = cb.creerFetchBorne(undefined, { delaiMs: 300 });

let t0 = Date.now(); let erreur = null;
try { const r = await fb(`${base}/rest/v1/cale?select=*`, { method: 'GET' }); await r.text(); } catch (e) { erreur = e; }
const duree = Date.now() - t0;
verifier(erreur && duree < 2000, `lecture dont le corps cale : erreur au bout du délai (${duree} ms)`, String(erreur));
verifier(/lecture sans réponse/.test(String(erreur?.message ?? '')), 'motif lisible (« lecture sans réponse après … s »)', String(erreur?.message));

const rv = await fb(`${base}/rest/v1/vite?select=*`);
verifier(rv.status === 200 && rv.headers.get('content-range') === '0-1/2', 'lecture normale : statut et Content-Range intacts');
verifier(JSON.stringify(await rv.json()) === '[{"id":1},{"id":2}]', 'lecture normale : corps intact');
const r204 = await fb(`${base}/rest/v1/vide`);
verifier(r204.status === 204, '204 sans corps : rendu tel quel');

t0 = Date.now();
const rpc = await fb(`${base}/rest/v1/rpc/lente`, { method: 'POST', body: '{}' });
verifier(rpc.status === 200 && Date.now() - t0 >= 380, 'POST (RPC, écriture) jamais borné : la réponse lente (400 ms > délai) arrive');
const auth = await fb(`${base}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', body: '{}' });
verifier(auth.status === 200, 'auth jamais bornée');
verifier(cb.estLectureBornee(`${base}/rest/v1/inventaire?select=*`, { method: 'GET' }) && !cb.estLectureBornee(`${base}/rest/v1/inventaire`, { method: 'PATCH' })
  && !cb.estLectureBornee(`${base}/storage/v1/object/x`, { method: 'GET' }) && !cb.estLectureBornee(`${base}/functions/v1/x`, { method: 'GET' }),
  'seules les lectures GET/HEAD de /rest/v1/ sont bornées');
const ctrl = new AbortController(); ctrl.abort(new Error('annulé par l\'appelant'));
erreur = null; try { await fb(`${base}/rest/v1/vite`, { signal: ctrl.signal }); } catch (e) { erreur = e; }
verifier(erreur != null, 'le signal de l\'appelant reste respecté');
serveur.close();

// 5.2 Un seul passage en vol ; chaque appelant lit APRÈS son appel ; jamais bloqué par un passage figé.
{
  const journal = [];
  let n = 0;
  const corps = async (uid, opts) => { const k = ++n; journal.push(`debut${k}:${opts?.silencieux ? 's' : 'v'}`); await attendre(50); journal.push(`fin${k}`); return k; };
  const f = cb.fileUnique(corps, { liberationMs: 1000, fusionner: (a, b) => [b[0], { silencieux: Boolean(a[1]?.silencieux) && Boolean(b[1]?.silencieux) }] });
  const p1 = f('u', { silencieux: true });
  const p2 = f('u', { silencieux: true });
  const p3 = f('u');
  const [a, b, c] = await Promise.all([p1, p2, p3]);
  verifier(a === 1 && b === 2 && c === 2, `trois appels → deux passages (le 2e partagé) : ${a},${b},${c}`);
  verifier(journal.join(',') === 'debut1:s,fin1,debut2:v,fin2', `jamais deux passages en même temps ; options fusionnées (un appel non silencieux l'emporte) : ${journal.join(',')}`);
  const fige = cb.fileUnique(() => new Promise(() => {}), { liberationMs: 80 });
  fige();
  const t = Date.now();
  let suite = false;
  const fSuivant = cb.fileUnique(async () => { suite = true; return 'ok'; }, { liberationMs: 80 });
  await fSuivant();
  const f2 = cb.fileUnique((k) => (k === 'fige' ? new Promise(() => {}) : Promise.resolve('libre')), { liberationMs: 80 });
  f2('fige');
  const r = await f2('autre');
  verifier(r === 'libre' && Date.now() - t < 1000 && suite, 'un passage figé libère la file au bout de liberationMs');
  let rejet = null;
  const f3 = cb.fileUnique(async () => { throw new Error('boom'); });
  try { await f3(); } catch (e) { rejet = e; }
  verifier(rejet?.message === 'boom', 'une erreur du passage remonte à son appelant');
  const r4 = await f3().catch(() => 'rejet-2');
  verifier(r4 === 'rejet-2', 'la file reste utilisable après une erreur');
}

// 5.3 Un rechargement par clé et par onglet ; stockage illisible = jamais.
{
  const m = new Map();
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  verifier(cb.uneFoisPar('fs_recharge_build', 'B2', st) === true && cb.uneFoisPar('fs_recharge_build', 'B2', st) === false, 'même build distant : un seul rechargement');
  verifier(cb.uneFoisPar('fs_recharge_build', 'B3', st) === true, 'build distant suivant : un rechargement de plus (déploiement suivant)');
  const casse = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  verifier(cb.uneFoisPar('k', 'v', casse) === false, 'stockage illisible : jamais de rechargement');
  const v = await cb.auPlus(new Promise(() => {}), 30, 'repli');
  verifier(v === 'repli', 'auPlus : une promesse muette rend la valeur de repli');
}

// 5.4 Le câblage dans l'app.
{
  const sb = lire('src/lib/supabase.js');
  verifier(/global: \{ fetch: creerFetchBorne\(\) \}/.test(sb), 'le client Supabase passe par creerFetchBorne');
  const app = lire('src/App.jsx');
  verifier(/function fetchAll\(uid,opts\)\{return fetchAllFileRef\.current\(uid,opts\);\}/.test(app) && /async function fetchAllCorps\(uid,\{silencieux=false\}=\{\}\)\{/.test(app), 'fetchAll passe par la file unique (fetchAllCorps = l\'ancien corps)');
  verifier((app.match(/async function fetchAll\(/g) || []).length === 0, 'plus aucun fetchAll hors file');
  verifier(/if\(\(v\.error\|\|i\.error\)&&!donneesLuesRef\.current\)\{[\s\S]{0,200}setChargementEchoue\(true\);[\s\S]{0,40}return;/.test(app), 'premier chargement sans stock ni ventes : écran de reprise, jamais un stock vide présenté comme vrai');
  verifier(/auPlus\(supabase\.rpc\('copies_fiches_jumelles'\)/.test(app), 'la RPC du premier chargement est bornée');
  verifier(/if\(!uneFoisPar\('fs_recharge_build',remote\)\)\{setNewVersionAvailable\(true\);return;\}\n\s+window\.location\.reload\(\);/.test(app), 'nouvelle version : rechargement une fois par build distant, puis le bandeau');
  verifier(/if\(stepperOpen\|\|typing\|\|dialogOpen\)\{setNewVersionAvailable\(true\);return;\}/.test(app), 'jamais de rechargement pendant une saisie, le stepper ou un dialogue (inchangé)');
  verifier(/<EcranChargementLong echec=\{chargementEchoue\}/.test(app), 'l\'écran de chargement porte la reprise');
  const ecran = lire('src/components/EcranChargementLong.jsx');
  verifier(/uneFoisPar\('fs_recharge_chargement'/.test(ecran) && /uneFoisPar\('fs_recharge_build', distant\)/.test(ecran), 'reprise seule : version en ligne et rechargement, une fois chacun par onglet');
  verifier(/ESSAIS_MS = \[5_000, 15_000, 30_000, 60_000, 60_000, 60_000\]/.test(ecran) && /essai >= ESSAIS_MS\.length/.test(ecran), 'nouveaux essais espacés et bornés (6 au plus)');
  const routeur = lire('src/router/AppRouter.jsx');
  verifier((routeur.match(/if \(user === undefined\) return <AttenteSession \/>;/g) || []).length === 2, 'session lente : RequireAuth et RedirectIfLoggedIn disent ce qui se passe après 10 s');
}

// ── 1. Leboncoin : un achat en cours vaut vente ────────────────────────────
console.log('\n1. Leboncoin : « Achat en cours » = vente (Sébastien, 21-22/10)');
{
  const mig = lire('supabase/migrations/20261022110000_leboncoin_achat_en_cours_vente.sql');
  verifier(/ADD COLUMN IF NOT EXISTS transaction_plateforme text/.test(mig) && /ADD COLUMN IF NOT EXISTS transaction_lue_le timestamptz/.test(mig), 'colonnes transaction_plateforme / transaction_lue_le');
  verifier(/AFTER INSERT OR UPDATE OF transaction_plateforme, capture ON public\.annonces_plateforme\s+FOR EACH ROW WHEN \(NEW\.platform = 'leboncoin'\)/.test(mig), 'déclencheur : Leboncoin seulement, sur la transaction et la capture');
  verifier(/IF v_new IS NOT DISTINCT FROM v_old THEN RETURN NULL; END IF;/.test(mig), 'seule une TRANSITION agit (un relevé qui relit la même transaction ne refait rien)');
  verifier(/btrim\(coalesce\(c\.platform_listing_id, ''\)\) = btrim\(a\.listing_id\)/.test(mig) && !/titre_norm|ilike/.test(mig.split('leboncoin_transaction_noter')[1] ?? ''), 'le job se choisit par son NUMÉRO exact, jamais un titre');
  verifier(/ELSIF i\.statut IS DISTINCT FROM 'stock' THEN v_issue := 'fiche_deja_vendue'/.test(mig), 'déjà déclarée : aucune preuve, jamais deux ventes');
  verifier(/coalesce\(i\.quantite, 1\) > 1 THEN v_issue := 'plusieurs_exemplaires'/.test(mig), 'plusieurs exemplaires : à la personne');
  verifier(/'source', 'transaction_leboncoin'/.test(mig) && /'exact', true/.test(mig) && !/'unavailable_since', /.test(mig.split('leboncoin_transaction_noter')[1]?.split('ELSIF p_tx =')[0] ?? 'x'), 'preuve exacte sans unavailable_since (la veille ne la lève pas)');
  verifier(/p_tx = 'aucune' AND p_tx_avant = 'pending' AND a\.statut_plateforme = 'en_ligne'/.test(mig), 'achat annulé = « pending » puis EN LIGNE sans transaction ; « sold » → rien n\'est conclu');
  verifier(/Une vente SAISIE \(ou née d'un autre chemin\) n'est jamais retirée/.test(mig), 'l\'annulation ne retire jamais une vente saisie');
  verifier(/IF v_copie\.status IN \('pending', 'needs_user'\) THEN/.test(mig) && /INSERT INTO remises_en_vente/.test(mig), 'achat annulé : retraits en file arrêtés, copies retirées remises en vente (file remises_en_vente)');
  verifier(/d\.platform <> 'leboncoin'/.test(mig), 'jamais un retrait de l\'annonce Leboncoin elle-même');
  verifier(/new\.platform_fields #>> '\{sale_evidence,statut\}' = 'sold' then\s+return new;/.test(mig), 'note de vente : « Vendu » (transaction terminée) = aucune note ni mail ; « Achat en cours » : la règle commune');
  verifier(/'ventes_leboncoin_transaction', 1\) ON CONFLICT \(key\) DO NOTHING/.test(mig), 'interrupteur ventes_leboncoin_transaction (1 = active)');
  const bg = lire('chrome-extension/background.js');
  verifier(/const transactionDe = \(a\) => \{[\s\S]{0,300}"transaction_status"[\s\S]{0,200}return v \? v\.slice\(0, 40\) : "aucune";/.test(bg), 'extension : la transaction de CHAQUE annonce lue dans attributes.transaction_status');
  verifier(/annonces\.every\(\(a\) => typeof a\.transaction === "string"\)/.test(bg) && /select=transaction_plateforme&limit=1/.test(bg), 'extension : envoyée seulement si lue pour toutes ET si la base a la colonne');
  verifier(/if \(platform === "leboncoin" && aSuivre\.length\) demanderRelevePourRattachement\("leboncoin"\);/.test(bg), 'extension : une commande Leboncoin neuve fait relever « Mes annonces » à la fin du cycle');
}

// ── 2. Retraits : jamais en attente sans fin ────────────────────────────────
console.log('\n2. Retraits d\'articles vendus : jamais en attente sans fin (DeadRoz, XEWER, Tech-t, Sébastien)');
{
  const rb = await importer('src/utils/retraitsBloques.js');
  const now = Date.parse('2026-10-22T10:00:00Z'); const ext = '2026-10-22T09:59:00Z';
  const verif = { id: 'a', inventaire_id: 1, action: 'delete', platform: 'beebs', status: 'pending', created_at: '2026-10-14T00:00:00Z', listing_url: 'https://www.beebs.app/fr/p/34083555', error: 'Beebs vérifie encore cette annonce', platform_fields: { retrait_en_attente_verification: {} } };
  const r1 = rb.retraitsBloquesParConnexion({ jobs: [verif], fiches: [{ id: 1, statut: 'vendu', title: 'Jean 511' }], maintenant: now, extensionVueLe: ext });
  verifier(r1.total === 1 && r1.parPlateforme[0].mur === 'en_retard', 'Beebs en vérification depuis 8 j (DeadRoz 53cff028) : une ligne « À régler »');
  const t1 = rb.texteRetraitsBloques(r1.parPlateforme[0]);
  verifier(/ne permet pas de la supprimer/.test(t1) && /pas achetable/.test(t1) && /support Beebs/.test(t1), 'le texte dit le vrai : pas achetable, Beebs ne permet pas de la supprimer (vu le 22/10), support Beebs');
  const echec = { ...verif, id: 'b', inventaire_id: 2, error: 'Le retrait n\'est pas encore fait', platform_fields: { pas_de_rouge: { motif: 'retrait_inconnu_relancer' } } };
  const r2 = rb.retraitsBloquesParConnexion({ jobs: [echec], fiches: [{ id: 2, statut: 'vendu' }], maintenant: now, extensionVueLe: ext });
  verifier(r2.parPlateforme[0]?.mur === 'en_retard' && /Retire-la toi-même sur Beebs/.test(rb.texteRetraitsBloques(r2.parPlateforme[0])), 'retrait sans effet depuis 8 j (DeadRoz ecd27eef) : « retire-la toi-même », FillSell continue');
  verifier(rb.retraitsBloquesParConnexion({ jobs: [{ ...echec, created_at: '2026-10-22T08:00:00Z' }], fiches: [{ id: 2, statut: 'vendu' }], maintenant: now, extensionVueLe: ext }).total === 0, 'moins de 24 h : rien (le retrait suit son cours)');
  verifier(rb.retraitsBloquesParConnexion({ jobs: [echec], fiches: [{ id: 2, statut: 'stock' }], maintenant: now, extensionVueLe: ext }).total === 0, 'article NON vendu : jamais cette alerte');
  verifier(rb.retraitsBloquesParConnexion({ jobs: [echec], fiches: [{ id: 2, statut: 'vendu' }], maintenant: now, extensionVueLe: '2026-10-21T00:00:00Z' }).parPlateforme[0]?.mur === 'ordinateur', 'un mur plus précis passe avant (ordinateur éteint : « ouvre Chrome »)');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  verifier(/\.eq\("job_id", depotProuve\)[\s\S]{0,200}\.is\("disparu_le", null\)\.is\("retiree_le", null\)/.test(gpj) && /if \(trouvees\.length === 1\) \{\s+idsCandidats\.push\(trouvees\[0\]\);/.test(gpj), 'numéro manquant : retrouvé par le relevé du MÊME compte (annonce liée au dépôt exact), une seule annonce vivante sinon rien');
}

// ── 3. Opla : plus rien ─────────────────────────────────────────────────────
console.log('\n3. Opla : plus aucun job, une seule information par annonce (XEWER)');
{
  const mig = lire('supabase/migrations/20261022100000_opla_plus_rien.sql');
  verifier(/if j\.platform = 'opla' and public\.opla_sortie_passee\(\) then\s+perform public\.opla_copie_a_retirer_noter\(j\.id, p_chemin\);\s+return null;/.test(mig), 'armer_retrait_job_pour : aucun retrait Opla, information posée sur la copie');
  verifier(/IF TG_OP = 'INSERT' AND NEW\.action = 'delete' THEN[\s\S]{0,700}RETURN NULL;/.test(mig), 'garde : un retrait Opla inséré (ancienne app) n\'est pas écrit');
  verifier(/and not \(j\.platform = 'opla' and public\.opla_sortie_passee\(\)\)/.test(mig), 'filet de suppression : jamais de retrait Opla');
  verifier(/AND NOT \(a\.platform = 'opla' AND a\.inventaire_id IS NULL AND opla_sortie_passee\(\)\)/.test(mig) && /RETURN jsonb_build_object\('ok', false, 'reason', 'opla_sortie'\)/.test(mig), 'moteur de rapprochement : une annonce Opla orpheline n\'est plus jamais importée');
  verifier(/IF coalesce\(c\.platform_fields, '\{\}'::jsonb\) \? 'opla_a_retirer'\s+OR coalesce\(c\.platform_fields, '\{\}'::jsonb\) \? 'opla_retire_par_la_personne' THEN\s+RETURN false;/.test(mig), 'information posée UNE fois, jamais après « C\'est fait »');
  const rb = await importer('src/utils/retraitsBloques.js');
  const copie = { id: 'c', inventaire_id: 7, action: 'publish', platform: 'opla', status: 'published', created_at: '2026-10-01T00:00:00Z', listing_url: 'https://opla.co/a', platform_fields: { opla_a_retirer: { le: 'x', chemin: 'vente_article_serveur' } } };
  const r = rb.retraitsBloquesParConnexion({ jobs: [copie], fiches: [{ id: 7, statut: 'vendu' }], maintenant: Date.now() });
  verifier(r.total === 1 && r.parPlateforme[0].mur === 'opla_sortie', 'app : la copie marquée donne LA ligne Opla de l\'article vendu');
  verifier(rb.retraitsBloquesParConnexion({ jobs: [copie], fiches: [{ id: 7, statut: 'stock' }], maintenant: Date.now() }).total === 0, 'app : article revenu au stock → rien');
  verifier(rb.retraitsBloquesParConnexion({ jobs: [{ ...copie, platform_fields: { ...copie.platform_fields, opla_retire_par_la_personne: { le: 'x' } } }], fiches: [{ id: 7, statut: 'vendu' }], maintenant: Date.now() }).total === 0, 'app : « C\'est fait » → la ligne disparaît');
  const clos = (id, t) => ({ id, inventaire_id: null, action: 'delete', platform: 'opla', status: 'cancelled', created_at: t, listing_url: 'https://opla.co/b', platform_fields: { opla_sortie: { le: t } } });
  const r9 = rb.retraitsBloquesParConnexion({ jobs: [clos('d1', '2026-10-21T10:00:00Z'), clos('d2', '2026-10-21T11:00:00Z'), clos('d3', '2026-10-22T09:00:00Z')], fiches: [], maintenant: Date.now() });
  verifier(r9.total === 1, `fiche supprimée : 3 retraits clos de la MÊME annonce = 1 ligne (XEWER : 9 lignes pour 3 annonces) — ${r9.total}`);
  const app = lire('src/App.jsx');
  verifier(/if\(oplaFermee\) p\.online=p\.online\.filter\(pub=>pub\.platform!=='opla'\);/.test(app) && /group\.filter\(j=>!\(oplaFermee&&j\.platform==='opla'\)\)/.test(app), 'app : la suppression et le bandeau n\'arment plus de retrait Opla');
}

// ── 4. Tailles et états vers Beebs et Depop ─────────────────────────────────
console.log('\n4. Tailles vers Depop, fiche jamais écrasée (Johan, Louis)');
{
  const da = await importer('src/utils/depopAttributs.js');
  verifier(da.depopPointureEnfant('33')?.libelle === '33 (adult)' && da.depopPointureEnfant('EUR 33')?.libelle === '33 (adult)' && da.depopPointureEnfant('pointure 25')?.libelle === '25', 'pointure enfant nue = la même que « EU n » (Louis, basket « 33 »)');
  verifier(da.depopPointureEnfant('EU 31')?.id === 16 && da.depopPointureEnfant('7 ans') === null && da.depopPointureEnfant('41') === null && da.depopPointureEnfant('33,5') === null && da.depopPointureEnfant('M') === null, 'jamais un âge, une lettre, une demi-pointure, hors 16…40 (question)');
  const dep = lire('chrome-extension/content-scripts/depop.js');
  const src = dep.slice(dep.indexOf('const DEPOP_GRILLES_EUR_PAIRES'), dep.indexOf('function depopResoudreTaille('));
  const eq = new Function(`${src}; return depopTailleEquivalente;`)();
  verifier(eq('EU 38', 9, ['32', '34', '36', '38', '40']).valeur === '38' && eq('EUR 40', 81, ['38', '40']).valeur === '40', 'connecteur Depop : « EU 38 » = « 38 » sur les grilles EUR paires (9, 81, 40)');
  verifier(eq('33', 104, ['32', '33 (adult)']).valeur === '33 (adult)' && eq('W31', 62, ['31', '40']) === null && eq('EU 38', 62, ['38']) === null && eq('38', 9, ['38']) === null, 'jamais sur la grille 62 (W / EU mêlés : question) ; « 38 » nu inchangé');
  // (25/10) Grilles 24 (bas femme), 32 (lingerie), 98 (manteaux et costumes homme) : déclarées « EUR » par Depop (filtre de
  // recherche, observé). Sur la 24, la plage 24…34 est celle des TOURS DE TAILLE : jamais « EU 30 » → « 30 ».
  const g24 = ['One size', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42', '44', '46', '48', 'Other'];
  verifier(eq('EU 44', 24, g24)?.valeur === '44' && eq('EU 42', 24, g24)?.valeur === '42' && eq('EUR 36', 24, g24)?.valeur === '36', 'grille 24 : « EU 44 » = « 44 », « EU 42 » = « 42 » (00dca55c, 2818876e : les réponses données)');
  verifier(eq('EU 30', 24, g24) === null && eq('EU 34', 24, g24) === null && eq('EU 24', 24, g24) === null && eq('W30', 24, g24) === null, 'grille 24 : jamais dans la plage des tours de taille (24…34) — la question reste');
  verifier(eq('EU 40', 32, ['36', '38', '40', '1A', '2B'])?.valeur === '40' && eq('EUR 50', 98, ['46', '48', '50', '52'])?.valeur === '50', 'grilles 32 et 98 : « EU N » = « N »');
  verifier(eq('EU 40', 56, ['38', '39', '40', '41']) === null && eq('EU 44', 62, g24) === null && eq('EU 37', 24, g24) === null && eq('M', 24, g24) === null, 'inchangées : grilles 56 et 62 (question), une taille absente de la grille, une lettre');
  const st = lire('src/tabs/StockTab.jsx');
  verifier(/if \(!k \|\| !val \|\| ficheLue == null \|\| dejaSurFiche\(k\) \|\| \/\^\(\?:autres\?\|other\)\$\/i\.test\(val\)\) return;/.test(st), '« Compléter » remplit une case VIDE de la fiche, ne réécrit jamais une valeur, jamais « Autre »');
  const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
  verifier(/j\.platform === "depop" && j\.action === "publish" && j\.inventaire_id != null/.test(gpj) && /const traduite = tailleDepop\(vf, pfD\["depopCategoryPath"\]\);/.test(gpj), 'get-pending-jobs : copie Depop VIDE (publication) = taille de la fiche traduite comme à l\'écran');
  const tu = lire('supabase/functions/_shared/taille-du-texte.js');
  verifier(/export function tailleUniqueDuVendeur/.test(tu), 'la règle « taille unique » du 19/10 est intacte (non touchée)');
}

console.log(`\n${ko === 0 ? '✓' : '✗'} cinq-points-2210 : ${ok} contrôles verts, ${ko} rouges`);
process.exit(ko === 0 ? 0 : 1);
