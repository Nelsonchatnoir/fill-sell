// Auto-test de la garde « un attribut non testé n'est pas un argument de vente »
// (2026-09-15) — supabase/functions/_shared/conseils-coherents.ts, exécuté TEL
// QUEL par Node (types retirés à la volée, Node ≥ 23).
//
//   node scripts/conseils-coherents-selftest.mjs
//
// Le cas de référence est le scan du 15/09 (pistolet à colle Bosch IXO) : le
// conseil n°1 affirmait « le fonctionnement testé » pendant que l'écran
// affichait « Fonctionne : ? Non testé », les deux venant du même appel.
//
// Ce que le test VERROUILLE, dans cet ordre d'importance :
//   1. le conseil n°1 du Bosch part, les DEUX autres restent, dans l'ordre ;
//   2. tout ce qui doit SURVIVRE survit — un conseil qui ne parle d'aucun
//      attribut, un conseil qui parle d'un attribut CONFIRMÉ, un conseil qui
//      demande de VÉRIFIER (« photographie-le en marche »). Une garde trop
//      large viderait la liste sans que personne ne s'en aperçoive ;
//   3. les bords : aucun attribut non testé → rien ne bouge ; liste entière
//      contredite → `null` (et non `[]`), pour que la section disparaisse au
//      lieu de laisser un titre orphelin ;
//   4. l'idempotence : filtrer deux fois = filtrer une fois.

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/conseils-coherents.ts")).href);
const { retirerConseilsContredits: filtrer, conseilContredit } = mod;

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.error(`  ✗ ${nom}${extra ? ` — ${extra}` : ""}`); }
};
const egal = (nom, a, b) => check(nom, JSON.stringify(a) === JSON.stringify(b),
  `\n      obtenu : ${JSON.stringify(a)}\n      attendu: ${JSON.stringify(b)}`);

// ── 1. LE SCAN DU 15/09, AVANT / APRÈS ────────────────────────────────────
const ATTRS_BOSCH = {
  type_outil: "pistolet à colle thermofusible",
  filaire_ou_sans_fil: "sans fil",
  fonctionne: "non testé",
};
const CONSEILS_BOSCH = [
  "Mettre en avant le fonctionnement testé",
  "Préciser que l'adaptateur de charge est fourni",
  "Photographier la buse de près : elle est propre, ça rassure",
];

console.log("▸ Bosch IXO du 15/09 — le conseil n°1 contredit « Fonctionne : non testé »");
const bosch = filtrer(CONSEILS_BOSCH, ATTRS_BOSCH);
console.log("    AVANT :");
CONSEILS_BOSCH.forEach((c, i) => console.log(`      ${i + 1}. ${c}`));
console.log("    APRÈS :");
(bosch.conseils ?? []).forEach((c, i) => console.log(`      ${i + 1}. ${c}`));
egal("1 seul conseil retiré", bosch.retires, 1);
egal("c'est bien le n°1", bosch.motifs, ["Mettre en avant le fonctionnement testé"]);
egal("les deux autres restent, dans l'ordre", bosch.conseils, CONSEILS_BOSCH.slice(1));

// ── 2. CE QUI DOIT SURVIVRE ───────────────────────────────────────────────
console.log("▸ ce que la garde ne doit PAS toucher");
const survit = (nom, conseil, attrs = ATTRS_BOSCH) =>
  check(nom, !conseilContredit(conseil, attrs), `retiré à tort : « ${conseil} »`);

survit("un conseil qui ne parle d'aucun attribut", "Photographier la buse de près : elle est propre, ça rassure");
survit("un conseil qui parle d'un accessoire", "Préciser que l'adaptateur de charge est fourni");
survit("« mettre en avant » … la MARQUE (attribut confirmé ailleurs)", "Mettre en avant la marque Bosch dans le titre");
survit("« mettre en avant » … un attribut CONFIRMÉ (sans fil)", "Mettre en avant qu'il est sans fil", { filaire_ou_sans_fil: "sans fil", fonctionne: "oui" });
survit("conseiller de VÉRIFIER n'est pas affirmer", "Photographie-le en marche pour confirmer qu'il fonctionne");
survit("dire qu'on ne sait pas n'est pas affirmer", "Préciser dans l'annonce si l'appareil fonctionne, tu le sauras en le branchant");
survit("un conseil de prix", "Mettre en avant un prix légèrement sous la moyenne du marché");
survit("un conseil de photo", "Ajouter une photo sur fond neutre : les annonces avec fond clair partent plus vite");
survit("aucun attribut non testé → rien ne bouge", "Mettre en avant le fonctionnement testé", { fonctionne: "oui" });
survit("attributs absents → rien ne bouge", "Mettre en avant le fonctionnement testé", null);
survit("clé non testée SANS marqueur connu → rien ne bouge (défaut = ne rien faire)", "Mettre en avant la finition impeccable", { bidule_inconnu: "non testé" });

// ── 3. CE QUI DOIT PARTIR ─────────────────────────────────────────────────
console.log("▸ ce que la garde doit retirer");
const part = (nom, conseil, attrs = ATTRS_BOSCH) =>
  check(nom, conseilContredit(conseil, attrs), `gardé à tort : « ${conseil} »`);

part("l'argument (« mettre en avant » + fonctionnement)", "Mettre en avant le fonctionnement testé");
part("l'affirmation ferme, sans « mettre en avant »", "Indiquer qu'il fonctionne parfaitement dans la description");
part("« en parfait état de marche »", "Préciser qu'il est en parfait état de marche, ça rassure");
part("variante anglaise", "Highlight that it is in full working order", { fonctionne: "not tested" });
part("complétude affirmée alors que complet est non testé", "Souligner que rien ne manque dans le lot", { complet: "non testé" });
part("accent mis sur le chargeur non vérifié", "Mettre en avant le chargeur d'origine fourni", { chargeur_inclus: "non testé" });
part("boîte d'origine assurée alors qu'elle est non testée", "Valoriser la boîte d'origine dans le titre", { boite_origine: "non testé" });

// ── 4. LES BORDS ──────────────────────────────────────────────────────────
console.log("▸ bords");
const tout = filtrer(["Mettre en avant le fonctionnement testé", "Souligner qu'il fonctionne parfaitement"], ATTRS_BOSCH);
egal("liste entièrement contredite → null (pas [])", tout.conseils, null);
egal("… et 2 retraits comptés", tout.retires, 2);

const reste1 = filtrer(["Mettre en avant le fonctionnement testé", "Ajouter une photo sur fond neutre"], ATTRS_BOSCH);
egal("il peut ne rester QU'UN conseil — il est rendu, pas masqué", reste1.conseils, ["Ajouter une photo sur fond neutre"]);

egal("conseils absents → null, 0 retrait", filtrer(null, ATTRS_BOSCH), { conseils: null, retires: 0, motifs: [] });
egal("tableau vide → null, 0 retrait", filtrer([], ATTRS_BOSCH), { conseils: null, retires: 0, motifs: [] });

const deuxFois = filtrer(bosch.conseils, ATTRS_BOSCH);
egal("idempotent : refiltrer ne retire plus rien", deuxFois.retires, 0);
egal("idempotent : même liste", deuxFois.conseils, bosch.conseils);

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout passe");
process.exit(echecs ? 1 : 0);
