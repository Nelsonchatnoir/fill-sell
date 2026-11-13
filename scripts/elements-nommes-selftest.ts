// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : DOCUMENTS ET ÉDITIONS NOMMÉS CORRECTEMENT.
//
//     npm run selftest:elements-nommes
//
// Compte de63ca45, propositions du 02/11 (6 sur 7 nomment mal) : Rise of the Tomb Raider (sa note : « la pochette
// cartonnée », « le livret ») → « Boîte cartonnée édition 20ème anniversaire », « Boîtier : … », « Jaquette : excellent
// état » ; Crash (sa note : « la boîte », « la jaquette », « un petit feuillet ») → « version française intégrale »,
// « édité par Activision ». Ses consignes : « Ne pas confondre notice, guide, livret et feuillet ».
// La règle, pour tous les comptes : la note du vendeur est LA source des faits (la lecture des photos ne l'est plus quand
// il en a laissé une) ; ses éléments sont donnés au modèle avec SES mots ; après le modèle, un document, un contenant ou
// une édition que la source ne nomme pas tombe, comme un éditeur, un PEGI ou une version linguistique non dits.
// ⚠️ LIMITE, dite et non verrouillée : sans note (Detroit, Immortals, Minecraft), la source est la lecture des photos, et
//    c'est ELLE qui dit « notice » pour un feuillet — la reprise de l'intitulé lisible relève de la lecture des photos
//    (lens-analysis, prompt et cache), hors de ce correctif (question à Nico, rapport de l'étape 5, agent H).
import { compteur, importer, lireFixture, rejouer, ficheDeRejeu } from "./lib/rejeu-redaction.ts";

const { ok, fin } = compteur();
const R = await importer("supabase/functions/_shared/redaction-plateformes.ts");
let F: Record<string, unknown> | null = null;
try { F = await importer("src/utils/faitsSansSource.js"); } catch { F = null; }
const fx = await lireFixture();
const fiche = (id: string) => ficheDeRejeu(fx.fiches.find((f) => f.inventaire_id === id)!);
const PF = ["vinted", "leboncoin", "beebs", "ebay"];

console.log("1. Rise of the Tomb Raider — sa note : « pochette cartonnée », « livret »");
{
  const t = fiche("1793616560678");
  const r = await rejouer(R, { platforms: PF, sorties: t.sorties, item: t.item, canonicalProvided: t.canonicalProvided, consignes: fx.consignes, note: t.note });
  for (const p of PF) {
    const d = r.platformListings[p]?.description ?? "";
    ok(!/Bo[iî]te cartonn/i.test(d) && !/Version bo[iî]te/i.test(d) && !/Jaquette/i.test(d), `${p} : ni « Boîte cartonnée », ni « Version boîte », ni « Jaquette » (sa note n'en nomme aucun)`, d.slice(0, 500));
    ok(/Livret/.test(d) && /Disque/.test(d), `${p} : « Livret » et « Disque » (nommés par sa note) restent`);
    // Un défaut ne tombe jamais pour un nom : « Boîtier : petites marques d'usure » (la pochette, mal nommée) reste —
    // l'effacer cacherait la seule usure de l'annonce.
    ok(/marques d'usure/.test(d), `${p} : l'usure de la pochette (seul défaut dit) reste, même sous un nom approximatif`, d.slice(0, 500));
  }
  ok(/ÉLÉMENTS NOMMÉS PAR LE VENDEUR \(sa note\) : pochette, livret\./.test(r.systemes.vinted ?? ""), "le prompt donne ses éléments avec SES mots : pochette, livret", (r.systemes.vinted ?? "").match(/ÉLÉMENTS NOMMÉS[^\n]{0,80}/)?.[0]);
  ok(/Lecture des photos \(indicative — la note du vendeur ci-dessous fait foi/.test(r.itemContext), "la lecture des photos n'est plus donnée comme un fait quand il y a une note");
}

console.log("2. Crash Team Racing — sa note : « la boîte », « la jaquette », « un petit feuillet »");
{
  const t = fiche("1793613236541");
  const r = await rejouer(R, { platforms: PF, sorties: t.sorties, item: t.item, canonicalProvided: t.canonicalProvided, consignes: fx.consignes, note: t.note });
  for (const p of PF) {
    const d = r.platformListings[p]?.description ?? "";
    ok(!/version française/i.test(d) && !/édité par|éditeur/i.test(d), `${p} : ni « version française intégrale », ni « édité par Activision » (non dits)`, d.slice(0, 300));
    ok(/Feuillet/.test(d) && /Bo[iî]te/.test(d) && /Jaquette/.test(d), `${p} : boîte, jaquette, feuillet (ses mots) restent`);
  }
}

console.log("3. GTA V — « sans boîtier, sans jaquette ni notice » dit une ABSENCE (sa note : « pas de boîte, pas de jaquette »)");
{
  const t = fiche("1793616052050");
  const r = await rejouer(R, { platforms: ["vinted"], sorties: t.sorties, item: t.item, canonicalProvided: t.canonicalProvided, consignes: fx.consignes, note: t.note });
  const d = r.platformListings.vinted?.description ?? "";
  ok(/sans boîtier, sans jaquette ni notice/.test(d), "une absence n'est pas un élément nommé : gardée", d);
  ok(!/propre/.test(d.replace(/main propre/g, "")), "« surface brillante et propre » (lecture des photos, pas sa note) tombe");
}

console.log("4. NBA 2K21 — sans note : la lecture des photos (« feuillet de contenu bonus », « jaquette en bon état ») fait foi");
{
  const t = fiche("1793615322272");
  const r = await rejouer(R, { platforms: ["vinted"], sorties: t.sorties, item: t.item, canonicalProvided: t.canonicalProvided, consignes: fx.consignes, note: t.note });
  const d = r.platformListings.vinted?.description ?? "";
  ok(/Feuillet de contenu bonus/.test(d), "« Feuillet de contenu bonus » (son nom lu) reste", d);
  ok(!/excellent/.test(d), "« excellent état » (jamais lu) tombe");
}

console.log("5. La règle, sur des cas simples (tous comptes)");
{
  const retirer = F?.retirerFaitsSansSource as ((t: string, o: unknown) => { texte: string }) | undefined;
  ok(retirer?.("Notice présente.\nDisque en bon état.", { sources: ["Le disque et le feuillet publicitaire PlayStation Plus."] }).texte === "Disque en bon état.", "« Notice » quand la source dit « feuillet » : tombe");
  ok(retirer?.("Feuillet publicitaire présent.", { sources: ["un feuillet publicitaire"] }).texte === "Feuillet publicitaire présent.", "« Feuillet » quand la source dit « feuillet » : reste");
  ok(retirer?.("Jeu PS4, édition Collector.", { sources: ["Jeu PS4 Destiny"] }).texte === "Jeu PS4.", "une édition que la source ne nomme pas tombe");
  ok(retirer?.("Jeu PS4, édition Collector.", { sources: ["Destiny édition Collector PS4"] }).texte === "Jeu PS4, édition Collector.", "nommée par le titre : elle reste");
  ok(retirer?.("Pull en laine bleu. Remise en main propre possible.", { sources: ["Pull en laine bleu"] }).texte === "Pull en laine bleu. Remise en main propre possible.", "« remise en main propre » n'est pas un embellissement");
}
fin();
