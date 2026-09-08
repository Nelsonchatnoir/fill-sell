// Auto-test du rapprochement des valeurs Beebs contre platform_category_aspects
// (2026-09-08). Les trois premiers cas sont les jobs RÉELS relevés en base ce
// jour-là ; les suivants sont les garde-fous, un par ligne de la consigne.
//
//   deno run --allow-read scripts/beebs-valeurs-selftest.ts
//
import { rapprocherValeursBeebs, categorieDuJob, comparable, type AspectRow } from "../supabase/functions/_shared/beebs-valeurs.ts";

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
  ok("racine taille INTACTE (le 1er champ reste à demander)", r.racines.taille === undefined, r.racines);
  ok("marque Darjeeling absente du catalogue → RIEN", r.posees.every((p) => p.cle_source !== "marque"), r.posees);
  ok("état exact → rien posé", r.posees.every((p) => p.cle_source !== "etat"), r.posees);
  ok("méthode tracée", r.posees[0]?.methode === "normalisee_autre_champ", r.posees);
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

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT PASSE");
Deno.exit(ko ? 1 : 0);
