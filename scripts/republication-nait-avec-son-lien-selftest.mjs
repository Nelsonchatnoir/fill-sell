// selftest:republication-nait-avec-son-lien — (17/10, Amiral 317adae1, mission de
// Nico) une republication naît avec le lien EXACT de son annonce et une copie de
// dépôt qui désigne la même annonce ; sinon refus 'lien_annonce_incertain', avant
// tout décompte. La copie d'une republication hors Vinted n'est JAMAIS retirée.
// Lit la migration 20261017110000, son inverse, son essai à blanc et la réparation
// du cas : aucun réseau, aucune base.
// Option --prod : relit en prod (lecture seule) les trois définitions et échoue si
// la migration n'y est pas.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const chemin = (p) => new URL(`../${p}`, import.meta.url);
const lire = (p) => readFileSync(chemin(p), 'utf8').split('\r\n').join('\n');
const MIG = 'supabase/migrations/20261017110000_republication_nait_avec_son_lien.sql';
const INV = 'supabase/rollbacks/20261017110000_republication_nait_avec_son_lien.sql';
const ESSAI = 'scripts/essais/20261017110000_essai.sql';
const REPA = 'scripts/reparations/20261017_copie_republication_reconstruite.sql';
const REPA_INV = 'scripts/reparations/20261017_copie_republication_reconstruite_INVERSE.sql';
for (const p of [MIG, INV, ESSAI, REPA, REPA_INV]) ok(existsSync(chemin(p)), `fichier présent : ${p}`);
const mig = lire(MIG); const inv = lire(INV); const essai = lire(ESSAI); const repa = lire(REPA);

// Les définitions CREATE OR REPLACE FUNCTION d'un fichier, par nom.
function definitions(src) {
  const m = new Map(); const FIN = '$function$';
  let i = 0;
  for (;;) {
    const d = src.indexOf('CREATE OR REPLACE FUNCTION public.', i);
    if (d < 0) break;
    const corps = src.indexOf('AS $function$', d);
    const f = src.indexOf(FIN, corps + 'AS $function$'.length);
    const def = src.slice(d, f + FIN.length);
    m.set(def.slice('CREATE OR REPLACE FUNCTION public.'.length, def.indexOf('(')), def);
    i = f + FIN.length;
  }
  return m;
}
const nouv = definitions(mig); const anc = definitions(inv); const ess = definitions(essai);
const NOMS = ['spend_coins_and_republish', 'republish_planifiee_sweep', 'annonce_partagee_reprendre'];
for (const nom of NOMS) ok(nouv.has(nom) && anc.has(nom), `migration et inverse portent ${nom}`);
const spend = nouv.get('spend_coins_and_republish') ?? '';
const sweep = nouv.get('republish_planifiee_sweep') ?? '';
const rep = nouv.get('annonce_partagee_reprendre') ?? '';

// 1. Le modèle de la règle de naissance (miroir du SQL), sur les cas réels.
const idDuLien = (url) => String(url ?? '').match(/\/ad\/[^/]+\/(\d+)(?:[-/?#]|$)/)?.[1] ?? null;
function naissance({ source, annonces = [], fichesDesignant = 1 }) {
  const pid = String(source.platform_listing_id ?? '').trim() || null;
  const lid = pid ?? idDuLien(source.listing_url);
  let url = String(source.listing_url ?? '').trim() || null;
  if (pid && idDuLien(url) && idDuLien(url) !== lid) url = annonces.find((a) => a.listing_id === lid && a.url)?.url ?? null;
  if (!url) return { refus: 'lien_annonce_incertain', cause: 'lien_inconnu' };
  if (lid && fichesDesignant > 1) return { refus: 'lien_annonce_incertain', cause: 'annonce_partagee' };
  return { lien: url, copie: { listing_url: url, platform_listing_id: pid } };
}
const LBC = (id) => `https://www.leboncoin.fr/ad/electromenager/${id}`;
// Amiral, 15/10 14:54 : dépôt 7fe6a7b3 au lien d'une AUTRE annonce, numéro rendu au dépôt.
const amiral = { listing_url: LBC('3275975415'), platform_listing_id: '3276310850' };
const n1 = naissance({ source: amiral, annonces: [{ listing_id: '3276310850', url: LBC('3276310850') }] });
ok(n1.lien === LBC('3276310850') && n1.copie.listing_url === n1.lien && n1.copie.platform_listing_id === '3276310850',
  'Amiral : le lien suit le numéro (…850), la copie dit la MÊME annonce que le job');
ok(naissance({ source: amiral }).refus === 'lien_annonce_incertain' && naissance({ source: amiral }).cause === 'lien_inconnu',
  'lien du numéro inconnu du relevé : refus, jamais un job sans lien');
ok(naissance({ source: { listing_url: LBC('3276310850'), platform_listing_id: '3276310850' }, fichesDesignant: 2 }).cause === 'annonce_partagee',
  'annonce désignée par deux fiches (l’état d’Amiral) : refus, la cascade tranche d’abord');
const coherent = naissance({ source: { listing_url: LBC('3288693323'), platform_listing_id: '3288693323' } });
ok(coherent.lien === LBC('3288693323') && coherent.copie.platform_listing_id === '3288693323', 'dépôt cohérent : rien ne change');
const sansNumero = naissance({ source: { listing_url: LBC('3288693323'), platform_listing_id: null } });
ok(sansNumero.lien === LBC('3288693323') && sansNumero.copie.platform_listing_id === null, 'dépôt sans numéro : son lien, comme avant');
ok(naissance({ source: { listing_url: null, platform_listing_id: '3288693323' } }).cause === 'lien_inconnu', 'dépôt sans lien : refus');

// 2. La migration fait ce que dit le modèle.
ok(spend.includes("v_lid := COALESCE(NULLIF(btrim(v_src.platform_listing_id), ''), annonce_id_job(v_platform, v_src.listing_url));"),
  'spend : le numéro fait foi, sinon celui du lien');
ok(/IF NULLIF\(btrim\(v_src\.platform_listing_id\), ''\) IS NOT NULL AND annonce_id_job\(v_platform, v_url\) IS NOT NULL\s+AND annonce_id_job\(v_platform, v_url\) <> v_lid THEN/.test(spend),
  'spend : le lien ne change que s’il contredit le numéro (doctrine du déclencheur)');
ok(/FROM annonces_plateforme a\s+WHERE a\.user_id = v_user AND a\.platform = v_platform AND a\.listing_id = v_lid/.test(spend),
  'spend : le lien de CE numéro vient du relevé');
ok(!/lbc_depot,adsubmit/.test(spend), 'spend : aucun arbitrage nouveau sur lbc_depot (7 dépôts contradictoires laissés à la décision de Nico)');
ok(spend.includes("'reason', 'lien_annonce_incertain', 'cause', 'lien_inconnu'") && spend.includes("'reason', 'lien_annonce_incertain', 'cause', 'annonce_partagee'"),
  'spend : deux refus nommés');
const avant = (a, b) => spend.indexOf(a) >= 0 && spend.indexOf(b) >= 0 && spend.indexOf(a) < spend.indexOf(b);
for (const [repere, nom] of [["key = 'price_republish'", 'la lecture du prix'], ['UPDATE coin_wallets SET', 'le débit'],
  ['INSERT INTO coin_ledger', 'le mouvement d’unités'], ['INSERT INTO usage_logs', 'le journal'],
  ['INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,\n                                 title, description', 'la création du job']]) {
  ok(avant("'cause', 'annonce_partagee'", repere) && avant("'cause', 'lien_inconnu'", repere), `spend : le refus passe avant ${nom}`);
}
ok(spend.includes('      v_url, v_src.platform_listing_id,\n') && spend.includes("          'listing_url', v_url,\n          'platform_listing_id', v_src.platform_listing_id,\n"),
  'spend : la colonne ET la copie portent le même lien ; le numéro reste celui du dépôt');
ok(spend.includes('RETURNING id, listing_url INTO v_job_id, v_url_ins;') && /IF v_url_ins IS DISTINCT FROM v_url THEN\s+RAISE EXCEPTION 'lien_annonce_incertain/.test(spend),
  'spend : filet après l’INSERT, tout est annulé si la ligne née ne porte pas le lien de sa copie');
ok(spend.includes("      'https://www.vinted.fr/items/' || v_item,\n") && spend.includes('    ) RETURNING id INTO v_job_id;\n  ELSE\n'),
  'spend : la branche Vinted est intacte');
const messages = [...spend.matchAll(/'message', ('Republication pas lancée[^;]*?)\);/gs)].map((m) => m[1]);
ok(messages.length === 2, 'spend : deux messages de refus');
ok(messages.every((m) => !/\d+\s*(?:s|sec|min|minutes?|h|heures?|jours?)\b|bientôt|quelques|demain|tout à l'heure/i.test(m)),
  'spend : aucun temps estimé dans les messages');
ok(messages.some((m) => /Synchroniser/.test(m)) && messages.every((m) => /Rien n''a été décompté/.test(m)), 'spend : chaque refus dit ce qui fera repartir, rien décompté');

// 3. Le balayage et la reprise.
ok(sweep.includes("'article_sans_photo', 'article_vendu', 'annonce_introuvable', 'lien_annonce_incertain') THEN"),
  'balayage : lien_annonce_incertain est un refus d’ARTICLE (le créneau continue)');
const vinted = rep.slice(rep.indexOf("IF j.platform = 'vinted' THEN"), rep.indexOf("ELSIF NULLIF(btrim(j.listing_url), '') IS NOT NULL"));
const autres = rep.slice(rep.indexOf("ELSIF NULLIF(btrim(j.listing_url), '') IS NOT NULL"));
ok(/- 'republish_snapshot'/.test(vinted) && !/- 'republish_snapshot'/.test(autres) && /'realignee'/.test(autres),
  'reprise : Vinted recapture (inchangé) ; hors Vinted la copie est réalignée, jamais retirée');
ok(/'issue', 'clos_lien_incertain'/.test(autres), 'reprise : hors Vinted sans lien exact, arrêtée (rien retiré)');

// 4. Garde md5, inverse mot pour mot, essai à blanc, réparation.
const md5s = [...mig.matchAll(/\["([a-z_]+\([^)]*\))","([0-9a-f]{32})"\]/g)];
ok(md5s.length === 3 && NOMS.every((nom) => md5s.some((m) => m[1].startsWith(nom + '('))), 'migration : garde md5 sur les trois définitions de prod');
ok(md5s.every((m) => inv.includes(m[2])), 'inverse : il nomme les md5 des corps d’avant');
ok(/^BEGIN;$/m.test(mig) && /^COMMIT;$/m.test(mig) && /FEU VERT NOMMÉ DE NICO REQUIS/.test(mig), 'migration : une transaction, feu vert de Nico requis');
for (const nom of NOMS) {
  ok(!anc.get(nom).includes('lien_annonce_incertain') && !anc.get(nom).includes("'realignee'"), `inverse : ${nom} est le corps d’AVANT`);
  ok(ess.get(nom) === nouv.get(nom), `essai : ${nom} est, octet pour octet, celui de la migration`);
}
ok(anc.get('spend_coins_and_republish').includes('      v_src.listing_url, v_src.platform_listing_id,\n'), 'inverse : la création d’avant');
ok(/^BEGIN;$/m.test(essai) && /\nROLLBACK;\n$/.test(essai) && !/^COMMIT;$/m.test(essai), 'essai : une transaction ANNULÉE (ROLLBACK final, aucun COMMIT)');
for (const cas of ['A1', 'A2', 'A3', 'A4', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']) ok(essai.includes(`'${cas} `), `essai : contrôle ${cas}`);
ok(/f44b5917-bccc-4431-ba41-f40571a2ed18/.test(essai) && /\[ESSAI 17\/10\]/.test(essai) && /999/.test(essai), 'essai : données d’essai sur le compte de Nico, à 999 €');
ok(/create table if not exists public\._backup_1710_copie_reconstruite/.test(repa) && /^begin;$/m.test(repa) && /^commit;$/m.test(repa),
  'réparation : sauvegarde, une transaction');
ok(/j\.platform in \('leboncoin', 'beebs', 'depop'\)/.test(repa) && /recapture_annonce_partagee/.test(repa) && /deleted_at' is null/.test(repa)
  && /statut_plateforme = 'en_ligne' and a\.disparu_le is null/.test(repa) && /\) = 1;/.test(repa),
  'réparation : par la règle (hors Vinted, copie retirée par la recapture, rien retiré, annonce en ligne d’une seule fiche)');

// 5. --prod : la migration est-elle appliquée ? (lecture seule)
if (process.argv.includes('--prod')) {
  const sql = "select string_agg(p.proname || '=' || (pg_get_functiondef(p.oid) like '%lien_annonce_incertain%')::text, ',' order by p.proname) as etat "
    + "from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('spend_coins_and_republish','republish_planifiee_sweep')";
  const sortie = execSync(`npx supabase db query --linked "${sql}"`, { encoding: 'utf8' });
  const etat = JSON.parse(sortie.slice(sortie.indexOf('{'))).rows?.[0]?.etat ?? '';
  ok(etat === 'republish_planifiee_sweep=true,spend_coins_and_republish=true', `prod : migration appliquée (${etat || 'illisible'})`);
}

console.log(`✓ selftest:republication-nait-avec-son-lien — ${n} assertions`);
