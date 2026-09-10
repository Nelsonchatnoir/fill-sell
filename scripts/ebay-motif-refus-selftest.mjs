// ═══════════════════════════════════════════════════════════════════════════
// Selftest du MOTIF RÉEL D'UN REFUS eBAY (2026-09-10)
//   node scripts/ebay-motif-refus-selftest.mjs
//
// Le cas fondateur : job f0b84d87, costume Hugo Boss, 10/09 12:17. eBay répond
// 400 / errorId 25019 avec un `longMessage` PARAPLUIE qui accuse l'utilisateur
// (« le titre ou la description contient des mots inappropriés ou le vendeur
// enfreint le règlement d'eBay ») alors que `parameters[2]` porte le vrai
// motif : KYC_DSAReq_EUB2C_SYI — la vérification d'identité vendeur.
//
// Le payload ci-dessous est RECOPIÉ DE LA BASE, entités HTML comprises. Ce que
// le test protège :
//   1. un motif NOMMÉ (KYC_) rend NOTRE phrase, et jamais le texte d'eBay ;
//   2. le message servi n'accuse plus : aucun des mots du parapluie ;
//   3. un code INCONNU cite eBay mot pour mot, sans diagnostic inventé ;
//   4. un refus SANS parameters ne change pas de comportement (null) —
//      c'est la non-régression de tous les autres refus.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "supabase/functions/_shared/ebay-publication.ts"), "utf8");

// Le module importe Deno/esm.sh : on n'extrait que le bloc autonome du motif
// (du marqueur CODE_MOTIF_EBAY_RE à la fin de motifReelEbay), transpilé à la
// main de TS vers JS — aucune dépendance, aucun type à l'exécution.
const debut = SRC.indexOf("const CODE_MOTIF_EBAY_RE");
const fin = SRC.indexOf("\n}", SRC.indexOf("export function motifReelEbay")) + 2;
if (debut < 0 || fin < 2) throw new Error("bloc motifReelEbay introuvable dans ebay-publication.ts");
const bloc = SRC.slice(debut, fin)
  .replace(/^export /gm, "")
  .replace(/: Array<\{ re: RegExp; fr: string \}>/g, "")
  .replace(/: Record<string, string>/g, "")
  .replace(/interface MotifEbay \{[\s\S]*?\n\}\n/g, "")
  .replace(/\(s: string\): string/g, "(s)")
  .replace(/\(e: ErreurEbay\): MotifEbay \| null/g, "(e)")
  .replace(/\(_, n\)/g, "(_m, n)")
  .replace(/\(m, n\)/g, "(m, n)");
const motifReelEbay = new Function(`${bloc}\nreturn motifReelEbay;`)();

let echecs = 0;
const check = (nom, ok, extra = "") => {
  if (ok) console.log(`  ✓ ${nom}`);
  else { echecs++; console.log(`  ✗ ${nom} ${extra}`); }
};

// ── Payload RÉEL, recopié de cross_post_jobs.error du job f0b84d87 ──────────
const PARAPLUIE =
  "Impossible de modifier l'annonce. L'objet ne peut pas être mis en vente ou modifié. " +
  "Il est possible que le titre ou la description contienne des mots inappropriés ou que " +
  "le vendeur enfreigne le règlement d'eBay.";
const HTML =
  "Nous avons toujours besoin de v&eacute;rifier vos informations. Pour pr&eacute;server la " +
  "s&eacute;curit&eacute; de notre place de march&eacute; pour vous et la communaut&eacute; eBay, " +
  "seuls les vendeurs v&eacute;rifi&eacute;s peuvent mettre des objets en vente. Pour le moment, " +
  "vous pouvez tout de m&ecirc;me enregistrer un brouillon de votre annonce." +
  "<font color=#757575 size=1>{e297509-1299121x}</font>";
const CLAIR =
  "Nous avons toujours besoin de vérifier vos informations. Pour préserver la sécurité de notre " +
  "place de marché pour vous et la communauté eBay, seuls les vendeurs vérifiés peuvent mettre " +
  "des objets en vente. Pour le moment, vous pouvez tout de même enregistrer un brouillon de votre annonce.";

const REFUS_KYC = {
  errorId: 25019,
  message: PARAPLUIE,
  params: [
    { name: "0", value: HTML },
    { name: "1", value: CLAIR },
    { name: "2", value: "KYC_DSAReq_EUB2C_SYI" },
    { name: "3", value: "1299121" },
    { name: "4", value: HTML },
  ],
};

console.log("\n▸ Le refus RÉEL du 10/09 (KYC_DSAReq_EUB2C_SYI)");
{
  const m = motifReelEbay(REFUS_KYC);
  check("un motif est reconnu", !!m);
  check("le code est relevé tel quel", m?.code === "KYC_DSAReq_EUB2C_SYI", `→ ${m?.code}`);
  check("il est NOMMÉ (notre phrase, pas celle d'eBay)", m?.nomme === true);
  check("le message parle de vérification d'identité", /vérifier ton identité de vendeur/i.test(m?.message ?? ""));
  check("le message dit que c'est à faire sur eBay", /directement sur eBay/i.test(m?.message ?? ""));
  check("le message dit que NOUS n'y pouvons rien", /ne\s+pouvons\s+pas le faire à ta place/i.test(m?.message ?? ""));
  check("le message DISCULPE l'article", /ne vient ni de ton article ni de ton annonce/i.test(m?.message ?? ""));
  // ── LE CŒUR : plus un seul mot du texte accusateur ──
  for (const mot of ["mots inappropriés", "enfreigne", "règlement d'eBay", "Impossible de modifier"]) {
    check(`le texte accusateur a disparu : « ${mot} »`, !(m?.message ?? "").includes(mot),
      "→ le message accuse encore l'utilisateur");
  }
}

console.log("\n▸ Un code INCONNU : on cite eBay, on n'invente pas");
{
  const m = motifReelEbay({ ...REFUS_KYC, params: [
    { name: "0", value: HTML },
    { name: "1", value: CLAIR },
    { name: "2", value: "SOME_FUTURE_REASON_CODE" },
  ] });
  check("un motif est quand même rendu", !!m);
  check("le code inconnu est relevé", m?.code === "SOME_FUTURE_REASON_CODE", `→ ${m?.code}`);
  check("il n'est PAS nommé", m?.nomme === false);
  check("la phrase d'eBay est citée, décodée", (m?.message ?? "").includes("vérifier vos informations"));
  check("les entités HTML sont décodées", !/&[a-z]+;/i.test(m?.message ?? ""), `→ ${m?.message?.slice(0, 90)}`);
  check("les balises HTML ont sauté", !/<[^>]+>/.test(m?.message ?? ""));
  check("le parapluie n'est pas repris", !(m?.message ?? "").includes("mots inappropriés"));
}

console.log("\n▸ NON-RÉGRESSION : un refus sans parameters ne change rien");
{
  check("params absents → null (message d'origine conservé)",
    motifReelEbay({ errorId: 25002, message: "Un titre est requis." }) === null);
  check("params vides → null",
    motifReelEbay({ errorId: 25002, message: "Un titre est requis.", params: [] }) === null);
  check("params sans code NI phrase → null",
    motifReelEbay({ errorId: 25002, message: "x", params: [{ name: "0", value: "3001" }] }) === null);
  // Un aspect refusé (25129) porte des paramètres COURTS (nom d'aspect, valeur)
  // et est traité BIEN AVANT ce chemin : il ne doit surtout pas être capté ici.
  check("aspect court (25129) → null, son propre chemin reste maître",
    motifReelEbay({ errorId: 25129, message: "x", params: [{ name: "0", value: "Taille" }, { name: "1", value: "48" }] }) === null);
}

console.log("\n▸ Le motif ne se déclenche jamais sur un mot ordinaire");
{
  for (const faux of ["Costume", "Hugo Boss", "Trois-pièces", "EBAY_FR", "A_B"]) {
    check(`« ${faux} » n'est pas pris pour un code`,
      motifReelEbay({ errorId: 1, message: "x", params: [{ name: "0", value: faux }] })?.code == null);
  }
  check("« KYC_DSAReq_EUB2C_SYI » l'est",
    motifReelEbay({ errorId: 1, message: "x", params: [{ name: "0", value: "KYC_DSAReq_EUB2C_SYI" }] })?.code
      === "KYC_DSAReq_EUB2C_SYI");
}

console.log(
  echecs === 0
    ? "\n[selftest:ebay-motif-refus] OK — le vrai motif passe devant le texte parapluie.\n"
    : `\n[selftest:ebay-motif-refus] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
