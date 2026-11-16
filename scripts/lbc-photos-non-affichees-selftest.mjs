// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : LE BLOC PHOTOS QUI NE S'AFFICHE PAS À TEMPS SE DIT — SELFTEST « VERROU »
// (16/11/2026, lot du matin, point 5 — 2f7275hb8p, job 3048003c)
// ═══════════════════════════════════════════════════════════════════════════
// Le 15/11 à 22:12, « Élément introuvable: input[type="file"] (même après avance du wizard paginé) » : la page de
// dépôt Leboncoin n'avait pas encore peint son bloc photos dans l'onglet de travail caché (Chrome ralentit ses
// minuteries). PONCTUEL : 10 dépôts sur ~9 400 en 30 jours, 8 comptes, tous repartis au premier nouvel essai. Mais le
// serveur ne reconnaissait pas ce texte : « motif inconnu », et la personne lisait « On ne sait pas encore pourquoi »
// (une a annulé 8 min après). Rouge sur le code d'avant, vert après :
//   1. le texte réel → même cadence que le motif inconnu (reprise à 15 min, 3 fois), motif nommé, message vrai qui
//      parle des photos, sans « On ne sait pas » ni vocabulaire de développeur ;
//   2. après 3 essais : « relancer », avec sa phrase vraie ;
//   3. une republication pas encore retirée : « ton annonce est intacte » ;
//   4. non-régression : hors Leboncoin, un autre texte Leboncoin, et les photos Beebs gardent leur règle.
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const BRUT = 'Élément introuvable: input[type="file"] (même après avance du wizard paginé)';
const DEV = /input|wizard|introuvable|sélecteur|selector|\[type/i;
const c = (o) => classerEchec({ platform: "leboncoin", action: "publish", brut: BRUT, reecrit: "", essais: 1, reprises: 0, pf: {}, ...o });

console.log("\n1. Le texte réel (jobs 3048003c, 80a54a24, 1e2fa7fe) : un nouvel essai, et la vraie raison");
for (const reprises of [0, 1, 2]) {
  const r = c({ reprises });
  ok(r.statut === "pending" && r.motif === "lbc_photos_non_affichees" && r.dansMinutes === 15, `reprise ${reprises} : nouvel essai dans 15 min, motif nommé`, JSON.stringify({ s: r.statut, m: r.motif, d: r.dansMinutes }));
}
{
  const r = c({});
  ok(!/On ne sait pas/.test(r.message), "jamais « On ne sait pas encore pourquoi »", r.message);
  ok(/photos/.test(r.message) && /Rien n'a été publié/.test(r.message), "le message parle des photos et dit que rien n'a été publié", r.message);
  ok(!DEV.test(r.message), "aucun vocabulaire de développeur", r.message);
}

console.log("\n2. Après 3 essais : « relancer », avec sa phrase vraie");
{
  const r = c({ reprises: 3 });
  ok(r.statut === "needs_user" && r.source === "relancer" && r.motif === "lbc_photos_non_affichees_relancer", "needs_user « relancer »", JSON.stringify({ s: r.statut, src: r.source, m: r.motif }));
  ok(/photos/.test(r.message) && !/On ne sait pas/.test(r.message) && !DEV.test(r.message), "phrase vraie, sans vocabulaire de développeur", r.message);
}

console.log("\n3. Republication pas encore retirée");
{
  const r = c({ action: "republish", pf: { republish_step: "captured" } });
  ok(r.statut === "pending" && /intacte/.test(r.message), "« ton annonce est intacte »", r.message);
}

console.log("\n4. Non-régression");
{
  const v = classerEchec({ platform: "vinted", action: "publish", brut: BRUT, reecrit: "", essais: 1, reprises: 0, pf: {} });
  ok(v.motif !== "lbc_photos_non_affichees", "hors Leboncoin : jamais cette règle", v.motif);
  const autre = classerEchec({ platform: "leboncoin", action: "publish", brut: "Erreur quelconque jamais vue", reecrit: "", essais: 1, reprises: 0, pf: {} });
  ok(autre.motif === "inconnu_reprise", "un autre texte Leboncoin reste « motif inconnu »", autre.motif);
  const beebs = classerEchec({ platform: "beebs", action: "publish", brut: 'Élément introuvable: #input-pictures', reecrit: "", essais: 1, reprises: 0, pf: {} });
  ok(beebs.motif !== "lbc_photos_non_affichees", "Beebs « #input-pictures » : sa règle d'avant", beebs.motif);
  const retrait = classerEchec({ platform: "leboncoin", action: "delete", brut: BRUT, reecrit: "", essais: 1, reprises: 0, pf: {} });
  ok(retrait.motif !== "lbc_photos_non_affichees", "un retrait n'a pas de bloc photos : jamais cette règle", retrait.motif);
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) process.exit(1);
