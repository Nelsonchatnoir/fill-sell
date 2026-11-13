// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : UN ÉTAT N'EST JAMAIS EMBELLI.
//
//     npm run selftest:etat-jamais-embelli
//
// Compte de63ca45, propositions du 02/11 (7 sur 7 embellissent) : « fermeture impeccable » pour « elle ferme bien »,
// « Jaquette propre, sans dommage » pour « pas du tout abîmée », « Jaquette : excellent état » sur une lecture
// « jaquette en bon état ». Et côté code : etatFidele (26/10) remplaçait toute formule d'état par celle de la fiche —
// « Boîtier en bon état » devenait « Boîtier en très bon état » ; retirerEtatContredit retirait « Boîtier en bon état »
// quand le champ disait « Très bon état » (un état moins bon caché = embelli) ; et sans état connu, « Très bon état »
// partout par défaut. Décision de Nico : état jamais embelli, etatFidele ne monte jamais un état, état inconnu =
// question (plus de « Très bon état » par défaut).
import { compteur, importer, lireFixture, rejouer, ficheDeRejeu } from "./lib/rejeu-redaction.ts";

const { ok, fin } = compteur();
const D = await importer("src/publication/moteur/descriptionFidele.js") as { etatFidele: (t: string, e: string) => string; descriptionFidele: (t: string, p: string, o: unknown) => string };
const E = await importer("supabase/functions/_shared/etat-plateformes.js") as { retirerEtatContredit: (t: string, e: string) => { texte: string; modifie: boolean } };
const R = await importer("supabase/functions/_shared/redaction-plateformes.ts");
const fx = await lireFixture();

console.log("1. etatFidele ne monte jamais un état (texte rédigé par FillSell, à la publication)");
ok(D.etatFidele("Boîtier en bon état.", "Très bon état") === "Boîtier en bon état.", "fiche « Très bon état » : « Boîtier en bon état » reste « bon état »", D.etatFidele("Boîtier en bon état.", "Très bon état"));
ok(D.etatFidele("Bon état général, porté quelques fois.", "Très bon état") === "Bon état général, porté quelques fois.", "« Bon état général » n'est plus réécrit « Très bon état général »");
ok(D.etatFidele("Disque comme neuf.", "Très bon état") === "Disque comme neuf.", "« Disque comme neuf » (une partie) n'est pas touché");
ok(D.etatFidele("Article en excellent état.", "Bon état") === "Article en excellent état.".replace("excellent état", "bon état"), "un état général MEILLEUR que la fiche est ramené à la fiche (jamais l'inverse)");
ok(D.etatFidele("Article neuf avec étiquette.", "Bon état") === "Article bon état.", "« neuf avec étiquette » sur une fiche « Bon état » : ramené");

console.log("2. retirerEtatContredit ne cache plus l'état d'une partie (génération)");
{
  const r = E.retirerEtatContredit("Boîtier en bon état. Disque en excellent état. Jaquette propre.", "Très bon état");
  ok(!r.modifie, "« Boîtier en bon état » n'est plus retiré quand le champ dit « Très bon état »", r.texte);
  const louis = E.retirerEtatContredit("Rangement blanc. Article en TRÈS BON ÉTAT. Envoi rapide.", "Neuf sans étiquette");
  ok(louis.modifie && !/TRÈS BON ÉTAT/.test(louis.texte), "l'état GÉNÉRAL qui contredit le champ tombe toujours (cas du 21/09)", louis.texte);
}

console.log("3. Rédaction : les embellissements sans source tombent (ses fiches réelles, sorties stockées)");
{
  const crash = ficheDeRejeu(fx.fiches.find((f) => f.inventaire_id === "1793613236541")!);
  const r = await rejouer(R, { platforms: ["vinted", "leboncoin", "beebs", "ebay"], sorties: crash.sorties, item: crash.item, canonicalProvided: crash.canonicalProvided, consignes: fx.consignes, note: crash.note });
  for (const p of ["vinted", "leboncoin", "beebs", "ebay"]) {
    const d = r.platformListings[p]?.description ?? "";
    ok(!/impeccable/i.test(d) && !/sans dommage/i.test(d) && !/Jaquette propre/i.test(d), `Crash — ${p} : ni « fermeture impeccable », ni « sans dommage », ni « Jaquette propre » (sa note : « elle ferme bien », « pas du tout abîmée »)`, d.slice(0, 400));
    ok(/excellent état/.test(d) && /micro-rayure/.test(d), `Crash — ${p} : « excellent état » du disque et les micro-rayures (dits par sa note) restent`);
  }
  const nba = ficheDeRejeu(fx.fiches.find((f) => f.inventaire_id === "1793615322272")!);
  const rn = await rejouer(R, { platforms: ["vinted"], sorties: nba.sorties, item: nba.item, canonicalProvided: nba.canonicalProvided, consignes: fx.consignes, note: nba.note });
  const dn = rn.platformListings.vinted?.description ?? "";
  ok(!/Jaquette : excellent/.test(dn) && !/Fermeture impeccable/.test(dn), "NBA 2K21 (lecture « jaquette en bon état ») : « Jaquette : excellent état » et « Fermeture impeccable » tombent", dn);
}

console.log("4. État inconnu = question : plus de « Très bon état » par défaut");
{
  const PF = ["vinted", "leboncoin", "beebs", "ebay"];
  const sorties = Object.fromEntries(PF.map((p) => [p, { title: "Lampe de bureau", description: "Lampe de bureau en métal noir. Article en très bon état.", platform_fields: { etat: "Très bon état" } }]));
  const r = await rejouer(R, { platforms: PF, sorties, item: { titre: "Lampe de bureau", type: "Maison", description: "Lampe de bureau en métal noir." } });
  ok(PF.every((p) => r.platformListings[p]?.platform_fields?.etat == null), "aucun état connu : le champ part VIDE partout (la question sera posée), jamais « Très bon état »",
    Object.fromEntries(PF.map((p) => [p, r.platformListings[p]?.platform_fields?.etat])));
  ok(r.traceEtat?.etat_branche === "inconnu" && r.traceEtat?.etat_tier == null, "trace : branche « inconnu »", r.traceEtat);
  ok(PF.every((p) => !/très bon état/i.test(r.platformListings[p]?.description ?? "")), "le texte n'affirme pas un état que personne n'a donné", r.platformListings.vinted?.description);
  const r2 = await rejouer(R, { platforms: PF, sorties, item: { titre: "Lampe de bureau", type: "Maison", description: "Lampe en métal noir." }, canonicalProvided: { etat: "Bon état" } });
  ok(PF.every((p) => r2.platformListings[p]?.platform_fields?.etat === "Bon état"), "un état connu (« Bon état ») part tel quel, comme avant");
}
fin();
