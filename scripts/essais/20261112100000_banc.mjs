// LE BANC de la migration 20261112100000_essai_formule_aucun_credit_hors_paiement (12/11/2026, question 9 des offres Cloud,
// décision de Nico : « correction à la racine, base jetable d'abord, aucun compte hors essai touché, retour arrière prêt »)
// — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste, port 54000-55999 et dossier à part), jamais la prod.
//   node scripts/essais/20261112100000_banc.mjs
// Décor : la prod du 12/11/2026 vers 09:45 (scripts/essais/20261112100000_decor.mjs) — md5 et droits de prod vérifiés.
// Trois tours, joués à l'identique à chaque étape (mêmes comptes, mêmes dates fixes) :
//   balayage  : SELECT public.grant_monthly_coins_sweep(), comme le cron coins-monthly-sweep ; et la PREUVE (lecture seule),
//               dont la simulation doit annoncer exactement ce que le balayage fait ;
//   paresseux : spend_coins_for_generate / _for_lens (prix à 1 pour le tour) et upgrade_monthly_grant(…, 'lazy') ;
//   autres    : paiement réel ('payment'), inscription, appel à la main — jamais touchés.
// Étapes : A. AVANT (prod) — le défaut se reproduit ; B. MIGRATION jouée deux fois — corrigé, tout le reste identique à A ;
//          C. INVERSE — l'état d'avant à l'octet (md5 = prod, droits compris), A de nouveau ; D. MIGRATION rejouée — B.
import { demarrerBase, ouvrir, construireDecor, etatFonctions, ecart, lireDe, ICI, MIGRATION, INVERSE, TOUCHEES, SANS_COMMENTAIRES,
  CAS_BALAYAGE, CAS_PARESSEUX, CAS_AUTRES, tour, comparable, appelComparable, id8 } from './20261112100000_decor.mjs';

let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`}`);
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MIG = lireDe(ICI, MIGRATION), INV = lireDe(ICI, INVERSE);
const T = Date.now();

const base = await demarrerBase({ port: 54000 + Math.floor(Math.random() * 2000), nom: 'fillsell-banc-credit-essai-formule-' });
const c = await ouvrir(base.url);

const compte = (cas, champ, v) => cas.filter((k) => k[champ] === v).length;
/** Les trois tours d'une étape. */
async function etape() {
  return { balayage: await tour(c, T, 'balayage'), paresseux: await tour(c, T, 'paresseux'), autres: await tour(c, T, 'autres') };
}
/** Le balayage a-t-il fait, compte par compte, ce que dit la colonne `col` (A ou B) des cas ? */
function verifierBalayage(r, col, titre) {
  const att = { granted: compte(CAS_BALAYAGE, col, 'credite'), awaiting_payment: compte(CAS_BALAYAGE, col, 'attente'), skipped: compte(CAS_BALAYAGE, col, 'saute') };
  const b = r.balayage;
  ok(b.granted === att.granted && b.awaiting_payment === att.awaiting_payment && b.skipped === att.skipped,
    `${titre} : le balayage rend granted ${att.granted}, awaiting_payment ${att.awaiting_payment}, skipped ${att.skipped}`, b);
  for (const k of CAS_BALAYAGE) {
    const av = r.avant[k.u], ap = r.apres[k.u];
    const credite = ap.neuves === 1 && ap.lignes.at(-1)?.kind === 'grant_monthly' && ap.cycle_neuf === true;
    if (k[col] === 'credite') ok(credite, `${titre} · ${k.nom} → crédité (un cycle neuf)`, ap);
    else ok(ap.neuves === 0 && ap.cycle_neuf === false && egal(ap.lignes, av.lignes), `${titre} · ${k.nom} → rien au grand livre, cycle inchangé`, ap);
  }
}

try {
  const d = await construireDecor(c);
  ok(d.echecs.length === 0 && d.nf === d.attendues, `décor de prod : ${d.nf}/${d.attendues} fonctions, tables, contraintes et index, ${d.fx2.config.coin_config.length} valeurs de coin_config`, d.echecs.slice(0, 4));

  console.log('A. AVANT — les définitions de prod du 12/11');
  const AVANT = await etatFonctions(c);
  {
    const mauvais = Object.values(AVANT).filter((f) => d.fx2.md5_prod[f.nom] && !SANS_COMMENTAIRES.includes(f.nom) && f.m !== d.fx2.md5_prod[f.nom]).map((f) => f.nom);
    const exactes = Object.values(AVANT).filter((f) => d.fx2.md5_prod[f.nom] && !SANS_COMMENTAIRES.includes(f.nom)).length;
    ok(mauvais.length === 0 && exactes === 21, `md5 du décor = md5 de prod pour les ${exactes} fonctions recopiées à l'octet (dont grant_monthly_coins, coins_awaiting_payment, grant_monthly_coins_sweep, et les 4 de la décision 1)`, mauvais);
    const droits = Object.values(AVANT).filter((f) => d.fx2.acl_prod[f.nom] && f.acl !== d.fx2.acl_prod[f.nom]).map((f) => `${f.nom} ${f.acl}`);
    ok(droits.length === 0, `droits EXECUTE du décor = droits de prod (${Object.values(AVANT).filter((f) => d.fx2.acl_prod[f.nom]).length} fonctions)`, droits);
  }
  const A = await etape();
  verifierBalayage(A.balayage, 'A', 'AVANT');
  {
    const p = A.balayage.preuve;
    ok(Number(p['balayage maintenant|crédités SANS l\'exclusion']) === A.balayage.balayage.granted
      && Number(p['balayage maintenant|attente de paiement SANS l\'exclusion']) === A.balayage.balayage.awaiting_payment
      && Number(p['balayage maintenant|comptes visités']) === CAS_BALAYAGE.filter((k) => k.A !== 'non_visite').length,
    'PREUVE (simulation, avant le balayage) : crédités / attente / visités SANS l\'exclusion = ce que le balayage d\'avant fait', p);
    const exclus = CAS_BALAYAGE.filter((k) => k.exclu).map((k) => id8(k.u)).sort().join(' ');
    ok(p['balayage maintenant|exclus : id8'] === exclus && Number(p['balayage maintenant|crédités AVEC l\'exclusion']) === compte(CAS_BALAYAGE, 'B', 'credite'),
      `PREUVE : exclus = les ${CAS_BALAYAGE.filter((k) => k.exclu).length} comptes en essai d'une formule (${exclus}) ; crédités AVEC l'exclusion = ${compte(CAS_BALAYAGE, 'B', 'credite')} (annonce l'APRÈS)`, p);
    ok(p['ops-digest|coins_awaiting_payment : lignes SANS l\'exclusion'] === '2' && p['ops-digest|coins_awaiting_payment : lignes AVEC l\'exclusion'] === '1'
      && p['ops-digest|coins_awaiting_payment() : ce que rend la RPC'] === '2' && p['fonction|grant_monthly_coins : migrée'] === 'false',
    'PREUVE : ops-digest 2 lignes sans / 1 avec l\'exclusion, la RPC d\'avant en rend 2 ; grant_monthly_coins non migrée', p);
  }
  {
    const e1 = CAS_BALAYAGE[0], ap = A.balayage.apres[e1.u];
    const l = ap.lignes.at(-1);
    ok(l?.kind === 'grant_monthly' && l?.metadata?.tier === 'pro' && l?.included_after === 1200 && l?.metadata?.source === 'sweep' && ap.portefeuille?.next_grant_at > new Date(T).toISOString().slice(0, 19),
      'DÉFAUT reproduit : essai Pro + Cloud (Stripe) — le balayage crédite « pro » 1 200, ouvre un cycle de quotas neuf et repousse « remise le », pendant l\'essai', ap);
    const e7 = CAS_BALAYAGE.find((k) => k.u.startsWith('e0000007'));
    ok(A.balayage.apres[e7.u].ops_digest === true, 'DÉFAUT voisin : un essai dont l\'échéance a plus de 3 jours apparaît dans coins_awaiting_payment (ops-digest, « aucun grant depuis »)');
  }
  {
    const r = A.paresseux.appels;
    const [b1, b2, b3] = CAS_PARESSEUX;
    ok(r[b1.u]?.allowed === true && r[b1.u]?.included_after === 1199 && A.paresseux.apres[b1.u].cycle_neuf === true,
      'DÉFAUT (latent, prix > 0) : spend_coins_for_generate crédite paresseusement « pro » 1 200 pendant l\'essai', r[b1.u]);
    ok(r[b2.u]?.allowed === true && A.paresseux.apres[b2.u].cycle_neuf === true, 'DÉFAUT (latent) : spend_coins_for_lens aussi', r[b2.u]);
    ok(r[b3.u]?.granted === true, 'DÉFAUT (latent) : upgrade_monthly_grant(…, \'lazy\') — le chemin de spend_coins_and_publish / _and_republish — crédite aussi', r[b3.u]);
  }

  console.log('B. MIGRATION (jouée deux fois)');
  await c.query(MIG);
  await c.query(MIG);
  const APRES = await etatFonctions(c);
  {
    const e = ecart(AVANT, APRES);
    ok(e.ajoutes.length === 0 && e.retires.length === 0 && egal(e.changes, [...TOUCHEES].sort()), `seules les deux fonctions changent (${TOUCHEES.join(', ')}), aucune ajoutée ni retirée`, e);
    ok(e.droits.length === 0, 'droits EXECUTE, SECURITY DEFINER, search_path et volatilité inchangés', e.droits);
  }
  const B = await etape();
  verifierBalayage(B.balayage, 'B', 'APRÈS');
  for (const k of CAS_BALAYAGE.filter((x) => !x.exclu)) {
    ok(egal(comparable(B.balayage.apres)[k.u], comparable(A.balayage.apres)[k.u]), `identique à AVANT, au bit près (grand livre, portefeuille, cycle, ops-digest) : ${k.nom}`,
      { A: A.balayage.apres[k.u], B: B.balayage.apres[k.u] });
  }
  for (const k of CAS_BALAYAGE.filter((x) => x.exclu)) {
    const av = B.balayage.avant[k.u], ap = B.balayage.apres[k.u];
    if (k.due === null) {
      ok(ap.lignes.length === 0 && ap.portefeuille?.included_balance === 0 && ap.portefeuille?.next_grant_at === null,
        `${k.nom} : aucun crédit (seule la ligne coin_wallets VIDE qu'upgrade_monthly_grant crée pour tout compte visité)`, ap);
    } else {
      ok(egal(ap.portefeuille, av.portefeuille) && ap.xmin === av.xmin && ap.portefeuille?.intact === true,
        `${k.nom} : portefeuille ni crédité ni réécrit (même xmin), « remise le » inchangée`, { av, ap });
    }
  }
  {
    const e7 = CAS_BALAYAGE.find((k) => k.u.startsWith('e0000007')), a2 = CAS_BALAYAGE.find((k) => k.u.startsWith('a0000002'));
    ok(B.balayage.apres[e7.u].ops_digest === false && B.balayage.apres[a2.u].ops_digest === true,
      'ops-digest : l\'essai n\'est plus signalé « à recréditer » ; le vrai retard de paiement (Premium payé) l\'est toujours');
  }
  {
    const p = B.balayage.preuve;
    ok(Number(p['balayage maintenant|crédités AVEC l\'exclusion']) === B.balayage.balayage.granted
      && Number(p['balayage maintenant|attente de paiement AVEC l\'exclusion']) === B.balayage.balayage.awaiting_payment
      && p['ops-digest|coins_awaiting_payment() : ce que rend la RPC'] === '1' && p['fonction|grant_monthly_coins : migrée'] === 'true'
      && p['fonction|coins_awaiting_payment : migrée'] === 'true' && p['fonction|grant_monthly_coins_sweep : migrée'] === 'false' && p['fonction|upgrade_monthly_grant : migrée'] === 'false',
    'PREUVE (APRÈS) : crédités / attente AVEC l\'exclusion = ce que le balayage fait ; la RPC rend 1 ; deux fonctions migrées, les témoins non', p);
    const pa = A.balayage.preuve;
    const memes = Object.keys(pa).filter((k) => k.startsWith('balayage') || k.startsWith('essais')).every((k) => pa[k] === p[k]);
    ok(memes, 'PREUVE : la simulation du balayage et la liste des essais sont identiques avant et après (elle ne dépend pas des fonctions)');
  }
  {
    const r = B.paresseux.appels, ra = A.paresseux.appels;
    const [b1, b2, b3, ...autres] = CAS_PARESSEUX;
    ok(r[b1.u]?.allowed === false && r[b1.u]?.reason === 'insufficient_coins' && B.paresseux.apres[b1.u].neuves === 0 && B.paresseux.apres[b1.u].cycle_neuf === false,
      'crédit paresseux pendant l\'essai : spend_coins_for_generate ne crédite plus (solde 0 → insufficient_coins, aucun cycle neuf)', r[b1.u]);
    ok(r[b2.u]?.allowed === false && B.paresseux.apres[b2.u].neuves === 0, 'spend_coins_for_lens non plus', r[b2.u]);
    ok(r[b3.u]?.granted === false && r[b3.u]?.reason === 'essai_formule_en_cours' && B.paresseux.apres[b3.u].neuves === 0,
      'upgrade_monthly_grant(…, \'lazy\') (spend_coins_and_publish / _and_republish) : granted false, essai_formule_en_cours', r[b3.u]);
    for (const k of autres) {
      ok(egal(appelComparable(r[k.u]), appelComparable(ra[k.u])) && egal(comparable(B.paresseux.apres)[k.u], comparable(A.paresseux.apres)[k.u]),
        `identique à AVANT : ${k.nom}`, { A: ra[k.u], B: r[k.u] });
    }
  }
  for (const k of CAS_AUTRES) {
    const ra = A.autres.appels[k.u], rb = B.autres.appels[k.u];
    ok(rb?.granted === true && egal(appelComparable(rb), appelComparable(ra)) && egal(comparable(B.autres.apres)[k.u], comparable(A.autres.apres)[k.u]),
      `identique à AVANT (crédité) : ${k.nom}`, { A: ra, B: rb });
  }

  console.log('C. INVERSE');
  await c.query(INV);
  const INVERSE_ETAT = await etatFonctions(c);
  {
    const e = ecart(AVANT, INVERSE_ETAT);
    ok(e.ajoutes.length + e.retires.length + e.changes.length + e.droits.length === 0, 'l\'inverse rend l\'état d\'AVANT exactement (md5 = prod, droits compris)', e);
    const m = Object.values(INVERSE_ETAT).filter((f) => ['grant_monthly_coins', 'coins_awaiting_payment'].includes(f.nom)).map((f) => `${f.nom}=${f.m}`).sort().join(' ');
    ok(m === `coins_awaiting_payment=${d.fx2.md5_prod.coins_awaiting_payment} grant_monthly_coins=${d.fx2.md5_prod.grant_monthly_coins}`, `md5 après l'inverse = prod (${m})`);
  }
  const C = await etape();
  for (const g of ['balayage', 'paresseux', 'autres']) {
    const cas = C[g].cas;
    const memes = cas.every((k) => egal(comparable(C[g].apres)[k.u], comparable(A[g].apres)[k.u]) && egal(appelComparable(C[g].appels[k.u]), appelComparable(A[g].appels[k.u])));
    ok(memes && (g !== 'balayage' || egal(appelComparable(C[g].balayage), appelComparable(A[g].balayage))),
      `tour ${g} : exactement l'état d'AVANT (${cas.length} comptes)${g === 'autres' ? '' : ' — le défaut revient'}`);
  }

  console.log('D. DE NOUVEAU la migration');
  await c.query(MIG);
  {
    const e = ecart(APRES, await etatFonctions(c));
    ok(e.ajoutes.length + e.retires.length + e.changes.length + e.droits.length === 0, 'l\'état d\'APRÈS exactement', e);
  }
  const D = await etape();
  for (const g of ['balayage', 'paresseux', 'autres']) {
    const cas = D[g].cas;
    const memes = cas.every((k) => egal(comparable(D[g].apres)[k.u], comparable(B[g].apres)[k.u]) && egal(appelComparable(D[g].appels[k.u]), appelComparable(B[g].appels[k.u])));
    ok(memes && (g !== 'balayage' || egal(appelComparable(D[g].balayage), appelComparable(B[g].balayage))), `tour ${g} : exactement l'état d'APRÈS (${cas.length} comptes)`);
  }
} catch (e) {
  ko++;
  console.log(`  ✗ exception : ${e.stack ?? e}`);
} finally {
  await c.end().catch(() => {});
  await base.arreter();
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
