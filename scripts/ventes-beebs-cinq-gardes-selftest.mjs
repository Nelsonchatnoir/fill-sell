// VERROU (13/11/2026, point 3b de Nico) : LES VENTES BEEBS LUES SUR LA PAGE DES VENTES — LES QUATRE MANQUES DE LA BASE.
//
//     npm run selftest:ventes-beebs-cinq-gardes
//     VERROU_AVANT=1 npm run selftest:ventes-beebs-cinq-gardes   (les définitions de PROD seules : les défauts, en rouge)
//
// Interrupteur ventes_beebs_commandes LAISSÉ À 0 en prod (décision de Nico) : la voie qui écrit n'a jamais rencontré une
// vraie vente (0 « aurait_prouve » depuis le 01/10). Ce verrou la joue sur un Postgres JETABLE (décor de prod du 13/11,
// scripts/essais/20261113140000_banc.mjs), interrupteur mis à 1 dans la base jetable seulement, comme l'extension et le
// cron la joueraient. Cas réels cités par l'id8 du compte (valeurs de la base jetable inventées) :
//   1. GARDE D'ÂGE — a99e2876, faf5021a, d71db658 : leur page des ventes porte des commandes de 2023-2025 relues à chaque
//      lecture ; une telle commande sur une annonce importée par un relevé en 2026 devenait une vente (fiche vendue,
//      copies retirées). Attendu : « avant_suivi », rien écrit ; une commande APRÈS le suivi prouve toujours.
//   2. ANNULATION DÉFAITE — une commande annulée après l'enregistrement de sa vente (WAIT_SELLER_CONFIRM puis CANCELLED)
//      gardait la vente. Attendu : vente retirée et tracée, fiche rendue, retrait en file arrêté, copie déjà retirée
//      proposée à la remise en vente, annonce Beebs à relire ; relue deux fois : rien de plus ; plusieurs exemplaires.
//   3. PRIX LU — 447d920c (commande 1723956 : 5 produits, 10,50 €) ; une offre ou un lot remisé était enregistré au prix
//      d'annonce. Attendu : le prix de la commande, réparti au centime ; rien de lu → le prix de la tâche.
//   4. COMPTES RELIÉS — faf5021a / 447d920c (seule paire du parc) : une commande, UN compte, UNE vente — celui qui porte
//      le numéro exact, celui qui a DÉPOSÉ l'annonce si les deux le portent ; un tiers non relié jamais touché.
//   + MAIL ET NOTIFICATION (gardé) seulement pour une commande de moins de 24 h — même si la disparition n'a été vue
//      qu'aujourd'hui (unavailable_since = la date de la COMMANDE).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const existe = (p) => existsSync(join(ROOT, p));
const AVANT = process.env.VERROU_AVANT === "1";
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); } };

const MIGRATION = "supabase/migrations/20261113140000_ventes_beebs_cinq_gardes.sql";
const INVERSE = "supabase/rollbacks/20261113140000_ventes_beebs_cinq_gardes_INVERSE.sql";
const BANC = "scripts/essais/20261113140000_banc.mjs";
if (!existe(BANC)) {
  ok(false, `le banc ${BANC} existe (décor de prod du 13/11)`);
} else {
  const B = await import(pathToFileURL(join(ROOT, BANC)).href);
  const { base, c, d } = await B.preparer({ port: 57000 + Math.floor(Math.random() * 1500) });
  try {
    ok(d.echecs.length === 0, `décor de prod du 13/11 (${d.nf} fonctions, ${d.nt} déclencheurs)`, d.echecs.slice(0, 3));
    if (AVANT) {
      console.log("(VERROU_AVANT : les définitions de PROD seules, sans la migration)");
    } else {
      ok(existe(MIGRATION) && existe(INVERSE), "la migration 20261113140000 et son inverse existent");
      if (existe(MIGRATION) && existe(INVERSE)) {
        await c.query(B.lire(INVERSE));   // la définition de prod mot pour mot (md5 aa1ff957…)
        ok(await B.md5Noter(c) === B.MD5_PROD, "la base porte la définition de PROD de commandes_beebs_noter (md5 aa1ff957…) avant la migration");
        await c.query(B.lire(MIGRATION));
      }
    }
    const R = await B.jouer(c);
    const RF = await B.jouer(c, { ecrit: false });

    console.log("1. Garde d'âge (a99e2876, faf5021a, d71db658 : commandes 2023-2025 relues à chaque lecture)");
    ok(R.lecture1.verdicts[0] === "avant_suivi" && R.etat.j1.signal === null && R.fiches.f1.ventes.length === 0,
      "commande de 2025 sur une annonce importée il y a 18 jours → « avant_suivi », aucune preuve, aucune vente", [R.lecture1.verdicts[0], R.etat.j1, R.fiches.f1]);
    ok(RF.lecture1.verdicts[0] === "avant_suivi", "en fantôme aussi : le bilan dit « avant_suivi » (jamais « aurait_prouve »)", RF.lecture1.verdicts[0]);
    ok(R.etat.j2.status === "sold" && R.lecture1.verdicts[1] === "prouvee", "une commande APRÈS le suivi prouve toujours la vente", [R.etat.j2, R.lecture1.verdicts[1]]);

    console.log("2. Annulation défaite (WAIT_SELLER_CONFIRM puis CANCELLED)");
    ok(R.fiche5vendue.statut === "vendu" && R.fiches.f5.statut === "stock" && R.fiches.f5.ventes.length === 0,
      "la vente enregistrée est retirée, la fiche rendue au stock", [R.fiche5vendue, R.fiches.f5]);
    ok(R.retraits5.includes("leboncoin:cancelled") && (R.remises ?? []).includes("vinted:proposee"),
      "le retrait encore en file est arrêté ; la copie déjà retirée est PROPOSÉE à la remise en vente (jamais automatique)", [R.retraits5, R.remises]);
    ok(R.etat.j5.status === "published" && R.etat.j5.annulee === "a_relire", "l'annonce Beebs redevient « publiée », à relire par la veille", R.etat.j5);
    ok(R.lecture5bis.annulee_apres === 0 && R.tick2.enregistrees === 0 && (R.supprimees ?? []).length === 2,
      "relue une seconde fois : rien de plus, le cron ne la réenregistre pas ; chaque vente retirée est tracée", [R.lecture5bis, R.tick2, R.supprimees]);
    ok(R.fiches.f10.statut === "stock" && Number(R.fiches.f10.quantite) === 2 && R.fiches.f10.ventes.length === 0,
      "plusieurs exemplaires : l'exemplaire est rendu (1 → 2)", R.fiches.f10);

    console.log("3. Prix lu (447d920c, commande 1723956 ; une offre, un lot remisé)");
    ok(JSON.stringify(R.fiches.f2.ventes) === JSON.stringify(["beebs:9.5"]), "offre acceptée : la vente est enregistrée au prix de la COMMANDE (9,50 €, annonce à 12 €)", R.fiches.f2);
    ok(JSON.stringify(R.fiches.f4.map((f) => f.ventes[0])) === JSON.stringify(["beebs:1.8", "beebs:2.7", "beebs:4.5"]),
      "lot de 9 € (2 + 3 + 5 € affichés) : réparti au prorata, au centime (1,80 + 2,70 + 4,50)", R.fiches.f4);
    ok(JSON.stringify(R.fiches.f3.ventes) === JSON.stringify(["beebs:12"]), "rien de lu sur la commande : le prix de la tâche, comme avant", R.fiches.f3);
    if (!AVANT && existe(MIGRATION)) {
      const lot = await B.prix(c, ["34200615", "34200624", "34292479", "34292493", "34292511"], 10.5,
        { 34200615: 1.5, 34200624: 2, 34292479: 3, 34292493: 2, 34292511: 2 });
      ok(JSON.stringify(Object.values(lot).map((x) => Number(x.prix))) === JSON.stringify([1.5, 2, 3, 2, 2]), "commande 1723956 (447d920c) : 10,50 € = la somme des prix → le prix de chaque produit", lot);
    } else {
      ok(false, "beebs_commande_prix (répartition du prix de la commande) existe");
    }

    console.log("4. Comptes reliés (faf5021a / 447d920c)");
    ok(R.etat.j7.status === "sold" && R.fiches.f7.ventes.length === 1, "la commande lue par un compte prouve la vente de l'annonce suivie par son compte RELIÉ (chez lui)", [R.etat.j7, R.fiches.f7]);
    ok(R.fiches.f8a.ventes.length + R.fiches.f8b.ventes.length === 1 && R.fiches.f8b.ventes.length === 1 && R.lectureB.verdicts[0] === "deja_prouvee",
      "la même annonce suivie par les deux comptes : UNE vente, chez celui qui l'a DÉPOSÉE ; l'autre lecture la trouve déjà prouvée", [R.fiches.f8a, R.fiches.f8b, R.lectureB.verdicts]);
    ok(R.etat.j9.status === "published" && R.etat.j9.signal === null, "un tiers NON relié qui porte le même numéro : jamais touché", R.etat.j9);

    console.log("5. Mail et notification seulement pour une commande de moins de 24 h (gardé)");
    ok(R.pushs.j2.includes("a_envoyer"), "commande de 2 h : mail et notification", R.pushs.j2);
    ok(!R.pushs.j3.includes("a_envoyer") && R.depuis3 === 72, "commande de 3 jours dont la disparition n'a été vue qu'il y a 2 h : AUCUN mail ni notification (date de la commande)", [R.pushs.j3, R.depuis3]);
    ok(RF.tick1.enregistrees === 0 && RF.fiches.f2.ventes.length === 0, "interrupteur à 0 (fantôme) : rien écrit, aucune vente — comme en prod aujourd'hui", RF.tick1);
  } finally {
    await c.end().catch(() => {});
    await base.arreter();
  }
}
console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
