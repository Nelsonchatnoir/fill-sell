// ═══════════════════════════════════════════════════════════════════════════
// L'ORIGINE VINTED ET LE NAVIGATEUR (0.6.106, 09/10 — Marta, vendeuse italienne)
// ═══════════════════════════════════════════════════════════════════════════
// Script CLASSIQUE (pas de module) : chargé par importScripts() dans
// background.js et par <script src> dans popup.html, comme config.js. Il pose
// un seul objet global, FILLSELL_VINTED.
//
// CE QUI MANQUAIT. L'extension ne travaillait QUE sur www.vinted.fr : sonde,
// cookies, onglet de travail, publication, republication, retrait, veilleur des
// commandes, liens d'annonce. Une vendeuse connectée seulement sur vinted.it
// recevait « connecte-toi sur vinted.fr », à chaque synchronisation.
//
// ⛔ ZÉRO RÉGRESSION POUR LES VENDEURS FRANÇAIS (100 % du parc payant) :
//  · tant qu'AUCUN domaine Vinted étranger n'est accordé (permission
//    OPTIONNELLE, demandée par un clic « Autoriser vinted.<pays> » montré aux
//    seuls vendeurs étrangers), origineVinted() rend "https://www.vinted.fr" et
//    chaque URL, motif d'onglet, cookie et texte est identique à l'octet ;
//  · un compte qui a une session vinted.fr reste sur vinted.fr, même si un
//    domaine étranger est accordé : un Français n'est jamais basculé ;
//  · aucune permission obligatoire nouvelle : les domaines étrangers ne sont
//    que dans optional_host_permissions (scripts/hotes-livrables-cws.mjs).
//
// LE NAVIGATEUR. 6 postes Edge actifs le 09/10 (dont Marta) lisaient « dans
// Chrome ». navigateurCourt() rend « Chrome » chez Google Chrome (texte
// inchangé à l'octet), « Edge », « Brave », « Opera » ailleurs, « ton
// navigateur » quand rien ne le dit.
(function (g) {
  "use strict";
  const ORIGINE_FR = "https://www.vinted.fr";
  // Les domaines Vinted de la zone euro — même liste que
  // supabase/functions/_shared/vinted-pays.ts (relevée le 25/09).
  const HOTES_ETRANGERS = Object.freeze({
    BE: "www.vinted.be", LU: "www.vinted.lu", NL: "www.vinted.nl", DE: "www.vinted.de",
    AT: "www.vinted.at", IT: "www.vinted.it", ES: "www.vinted.es", PT: "www.vinted.pt",
    IE: "www.vinted.ie", FI: "www.vinted.fi", EE: "www.vinted.ee", LV: "www.vinted.lv",
    LT: "www.vinted.lt", SK: "www.vinted.sk", SI: "www.vinted.si", HR: "www.vinted.hr",
    GR: "www.vinted.gr",
  });
  // Cookie posé par la connexion Vinted, absent des sessions anonymes (le même
  // que la sonde vinted.fr lit depuis le 05/10, cf. VINTED_LOGIN_COOKIE).
  const COOKIE_SESSION = "v_uid";
  const CLE_STOCKAGE = "fillsell_vinted_origine";

  let origine = ORIGINE_FR;
  let chargement = null;

  const motifPermission = (hote) => `https://${hote}/*`;
  const MOTIFS_PERMISSION_ETRANGERS = Object.freeze(Object.values(HOTES_ETRANGERS).map(motifPermission));

  function hoteEtrangerAutorise(hote) {
    return Object.values(HOTES_ETRANGERS).includes(String(hote ?? "").toLowerCase());
  }
  function origineValide(o) {
    if (o === ORIGINE_FR) return true;
    const m = /^https:\/\/([a-z0-9.]+)$/.exec(String(o ?? ""));
    return !!m && hoteEtrangerAutorise(m[1]);
  }

  /** L'origine Vinted où l'extension travaille (synchrone, défaut vinted.fr). */
  function origineVinted() { return origine; }
  /** « www.vinted.fr » / « www.vinted.it ». */
  function hoteVinted() { return origine.replace(/^https:\/\//, ""); }
  /** « vinted.fr » / « vinted.it » : le domaine nommé à la personne. */
  function domaineVintedAffiche() { return hoteVinted().replace(/^www\./, ""); }
  function estOrigineEtrangere() { return origine !== ORIGINE_FR; }
  /** Motif chrome.tabs.query des onglets Vinted (« *://*.vinted.fr/* » par défaut). */
  function motifOngletsVinted() { return `*://*.${domaineVintedAffiche()}/*`; }
  /** L'adresse d'une annonce Vinted (« https://www.vinted.fr/items/123 »). */
  function urlAnnonceVinted(id) { return `${origine}/items/${id}`; }
  /** Un hôte d'onglet est-il un hôte Vinted de travail (le français, ou l'origine active) ? */
  function estHoteVintedDeTravail(hote) {
    const h = String(hote ?? "").toLowerCase();
    return h === "vinted.fr" || h === "www.vinted.fr" || h === hoteVinted() || h === domaineVintedAffiche();
  }

  // ── Le navigateur où tourne l'extension ─────────────────────────────────
  function navigateurExtension() {
    try {
      const nav = g.navigator ?? {};
      const marques = Array.isArray(nav.userAgentData?.brands) ? nav.userAgentData.brands.map((b) => String(b?.brand ?? "")) : [];
      if (marques.length) {
        if (marques.some((b) => /Microsoft Edge/i.test(b))) return "Microsoft Edge";
        if (marques.some((b) => /\bOpera\b/i.test(b))) return "Opera";
        if (marques.some((b) => /\bBrave\b/i.test(b))) return "Brave";
        if (marques.some((b) => /Google Chrome/i.test(b))) return "Google Chrome";
        return null;
      }
      const ua = String(nav.userAgent ?? "");
      if (/\bEdg\//.test(ua)) return "Microsoft Edge";
      if (/\bOPR\//.test(ua)) return "Opera";
      if (/\bChrome\//.test(ua)) return "Google Chrome";
    } catch { /* navigateur illisible */ }
    return null;
  }
  /** « Chrome » chez Google Chrome (textes inchangés), « Edge », « Brave », « Opera », sinon « ton navigateur ». */
  function navigateurCourt() {
    const n = navigateurExtension();
    if (n === "Google Chrome") return "Chrome";
    if (n === "Microsoft Edge") return "Edge";
    return n ?? "ton navigateur";
  }
  /** Le nom complet pour une phrase d'explication (« Microsoft Edge », « Google Chrome »…). */
  function navigateurLong() { return navigateurExtension() ?? "ton navigateur"; }
  /** « ton Chrome », « ton Edge »… — « ton navigateur » sans doublon quand rien ne le dit. */
  function navigateurPossessif() {
    const n = navigateurCourt();
    return n === "ton navigateur" ? n : `ton ${n}`;
  }

  // ── Détection et mémoire ────────────────────────────────────────────────
  async function domainesEtrangersAccordes(chromeApi = g.chrome) {
    try {
      const tout = await chromeApi.permissions.getAll();
      const accordes = new Set(tout?.origins ?? []);
      return Object.values(HOTES_ETRANGERS).filter((h) => accordes.has(motifPermission(h)));
    } catch { return []; }
  }
  async function aSessionVinted(chromeApi, origineTestee) {
    try {
      const c = await chromeApi.cookies.get({ url: `${origineTestee}/`, name: COOKIE_SESSION });
      return !!String(c?.value ?? "").trim();
    } catch { return false; }
  }
  async function memoriser(chromeApi, o) {
    try { await chromeApi.storage.local.set({ [CLE_STOCKAGE]: o }); } catch { /* mémoire indisponible */ }
  }

  /**
   * Relit où la personne est connectée et fixe l'origine.
   *  1. aucun domaine étranger accordé → vinted.fr (le chemin français, sans
   *     aucune lecture de cookie de plus) ;
   *  2. une session vinted.fr → vinted.fr (un Français n'est jamais basculé) ;
   *  3. le premier domaine étranger ACCORDÉ qui a une session → lui ;
   *  4. aucune session nulle part → l'origine mémorisée si elle est encore
   *     accordée, sinon le premier domaine accordé (c'est là qu'il faut se
   *     connecter : la personne l'a autorisé pour ça).
   */
  async function rafraichirOrigineVinted(chromeApi = g.chrome) {
    const accordes = await domainesEtrangersAccordes(chromeApi);
    if (!accordes.length) {
      // Le chemin français : aucun cookie lu, rien d'écrit.
      origine = ORIGINE_FR;
      return origine;
    }
    let choisie = ORIGINE_FR;
    if (!(await aSessionVinted(chromeApi, ORIGINE_FR))) {
      choisie = null;
      for (const h of accordes) {
        if (await aSessionVinted(chromeApi, `https://${h}`)) { choisie = `https://${h}`; break; }
      }
      if (!choisie) {
        let memo = null;
        try { memo = (await chromeApi.storage.local.get(CLE_STOCKAGE))?.[CLE_STOCKAGE] ?? null; } catch { /* rien */ }
        const memoHote = typeof memo === "string" ? memo.replace(/^https:\/\//, "") : "";
        choisie = memo && origineValide(memo) && accordes.includes(memoHote) ? memo : `https://${accordes[0]}`;
      }
    }
    if (choisie !== origine) {
      if (typeof console !== "undefined") console.log(`[vinted-origine] origine Vinted : ${origine} → ${choisie}`);
      origine = choisie;
    }
    await memoriser(chromeApi, choisie);
    return origine;
  }

  /** Au démarrage : l'origine mémorisée, si son domaine est toujours accordé (sinon vinted.fr). */
  function chargerOrigineVinted(chromeApi = g.chrome) {
    if (!chargement) {
      chargement = (async () => {
        let memo = null;
        try { memo = (await chromeApi.storage.local.get(CLE_STOCKAGE))?.[CLE_STOCKAGE] ?? null; } catch { /* rien */ }
        if (memo && memo !== ORIGINE_FR && origineValide(memo)) {
          const accordes = await domainesEtrangersAccordes(chromeApi);
          if (accordes.includes(memo.replace(/^https:\/\//, ""))) origine = memo;
        }
        return origine;
      })();
    }
    return chargement;
  }

  /** Le domaine étranger désigné par le serveur (contexte.vinted_etranger), validé. */
  function domaineEtrangerDuServeur(contexte) {
    const v = contexte && typeof contexte === "object" ? contexte : null;
    if (!v) return null;
    const pays = String(v.pays ?? "").toUpperCase();
    const hote = String(v.domaine ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const h = hoteEtrangerAutorise(hote) ? hote : (HOTES_ETRANGERS[pays] ?? null);
    // source : « compte_vinted » (pays lu sur le compte) ou « reseau » (pays de la connexion, une déduction).
    const source = v.source === "compte_vinted" ? "compte_vinted" : "reseau";
    return h ? { pays: Object.keys(HOTES_ETRANGERS).find((k) => HOTES_ETRANGERS[k] === h), hote: h, motif: motifPermission(h), domaine: h.replace(/^www\./, ""), source } : null;
  }

  // Pour les selftests (Node) : réinitialiser l'état du module.
  function _reinitialiser() { origine = ORIGINE_FR; chargement = null; }

  g.FILLSELL_VINTED = Object.freeze({
    ORIGINE_FR, HOTES_ETRANGERS, MOTIFS_PERMISSION_ETRANGERS, COOKIE_SESSION, CLE_STOCKAGE,
    origineVinted, hoteVinted, domaineVintedAffiche, estOrigineEtrangere, motifOngletsVinted,
    urlAnnonceVinted, estHoteVintedDeTravail, hoteEtrangerAutorise, motifPermission,
    navigateurExtension, navigateurCourt, navigateurLong, navigateurPossessif,
    domainesEtrangersAccordes, rafraichirOrigineVinted, chargerOrigineVinted, domaineEtrangerDuServeur,
    _reinitialiser,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
