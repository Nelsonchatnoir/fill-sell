// ═══════════════════════════════════════════════════════════════════════════
// `npm run selftest:depop-identite-lecture` — L'IDENTITÉ PROUVÉE SERT LES LECTURES PUBLIQUES (13/11, bloc E3)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (lu en base le 13/11, lecture seule ; heures de Paris) : 4d946500 (relevés Depop 18:57 et 19:27) et 8ac5bbda
// (20:04 et 20:22) ont perdu leurs relevés sur « [incomplet] session Depop illisible (reseau) », sur leur ordinateur
// (ni Cloud, ni version : 0.6.186 comme les comptes sains), alors que users/me avait répondu plus tôt le même jour
// (4d946500 : relevé 18:31, ventes 18:39). Depuis le 25/10 : 65 échecs de ce type sur ~900 lectures Depop, ZÉRO réponse
// HTTP lisible, UNE seule lecture publique en échec ; 40 des 65 avec un autre compte qui lisait Depop dans les 20 min.
// Seul users/me (l'appel authentifié, à pré-requête CORS) tombe ; le relevé et les ventes ne lisent pourtant que des
// pages PUBLIQUES (depopParcourir, `authentifie: false`) — users/me ne leur donne que le numéro de la boutique.
// LA RÈGLE (content-scripts/depop.js § 2 bis) : l'identité PROUVÉE par users/me est retenue pour CE jeton (empreinte
// SHA-256, jamais le jeton), 24 h ; users/me muet « réseau » + MÊME jeton → la boutique publique est lue et le run le dit.
// ⛔ Jamais pour une écriture ni pour la sonde ; jamais sur 401, sans jeton, autre jeton, réponse HTTP lisible, > 24 h.
//
// Ce test EXÉCUTE le connecteur entier (content-scripts/depop.js) dans un bac à sable : cookie, fetch, horloge et
// chrome.storage simulés ; données synthétiques (aucun compte réel).
// Rouge avant / vert après : `node scripts/depop-identite-lecture-selftest.mjs --depop <ancien depop.js> --background <ancien background.js>`.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.join(RACINE, defaut); };
const lire = (p) => fs.readFileSync(p, "utf8").split("\r\n").join("\n");
const SRC_DEPOP = lire(arg("--depop", "chrome-extension/content-scripts/depop.js"));
const SRC_BG = lire(arg("--background", "chrome-extension/background.js"));

let verts = 0, rouges = 0;
const dit = (nom, c, detail) => { if (c) verts++; else rouges++; console.log(`  ${c ? "ok  " : "RATÉ"} ${nom}${c || detail === undefined ? "" : `  ← ${detail}`}`); };

const ID_DEPOP = 380069661;                         // synthétique
const JETON = "jeton-synthetique-0123456789abcdef";  // synthétique
const T_PREUVE = Date.parse("2026-11-13T17:31:17Z"); // 18:31 Paris : users/me répond
const T_MUET = Date.parse("2026-11-13T17:57:25Z");   // 18:57 Paris : users/me muet (réseau)

/**
 * Un poste simulé. `moi` : issue de users/me — "X" (rejet réseau, « Failed to fetch »), ou un statut HTTP.
 * Le stockage (chrome.storage.local) survit d'une page à l'autre : c'est le même navigateur.
 */
function poste({ stockage = {}, sansStockage = false } = {}) {
  const etat = { cookie: `access_token=${encodeURIComponent(JETON)}; autre=1`, maintenant: T_PREUVE, moi: 200, apresMoi: null, appels: [] };
  let ecouteur = null;
  class HorlogeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [etat.maintenant])); }
    static now() { return etat.maintenant; }
  }
  const objet = (slug, statut) => ({ id: Number(String(slug).length) * 1000 + 7, slug, description: `Article de test ${slug}\nligne 2`, status: statut, pictures: [], pricing: { currency: "EUR", current_price: { price_breakdown: { price: { amount: "999.00" } } } }, updated_at: "2026-11-12T10:00:00Z", listed_quantity: 1 });
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    TextEncoder, crypto: globalThis.crypto, Date: HorlogeDate,
    setTimeout: (f) => { f(); return 0; },
    localStorage: { getItem: () => null },
    document: { get cookie() { return etat.cookie; } },
    fetch: async (url, init) => {
      const u = String(url);
      etat.appels.push({ u, auth: !!init?.headers?.Authorization, methode: init?.method ?? "GET" });
      const repondre = (statut, corps) => ({ status: statut, ok: statut >= 200 && statut < 300, text: async () => JSON.stringify(corps) });
      if (u.endsWith("/presentation/api/v1/users/me/")) {
        if (typeof etat.apresMoi === "function") etat.apresMoi();
        if (etat.moi === "X") throw new TypeError("Failed to fetch");
        return etat.moi === 200 ? repondre(200, { id: ID_DEPOP, username: "vendeur_test", country: "fr" }) : repondre(etat.moi, { error: "x" });
      }
      if (u.includes(`/shops/${ID_DEPOP}/products/by-status/sold/`)) return repondre(200, { objects: [objet("vendeur_test-vendu-a1b2", "STATUS_PURCHASED")], page_info: { has_more: false } });
      if (u.includes(`/shops/${ID_DEPOP}/products/`)) return repondre(200, { objects: [objet("vendeur_test-robe-c3d4", "STATUS_ONSALE"), objet("vendeur_test-jean-e5f6", "STATUS_ONSALE")], page_info: { has_more: false } });
      return repondre(404, { error: "Product not found" });
    },
    chrome: {
      runtime: { onMessage: { addListener: (f) => { ecouteur = f; } }, sendMessage: () => Promise.resolve() },
      ...(sansStockage ? {} : {
        storage: { local: {
          get: async (k) => (k in stockage ? { [k]: structuredClone(stockage[k]) } : {}),
          set: async (o) => { Object.assign(stockage, structuredClone(o)); },
        } },
      }),
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC_DEPOP, ctx, { filename: "depop.js" });
  const message = (msg) => new Promise((ok) => { ecouteur(msg, {}, ok); });
  return { etat, stockage, ctx, message };
}

console.log("\nA. LE CAS DU 13/11 (synthétique) : users/me répond à 18:31, se tait à 18:57 — le relevé lit la boutique publique");
const commun = {};
{
  const p = poste({ stockage: commun });
  const avant = await p.message({ type: "DEPOP_LISTE_ARTICLES" });
  dit("18:31 : users/me répond → relevé normal (2 annonces), sans reprise", avant?.success === true && avant.articles?.length === 2 && !avant.session_reprise, JSON.stringify(avant).slice(0, 200));
}
{
  const p = poste({ stockage: commun });
  p.etat.maintenant = T_MUET; p.etat.moi = "X";
  const r = await p.message({ type: "DEPOP_LISTE_ARTICLES" });
  dit("18:57 : users/me muet (réseau), MÊME jeton → le relevé RÉUSSIT (avant : « session Depop illisible (reseau) »)", r?.success === true && r.articles?.length === 2, JSON.stringify(r).slice(0, 220));
  dit("… sur la boutique de l'identité PROUVÉE (même numéro)", r?.boutique?.id === ID_DEPOP, JSON.stringify(r?.boutique));
  dit("… et il le DIT (session_reprise : motif réseau, heure de la preuve en heure de Paris)", r?.session_reprise?.motif === "reseau" && /18:31/.test(String(r?.session_reprise?.note ?? "")) && /identité prouvée pour ce même jeton/.test(String(r?.session_reprise?.note ?? "")), JSON.stringify(r?.session_reprise));
  const moi = p.etat.appels.filter((a) => a.u.endsWith("/users/me/"));
  const pub = p.etat.appels.filter((a) => a.u.includes("/shops/"));
  dit("users/me a bien été tenté trois fois (les reprises de 1 s et 2,5 s sont inchangées)", moi.length === 3, `${moi.length} appel(s)`);
  dit("la boutique est lue SANS Authorization (lecture publique)", pub.length >= 1 && pub.every((a) => !a.auth && a.methode === "GET"), JSON.stringify(pub));
}
{
  const p = poste({ stockage: commun });
  p.etat.maintenant = T_MUET + 60_000; p.etat.moi = "X";
  const v = await p.message({ type: "DEPOP_VENTES" });
  dit("les VENTES aussi : users/me muet, même jeton → les ventes sont lues (avant : « session_illisible_reseau »)", v?.ok === true && v.rows?.length === 1 && v.motif == null, JSON.stringify(v).slice(0, 200));
  dit("… et le disent (session_reprise)", v?.session_reprise?.motif === "reseau", JSON.stringify(v?.session_reprise));
}
{
  const brut = JSON.stringify(commun);
  dit("le stockage ne garde JAMAIS le jeton (une empreinte de 32 caractères hexadécimaux)", brut.length > 2 && !brut.includes(JETON) && !brut.includes(encodeURIComponent(JETON)) && /^[0-9a-f]{32}$/.test(String(commun.depop_identite_prouvee?.empreinte ?? "")), brut.slice(0, 160));
}

console.log("\nB. CE QUI NE CHANGE PAS : aucune identité inventée");
const echecReseau = (r) => r?.success === false && r.error === "session Depop illisible (reseau)";
{
  const p = poste({ stockage: structuredClone(commun) });
  p.etat.maintenant = T_MUET; p.etat.moi = "X"; p.etat.cookie = "access_token=un-autre-jeton-de-test";
  dit("un AUTRE jeton (reconnexion, autre compte) → « session Depop illisible (reseau) », comme avant", echecReseau(await p.message({ type: "DEPOP_LISTE_ARTICLES" })));
}
{
  const p = poste({ stockage: structuredClone(commun) });
  p.etat.maintenant = T_PREUVE + 24 * 3600_000 + 60_000; p.etat.moi = "X";
  dit("une preuve de PLUS de 24 h → « session Depop illisible (reseau) », comme avant", echecReseau(await p.message({ type: "DEPOP_LISTE_ARTICLES" })));
}
{
  const p = poste({ stockage: structuredClone(commun) });
  p.etat.maintenant = T_MUET; p.etat.moi = 500;
  const r = await p.message({ type: "DEPOP_LISTE_ARTICLES" });
  dit("une RÉPONSE lisible (HTTP 500) → « illisible (http_500) », aucune reprise", r?.success === false && r.error === "session Depop illisible (http_500)", JSON.stringify(r).slice(0, 160));
}
{
  const p = poste({ stockage: structuredClone(commun) });
  p.etat.maintenant = T_MUET; p.etat.moi = 401;
  const r = await p.message({ type: "DEPOP_LISTE_ARTICLES" });
  dit("users/me 401 → « Connexion Depop requise » (session fermée), jamais l'identité retenue", r?.success === false && r.needsUser === true && /^Connexion Depop requise/.test(r.error), JSON.stringify(r).slice(0, 160));
}
{
  const p = poste({ stockage: structuredClone(commun) });
  p.etat.maintenant = T_MUET; p.etat.cookie = "autre=1";
  const r = await p.message({ type: "DEPOP_VENTES" });
  dit("sans jeton → ventes « session » (fermée), jamais l'identité retenue", r?.ok === false && r.motif === "session", JSON.stringify(r).slice(0, 160));
}
{
  const p = poste({ stockage: structuredClone(commun) });
  p.etat.maintenant = T_MUET; p.etat.moi = "X";
  const s = await p.message({ type: "DEPOP_SESSION" });
  dit("la SONDE (DEPOP_SESSION) ne devient jamais « connecté » sur une erreur réseau", s?.connecte === null && s.motif === "reseau", JSON.stringify(s).slice(0, 160));
}
{
  const p = poste({ sansStockage: true });
  p.etat.maintenant = T_MUET; p.etat.moi = "X";
  dit("stockage indisponible → aucune exception, « session Depop illisible (reseau) » comme avant", echecReseau(await p.message({ type: "DEPOP_LISTE_ARTICLES" })));
}
{
  const vierge = {};
  const p = poste({ stockage: vierge });
  p.etat.apresMoi = () => { p.etat.cookie = "access_token=jeton-change-pendant-l-appel"; };
  await p.message({ type: "DEPOP_SESSION" });
  dit("le cookie change PENDANT users/me (reconnexion) → aucune identité retenue", !vierge.depop_identite_prouvee, JSON.stringify(vierge).slice(0, 160));
}
{
  // La sonde réussie retient l'identité, comme le relevé (8ac5bbda : sonde users/me 200 à 21:52).
  const st = {};
  const p = poste({ stockage: st });
  await p.message({ type: "DEPOP_SESSION" });
  dit("une SONDE réussie (users/me 200) retient l'identité pour ce jeton", st.depop_identite_prouvee?.id === ID_DEPOP && st.depop_identite_prouvee?.le === T_PREUVE, JSON.stringify(st).slice(0, 160));
}

console.log("\nC. LES ÉCRITURES ET LE SERVICE WORKER");
{
  const corpsDe = (nom) => {
    const i = SRC_DEPOP.indexOf(`async function ${nom}(`);
    if (i < 0) return "";
    const j = SRC_DEPOP.indexOf("\nasync function ", i + 10);
    const k = SRC_DEPOP.indexOf("\nfunction ", i + 10);
    return SRC_DEPOP.slice(i, Math.min(...[j, k].filter((x) => x > 0), SRC_DEPOP.length));
  };
  const appelsLecture = [...SRC_DEPOP.matchAll(/await depopSessionPourLecture\(\)/g)].length;
  dit("depopSessionPourLecture n'est appelée QUE par le relevé et les ventes (2 appels)", appelsLecture === 2 && /depopSessionPourLecture\(\)/.test(corpsDe("listerMesArticles")) && /depopSessionPourLecture\(\)/.test(corpsDe("lireVentesDepop")), `${appelsLecture} appel(s)`);
  const ecritures = ["fillListingForm", "deleteListing", "modifierCouleurAnnonce"];
  dit("publication, retrait, modification : depopSession seule, jamais l'identité retenue", ecritures.every((n) => { const c = corpsDe(n); return c && /await depopSession\(\)/.test(c) && !/depopSessionPourLecture|depopIdentiteRetenue/.test(c); }),
    ecritures.filter((n) => { const c = corpsDe(n); return !c || !/await depopSession\(\)/.test(c) || /depopSessionPourLecture|depopIdentiteRetenue/.test(c); }).join(", "));
  dit("le relevé (background) DIT la reprise dans le run ([défilement] ← session_reprise.note)", /r\.session_reprise\?\.note \? \{ defilement: String\(r\.session_reprise\.note\)/.test(SRC_BG));
  dit("les ventes (background) gardent session_reprise jusqu'à la trace releve_ventes", /session_reprise: r\?\.session_reprise \?\? null/.test(SRC_BG) && /platform === "depop" && lecture\?\.session_reprise \? \{ session_reprise: lecture\.session_reprise \}/.test(SRC_BG));
}

console.log(`\n${rouges ? "ROUGE" : "VERT"} — selftest:depop-identite-lecture : ${verts} ok, ${rouges} raté(s)`);
if (rouges) process.exit(1);
