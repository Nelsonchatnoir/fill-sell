// selftest:bordereau-fichier-octets — (24/10, test réel du bordereau Vinted, Nico) Le fichier d'une étiquette Vinted se
// lit EN OCTETS : un PDF / PNG / JPEG brut est pris tel quel ; un JSON donne son base64 ou son lien (suivi une fois) ;
// un échec dit la forme vue (route, http, type, taille, clés — jamais une valeur), à la suite du motif.
//   npm run selftest:bordereau-fichier-octets
// Cause : 8 demandes, 0 fichier — `r.json()` sur un PDF rendait null, « http_200_puis_200 » 36 fois (Louis, Ornella).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(RACINE, "chrome-extension/messagerie.js"), "utf8").replace(/\r\n/g, "\n");
const g = {};
new Function("globalThis", "self", SOURCE)(g, g);
const M = g.FILLSELL_MESSAGERIE;
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("bordereau-fichier-octets-selftest");

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25];
// Un faux réseau réaliste : JSON → octets de JSON ; { __octets } → octets bruts ; { __html } → une page.
function reseau(table) {
  const appels = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    appels.push({ url: u, credentials: init.credentials ?? null });
    // La clé qui colle le plus loin dans l'adresse gagne (« …/transactions/T/shipment/pdf_label » = pdf_label).
    const cle = Object.keys(table).filter((k) => u.includes(k))
      .sort((a, b) => u.lastIndexOf(b) - u.lastIndexOf(a) || b.length - a.length)[0];
    const rep = cle ? table[cle] : { status: 404, corps: {} };
    const corps = rep.corps ?? {};
    const brut = Array.isArray(corps.__octets);
    const html = typeof corps.__html === "string";
    const octets = brut ? new Uint8Array(corps.__octets) : new TextEncoder().encode(html ? corps.__html : JSON.stringify(corps));
    const type = brut ? (corps.type ?? "application/pdf") : html ? "text/html" : "application/json";
    return { status: rep.status ?? 200, ok: (rep.status ?? 200) < 300, redirected: false, url: u,
      headers: { get: (h) => (String(h).toLowerCase() === "content-type" ? type : null) },
      json: async () => JSON.parse(new TextDecoder().decode(octets)), arrayBuffer: async () => octets.buffer };
  };
  return { f, appels };
}
const transaction = (statut = 230) => ({ corps: { transaction: { shipment: { id: 77, status: statut } } } });

await cas("1. Vinted rend le PDF lui-même (application/pdf) : il est pris tel quel — fini « http_200_puis_200 »", async () => {
  const { f, appels } = reseau({ "/transactions/23532974658": transaction(), "/label_options": { corps: {} },
    "/shipment/pdf_label": { corps: { __octets: PDF } } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "23532974658", derniereMarche: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(Buffer.from(r.base64, "base64")[0], 0x25, "les octets du PDF");
  assert.ok(!appels.some((a) => a.url.includes("/digital_label")), "un fichier trouvé : aucun recours");
  assert.ok(r.formes.some((x) => /pdf_label:200 fichier 10o/.test(x)), JSON.stringify(r.formes));
});

await cas("2. l'ancienne forme JSON {file:{label}} marche toujours (rien ne régresse)", async () => {
  const { f } = reseau({ "/transactions/T1": transaction(), "/label_options": { corps: {} },
    "/shipment/pdf_label": { corps: { file: { label: "JVBERi0xLjc=", filename: "etiquette.pdf" } } } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "T1", derniereMarche: true });
  assert.equal(r.ok, true);
  assert.equal(r.base64, "JVBERi0xLjc=");
  assert.equal(r.nom, "etiquette.pdf");
});

globalThis.location = { origin: "https://www.vinted.fr", href: "https://www.vinted.fr/inbox" };
await cas("3. un JSON qui donne un LIEN : suivi une fois — session à la même adresse que la page, ailleurs sans", async () => {
  let { f, appels } = reseau({ "/transactions/T2": transaction(), "/label_options": { corps: {} },
    "/shipment/pdf_label": { corps: { label_url: "https://www.vinted.fr/fichiers/etiquette-77.pdf?jeton=SIGNE" } },
    "/fichiers/etiquette-77.pdf": { corps: { __octets: PDF } } });
  globalThis.fetch = f;
  let r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "T2", derniereMarche: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(appels.find((a) => a.url.includes("/fichiers/"))?.credentials, "include");
  assert.ok(!r.etapes.some((e) => e.includes("SIGNE")), "la trace ne garde jamais le jeton d'un lien signé");
  ({ f, appels } = reseau({ "/transactions/T2b": transaction(), "/label_options": { corps: {} },
    "/shipment/pdf_label": { corps: { label_url: "https://cdn.vinted.net/etiquettes/77.pdf" } },
    "cdn.vinted.net": { corps: { __octets: PDF } } }));
  globalThis.fetch = f;
  r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "T2b", derniereMarche: true });
  assert.equal(r.ok, true);
  assert.equal(appels.find((a) => a.url.includes("cdn.vinted.net"))?.credentials, "omit", "un CDN : sans la session (CORS)");
  ({ f, appels } = reseau({ "/transactions/T3": transaction(), "/label_options": { corps: {} },
    "/shipment/pdf_label": { corps: { file: { url: "https://transporteur.example/etiquette.pdf" } } },
    "transporteur.example": { corps: { __octets: PDF } } }));
  globalThis.fetch = f;
  r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "T3", derniereMarche: true });
  assert.equal(r.ok, true);
  assert.equal(appels.find((a) => a.url.includes("transporteur.example"))?.credentials, "omit", "jamais la session Vinted chez un tiers");
});

await cas("4. aucun fichier : les DEUX routes une fois chacune, et le motif dit la forme vue (jamais une valeur)", async () => {
  const { f, appels } = reseau({ "/transactions/T4": transaction(), "/label_options": { corps: {} },
    "/shipment/pdf_label": { corps: { shipment: { id: 77, tracking_code: "SECRET-123" } } },
    "/shipment/digital_label": { corps: { __html: "<!doctype html><html>…</html>" } } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "T4", derniereMarche: true });
  assert.equal(r.ok, false);
  assert.equal(appels.filter((a) => a.url.includes("/pdf_label")).length, 1);
  assert.equal(appels.filter((a) => a.url.includes("/digital_label")).length, 1);
  assert.ok(r.motif.startsWith("http_200_puis_200 · "), r.motif);
  assert.ok(/pdf_label:200 json\{shipment\}/.test(r.motif) && /digital_label:200 html/.test(r.motif), r.motif);
  assert.ok(!r.motif.includes("SECRET"), "aucune valeur dans la trace");
  assert.ok(r.motif.length <= 120);
});

await cas("5. la dernière marche fermée : aucune requête vers le fichier (garde d'avant)", async () => {
  const { f, appels } = reseau({ "/transactions/T5": transaction(), "/label_options": { corps: {} } });
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "T5", derniereMarche: false });
  assert.equal(r.motif, "fermee");
  assert.ok(!appels.some((a) => /pdf_label|digital_label/.test(a.url)));
});

console.log(`bordereau-fichier-octets-selftest : ${n} cas verts`);
