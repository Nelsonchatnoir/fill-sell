// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : LES CONSIGNES DU VENDEUR PASSENT EN PREMIER.
//
//     npm run selftest:consignes-en-tete
//
// Compte de63ca45 (propositions du 02/11) : ses consignes étaient ajoutées EN DERNIER au prompt, sous des blocs de forme
// génériques qui les contredisaient — « STRUCTURE — phrases suivies, sans liste à puces », « 5. Une courte ligne de fin
// sur l'envoi », « LONGUEUR — 300 à 650 », « HASHTAGS — OBLIGATOIRES », le ton du gabarit (« quelques emojis 🌟✨ »).
// Décision de Nico (12/11) : avec des consignes, elles passent EN PREMIER et ces blocs s'effacent ; restent « ne rien
// inventer », les plafonds et les listes fermées. Sans consigne : le prompt d'avant, à l'octet près (Vinted, Leboncoin,
// eBay ; Beebs : seule la ligne des hashtags change, la table des capacités tranche « aucun », comme à la publication).
// Le VRAI module tourne (scripts/lib/rejeu-redaction.ts) ; seul l'appel au modèle est remplacé, le prompt est relevé.
import { compteur, importer, lireFixture, rejouer, ficheDeRejeu, racineDuCode } from "./lib/rejeu-redaction.ts";

const { ok, fin } = compteur();
const R = await importer("supabase/functions/_shared/redaction-plateformes.ts");
const fx = await lireFixture();
const crash = ficheDeRejeu(fx.fiches.find((f) => f.inventaire_id === "1793613236541")!);
const PF = ["vinted", "leboncoin", "beebs", "ebay"];

const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
  .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

console.log("1. Avec ses consignes (compte de63ca45) : elles EN TÊTE, les blocs de forme génériques effacés");
{
  const r = await rejouer(R, { platforms: PF, sorties: crash.sorties, item: crash.item, canonicalProvided: crash.canonicalProvided, consignes: fx.consignes, note: crash.note });
  for (const p of PF) {
    const s = r.systemes[p] ?? "";
    ok(s.startsWith("CONSIGNES DU VENDEUR"), `${p} : le prompt COMMENCE par ses consignes`, s.slice(0, 80));
    ok(!/STRUCTURE — phrases suivies/.test(s) && !/5\. Une courte ligne de fin/.test(s), `${p} : plus de « STRUCTURE — phrases suivies » ni de « ligne de fin » du gabarit`);
    ok(!/OBLIGATOIRES/.test(s) && !/quelques emojis/.test(s) && !/Ton ?: (?:conversationnel|direct, factuel, modes|punchy|structuré, technique)/.test(s), `${p} : plus de hashtags OBLIGATOIRES, de « quelques emojis », de ton du gabarit`);
    ok(!/QUAND la matière le permet/.test(s), `${p} : plus de longueur CIBLE (seul le plafond dur reste)`);
    ok(/GARDE-FOU ABSOLU/.test(s) && /Plafond dur|plafond dur/.test(s) && /Retourne UNIQUEMENT du JSON valide/.test(s) && /TITRE — RÉFÉRENCE COMMERCIALE/.test(s),
      `${p} : restent le garde-fou, le plafond dur, les listes fermées (JSON) et le titre sans SKU`);
    ok(/négations comprises/.test(s) && /N'écris ni la phrase de test/.test(s), `${p} : la négation est dite, la phrase de test et les phrases de fin sont posées par FillSell`);
  }
}

console.log("2. Sans consigne ni note : le prompt d'avant, à l'octet près (empreintes relevées sur main 3470227)");
{
  const item = { titre: "Pull laine bleu", marque: "Jules", type: "Mode", description: "Pull en laine bleu, taille M." };
  const sorties = Object.fromEntries(PF.map((p) => [p, { title: "Pull Jules", description: "Pull bleu.", platform_fields: {} }]));
  const r = await rejouer(R, { platforms: PF, sorties, item, canonicalProvided: { etat: "Très bon état" } });
  const AVANT: Record<string, string> = { vinted: "d71bd93549df29f0", leboncoin: "448bd529a1cd64ba", ebay: "3f4c295642998db4", beebs: "f349726fd61a0b38" };
  for (const p of ["vinted", "leboncoin", "ebay"]) ok(await hash(r.systemes[p] ?? "") === AVANT[p], `${p} : prompt identique à main`, await hash(r.systemes[p] ?? ""));
  // Beebs : la ligne des hashtags vient de la table des capacités (aucun, comme ce qui part depuis le 30/10) ; le reste
  // est l'octet près de main — on remet la ligne d'avant (celle de Vinted, mot pour mot) pour le prouver.
  const ligneVinted = (r.systemes.vinted ?? "").split("\n").find((l) => l.startsWith("HASHTAGS — ")) ?? "";
  const beebs = r.systemes.beebs ?? "";
  ok(/\nHASHTAGS — NON sur cette plateforme/.test(beebs), "beebs : « HASHTAGS — NON » (la table des capacités)");
  ok(await hash(beebs.replace(/\nHASHTAGS — [^\n]*/, `\n${ligneVinted}`)) === AVANT.beebs, "beebs : tout le reste identique à main", await hash(beebs.replace(/\nHASHTAGS — [^\n]*/, `\n${ligneVinted}`)));
}

console.log("3. Le code");
{
  const src = await Deno.readTextFile(new URL("supabase/functions/_shared/redaction-plateformes.ts", racineDuCode()));
  ok(/export const VERSION_PROMPT = "2026-11-13a"/.test(src), "VERSION_PROMPT relevé (2026-11-13a)");
  ok(/systemeRedaction\(platform, \{/.test(src) && !/\+ \(directiveConsignes\(consignes\) \?/.test(src), "un seul constructeur du prompt ; les consignes ne sont plus ajoutées en dernier");
}
fin();
