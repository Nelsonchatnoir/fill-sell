// Autotest de src/utils/consignesRedaction.js — les consignes du vendeur pour l'IA (29/10, lot B 1.3, promesse XEWER).
//   node scripts/consignes-redaction-selftest.mjs
import { readFileSync } from "node:fs";
import {
  consignesValides, aDesConsignes, directiveConsignes, consigneSansHashtag, consigneSansEmoji, LONGUEUR_MAX_CONSIGNE,
} from "../src/utils/consignesRedaction.js";

let ko = 0;
const ok = (cond, nom) => { if (cond) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}`); } };

// Le modèle de XEWER (mail du 27/10) : structure du titre, de la description, état, mentions.
const xewer = {
  ton: "precis",
  titre: "Nom du jeu + console + état + « PAL FR »",
  description: "Une ligne par élément : boîte, notice, disque ou cartouche. Puis « testé et fonctionnel ».",
  etat: "Toujours nommer les traces et micro-rayures, jamais « comme neuf ».",
  toujours: "Envoi soigné sous 48 h.",
  eviter: "Pas de hashtags, pas d'émojis.",
  inconnu: "jeté",
};
console.log("1. Les consignes lisibles");
const v = consignesValides(xewer);
ok(!("inconnu" in v) && v.ton === "precis" && v.titre.startsWith("Nom du jeu"), "champs connus gardés, inconnus jetés");
ok(!aDesConsignes({}) && !aDesConsignes(null) && aDesConsignes({ toujours: "x" }), "vide → aucune consigne");
ok(consignesValides({ ton: "agressif" }).ton === undefined, "un ton hors liste est jeté");
ok(consignesValides({ titre: "a".repeat(2000) }).titre.length === LONGUEUR_MAX_CONSIGNE, "longueur bornée");
ok(!/[<>]/.test(consignesValides({ titre: "<b>titre</b>" }).titre), "aucune balise");
console.log("2. La directive du prompt");
const d = directiveConsignes(xewer);
ok(d.startsWith("CONSIGNES DU VENDEUR") && /Structure de ses titres : Nom du jeu/.test(d) && /À éviter : Pas de hashtags/.test(d), "chaque consigne y figure");
ok(/ne changent JAMAIS un fait/.test(d) && /listes fermées/.test(d), "les faits et les listes fermées restent intouchables");
ok(directiveConsignes({}) === "", "sans consigne : prompt d'avant, à l'identique");
ok(consigneSansHashtag(xewer) && consigneSansEmoji(xewer) && !consigneSansHashtag({ eviter: "rare" }), "« pas de hashtags / d'émojis » est reconnu");
console.log("3. Le serveur s'en sert à chaque rédaction (lecture du code)");
const red = readFileSync(new URL("../supabase/functions/_shared/redaction-plateformes.ts", import.meta.url), "utf8");
ok(/directiveConsignes\(/.test(red), "redaction-plateformes.ts ajoute la directive au prompt");
const gl = readFileSync(new URL("../supabase/functions/generate-listing/index.ts", import.meta.url), "utf8");
const la = readFileSync(new URL("../supabase/functions/lens-analysis/index.ts", import.meta.url), "utf8");
ok(/consignes/.test(gl) && /consignes/.test(la), "generate-listing et lens-analysis lisent les consignes du compte");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
console.log("\ntout passe");
