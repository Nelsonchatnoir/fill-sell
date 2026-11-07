// Autotest — UN SEUL CHEMIN DE FIN POUR UNE VENTE, ET LA REMISE EN VENTE SUIT (05/11, règle de Nico ; migration
// 20261105170000_remise_en_vente_series_leboncoin) — `npm run selftest:remise-en-vente-chemins`. Sans base : il lit le dépôt.
// Régression du 22/10 (01c2437) : leboncoin_transaction_noter s'arrêtait sur « plusieurs_exemplaires » pour TOUT article en
// série — la vente Leboncoin « Achat en cours » n'allait jamais au point final (enregistrer_vente_atomique), aucune remise.
// Ce test CASSE si :
//   1. la migration s'écarte de la prod au-delà des changements voulus (cadence, plafonds, autre fonction…) ;
//   2. leboncoin_transaction_noter arrête de nouveau un DÉPÔT FILLSELL sur « plusieurs_exemplaires », ou ne pose plus la
//      preuve exacte que lit ventes_prouvees_a_enregistrer ;
//   3. un maillon de la chaîne preuve → ventes_prouvees_tick → enregistrer_vente_prouvee → enregistrer_vente_atomique →
//      déclencheur → remises_en_vente_tick se perd ;
//   4. remises_en_vente_tick perd l'une des deux corrections (transaction Leboncoin ≠ « encore en ligne » ; une
//      republication n'est jamais « importée ») ;
//   5. un NOUVEAU chemin écrit une vente ou passe une annonce « vendue » sans le point final (SQL, fonctions edge, app).
import fs from 'node:fs';
import crypto from 'node:crypto';

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${String(d).slice(0, 700)}` : ''}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const MIGRATION = 'supabase/migrations/20261105170000_remise_en_vente_series_leboncoin.sql';
const INVERSE = 'supabase/rollbacks/20261105170000_remise_en_vente_series_leboncoin_INVERSE.sql';
const mig = lire(MIGRATION);
const inv = lire(INVERSE);
// md5 des définitions de prod du 05/11 (pg_get_functiondef, sans CR) : l'INVERSE les porte mot pour mot.
const MD5_PROD = {
  leboncoin_transaction_noter: 'dbf4bdd2e8ce0246518a3ffafb2f918d',
  remises_en_vente_tick: 'd93d5ddd7306743644921495c23434cc',
  vente_transaction_annulee_leboncoin: 'f3a8a336985bed96456f3f1d00d659bf',
};
const NOMS = Object.keys(MD5_PROD);

// Les définitions d'un fichier SQL : nom → texte de « CREATE OR REPLACE FUNCTION » au $tag$ fermant (inclus).
function definitions(texte) {
  const out = new Map();
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
  let m;
  while ((m = re.exec(texte))) {
    const as = /\bAS\s+(\$[a-z_]*\$)/gi; as.lastIndex = m.index;
    const a = as.exec(texte); if (!a) break;
    const fin = texte.indexOf(a[1], a.index + a[0].length);
    if (fin < 0) break;
    out.set(m[1].toLowerCase(), { texte: texte.slice(m.index, fin + a[1].length), corps: texte.slice(a.index + a[0].length, fin), debut: m.index, fin: fin + a[1].length });
    re.lastIndex = fin + a[1].length;
  }
  return out;
}
// Lignes retirées / ajoutées (plus longue sous-suite commune).
function diffLignes(avant, apres) {
  const A = avant.split('\n'), B = apres.split('\n');
  const L = Array.from({ length: A.length + 1 }, () => new Int32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const retirees = [], ajoutees = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) retirees.push(A[i++]); else ajoutees.push(B[j++]);
  }
  while (i < A.length) retirees.push(A[i++]);
  while (j < B.length) ajoutees.push(B[j++]);
  return { retirees, ajoutees };
}

console.log('1. La migration = la prod + les SEULS changements voulus');
const dMig = definitions(mig), dInv = definitions(inv);
ok(JSON.stringify([...dInv.keys()].sort()) === JSON.stringify([...NOMS].sort()), `l'INVERSE porte exactement ${NOMS.join(', ')}`, [...dInv.keys()].join(', '));
ok(JSON.stringify([...dMig.keys()].sort()) === JSON.stringify([...NOMS].sort()), 'la migration ne réécrit AUCUNE autre fonction', [...dMig.keys()].join(', '));
for (const nom of NOMS) {
  const md5 = crypto.createHash('md5').update(`${dInv.get(nom)?.texte ?? ''}\n`).digest('hex');
  ok(md5 === MD5_PROD[nom], `INVERSE : ${nom} = définition de prod (md5 ${MD5_PROD[nom]})`, md5);
}
// Hors des fonctions : BEGIN, COMMIT, des commentaires — rien d'autre (aucune donnée, aucun cron, aucun réglage).
let reste = mig;
for (const d of [...dMig.values()].sort((x, y) => y.debut - x.debut)) reste = reste.slice(0, d.debut) + reste.slice(d.fin);
ok(sansCommentaires(reste).replace(/\bBEGIN\b|\bCOMMIT\b|;|\s/g, '') === '', 'hors des trois fonctions : BEGIN / COMMIT seulement (aucune écriture, aucun cron, aucun réglage)',
  sansCommentaires(reste).replace(/\s+/g, ' ').slice(0, 300));
const RETIREES_VOULUES = {
  leboncoin_transaction_noter: ["ELSIF coalesce(i.quantite, 1) > 1 THEN v_issue := 'plusieurs_exemplaires';           -- pro multi-unités : à la personne"],
  remises_en_vente_tick: ["AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now()))) THEN"],
  vente_transaction_annulee_leboncoin: ["'copies_remises', v_copies, 'retraits_en_cours', v_en_cours);"],
};
// Ce qu'une ligne AJOUTÉE ne touche jamais : cadence, plafonds, quotas, réglages, crons, envois.
const INTERDITS = /\binterval\b|prochain_essai|remise_en_vente_place|quota|plafond|LIMIT\s+GREATEST|coin_config|price_per_platform|\bcron\.|net\.http_post|push_noter|INSERT\s+INTO\s+(public\.)?ventes\b|status\s*=\s*'sold'/i;
for (const nom of NOMS) {
  const { retirees, ajoutees } = diffLignes(dInv.get(nom)?.texte ?? '', dMig.get(nom)?.texte ?? '');
  ok(JSON.stringify(retirees.map((l) => l.trim())) === JSON.stringify(RETIREES_VOULUES[nom]), `${nom} : seule(s) ligne(s) de prod remplacée(s) : ${RETIREES_VOULUES[nom].length}`,
    JSON.stringify(retirees.map((l) => l.trim())));
  const fautives = ajoutees.map((l) => l.replace(/--.*$/, '')).filter((l) => INTERDITS.test(l));
  ok(fautives.length === 0, `${nom} : les ${ajoutees.length} lignes ajoutées ne touchent ni cadence, ni plafond, ni quota, ni envoi`, fautives.join(' | '));
}

console.log("\n2. leboncoin_transaction_noter : un DÉPÔT FILLSELL n'est jamais arrêté sur « plusieurs_exemplaires »");
const noter = sansCommentaires(dMig.get('leboncoin_transaction_noter')?.corps ?? '');
const arrets = [...noter.matchAll(/ELSIF\s+([^;]*?)\s+THEN\s+v_issue\s*:=\s*'plusieurs_exemplaires'/g)];
ok(arrets.length === 1, `une seule porte « plusieurs_exemplaires » (${arrets.length})`);
const cond = arrets[0]?.[1] ?? '';
ok(/quantite, 1\) > 1/.test(cond) && /public\.annonce_importee\(j\.id\)/.test(cond) && /coalesce\(j\.action, 'publish'\) <> 'republish'/.test(cond),
  'elle exige : plusieurs exemplaires ET une annonce importée (annonce_importee) ET pas une republication FillSell', cond);
ok(!/plusieurs_exemplaires'[^\n]*\n?[^\n]*ELSIF coalesce\(i\.quantite, 1\) > 1 THEN/.test(noter) && !/ELSIF coalesce\(i\.quantite, 1\) > 1 THEN/.test(noter),
  "plus jamais la règle du 22/10 « quantité > 1 → arrêt » seule");
const preuve = noter.slice(noter.indexOf("'sale_signal', 'sold'"));
ok(/'sale_signal', 'sold'/.test(noter) && /'platform', 'leboncoin', 'listing_id', btrim\(a\.listing_id\), 'state', 'sold'/.test(preuve)
  && /'exact', true, 'source', 'transaction_leboncoin', 'statut', p_tx/.test(preuve), 'la preuve exacte reste posée (sale_signal, sale_evidence : plateforme, numéro, état, exact, source)');
// Dernière définition de chaque fonction, et les déclencheurs, dans les migrations du dépôt (ordre des fichiers).
const dossier = 'supabase/migrations';
const fichiers = fs.readdirSync(new URL(`../${dossier}`, import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const derniere = new Map();
const parFichier = new Map();
const declencheurs = [];
for (const f of fichiers) {
  const s = lire(`${dossier}/${f}`);
  for (const [nom, d] of definitions(s)) { derniere.set(nom, { f, corps: sansCommentaires(d.corps) }); parFichier.set(`${f}|${nom}`, sansCommentaires(d.corps)); }
  for (const m of sansCommentaires(s).matchAll(/CREATE\s+TRIGGER\s+([a-z0-9_]+)\s+([\s\S]*?)EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-z0-9_]+)/gi)) declencheurs.push({ f, nom: m[1], def: m[2], fn: m[3] });
}
const corps = (nom) => derniere.get(nom)?.corps ?? '';
const imp = corps('annonce_importee');
ok(/COALESCE\(j\.platform_fields ->> 'source', ''\) = 'releve'/.test(imp) && /COALESCE\(j\.platform_fields #>> '\{rattachement,import\}', ''\) = 'true'/.test(imp),
  `annonce_importee (${derniere.get('annonce_importee')?.f}) lit source « releve » / rattachement.import : l'annonce importée par le relevé`, imp.trim().slice(0, 300));

console.log('\n3. La chaîne jusqu\'au point final, puis la remise (dernière définition de chaque fonction dans les migrations)');
// (06/11, ordre des photos) remises_en_vente_tick est redéfinie par 20261106230000_ordre_photos_article (définition de
// prod du 06/11 = celle de 20261105170000, plus les photos du job vendu dans l'ordre de la fiche) : acceptée SEULEMENT si
// son corps est celui de 20261105170000 au seul remplacement près de l'expression des photos — rien d'autre ne la défait.
const M1105 = '20261105170000_remise_en_vente_series_leboncoin.sql';
const M0611 = '20261106230000_ordre_photos_article.sql';
const plat = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const ordrePhotos0611 = plat(parFichier.get(`${M0611}|remises_en_vente_tick`)).replace(
    'THEN public.photos_ordre_article(j.photos, i.photos, j.platform_fields)', 'THEN j.photos') === plat(parFichier.get(`${M1105}|remises_en_vente_tick`));
const tickOrdrePhotos = derniere.get('remises_en_vente_tick')?.f === M0611 && ordrePhotos0611;
// (07/11, Ornella) Puis 20261107150000_ventes_annulees_fermeture (prod du 07/11 = 20261106230000) : acceptée SEULEMENT si
// chaque ligne du corps de 20261106230000 s'y retrouve, dans l'ordre (seule change la ligne du bilan) — ce qu'elle ajoute
// ne fait que fermer des remises après vente annulée (hors stock, jumelle prouvée) ; rien de la chaîne n'est défait.
const M0711 = '20261107150000_ventes_annulees_fermeture.sql';
const lignesNettes = (t) => String(t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
const tickVentesAnnulees = (() => {
  if (derniere.get('remises_en_vente_tick')?.f !== M0711 || !ordrePhotos0611) return false;
  const a = lignesNettes(parFichier.get(`${M0611}|remises_en_vente_tick`)), b = lignesNettes(parFichier.get(`${M0711}|remises_en_vente_tick`));
  let k = 0; const manquantes = [];
  for (const l of a) { const at = b.indexOf(l, k); if (at < 0) manquantes.push(l); else k = at + 1; }
  return a.length > 100 && manquantes.length === 1 && /'abandonnees', v_abandons, 'cpu', v_cpu\);/.test(manquantes[0]);
})();
ok(derniere.get('leboncoin_transaction_noter')?.f === M1105
  && (derniere.get('remises_en_vente_tick')?.f === M1105 || tickOrdrePhotos || tickVentesAnnulees)
  && derniere.get('vente_transaction_annulee_leboncoin')?.f === M1105,
  'les trois fonctions ont leur dernière définition dans la migration 20261105170000 (aucune réécriture plus récente ne la défait ; remises_en_vente_tick : 20261106230000 = 20261105170000 + l\'ordre des photos ; 20261107150000 = 20261106230000 + les fermetures des ventes annulées, rien d\'autre)',
  NOMS.map((x) => `${x}: ${derniere.get(x)?.f}`).join(' ; '));
const vpae = corps('ventes_prouvees_a_enregistrer');
ok(/sale_evidence,listing_id\}' = btrim\(c\.platform_listing_id\)/.test(vpae) && /sale_evidence,platform\}' = c\.platform/.test(vpae)
  && /sale_evidence,state\}' = 'sold'/.test(vpae) && /sale_evidence,exact\}' = 'true'/.test(vpae) && /c\.action IN \('publish', 'republish'\)/.test(vpae),
  'ventes_prouvees_a_enregistrer lit exactement la preuve posée (numéro, plateforme, état, exact), publication ET republication');
ok(/enregistrer_vente_atomique\(c\.user_id, NULL, p_job := c\.job_id/.test(corps('enregistrer_vente_prouvee')), 'enregistrer_vente_prouvee → enregistrer_vente_atomique (le point final)');
ok(/enregistrer_vente_prouvee\(c\.job_id\)/.test(corps('ventes_prouvees_tick')) && /ventes_prouvees_a_enregistrer\(/.test(corps('ventes_prouvees_tick')), 'ventes_prouvees_tick → enregistrer_vente_prouvee');
const evaCorps = corps('enregistrer_vente_atomique');
ok(/UPDATE cross_post_jobs SET status='sold'/.test(evaCorps) && /'restant',v_restant/.test(evaCorps) && /UPDATE inventaire SET quantite=v_restant/.test(evaCorps),
  'enregistrer_vente_atomique : job « vendu », stock − 1 (quantite = restant), reçu avec le restant');
const dRemise = declencheurs.filter((d) => d.fn === 'cross_post_jobs_vendu_remise_en_vente');
ok(dRemise.length >= 1 && /AFTER\s+UPDATE\s+OF\s+status\s+ON\s+(public\.)?cross_post_jobs/i.test(dRemise.at(-1).def) && /new\.status\s*=\s*'sold'/i.test(dRemise.at(-1).def),
  'déclencheur cross_post_jobs_vendu_remise_en_vente : AFTER UPDATE OF status → « sold »', dRemise.at(-1)?.def);
ok(/INSERT INTO remises_en_vente/.test(corps('cross_post_jobs_vendu_remise_en_vente')), '… qui note la remise (remises_en_vente)');
const tick = corps('remises_en_vente_tick');
ok(/INSERT INTO cross_post_jobs[\s\S]{0,400}?VALUES \(r\.user_id, r\.inventaire_id, r\.platform, 'pending', 'publish'/.test(tick) && /'remise_en_vente',\s*jsonb_build_object\('apres_vente_job', j\.id/.test(tick)
  && /remise_en_vente_champs\(j\.platform_fields\)/.test(tick), 'remises_en_vente_tick crée le dépôt « publish » à l\'identique (remise_en_vente_champs, marqueur remise_en_vente)');

console.log('\n4. remises_en_vente_tick : les deux corrections');
const iEnLigne = tick.indexOf("v_motif := 'annonce_vendue_encore_en_ligne'");
const avantEnLigne = tick.slice(Math.max(0, iEnLigne - 1400), iEnLigne);
ok(iEnLigne > 0 && /AND NOT \(a\.platform = 'leboncoin'\s+AND COALESCE\(public\.leboncoin_transaction_lue\(a\.transaction_plateforme, a\.capture\), ''\) IN \('pending', 'sold'\)\)/.test(avantEnLigne),
  '(a) une annonce Leboncoin sous transaction (« Achat en cours » / « Vendu ») n\'est pas « encore en ligne »');
ok(/a\.listing_id IS DISTINCT FROM NULLIF\(btrim\(j\.platform_listing_id\), ''\)\s+AND NOT \(a\.platform = 'leboncoin'\s+AND COALESCE\(public\.leboncoin_transaction_lue\(a\.transaction_plateforme, a\.capture\), ''\) IN \('pending', 'sold'\)\)\s+AND COALESCE\(a\.vu_le, a\.created_at\) > COALESCE\(j\.sold_at, now\(\)\)\)/.test(tick),
  "(a) … ni « déjà en vente » : une AUTRE annonce Leboncoin de la fiche sous transaction (la vente d'avant, listée « Vendu » des jours) ne bloque pas la remise");
ok(/a\.statut_plateforme = 'en_ligne' AND a\.disparu_le IS NULL AND a\.vu_le > COALESCE\(j\.sold_at, now\(\)\)/.test(avantEnLigne)
  && /s\.status = 'active' AND s\.captured_at > COALESCE\(j\.sold_at, now\(\)\)/.test(avantEnLigne), '(a) la garde reste pour toute annonce revue en ligne SANS transaction (Vinted compris)');
const iImp = tick.indexOf("v_motif := 'annonce_importee_a_quantite'");
const avantImp = tick.slice(Math.max(0, iImp - 1200), iImp);
ok(iImp > 0 && /AND NOT \(r\.platform = 'leboncoin' AND COALESCE\(j\.action, 'publish'\) = 'republish'\)/.test(avantImp),
  "(b) Leboncoin : une republication (dépôt FillSell) n'est jamais « importée à quantité »");
ok(/AND NOT \(r\.platform = 'ebay' AND \(/.test(avantImp) && /quantite_ebay,disponible/.test(avantImp), '(b) eBay : la règle d\'avant, inchangée');

console.log('\n5. vente_transaction_annulee_leboncoin : plusieurs exemplaires');
const annul = corps('vente_transaction_annulee_leboncoin');
const iSerie = annul.indexOf("ELSIF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'stock' THEN");
const serie = iSerie > 0 ? annul.slice(iSerie, annul.indexOf('UPDATE cross_post_jobs SET status = \'published\'', iSerie)) : '';
ok(iSerie > 0 && /UPDATE inventaire SET quantite = coalesce\(quantite, 0\) \+ v_q WHERE id = i\.id/.test(serie), 'fiche restée au stock : l\'exemplaire revient (+1)');
ok(/DELETE FROM inventaire WHERE id = v_hist/.test(serie) && /h\.statut = 'vendu' AND h\.id BETWEEN v_ms - 2000 AND v_ms \+ 20000/.test(serie),
  'sa copie « vendu » (née au même instant) est effacée — même règle que vente_commande_annulee_vinted');
ok(/v_rv\.statut = 'a_faire'/.test(serie) && /WHERE id = v_rv\.job_cree AND status = 'pending'/.test(serie) && !/statut = 'abandonnee'|'proposee'/.test(serie),
  'la remise s\'arrête seulement si elle n\'est pas servie (file « a_faire », dépôt « pending ») ; un refus de la personne n\'est jamais touché');
ok(/INSERT INTO inventaire_journal[\s\S]*'avant', jsonb_build_object\('quantite', i\.quantite, 'remise', v_remise_avant, 'depot', v_depot_avant\)/.test(serie)
  && /'copie_effacee', v_hist_ligne/.test(serie), "l'état d'avant (quantité, file, dépôt, copie effacée) part dans la trace");

console.log('\n6. Tous les chemins qui écrivent une vente passent par le point final');
const SOLD_PERMIS = {
  enregistrer_vente_atomique: 'le point final',
  ebay_commande_appliquer: "commande eBay : la quantité eBay lue décide (épuisée → vendue) ; la vente vient du relevé des commandes",
  signal_vente_clore_meme_cession: 'même cession qu\'une vente déjà saisie : l\'annonce est classée, aucune seconde vente',
};
const VENTES_PERMIS = {
  enregistrer_vente_atomique: 'le point final',
  enregistrer_ventes_relevees: "le relevé des commandes (comptabilité) : il ADOPTE la vente du point final par son reçu « annonce:<plateforme>:<numéro> »",
  vente_vinted_lot_eclater: 'lot Vinted éclaté : chaque article passe par enregistrer_vente_atomique',
};
for (const [nom, { f, corps: c }] of derniere) {
  if (/UPDATE\s+(?:public\.)?cross_post_jobs\b[\s\S]{0,200}?\bSET\s+status\s*=\s*'sold'/i.test(c)) ok(nom in SOLD_PERMIS, `${nom} (${f}) passe une annonce « vendue » : ${SOLD_PERMIS[nom] ?? 'CHEMIN INCONNU — il doit passer par enregistrer_vente_atomique'}`);
  if (/INSERT\s+INTO\s+(?:public\.)?ventes\s*\(/i.test(c)) ok(nom in VENTES_PERMIS, `${nom} (${f}) écrit une vente : ${VENTES_PERMIS[nom] ?? 'CHEMIN INCONNU — il doit passer par enregistrer_vente_atomique'}`);
}
for (const nom of ['enregistrer_vente_prouvee', 'enregistrer_vente_declaree', 'vente_vinted_lot_eclater']) ok(/enregistrer_vente_atomique\s*\(/.test(corps(nom)), `${nom} → enregistrer_vente_atomique`);
ok(/'adopte'|v_adopte/.test(corps('enregistrer_ventes_relevees')) && /o\.cle='annonce:'\|\|p_platform\|\|':'\|\|v_listing/.test(corps('enregistrer_ventes_relevees')),
  'enregistrer_ventes_relevees adopte la vente du point final par son reçu (jamais deux ventes)');

const sources = [];
const parcourir = (dir) => {
  for (const e of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') parcourir(p); } else if (/\.(ts|js|jsx|tsx)$/.test(e.name) && !/selftest|\.test\./.test(e.name)) sources.push(p);
  }
};
parcourir('supabase/functions');
let directsEdge = 0;
for (const p of sources) {
  const s = lire(p);
  const ecrit = /\.from\(\s*["']ventes["']\s*\)\s*\.\s*(insert|upsert)\(/.test(s);
  const vendu = /\.from\(\s*["']cross_post_jobs["']\s*\)\s*\.\s*update\(\s*\{[^}]{0,400}\bstatus\s*:\s*["']sold["']/.test(s);
  if (ecrit || vendu) { directsEdge++; ok(false, `${p} écrit une vente / passe une annonce « vendue » en direct`, 'passer par enregistrer_vente_atomique (orchestrateSale)'); }
}
ok(directsEdge === 0, `fonctions edge (${sources.length} fichiers) : aucune vente écrite en direct, aucune annonce passée « vendue » en direct`);
const ujs = lire('supabase/functions/update-job-status/index.ts');
const allowed = ujs.match(/const ALLOWED_STATUSES = \[([^\]]*)\]/)?.[1] ?? '';
ok(allowed && !/["']sold["']/.test(allowed), "update-job-status : « sold » n'est pas un statut accepté (le job passe « vendu » par le point final)", allowed);
const orch = lire('supabase/functions/_shared/sale-orchestration.ts');
ok(/rpc\("enregistrer_vente_declaree"/.test(orch) && /rpc\("enregistrer_vente_atomique"/.test(orch), "orchestrateSale (« Vendue ? » de l'app) → enregistrer_vente_declaree / enregistrer_vente_atomique");
// L'app : les ventes SAISIES (sans annonce) s'écrivent en direct — inventaire figé : un nouvel appel casse ce test.
const SAISIES_APP = { 'src/App.jsx': 6, 'src/tabs/VentesTab.jsx': 2 };
for (const [p, attendu] of Object.entries(SAISIES_APP)) {
  const nb = [...lire(p).matchAll(/\.from\(\s*['"]ventes['"]\s*\)\s*\.\s*(insert|upsert)\(/g)].length;
  ok(nb === attendu, `${p} : ${nb} écriture(s) directe(s) de vente saisie (connues : ${attendu}) — une nouvelle écriture d'une vente d'ANNONCE doit passer par le point final`);
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
