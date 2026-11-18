// ═══════════════════════════════════════════════════════════════════════════
// « C'EST L'HEURE DE TON CRÉNEAU » — UNE NOTIFICATION PAR CRÉNEAU, QUAND UN LOT ATTEND (18/11/2026, lot T2 point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Ordre de Nico : « À l'heure du créneau, quand un lot attend : une notification push soignée (« C'est l'heure de ton
// créneau : tes annonces repartent »), une seule par créneau, jamais en rafale. »
// QUI : un compte dont un créneau de republication VIENT de s'ouvrir (republish_creneaux.debut dans les 15 dernières
// minutes : la ligne que le balayage SQL pose à l'ouverture) ET qui a, sur CETTE plateforme, des republications d'un lot
// manuel retenu par les créneaux (plus de 10 articles, pas lancé « maintenant » : _shared/lot-manuel-creneau.js).
// UNE SEULE PAR CRÉNEAU : la clé « jour:heure de début » ; deux plateformes qui ouvrent à la même heure = une note qui
// les nomme toutes les deux. JAMAIS EN RAFALE : aucune note si une autre est partie vers ce compte dans l'heure, et au
// plus une par compte et par passage. La trace (usage_logs « push_creneau_lot ») est posée AVANT l'envoi : un passage
// qui recommence ne renvoie jamais. Le texte suit la voie du compte (_shared/texte-voie.js) : jamais « Chrome » au Cloud.
// Pur (Deno + Node), testé par selftest:push-creneau-lot. Appelant : republish-auto-sweep (cron */3, x-cron-secret).
import { lotsDepuisLignes, lotDansLesCreneaux } from "./lot-manuel-creneau.js";
import { texteSelonVoie } from "./texte-voie.js";

export const FENETRE_OUVERTURE_MS = 15 * 60_000;
export const ECART_MIN_ENTRE_DEUX_MS = 60 * 60_000;
export const FEATURE_PUSH_CRENEAU = "push_creneau_lot";
const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop", opla: "Opla", ebay: "eBay" };
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const hhmm = (de) => String(de ?? "").slice(0, 5);

/**
 * Les notes à envoyer (pur).
 * @param {{ creneaux: Array<{user_id, platform, jour, de, debut}>, jobs: Array<{user_id, platform, bulk_batch_id, inventaire_id, source?}>,
 *           lignesLots: Array<{bulk_batch_id, inventaire_id, created_at}>, lotsMaintenant?: Map<string, Set<string>>,
 *           deja: Array<{user_id, created_at, cle?}>, maintenant?: number }} o
 * @returns {Array<{ user_id: string, cle: string, de: string, plateformes: string[], n: number }>}
 */
export function notesCreneau({ creneaux = [], jobs = [], lignesLots = [], lotsMaintenant = new Map(), deja = [], maintenant = Date.now() } = {}) {
  const lots = lotsDepuisLignes(lignesLots);
  // Les republications qui attendent le créneau : manuelles, d'un lot de plus de 10 articles, pas lancé « maintenant ».
  const enAttente = new Map(); // user|platform → nombre
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!j || j.source === "auto") continue;
    const lotId = String(j.bulk_batch_id ?? "").trim();
    if (!lotId) continue;
    const lot = lots.get(lotId);
    const lance = lotsMaintenant.get(String(j.user_id))?.has(lotId) === true;
    if (!lotDansLesCreneaux(lot ? { ...lot, maintenant: lance } : null)) continue;
    const k = `${j.user_id}|${j.platform}`;
    enAttente.set(k, (enAttente.get(k) ?? 0) + 1);
  }
  // Les créneaux qui VIENNENT de s'ouvrir, groupés par compte et par ouverture (jour + heure de début).
  const groupes = new Map(); // user|cle → note
  for (const c of Array.isArray(creneaux) ? creneaux : []) {
    const t = ms(c?.debut);
    if (!Number.isFinite(t) || t > maintenant || maintenant - t > FENETRE_OUVERTURE_MS) continue;
    const n = enAttente.get(`${c.user_id}|${c.platform}`) ?? 0;
    if (!n) continue;
    const cle = `${String(c.jour ?? "").slice(0, 10)}:${hhmm(c.de)}`;
    const k = `${c.user_id}|${cle}`;
    const g = groupes.get(k) ?? { user_id: String(c.user_id), cle, de: hhmm(c.de), plateformes: [], n: 0, debut: t };
    if (!g.plateformes.includes(c.platform)) { g.plateformes.push(c.platform); g.n += n; }
    groupes.set(k, g);
  }
  // Une seule par créneau, jamais en rafale, au plus une par compte et par passage.
  const dejaParCompte = new Map();
  for (const d of Array.isArray(deja) ? deja : []) {
    const u = String(d?.user_id ?? "");
    if (!dejaParCompte.has(u)) dejaParCompte.set(u, []);
    dejaParCompte.get(u).push({ t: ms(d?.created_at), cle: String(d?.cle ?? "") });
  }
  const out = [];
  const servis = new Set();
  for (const g of [...groupes.values()].sort((a, b) => a.debut - b.debut)) {
    if (servis.has(g.user_id)) continue;
    const passes = dejaParCompte.get(g.user_id) ?? [];
    if (passes.some((p) => p.cle === g.cle)) continue;
    if (passes.some((p) => Number.isFinite(p.t) && maintenant - p.t < ECART_MIN_ENTRE_DEUX_MS)) continue;
    servis.add(g.user_id);
    out.push({ user_id: g.user_id, cle: g.cle, de: g.de, plateformes: g.plateformes, n: g.n });
  }
  return out;
}

/** Le message (pur) : { titre, corps, donnees }, dans la langue et la voie du compte. */
export function messageCreneau(note, { lang = "fr", cloud = false } = {}) {
  const en = lang === "en";
  const noms = (note?.plateformes ?? []).map((p) => NOMS[p] ?? p);
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(", ")} ${en ? "and" : "et"} ${noms[noms.length - 1]}` : (noms[0] ?? "");
  const n = Math.max(1, Number(note?.n) || 1);
  const titre = en ? "It's time for your time slot" : "C'est l'heure de ton créneau";
  const brut = en
    ? `Your listings are going back up: ${n} ${n > 1 ? "reposts" : "repost"} on ${liste}, at the usual pace, if Chrome is open on your computer at that time.`
    : `Tes annonces repartent : ${n} ${n > 1 ? "republications" : "republication"} sur ${liste}, au rythme habituel, si Chrome est ouvert sur ton ordinateur à ce moment-là.`;
  const corps = texteSelonVoie(brut, { cloud: cloud === true, lang: en ? "en" : "fr" });
  return { titre, corps, donnees: { type: "creneau", cle: String(note?.cle ?? ""), plateformes: (note?.plateformes ?? []).join(",") } };
}
