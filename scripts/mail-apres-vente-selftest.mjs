// selftest:mail-apres-vente — le mail « vendu » APRÈS la vente, jamais avant ni
// sans (09/10, cas Bebertdeals ; migration 20261009160000).
//
//   npm run selftest:mail-apres-vente            contrôles du dépôt (hors ligne)
//   npm run selftest:mail-apres-vente -- --prod  + preuve en prod dans une
//        transaction ANNULÉE (scripts/push/preuve-mail-apres-vente.mjs) :
//        aucun mail, aucune ligne gardée.
//
// Contrôles hors ligne :
//   1. la décision des notes de la migration = la définition EN PROD lue le
//      09/10 (copie de l'inverse) + exactement les trois blocs « (09/10) » ;
//   2. une note de JOB n'est décidée qu'une fois sa vente ENREGISTRÉE
//      (push_vente_enregistree), attend 24 h au plus, ne bloque pas les autres
//      comptes (sélection) ; les autres origines gardent la règle des 2 h ;
//   3. le déclencheur de preuve ne vise que Vinted, la transition vers
//      « sold », sans preuve déjà posée ; il exige la lecture (last_checked_at)
//      et le signal au même instant et le numéro du lien = celui du job ;
//   4. l'inverse remet la définition d'avant et retire push_vente_enregistree, sans
//      toucher à la preuve de page (20261009130000).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = readFileSync(path.join(RACINE, 'supabase/migrations/20261009160000_mail_apres_la_vente.sql'), 'utf8');
const INV = readFileSync(path.join(RACINE, 'scripts/reparations/20261009_inverse_mail_apres_la_vente.sql'), 'utf8');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };

const fonction = (txt, nom) => {
  const i = txt.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return null;
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? null : txt.slice(i, j + 10);
};
const fNouvelle = fonction(MIG, 'push_ventes_a_envoyer');
const fProd = fonction(INV, 'push_ventes_a_envoyer');
ok(fNouvelle && fProd, 'la décision des notes est présente dans la migration et dans l\'inverse');

// 1. Partie de la prod : retirer les trois blocs (09/10) redonne la prod à l'octet.
if (fNouvelle && fProd) {
  const ramenee = fNouvelle
    .replace(/  -- \(09\/10, Bebertdeals\) Une note de JOB attend[\s\S]*?cree_le < now\(\) - interval '24 hours';\n/, '')
    .replace("  -- Une note jamais décidée en 2 h n'apprend plus rien à personne (hors notes\n  -- de job : elles attendent leur vente, ci-dessus).\n",
      "  -- Une note jamais décidée en 2 h n'apprend plus rien à personne.\n")
    .replace("cree_le < now() - interval '2 hours'\n     and origine is distinct from 'job';", "cree_le < now() - interval '2 hours';")
    .replace(/\n         -- \(09\/10\) une note de job qui attend sa vente[\s\S]*?public\.push_vente_enregistree\(p\.job_id\)\)/, '')
    .replace(/\n      -- \(09\/10, Bebertdeals\) LE MAIL APRÈS LA VENTE[\s\S]*?not public\.push_vente_enregistree\(r\.job_id\) then\n        continue;\n      end if;/, '');
  ok(ramenee === fProd, '1. décision = définition EN PROD du 09/10 + les seuls trois blocs (09/10)');
}

// 2. La règle du mail.
ok(/if r\.origine = 'job' and r\.job_id is not null and not public\.push_vente_enregistree\(r\.job_id\) then\s+continue;/.test(fNouvelle ?? ''),
  '2a. note de job : décidée seulement si la vente est ENREGISTRÉE');
ok((fNouvelle ?? '').indexOf('signal_dementi') < (fNouvelle ?? '').indexOf('push_vente_enregistree(r.job_id)'),
  '2b. un signal démenti reste ignoré d\'abord (ordre gardé)');
ok((fNouvelle ?? '').indexOf("statut = 'doublon'") > 0
  && (fNouvelle ?? '').indexOf("statut = 'doublon'") < (fNouvelle ?? '').indexOf('push_vente_enregistree(r.job_id)'),
  '2b2. vente déjà annoncée ou confirmée par la personne → doublon AVANT toute attente');
ok(/motif = 'vente_non_enregistree'[\s\S]{0,200}origine = 'job' and cree_le < now\(\) - interval '24 hours'/.test(fNouvelle ?? ''),
  '2c. attente bornée : 24 h, puis close sans rien envoyer');
ok(/cree_le < now\(\) - interval '2 hours'\s+and origine is distinct from 'job';/.test(fNouvelle ?? ''),
  '2d. les autres origines gardent la règle des 2 h');
ok(/p\.cree_le > now\(\) - interval '5 minutes' or public\.push_vente_enregistree\(p\.job_id\)/.test(fNouvelle ?? ''),
  '2e. une note qui attend ne prend pas la place des autres comptes (sélection)');
const fEnr = fonction(MIG, 'push_vente_enregistree') ?? '';
ok(/jj\.status = 'sold'/.test(fEnr) && /ventes_operations/.test(fEnr) && /vente_operation_cle/.test(fEnr) && /STABLE SECURITY DEFINER/.test(fEnr),
  '2f. « enregistrée » = job vendu + reçu de vente (ventes_operations) ou vente liée à l\'annonce');
ok(/REVOKE ALL ON FUNCTION public\.push_vente_enregistree\(uuid\) FROM PUBLIC, anon, authenticated;/.test(MIG),
  '2g. push_vente_enregistree fermée aux clients');

// 3. Le déclencheur de preuve.
const decl = (MIG.match(/-- <declencheur>([\s\S]*?)-- <\/declencheur>/) ?? [])[1] ?? '';
ok(/BEFORE UPDATE OF platform_fields ON public\.cross_post_jobs/.test(decl), '3a. déclencheur AVANT écriture, sur platform_fields');
ok(/new\.platform = 'vinted'/.test(decl) && /\(new\.platform_fields ->> 'sale_signal'\) = 'sold'/.test(decl)
  && /\(old\.platform_fields ->> 'sale_signal'\) IS DISTINCT FROM 'sold'/.test(decl) && /NOT \(new\.platform_fields \? 'sale_evidence'\)/.test(decl),
  '3b. Vinted seulement, transition vers « sold », jamais une preuve écrasée');
const fPreuve = fonction(MIG, 'vinted_preuve_page_veilleur') ?? '';
ok(/new\.last_checked_at is not distinct from old\.last_checked_at then return new/.test(fPreuve), '3c. sans lecture de page (synchro du dressing) → aucune preuve');
ok(/abs\(extract\(epoch from \(new\.last_checked_at - v_sig\)\)\) > 2 then return new/.test(fPreuve), '3d. lecture et signal au même instant (2 s) exigés');
ok(/substring\(new\.listing_url from '\/items\/\(\[0-9\]\+\)'\), ''\) <> v_id then return new/.test(fPreuve), '3e. la page lue est celle du numéro du job');
ok(/'exact', true/.test(fPreuve) && /'source', 'page_annonce_veilleur'/.test(fPreuve), '3f. preuve exacte, source nommée');

// 4. L'inverse.
// (09/10, application) Le déclencheur de preuve et sa fonction appartiennent à
// 20261009130000 (appliquée à part, son inverse est 20261009_inverse_vinted_preuve_page.sql) :
// défaire le mail après la vente ne doit JAMAIS retirer la preuve de page.
ok(!/DROP TRIGGER[^;]*cross_post_jobs_vinted_preuve_page/.test(INV)
  && !/DROP FUNCTION[^;]*vinted_preuve_page_veilleur/.test(INV)
  && INV.indexOf('DROP FUNCTION IF EXISTS public.push_vente_enregistree(uuid)') > INV.indexOf('CREATE OR REPLACE FUNCTION public.push_ventes_a_envoyer('),
  '4. inverse : décision d\'avant remise AVANT de retirer son aide, preuve de page (130000) laissée en place');
ok(!/push_vente_enregistree/.test(fProd ?? 'x'), '4b. la décision d\'avant ne connaît pas push_vente_enregistree');

if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/push/preuve-mail-apres-vente.mjs', '--avec-migration=20261009160000'], { cwd: RACINE, encoding: 'utf8', shell: true });
  process.stdout.write(r.stdout ?? '');
  ok(r.status === 0, 'PROD. preuve dans une transaction annulée (aucun mail, rien gardé)');
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
