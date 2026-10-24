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
    if (rep.cors === true) throw new TypeError("Failed to fetch");   // S3 sans CORS pour vinted.fr (vu le 24/10)
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

// ── (24/10 soir) LA FORME RÉELLE, lue sur la commande 23532974658 de Nico (Vinted Go) ──────────────────────────────
const S3 = "https://svc-shipping-labels.s3.eu-central-1.amazonaws.com/labels/77/etiquette?response-content-disposition=attachment&X-Amz-Signature=SIGNATURESECRETE";
const reelle = () => ({ "/transactions/23532974658": transaction(230), "/label_options": { corps: {} },
  "/shipment/pdf_label": { corps: { code: 0 } },
  "/shipment/digital_label": { corps: { digital_label: {
    image_url: S3, code: "CODEDEPOT1234567", carrier: { name: "Vinted Go", icon_url: "https://static.vinted.com/carriers/go.png" },
    items: [{ name: "Short de bain", image_url: "https://images1.vinted.net/t/photo-article.jpeg" }],
    receiver_name: "Acheteuse Nom", delivery_estimate: "2-3 jours", expiration_date: "2026-11-02T10:00:00+01:00",
    digital_label_title: "t", label_expires_title: "t", download_label_title: "Télécharger l'étiquette", header_subtitle: "t",
    label_icon: "https://static.vinted.com/icons/label.png" }, code: 0 } },
  "svc-shipping-labels.s3": { cors: true } });

await cas("6. forme réelle : le lien S3 du PDF (digital_label.image_url) est rendu au background — jamais une photo, jamais écrit", async () => {
  const { f, appels } = reseau(reelle());
  globalThis.fetch = f;
  const r = await M.CHEMINS_BORDEREAU.vinted({ transactionId: "23532974658", derniereMarche: true });
  assert.equal(r.ok, false);
  assert.equal(r.lienFichier, S3, "le lien du PDF, et lui seul");
  assert.ok(!appels.some((a) => /images1\.vinted\.net|static\.vinted\.com/.test(a.url)), "ni la photo de l'article ni une icône");
  assert.equal(appels.find((a) => a.url.startsWith("https://svc-shipping-labels"))?.credentials, "omit", "jamais la session Vinted chez S3");
  for (const secret of ["SIGNATURESECRETE", "CODEDEPOT", "Acheteuse", "svc-shipping-labels", "X-Amz"]) {
    assert.ok(!r.motif.includes(secret) && !r.etapes.join(" ").includes(secret) && !r.formes.join(" ").includes(secret), `${secret} jamais dans la trace`);
  }
  assert.ok(/pdf_label:200 json\{code\}/.test(r.motif) && /digital_label:200 json\{digital_label,code,digital_label\.image_url/.test(r.motif), r.motif);
  assert.ok(r.motif.length <= 120);
});

// ── Le background : le lien lu par le serveur (fonction bordereau-fichier), la copie déposée comme d'habitude ──────
function extraireFonction(source, nom) {
  const debut = source.indexOf(`function ${nom}(`);
  if (debut < 0) throw new Error(`${nom} introuvable`);
  let p = source.indexOf("(", debut); let parens = 0;
  for (; p < source.length; p++) { if (source[p] === "(") parens++; else if (source[p] === ")") { parens--; if (parens === 0) break; } }
  let i = source.indexOf("{", p); let prof = 0;
  for (; i < source.length; i++) { if (source[i] === "{") prof++; else if (source[i] === "}") { prof--; if (prof === 0) return source.slice(source.lastIndexOf("async ", debut) === debut - 6 ? debut - 6 : debut, i + 1); } }
  throw new Error(`${nom} : accolades`);
}
const BG = fs.readFileSync(path.join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
const fabriquerBackground = (espions) => new Function("FILLSELL_MESSAGERIE", "FILLSELL_CONFIG", "fetch", "restRequest", "executerDansOngletPlateforme",
  "assurerJetonLeboncoin", "deposerCopieBordereau", `${extraireFonction(BG, "fichierParLeServeur")}\n${extraireFonction(BG, "obtenirBordereauBeta")}\nreturn { fichierParLeServeur, obtenirBordereauBeta };`)(
  { CHEMINS_BORDEREAU: { vinted: "chemin" }, BORDEREAU_DERNIERE_MARCHE_OUVERTE: true },
  { SUPABASE_URL: "https://projet.supabase.co", SUPABASE_ANON_KEY: "anon" },
  espions.fetch, async () => [{ value: 1 }], espions.page, async () => null, espions.deposer);

await cas("7. background : le serveur lit le lien, la copie est déposée ; le lien ne ressort jamais", async () => {
  const appels = [];
  const deposes = [];
  const bg = fabriquerBackground({
    page: async () => ({ ok: false, etape: "fichier", motif: "http_200_puis_200 · digital_label:200 json{digital_label,code}", lienFichier: S3 }),
    fetch: async (url, init) => { appels.push({ url, corps: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ ok: true, base64: "JVBERi0xLjcKJQ==", type: "application/pdf", octets: 10 }) }; },
    deposer: async (commande, fichier) => { deposes.push(fichier); return { ok: true, chemin: "u/vinted-1.pdf", copie: "c1" }; },
  });
  const r = await bg.obtenirBordereauBeta({ id: "cmd", platform: "vinted", commande_ref: "23532974658" }, "JETON");
  assert.equal(r.ok, true);
  assert.equal(r.copie, "c1");
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, "https://projet.supabase.co/functions/v1/bordereau-fichier");
  assert.equal(appels[0].corps.lien, S3);
  assert.equal(appels[0].auth, "Bearer JETON", "la session du vendeur");
  assert.equal(deposes[0].base64, "JVBERi0xLjcKJQ==");
  assert.equal(deposes[0].nom, "bordereau.pdf");
  assert.ok(!("lienFichier" in deposes[0]), "le lien ne part pas plus loin");
});

await cas("8. background : serveur absent ou refus → échec dit (« serveur http_404 »), jamais le lien", async () => {
  const bg = fabriquerBackground({
    page: async () => ({ ok: false, etape: "fichier", motif: "http_200_puis_200 · digital_label:200 json{digital_label,code}", lienFichier: S3 }),
    fetch: async () => ({ ok: false, status: 404, json: async () => ({ error: "not found" }) }),
    deposer: async () => { throw new Error("jamais"); },
  });
  const r = await bg.obtenirBordereauBeta({ id: "cmd", platform: "vinted", commande_ref: "23532974658" }, "JETON");
  assert.equal(r.ok, false);
  assert.ok(/· serveur http_404$/.test(r.motif), r.motif);
  assert.ok(!("lienFichier" in r) && !JSON.stringify(r).includes("SIGNATURE"));
  const bg2 = fabriquerBackground({
    page: async () => ({ ok: false, motif: "m", lienFichier: S3 }),
    fetch: async () => { throw new TypeError("réseau"); }, deposer: async () => { throw new Error("jamais"); },
  });
  const r2 = await bg2.obtenirBordereauBeta({ id: "cmd", platform: "vinted", commande_ref: "1" }, "JETON");
  assert.ok(/serveur injoignable$/.test(r2.motif) && !("lienFichier" in r2));
});

const { hoteFichierAutorise, genreDuFichier, FICHIER_MAX_OCTETS } = await import(new URL("../supabase/functions/_shared/bordereau-fichier.js", import.meta.url).href);
await cas("9. la fonction ne lit QUE le stockage des étiquettes de Vinted (liste fermée), https, sans identifiants", () => {
  const ok = (s) => hoteFichierAutorise(new URL(s));
  assert.ok(ok(S3) && ok("https://svc-shipping-labels.s3.amazonaws.com/x") && ok("https://svc-shipping-labels.s3.us-east-1.amazonaws.com/x"));
  for (const refus of ["http://svc-shipping-labels.s3.eu-central-1.amazonaws.com/x", "https://autre-seau.s3.eu-central-1.amazonaws.com/x",
    "https://svc-shipping-labels.s3.eu-central-1.amazonaws.com.pirate.example/x", "https://a:b@svc-shipping-labels.s3.amazonaws.com/x",
    "https://svc-shipping-labels.s3.amazonaws.com:8443/x", "https://www.vinted.fr/api/v2/x", "https://169.254.169.254/latest/meta-data"]) {
    assert.ok(!ok(refus), refus);
  }
  assert.equal(genreDuFichier(new Uint8Array(PDF))?.type, "application/pdf");
  assert.equal(genreDuFichier(new Uint8Array([0x3c, 0x68, 0x74, 0x6d])), null, "une page html n'est jamais un bordereau");
  assert.equal(FICHIER_MAX_OCTETS, 5 * 1024 * 1024);
});

console.log(`bordereau-fichier-octets-selftest : ${n} cas verts`);
