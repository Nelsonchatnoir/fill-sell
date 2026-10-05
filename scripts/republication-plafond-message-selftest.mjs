// ── AUTOTEST : LA LIMITE DU JOUR EST DITE AU CLIC (05/10, point 11) ─────────
// Décision de Nico : une republication manuelle n'est JAMAIS bloquée par la
// limite quotidienne (le serveur retient et relâche seul le lendemain), mais
// la feuille de republication dit, AVANT le clic, combien partent aujourd'hui
// et que le reste suivra seul (src/utils/plafondRepublication.js).
// Ce qu'il garantit :
//   1. limite pas atteinte → silence ; dépassée en partie → « N partent
//      aujourd'hui, les M autres … » ; atteinte → « dès demain » ;
//   2. ce qui est DÉJÀ en file prend la place avant les nouvelles ;
//   3. Business (limite hors d'atteinte) et état inconnu → silence ;
//   4. accords (1 republication / 2 republications), « demain » seulement si
//      tout tient demain ;
//   5. la feuille reçoit l'état serveur et le nombre en file, et rend la
//      phrase AU-DESSUS du bouton de confirmation.
//
//   node scripts/republication-plafond-message-selftest.mjs
import { readFileSync } from "node:fs";
import { partageRepublicationsDuJour, LIMITE_HORS_D_ATTEINTE } from "../src/utils/plafondRepublication.js";

let echecs = 0;
const ok = (titre, condition, detail) => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail !== undefined ? ` — vu : ${JSON.stringify(detail)}` : ""}`); }
};
const etat = (extra = {}) => ({ limite: 50, faits: 0, palier: "premium", retenue: false, motif: null, ...extra });
const p = (nbEnvois, e, dejaEnFile = 0, lang = "fr") => partageRepublicationsDuJour({ nbEnvois, etat: e, dejaEnFile, lang });

console.log("\n── 1. Limite pas atteinte : silence ───────────────────────────");
ok("10 republications, 0 faites sur 50 → rien à dire", p(10, etat()) === null, p(10, etat()));
ok("pile la limite (50 sur 50 restantes) → rien à dire", p(50, etat()) === null);
ok("20 faites + 30 nouvelles = 50 → rien à dire", p(30, etat({ faits: 20 })) === null);

console.log("\n── 1. Dépassée en partie ─────────────────────────────────────");
{
  const r = p(40, etat({ faits: 30 }));
  ok("30 faites + 40 nouvelles → 20 aujourd'hui, 20 plus tard", r && r.aujourdhui === 20 && r.plusTard === 20, r);
  ok("le surplus tient demain → « demain »", r?.demain === true, r);
  ok("texte exact", r?.texte === "Ta limite du jour est de 50 republications : 20 partent aujourd'hui, les 20 autres partiront demain, toutes seules. Rien n'est perdu.", r?.texte);
}
{
  const r = p(2, etat({ faits: 49 }));
  ok("1 place restante, 2 nouvelles → 1 part, l'autre suit", r && r.aujourdhui === 1 && r.plusTard === 1, r);
  ok("accords au singulier", r?.texte === "Ta limite du jour est de 50 republications : 1 part aujourd'hui, l'autre partira demain, toute seule. Rien n'est perdu.", r?.texte);
}
{
  const r = p(140, etat({ faits: 0 }));
  ok("140 nouvelles sur 50 par jour → 50 aujourd'hui, 90 plus tard", r && r.aujourdhui === 50 && r.plusTard === 90, r);
  ok("90 ne tiennent pas en un jour → « les jours suivants », jamais « demain »", r && !r.demain && /les jours suivants/.test(r.texte) && !/ demain/.test(r.texte), r?.texte);
}

console.log("\n── 1. Atteinte ───────────────────────────────────────────────");
{
  const r = p(5, etat({ faits: 50, retenue: true, motif: "plafond" }));
  ok("50 faites sur 50 → 0 aujourd'hui, 5 plus tard", r && r.aujourdhui === 0 && r.plusTard === 5, r);
  ok("texte « atteinte … dès demain »", r?.texte === "Ta limite du jour (50 republications) est atteinte : ces 5 republications partiront dès demain, toutes seules. Rien n'est perdu.", r?.texte);
}
{
  const r = p(1, etat({ faits: 62 }));
  ok("au-delà de la limite (62/50), 1 nouvelle → singulier", r?.texte === "Ta limite du jour (50 republications) est atteinte : cette republication partira dès demain, toute seule. Rien n'est perdu.", r?.texte);
}
{
  const r = p(80, etat({ faits: 50 }));
  ok("80 de plus, limite atteinte → « à partir de demain » (pas tout demain)", r && !r.demain && /à partir de demain/.test(r.texte), r?.texte);
}

console.log("\n── 2. Ce qui est déjà en file passe avant ─────────────────────");
{
  const r = p(10, etat({ faits: 30 }), 15);
  ok("30 faites + 15 en file + 10 nouvelles → 5 aujourd'hui, 5 plus tard", r && r.aujourdhui === 5 && r.plusTard === 5, r);
}
{
  const r = p(10, etat({ faits: 30 }), 25);
  ok("30 faites + 25 en file → plus de place : 0 aujourd'hui", r && r.aujourdhui === 0 && r.plusTard === 10, r);
  ok("limite pas encore ATTEINTE : on ne le prétend pas, la file la remplit", r && /^Les republications déjà en file remplissent ta limite du jour \(50 republications\) : ces 10 republications partiront dès demain/.test(r.texte) && !/atteinte/.test(r.texte), r?.texte);
}
{
  const r = p(10, etat({ faits: 0 }), 45);
  ok("45 en file + 10 nouvelles → 5 aujourd'hui", r && r.aujourdhui === 5 && r.plusTard === 5, r);
}
{
  const r = p(30, etat({ faits: 40 }), 40);
  ok("surplus total (file comprise) 60 > 50 → « à partir de demain »", r && r.aujourdhui === 0 && !r.demain, r);
}

console.log("\n── 3. Business et état inconnu : silence ──────────────────────");
ok("Business (palier) → rien", p(500, etat({ palier: "business", limite: 100000, faits: 0 })) === null);
ok("Business même si la file est énorme → rien", p(10, etat({ palier: "business", limite: 100000, faits: 99999 }), 50) === null);
ok(`limite hors d'atteinte (>= ${LIMITE_HORS_D_ATTEINTE}) sans palier lu → rien`, p(500, etat({ palier: null, limite: 100000 })) === null);
ok("état null (panne, pas encore lu) → rien", p(500, null) === null);
ok("état sans limite → rien", p(500, { faits: 3 }) === null);
ok("état sans faits → rien", p(500, { limite: 50 }) === null);
ok("limite 0 (clé mal posée) → rien", p(500, etat({ limite: 0 })) === null);
ok("0 envoi (aucune plateforme cochée) → rien", p(0, etat({ faits: 50 })) === null);

console.log("\n── 4. Anglais ─────────────────────────────────────────────────");
{
  const r = p(40, etat({ faits: 30 }), 0, "en");
  ok("anglais, dépassement partiel", r?.texte === "Your daily limit is 50 reposts: 20 go out today, the other 20 will go out tomorrow, on their own. Nothing is lost.", r?.texte);
  const r1 = p(1, etat({ faits: 50 }), 0, "en");
  ok("anglais, atteinte, singulier", r1?.texte === "Your daily limit (50 reposts) is reached: this repost will go out tomorrow, on its own. Nothing is lost.", r1?.texte);
}

console.log("\n── 5. La feuille de republication ─────────────────────────────");
{
  const src = readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const debut = src.indexOf("function RepublishSheet(");
  const fin = src.indexOf("\n}\n", debut);
  const feuille = src.slice(debut, fin);
  ok("RepublishSheet reçoit plafond et dejaEnFile", /function RepublishSheet\(\{[^}]*plafond = null, dejaEnFile = 0/.test(feuille));
  ok("le partage est calculé sur nbEnvois et l'état serveur", /partageRepublicationsDuJour\(\{ nbEnvois, etat: plafond, dejaEnFile, lang \}\)/.test(feuille));
  const iPhrase = feuille.indexOf("{partageDuJour.texte}");
  const iBouton = feuille.indexOf("<button onClick={confirmer}");
  ok("la phrase est rendue AU-DESSUS du bouton de confirmation", iPhrase > 0 && iBouton > iPhrase);
  ok("le bouton n'est jamais désactivé par la limite (rien n'est bloqué)", /<button onClick=\{confirmer\} disabled=\{!nbEnvois\}/.test(feuille));
  ok("l'appel passe l'état serveur et la file vivante", /plafond=\{repubPlafondEtat\}\s*\n\s*dejaEnFile=\{repubJobsVivants\.length\}/.test(src));
}

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
