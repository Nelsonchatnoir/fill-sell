// ═══════════════════════════════════════════════════════════════════════════
// (02/11, labrunettedu44) UNE RUE INTROUVABLE N'EST JAMAIS RETAPÉE À L'IDENTIQUE — CONTRÔLE
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (supabase/functions/_shared/lbc-voie-des-reglages.js, celui qu'importe update-job-status)
// sur les données réelles du compte au 02/11 : 28 republications Leboncoin en boucle sur « 25bis Rue de la Fontaine
// aux Bretons 44210 Pornic » (aucune proposition de Leboncoin), publication de 13:27 passée par la VILLE CHOISIE.
//
//   node scripts/lbc-rue-introuvable-0211-selftest.mjs

import { readFileSync } from "node:fs";
import {
  variantesRueLbc, prochaineAdresseLbc, adressesAccepteesParPublication, publicationAvecLaMemeAdresse,
  messageAutreAdresseLbc, messageRueIntrouvableLbc, adresseRefuseeAvantRetrait, decisionAdresseRepublicationLbc, decisionRueInconnueLbc,
} from "../supabase/functions/_shared/lbc-voie-des-reglages.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// Données réelles (job 4f2ba6f3, publication cf1d28ac, Réglages du compte).
const reglages = { adresse: "25bis Rue de la Fontaine aux Bretons 44210 Pornic", code_postal: "44210", rue: "25bis Rue de la Fontaine aux Bretons", ville: "Pornic", ville_publication: { code_postal: "44210", ville: "Pornic" } };
const loServie = { code_postal: "44210", libelle: "Pornic 44210", ville: "Pornic", voie: "25bis Rue de la Fontaine aux Bretons", pose_par: "get-pending-jobs (capture de l'annonce)",
  voie_des_reglages: { motif: "rue des Réglages, même commune (Leboncoin exige une rue en mode précis)", pose_par: "get-pending-jobs (lbc-voie-des-reglages)" } };
const pubVilleChoisie = { id: "cf1d28ac", adresse: "25bis Rue de la Fontaine aux Bretons 44210 Pornic", warnings: [
  { at: "2026-11-02T12:27:32.512Z", code: "generic", message: "univers: pré-rempli LBC \"Homme\" conservé (matche \"Homme\")" },
  { at: "2026-11-02T12:27:32.512Z", code: "generic", message: "adresse: ville choisie pour l'annonce (« Pornic 44210 ») — elle prime sur l'adresse des Réglages" },
  { at: "2026-11-02T12:27:32.512Z", code: "generic", message: "adresse: \"Pornic 44210\" → suggestion LBC \"Pornic (44210)\"" },
] };
const msgExt = "Republication Leboncoin mise en pause AVANT tout retrait : Leboncoin ne propose aucune adresse pour « 25bis Rue de la Fontaine aux Bretons 44210 Pornic ». Ton annonce est TOUJOURS en ligne, rien n'a été touché. Vérifie l'« Adresse de remise Leboncoin » dans tes Réglages (numéro, rue, code postal, ville), puis relance la republication.";

console.log("1. Le message n'est plus faux : Leboncoin a accepté la ville, pas la rue");
{
  ok(JSON.stringify(adressesAccepteesParPublication(pubVilleChoisie)) === JSON.stringify(["Pornic 44210"]), "la publication de 13:27 a fait accepter « Pornic 44210 » (ville choisie)");
  ok(publicationAvecLaMemeAdresse(adresseRefuseeAvantRetrait(msgExt), [pubVilleChoisie]) === null, "la rue refusée n'est PAS « la même adresse acceptée » (plus de « le blocage vient de chez nous »)");
  ok(publicationAvecLaMemeAdresse("Pornic 44210", [pubVilleChoisie])?.id === "cf1d28ac", "la commune, elle, est prouvée par la publication");
  const sansVille = { id: "p2", adresse: "4 Rue Du Hameau 26230 Chantemerle-lès-Grignan", warnings: [] };
  ok(publicationAvecLaMemeAdresse("4 rue du hameau 26230 Chantemerle-les-Grignan", [sansVille])?.id === "p2", "témoin : une adresse tapée telle quelle et passée reste « acceptée »");
}

console.log("2. Les autres écritures d'une rue");
{
  ok(JSON.stringify(variantesRueLbc("25bis Rue de la Fontaine aux Bretons")) === JSON.stringify(["25 bis Rue de la Fontaine aux Bretons", "Rue de la Fontaine aux Bretons"]), "« 25bis » → « 25 bis », puis sans numéro");
  ok(JSON.stringify(variantesRueLbc("2 rue arsene soulages")) === JSON.stringify(["rue arsene soulages"]), "sans suffixe : seulement la rue sans numéro");
  ok(JSON.stringify(variantesRueLbc("12, rue haute")) === JSON.stringify(["12 rue haute", "rue haute"]), "la virgule après le numéro tombe");
  ok(variantesRueLbc("Rue de Paris").length === 0 && variantesRueLbc("").length === 0, "une rue sans numéro n'a pas d'autre écriture");
}

console.log("3. L'échelle, une forme à la fois, puis la commune prouvée");
{
  const r1 = prochaineAdresseLbc(loServie, "25bis Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true });
  ok(r1.action === "variante" && r1.voie === "25 bis Rue de la Fontaine aux Bretons" && r1.lo.voie_des_reglages, "essai 2 : « 25 bis Rue de la Fontaine aux Bretons » (la marque de la rue des Réglages reste)");
  const r2 = prochaineAdresseLbc(r1.lo, "25 bis Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true });
  ok(r2.action === "variante" && r2.voie === "Rue de la Fontaine aux Bretons", "essai 3 : la rue sans numéro");
  const r3 = prochaineAdresseLbc(r2.lo, "Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true });
  ok(r3.action === "commune" && r3.commune === "Pornic 44210" && !r3.lo.voie && !r3.lo.voie_des_reglages && r3.lo.voie_des_reglages_retiree
    && r3.lo.voies_essayees.length === 3, "dernier recours : la commune, comme la publication (rue retirée, essais gardés)");
  const r3b = prochaineAdresseLbc(r2.lo, "Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: false });
  ok(r3b.action === "aucune" && r3b.essais.length === 3, "commune jamais prouvée pour ce compte : la pause reste (jamais une commune devinée)");
  const msg = messageRueIntrouvableLbc("Rue de la Fontaine aux Bretons 44210 Pornic", r3b.essais);
  ok(/R[ée]glages/.test(msg) && /25bis Rue/.test(msg) && /25 bis Rue/.test(msg) && !/chez nous/.test(msg), "…avec le vrai message : chaque écriture essayée, « Vérifie tes Réglages »");
  ok(prochaineAdresseLbc(loServie, "8 rue haute 75001 Paris", { communeAcceptee: true }).action === "aucune", "une adresse refusée qui n'est pas celle de ce job : rien ne change");
  ok(prochaineAdresseLbc({ code_postal: "44210", ville: "Pornic", libelle: "Pornic 44210" }, "Pornic 44210", { communeAcceptee: true }).action === "aucune", "la commune elle-même refusée : plus d'échelle (la règle « chez nous » prend le relais)");
  const m1 = messageAutreAdresseLbc("25bis Rue de la Fontaine aux Bretons 44210 Pornic", "25 bis Rue de la Fontaine aux Bretons");
  const m2 = messageAutreAdresseLbc("Rue de la Fontaine aux Bretons 44210 Pornic", "Pornic 44210", true);
  ok(/TOUJOURS en ligne/.test(m1) && /Rien à faire/.test(m1) && !/R[ée]glages/.test(m1) && !/accepté cette même adresse/.test(m1), "message d'un nouvel essai : vrai, rien à faire");
  ok(/commune, « Pornic 44210 »/.test(m2) && /acceptée pour tes publications/.test(m2), "message de la commune : celle que Leboncoin a acceptée");
}

console.log("4. get-pending-jobs ne remet jamais la rue : chaque écriture part telle quelle");
{
  const job = (lo) => ({ id: "4f2ba6f3", platform: "leboncoin", action: "republish", platform_fields: { localisation_origine: lo } });
  const r1 = prochaineAdresseLbc(loServie, "25bis Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true });
  ok(decisionRueInconnueLbc(job(r1.lo), reglages, false).action === "tel_quel" && decisionRueInconnueLbc(job(r1.lo), reglages, true).action === "tel_quel",
    "la variante servie n'est pas retirée par la règle « rue inconnue »");
  const r3 = prochaineAdresseLbc(prochaineAdresseLbc(r1.lo, "25 bis Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true }).lo,
    "Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true });
  ok(decisionAdresseRepublicationLbc(job(r3.lo), reglages, false).action === "tel_quel", "la commune servie : la rue des Réglages n'est jamais remise (règle du 01/10)");
}

console.log("5. update-job-status branche l'échelle avant « chez nous »");
{
  const ujs = readFileSync("supabase/functions/update-job-status/index.ts", "utf8");
  ok(/prochaineAdresseLbc\(loEchelle \?\? null, adresseRefusee, \{ communeAcceptee \}\)/.test(ujs), "l'échelle est jouée sur l'adresse refusée");
  ok(/ech\.action === "aucune" \? publicationAvecLaMemeAdresse\(adresseRefusee/.test(ujs), "« chez nous » seulement quand l'échelle est au bout");
  ok(/statutEffectif = "pending";\s*messageEffectif = messageAutreAdresseLbc/.test(ujs), "un nouvel essai repasse pending, jamais needs_user");
  ok(/\.eq\("platform_fields->localisation_origine->>voie", voieRefusee\)\.limit\(200\)/.test(ujs)
    && /\.eq\("id", s\.id\)\.eq\("status", "pending"\)\.eq\("platform_fields->localisation_origine->>voie", voieRefusee\)/.test(ujs),
    "les autres tâches qui tapent la MÊME rue suivent (en attente seulement, compare-and-swap sur la rue)");
  ok(/pfS\["republish_step"\] === "deleted"/.test(ujs), "jamais une tâche dont l'annonce est déjà retirée");
}

console.log("6. Une sœur suit la même écriture, pas une autre");
{
  const soeur = { ...loServie };
  const d = prochaineAdresseLbc(soeur, "25bis Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true });
  ok(d.action === "variante" && d.voie === "25 bis Rue de la Fontaine aux Bretons", "même rue refusée : la sœur passe à la même écriture");
  const autre = { ...loServie, voie: "4 Rue Du Hameau", code_postal: "26230", ville: "Chantemerle-lès-Grignan" };
  ok(prochaineAdresseLbc(autre, "25bis Rue de la Fontaine aux Bretons 44210 Pornic", { communeAcceptee: true }).action === "aucune", "une autre rue : rien ne change");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
