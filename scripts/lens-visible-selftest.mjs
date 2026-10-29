// Selftest — (29/10, lot C partie 3) LENS : CE QU'AUCUNE PHOTO NE MONTRE N'EST JAMAIS ÉCRIT ; LE BON NOM DU VÊTEMENT ;
// UN VÊTEMENT AU RAYON DES VÊTEMENTS. Contrôles du code servi (lens-analysis) et de la règle de rayon (familleCategorie).
// La preuve de comportement est le banc réel : scripts/bancs/lens/ (25 articles, avant / après).
//     npm run selftest:lens-visible
import { readFileSync } from "node:fs";
import { familleFiltreDesCandidates } from "../src/utils/familleCategorie.js";

let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}`); } };
const L = readFileSync(new URL("../supabase/functions/lens-analysis/index.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("1. Le prompt");
ok(!/sous différents angles \(face, dos, étiquette/.test(L) && !/as different views \(front, back, label/.test(L), "la phrase multi-photos n'annonce plus un « dos » photographié");
ok(/une vue qu'AUCUNE photo ne montre \(le dos, l'intérieur, une étiquette\) n'existe pas pour toi/.test(L), "une vue qu'aucune photo ne montre n'existe pas (FR)");
ok(/CE QU'AUCUNE PHOTO NE MONTRE NE S'ÉCRIT JAMAIS/.test(L) && /WHAT NO PHOTO SHOWS IS NEVER WRITTEN/.test(L), "la règle du visible, en français et en anglais");
ok(/Un col montant n'est pas une capuche/.test(L), "un col montant n'est pas une capuche");
ok(/« polaire » \(maille synthétique pelucheuse/.test(L) && /« softshell »/.test(L) && /« coupe-vent »/.test(L) && /« sweat »/.test(L), "le vocabulaire des vêtements (polaire, softshell, coupe-vent, sweat…)");
ok(/« veste de sport », « veste de survêtement »/.test(L), "« veste de sport » ne s'écrit que s'il est établi");
ok((L.match(/\$\{couleurRule\}\$\{typeRule\}\$\{visibleRule\}\$\{lectureTexteRule\}/g) ?? []).length === 2, "la règle entre dans les deux langues du prompt");
ok(/Une marque LUE NETTEMENT \(lettres entières sur une étiquette, un logo, une boîte\) se renseigne TELLE QUE LUE/.test(L), "une marque lue nettement reste, même sans trace en ligne (C.P.E. Classic Club)");
ok(/JEUX VIDÉO ET JEUX DE SOCIÉTÉ : l'ÉDITEUR lu sur la boîte/.test(L), "l'éditeur d'un jeu est sa marque (Bethesda)");
ok(/const VERSION_PROMPT = "2026-10-29-visible-seulement-vetements";/.test(L), "la version du prompt change (le cache ne sert plus l'ancienne lecture)");

console.log("2. Le modèle du scan");
ok(/let modeleScan = "claude-haiku-5-5";/.test(L) && /eq\("key", "lens_scan_haiku45"\)/.test(L), "Haiku 5.5 par défaut, retour à Haiku 4.5 par coin_config.lens_scan_haiku45 = 1");
ok(/\? \{ max_tokens: estIdentify \? 6000 : 8000, output_config: \{ effort: "low" \} \}\s*: \{ max_tokens: estIdentify \? 1500 : 2500, temperature: 0 \}/.test(L), "famille 5.5 : sans temperature, effort low, marge de réflexion ; Haiku 4.5 : à l'identique");
ok(/\.\.\.\(famille55 \? \[\] : \[\{ role: "assistant", content: "\{" \}\]\)/.test(L), "famille 5.5 : jamais de prefill (400)");
ok(/famille55 \? TARIF_HAIKU_55_USD : TARIF_HAIKU_USD/.test(L), "le coût journalisé suit le modèle");
ok(/type: "web_search_20250305"/.test(L), "Haiku : l'outil de recherche de base (pas de variante 20260209)");

console.log("3. Un vêtement au rayon des vêtements");
ok(familleFiltreDesCandidates("leboncoin", { famille: "mode" }) === "mode", "Leboncoin : une fiche Lens « mode » filtre les candidates du mot (plus jamais « Loisirs > Sport & Plein air »)");
ok(familleFiltreDesCandidates("vinted", { attributs: { famille: { v: "chaussures" } } }) === "mode", "Vinted : « chaussures » aussi");
ok(familleFiltreDesCandidates("ebay", { famille: "mode" }) === null && familleFiltreDesCandidates("depop", { famille: "mode" }) === null, "eBay et Depop : inchangés");
ok(familleFiltreDesCandidates("beebs", { famille: "maison_deco" }) === "maison" && familleFiltreDesCandidates("leboncoin", { famille: "maison_deco" }) === null, "la règle Beebs du 25/10 : inchangée");

console.log(rouges ? `\n✗ lens-visible : ${rouges} rouge(s), ${verts} verts` : `\n✓ lens-visible : ${verts} contrôles verts, 0 rouges`);
process.exit(rouges ? 1 : 0);
