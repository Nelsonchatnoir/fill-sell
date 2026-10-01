// Selftest (Deno) — tailles du 01/10 :
//   · eBay : « EU 42 » / « FR 42 » → « 42 » quand la liste FERMÉE n'écrit pas
//     le préfixe (tessy.galy d07f4c9e, robe, catégorie 63861) ; jamais UK/US/IT ;
//     jamais en saisie libre ; jamais si la valeur est déjà dans la liste.
//   · Vinted : « 10 years » → l'option « 10 ans / 140 cm » de la grille
//     (begantonmatheo f3ba2985) ; jamais les mois ; jamais sans grille.
//   deno run --allow-read --allow-env scripts/tailles-prefixe-age-selftest.ts
import { assemblerAspects, tailleSansPrefixeEuFr } from "../supabase/functions/_shared/ebay-publication.ts";
import { AGE_ANGLAIS_RE, tailleAServir } from "../supabase/functions/_shared/vinted-taille-republication.ts";

let ko = 0;
const ok = (nom: string, cond: boolean, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// Liste réelle « Taille », eBay 63861 (relue le 01/10).
const ROBES = ["3XS", "2XS", "XS", "XS/S", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "2XL", "3XL", "4XL", "5XL", "6XL",
  "32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "Taille unique",
  "IT 36", "IT 38", "IT 40", "IT 42", "IT 44", "IT 46", "IT 48", "IT 50", "IT 52", "IT 54",
  "UK 4", "UK 6", "UK 8", "UK 10", "UK 12", "UK 14", "UK 16", "UK 18", "UK 20", "UK 22",
  "US 0", "US 2", "US 4", "US 6", "US 8", "US 10", "US 12", "US 14", "US 16", "US 18"];

ok("EU 42 → 42", tailleSansPrefixeEuFr("Taille", "EU 42", ROBES) === "42");
ok("FR 42 → 42", tailleSansPrefixeEuFr("Taille", "FR 42", ROBES) === "42");
ok("eu42 collé → 42", tailleSansPrefixeEuFr("Taille", "eu42", ROBES) === "42");
ok("UK 10 jamais coupé", tailleSansPrefixeEuFr("Taille", "UK 10", ROBES) === null);
ok("US 8 jamais coupé", tailleSansPrefixeEuFr("Taille", "US 8", ROBES) === null);
ok("IT 42 jamais coupé", tailleSansPrefixeEuFr("Taille", "IT 42", ROBES) === null);
ok("EU 43 absent de la liste → rien", tailleSansPrefixeEuFr("Taille", "EU 43", ROBES) === null);
ok("aspect autre que taille/pointure → rien", tailleSansPrefixeEuFr("Marque", "EU 42", ["42"]) === null);
ok("Pointure EU : EU 39 → 39", tailleSansPrefixeEuFr("Pointure EU", "EU 39", ["38", "39", "40"]) === "39");

const aspect = (mode: string, liste: string[]) => [{ name: "Taille", required: true, mode, allowedValues: liste }];
const servi = (valeur: string, mode: string, liste: string[]) =>
  assemblerAspects({ ebayAspects: { Taille: valeur } } as never, aspect(mode, liste) as never).aspects["Taille"]?.[0] ?? null;
ok("liste fermée : EU 42 → 42 (tessy)", servi("EU 42", "SELECTION_ONLY", ROBES) === "42");
ok("liste fermée : UK 10 tel quel (déjà dans la liste)", servi("UK 10", "SELECTION_ONLY", ROBES) === "UK 10");
ok("liste fermée : 42 tel quel", servi("42", "SELECTION_ONLY", ROBES) === "42");
ok("liste fermée : EU 43 → manquant (question)", servi("EU 43", "SELECTION_ONLY", ROBES) === null);
ok("saisie libre : EU 39 envoyé tel quel (comme hier)", servi("EU 39", "FREE_TEXT", ["38", "39"]) === "EU 39");
ok("liste fermée qui écrit « EU 42 » : gardé tel quel", servi("EU 42", "SELECTION_ONLY", ["EU 40", "EU 42"]) === "EU 42");

// Vinted — grille réelle vue au dernier échec de f3ba2985 (21 premières options).
const FILLES = ["Prématuré, jusqu'à 44cm", "Naissance / 44 cm", "Jusqu'à 1 mois / 50 cm", "1-3 mois / 56 cm", "3-6 mois / 62 cm",
  "6-9 mois / 68 cm", "9-12 mois / 74 cm", "12-18 mois / 80 cm", "18-24 mois / 86 cm", "24-36 mois / 92 cm", "3 ans / 98 cm",
  "4 ans / 104 cm", "5 ans / 110 cm", "6 ans / 116 cm", "7 ans / 122 cm", "8 ans / 128 cm", "9 ans / 134 cm",
  "10 ans / 140 cm", "11 ans / 146 cm", "12 ans / 152 cm"];
const v = (t: string, opts: string[] | null) => tailleAServir({ captureTaille: t, inventaireTaille: null, options: opts }).valeur;
ok("AGE_ANGLAIS_RE : 10 years, 10Y, 1 year", AGE_ANGLAIS_RE.test("10 YEARS") && AGE_ANGLAIS_RE.test("10Y") && AGE_ANGLAIS_RE.test("1 YEAR"));
ok("AGE_ANGLAIS_RE : jamais les mois", !AGE_ANGLAIS_RE.test("12 MONTHS"));
ok("10 years → 10 ans / 140 cm", v("10 years", FILLES) === "10 ans / 140 cm");
ok("3 years → 3 ans / 98 cm", v("3 years", FILLES) === "3 ans / 98 cm");
ok("1 year → rien (aucune option « 1 an »)", v("1 year", FILLES) === null);
ok("12 months → rien (hors règle)", v("12 months", FILLES) === null);
ok("10 years sans grille → rien", v("10 years", null) === null);
ok("10 years : l’option exacte « 10 ans » passe devant", v("10 years", ["10 ans / 140 cm", "10 ans"]) === "10 ans");
ok("10 years, deux options qui le contiennent → rien", v("10 years", ["10 ans / 140 cm", "10 ans / 140 cm long"]) === null);

console.log(ko ? `[tailles-prefixe-age] ${ko} KO` : "[tailles-prefixe-age] OK");
if (ko) Deno.exit(1);
