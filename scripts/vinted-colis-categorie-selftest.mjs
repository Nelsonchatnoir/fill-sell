// selftest:vinted-colis-categorie — (01/11 soir, décision de Nico) Le format du colis d'une PUBLICATION Vinted est
// déduit du rayon quand Vinted le demande et que la catégorie suffit (gjehly 64d51931, « Livres et médias › Magazines »).
//   npm run selftest:vinted-colis-categorie
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEUILS_COLIS_RAYON, formatDominantDuRayon, grilleDuDiagnosticColis, estQuestionColisPublication, colisPublicationATrancher,
  repereSansAccord, titreDeLot, catalogueDuJob, RELECTURE_SANS_ACCORD_MS,
} from "../supabase/functions/_shared/vinted-colis-categorie.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (c, quoi, detail = "") => { if (!c) { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ""}`); } else console.log(`  ✓ ${quoi}`); };
console.log("vinted-colis-categorie-selftest");

// Les observations RÉELLES du rayon 5424 (relevé du 01/11 soir, 90 jours, toutes sources).
const MAGAZINES = [
  ["3", "9 classeurs \" Équitation : la passion du cheval\"", 1786788777123001, "4248ce4a"],
  ["1", "Livre Les 4 Vérités de la Réussite", 1787267475693001, "8a2eba68"],
  ["1", "Livre Les 4 Vérités de la Réussite", 1787267475693001, "8a2eba68"],
  ["1", "Livre Les 4 Vérités de la Réussite", 1787267475693001, "8a2eba68"],
  ["1", "1ere guerre mondiale", 1789410326451005, "6f41de45"],
  ["1", "ancien album filet et milan petit écho de mode la n°5", 1790675465236002, "53efea05"],
  ["1", "LE Soir Illustré 1936 Reliure à n°437 462 Belgique", 1790941067936002, "53efea05"],
  ["1", "LE Soir Illustré 1936 Reliure à n°437 462 Belgique", 1790941067936002, "53efea05"],
  ["1", "Le Soir Illustré 1936 – Grand recueil relié – Presse belge ancienne", 1791527351216005, "53efea05"],
  ["1", "Livre Magasine Hors-Série Mortelle Adèle", 1792952835713011, "2189c4d8"],
  ["1", "Lot de 5 magasines Picsou", null, "8a2eba68"],
].map(([id, titre, article, user_id], i) => ({ id, titre, article: article ?? `job${i}`, user_id }));

// Le job RÉEL 64d51931 (champs utiles, relus le 01/11 à 22:10).
const JOB = {
  id: "64d51931-4087-49fb-96ab-9264132f3027", platform: "vinted", action: "publish", status: "needs_user",
  title: "Magazine de jeux vidéo rétro PlaySoluces Hors série n•1",
  error: "Vinted demande le format du colis pour ce rayon et n'en coche aucun : choisis-le — on ne le choisit jamais à ta place. Rien n'a été envoyé à Vinted.",
  platform_fields: {
    needs_user_source: "champ_a_choisir",
    needsUserField: { target: { key: "libelle", root: "colis_choisi" }, platform: "vinted", field_key: "colis", input_type: "radio",
      field_label: "Format du colis", allowed_values: ["Petit", "Moyen", "Grand"], options_completes: true },
    last_diagnostic: "format de colis à choisir avant le dépôt — offerts : 1|Petit · 2|Moyen · 3|Grand ; aucun format coché par Vinted",
    categoryPath: ["Livres et médias", "Magazines"], vinted_ids: { status_id: 2, catalog_id: 5424 },
    pas_de_rouge_reprises: 2, programmee: true, programmee_servie_le: "2026-11-01T20:34:36.247Z",
  },
};
const LE = "2026-11-01T21:30:00.000Z";

const obs = formatDominantDuRayon(MAGAZINES);
ok(obs && obs.id === 1 && obs.annonces === 6 && obs.comptes === 4 && obs.part === 1,
  "Magazines : 6 articles hors lots (une observation par article), 4 comptes, 100 % « Petit »", JSON.stringify(obs));
ok(titreDeLot("9 classeurs \" Équitation\"") && titreDeLot("Lot de 5 magasines Picsou") && titreDeLot("Pokémon x10 cartes") && titreDeLot("Cartes 10x")
  && !titreDeLot("Magazine de jeux vidéo rétro PlaySoluces Hors série n•1") && !titreDeLot("1ere guerre mondiale") && !titreDeLot("Pilote slot car"),
  "un lot se reconnaît à son titre (« Lot de », quantité en tête, x10) — pas « 1ere » ni « slot »");
const avecDoublons = formatDominantDuRayon(MAGAZINES.map((m) => ({ ...m, article: null })).filter((m) => !titreDeLot(m.titre)));
ok(avecDoublons && avecDoublons.annonces === 9, "sans identifiant d'article, chaque tâche compte (11 − 2 lots = 9)", JSON.stringify(avecDoublons));
ok(formatDominantDuRayon(MAGAZINES.slice(0, 4)) === null, "trop peu d'articles (moins de 5) : pas d'accord, la question reste");
ok(formatDominantDuRayon([...Array(6)].map((_, i) => ({ id: 1, user_id: "seul", article: `a${i}`, titre: `Revue ${i}` }))) === null,
  "un seul compte : pas d'accord (au moins 2 comptes)");
const partage = [...Array(8)].map((_, i) => ({ id: 1, user_id: `u${i % 3}`, article: `p${i}` })).concat([{ id: 2, user_id: "u9", article: "m1" }, { id: 2, user_id: "u8", article: "m2" }]);
ok(formatDominantDuRayon(partage) === null, "80 % seulement sur le même format : pas d'accord");
ok(SEUILS_COLIS_RAYON.annonces === 5 && SEUILS_COLIS_RAYON.comptes === 2 && SEUILS_COLIS_RAYON.part === 0.9, "seuils : 5 articles, 2 comptes, 90 %");
ok(grilleDuDiagnosticColis(JOB.platform_fields.last_diagnostic).map((g) => `${g.id}|${g.libelle}`).join() === "1|Petit,2|Moyen,3|Grand", "la grille affichée se lit dans le diagnostic");

ok(estQuestionColisPublication(JOB) && catalogueDuJob(JOB.platform_fields) === 5424, "64d51931 : une question colis de publication, rayon 5424");
const r = colisPublicationATrancher(JOB, obs, LE);
ok(r && r.choix.libelle === "Petit" && r.choix.regle === "format_du_rayon", "64d51931 : « Petit », le format du rayon", JSON.stringify(r?.choix));
const pf = r?.platform_fields ?? {};
ok(pf.colis_choisi?.libelle === "Petit" && pf.needsUserResolved?.["colis_choisi.libelle"] === "Petit",
  "posé comme une réponse (colis_choisi, que l'extension relit en premier)");
ok(!pf.needs_user_source && !pf.needsUserField && pf.needsUserAttempts === 0, "la question est retirée, compteurs à zéro");
ok(pf.colis_tranche_par_categorie?.observe?.annonces === 6 && pf.colis_tranche_par_categorie?.catalog_id === 5424, "tracé : rayon, observation, grille, choix");
ok(Array.isArray(pf.erreurs_archivees) && pf.erreurs_archivees.length >= 1, "l'ancien message est archivé");
ok(pf.programmee_servie_le === JOB.platform_fields.programmee_servie_le && pf.vinted_ids?.catalog_id === 5424, "rien d'autre ne bouge sur la tâche");
ok(colisPublicationATrancher({ ...JOB, platform_fields: pf, status: "needs_user" }, obs, LE) === null, "une seule passe par job : une nouvelle question reste posée");

const variantes = [
  ["un choix de la personne non proposé par Vinted", { platform_fields: { ...JOB.platform_fields, packageSizeId: 3, colis_source: "manuel" } }],
  ["une réponse déjà donnée", { platform_fields: { ...JOB.platform_fields, colis_choisi: { libelle: "Moyen" } } }],
  ["un lot", { title: "Lot de 3 magazines Joypad" }],
  ["une republication (règle 9)", { action: "republish" }],
  ["une autre plateforme", { platform: "leboncoin" }],
  ["une autre question", { platform_fields: { ...JOB.platform_fields, needsUserField: { ...JOB.platform_fields.needsUserField, field_key: "etat" } } }],
  ["un rayon inconnu", { platform_fields: { ...JOB.platform_fields, vinted_ids: {} } }],
];
for (const [nom, patch] of variantes) ok(!estQuestionColisPublication({ ...JOB, ...patch }) && colisPublicationATrancher({ ...JOB, ...patch }, obs, LE) === null, `jamais tranché : ${nom}`);
ok(colisPublicationATrancher(JOB, null, LE) === null, "rayon sans accord : la question reste");
const grilleKg = { ...JOB, platform_fields: { ...JOB.platform_fields, needsUserField: { ...JOB.platform_fields.needsUserField, allowed_values: ["Moyen", "Grand"] },
  last_diagnostic: "format de colis à choisir avant le dépôt — offerts : 2|Moyen · 3|Grand ; aucun format coché par Vinted" } };
ok(colisPublicationATrancher(grilleKg, obs, LE)?.choix?.libelle === "Moyen", "format du rayon absent de la grille affichée : le plus petit offert qui suffit");
const sansDiag = { ...JOB, platform_fields: { ...JOB.platform_fields, last_diagnostic: null } };
ok(colisPublicationATrancher(sansDiag, obs, LE)?.choix?.libelle === "Petit", "diagnostic illisible, liste Petit / Moyen / Grand : même choix");
const kgSansDiag = { ...JOB, platform_fields: { ...JOB.platform_fields, last_diagnostic: null, needsUserField: { ...JOB.platform_fields.needsUserField, allowed_values: ["5 kg", "10 kg"] } } };
ok(colisPublicationATrancher(kgSansDiag, { id: 8, annonces: 9, comptes: 3, part: 1 }, LE) === null, "grille au poids sans diagnostic : rien de deviné");

const rep = repereSansAccord(JOB, null, LE);
ok(rep.colis_rayon_sans_accord?.le === LE && !estQuestionColisPublication({ ...JOB, platform_fields: rep }, Date.parse(LE) + 3600_000)
  && estQuestionColisPublication({ ...JOB, platform_fields: rep }, Date.parse(LE) + RELECTURE_SANS_ACCORD_MS + 1),
  "rayon sans accord : relu une fois par jour par job, jamais toutes les 3 min");

const QT = fs.readFileSync(path.join(RACINE, "supabase/functions/_shared/questions-tranchees.ts"), "utf8");
ok(/estQuestionColisPublication\(j\)/.test(QT) && /colisPublicationATrancher\(j, observe, maintenant\)/.test(QT)
  && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)\.select\("id"\);\s*if \(data\?\.length\) \(n as Record<string, number>\)\.colis_rayon/.test(QT),
  "handler-watch (règle 10) : compare-and-swap sur needs_user");
ok(/\.slice\(0, 10\)/.test(QT.slice(QT.indexOf("const colisPub"))) && /\.limit\(1000\)/.test(QT.slice(QT.indexOf("const colisPub"))), "lectures bornées : 10 rayons par passage, 1 000 lignes");

console.log(ko ? `\n${ko} contrôle(s) en échec.` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
