// Autotest — UNE RAFALE = UN MAIL RÉCAPITULATIF (un seul) ; UNE TRACE QUAND UNE PARADE DOUBLON ÉCARTE UNE NOTE ; AUCUN
// RATTRAPAGE DES VENTES PASSÉES (05/11 soir, décisions c, d, e de Nico ; migration 20261105220000_rafale_recapitulatif_et_trace,
// fonction edge push-ventes). Sans base : il lit le dépôt et joue le module pur _shared/ventes-rafale.js.
//   node scripts/rafale-recapitulatif-selftest.mjs
// Preuve de bout en bout (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-rafale-recapitulatif.mjs.
// Ce test CASSE si :
//   1. la migration s'écarte de la prod au-delà des changements voulus (INVERSE ≠ prod, autre fonction, donnée écrite…) ;
//   2. la décision UNITAIRE de push_ventes_a_envoyer change (au-delà de « jamais la note récapitulative ») ;
//   3. la porte d'une note de rafale (push_ventes_rafale_porte) perd une des portes de la décision unitaire, en change
//      l'ordre, ou écrit quelque chose ;
//   4. la rafale perd une de ses garanties : une note récapitulative par rafale, ses notes jamais servies à l'unité,
//      15 s de calme et 6 min au plus, les ventes décidées (part_le), « recap » servi et relancé, une note déjà close
//      jamais reprise, la même rafale après le départ = rien ;
//   5. une parade doublon (C)/(C') écarte sans trace, ou trace autre chose qu'UNE ligne usage_logs juste avant son return ;
//   6. push-ventes envoie le récapitulatif par le chemin des ventes seules, sans la réservation « vente:<id> », sans la
//      garde « vente ancienne » ligne par ligne, ou plus d'un push ;
//   7. le texte (push, mail) perd son nombre, sa liste, ou écrit « 0 € ».
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${String(d).slice(0, 700)}` : ''}`); ko++; } };
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const espaces = (t) => t.replace(/\s+/g, ' ').trim();

const MIGRATION = 'supabase/migrations/20261105220000_rafale_recapitulatif_et_trace.sql';
const INVERSE = 'supabase/rollbacks/20261105220000_rafale_recapitulatif_et_trace_INVERSE.sql';
const PREUVE = 'scripts/preuve-rafale-recapitulatif.mjs';
const PUSH = 'supabase/functions/push-ventes/index.ts';
const PUR = 'supabase/functions/_shared/ventes-rafale.js';
const MAILS = 'supabase/functions/_shared/emails-fillsell.ts';
const mig = lire(MIGRATION);
const inv = lire(INVERSE);
// md5 des définitions (pg_get_functiondef, sans CR) : prod du 05/11 après 20261105180000 (l'INVERSE les porte mot pour
// mot) et migration (les mêmes textes que la preuve vérifie dans la base jetable).
const MD5_PROD = {
  push_trg_job: '44419b65a0d5e3031da349106a80da00',
  push_trg_ventes: '52dc9401d6133fcf2fd406c602d0ae5f',
  push_ventes_a_envoyer: 'dd07d5c6c40f260220ba05f2380cabe6',
};
const MD5_MIGRATION = { ...{
  push_trg_job: 'f2928ca29ce2f793726b9494a873b2eb',
  push_trg_ventes: 'eb3c16595a335ac43ab40e0852bf97e2',
  push_ventes_a_envoyer: '6d8d2af393adbe52e8474d7281260e24',
}, push_ventes_rafale_porte: 'bcafe2b01214ea460bb2f92357b35892' };

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

console.log('1. La migration = la prod + les SEULS changements voulus ; l\'INVERSE = la prod mot pour mot');
const dMig = definitions(mig), dInv = definitions(inv);
ok(JSON.stringify([...dMig.keys()].sort()) === JSON.stringify(Object.keys(MD5_MIGRATION).sort()),
  'la migration réécrit push_trg_job, push_trg_ventes, push_ventes_a_envoyer et crée push_ventes_rafale_porte — rien d\'autre', [...dMig.keys()].join(', '));
ok(JSON.stringify([...dInv.keys()].sort()) === JSON.stringify(Object.keys(MD5_PROD).sort()), 'l\'INVERSE rejoue les trois fonctions de prod', [...dInv.keys()].join(', '));
for (const nom of Object.keys(MD5_PROD)) {
  ok(md5(dInv.get(nom)?.texte ?? '') === MD5_PROD[nom], `INVERSE : ${nom} = définition de prod (md5 ${MD5_PROD[nom]})`, md5(dInv.get(nom)?.texte ?? ''));
}
for (const nom of Object.keys(MD5_MIGRATION)) {
  ok(md5(dMig.get(nom)?.texte ?? '') === MD5_MIGRATION[nom], `migration : ${nom} = le texte prouvé sur la base jetable (md5 ${MD5_MIGRATION[nom]})`, md5(dMig.get(nom)?.texte ?? ''));
}
const hors = (t, d) => { let r = t; for (const x of [...d.values()].sort((a, b) => b.debut - a.debut)) r = r.slice(0, x.debut) + r.slice(x.fin); return espaces(sansCommentaires(r)); };
ok(hors(mig, dMig) === "BEGIN; ; ; ; REVOKE ALL ON FUNCTION public.push_ventes_rafale_porte(bigint) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.push_ventes_rafale_porte(bigint) TO service_role; ; COMMIT;",
  'migration : hors des fonctions, BEGIN / COMMIT et les droits de la porte (service_role seul) — aucune donnée, aucun cron, aucun réglage', hors(mig, dMig));
const horsInv = hors(inv, dInv);
ok(/^BEGIN; UPDATE public\.push_ventes SET statut = 'ignoree', motif = 'rafale_inverse', traite_le = now\(\) WHERE origine = 'rafale' AND statut = 'a_envoyer' AND part_le IS NULL; UPDATE public\.push_ventes SET statut = CASE WHEN statut = 'a_envoyer' THEN 'echec' ELSE statut END, mail_statut = CASE WHEN mail_statut = 'a_envoyer' THEN 'echec' ELSE mail_statut END, motif = 'rafale_inverse', traite_le = now\(\) WHERE origine = 'rafale' AND part_le IS NOT NULL AND \(statut = 'a_envoyer' OR mail_statut = 'a_envoyer'\); ; ; ; DROP FUNCTION IF EXISTS public\.push_ventes_rafale_porte\(bigint\); COMMIT;$/.test(horsInv),
  'INVERSE : hors des fonctions, seulement clore les récapitulatifs ouverts ou à relancer (origine \'rafale\'), puis retirer la porte', horsInv);
ok(/20261105220000_rafale_recapitulatif_et_trace_INVERSE\.sql/.test(mig) && /push-ventes[\s\S]{0,200}PUIS appliquer cette migration/.test(mig),
  'en-tête : l\'INVERSE est nommé ; l\'ORDRE est écrit (push-ventes d\'abord, puis la migration)');
for (const [nom, m5] of Object.entries(MD5_PROD)) ok(mig.includes(m5), `en-tête : md5 de départ de ${nom} (${m5})`);

console.log('\n2. push_trg_ventes (C) et push_trg_job (C\') : UNE trace, juste avant le return de la parade, rien d\'autre');
for (const [nom, raison] of [['push_trg_ventes', 'parade_ebay_releve'], ['push_trg_job', 'parade_ebay_job']]) {
  const { retirees, ajoutees } = diffLignes(dInv.get(nom).texte, dMig.get(nom).texte);
  const code = ajoutees.map((l) => l.replace(/--.*$/, '')).filter((l) => l.trim());
  ok(retirees.length === 0, `${nom} : aucune ligne de prod retirée`, JSON.stringify(retirees));
  ok(/^insert into public\.usage_logs \(user_id, feature, metadata\) values \(new\.user_id, 'vente_notification_ecartee', jsonb_build_object\( 'raison', '[a-z_]+', /.test(espaces(code.join(' ')))
    && code.join(' ').split('insert into').length === 2 && !/update |delete |net\.http_post|push_noter|perform /i.test(code.join(' ')),
  `${nom} : les lignes ajoutées = UNE insertion usage_logs « vente_notification_ecartee » (ni note, ni envoi, ni autre écriture)`, code.join(' | '));
  ok(code.join(' ').includes(`'raison', '${raison}'`), `${nom} : raison « ${raison} »`);
  const corps = sansCommentaires(dMig.get(nom).corps);
  const iParade = corps.indexOf("if v_pf = 'ebay' and exists (");
  const iTrace = corps.indexOf("'vente_notification_ecartee'");
  const finParade = corps.indexOf('end if;', iParade);
  ok(iParade > 0 && iTrace > iParade && iTrace < finParade && /jsonb_build_object\([^;]*\)\);\s*return new;\s*end if;$/.test(corps.slice(iParade, finParade + 7)),
    `${nom} : la trace est DANS la parade, juste avant son return new — jamais sur le chemin normal`);
}
const tJob = espaces(sansCommentaires(dMig.get('push_trg_job').corps));
ok(/'job_id', new\.id/.test(tJob) && /'annonce_id', v_annonce/.test(tJob) && /'commande', new\.platform_fields #>> '\{vente_commande_ebay,commande\}'/.test(tJob)
  && /'order_id', new\.platform_fields #>> '\{sale_evidence,order_id\}'/.test(tJob), "(C') trace : job, annonce, commande, order_id");
const tVen = espaces(sansCommentaires(dMig.get('push_trg_ventes').corps));
ok(/'vente_id', new\.id/.test(tVen) && /'commande_ref', new\.commande_ref/.test(tVen) && /'annonce_id', new\.annonce_id/.test(tVen), '(C) trace : vente, commande, annonce');

console.log('\n3. push_ventes_a_envoyer : la décision UNITAIRE inchangée');
const aveP = dInv.get('push_ventes_a_envoyer').texte, aveM = dMig.get('push_ventes_a_envoyer').texte;
const UNITE = "    for r in\n      select * from public.push_ventes\n       where user_id = v_user and statut = 'a_envoyer' and part_le is null\n";
const uniteP = aveP.slice(aveP.indexOf(UNITE)), uniteM = aveM.slice(aveM.indexOf(UNITE));
ok(aveP.indexOf(UNITE) > 0 && aveM.indexOf(UNITE) > 0
  && uniteM === uniteP.replace("         and cree_le < now() - interval '15 seconds'\n       order by id",
    "         and cree_le < now() - interval '15 seconds' and origine is distinct from 'rafale'\n       order by id"),
  'de la boucle unitaire à la fin : la prod mot pour mot, plus « jamais la note récapitulative » dans sa sélection');
const RELANCES = '    -- Relances d\'une vente déjà décidée';
const teteP = aveP.slice(0, aveP.indexOf(RELANCES)), teteM = aveM.slice(0, aveM.indexOf(RELANCES));
ok(teteM === teteP.replace('  v_j        record;\n', '  v_j        record;\n  v_rec      record;\n  v_ouverte  boolean;\n  v_attend   boolean;\n  v_porte    jsonb;\n  v_lignes   jsonb;\n  v_nb       integer;\n'),
  'en tête (relances interrompues, notes de job, trop tard, purge, choix des comptes, verrou) : la prod mot pour mot (+ 6 variables)');
const { retirees: retAve } = diffLignes(aveP, aveM);
const RETIRABLES = new Set([
  "where p.user_id = v_user and p.origine not in ('declaree', 'essai')",
  "and o.origine not in ('declaree', 'essai') and o.statut not in ('declaree', 'doublon')",
  'if v_rafale >= 8 then', "update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()",
  "where user_id = v_user and statut = 'a_envoyer' and part_le is null;", 'continue;', 'end if;',
  "'a_decider', r.vente_id is null and not (r.origine = 'job' and r.job_id is not null",
  'and public.push_vente_enregistree(r.job_id)));', "and cree_le < now() - interval '15 seconds'",
]);
ok(retAve.every((l) => RETIRABLES.has(l.trim())), `push_ventes_a_envoyer : seules les lignes de la rafale, du compte et de « a_decider » des relances changent (${retAve.length} ligne(s))`,
  retAve.filter((l) => !RETIRABLES.has(l.trim())).join(' | '));
const ave = sansCommentaires(dMig.get('push_ventes_a_envoyer').corps);
ok(/pg_try_advisory_xact_lock\(hashtextextended\('push_ventes:' \|\| v_user::text, 0\)\)/.test(ave), 'un seul appel décide pour un compte (verrou), inchangé');

console.log('\n4. La porte d\'une note de rafale = les portes de la décision unitaire, dans le même ordre, sans rien écrire');
const porte = sansCommentaires(dMig.get('push_ventes_rafale_porte').corps);
const pTexte = dMig.get('push_ventes_rafale_porte').texte;
ok(/^CREATE OR REPLACE FUNCTION public\.push_ventes_rafale_porte\(p_note bigint\)\n RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'\nAS \$function\$/.test(pTexte),
  'push_ventes_rafale_porte : STABLE, SECURITY DEFINER, search_path figé');
ok(!/\binsert\s+into\b|\bupdate\s+(public\.)?[a-z_]+\s+set\b|\bdelete\s+from\b|net\.http_post|set_config|pg_advisory/i.test(porte), 'push_ventes_rafale_porte : n\'écrit rien, n\'envoie rien');
const PORTES = [
  ["if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%') and r.cree_le > now() - interval '3 minutes' then",
    "if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%') and r.cree_le > now() - interval '3 minutes' then"],
  ["if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then",
    "if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then"],
  ["(jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')", "(jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')"],
  ["v_motif := public.push_vente_deja_signalee(v_user, r.plateforme, v_cles, r.cree_le, r.id, false);",
    "v_motif := public.push_vente_deja_signalee(r.user_id, r.plateforme, v_cles, r.cree_le, r.id, false);"],
  ["(o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree')) and o.cree_le > now() - interval '3 days' and o.cles && array(select k from unnest(v_cles) k where k like 'job:%' or k like 'fiche:%')",
    "(o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree')) and o.cree_le > now() - interval '3 days' and o.cles && array(select k from unnest(v_cles) k where k like 'job:%' or k like 'fiche:%')"],
  ["if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then",
    "if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then"],
];
const uniteE = espaces(sansCommentaires(uniteM)), porteE = espaces(porte);
const posU = PORTES.map(([u]) => uniteE.indexOf(u)), posP = PORTES.map(([, p]) => porteE.indexOf(p));
ok(posU.every((x) => x > 0), 'les six portes sont bien dans la décision unitaire (le test lit la bonne chose)', JSON.stringify(posU));
ok(posP.every((x) => x > 0), 'les six portes sont dans push_ventes_rafale_porte (commande sans annonce 3 min, signal Vinted 2 min, signal démenti, déjà signalée, même job ou fiche 3 jours, vente enregistrée)', JSON.stringify(posP));
ok(posU.every((x, i) => i === 0 || x > posU[i - 1]) && posP.every((x, i) => i === 0 || x > posP[i - 1]), '… dans le même ordre des deux côtés');
ok(/'etat', 'attend', 'motif', 'commande_sans_annonce'/.test(porteE) && /'etat', 'attend', 'motif', 'signal_vinted'/.test(porteE)
  && /'etat', 'dementi'/.test(porteE) && /'etat', 'doublon', 'motif', v_motif/.test(porteE) && /'etat', 'attend', 'motif', 'vente_non_enregistree'/.test(porteE)
  && /'etat', 'prete'/.test(porteE), 'verdicts : attend / dementi / doublon (motif) / prete');
ok(porteE.includes("v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);") && porteE.includes("v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text);"),
  'les clés relues (annonce et fiche de la vente), comme la décision unitaire');

console.log('\n5. La rafale : UNE note récapitulative, UN envoi, jamais rétroactive');
const raf = espaces(ave.slice(ave.indexOf('select count(*) into v_rafale'), ave.indexOf(UNITE)));
ok(ave.indexOf(UNITE) > ave.indexOf('select count(*) into v_rafale') && raf.length > 2000, `le bloc de la rafale est lu (du compte à la boucle unitaire : ${raf.length} caractères)`);
ok(/p\.origine not in \('declaree', 'essai', 'rafale'\)/.test(raf) && /o\.origine not in \('declaree', 'essai', 'rafale'\)/.test(raf), 'le compte de la rafale (8 ventes distinctes en 5 min, inchangé) ne compte jamais la note récapitulative');
ok(/if v_ouverte or v_rafale >= 8 then/.test(raf), 'une rafale (≥ 8) ouvre le récapitulatif ; un récapitulatif ouvert garde la main jusqu\'à son départ');
ok(/select \* into v_rec from public\.push_ventes where user_id = v_user and origine = 'rafale' and statut = 'a_envoyer' and part_le is null order by id limit 1; v_ouverte := found;/.test(raf)
  && (raf.match(/insert into public\.push_ventes/g) ?? []).length === 1 && /if not v_ouverte then .*insert into public\.push_ventes \(user_id, origine, titre, statut, lot\) values \(v_user, 'rafale',/.test(raf),
  'UNE note récapitulative par rafale : créée seulement si aucune n\'est ouverte');
ok(/if exists \(select 1 from public\.push_ventes x where x\.user_id = v_user and x\.origine = 'rafale' and x\.part_le > now\(\) - interval '5 minutes'\) then update public\.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse'/.test(raf),
  'le récapitulatif parti (moins de 5 min), la même rafale n\'envoie plus rien — « rattrapage_de_masse », la règle d\'avant');
ok(/update public\.push_ventes set statut = 'ignoree', motif = 'rafale:' \|\| v_rec\.id, traite_le = now\(\) where user_id = v_user and statut = 'a_envoyer' and part_le is null and origine is distinct from 'rafale';/.test(raf),
  'les notes du compte rejoignent le récapitulatif (jamais servies à l\'unité) — seulement des notes « a_envoyer » : une note close (rattrapage d\'avant) n\'est jamais reprise');
ok(/v_rec\.cree_le > now\(\) - interval '15 seconds'/.test(raf) && /m\.cree_le > now\(\) - interval '15 seconds'/.test(raf) && /if v_rec\.cree_le > now\(\) - interval '6 minutes' then/.test(raf)
  && /push_ventes_rafale_porte\(r\.id\) ->> 'etat' = 'attend' then v_attend := true; exit;/.test(raf) && /if v_attend then continue; end if;/.test(raf),
  'il part après 15 s de calme quand plus aucune vente n\'attend une porte — au plus tard 6 min');
ok(/for update skip locked/.test(raf) && /set part_le = now\(\), cles = v_cles, prix = v_prix, motif = 'recapitulatif:' \|\| v_rec\.id/.test(raf)
  && /set statut = 'doublon', motif = v_porte ->> 'motif'/.test(raf) && /set motif = 'signal_dementi'/.test(raf) && /set motif = 'rattrapage_de_masse', traite_le = now\(\) where id = r\.id;/.test(raf),
  'au départ, chaque vente prête est DÉCIDÉE (part_le : les doublons d\'après la voient) ; doublon, démentie, encore en attente (6 min) : closes sans envoi');
ok(/prix_vente_enregistree\(v_j\.user_id/.test(raf) && /prix_vente_du_job\(v_j\.user_id/.test(raf), 'le prix annoncé : la même règle que la décision unitaire (16/10, C1)');
ok(/'note', r\.id, 'titre', r\.titre, 'prix', v_prix, 'devise', r\.devise, 'plateforme', r\.plateforme, 'inventaire_id', r\.inventaire_id, 'vente_id', r\.vente_id, 'articles', r\.articles, 'a_decider',/.test(raf),
  'une ligne par vente : note, titre, prix, plateforme, fiche, vente, articles (commande Vinted), à confirmer');
ok(/motif = 'rafale_sans_vente'/.test(raf), 'aucune vente prête : le récapitulatif se clôt sans rien envoyer');
ok(/set part_le = now\(\), traite_le = now\(\), articles = v_lignes,/.test(raf) && /mail_statut = case when nullif\(btrim\(coalesce\(v_prof\.email, ''\)\), ''\) is null then 'sans_adresse' else 'en_envoi' end/.test(raf)
  && /'a_decider', false, 'recap', true, 'nb_ventes', v_nb\)/.test(raf), 'le récapitulatif est servi UNE fois à push-ventes : « recap: true », ses lignes, son nombre de ventes');
ok(/'recap', r\.origine = 'rafale'\);/.test(espaces(ave)) && /'a_decider', r\.origine is distinct from 'rafale' and r\.vente_id is null/.test(espaces(ave)),
  'une relance (push ou mail à réessayer) le resservit « recap: true »');
ok(/when jsonb_typeof\(l -> 'articles'\) = 'array' and jsonb_array_length\(l -> 'articles'\) > 0 then jsonb_array_length\(l -> 'articles'\) else 1 end/.test(raf),
  'le nombre de ventes : une commande Vinted compte ses articles (règle du 17/10)');

console.log('\n6. push-ventes : UN mail et UN push par récapitulatif, jamais par le chemin des ventes seules');
const pv = lire(PUSH);
ok(pv.includes('import { articlesDeLaLigne, lignesRafale, messageRafale, nombreDeVentes } from "../_shared/ventes-rafale.js";')
  && pv.includes('import { langue, mailRafale, mailVentes } from "../_shared/emails-fillsell.ts";'), 'imports : module pur de la rafale, mailRafale');
const iSplit = pv.indexOf('const recaps = notes.filter((n) => n.recap === true);');
const iGroupes = pv.indexOf('groupesDeMail(notes.filter((n) => n.mail === true))');
const iPousser = pv.indexOf('const aPousser = notes.filter(');
ok(iSplit > 0 && iSplit < iPousser && iSplit < iGroupes && /if \(recaps\.length\) notes\.splice\(0, notes\.length, \.\.\.notes\.filter\(\(n\) => n\.recap !== true\)\);/.test(pv),
  'les récapitulatifs sortent de la liste AVANT le push et les groupes de mails des ventes seules');
const fMail = pv.slice(pv.indexOf('async function envoyerMailRafale('), pv.indexOf('function messageDuRecap('));
ok(/type: `vente:\$\{n\.id\}`/.test(fMail) && /categorie: "support", dedup: "reservation"/.test(fMail) && /if \(r\.motif === "deja_envoye"\) return \{ statut: "deja_envoye" \};/.test(fMail),
  'le mail du récapitulatif : réservation « vente:<id du récapitulatif> » (index email_logs_vente_unique) — un second passage trouve « deja_envoye »');
ok(/ventes\.length === 1\s*\? mailVentes\(/.test(fMail) && /: mailRafale\(\{ ventes(?:, \.\.\.dv)? \}, lang\)/.test(fMail) && /aConfirmer: l\.a_decider === true/.test(fMail) && /ligneDuMail\(admin, a, String\(l\.plateforme \?\? ""\)\)/.test(fMail),
  'chaque ligne : titre, plateforme, prix et bénéfice (ligneDuMail, la règle du mail de vente) ; une seule vente → le mail d\'une vente seule');
const blocRecap = pv.slice(pv.indexOf('const recapsPousses = '), pv.indexOf('const appareils = '));
ok((blocRecap.match(/envoyerNote\(/g) ?? []).length === 1 && /messageDuRecap\(n, lang\)/.test(blocRecap) && (blocRecap.match(/envoyerMailRafale\(/g) ?? []).length === 1
  && /await Promise\.all\(recaps\.map\(/.test(blocRecap), 'par récapitulatif : UN envoyerNote (messageRafale) et UN envoyerMailRafale');
ok(/const appareils = \[\.\.\.aPousser, \.\.\.recapsPousses\]\.flatMap/.test(pv), 'ses appareils passent au verdict (jetons refusés oubliés, comme une vente)');
ok(/\.in\("id", \[\.\.\.notes\.map\(\(n\) => n\.id\), \.\.\.membresRecap\]\)/.test(pv) && /if \(gardees\.length\) n\.articles = gardees/.test(pv) && /else anciennes\.add\(Number\(n\.id\)\);/.test(pv),
  'la garde « vente ancienne » (Vinted) juge chaque ligne : une ligne ancienne sort, un récapitulatif vide ne part pas');
ok(/n\.recap === true && lignesRafale\(n\.articles\)\.some\(\(l\) => l\.plateforme === "vinted" && l\.vente_id == null\)\) aReprendre\.add/.test(pv),
  'relevés illisibles : un récapitulatif qui liste une vente Vinted sans commande attend le passage suivant');
ok(/=== "23505"\) out\.set\(n\.id, \{ statut: "deja_envoye" \}\)/.test(pv) && /if \(membres\.length === 1\) \{\s*const n = membres\[0\];\s*const v = await envoyerMailVente\(admin, n\)/.test(pv),
  'les ventes seules : inchangées (une note seule, groupes du même passage, réservation vente:<note>)');

console.log('\n7. Les textes (module pur, mail)');
const { lignesRafale, nombreDeVentes, messageRafale, articlesDeLaLigne } = await import(pathToFileURL(path.join(RACINE, PUR)).href);
const L = (i, plus = {}) => ({ note: 100 + i, titre: `Article ${i}`, prix: 25, devise: 'EUR', plateforme: 'leboncoin', inventaire_id: 7 + i, vente_id: null, articles: null, a_decider: false, ...plus });
const neuf = Array.from({ length: 9 }, (_, i) => L(i));
ok(lignesRafale(neuf).length === 9 && nombreDeVentes(lignesRafale(neuf)) === 9, '9 lignes = 9 ventes');
ok(lignesRafale([null, 3, 'x', [], L(1)]).length === 1 && lignesRafale(null).length === 0, 'une entrée illisible est écartée, jamais une erreur');
const lot = lignesRafale([L(1), L(2, { plateforme: 'vinted', articles: [{ titre: 'A', prix: 5 }, { titre: 'B', prix: 7 }, { titre: 'C', prix: null }] })]);
ok(nombreDeVentes(lot) === 4 && articlesDeLaLigne(lot[1]).length === 3 && articlesDeLaLigne(lot[0])[0].titre === 'Article 1', 'une commande Vinted de 3 articles compte 3 ventes (règle du 17/10)');
const m9 = messageRafale({ id: 42, articles: neuf }, 'fr');
ok(m9.titre === "🎉 9 ventes d'un coup" && m9.corps === '« Article 0 », « Article 1 » et 7 autres' && m9.donnees.type === 'vente' && m9.donnees.note_id === '42' && m9.donnees.recap === '1',
  `push FR : « ${m9.titre} » / « ${m9.corps} » (type vente : l'appui ouvre les ventes)`, JSON.stringify(m9));
const m9en = messageRafale({ id: 42, articles: neuf }, 'en');
ok(m9en.titre === '🎉 9 sales at once' && m9en.corps === '"Article 0", "Article 1" and 7 more', `push EN : « ${m9en.titre} » / « ${m9en.corps} »`);
const m3 = messageRafale({ id: 1, articles: [L(1, { titre: 'x'.repeat(80) }), L(2), L(3)] }, 'fr');
ok(m3.corps.length <= 178 && /…/.test(m3.corps) && /et 1 autre$/.test(m3.corps), `push : titres coupés, « et 1 autre » au singulier (${m3.corps})`);
const mails = lire(MAILS);
const fRafale = mails.slice(mails.indexOf('export function mailRafale('), mails.indexOf('export function mailVentes('));
ok(/`\$\{n\} ventes d'un coup sur ton compte 🎉`/.test(fRafale) && /`\$\{n\} sales at once on your account 🎉`/.test(fRafale), "objet : « N ventes d'un coup sur ton compte 🎉 » (EN traduit)");
ok(/listePuces\(lignes\)/.test(fRafale) && /if \(!prixVenteConnu\(v\)\)/.test(fRafale) && /\(à confirmer\)/.test(fRafale) && /de bénéfice/.test(fRafale) && /preheader:/.test(fRafale) && /raisonEnvoi:/.test(fRafale),
  'le mail : la liste (titre, plateforme, prix si connu — jamais « 0 € » —, bénéfice si le prix d\'achat est connu, « à confirmer »), préheader, raison d\'envoi');
ok(/Salut,/.test(fRafale) && !/\bvous\b/i.test(fRafale.replace(/\/\/.*$/gm, '')), 'tutoiement (même ton que le mail de vente), signature par le gabarit commun (mail())');

console.log('\n8. La preuve et le selftest de la règle du 05/11 suivent le même texte');
const preuve = lire(PREUVE);
ok(preuve.includes(MIGRATION) && preuve.includes(INVERSE), `${PREUVE} joue cette migration et son INVERSE`);
ok([...Object.values(MD5_PROD), ...Object.values(MD5_MIGRATION)].every((m5) => preuve.includes(m5)), `${PREUVE} vérifie les mêmes md5 (prod et migration)`);
ok(/PREUVE_PG[\s\S]{0,200}supabase\\\.\(co\|com\)/.test(preuve), `${PREUVE} refuse toute base Supabase (jamais la prod)`);
ok(/vente_notification_ecartee/.test(lire('scripts/mail-a-chaque-vente-selftest.mjs')), 'selftest mail-a-chaque-vente : la parade accepte la trace (et seulement elle) avant son return');

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
