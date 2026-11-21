// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 8 : les frais de port Depop à l'INTERNATIONAL (facultatifs)
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant : seul `frais_port_defaut` (France) existait ; l'extension n'envoyait que `national_shipping_cost`
// (demande de Sébastien64310). Nom de l'API relevé dans le code public de Depop (21/11) : `national_shipping_cost` et
// `international_shipping_cost` côte à côte (formulaire : nationalShippingCost / internationalShippingCost, facultatif,
// < 100, case « Offer worldwide shipping »).
// Ce qu'il prouve :
//   1. le réglage (platform_settings.depop.frais_port_international) se lit par la règle du port (0 à 99,99 €) ;
//   2. le pré-vol de depop.js (exécuté) : réglé → portInternational ; absent ou illisible → null, jamais un refus ;
//   3. le corps envoyé à Depop porte `international_shipping_cost` seulement quand il est réglé ;
//   4. get-pending-jobs le pose sur la tâche SERVIE (lecture du profil déjà faite, aucune écriture en base) ;
//   5. Réglages › Depop : un champ facultatif (vide n'est jamais une erreur), écrit par platform_settings_fusionner.
//   node --import ./scripts/loader-ext.mjs scripts/lot-2111-depop-international-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { portDepopInternationalParDefaut, CLE_PORT_INTERNATIONAL_DEPOP } from "../supabase/functions/_shared/port-depop.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

console.log("1. Le réglage");
ok(CLE_PORT_INTERNATIONAL_DEPOP === "frais_port_international", "la clé : platform_settings.depop.frais_port_international");
ok(portDepopInternationalParDefaut({ depop: { frais_port_defaut: 4.9, frais_port_international: "12,50" } }) === 12.5, "« 12,50 » → 12,5 €");
ok(portDepopInternationalParDefaut({ depop: { frais_port_defaut: 4.9 } }) === null, "absent → null (France seule)");
ok(portDepopInternationalParDefaut({ depop: { frais_port_international: 120 } }) === null, "100 € ou plus → null (Depop refuse)");
ok(portDepopInternationalParDefaut(null) === null, "réglages illisibles → null");

console.log("2. Le pré-vol de depop.js (exécuté)");
const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctx.globalThis = ctx;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}\n;globalThis.__t = { depopPrevol };`, ctx, { filename: "depop.js" });
const base = (pf = {}) => ({
  description: "Blouse en lin, portée deux fois.", photos: ["https://exemple.test/1.jpg"], price: 999,
  platform_fields: { depopCategoryPath: ["womenswear", "tops", "blouses"], depopEtat: "used_excellent", depopPort: 5, ...pf },
});
{
  const r = ctx.__t.depopPrevol(base({ depopPortInternational: 12.5 }));
  ok(r.ok === true && r.portInternational === 12.5 && r.port === 5, "réglé : port 5 € (France), 12,50 € (international)", JSON.stringify({ ok: r.ok, port: r.port, int: r.portInternational }));
  const sans = ctx.__t.depopPrevol(base());
  ok(sans.ok === true && sans.portInternational === null, "absent : la tâche passe, France seule");
  for (const v of ["", "abc", -1, 100, 250]) {
    const x = ctx.__t.depopPrevol(base({ depopPortInternational: v }));
    ok(x.ok === true && x.portInternational === null, `illisible (${JSON.stringify(v)}) : jamais un refus, rien d'envoyé`);
  }
  ok(ctx.__t.depopPrevol(base({ depopPortInternational: "7,90" })).portInternational === 7.9, "« 7,90 » → 7,9");
}

console.log("3. Le corps envoyé à Depop");
{
  const depop = lire("chrome-extension/content-scripts/depop.js");
  ok(/national_shipping_cost: String\(v\.port\),\n[\s\S]{0,400}\.\.\.\(v\.portInternational != null \? \{ international_shipping_cost: String\(v\.portInternational\) \} : \{\}\),/.test(depop),
    "`international_shipping_cost` seulement quand il est réglé, à côté du national");
}

console.log("4. Le serveur le pose sur la tâche servie, sans écrire en base");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/internationalLu = portDepopInternationalParDefaut\(ps\);/.test(gpj), "lu dans la même lecture du profil que le port France");
  const i = gpj.indexOf("if (internationalLu != null) {");
  const bloc = i > 0 ? gpj.slice(i, i + 600) : "";
  ok(bloc.includes("depopPortInternational: internationalLu") && !/\.update\(/.test(bloc), "posé sur la tâche servie, aucune écriture (aucune ligne réécrite)");
  ok(/import \{ portDepopParDefaut, portDepopInternationalParDefaut,/.test(gpj), "importé de _shared/port-depop.js");
}

console.log("5. Réglages › Depop : un champ facultatif");
{
  const page = lire("src/reglages/SousPagePortDepop.jsx");
  ok(/id="port-depop-international"[^>]*facultatif/.test(page.replace(/\n\s*/g, " ")), "le champ international, marqué facultatif");
  ok(/port\.enregistrerInternational\(v\)/.test(page), "enregistré par son propre bouton");
  const champ = lire("src/components/PortDepop.jsx");
  ok(/lu\.erreur !== 'vide' \|\| \(\(touche \|\| montrerVide\) && !facultatif\)/.test(champ), "vide n'est jamais une erreur pour un champ facultatif");
  const fpd = lire("src/utils/fraisPortDepop.js");
  ok(/fusionnerReglages\(\['depop'\], \{ \[CLE_PORT_INTERNATIONAL_DEPOP\]: valeur \}\)/.test(fpd) && /fusionnerReglages\(\['depop'\], null, \[CLE_PORT_INTERNATIONAL_DEPOP\]\)/.test(fpd),
    "écrit et retiré par platform_settings_fusionner (jamais l'objet entier)");
}

console.log(`\n${verts} vertes, ${rouges} rouges — lot du 21/11, point 8 (Depop : frais de port à l'international).`);
if (rouges) { console.log("ROUGE"); process.exit(1); }
