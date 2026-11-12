// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VERROU (12/11/2026, question 9 des offres Cloud, décision de Nico) — PENDANT L'ESSAI D'UNE FORMULE AVEC CLOUD, AUCUN
// CRÉDIT MENSUEL HORS PAIEMENT                                              `npm run selftest:essai-formule-credit`
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Le défaut : l'essai de 7 jours d'une formule (Premium + Cloud, Pro + Cloud) pose les drapeaux du palier sans paiement ;
// le balayage quotidien grant_monthly_coins_sweep les lisait comme un palier payé et créditait une échéance tombée dans la
// semaine (une ligne grant_monthly = un cycle de quotas neuf : jauges à zéro, « remise le » déplacée) ; le crédit paresseux
// des spend_coins_* ('lazy') aussi (prix > 0) ; et l'ops-digest signalait l'essai « à recréditer ».
// Le correctif : supabase/migrations/20261112100000_essai_formule_aucun_credit_hors_paiement.sql (grant_monthly_coins
// refuse 'sweep' et 'lazy' pendant l'essai d'une formule ; coins_awaiting_payment porte la même condition).
//
// Ce verrou REJOUE le balayage et le crédit paresseux sur une base JETABLE (embedded-postgres sur le poste, jamais la prod)
// qui porte les définitions de PROD du 12/11 (scripts/essais/20261112100000_decor.mjs, md5 vérifiés) :
//   · SANS la migration (SELFTEST_RACINE = le code d'avant) : les comptes en essai d'une formule sont crédités → ROUGE ;
//   · AVEC : aucun n'est crédité ni réécrit, tous les autres comptes sont traités exactement comme avant ;
//   · il MORD : l'inverse rejoué, le défaut revient.
// Le décor (fixtures, cas) est lu dans CETTE copie ; le code jugé (migration, inverse, sauvegarde, preuve, règle) dans
// SELFTEST_RACINE si elle est donnée. Le banc complet (118 vérifications) : scripts/essais/20261112100000_banc.mjs.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { demarrerBase, ouvrir, construireDecor, lireDe, existeDans, ICI, FX2, MIGRATION, INVERSE, PREUVE, SAUVEGARDE,
  CAS_BALAYAGE, CAS_PARESSEUX, tour, comparable } from './essais/20261112100000_decor.mjs';

const ROOT = process.env.SELFTEST_RACINE ? resolve(process.env.SELFTEST_RACINE) : ICI;
const lire = (p) => lireDe(ROOT, p);
const existe = (p) => existeDans(ROOT, p);
let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`}`);
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const fx = JSON.parse(lireDe(ICI, FX2));
const prod = Object.fromEntries(fx.fonctions.map((f) => [f.nom, f]));
const blocs = (txt) => Object.fromEntries(txt.split(/(?=CREATE OR REPLACE FUNCTION public\.)/).filter((b) => b.startsWith('CREATE OR REPLACE'))
  .map((b) => [/FUNCTION public\.([a-z_]+)\(/.exec(b)[1], b.replace(/\$function\$;\n[\s\S]*$/, () => '$function$\n')]));
// La condition « une formule avec Cloud en essai », terme à terme (minuscules, espaces réduits).
const TERMES = ['p.cloud_formule is not null', 'p.is_cloud is not true', 'p.cloud_essai_arrete is not true', "p.cloud_canal is distinct from 'offert'",
  'p.cloud_essai_debut is not null and p.cloud_essai_fin is not null', 'p.cloud_essai_debut <= now() and now() < p.cloud_essai_fin'];
const norme = (s) => s.toLowerCase().replace(/\s+/g, ' ');

console.log('1. LE CODE (migration, inverse, sauvegarde, preuve, règle)');
ok(existe(MIGRATION), MIGRATION);
ok(existe(INVERSE), INVERSE);
let M = {}, I = {};
if (existe(MIGRATION) && existe(INVERSE)) {
  M = blocs(lire(MIGRATION)); I = blocs(lire(INVERSE));
  ok(egal(Object.keys(M).sort(), ['coins_awaiting_payment', 'grant_monthly_coins']), 'la migration réécrit exactement grant_monthly_coins et coins_awaiting_payment', Object.keys(M));
  ok(egal(Object.keys(I).sort(), ['coins_awaiting_payment', 'grant_monthly_coins']), 'l\'inverse remet exactement ces deux fonctions', Object.keys(I));
  for (const f of ['grant_monthly_coins', 'coins_awaiting_payment']) {
    ok(I[f] === prod[f].def && md5(I[f] ?? '') === prod[f].md5_prod, `inverse ${f} : la définition de prod à l'octet (md5 ${prod[f].md5_prod})`, md5(I[f] ?? ''));
    // Toutes les lignes de prod, dans l'ordre ; seules des lignes AJOUTÉES (le bloc de la règle et ses commentaires).
    const a = prod[f].def.split('\n'), b = (M[f] ?? '').split('\n');
    let i = 0; const ajout = [];
    for (const l of b) { if (i < a.length && l === a[i]) i++; else ajout.push(l); }
    const code = ajout.filter((l) => l.trim() !== '' && !/^\s*--/.test(l)).map((l) => l.trim());
    const attendu = f === 'grant_monthly_coins'
      ? ["if p_source in ('sweep', 'lazy') then", 'if exists (select 1 from profiles p', 'where p.id = p_user_id', ...TERMES.map((t) => `and ${t}`).slice(0, 5),
        `and ${TERMES[5]}) then`, "return jsonb_build_object('granted', false, 'reason', 'essai_formule_en_cours', 'tier', p_tier);", 'end if;', 'end if;']
      : [`and not (${TERMES[0]}`, ...TERMES.slice(1, 5).map((t) => `and ${t}`), `and ${TERMES[5]})`];
    ok(i === a.length && egal(code, attendu), `${f} : toutes les lignes de prod gardées, dans l'ordre ; seul le bloc de la règle ajouté`, { gardees: `${i}/${a.length}`, code });
  }
  const g = M.grant_monthly_coins ?? '';
  ok(g.indexOf("'invalid_tier'") < g.indexOf("if p_source in ('sweep', 'lazy')") && g.indexOf("if p_source in ('sweep', 'lazy')") < g.indexOf('insert into coin_wallets'),
    'la règle vient après le refus d\'un palier inconnu et AVANT toute écriture (insert into coin_wallets)');
  ok(!/'payment'\s*,\s*'sweep'|in \('payment'/.test(g), 'jamais pour un paiement (\'payment\') : seuls \'sweep\' et \'lazy\'');
  ok(/SET lock_timeout = '5s';/.test(lire(MIGRATION)) && /RESET lock_timeout;/.test(lire(MIGRATION)) && /SET lock_timeout = '5s';/.test(lire(INVERSE)), 'lock_timeout 5 s dans la migration et l\'inverse');
  {
    // Hors des corps de fonctions ($function$ … $function$) : rien que SET / CREATE OR REPLACE FUNCTION / RESET.
    const dehors = lire(MIGRATION).replace(/AS \$function\$[\s\S]*?\$function\$;/g, 'AS <corps>;').split('\n').filter((l) => !/^\s*--/.test(l) && l.trim() !== '');
    const instructions = dehors.join('\n').split(';').map((s) => s.trim()).filter(Boolean);
    ok(instructions.every((s) => /^SET lock_timeout = '5s'$|^RESET lock_timeout$|^CREATE OR REPLACE FUNCTION public\.(grant_monthly_coins|coins_awaiting_payment)\(/.test(s)),
      'la migration n\'écrit aucune ligne et ne touche à aucun droit (SET, deux CREATE OR REPLACE FUNCTION, RESET : rien d\'autre)', instructions.map((s) => s.slice(0, 60)));
  }
}
ok(existe(SAUVEGARDE) && existe(PREUVE), `${SAUVEGARDE} et ${PREUVE}`);
if (existe(SAUVEGARDE)) {
  const s = lire(SAUVEGARDE);
  ok(s.includes(`coins_awaiting_payment=${prod.coins_awaiting_payment.md5_prod} grant_monthly_coins=${prod.grant_monthly_coins.md5_prod}`) && /RAISE EXCEPTION/.test(s),
    'la sauvegarde refuse d\'écrire si une des deux fonctions a changé en prod (md5 de la fixture)');
  ok(/ENABLE ROW LEVEL SECURITY/.test(s) && /REVOKE ALL ON public\._backup_1112_essai_formule_aucun_credit_hors_paiement FROM PUBLIC, anon, authenticated/.test(s),
    'table de sauvegarde fermée (RLS, droits retirés)');
}
if (existe(PREUVE)) {
  const p = lire(PREUVE), code = p.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  ok(!/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b/i.test(code.replace(/'[^']*'/g, "''")), 'la preuve ne contient que de la lecture (aucune écriture)');
  ok(TERMES.every((t) => norme(code).includes(norme(t))), 'la preuve simule le balayage avec la condition de la migration, mot pour mot');
}
{
  const r = existe('docs/regles/mails-paiements-comptabilite.md') ? lire('docs/regles/mails-paiements-comptabilite.md') : '';
  const section = r.split(/^## /m).find((s) => /FORMULES AVEC CLOUD/.test(s)) ?? '';
  ok(/20261112100000/.test(section) && /essai_formule_en_cours/.test(section) && /'sweep'/.test(section) && /'lazy'/.test(section) && !/Reste à faire avant d'ouvrir le web : le balayage/.test(section),
    'la règle est écrite dans docs/regles/mails-paiements-comptabilite.md (section FORMULES AVEC CLOUD)');
}
{
  const fichiers = [MIGRATION, INVERSE, SAUVEGARDE, PREUVE].filter(existe).map(lire).join('\n') + lireDe(ICI, FX2) + lireDe(ICI, 'scripts/essais/20261112100000_decor.mjs');
  ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(fichiers), 'aucune adresse e-mail dans la migration, l\'inverse, la sauvegarde, la preuve, la fixture ni le décor');
}

console.log('2. LE GESTE, SUR UNE BASE JETABLE (définitions de prod du 12/11)');
const T = Date.now();
const base = await demarrerBase({ port: 54000 + Math.floor(Math.random() * 2000), nom: 'fillsell-verrou-credit-essai-formule-' });
const c = await ouvrir(base.url);
try {
  const d = await construireDecor(c);
  ok(d.echecs.length === 0 && d.nf === d.attendues, `décor de prod : ${d.nf} fonctions (md5 de chacune contrôlés par le banc)`, d.echecs.slice(0, 3));
  const md5Decor = Object.fromEntries((await c.query(`SELECT proname, md5(pg_get_functiondef(oid)) AS m FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname IN ('grant_monthly_coins', 'coins_awaiting_payment', 'grant_monthly_coins_sweep')`)).rows.map((r) => [r.proname, r.m]));
  ok(['grant_monthly_coins', 'coins_awaiting_payment', 'grant_monthly_coins_sweep'].every((f) => md5Decor[f] === fx.md5_prod[f]), 'le balayage et les deux fonctions jugées = prod à l\'octet (md5)', md5Decor);

  const A = await tour(c, T, 'balayage');
  const exclus = CAS_BALAYAGE.filter((k) => k.exclu), autres = CAS_BALAYAGE.filter((k) => !k.exclu);
  ok(exclus.filter((k) => k.A === 'credite').every((k) => A.apres[k.u].neuves === 1 && A.apres[k.u].cycle_neuf === true),
    `définitions de prod : le défaut se reproduit (${exclus.filter((k) => k.A === 'credite').length} comptes en essai d'une formule crédités, un cycle neuf chacun)`);

  if (existe(MIGRATION)) { await c.query(lire(MIGRATION)); await c.query(lire(MIGRATION)); }
  const B = await tour(c, T, 'balayage');
  for (const k of exclus) {
    ok(B.apres[k.u].neuves === 0 && B.apres[k.u].cycle_neuf === false && (k.due === null || (B.apres[k.u].xmin === B.avant[k.u].xmin && B.apres[k.u].portefeuille?.intact === true)),
      `balayage : ${k.nom} → aucun crédit, rien de réécrit`, B.apres[k.u]);
  }
  ok(autres.every((k) => egal(comparable(B.apres)[k.u], comparable(A.apres)[k.u])), `balayage : les ${autres.length} autres comptes exactement comme avant (payé, Cloud seul, essai du Cloud seul, offert, Founder, Business, gratuit, essai fini / arrêté / pas commencé, formule payée, Cloud offert…)`,
    autres.filter((k) => !egal(comparable(B.apres)[k.u], comparable(A.apres)[k.u])).map((k) => k.nom));
  {
    const att = (v) => CAS_BALAYAGE.filter((k) => k.B === v).length;
    ok(B.balayage.granted === att('credite') && B.balayage.awaiting_payment === att('attente') && B.balayage.skipped === att('saute'),
      `le balayage rend granted ${att('credite')} (au lieu de ${A.balayage.granted}), awaiting_payment ${att('attente')}, skipped ${att('saute')} (les ${exclus.length} essais)`, B.balayage);
  }
  const e7 = CAS_BALAYAGE.find((k) => k.u.startsWith('e0000007'));
  ok(A.apres[e7.u].ops_digest === true && B.apres[e7.u].ops_digest === false, 'ops-digest (coins_awaiting_payment) : l\'essai n\'est plus signalé « à recréditer »');
  const L = await tour(c, T, 'paresseux');
  const [b1, b2, b3] = CAS_PARESSEUX;
  ok(L.appels[b1.u]?.reason === 'insufficient_coins' && L.appels[b2.u]?.allowed === false && L.appels[b3.u]?.reason === 'essai_formule_en_cours'
    && [b1, b2, b3].every((k) => L.apres[k.u].neuves === 0),
  'crédit paresseux (prix > 0) : generate, Lens et upgrade_monthly_grant(…, \'lazy\') ne créditent rien pendant l\'essai', [b1, b2, b3].map((k) => L.appels[k.u]));

  if (existe(INVERSE)) {
    await c.query(lire(INVERSE));
    const C = await tour(c, T, 'balayage');
    ok(exclus.filter((k) => k.A === 'credite').every((k) => C.apres[k.u].neuves === 1) && CAS_BALAYAGE.every((k) => egal(comparable(C.apres)[k.u], comparable(A.apres)[k.u])),
      'il MORD : l\'inverse rejoué, le défaut revient (état d\'avant exact)');
  } else ok(false, 'il MORD : pas d\'inverse à rejouer');
} catch (e) {
  ko++;
  console.log(`  ✗ exception : ${e.stack ?? e}`);
} finally {
  await c.end().catch(() => {});
  await base.arreter();
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
