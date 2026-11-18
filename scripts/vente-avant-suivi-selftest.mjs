// VERROU « AUCUN MAIL (NI PUSH) POUR UNE VENTE ANTÉRIEURE AU SUIVI » (18/11/2026, ordre de Nico, point 3A)
// `npm run selftest:vente-avant-suivi` — sans base : il lit le dépôt. Preuve de bout en bout (base jetable) :
// `npm run selftest:vente-avant-suivi-pg` (scripts/ventes/preuve-vente-avant-suivi.mjs).
// Cas : 30 jours de prod (18/11), 10 mails, 10 comptes, 29 ventes antérieures annoncées — 4e0a80fe (4e0a80fe) : vente eBay
// du 16/11 15:22, inscription 16/11 23:51, mail vente:13033 le 17/11 00:00:37. Rien ne lisait l'inscription ni le
// premier relevé : push_trg_ventes ne bornait que « vendu_le < 24 h », push_trg_job l'âge de la LECTURE de la preuve.
// Ce test CASSE si :
//   1. la migration ou son INVERSE manque, réécrit une autre fonction, écrit des données, touche un cron ;
//   2. l'INVERSE n'est plus la prod mot pour mot (md5 du 18/11) ;
//   3. push_noter / push_noter_commande_vinted s'écartent de la prod au-delà de la garde (lignes retirées / ajoutées) ;
//   4. la garde n'est plus appelée là où naissent les notes, ou plus dans un bloc de repli (une panne bloquerait un
//      mail), ou appelée pour une vente DÉCLARÉE ; une note avant_suivi n'est plus « ignoree » ;
//   5. vente_avant_suivi prend now() pour début, lit un titre, écrit quoi que ce soit, perd un motif, sort des index
//      (une ligne par table), ou s'ouvre à anon / authenticated.
import fs from 'node:fs';
import crypto from 'node:crypto';

let ko = 0, n = 0;
const ok = (c, nom, d = '') => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${String(d).slice(0, 700)}` : ''}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const md5 = (t) => crypto.createHash('md5').update(`${t}\n`).digest('hex');

const MIGRATION = 'supabase/migrations/20261118233000_vente_avant_suivi.sql';
const INVERSE = 'supabase/rollbacks/20261118233000_vente_avant_suivi_INVERSE.sql';
const PREUVE = 'scripts/ventes/preuve-vente-avant-suivi.mjs';
let mig = '', inv = '';
try { mig = lire(MIGRATION); } catch (e) { ok(false, `${MIGRATION} présente`, e.code ?? e.message); }
try { inv = lire(INVERSE); } catch (e) { ok(false, `${INVERSE} présente`, e.code ?? e.message); }
if (!mig || !inv) { console.log(`\n${n - ko}/${n} — ROUGE`); process.exit(1); }

// md5 des définitions de PROD relues le 18/11 (pg_get_functiondef, sans CR).
const MD5_PROD = { push_noter: '31f8991857f493e5ec277eb399689679', push_noter_commande_vinted: '2cf1bb10fe432f2b29a2677ec3b671cf' };

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

console.log('1. La migration et son INVERSE : ces trois fonctions, rien d\'autre');
const dMig = definitions(mig), dInv = definitions(inv);
ok(JSON.stringify([...dMig.keys()].sort()) === JSON.stringify(['push_noter', 'push_noter_commande_vinted', 'vente_avant_suivi']),
  'la migration définit vente_avant_suivi, push_noter, push_noter_commande_vinted — et aucune autre fonction', [...dMig.keys()].join(', '));
ok(JSON.stringify([...dInv.keys()].sort()) === JSON.stringify(['push_noter', 'push_noter_commande_vinted']),
  'l\'INVERSE rend push_noter et push_noter_commande_vinted', [...dInv.keys()].join(', '));
for (const [f, t, d, permis] of [
  [MIGRATION, mig, dMig, /^(setlock_timeout='3s'|BEGIN|COMMIT|REVOKEALLONFUNCTIONpublic\.vente_avant_suivi\(uuid,text,timestampwithtimezone,uuid\)FROMPUBLIC,anon,authenticated|GRANTEXECUTEONFUNCTIONpublic\.vente_avant_suivi\(uuid,text,timestampwithtimezone,uuid\)TOservice_role)$/],
  [INVERSE, inv, dInv, /^(setlock_timeout='3s'|BEGIN|COMMIT|DROPFUNCTIONIFEXISTSpublic\.vente_avant_suivi\(uuid,text,timestampwithtimezone,uuid\))$/],
]) {
  let reste = t;
  for (const x of [...d.values()].sort((a, b) => b.debut - a.debut)) reste = reste.slice(0, x.debut) + reste.slice(x.fin);
  const ordres = sansCommentaires(reste).split(';').map((s) => s.replace(/\s+/g, '')).filter(Boolean);
  const hors = ordres.filter((s) => !permis.test(s));
  ok(hors.length === 0, `${f.split('/').pop()} : hors des fonctions, seulement BEGIN / COMMIT / lock_timeout / droits (aucune donnée, aucun cron)`, hors.join(' | '));
}

console.log('2. L\'INVERSE = la prod du 18/11, mot pour mot');
for (const nom of Object.keys(MD5_PROD)) {
  const t = dInv.get(nom)?.texte ?? '';
  ok(md5(t) === MD5_PROD[nom], `INVERSE : ${nom} = pg_get_functiondef de prod (md5 ${MD5_PROD[nom]})`, md5(t));
}

console.log('3. push_noter et push_noter_commande_vinted : la prod + la garde, rien d\'autre');
const ATTENDU = {
  push_noter: {
    retirees: ["    case when p_declaree then 'declaree' when v_motif is not null then 'doublon' else 'a_envoyer' end,"],
    ajoutees: [
      "    -- (18/11/2026, ordre de Nico, point 3A) Une vente ANTÉRIEURE au début du suivi de sa plateforme (inscription,",
      "    -- premier relevé) est notée — c'est la trace — mais jamais annoncée : ni mail, ni push (statut « ignoree »,",
      "    -- motif avant_suivi:…). Une panne de la garde rend le comportement d'avant : jamais une vraie vente sans mail.",
      '    if v_motif is null then',
      '      begin',
      '        v_motif := public.vente_avant_suivi(p_user, v_pf, p_vendu_le, p_job);',
      '      exception when others then',
      '        v_motif := null;',
      '      end;',
      '    end if;',
      "    case when p_declaree then 'declaree' when v_motif like 'avant_suivi:%' then 'ignoree'",
      "         when v_motif is not null then 'doublon' else 'a_envoyer' end,",
    ],
  },
  push_noter_commande_vinted: {
    retirees: ["  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' ELSE 'doublon' END;"],
    ajoutees: [
      '  -- (18/11/2026, ordre de Nico, point 3A) Une commande ANTÉRIEURE au début du suivi : notée, jamais annoncée.',
      '  IF v_motif IS NULL THEN',
      '    BEGIN',
      "      v_motif := vente_avant_suivi(p_user, 'vinted', p_vendu_le, NULL);",
      '    EXCEPTION WHEN others THEN',
      '      v_motif := NULL;',
      '    END;',
      '  END IF;',
      "  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' WHEN v_motif LIKE 'avant_suivi:%' THEN 'ignoree' ELSE 'doublon' END;",
    ],
  },
};
for (const nom of Object.keys(ATTENDU)) {
  const { retirees, ajoutees } = diffLignes(dInv.get(nom)?.texte ?? '', dMig.get(nom)?.texte ?? '');
  ok(JSON.stringify(retirees) === JSON.stringify(ATTENDU[nom].retirees), `${nom} : seule la ligne du statut est retirée`, JSON.stringify(retirees));
  ok(JSON.stringify(ajoutees) === JSON.stringify(ATTENDU[nom].ajoutees), `${nom} : seules la garde et son statut « ignoree » sont ajoutés`, JSON.stringify(ajoutees));
}

console.log('4. La garde est là où naissent les notes, jamais pour une vente déclarée, jamais bloquante');
const noter = sansCommentaires(dMig.get('push_noter')?.corps ?? '');
const iDecl = noter.indexOf('if not p_declaree then');
const iGarde = noter.indexOf('public.vente_avant_suivi(p_user, v_pf, p_vendu_le, p_job)');
const iFin = noter.indexOf('end if;\n  end if;', iGarde);
ok(iDecl >= 0 && iGarde > iDecl && iFin > iGarde, 'push_noter : la garde est DANS « if not p_declaree » (une vente déclarée n\'est jamais tenue)');
ok(/if v_motif is null then\s+begin\s+v_motif := public\.vente_avant_suivi\([^)]*\);\s+exception when others then\s+v_motif := null;\s+end;/.test(noter),
  'push_noter : après le doublon seulement, dans un bloc de repli (panne = comportement d\'avant)');
ok(/if not p_declaree and v_motif is null and coalesce\(current_setting\('fillsell\.push_relance', true\), ''\) <> '1' then/.test(noter),
  'push_noter : l\'appel à push-ventes reste conditionné à « v_motif is null » (une note avant_suivi n\'appelle rien)');
const cmd = sansCommentaires(dMig.get('push_noter_commande_vinted')?.corps ?? '');
ok(/IF v_motif IS NULL THEN\s+BEGIN\s+v_motif := vente_avant_suivi\(p_user, 'vinted', p_vendu_le, NULL\);\s+EXCEPTION WHEN others THEN\s+v_motif := NULL;\s+END;\s+END IF;/.test(cmd),
  'push_noter_commande_vinted : la garde reçoit la date de la commande, dans un bloc de repli');
ok(/IF v_statut = 'a_envoyer' AND coalesce\(current_setting\('fillsell\.push_relance', true\), ''\) <> '1' THEN/.test(cmd),
  'push_noter_commande_vinted : l\'appel à push-ventes reste réservé aux notes « a_envoyer »');

console.log('5. vente_avant_suivi : la règle, bornée, en lecture seule');
const g = dMig.get('vente_avant_suivi');
const corps = sansCommentaires(g?.corps ?? '');
ok(/RETURNS text\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'\nAS \$function\$/.test(g?.texte ?? ''),
  'STABLE, SECURITY DEFINER, search_path fixé (forme de pg_get_functiondef)');
ok(!/\b(insert|update|delete|truncate|perform|net\.|set_config)\b/i.test(corps), 'aucune écriture, aucun appel réseau, aucun réglage');
ok(!/now\(\)|current_timestamp|clock_timestamp/i.test(corps), 'jamais now() : un compte sans relevé ne perd jamais ses mails');
ok(!/titre|title/i.test(corps), 'jamais un titre (numéro d\'annonce exact seulement)');
ok(/select p\.created_at into v_inscrit from public\.profiles p where p\.id = p_user;/.test(corps), 'l\'inscription : profiles par sa clé');
ok(/from public\.vinted_sync_runs r\s+where r\.user_id = p_user and r\.platform = v_pf and r\.started_at is not null\s+order by r\.started_at asc\s+limit 1;/.test(corps),
  'le PREMIER relevé de la plateforme : une ligne, index vinted_sync_runs_user_date (user_id, started_at)');
ok(/if v_premier is null and v_pf = 'ebay' then\s+select e\.connected_at into v_premier from public\.ebay_accounts e where e\.user_id = p_user and e\.revoked_at is null;/.test(corps),
  'à défaut de relevé : la connexion eBay (eBay seulement), par sa clé');
ok(/v_debut := greatest\(v_inscrit, coalesce\(v_premier, v_inscrit\)\);/.test(corps), 'début = le plus tard de l\'inscription et du premier relevé');
ok(/if p_vendu_le is null and p_job is null then return null; end if;/.test(corps), 'une note sans date ni job (veille, annonce) ne lit rien');
ok(/if p_vendu_le < v_debut then return 'avant_suivi:date'; end if;/.test(corps), 'motif avant_suivi:date (date de vente lue avant le début)');
ok(/where j\.id = p_job and j\.user_id = p_user;/.test(corps), 'la tâche : par sa clé, du même compte');
ok(/v_lu := public\._ts_ou_null\(v_pfj #>> '\{sale_evidence,rattrapage,premiere_lecture\}'\);\s+if v_lu is not null and v_fin is not null and v_lu <= v_fin then return 'avant_suivi:etat_initial'; end if;/.test(corps),
  'motif avant_suivi:etat_initial (état déjà lu au premier relevé)');
ok(/v\.user_id = p_user and v\.plateforme_code = v_pf and v\.annonce_id = v_annonce/.test(corps) && /w\.user_id = p_user and w\.plateforme_code = v_pf and w\.annonce_id = v_annonce/.test(corps),
  'la vente relevée : index ventes_annonce_idx (user_id, plateforme_code, annonce_id), numéro EXACT');
ok(/order_id/.test(corps) && /vente_commande_ebay,commande/.test(corps) && /return 'avant_suivi:vente_relevee';/.test(corps),
  'motif avant_suivi:vente_relevee, jamais quand la preuve porte SA commande (2e exemplaire)');
ok(/REVOKE ALL ON FUNCTION public\.vente_avant_suivi\(uuid, text, timestamp with time zone, uuid\) FROM PUBLIC, anon, authenticated;/.test(mig)
  && /GRANT EXECUTE ON FUNCTION public\.vente_avant_suivi\(uuid, text, timestamp with time zone, uuid\) TO service_role;/.test(mig),
  'ni anon ni authenticated ; service_role seulement (comme push_noter)');
ok(fs.existsSync(new URL(`../${PREUVE}`, import.meta.url)), `la preuve sur base jetable existe (${PREUVE})`);

console.log(`\n${n - ko}/${n} — ${ko ? 'ROUGE' : 'VERT'}`);
process.exit(ko ? 1 : 0);
