// Autotest — le filtre « contenu actif » d'eBay ne voit plus de code dans un texte de vendeur (08/11, point 2 de Nico).
// `npm run selftest:ebay-contenu-actif` (deno). Cas réel : Sébastien, job 8d59f147, CD Mort Shuman — « Compilation de
// la collection Expression (PolyGram) » refusé deux fois (25002, DESCRIPTION) à publishOffer.
import assert from "node:assert/strict";
import { descriptionEbay, sansContenuActifEbay } from "../supabase/functions/_shared/ebay-publication.ts";

const texteVisible = (html: string) => html
  .replace(/<br>/g, "\n").replace(/<\/p><p>/g, "\n\n").replace(/<[^>]+>/g, "")
  .replace(/&#40;/g, "(").replace(/&#46;/g, ".").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// Les motifs qu'eBay refuse, cherchés comme le ferait un filtre : HTML brut, balises retirées, ou entités décodées.
const MOTIF = /(expression|replace|eval|cookie)\s*\(|\.\s*cookie/i;
const brut = (h: string) => h;
const sansBalises = (h: string) => h.replace(/<[^>]+>/g, "");
const entitesDecodees = (h: string) => h.replace(/&#40;/g, "(").replace(/&#46;/g, ".");
let n = 0;
const ok = (c: boolean, nom: string) => { assert.ok(c, nom); console.log(`  ✓ ${nom}`); n++; };

console.log("\n1. LE CAS DU 08/11 (Sébastien, 8d59f147)");
const reel = "• Artiste : Mort Shuman\n• Album : Compilation de la collection Expression (PolyGram).\n• Titres inclus : Le Lac Majeur, Papa Tango Charly…\nEnvoi rapide (sous 24h/48h).";
const h = descriptionEbay(reel, "Mort Shuman - Compilation \"Expression\" (16 titres)");
ok(!MOTIF.test(brut(h)), "HTML brut : plus aucun motif de code");
ok(!MOTIF.test(sansBalises(h)), "balises retirées : plus aucun motif");
ok(!MOTIF.test(entitesDecodees(h)), "entités décodées : plus aucun motif");
ok(texteVisible(h) === reel, "le texte VISIBLE est exactement celui du vendeur");
ok(h.includes("rapide (sous"), "« rapide ( » intact (passé chez eBay, aucun motif)");
ok(!/[​-‏⁠﻿­]/.test(h), "aucun caractère invisible ajouté (règle du 05/11)");

console.log("\n2. LES AUTRES MOTIFS NOMMÉS PAR EBAY");
for (const t of ["Peut remplacer : replace (ancien modèle)", "medieval (French Edition)", "Boîte à cookie(s)", "Voir document.cookie", "Info. Cookie offert", "eval(1)"]) {
  const x = descriptionEbay(t, "");
  ok(!MOTIF.test(brut(x)) && !MOTIF.test(sansBalises(x)) && !MOTIF.test(entitesDecodees(x)) && texteVisible(x) === t, `« ${t} » : neutralisé, visible identique`);
}

console.log("\n3. RIEN D'AUTRE NE CHANGE");
for (const t of ["JavaScript pour les Nuls", "Lot de cookie cutters", "Paul & Shark <taille M>", "Ligne 1\n\nLigne 3"]) {
  const avant = `<p>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  ok(descriptionEbay(t, "") === avant, `« ${t.replace(/\n/g, "⏎")} » : HTML identique à celui d'avant`);
}
ok(sansContenuActifEbay("") === "", "texte vide : rien");
const long = "a".repeat(3990) + " Expression (X)";
const coupe = descriptionEbay(long, "");
ok(coupe.length <= 4000 && !/<[^>]*$/.test(coupe) && !/&[#a-z0-9]*$/i.test(coupe), "coupé à 4000 : jamais une balise ni une entité coupée");

console.log(`\n✓ ${n} vérifications : le texte du vendeur part tel qu'il se lit, sans motif que le filtre d'eBay prend pour du code`);
