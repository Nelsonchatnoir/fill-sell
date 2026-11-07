// ═══════════════════════════════════════════════════════════════════════════
// LES PHOTOS D'UN JOB QUI PART AILLEURS SONT CHEZ NOUS AVANT DE PARTIR (07/11, point 10)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ. 22 republications Leboncoin en attente (5 comptes) et 32 annulées en 30 jours portaient des
// photos sur images1.vinted.net. L'extension lit chaque photo par `fetch()` DEPUIS la page de dépôt (urlToFile des
// content scripts) : la page leboncoin.fr est soumise au CORS de l'hôte de l'image. Mesuré le 07/11 (curl, en-tête
// Origin) : images1.vinted.net rend 200 à tout le monde, mais n'envoie `Access-Control-Allow-Origin` qu'à
// https://www.vinted.fr — le navigateur refuse la photo à leboncoin.fr (« Failed to fetch »). Le pré-vol du
// formulaire de recréation Leboncoin rendait « illisible », nouvel essai dans 30 min, sans fin ; l'annonce n'était
// jamais touchée, mais elle ne partait jamais non plus. Le message de l'extension promettait « FillSell la rapatrie
// automatiquement » : le filet serveur existant (handler-watch, 27/08) lit les jobs en attente SANS PAGINER — 1 000
// lignes sur 2 405 le 07/11 (1 539 republications Vinted sans photos devant) : ces 22 jobs n'y sont jamais passés
// (aucun `photo_rehost_sweeps`).
//
// LA RÈGLE (tous comptes, extension ET Cloud, quelle que soit la version) :
//   · une photo hébergée sur le CDN d'une AUTRE plateforme que celle visée est copiée chez nous (bucket
//     listing-photos) AVANT que le job soit servi — Vinted compris : ce n'est pas le rapatriement de masse (décision
//     du 06/09, affaire de volume), seulement les photos d'un job sur le point de partir ailleurs ;
//   · Beebs aussi chez lui : cdn.beebs.app n'envoie aucun en-tête CORS, à AUCUNE origine (beebs.app compris, mesuré
//     le 07/11) — une photo Beebs n'est lisible par aucune page de dépôt ;
//   · get-pending-jobs RETIENT le job (rien servi, rien retiré, l'annonce d'origine reste en ligne) et le marque
//     (`platform_fields.photos_hors_plateforme`) ; handler-watch copie, VÉRIFIE (relue chez nous : 200, image,
//     même taille) et remplace l'URL à sa place (l'ordre de l'article est gardé) ; le job est servi au poll suivant ;
//   · ⛔ garde-fou de Nico : tant qu'une photo du job n'est pas chez nous et vérifiée, rien n'est servi — donc
//     aucune annonce d'origine n'est retirée.
//
// Mesuré le 07/11 depuis un serveur et depuis chaque origine (en-tête Origin) :
//   CDN                       serveur   ACAO leboncoin.fr / vinted.fr / beebs.app / depop.com / ebay.fr
//   images1.vinted.net        200       aucun / vinted.fr / aucun / aucun / aucun
//   img.leboncoin.fr          200       * partout
//   cdn.beebs.app             200       aucun, partout (beebs.app compris)
//   media-photos.depop.com    200       * partout
//   i.ebayimg.com             200       * partout
// Leboncoin, Depop et eBay passent aujourd'hui ; ils sont rapatriés quand même hors de chez eux : le CORS d'un CDN
// change sans prévenir (Beebs l'a fait en septembre), et une copie chez nous ne dépend plus de personne.
//
// Pur (Deno + Node) : scripts/photos-hors-plateforme-selftest.mjs.
// ⛔ LISTE FERMÉE (même liste que estCdnPlateforme, _shared/photos-rapatriement.ts) : ces prédicats gardent une
// fonction qui TÉLÉCHARGE une URL et l'écrit dans notre bucket — jamais un joker (cloudfront.net est mutualisé).

export const CLE_PHOTOS_HORS_PLATEFORME = "photos_hors_plateforme";
export const TRACE_PHOTOS_RAPATRIEES = "photos_hors_plateforme_rapatriees";

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", depop: "Depop", opla: "Opla" };
export const nomPlateforme = (p) => NOMS[String(p ?? "")] ?? String(p ?? "");

// Hôte → plateforme. Domaines (et leurs sous-domaines) puis hôtes EXACTS.
const DOMAINES = [
  ["vinted.net", "vinted"], ["vinted.fr", "vinted"], ["vinted.com", "vinted"],
  ["leboncoin.fr", "leboncoin"], ["beebs.app", "beebs"], ["ebayimg.com", "ebay"],
];
const HOTES_EXACTS = { "media-photos.depop.com": "depop", "d2f61lx5s6m7uh.cloudfront.net": "opla" };
// Les CDN qu'aucune page de dépôt ne peut lire, même chez eux (aucun Access-Control-Allow-Origin, 07/11).
const CDN_SANS_CORS = new Set(["beebs"]);

/** L'URL d'une photo de job : chaîne nue ou objet { url, type }. */
export const urlDePhoto = (p) => (typeof p === "string" ? p : (p && typeof p === "object" && typeof p.url === "string" ? p.url : null));

/** La plateforme dont le CDN héberge cette URL, ou null (chez nous, ailleurs, illisible). */
export function plateformeDuCdn(u) {
  if (typeof u !== "string") return null;
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const h = url.hostname.toLowerCase();
  if (HOTES_EXACTS[h]) return HOTES_EXACTS[h];
  for (const [d, p] of DOMAINES) if (h === d || h.endsWith(`.${d}`)) return p;
  return null;
}

/** Cette photo doit-elle être chez nous avant de partir sur `cible` ? */
export function photoARapatrierPour(u, cible) {
  const cdn = plateformeDuCdn(u);
  if (!cdn) return false;
  if (cdn !== String(cible ?? "")) return true;
  return CDN_SANS_CORS.has(cdn);
}

/** Les photos à rapatrier pour la cible : [{ index (0-based), url, cdn }] dans l'ordre de l'article. */
export function photosARapatrierPour(photos, cible) {
  const liste = Array.isArray(photos) ? photos : [];
  const out = [];
  liste.forEach((p, index) => {
    const url = urlDePhoto(p);
    if (url && photoARapatrierPour(url, cible)) out.push({ index, url, cdn: plateformeDuCdn(url) });
  });
  return out;
}

/** Le job est-il concerné ? Une publication ou une republication (jamais un retrait : il n'envoie pas de photo). */
export function jobConcerne(job) {
  const a = String(job?.action ?? "publish");
  return a === "publish" || a === "republish";
}

/** Remplace chaque URL par sa copie chez nous, À SA PLACE (ordre et forme { url, type } gardés). */
export function remplacerPhotos(photos, remplacements) {
  if (!Array.isArray(photos)) return photos;
  return photos.map((p) => {
    const u = urlDePhoto(p);
    const nv = u ? remplacements.get(u) : undefined;
    if (!nv) return p;
    return typeof p === "string" ? nv : { ...p, url: nv };
  });
}

/** Le type d'image prouvé par les premiers octets (jamais par l'en-tête seul), ou null. */
export function typeImageDesOctets(b) {
  if (!b || typeof b.length !== "number" || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const marque = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (marque === "avif" || marque === "avis") return "image/avif";
  }
  return null;
}

/**
 * La copie relue chez nous est-elle la bonne ? 200, un type image, et la taille exacte de ce qui a été envoyé
 * (en-tête Content-Length, ou octets relus quand l'en-tête manque).
 */
export function copieVerifiee({ status, contentType, taille, attendus }) {
  if (status !== 200) return false;
  if (!String(contentType ?? "").toLowerCase().startsWith("image/")) return false;
  const t = Number(taille);
  const a = Number(attendus);
  return Number.isFinite(t) && Number.isFinite(a) && a > 0 && t === a;
}

const listeNoms = (cdns) => {
  const noms = [...new Set(cdns.map(nomPlateforme))];
  return noms.length <= 1 ? (noms[0] ?? "une autre plateforme") : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
};
const numeros = (indices) => (indices.length > 1
  ? `les photos ${indices.slice(0, -1).join(", ")} et ${indices[indices.length - 1]}`
  : `la photo ${indices[0]}`);

// Toutes les phrases de cette règle commencent par l'un de ces débuts : c'est ce qui permet de les reconnaître
// (et de les effacer) sans jamais toucher au message d'une autre règle.
const DEBUTS = ["Copie des photos chez FillSell en cours", "Photos pas encore copiées chez FillSell"];
export function estMessagePhotosHorsPlateforme(m) {
  const s = String(m ?? "");
  return DEBUTS.some((d) => s.startsWith(d));
}

/**
 * La phrase montrée pendant la retenue — jamais une erreur rouge, jamais une promesse fausse.
 * @param {{ action: string, cible: string, cdns: string[], retraitEngage?: boolean, echec?: null | { indices: number[], mortes?: number[] } }} o
 */
export function messagePhotosHorsPlateforme({ action, cible, cdns, retraitEngage = false, echec = null }) {
  const chez = listeNoms(cdns ?? []);
  const page = `la page de dépôt ${nomPlateforme(cible)}`;
  const republication = String(action) === "republish";
  const enLigne = republication && !retraitEngage ? " Ton annonce est toujours en ligne, rien n'a été retiré." : "";
  if (echec && Array.isArray(echec.mortes) && echec.mortes.length) {
    return `Photos pas encore copiées chez FillSell : ${numeros(echec.mortes)} n'existe${echec.mortes.length > 1 ? "nt" : ""} plus chez ${chez} `
      + `(supprimée${echec.mortes.length > 1 ? "s" : ""} là-bas), et ${page} ne peut pas lire une photo hébergée ailleurs. `
      + `${republication ? "La republication" : "La publication"} est en pause tant qu'il lui manque cette photo.${enLigne}`;
  }
  if (echec && Array.isArray(echec.indices) && echec.indices.length) {
    return `Photos pas encore copiées chez FillSell : ${chez} ne nous a pas encore laissé copier ${numeros(echec.indices)}, `
      + `et ${page} ne peut pas lire une photo hébergée ailleurs. FillSell réessaie tout seul, rien à faire.${enLigne}`;
  }
  const suite = !republication
    ? " La publication part toute seule dès qu'elles sont copiées et vérifiées. Rien à faire."
    : retraitEngage
      ? " Ton annonce sera recréée dès qu'elles sont copiées et vérifiées. Rien à faire."
      : " La republication repart toute seule dès qu'elles sont copiées et vérifiées.";
  return `Copie des photos chez FillSell en cours : elles sont hébergées chez ${chez}, et ${page} ne peut pas les lire.${suite}${enLigne}`;
}

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/**
 * LA GARDE AU DÉPART (get-pending-jobs), pure.
 * @param job        { id, action, platform, photos, platform_fields, error }
 * @param o          { maintenant: ISO, retraitEngage: boolean }
 * @returns {{ servir: true, ecrire?: { platform_fields, error } }
 *         | { servir: false, aRapatrier: Array<{index,url,cdn}>, ecrire?: { platform_fields, error } }}
 *   `ecrire` absent = rien à écrire (aucune ligne inchangée réécrite). `error: undefined` = message laissé tel quel.
 */
export function gardePhotosHorsPlateforme(job, { maintenant, retraitEngage = false } = {}) {
  if (!job || !jobConcerne(job)) return { servir: true };
  const pf = objet(job.platform_fields) ?? {};
  const marque = objet(pf[CLE_PHOTOS_HORS_PLATEFORME]);
  const aRapatrier = photosARapatrierPour(job.photos, job.platform);
  if (!aRapatrier.length) {
    if (!marque) return { servir: true };
    // Plus rien à copier (handler-watch, ou une autre copie) : la marque et notre phrase s'effacent.
    const p = { ...pf };
    delete p[CLE_PHOTOS_HORS_PLATEFORME];
    return { servir: true, ecrire: { platform_fields: p, error: estMessagePhotosHorsPlateforme(job.error) ? null : undefined } };
  }
  const cdns = [...new Set(aRapatrier.map((x) => x.cdn))];
  const nouvelle = {
    ...(marque ?? {}),
    depuis: String(marque?.depuis ?? maintenant),
    plateforme: String(job.platform ?? ""),
    cdns,
    restantes: aRapatrier.length,
    total: Array.isArray(job.photos) ? job.photos.length : 0,
    pose_par: "get-pending-jobs (07/11, point 10)",
  };
  const echec = objet(marque?.echec);
  const message = messagePhotosHorsPlateforme({ action: job.action, cible: job.platform, cdns, retraitEngage, echec });
  const marqueChange = !marque || marque.plateforme !== nouvelle.plateforme || marque.restantes !== nouvelle.restantes
    || JSON.stringify(marque.cdns ?? []) !== JSON.stringify(cdns);
  const messageChange = String(job.error ?? "") !== message;
  if (!marqueChange && !messageChange) return { servir: false, aRapatrier };
  return {
    servir: false, aRapatrier,
    ecrire: { platform_fields: marqueChange ? { ...pf, [CLE_PHOTOS_HORS_PLATEFORME]: nouvelle } : pf, error: messageChange ? message : undefined },
  };
}

// handler-watch : un cycle sans aucune copie réussie compte comme un essai vain ; au 3e, l'essai suivant attend 1 h.
export const ESSAIS_VAINS_AVANT_ATTENTE = 3;
export const ATTENTE_APRES_ESSAIS_VAINS_MS = 60 * 60_000;
// Une photo qui répond 404/410 sur DEUX cycles distincts n'existe plus chez la plateforme (jamais un 403 : ce peut
// être un refus du CDN au serveur, pas la preuve d'une photo morte — même règle que _shared/photos-mortes.js).
export const CYCLES_404_POUR_MORTE = 2;

/** handler-watch : ce job marqué est-il à essayer à ce cycle ? */
export function aEssayerCeCycle(job, maintenantMs) {
  const m = objet(objet(job?.platform_fields)?.[CLE_PHOTOS_HORS_PLATEFORME]);
  if (!m) return false;
  const t = Date.parse(String(m.prochain_essai ?? ""));
  return !Number.isFinite(t) || t <= maintenantMs;
}

/**
 * LE BILAN D'UN CYCLE DE COPIE (handler-watch), pur.
 * @param job           { action, platform, photos, platform_fields, error } — relu juste avant l'écriture
 * @param remplacements Map url externe → url chez nous, VÉRIFIÉE
 * @param echecs        [{ url, http?, motif }]
 * @param o             { maintenant: ISO, retraitEngage: boolean, trancherMortes?: (photos, mortes: Map) => { verdict, photos, message } }
 * @returns {{ photos, platform_fields, error, libre: boolean, mortesRetirees: number[] }}
 *   `error: undefined` = message laissé tel quel.
 */
export function bilanCopiePhotos(job, remplacements, echecs, { maintenant, retraitEngage = false, trancherMortes = null } = {}) {
  const pf = { ...(objet(job?.platform_fields) ?? {}) };
  const marque = { ...(objet(pf[CLE_PHOTOS_HORS_PLATEFORME]) ?? {}) };
  let photos = remplacerPhotos(job?.photos, remplacements);
  const cible = String(job?.platform ?? "");
  // Les photos mortes : 404/410 comptés par cycle (un cycle = une observation).
  const vues404 = { ...(objet(marque.vues_404) ?? {}) };
  for (const e of echecs ?? []) {
    if (e && (e.http === 404 || e.http === 410)) vues404[String(e.url).slice(0, 300)] = Number(vues404[String(e.url).slice(0, 300)] ?? 0) + 1;
  }
  const encore = new Set(photosARapatrierPour(photos, cible).map((x) => x.url.slice(0, 300)));
  for (const k of Object.keys(vues404)) if (!encore.has(k)) delete vues404[k];
  const mortes = new Map();
  for (const x of photosARapatrierPour(photos, cible)) {
    const n = Number(vues404[x.url.slice(0, 300)] ?? 0);
    if (n >= CYCLES_404_POUR_MORTE) mortes.set(x.url, 404);
  }
  // Une PUBLICATION part sans la photo morte (règle du 29/10, _shared/photos-mortes.js : il reste au moins une
  // photo, toutes lisibles par la page). Une REPUBLICATION ne perd jamais une photo que son annonce en ligne montre
  // encore : elle reste en pause, et la phrase le dit.
  let messageMortes = null;
  let mortesRetirees = [];
  if (mortes.size && String(job?.action) === "publish" && typeof trancherMortes === "function") {
    const tr = trancherMortes(photos, mortes);
    if (tr && tr.verdict === "relancee") {
      mortesRetirees = Array.isArray(tr.indices) ? tr.indices : [];
      photos = tr.photos;
      messageMortes = tr.message ?? null;
    }
  }
  const restantes = photosARapatrierPour(photos, cible);
  const errStr = String(job?.error ?? "");
  const notreMessage = !errStr || estMessagePhotosHorsPlateforme(errStr);
  if (!restantes.length) {
    delete pf[CLE_PHOTOS_HORS_PLATEFORME];
    pf[TRACE_PHOTOS_RAPATRIEES] = {
      le: maintenant, copiees: remplacements.size, ...(mortesRetirees.length ? { mortes_retirees: mortesRetirees } : {}),
      pose_par: "handler-watch (07/11, point 10)",
    };
    return { photos, platform_fields: pf, error: messageMortes ?? (estMessagePhotosHorsPlateforme(errStr) ? null : undefined), libre: true, mortesRetirees };
  }
  const progres = remplacements.size > 0 || mortesRetirees.length > 0;
  const vains = progres ? 0 : Number(marque.essais_vains ?? 0) + ((echecs ?? []).length ? 1 : 0);
  const cdns = [...new Set(restantes.map((x) => x.cdn))];
  const indicesEchec = restantes.filter((x) => (echecs ?? []).some((e) => e.url === x.url)).map((x) => x.index + 1);
  const indicesMortes = restantes.filter((x) => mortes.has(x.url)).map((x) => x.index + 1);
  const enEchec = indicesMortes.length || vains >= ESSAIS_VAINS_AVANT_ATTENTE;
  const nouvelle = {
    ...marque,
    restantes: restantes.length,
    cdns,
    essais: Number(marque.essais ?? 0) + 1,
    dernier_essai: maintenant,
    essais_vains: vains,
    vues_404: vues404,
    derniers_echecs: (echecs ?? []).slice(0, 5).map((e) => ({ url: String(e.url).slice(0, 160), ...(e.http ? { http: e.http } : {}), motif: String(e.motif ?? "").slice(0, 120) })),
  };
  if (Object.keys(vues404).length === 0) delete nouvelle.vues_404;
  if (enEchec) {
    nouvelle.echec = { indices: indicesEchec.length ? indicesEchec : restantes.map((x) => x.index + 1), ...(indicesMortes.length ? { mortes: indicesMortes } : {}) };
    nouvelle.prochain_essai = new Date(Date.parse(maintenant) + ATTENTE_APRES_ESSAIS_VAINS_MS).toISOString();
  } else {
    delete nouvelle.echec;
    delete nouvelle.prochain_essai;
  }
  pf[CLE_PHOTOS_HORS_PLATEFORME] = nouvelle;
  const message = messagePhotosHorsPlateforme({ action: job?.action, cible, cdns, retraitEngage, echec: nouvelle.echec ?? null });
  return { photos, platform_fields: pf, error: notreMessage && errStr !== message ? message : undefined, libre: false, mortesRetirees };
}
