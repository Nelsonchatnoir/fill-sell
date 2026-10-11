// selftest:vente-signalee-une-fois — une annonce vendue ne se signale qu'une
// fois, et la décision « remettre en vente ou non » se prend dans l'app, avec
// ou sans téléphone (11/10, cas Louis ; migration 20261011100000).
//
//   npm run selftest:vente-signalee-une-fois            contrôles du dépôt (hors ligne)
//   npm run selftest:vente-signalee-une-fois -- --prod  + preuve en prod dans une
//        transaction ANNULÉE (scripts/preuves/preuve-vente-signalee-une-fois.mjs) :
//        vraies notes de Louis, eBay multi-exemplaires, Leboncoin, compte avec
//        téléphone, vente à l'unité — aucun mail, aucun push, aucune ligne gardée.
//
// Contrôles hors ligne :
//   1. la règle (push_vente_deja_signalee) : reçu de la vente AVANT le signal,
//      même commande, même annonce, SANS fenêtre de temps ; eBay jamais sur
//      l'annonce ; Leboncoin : deux commandes différentes = deux ventes ;
//   2. elle s'applique à la naissance de la note (push_noter, ni appel
//      push-ventes) ET avant tout envoi (push_ventes_a_envoyer) ; la fenêtre
//      de 3 jours ne reste que pour le job et la fiche ; les autres règles
//      (ignoree, signal_dementi, vente_non_enregistree, rafale) inchangées ;
//   3. la liste (ventes_a_decider) exclut ce qui est traité et ce que le
//      bandeau d'un job porte déjà ; « ne pas remettre » passe par la MÊME
//      déclaration (enregistrer_vente_declaree → atomique) et ferme la remise ;
//   4. l'app lit la liste avec le reste (jamais en boucle), décide par
//      check-listing-status, et le lien du mail y mène ;
//   5. l'inverse rend les définitions d'avant.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261011100000_vente_signalee_une_fois_et_ventes_a_decider.sql');
const INV = lire('scripts/reparations/20261011_inverse_vente_signalee_une_fois.sql');
const APP = lire('src/App.jsx');
const LISTE = lire('src/components/VentesADecider.jsx');
const MAIL = lire('supabase/functions/_shared/emails-fillsell.ts');
const PUSH = lire('supabase/functions/push-ventes/index.ts');
const ORCH = lire('supabase/functions/_shared/sale-orchestration.ts');
const CLS = lire('supabase/functions/check-listing-status/index.ts');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const fonction = (txt, nom) => {
  const i = txt.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nom}\\(`));
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10);
};

// 1. La règle
const regle = fonction(MIG, 'push_vente_deja_signalee');
ok(regle.length > 0, '1a. push_vente_deja_signalee définie');
ok(/k not like 'annonce:ebay:%'/.test(regle), "1b. eBay : l'annonce n'identifie jamais la vente (commande seule)");
ok(/from public\.ventes_operations o[\s\S]*o\.cle = any \(v_ann\) and o\.cree_le < p_avant/.test(regle),
  '1c. reçu ventes_operations de l\'annonce posé AVANT le signal → déjà enregistrée');
ok(!/interval/.test(regle), '1d. aucune fenêtre de temps dans la règle');
ok(/o\.cles && v_cmd/.test(regle) && /o\.cles && v_ann/.test(regle), '1e. même commande / même annonce déjà annoncée ou déclarée');
ok(/v_unite := coalesce\(v_pf in \('vinted', 'beebs', 'opla', 'depop'\)/.test(regle)
  && /or o\.cles && v_cmd\)\) then/.test(regle), '1f. Leboncoin : deux commandes lues différentes sur une annonce = deux ventes');
ok(/o\.part_le is not null or o\.statut in \('envoyee', 'en_envoi', 'declaree'\)/.test(regle), '1g. « annoncée » = push ou mail parti, ou vente déclarée');

// 2. Où elle s'applique
const noter = fonction(MIG, 'push_noter');
ok(/v_motif := public\.push_vente_deja_signalee\(p_user, v_pf, v_cles, now\(\), null, false\)/.test(noter), '2a. push_noter : la règle à la naissance de la note');
ok(/when v_motif is not null then 'doublon'/.test(noter) && /if not p_declaree and v_motif is null and coalesce\(current_setting\('fillsell\.push_relance'/.test(noter),
  '2b. note née doublon : aucun appel push-ventes');
const ave = fonction(MIG, 'push_ventes_a_envoyer');
ok(/v_motif := public\.push_vente_deja_signalee\(v_user, r\.plateforme, v_cles, r\.cree_le, r\.id, false\)/.test(ave), '2c. décision : la règle avant tout envoi (push ET mail)');
ok(/o\.cree_le > now\(\) - interval '3 days'\s*\n\s*and o\.cles && array\(select k from unnest\(v_cles\) k where k like 'job:%' or k like 'fiche:%'\)/.test(ave),
  '2d. la fenêtre de 3 jours ne reste que pour le job et la fiche');
ok(!/and o\.cles && v_cles\) then/.test(ave), "2e. plus aucun rapprochement sur toutes les clés à 3 jours (l'annonce eBay en sortait doublon)");
const aveProd = fonction(INV, 'push_ventes_a_envoyer');
for (const regleInchangee of ["motif = 'vente_non_enregistree'", "motif = 'trop_tard'", "motif = 'signal_dementi'", "motif = 'rattrapage_de_masse'",
  "if r.origine = 'job' and r.job_id is not null and not public.push_vente_enregistree(r.job_id) then"]) {
  ok(ave.includes(regleInchangee) && aveProd.includes(regleInchangee), `2f. règle inchangée : ${regleInchangee.slice(0, 60)}`);
}
ok((ave.match(/'a_decider'/g) ?? []).length === 2, '2g. « à confirmer » rendu au mail (décision et relance)');

// 3. La liste et la décision
const liste = fonction(MIG, 'ventes_a_decider');
ok(/v_user uuid := auth\.uid\(\)/.test(liste) && /GRANT EXECUTE ON FUNCTION public\.ventes_a_decider\(\) TO authenticated/.test(MIG),
  '3a. ventes_a_decider : le compte connecté seulement');
ok(/p\.part_le is not null/.test(liste) && /p\.vente_id is null/.test(liste), '3b. ventes annoncées (push ou mail), non enregistrées — avec ou sans téléphone');
ok(!/appareils_push/.test(liste), '3c. la liste ne dépend pas d\'un téléphone');
ok(/not exists \(select 1 from public\.ventes_operations o/.test(liste) && /d\.statut = 'declaree'/.test(liste)
  && /i\.statut <> 'vendu'/.test(liste) && /j\.status = 'published'/.test(liste), '3d. jamais une vente traitée (reçu, déclarée, fiche vendue, job vendu)');
ok(/sale_signal' is null/.test(liste) && /unavailable_since' is null/.test(liste), '3e. jamais ce que le bandeau « Vendue ? » d\'un job porte déjà');
ok(/s\.status = 'sold'/.test(liste) && /statut_plateforme = 'vendue'/.test(liste), '3f. toujours vendue au dernier relevé de la plateforme');
ok(/limit 100/.test(liste) && /statement_timeout TO '5s'/.test(liste), '3g. bornée (100 lignes, 5 s)');
const decl = fonction(MIG, 'enregistrer_vente_declaree');
ok(/p_remettre_en_vente boolean DEFAULT true/.test(decl) && /enregistrer_vente_atomique\(p_user := p_user, p_cle := null, p_job := p_job, p_prix := p_prix\)/.test(decl),
  '3h. même déclaration, un paramètre de plus (défaut : remettre, comme avant)');
ok(/DROP FUNCTION IF EXISTS public\.enregistrer_vente_declaree\(uuid, uuid, numeric\);/.test(MIG)
  && /GRANT EXECUTE ON FUNCTION public\.enregistrer_vente_declaree\(uuid, uuid, numeric, boolean\) TO service_role/.test(MIG)
  && /REVOKE ALL ON FUNCTION public\.enregistrer_vente_declaree\(uuid, uuid, numeric, boolean\) FROM PUBLIC, anon, authenticated/.test(MIG),
  '3i. droits rendus à l\'identique (service seulement)');
const remise = fonction(MIG, 'cross_post_jobs_vendu_remise_en_vente');
ok(/'abandonnee', 'choix_personne'/.test(remise) && /fillsell\.remise_en_vente_refusee/.test(remise), '3j. « Ne pas remettre » : la remise naît close (choix_personne)');
ok(/opts\?\.remettreEnVente === false \? \{ p_remettre_en_vente: false \} : \{\}/.test(ORCH), '3k. orchestrateSale : le paramètre ne part que pour « ne pas remettre »');
ok(/body\.remettre_en_vente === false \? false : undefined/.test(CLS), '3l. check-listing-status : remettre_en_vente optionnel, défaut d\'avant');

// 4. L'app et le mail
ok(/supabase\.rpc\('ventes_a_decider'\)/.test(APP), '4a. l\'app lit la liste (rpc ventes_a_decider)');
ok(!/setInterval\([^)]*ventes_a_decider/.test(APP) && (APP.match(/rpc\('ventes_a_decider'\)/g) ?? []).length === 1, '4b. une seule lecture, avec le reste (jamais en boucle)');
ok(/functions\.invoke\('check-listing-status',\{body:\{job_id:v\.job_id,price:prix,remettre_en_vente:remettre!==false\}\}\)/.test(APP),
  '4c. la décision passe par check-listing-status (même chemin que « Vendue ? »)');
ok(/<VentesADecider [^>]*ventes=\{ventesADecider\}/.test(APP), '4d. la liste est rendue dans la zone des bandeaux');
ok(/get\('ventes'\)==='a-decider'/.test(APP) && /ANCRE_VENTES_A_CONFIRMER/.test(APP), '4e. le lien du mail ouvre le Stock sur la liste');
ok(/if \(!Array\.isArray\(ventes\) \|\| ventes\.length === 0\) return null;/.test(LISTE), '4f. rien à confirmer ⇒ rien d\'affiché');
ok(/Remettre en vente sur/.test(LISTE) && /Ne pas remettre/.test(LISTE), '4g. les deux choix sont proposés quand il reste du stock');
ok(/URL_VENTES_A_CONFIRMER = `\$\{URL_APP\}\/app\?ventes=a-decider`/.test(MAIL) && /boutonPrincipal\([\s\S]{0,200}URL_VENTES_A_CONFIRMER\)/.test(MAIL),
  '4h. le bouton du mail « Vendu » mène à la liste');
ok(/aConfirmer: n\.a_decider === true/.test(PUSH), '4i. push-ventes : « à confirmer » transmis au mail');
const routes = lire('scripts/site/routes-app.mjs');
ok(/source: '\/app'/.test(routes), '4j. /app est une route servie (le paramètre ne crée aucune route)');

// 5. L'inverse
ok(/CREATE FUNCTION public\.enregistrer_vente_declaree\(p_user uuid, p_job uuid, p_prix numeric DEFAULT NULL::numeric\)/.test(INV)
  && /DROP FUNCTION IF EXISTS public\.ventes_a_decider\(\);/.test(INV)
  && /DROP FUNCTION IF EXISTS public\.push_vente_deja_signalee/.test(INV)
  && /o\.cree_le > now\(\) - interval '3 days'\s*\n\s*and o\.cles && v_cles\) then/.test(aveProd),
  '5. l\'inverse rend les définitions d\'avant (fenêtre de 3 jours sur toutes les clés)');

if (process.argv.includes('--prod')) {
  const r = spawnSync('node', ['scripts/preuves/preuve-vente-signalee-une-fois.mjs'], { cwd: RACINE, encoding: 'utf8', shell: true });
  process.stdout.write(r.stdout ?? '');
  ok(r.status === 0, 'P. preuve en prod (transaction annulée)');
}

console.log(`\n${echecs === 0 ? '✓' : '✗'} selftest:vente-signalee-une-fois — ${total - echecs}/${total}`);
process.exit(echecs === 0 ? 0 : 1);
