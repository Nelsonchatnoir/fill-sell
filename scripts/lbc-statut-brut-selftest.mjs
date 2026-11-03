// Autotest — le relevé Leboncoin garde le statut BRUT de chaque annonce (03/11, point 5) —
// `npm run selftest:lbc-statut-brut` (chrome-extension/background.js : relevé par l'adresse, écriture annonces_plateforme).
// Le statut FillSell ne change pas (« en_ligne » seulement pour `active`) ; le brut est la mesure qui manquait pour
// distinguer une annonce en modération, un brouillon Pro à payer, un refus.
import fs from "node:fs";

let ko = 0;
const ok = (c, nom) => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}`); ko++; } };
const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

ok(bg.includes('statut: actif ? "en_ligne" : "inconnu",\n          // (03/11, point 5)'), "le statut FillSell reste celui d'avant (active → en_ligne, sinon inconnu)");
ok(bg.includes("statut_brut: a?.status != null ? String(a.status).slice(0, 40) : null,"), "chaque annonce porte son statut brut, tel quel, borné");
ok(bg.includes('const statutBrutPossible = statutBrutLu && await restRequest("annonces_plateforme?select=statut_brut&limit=1", token).then(() => true).catch(() => false);'),
  "écrit seulement si la base a la colonne (sinon rien ne change)");
ok(bg.includes('...(statutBrutPossible ? { statut_brut: typeof a.statut_brut === "string" ? a.statut_brut : null } : {}),'), "écrit dans annonces_plateforme avec le reste du relevé");
ok(bg.includes('+ (Object.keys(api.statuts ?? {}).length ? ` · [statuts] ${Object.entries(api.statuts).map(([k, n]) => `${k} ${n}`).join(", ")}` : "")'),
  "les décomptes des statuts bruts sont TOUJOURS dans le texte du relevé (mesure sans migration)");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
