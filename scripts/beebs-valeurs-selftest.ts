// Auto-test du rapprochement des valeurs Beebs contre platform_category_aspects
// (2026-09-08). Les trois premiers cas sont les jobs RÉELS relevés en base ce
// jour-là ; les suivants sont les garde-fous, un par ligne de la consigne.
//
//   deno run --allow-read scripts/beebs-valeurs-selftest.ts
//
import { rapprocherValeursBeebs, categorieDuJob, comparable, champsArbitrablesBeebs, marqueIntrouvableBeebs, type AspectRow } from "../supabase/functions/_shared/beebs-valeurs.ts";

const A = (field_key: string, allowed_values: string[] | null, required = true): AspectRow => ({
  category_key: "C", field_key, field_label: field_key, required, allowed_values,
});

let ko = 0;
const ok = (nom: string, cond: boolean, detail: unknown = "") => {
  if (!cond) { ko++; console.log(`  ✗ ${nom}`, detail); } else console.log(`  ✓ ${nom}`);
};

// ── CAS 1 (500c04c6) : « 85 G » n'existe que sur le 2ᵉ champ « Taille » ──────
const pyjamas: AspectRow[] = [
  A("Taille", ["XXXS / 30","XXS / 32","XS / 34","S / 36","M / 38","L / 40","XL / 42","XXL / 44","XXXL / 46","4XL / 48","5XL / 50","6XL / 52","7XL / 54","8XL / 56","9XL / 58","Taille unique","Autre"]),
  A("Taille [#2]", ["75A et AA","75B","80G","85F","85G","85H","95L"]),
  A("État", ["Neuf, avec étiquette","Neuf, sans étiquette","Très bon état","Bon état","État moyen"]),
  A("Couleur", ["Noir","Blanc"], false),
  A("Marque", ["Kiabi","Zara"]),
];
{
  const r = rapprocherValeursBeebs(
    { taille: "85 G", marque: "Darjeeling", etat: "Très bon état", couleur: "Noir" },
    pyjamas,
  );
  console.log("CAS 1 — soutien-gorge « 85 G » dans Pyjamas (femme)");
  ok("routé sur Taille [#2] = 85G", r.aspects["Taille [#2]"] === "85G", r.aspects);
  ok("1er champ NON servi (85 G n'est pas une taille de vêtement)", r.aspects["Taille [#1]"] === undefined, r.aspects);
  ok("canal dédié COUPÉ (il frapperait les deux champs)", r.racines.taille === "", r.racines);
  ok("marque Darjeeling absente du catalogue → RIEN", r.posees.every((p) => p.cle_source !== "marque"), r.posees);
  ok("état exact → rien posé", r.posees.every((p) => p.cle_source !== "etat"), r.posees);
  ok("méthode tracée", r.posees[0]?.methode === "homonyme_champ_n", r.posees);
}

// ── CAS 1 bis : la vendeuse a répondu pour le 1er champ — les DEUX partent ───
{
  const r = rapprocherValeursBeebs(
    { taille: "S / 36", beebsAspects: { "Taille [#2]": "85G" } },
    pyjamas,
  );
  console.log("CAS 1 bis — réponse du 1er champ arrivée, le 2ᵉ déjà servi");
  ok("1er champ adressé par sa clé positionnelle", r.aspects["Taille [#1]"] === "S / 36", r.aspects);
  ok("réponse du 2ᵉ champ JAMAIS réécrite", r.aspects["Taille [#2]"] === undefined, r.aspects);
  ok("canal dédié coupé", r.racines.taille === "", r.racines);
}

// ── CAS 1 ter : libellé dupliqué mais AUCUNE valeur ne tombe → on ne coupe rien
{
  const r = rapprocherValeursBeebs({ taille: "42 ans" }, pyjamas);
  console.log("CAS 1 ter — libellé dupliqué, aucune correspondance");
  ok("rien posé", Object.keys(r.aspects).length === 0, r.aspects);
  ok("canal dédié INTACT (sinon on perdrait la valeur pour rien)", r.racines.taille === undefined, r.racines);
}

// ── CAS 2 : casse seule (« VILA » / « Vila »), champ principal ───────────────
{
  const r = rapprocherValeursBeebs({ marque: "VILA" }, [A("Marque", ["Vilac","Vila","Zara"])]);
  console.log("CAS 2 — casse seule sur le champ principal");
  ok("racine marque ré-épelée en Vila", r.racines.marque === "Vila", r.racines);
  ok("aucun aspect ajouté", Object.keys(r.aspects).length === 0, r.aspects);
}

// ── CAS 3 : catégorie fausse — aucune correspondance nulle part ──────────────
{
  const r = rapprocherValeursBeebs(
    { taille: "S", marque: "Kiabi" },
    [A("Taille", ["3 mois (54-60 cm)","6 mois (60-66 cm)","10 ans (128-140 cm)"]), A("Marque", ["Kiabi"])],
  );
  console.log("CAS 3 — taille adulte dans une catégorie enfant");
  ok("RIEN posé", r.posees.length === 0, r.posees);
}

// ── GARDE-FOUS ──────────────────────────────────────────────────────────────
console.log("GARDE-FOUS");
{
  const r = rapprocherValeursBeebs({ etat: "Neuf sans étiquette" }, [A("État", ["Neuf, avec étiquette","Neuf, sans étiquette"])]);
  ok("ponctuation : « Neuf sans étiquette » → « Neuf, sans étiquette »", r.racines.etat === "Neuf, sans étiquette", r.racines);
}
{
  const r = rapprocherValeursBeebs({ marque: "Levi's" }, [A("Marque", ["Levi’s"])]);
  ok("apostrophe typographique", r.racines.marque === "Levi’s", r.racines);
}
{
  const r = rapprocherValeursBeebs({ taille: "L" }, [A("Taille", null)]);
  ok("allowed_values null → rien", r.posees.length === 0, r.posees);
}
{
  const r = rapprocherValeursBeebs({ taille: "Unique" }, [A("Taille", ["Taille unique","Autre"])]);
  ok("jamais « au plus proche » (Unique ≠ Taille unique)", r.posees.length === 0, r.posees);
}
{
  const r = rapprocherValeursBeebs({ couleur: "Gris chiné" }, [A("Couleur", ["Gris","Anthracite"])]);
  ok("jamais de valeur voisine (Gris chiné ≠ Gris)", r.posees.length === 0, r.posees);
}
{
  // Verbatim présent dans la liste : match EXACT légitime, pas une ambiguïté.
  const e = rapprocherValeursBeebs({ taille: "M" }, [A("Taille [#2]", ["m","M"])]);
  ok("verbatim dans la liste → match exact", e.aspects["Taille [#2]"] === "M", e.aspects);
  // Verbatim ABSENT, deux candidates de même forme comparable : on ne tranche pas.
  const r = rapprocherValeursBeebs({ taille: "M ." }, [A("Taille [#2]", ["m","M"])]);
  ok("ambiguïté à la forme comparable → rien", r.posees.length === 0, r.posees);
}
{
  const r = rapprocherValeursBeebs(
    { taille: "85 G", beebsAspects: { "Taille [#2]": "80B" } },
    pyjamas,
  );
  ok("réponse de l'utilisateur JAMAIS écrasée", r.aspects["Taille [#2]"] === undefined, r.aspects);
  const u = rapprocherValeursBeebs({ marque: "VILA", beebsAspects: { "Marque": "Zara" } }, [A("Marque", ["Vila","Zara"])]);
  ok("champ unique : une saisie ne bloque pas la ré-épellation de la racine", u.racines.marque === "Vila", u.racines);
}
{
  const r = rapprocherValeursBeebs({ colors: ["Noir"] }, [A("Couleur", ["Noir"], false)]);
  ok("colors[] exact → rien à faire", r.posees.length === 0, r.posees);
}
{
  const r = rapprocherValeursBeebs({ taille: "EU 41" }, [A("Pointure", ["41","42"])]);
  ok("« EU 41 » : pas de match (l'extension retire déjà le préfixe) → rien", r.posees.length === 0, r.posees);
}
{
  ok("catégorie du job", categorieDuJob({ beebsCategoryPath: ["Mode","Femme","Pyjamas (femme)"] }) === "Mode > Femme > Pyjamas (femme)");
  ok("catégorie absente → null", categorieDuJob({}) === null);
  ok("comparable stable", comparable("Neuf, sans étiquette") === comparable("NEUF SANS ETIQUETTE"));
}

// ── ÉTAPE (d) : CE QUE L'IA A LE DROIT DE TRANCHER ──────────────────────────
console.log("ÉTAPE (d) — champs arbitrables");
const VIDE = { racines: {}, aspects: {}, posees: [] };
const M60 = Array.from({ length: 60 }, (_, i) => `Marque ${i}`);
{
  const cat: AspectRow[] = [
    A("État", ["Neuf, avec étiquette", "Bon état", "État moyen"]),
    A("Marque", M60),
    A("Matière", ["Coton", "Laine"], false),
    A("Format du colis", []),
  ];
  const c = champsArbitrablesBeebs({ titre: "Robe" }, cat, VIDE);
  const cles = c.map((x) => x.field_key);
  ok("champ obligatoire à liste fermée → arbitrable", cles.includes("État"), cles);
  ok("Marque (60 valeurs, liste tronquée) → JAMAIS", !cles.includes("Marque"), cles);
  ok("champ facultatif → jamais", !cles.includes("Matière"), cles);
  ok("liste vide → jamais", !cles.includes("Format du colis"), cles);
  ok("cible = la clé racine dédiée", c.find((x) => x.field_key === "État")?.cible.racine === "etat", c);
}
{
  const cat: AspectRow[] = [A("État", ["Bon état", "État moyen"])];
  ok("valeur déjà exacte → rien à arbitrer",
    champsArbitrablesBeebs({ etat: "Bon état" }, cat, VIDE).length === 0);
  ok("valeur ré-épelable → rien à arbitrer (le déterministe a servi)",
    champsArbitrablesBeebs({ etat: "bon etat" }, cat, VIDE).length === 0);
  ok("réponse déjà saisie → rien à arbitrer",
    champsArbitrablesBeebs({ beebsAspects: { "État": "Bon état" } }, cat, VIDE).length === 0);
  ok("déjà tranché « aucune » pour la même valeur → on ne repose pas",
    champsArbitrablesBeebs({ etat: "impec" }, cat, VIDE, { "État": { valeur_source: "impec", valeur: null } }).length === 0);
  ok("tranché pour une AUTRE valeur → on redemande",
    champsArbitrablesBeebs({ etat: "impec" }, cat, VIDE, { "État": { valeur_source: "nickel", valeur: null } }).length === 1);
}
{
  const c = champsArbitrablesBeebs({ taille: "85 G" }, pyjamas, rapprocherValeursBeebs({ taille: "85 G" }, pyjamas));
  const cles = c.map((x) => x.field_key);
  ok("libellé dupliqué : le champ servi par le routage n'est pas re-arbitré", !cles.includes("Taille [#2]"), cles);
  ok("Marque du même catalogue toujours exclue", !cles.includes("Marque"), cles);
}

// ── MARQUE INTROUVABLE CHEZ BEEBS ───────────────────────────────────────────
console.log("MARQUE — bac « Autre » sur preuve live");
const wVila = [{ at: "x", code: "generic", message: 'Marque: "VILA" sans correspondance (même approximative) dans la liste de CE champ, laissé vide. Options affichées: ["Vilac"]' }];
{
  const cat = [A("Marque", M60), A("État", ["Bon état"])];
  const r = rapprocherValeursBeebs({ marque: "VILA", warnings: wVila }, cat);
  ok("posé sur Marque [#1]", r.aspects["Marque [#1]"] === "Autre", r.aspects);
  ok("canal dédié coupé", r.racines.marque === "", r.racines);
  ok("méthode tracée", r.posees.some((p) => p.methode === "marque_introuvable_bac_autre"), r.posees);
}
{
  const vide = [{ message: 'Marque: "VILA" sans correspondance (même approximative) dans la liste de CE champ, laissé vide. Options affichées: []' }];
  ok("liste VIDE → rien (l'extension bascule déjà seule sur « Autre »)",
    marqueIntrouvableBeebs({ marque: "VILA", warnings: vide }, [A("Marque", M60)]) === null);
  ok("aucun warning → rien (le catalogue tronqué ne prouve pas l'absence)",
    marqueIntrouvableBeebs({ marque: "VILA" }, [A("Marque", M60)]) === null);
  ok("warning portant sur une AUTRE marque → périmé, rien",
    marqueIntrouvableBeebs({ marque: "Zara", warnings: wVila }, [A("Marque", M60)]) === null);
  const r = rapprocherValeursBeebs({ marque: "VILA", warnings: wVila }, [A("Marque", ["Vila", "Zara"])]);
  ok("marque en fait présente au catalogue → ré-épellation, pas « Autre »",
    r.racines.marque === "Vila" && r.aspects["Marque [#1]"] === undefined, r);
  ok("réponse déjà saisie sur Marque → intouchable",
    marqueIntrouvableBeebs({ marque: "VILA", warnings: wVila, beebsAspects: { "Marque": "Zara" } }, [A("Marque", M60)]) === null);
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT PASSE");
Deno.exit(ko ? 1 : 0);
