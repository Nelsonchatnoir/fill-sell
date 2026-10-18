// Génère scripts/essais/20261018150000_essai.sql depuis son gabarit : la migration et
// l'inverse y sont insérés octet pour octet (aucune copie à la main).
//   node scripts/essais/20261018150000_generer.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lire = (p) => fs.readFileSync(path.join(R, p), "utf8");
const gabarit = lire("scripts/essais/20261018150000_essai.template.sql");
const mig = lire("supabase/migrations/20261018150000_vente_declaree_beebs_rangee_beebs.sql");
const inv = lire("supabase/rollbacks/20261018150000_vente_declaree_beebs_rangee_beebs_INVERSE.sql");
if (!gabarit.includes("--@@MIGRATION@@") || !gabarit.includes("--@@INVERSE@@")) throw new Error("gabarit sans repères");
fs.writeFileSync(path.join(R, "scripts/essais/20261018150000_essai.sql"),
  gabarit.replace("--@@MIGRATION@@", () => mig).replace("--@@INVERSE@@", () => inv));
console.log("→ scripts/essais/20261018150000_essai.sql");
