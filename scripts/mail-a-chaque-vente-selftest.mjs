// Autotest — UN MAIL (ET UN PUSH) À CHAQUE VENTE DÉTECTÉE ; UNE VENTE = UN MAIL, JAMAIS DEUX (05/11, règle de Nico ;
// migration 20261105180000_mail_a_chaque_vente) — `npm run selftest:mail-a-chaque-vente`. Sans base : il lit le dépôt.
// Preuve de bout en bout (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-mail-a-chaque-vente.mjs.
// Défauts du 05/11 : push_trg_job sortait sur « last_checked_at » SEUL (dépôt jamais relu → ni note ni mail, même sur
// une vente Leboncoin « Achat en cours » prouvée) ; push_trg_ventes('releve') exigeait « plateforme suivie » même avec
// une date de vente lue (eBay : jamais suivi) ; eBay relevé + chemin du job sans clé commune (double mail).
// Ce test CASSE si :
//   1. la migration s'écarte de la prod au-delà des changements voulus (INVERSE ≠ prod, autre fonction, écriture…) ;
//   2. la sortie « last_checked_at seul » revient dans push_trg_job, ou une preuve (exacte < 24 h, publication < 48 h,
//      relevé) disparaît de la fraîcheur ;
//   3. les sorties d'amont « déclarée », « Vendu », « rattrapage > 24 h » disparaissent ou passent après la fraîcheur ;
//   4. push_trg_ventes('releve') exige de nouveau « plateforme suivie » quand la date de vente est lue ;
//   5. une parade doublon eBay disparaît, ou dédoublonne sur l'annonce eBay SEULE (une annonce en quantité se vend
//      plusieurs fois : deux commandes = deux ventes) ;
//   6. la décision en aval (push_noter, push_ventes_a_envoyer, index email_logs_vente_unique, réservation vente:<note>)
//      ou les déclencheurs qui appellent les deux fonctions perdent leur forme.
import fs from 'node:fs';
import crypto from 'node:crypto';

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${String(d).slice(0, 700)}` : ''}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const MIGRATION = 'supabase/migrations/20261105180000_mail_a_chaque_vente.sql';
const INVERSE = 'supabase/rollbacks/20261105180000_mail_a_chaque_vente_INVERSE.sql';
const PREUVE = 'scripts/preuve-mail-a-chaque-vente.mjs';
const mig = lire(MIGRATION);
const inv = lire(INVERSE);
// md5 des définitions (pg_get_functiondef, sans CR) : prod du 05/11 (l'INVERSE les porte mot pour mot) et migration.
const MD5_PROD = { push_trg_job: '13b1cb3aff9ef824e02cdea9716ad989', push_trg_ventes: 'c239ab8d93e194ff3a0bbe8bd798146e' };
const MD5_MIGRATION = { push_trg_job: '44419b65a0d5e3031da349106a80da00', push_trg_ventes: '52dc9401d6133fcf2fd406c602d0ae5f' };
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
const md5 = (t) => crypto.createHash('md5').update(`${t}\n`).digest('hex');

console.log('1. La migration = la prod + les SEULS changements voulus');
const dMig = definitions(mig), dInv = definitions(inv);
ok(JSON.stringify([...dInv.keys()].sort()) === JSON.stringify(NOMS), `l'INVERSE porte exactement ${NOMS.join(', ')}`, [...dInv.keys()].join(', '));
ok(JSON.stringify([...dMig.keys()].sort()) === JSON.stringify(NOMS), 'la migration ne réécrit AUCUNE autre fonction (ni push_noter, ni push_ventes_a_envoyer, ni push_vente_deja_signalee)', [...dMig.keys()].join(', '));
for (const nom of NOMS) {
  ok(md5(dInv.get(nom)?.texte ?? '') === MD5_PROD[nom], `INVERSE : ${nom} = définition de prod (md5 ${MD5_PROD[nom]})`, md5(dInv.get(nom)?.texte ?? ''));
  ok(md5(dMig.get(nom)?.texte ?? '') === MD5_MIGRATION[nom], `migration : ${nom} = le texte prouvé sur la base jetable (md5 ${MD5_MIGRATION[nom]})`, md5(dMig.get(nom)?.texte ?? ''));
}
for (const [f, t, d] of [[MIGRATION, mig, dMig], [INVERSE, inv, dInv]]) {
  let reste = t;
  for (const x of [...d.values()].sort((a, b) => b.debut - a.debut)) reste = reste.slice(0, x.debut) + reste.slice(x.fin);
  ok(sansCommentaires(reste).replace(/\bBEGIN\b|\bCOMMIT\b|;|\s/g, '') === '', `${f.split('/').pop()} : hors des deux fonctions, BEGIN / COMMIT seulement (aucune donnée, aucun cron, aucun réglage)`,
    sansCommentaires(reste).replace(/\s+/g, ' ').slice(0, 300));
}
const RETIREES_VOULUES = {
  push_trg_job: ['return new;'],
  push_trg_ventes: ['if v_pf is null or not public.push_plateforme_suivie(new.user_id, v_pf) then return new; end if;'],
};
// Ce qu'une ligne AJOUTÉE ne fait jamais : écrire, envoyer, noter, régler.
const INTERDITS = /\binsert\s+into\b|\bupdate\s+(public\.)?[a-z_]+\s+set\b|\bdelete\s+from\b|net\.http_post|push_noter|push_ventes_a_envoyer|\bcron\.|coin_config|pg_advisory/i;
for (const nom of NOMS) {
  const { retirees, ajoutees } = diffLignes(dInv.get(nom)?.texte ?? '', dMig.get(nom)?.texte ?? '');
  ok(JSON.stringify(retirees.map((l) => l.trim())) === JSON.stringify(RETIREES_VOULUES[nom]), `${nom} : seule(s) ligne(s) de prod remplacée(s) : ${RETIREES_VOULUES[nom].length}`,
    JSON.stringify(retirees.map((l) => l.trim())));
  const fautives = ajoutees.map((l) => l.replace(/--.*$/, '')).filter((l) => INTERDITS.test(l));
  ok(fautives.length === 0, `${nom} : les ${ajoutees.length} lignes ajoutées n'écrivent rien, n'envoient rien, ne notent rien`, fautives.join(' | '));
  const configs = ajoutees.map((l) => l.replace(/--.*$/, '')).filter((l) => /set_config\(/.test(l));
  ok(configs.every((l) => /set_config\('fillsell\.push_preuve', v_preuve, true\)/.test(l)), `${nom} : seul réglage de session ajouté : fillsell.push_preuve (lu et effacé par push_noter)`, configs.join(' | '));
}

// Dernière définition de chaque fonction, et les déclencheurs, dans les migrations du dépôt (ordre des fichiers).
const dossier = 'supabase/migrations';
const fichiers = fs.readdirSync(new URL(`../${dossier}`, import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const derniere = new Map();
const declencheurs = [];
for (const f of fichiers) {
  const s = lire(`${dossier}/${f}`);
  for (const [nom, d] of definitions(s)) derniere.set(nom, { f, corps: sansCommentaires(d.corps) });
  for (const m of sansCommentaires(s).matchAll(/CREATE\s+TRIGGER\s+([a-z0-9_]+)\s+([\s\S]*?)EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi)) declencheurs.push({ f, nom: m[1], def: m[2], fn: m[3], args: m[4] });
}
const corps = (nom) => derniere.get(nom)?.corps ?? '';

console.log('\n2. push_trg_job : jamais plus la sortie « last_checked_at » seule');
const job = corps('push_trg_job');
ok(derniere.get('push_trg_job')?.f >= '20261105180000', `dernière définition de push_trg_job : ${derniere.get('push_trg_job')?.f} (la migration 20261105180000 ou plus récente)`);
const reLc = /if\s+old\.last_checked_at\s+is\s+null\s+or\s+old\.last_checked_at\s*<\s*now\(\)\s*-\s*interval\s+'24 hours'\s+then/gi;
const portes = [...job.matchAll(reLc)];
ok(portes.length === 1, `une seule porte de fraîcheur « last_checked_at » (${portes.length})`);
ok(!/old\.last_checked_at[^;]*?then\s*return\s+new\s*;/i.test(job), 'LA RÉGRESSION : « last_checked_at NULL ou > 24 h → return new » directement — absente');
const iPorte = portes[0]?.index ?? -1;
// De la porte à la fin de la branche hors Vinted (la branche Vinted commence par sa garde de disparition).
const iVinted = iPorte >= 0 ? job.indexOf("if v_dispa is not null and v_dispa < now() - interval '24 hours' then return new; end if;", iPorte) : -1;
const apresPorte = iPorte >= 0 && iVinted > iPorte ? job.slice(iPorte, iVinted) : '';
ok(/sale_evidence,exact\}' = 'true'/.test(apresPorte) && /sale_evidence,state\}' = 'sold'/.test(apresPorte)
  && /sale_evidence,platform\}' = new\.platform/.test(apresPorte) && /sale_evidence,listing_id\}', ''\)\) = v_annonce/.test(apresPorte),
  'preuve 1 : la preuve EXACTE de CETTE annonce (exact, sold, plateforme, numéro)', apresPorte.slice(0, 600));
ok(/v_lu\s*:=\s*coalesce\(public\._ts_ou_null\(new\.platform_fields #>> '\{sale_evidence,observed_at\}'\),\s*public\._ts_ou_null\(new\.platform_fields #>> '\{sale_evidence,lu_le\}'\)\)/.test(apresPorte)
  && /v_lu >= now\(\) - interval '24 hours' and v_lu <= now\(\) \+ interval '5 minutes'/.test(apresPorte),
  '… lue il y a moins de 24 h (observed_at, sinon lu_le), jamais dans le futur');
ok(/v_fin is null or v_fin >= now\(\) - interval '24 hours'/.test(apresPorte), '… d\'une annonce qui n\'est pas close depuis plus de 24 h (sale_evidence.fin)');
ok(/new\.published_at > now\(\) - interval '48 hours'/.test(apresPorte), 'preuve 2 : publication de moins de 48 h');
ok(/push_preuve_en_ligne\(new\.user_id, v_pf, v_annonce, null\)/.test(apresPorte), 'preuve 3 : le relevé (push_preuve_en_ligne : vue en ligne hier ou aujourd\'hui)');
ok(/if v_preuve is null then\s*return new;\s*end if;\s*perform set_config\('fillsell\.push_preuve', v_preuve, true\);/.test(apresPorte),
  'le return new ne part que si AUCUNE preuve n\'existe ; la preuve est gardée (push_ventes.preuve_recente)');

console.log('\n3. push_trg_job : les sorties d\'amont, inchangées et AVANT la fraîcheur');
const iDecl = job.indexOf('v_declaree := public.push_declaration_en_cours(new.user_id, new.inventaire_id);');
const iNotDecl = job.indexOf('if not v_declaree then');
const iVendu = job.search(/new\.platform_fields #>> '\{sale_evidence,source\}' = 'transaction_leboncoin'\s+and new\.platform_fields #>> '\{sale_evidence,statut\}' = 'sold' then\s+return new;/);
const iRatt = job.search(/'\{sale_evidence,rattrapage,premiere_lecture\}'\), '-infinity'::timestamptz\)\s+< now\(\) - interval '24 hours' then\s+return new;/);
ok(iDecl > 0 && iNotDecl > iDecl, '« déclarée » : push_declaration_en_cours, puis tout le reste sous « if not v_declaree »');
ok(iVendu > iNotDecl && iVendu < iPorte, '« Vendu » (transaction Leboncoin terminée) : return new, avant la fraîcheur');
ok(iRatt > iVendu && iRatt < iPorte, '« rattrapage > 24 h » (première lecture) : return new, avant la fraîcheur');
ok(/if v_dispa < now\(\) - interval '24 hours' then return new; end if;/.test(job) && /elsif not \(coalesce\(new\.voie, ''\) = 'api' and new\.status = 'sold'\) then/.test(job),
  'disparition > 24 h et voie API vendue : inchangées');
ok(/push_vinted_vendue_avant\(new\.user_id, v_annonce\)/.test(job) && /v_vu >= v_debut_hier/.test(job), 'branche Vinted : inchangée (déjà vue vendue, veille d\'hier, publication < 48 h, relevé)');
ok(/perform public\.push_noter\(new\.user_id, 'job', v_pf, null, new\.inventaire_id, new\.id,\s*null, v_annonce, new\.title, v_prix, null, null,\s*v_declaree\);/.test(job), 'la note du job : push_noter, mêmes arguments');

console.log('\n4. push_trg_ventes : une date de vente lue de moins de 24 h est sa propre preuve');
const ven = corps('push_trg_ventes');
ok(derniere.get('push_trg_ventes')?.f >= '20261105180000', `dernière définition de push_trg_ventes : ${derniere.get('push_trg_ventes')?.f}`);
ok(!/if v_pf is null or not public\.push_plateforme_suivie/.test(ven), 'LA RÉGRESSION : « plateforme suivie » exigée même avec une date lue — absente');
const iSuivie = ven.indexOf("if v_pf is null or (new.vendu_le is null and not public.push_plateforme_suivie(new.user_id, v_pf)) then return new; end if;");
ok(iSuivie > 0, '« plateforme suivie » seulement SANS date de vente');
const iB24 = ven.indexOf("if new.vendu_le is not null and new.vendu_le < now() - interval '24 hours' then return new; end if;");
const iB1 = ven.indexOf("if new.vendu_le is not null and new.vendu_le > now() + interval '1 hour' then return new; end if;");
ok(iB24 > 0 && iB1 > 0 && iB24 < iSuivie && iB1 < iSuivie, 'les bornes : vente de plus de 24 h ou datée dans le futur → rien (avant la règle)');
ok(/perform public\.push_noter\(new\.user_id, 'commande', v_pf, new\.id, new\.inventaire_id, null,\s*new\.commande_ref, new\.annonce_id, new\.titre, new\.prix_vente, new\.devise, new\.vendu_le, false\);/.test(ven),
  'la note du relevé : push_noter « commande », mêmes arguments');
ok(/elsif tg_argv\[0\] = 'personne' or public\.push_declaration_en_cours\(new\.user_id, new\.inventaire_id\) then\s*perform public\.push_noter\(new\.user_id, 'declaree'/.test(ven),
  'vente déclarée (personne, ou déclaration en cours) : note « declaree », inchangée');

console.log('\n5. Parade doublon eBay : une vente = une note, deux commandes = deux ventes');
const iParadeV = ven.indexOf("if v_pf = 'ebay' and exists (");
const iNoteV = ven.indexOf("perform public.push_noter(new.user_id, 'commande'");
const paradeV = iParadeV > 0 ? ven.slice(iParadeV, iNoteV) : '';
// (05/11 soir, décision d de Nico, migration 20261105220000) Une parade qui écarte une note laisse UNE trace usage_logs
// « vente_notification_ecartee » juste avant son return new — et rien d'autre (aucune note, aucun envoi).
const TRACE = String.raw`(?:insert into public\.usage_logs \(user_id, feature, metadata\)\s*values \(new\.user_id, 'vente_notification_ecartee', jsonb_build_object\([^;]*\)\);\s*)?`;
ok(iParadeV > iSuivie && iParadeV < iNoteV && new RegExp(String.raw`\)\) then\s*${TRACE}return new;\s*end if;\s*$`).test(paradeV), 'relevé : la parade eBay passe AVANT la note (return new ; au plus la trace « vente_notification_ecartee » avant)');
ok(/o\.vente_id is distinct from new\.id/.test(paradeV), '… jamais sa propre note');
ok(/o\.cles && array\['commande:ebay:' \|\| nullif\(btrim\(coalesce\(new\.commande_ref, ''\)\), ''\)\]/.test(paradeV), '(1) la même commande (clé commande:ebay:<ref>)');
ok(/j\.platform_fields #>> '\{vente_commande_ebay,commande\}' = new\.commande_ref/.test(paradeV) && /j\.platform_fields #>> '\{sale_evidence,order_id\}' = split_part\(new\.commande_ref, ':', 1\)/.test(paradeV)
  && /nullif\(btrim\(coalesce\(j\.platform_listing_id, ''\)\), ''\) = nullif\(btrim\(coalesce\(new\.annonce_id, ''\)\), ''\)/.test(paradeV),
  '(2) le même job : sa commande ou sa preuve (order_id) désigne CETTE commande, sur CETTE annonce');
ok(/public\.ventes_operations r/.test(paradeV) && /w\.commande_ref = new\.commande_ref/.test(paradeV)
  && /w\.commande_ref is null\s+and coalesce\(j\.platform_fields #>> '\{vente_commande_ebay,commande\}',\s*j\.platform_fields #>> '\{sale_evidence,order_id\}'\) is null\s+and w\.created_at >= coalesce\(new\.vendu_le, new\.created_at\) - interval '10 minutes'/.test(paradeV),
  '(2) … ou son reçu : une vente de cette commande, ou sans commande (job sans numéro) enregistrée après cette vente');
ok(/o\.cles && array\['fiche:' \|\| new\.inventaire_id::text\]/.test(paradeV) && /coalesce\(i\.quantite, 1\) <= 1/.test(paradeV) && /o\.cree_le > now\(\) - interval '3 days'/.test(paradeV),
  '(3) la même fiche à pièce unique, 3 jours (fenêtre de push_ventes_a_envoyer)');
ok(!/'annonce:ebay:'/.test(paradeV), 'relevé : jamais l\'annonce eBay seule (une annonce en quantité se vend plusieurs fois)');
ok(/o\.part_le is not null or o\.statut in \('en_envoi', 'envoyee', 'declaree'\)\s*or \(o\.statut = 'a_envoyer' and \(o\.job_id is null or exists \(\s*select 1 from public\.cross_post_jobs js where js\.id = o\.job_id and js\.status = 'sold'\)\)\)/.test(paradeV),
  'une note compte si elle est partie, déclarée, ou en attente d\'une décision qui viendra (job « vendu ») — jamais une note ignorée ou doublon');
const iParadeJ = job.indexOf("if v_pf = 'ebay' and exists (");
const paradeJ = iParadeJ > 0 ? job.slice(iParadeJ, job.indexOf('end if;', iParadeJ) + 7) : '';
ok(iParadeJ > job.indexOf("if v_pf is distinct from 'vinted' then") && iParadeJ < iPorte && new RegExp(String.raw`then\s*${TRACE}return new;\s*end if;$`).test(paradeJ),
  'job (l\'autre sens) : la parade eBay passe AVANT la fraîcheur (aucune preuve de session posée pour rien ; au plus la trace avant le return new)');
ok(/o\.job_id is null/.test(paradeJ) && /'commande:ebay:' \|\| nullif\(btrim\(coalesce\(new\.platform_fields #>> '\{vente_commande_ebay,commande\}', ''\)\), ''\)/.test(paradeJ),
  'job : la commande que ebay_commande_appliquer pose (vente_commande_ebay) déjà notée par le relevé');
ok(/o\.cles && array\['annonce:ebay:' \|\| v_annonce\]\s+and \(split_part\(coalesce\(o\.commande_ref, ''\), ':', 1\)\s+= nullif\(btrim\(coalesce\(new\.platform_fields #>> '\{sale_evidence,order_id\}', ''\)\), ''\)/.test(paradeJ),
  'job : ou la preuve order_id ET la même annonce — jamais l\'annonce eBay seule');
ok(/nullif\(btrim\(coalesce\(new\.platform_fields #>> '\{sale_evidence,order_id\}', ''\)\), ''\) is null\s+and nullif\(btrim\(coalesce\(new\.platform_fields #>> '\{vente_commande_ebay,commande\}', ''\)\), ''\) is null\s+and o\.cree_le > now\(\) - interval '3 days' and o\.vendu_le is not null/.test(paradeJ)
  && /abs\(extract\(epoch from \(o\.vendu_le - public\._ts_ou_null\(new\.platform_fields #>> '\{sale_evidence,fin\}'\)\)\)\) <= 600/.test(paradeJ),
  'job : preuve SANS numéro de commande (API Browse) → la vente relevée de CETTE annonce datée de sa fin (± 10 min), 3 jours au plus (doubles 1828/1829, 2577/2776, 4345/4370)');
ok(/UPDATE cross_post_jobs c SET status = 'sold'[\s\S]{0,300}?'vente_commande_ebay',\s*jsonb_build_object\('vente', v\.id, 'commande', v\.commande_ref/.test(corps('ebay_commande_appliquer')),
  'ebay_commande_appliquer pose vente_commande_ebay.commande dans l\'écriture qui passe le job « vendu » (ce que lit la parade)');

console.log('\n6. La décision en aval, inchangée');
const noter = corps('push_noter');
ok(/'commande:' \|\| v_pf \|\| ':' \|\| p_commande/.test(noter) && /'annonce:' \|\| v_pf \|\| ':' \|\| p_annonce/.test(noter) && /'job:' \|\| p_job::text/.test(noter) && /'fiche:' \|\| p_inv::text/.test(noter),
  `push_noter (${derniere.get('push_noter')?.f}) : clés commande / annonce / job / fiche`);
ok(/push_vente_deja_signalee\(/.test(noter) && /current_setting\('fillsell\.push_preuve', true\)/.test(noter), 'push_noter : doublon à la naissance, preuve de session lue (puis effacée)');
const env = corps('push_ventes_a_envoyer');
ok(/pg_try_advisory_xact_lock\(hashtextextended\('push_ventes:' \|\| v_user::text, 0\)\)/.test(env) && /'meme_job_ou_fiche'/.test(env) && /push_vente_deja_signalee\(v_user/.test(env),
  `push_ventes_a_envoyer (${derniere.get('push_ventes_a_envoyer')?.f}) : décision par compte sous verrou, doublons (même vente, même job ou fiche)`);
ok(/create unique index if not exists email_logs_vente_unique/i.test(lire('supabase/migrations/20261006180000_mails_de_vente.sql')), 'index email_logs_vente_unique : un mail par note');
const pv = lire('supabase/functions/push-ventes/index.ts');
ok(/from\("email_logs"\)\.insert\(\{ user_id: n\.user_id, email_type: `vente:\$\{n\.id\}`/.test(pv), 'push-ventes réserve « vente:<note> » avant d\'envoyer');
const dJob = declencheurs.filter((d) => d.nom === 'cross_post_jobs_push_vendu').at(-1);
ok(dJob?.fn === 'push_trg_job' && /after\s+update\s+of\s+status,\s*platform_fields\s+on\s+(public\.)?cross_post_jobs/i.test(dJob.def), `déclencheur cross_post_jobs_push_vendu → push_trg_job (${dJob?.f})`, dJob?.def);
const dRel = declencheurs.filter((d) => d.nom === 'ventes_push_releve').at(-1);
ok(dRel?.fn === 'push_trg_ventes' && /'releve'/.test(dRel.args) && /after\s+insert\s+on\s+(public\.)?ventes/i.test(dRel.def), `déclencheur ventes_push_releve → push_trg_ventes('releve') (${dRel?.f})`, dRel?.def);

console.log('\n7. La preuve de bout en bout suit le même texte');
const preuve = lire(PREUVE);
ok(preuve.includes("supabase/migrations/20261105180000_mail_a_chaque_vente.sql") && preuve.includes("supabase/rollbacks/20261105180000_mail_a_chaque_vente_INVERSE.sql"), `${PREUVE} joue cette migration et son INVERSE`);
ok(NOMS.every((x) => preuve.includes(MD5_PROD[x]) && preuve.includes(MD5_MIGRATION[x])), `${PREUVE} vérifie les mêmes md5 (prod et migration)`);
ok(/PREUVE_PG[\s\S]{0,200}supabase\\\.\(co\|com\)/.test(preuve), `${PREUVE} refuse toute base Supabase (jamais la prod)`);

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
