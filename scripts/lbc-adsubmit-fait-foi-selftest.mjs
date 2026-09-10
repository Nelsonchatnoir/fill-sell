// ═══════════════════════════════════════════════════════════════════════════
// Selftest : L'ADSUBMIT FAIT FOI (2026-09-10, jean de Choupette)
//   node scripts/lbc-adsubmit-fait-foi-selftest.mjs
//
// LE CAS. Job 718eed78, « Jean brut Bleu Bonheur Taille 46 », 11 €, déposé le
// 10/09 à 15 h 13. Leboncoin a répondu 201 avec {"ad_id":3267008305} — l'id de
// NOTRE annonce. Le job a pourtant reçu listing_url = .../3256587082, qui est
// l'annonce PERSONNELLE de la vendeuse (25 août, 15 €, même jean, toujours en
// vente) : le handler LBC ne rend jamais d'URL, on la cherchait donc dans
// « Mes annonces » PAR TITRE, et les deux annonces portaient tous les mots du
// titre visé.
// CE QUE ÇA COÛTAIT : le retrait à la vente supprime listing_url — on aurait
// supprimé l'annonce D'ELLE et laissé la nôtre en ligne. La garde
// anti-mauvaise-suppression de leboncoin.js n'aurait rien vu : elle compare
// les mots du titre, et ils y étaient tous.
//
// ⚠️ ET CE QUE LE CORRECTIF NE DOIT PAS CASSER : on ne fabrique PAS l'URL à
// partir de l'id. Au dépôt l'annonce est en vérification, sa page rend 404, et
// le veilleur de vente lit un 404 comme « morte ». On rend `null`, et c'est la
// re-capture différée qui posera l'URL en cherchant PAR ID.
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

// La fonction réellement embarquée, extraite (jamais recopiée).
const bloc = SRC.slice(SRC.indexOf("function idAdsubmitLbc"), SRC.indexOf("async function captureListingUrl"));
if (!bloc) throw new Error("idAdsubmitLbc introuvable dans background.js");
const idAdsubmitLbc = new Function(`${bloc}\nreturn idAdsubmitLbc;`)();

// Le job RÉEL, tel qu'il était en base avant correction.
const JOB_CHOUPETTE = {
  title: "Jean brut Bleu Bonheur Taille 46",
  platform_fields: {
    lbc_depot: {
      preuve: "confirmation (message « Votre annonce est publiée »)",
      adsubmit: { id: "3267008305", status: 201, statut: "created" },
    },
  },
};

console.log("\n▸ L'id de l'adsubmit est reconnu");
{
  check("depuis platform_fields (job relu en base)",
    idAdsubmitLbc("leboncoin", JOB_CHOUPETTE) === "3267008305");
  check("depuis result.lbcAdId (retour direct du handler)",
    idAdsubmitLbc("leboncoin", {}, { lbcAdId: 3267008305 }) === "3267008305");
  check("depuis result.lbcDepot.adsubmit.id",
    idAdsubmitLbc("leboncoin", {}, { lbcDepot: { adsubmit: { id: "3267008305" } } }) === "3267008305");
  check("le result PRIME sur le job (l'information la plus fraîche)",
    idAdsubmitLbc("leboncoin", JOB_CHOUPETTE, { lbcAdId: "3299999999" }) === "3299999999");
}

console.log("\n▸ Rien d'autre ne passe pour un id");
{
  const nul = (nom, ...args) => check(nom, idAdsubmitLbc(...args) === null);
  nul("plateforme Vinted, même forme", "vinted", JOB_CHOUPETTE);
  nul("plateforme Beebs", "beebs", JOB_CHOUPETTE);
  nul("aucun lbc_depot", "leboncoin", { platform_fields: {} });
  nul("lbc_depot sans adsubmit", "leboncoin", { platform_fields: { lbc_depot: { preuve: "x" } } });
  nul("id vide", "leboncoin", { platform_fields: { lbc_depot: { adsubmit: { id: "" } } } });
  nul("id trop court", "leboncoin", { platform_fields: { lbc_depot: { adsubmit: { id: "12345" } } } });
  nul("id non numérique", "leboncoin", { platform_fields: { lbc_depot: { adsubmit: { id: "abc123456" } } } });
  nul("job vide", "leboncoin", {});
  nul("job null", "leboncoin", null);
}

console.log("\n▸ Quand l'id est connu : AUCUNE recherche par titre");
{
  const capture = SRC.slice(SRC.indexOf("async function captureListingUrl"),
                            SRC.indexOf("// Cherche le lien de NOTRE annonce"));
  check("captureListingUrl consulte l'adsubmit AVANT toute autre piste",
    capture.indexOf("idAdsubmitLbc") < capture.indexOf("findListingLinkInPage"),
    "— sinon l'appariement par titre gagnerait la course");
  check("et il consulte l'adsubmit AVANT « Mes annonces »",
    capture.indexOf("idAdsubmitLbc") < capture.indexOf("captureFromMyListings"));
  check("le chemin « dépôt non confirmé » saute aussi la recherche par titre",
    /!idAdsubmitLbc\("leboncoin", job, result\)\) \{/.test(SRC));
}

console.log("\n▸ ⚠️ ON NE FABRIQUE PAS L'URL DEPUIS L'ID (404 en vérification)");
{
  const capture = SRC.slice(SRC.indexOf("async function captureListingUrl"),
                            SRC.indexOf("// Cherche le lien de NOTRE annonce"));
  check("aucune URL n'est construite à partir de l'id",
    !/leboncoin\.fr\/ad\/[^`"']*\$\{\s*id/.test(SRC),
    "— l'annonce est en vérification, sa page rend 404, et le veilleur lit 404 = morte");
  check("on rend `null` : pas d'URL pour l'instant",
    /idSur\) \{[\s\S]{0,400}?return null;/.test(capture));
  // Le code écrit « EN VÉRIFICATION » en capitales : la comparaison doit être
  // insensible à la casse, sinon le test échoue sur sa propre orthographe.
  check("le motif (vérification → 404) est écrit dans le code, pas seulement su",
    /v[ée]rification[\s\S]{0,200}?404/i.test(SRC));
}

console.log("\n▸ La re-capture différée sait déjà chercher PAR ID (0.6.24)");
{
  check("recherche par id quand platform_listing_id est numérique",
    /motifParIdLbc[\s\S]{0,200}?platform_listing_id/.test(SRC));
  check("et elle n'utilise le titre qu'en repli",
    /urlParId\s*\n?\s*\?\s*\{ url: urlParId/.test(SRC));
}

console.log(
  echecs === 0
    ? "\n[selftest:lbc-adsubmit-fait-foi] OK — l'id rendu par Leboncoin prime, et on ne fabrique pas d'URL prématurée.\n"
    : `\n[selftest:lbc-adsubmit-fait-foi] ÉCHEC — ${echecs} vérification(s) en défaut.\n`,
);
process.exit(echecs === 0 ? 0 : 1);
