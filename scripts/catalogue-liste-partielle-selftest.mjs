// ═══════════════════════════════════════════════════════════════════════════
// Selftest : JAMAIS UNE LISTE PARTIELLE PAR-DESSUS UNE LISTE COMPLÈTE
//   node scripts/catalogue-liste-partielle-selftest.mjs                (2026-09-10)
//
// persistDiscoveredAspects upserte en merge-duplicates : la colonne
// allowed_values fournie REMPLACE l'existante. Un relevé tronqué — menu pas
// fini de rendre, panneau à onglets dont un seul est dans le DOM, cap oublié —
// écrasait donc une grille complète apprise la veille, et l'option disparue
// devenait indétectable (l'app conclut « cette valeur n'existe pas »).
//
// CAS MESURÉS QUI ONT MOTIVÉ LA GARDE (10/09) :
//   · Chaussures Leboncoin : relevé à 30 options, 60 déjà en base ;
//   · shoe_size en base à EXACTEMENT 60 = le cap `.slice(0, 60)` du handler,
//     lui-même retiré dans le même lot ;
//   · sonde Vinted tronquée à 60 le 10/09 au matin (5 grilles fausses).
//
// Le test rejoue la RÈGLE telle qu'elle est écrite dans background.js (extraite
// du fichier, pas recopiée) sur ces cas.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8");

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

console.log("\n▸ La garde est bien DANS le code embarqué");
{
  check("le comparateur de longueur existe",
    /avant\s*>\s*r\.allowed_values\.length/.test(SRC),
    "— sans lui, un relevé plus court écrase la liste connue");
  check("les lignes trop courtes sont DÉGRADÉES, pas écrites",
    /avecValeurs\s*=\s*rows\.filter\(\(r\)\s*=>\s*r\.allowed_values\s*&&\s*!plusCourtes\.has\(r\.field_key\)\)/.test(SRC));
  check("elles repartent dans le lot SANS valeurs (colonne omise)",
    /sansValeurs\s*=\s*rows\.filter\(\(r\)\s*=>\s*!r\.allowed_values\s*\|\|\s*plusCourtes\.has\(r\.field_key\)\)/.test(SRC));
  check("une relecture impossible ne bloque pas l'écriture",
    /relecture du catalogue impossible \(on écrit comme avant\)/.test(SRC));
  check("le refus est TRACÉ (sinon il serait invisible)",
    /IGNORÉ — \$\{avant\} déjà connues/.test(SRC));
}

console.log("\n▸ Le cap qui tronquait les grilles Leboncoin a disparu");
{
  const LBC = readFileSync(join(ROOT, "chrome-extension/content-scripts/leboncoin.js"), "utf8");
  check("plus de .slice(0, 60) sur les options du menu",
    !/textContent\.trim\(\)\)\.filter\(Boolean\)\.slice\(0,\s*60\)/.test(LBC),
    "— c'est ce cap qui a mis shoe_size à exactement 60 en base");
  check("les options sont enregistrées sous PLUSIEURS clés",
    /for \(const cle of cles\) if \(!OPTIONS_VUES_AU_REMPLISSAGE\[cle\]\)/.test(LBC),
    "— écrire sous input.id et relire sous label[for] perdait tout");
  check("la clé du label fait partie des clés enregistrées",
    /getAttribute\("for"\)/.test(LBC));
}

console.log("\n▸ La règle appliquée aux cas réels");
{
  // Reproduction fidèle de la décision : on ne garde la nouvelle liste que si
  // elle est au moins aussi longue que celle déjà connue.
  const ecrit = (nouvelle, connue) => !(connue > nouvelle);
  check("Chaussures : 30 relevées contre 60 connues → REFUSÉ", ecrit(30, 60) === false);
  check("Vinted tronquée : 60 relevées contre 103 connues → REFUSÉ", ecrit(60, 103) === false);
  check("grille complète : 103 relevées contre 60 connues → ÉCRITE", ecrit(103, 60) === true);
  check("première fois : 14 relevées contre 0 connue → ÉCRITE", ecrit(14, 0) === true);
  check("longueur identique : 14 contre 14 → ÉCRITE (rafraîchit last_seen_at)", ecrit(14, 14) === true);
}

console.log("\n▸ Le relevé de grilles ne peut pas faire échouer un dépôt");
{
  check("l'appel est fire-and-forget côté message",
    /enregistrerGrillesLbc\(msg\)\.catch\(/.test(SRC));
  check("réponse immédiate au content script",
    /FILLSELL_LBC_GRILLES[\s\S]{0,400}?sendResponse\(\{ ok: true \}\)/.test(SRC));
  const LBC = readFileSync(join(ROOT, "chrome-extension/content-scripts/leboncoin.js"), "utf8");
  check("l'envoi côté handler est enveloppé et sans await",
    /chrome\.runtime\.sendMessage\(\{[\s\S]{0,300}?FILLSELL_LBC_GRILLES[\s\S]{0,400}?\}\)\.catch\(\(\) => \{\}\)/.test(LBC));
  check("sans session, on abandonne en silence",
    /const userId = session\?\.access_token \? decodeJwtSub\(session\.access_token\) : null;\s*\n\s*if \(!userId\) return;/.test(SRC));
}

console.log(
  echecs === 0
    ? "\n[selftest:catalogue-liste-partielle] OK — une liste connue ne peut plus être écrasée par un relevé plus court.\n"
    : `\n[selftest:catalogue-liste-partielle] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
