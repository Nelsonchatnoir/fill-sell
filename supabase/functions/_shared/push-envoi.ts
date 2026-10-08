// ════════════════════════════════════════════════════════════════════════════
// ENVOI DES NOTIFICATIONS PUSH — APNs (iOS) et FCM HTTP v1 (Android) (06/10)
// ════════════════════════════════════════════════════════════════════════════
// iOS : le jeton du téléphone est un jeton APNs (module @capacitor/push-
// notifications, sans Firebase côté iOS). On signe un JWT ES256 avec la clé
// .p8 « Apple Push Notifications service » (APNS_KEY_ID, APNS_TEAM_ID,
// APNS_PRIVATE_KEY) et on parle à api.push.apple.com (HTTP/2).
// Android : le jeton est un jeton FCM. On échange un JWT RS256 du compte de
// service Firebase (FCM_SERVICE_ACCOUNT, le JSON entier) contre un jeton
// OAuth, puis fcm.googleapis.com/v1/projects/<id>/messages:send.
//
// Ce module ne lit RIEN de lui-même (ni secret, ni réseau) : tout est passé
// par l'appelant — c'est ce qui rend ses règles testables
// (scripts/push-envoi-selftest.ts).
//
// LE VERDICT D'UN ENVOI, par appareil :
//   ok          — accepté par Apple/Google ;
//   invalide    — le jeton est mort (désinstallé, révoqué) : l'appareil est
//                 OUBLIÉ (APNs 410, BadDeviceToken sur les deux passerelles ;
//                 FCM UNREGISTERED, SENDER_ID_MISMATCH, jeton mal formé).
//                 Jamais sur un refus qui vise NOTRE configuration (sujet APNs,
//                 projet Firebase) : il oublierait tout le parc d'un coup ;
//   transitoire — à réessayer (429, 5xx, réseau, délai) ;
//   config      — NOTRE configuration (clé absente, refusée) : on ne touche
//                 JAMAIS au jeton, la faute n'est pas au téléphone ;
//   echec       — autre refus, gardé pour lecture, jeton conservé.
// ════════════════════════════════════════════════════════════════════════════

export type Verdict = "ok" | "invalide" | "transitoire" | "config" | "echec";
export interface ResultatAppareil { etat: Verdict; motif?: string; env?: "production" | "sandbox"; statut?: number }
export interface Appareil { id: string; plateforme: "ios" | "android"; jeton: string; apns_env?: "production" | "sandbox" }
export interface Message { titre: string; corps: string; donnees: Record<string, string> }
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ConfigApns { keyId: string; teamId: string; cleP8: string; topic: string }
export interface ConfigFcm { projectId: string; clientEmail: string; privateKey: string }

const enc = new TextEncoder();
const b64url = (octets: Uint8Array) =>
  btoa(String.fromCharCode(...octets)).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const b64urlJson = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));

/** PEM (avec ou sans « \n » littéraux) → octets DER. */
export function pemVersDer(pem: string): Uint8Array<ArrayBuffer> {
  const corps = String(pem ?? "")
    .replace(/\\n/g, "\n")
    .replace(/-----[^-]+-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const bin = atob(corps);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Les textes ──────────────────────────────────────────────────────────────
const NOMS: Record<string, string> = {
  vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", opla: "Opla", depop: "Depop",
};

export function formaterPrix(prix: unknown, devise: unknown, lang = "fr"): string | null {
  const n = Number(prix);
  if (prix == null || !Number.isFinite(n) || n <= 0) return null;
  const code = typeof devise === "string" && /^[A-Z]{3}$/.test(devise) ? devise : "EUR";
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", {
      style: "currency", currency: code,
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
    }).format(n).replace(/ | /g, " ");
  } catch {
    return `${n} ${code}`;
  }
}

/** « 🎉 Vendu sur Vinted » / « Robe Mango corail · 15 € ». Service seulement. */
export function messageVente(
  note: { id: number | string; plateforme?: string | null; titre?: string | null; prix?: unknown; devise?: unknown; inventaire_id?: unknown; vente_id?: unknown },
  lang = "fr",
): Message {
  const nom = note.plateforme ? NOMS[note.plateforme] : undefined;
  const titre = nom
    ? (lang === "en" ? `🎉 Sold on ${nom}` : `🎉 Vendu sur ${nom}`)
    : (lang === "en" ? "🎉 Item sold" : "🎉 Article vendu");
  const article = String(note.titre ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
    || (lang === "en" ? "One of your items" : "Un de tes articles");
  const prix = formaterPrix(note.prix, note.devise, lang);
  const donnees: Record<string, string> = { type: "vente", note_id: String(note.id) };
  if (note.inventaire_id != null) donnees.inventaire_id = String(note.inventaire_id);
  if (note.vente_id != null) donnees.vente_id = String(note.vente_id);
  if (note.plateforme) donnees.plateforme = String(note.plateforme);
  return { titre, corps: prix ? `${article} · ${prix}` : article, donnees };
}

// ── APNs ────────────────────────────────────────────────────────────────────
export const APNS_HOTES = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

let jwtApns: { valeur: string; ne_le: number; cle: string } | null = null;

export async function jwtApnsPour(cfg: ConfigApns, maintenantMs: number): Promise<string> {
  const empreinte = `${cfg.keyId}:${cfg.teamId}`;
  // Apple refuse un jeton de plus d'une heure, et en réclame un neuf au plus
  // toutes les 20 minutes : on le garde 40 minutes.
  if (jwtApns && jwtApns.cle === empreinte && maintenantMs - jwtApns.ne_le < 40 * 60_000) return jwtApns.valeur;
  const cle = await crypto.subtle.importKey(
    "pkcs8", pemVersDer(cfg.cleP8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const entree = `${b64urlJson({ alg: "ES256", kid: cfg.keyId })}.${b64urlJson({ iss: cfg.teamId, iat: Math.floor(maintenantMs / 1000) })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, enc.encode(entree)));
  const valeur = `${entree}.${b64url(sig)}`;
  jwtApns = { valeur, ne_le: maintenantMs, cle: empreinte };
  return valeur;
}

export function oublierJetonsServeur() { jwtApns = null; jetonFcm = null; }

async function unEnvoiApns(f: Fetch, hote: string, jwt: string, cfg: ConfigApns, jeton: string, m: Message, maintenantMs: number) {
  const r = await f(`${hote}/3/device/${encodeURIComponent(jeton)}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": cfg.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(maintenantMs / 1000) + 86_400),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: m.titre, body: m.corps }, sound: "default", "thread-id": "ventes" },
      ...m.donnees,
    }),
  });
  let raison = "";
  if (r.status !== 200) {
    try { raison = String((await r.json())?.reason ?? ""); } catch { /* corps vide */ }
  } else {
    await r.body?.cancel().catch(() => {});
  }
  return { statut: r.status, raison };
}

export async function envoyerApns(f: Fetch, cfg: ConfigApns | null, a: Appareil, m: Message, maintenantMs = Date.now()): Promise<ResultatAppareil> {
  if (!cfg) return { etat: "config", motif: "apns_non_configure" };
  let jwt: string;
  try { jwt = await jwtApnsPour(cfg, maintenantMs); } catch (e) {
    return { etat: "config", motif: `cle_apns_illisible: ${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
  const premier: "production" | "sandbox" = a.apns_env === "sandbox" ? "sandbox" : "production";
  const autre: "production" | "sandbox" = premier === "production" ? "sandbox" : "production";
  try {
    const r1 = await unEnvoiApns(f, APNS_HOTES[premier], jwt, cfg, a.jeton, m, maintenantMs);
    if (r1.statut === 200) return { etat: "ok", env: premier, statut: 200 };
    if (r1.statut === 410 || r1.raison === "Unregistered") return { etat: "invalide", motif: "Unregistered", statut: r1.statut };
    // Jeton d'une AUTRE app : impossible ici (tous viennent de la nôtre) — c'est
    // donc APNS_TOPIC qui est faux. Jamais une purge : elle viderait tout le parc.
    if (r1.raison === "DeviceTokenNotForTopic") return { etat: "config", motif: r1.raison, statut: r1.statut };
    if (r1.raison === "BadDeviceToken") {
      // Un jeton de build de développement ne vaut que sur la sandbox (et
      // inversement) : on essaie l'autre passerelle avant de conclure.
      const r2 = await unEnvoiApns(f, APNS_HOTES[autre], jwt, cfg, a.jeton, m, maintenantMs);
      if (r2.statut === 200) return { etat: "ok", env: autre, statut: 200 };
      if (r2.raison === "BadDeviceToken" || r2.statut === 410 || r2.raison === "Unregistered") {
        return { etat: "invalide", motif: "BadDeviceToken", statut: r2.statut };
      }
      return classerApns(r2.statut, r2.raison);
    }
    if (r1.raison === "ExpiredProviderToken") jwtApns = null;
    return classerApns(r1.statut, r1.raison);
  } catch (e) {
    return { etat: "transitoire", motif: `reseau: ${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
}

function classerApns(statut: number, raison: string): ResultatAppareil {
  if (statut === 403 || statut === 401) return { etat: "config", motif: raison || `HTTP ${statut}`, statut };
  if (statut === 429 || statut >= 500) return { etat: "transitoire", motif: raison || `HTTP ${statut}`, statut };
  return { etat: "echec", motif: raison || `HTTP ${statut}`, statut };
}

// ── FCM HTTP v1 ─────────────────────────────────────────────────────────────
let jetonFcm: { valeur: string; expire_ms: number; cle: string } | null = null;

export function lireConfigFcm(json: string | undefined | null): ConfigFcm | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json);
    if (!o?.project_id || !o?.client_email || !o?.private_key) return null;
    return { projectId: String(o.project_id), clientEmail: String(o.client_email), privateKey: String(o.private_key) };
  } catch {
    return null;
  }
}

export async function jetonOauthFcm(f: Fetch, cfg: ConfigFcm, maintenantMs: number): Promise<string> {
  if (jetonFcm && jetonFcm.cle === cfg.clientEmail && jetonFcm.expire_ms - maintenantMs > 5 * 60_000) return jetonFcm.valeur;
  const cle = await crypto.subtle.importKey(
    "pkcs8", pemVersDer(cfg.privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const iat = Math.floor(maintenantMs / 1000);
  const entree = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson({
    iss: cfg.clientEmail, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, cle, enc.encode(entree)));
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${entree}.${b64url(sig)}`,
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok || !corps?.access_token) throw new Error(`oauth_fcm HTTP ${r.status} ${String(corps?.error ?? "")}`.trim());
  jetonFcm = { valeur: String(corps.access_token), expire_ms: maintenantMs + Number(corps.expires_in ?? 3600) * 1000, cle: cfg.clientEmail };
  return jetonFcm.valeur;
}

export async function envoyerFcm(f: Fetch, cfg: ConfigFcm | null, a: Appareil, m: Message, maintenantMs = Date.now()): Promise<ResultatAppareil> {
  if (!cfg) return { etat: "config", motif: "fcm_non_configure" };
  let oauth: string;
  try { oauth = await jetonOauthFcm(f, cfg, maintenantMs); } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    // Google indisponible ≠ clé refusée.
    return /HTTP 5\d\d|reseau|fetch/i.test(msg) ? { etat: "transitoire", motif: msg.slice(0, 120) } : { etat: "config", motif: msg.slice(0, 120) };
  }
  try {
    const r = await f(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${oauth}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: a.jeton,
          notification: { title: m.titre, body: m.corps },
          data: m.donnees,
          android: {
            priority: "HIGH",
            ttl: "86400s",
            notification: {
              channel_id: "ventes", sound: "default", icon: "ic_stat_fillsell", color: "#2F9E90",
              tag: m.donnees.note_id ? `vente-${m.donnees.note_id}` : undefined,
            },
          },
        },
      }),
    });
    if (r.ok) { await r.body?.cancel().catch(() => {}); return { etat: "ok", statut: r.status }; }
    const corps = await r.json().catch(() => ({}));
    const err = corps?.error ?? {};
    const codes: string[] = (Array.isArray(err.details) ? err.details : [])
      .map((d: { errorCode?: string }) => d?.errorCode).filter(Boolean);
    const texte = String(err.message ?? "");
    // 404 SANS « UNREGISTERED » = projet Firebase introuvable (configuration) :
    // surtout pas une purge, elle oublierait tous les téléphones Android.
    if (codes.includes("UNREGISTERED")) return { etat: "invalide", motif: "UNREGISTERED", statut: r.status };
    if (r.status === 404) return { etat: "config", motif: texte.slice(0, 80) || "projet_introuvable", statut: 404 };
    if (codes.includes("SENDER_ID_MISMATCH")) return { etat: "invalide", motif: "SENDER_ID_MISMATCH", statut: r.status };
    if (r.status === 400 && /registration token/i.test(texte)) return { etat: "invalide", motif: "jeton_mal_forme", statut: 400 };
    if (r.status === 401) { jetonFcm = null; return { etat: "config", motif: "oauth_refuse", statut: 401 }; }
    if (r.status === 403) return { etat: "config", motif: codes[0] || texte.slice(0, 80) || "HTTP 403", statut: 403 };
    if (r.status === 429 || r.status >= 500) return { etat: "transitoire", motif: codes[0] || `HTTP ${r.status}`, statut: r.status };
    return { etat: "echec", motif: codes[0] || texte.slice(0, 120) || `HTTP ${r.status}`, statut: r.status };
  } catch (e) {
    return { etat: "transitoire", motif: `reseau: ${String((e as Error)?.message ?? e).slice(0, 80)}` };
  }
}

// ── Une note, tous ses appareils ────────────────────────────────────────────
/** Délai borné : un appareil lent ne retient jamais les autres. */
export async function avecDelai<T>(p: Promise<T>, ms: number, repli: T): Promise<T> {
  let t: number | undefined;
  const delai = new Promise<T>((res) => { t = setTimeout(() => res(repli), ms) as unknown as number; });
  try { return await Promise.race([p, delai]); } finally { clearTimeout(t); }
}

export interface BilanNote {
  id: number | string;
  statut: "envoyee" | "a_reessayer" | "echec";
  motif?: string;
  resultat: Array<{ appareil: string; plateforme: string } & ResultatAppareil>;
}

export async function envoyerNote(
  f: Fetch, cfgApns: ConfigApns | null, cfgFcm: ConfigFcm | null,
  note: { id: number | string; appareils: Appareil[] } & Parameters<typeof messageVente>[0],
  lang = "fr", maintenantMs = Date.now(),
): Promise<BilanNote> {
  const m = messageVente(note, lang);
  const res = await Promise.all((note.appareils ?? []).map(async (a) => {
    let r: ResultatAppareil;
    try {
      r = await avecDelai(
        a.plateforme === "ios" ? envoyerApns(f, cfgApns, a, m, maintenantMs) : envoyerFcm(f, cfgFcm, a, m, maintenantMs),
        10_000, { etat: "transitoire", motif: "delai_depasse" },
      );
    } catch (e) {
      r = { etat: "transitoire", motif: `exception: ${String((e as Error)?.message ?? e).slice(0, 80)}` };
    }
    return { appareil: a.id, plateforme: a.plateforme, ...r };
  }));
  const statut = res.some((r) => r.etat === "ok") ? "envoyee"
    : res.some((r) => r.etat === "transitoire") ? "a_reessayer" : "echec";
  const motif = statut === "envoyee" ? undefined : res.map((r) => r.motif).filter(Boolean).join(" | ").slice(0, 200) || "aucun_appareil";
  return { id: note.id, statut, motif, resultat: res };
}

/** Ce que la base doit retenir de tous les bilans (push_ventes_resultat). */
export function resumerPourLaBase(bilans: BilanNote[], appareils: Appareil[]) {
  const jetonDe = new Map(appareils.map((a) => [a.id, a.jeton]));
  const invalides = new Set<string>(), ok = new Set<string>(), sandbox = new Set<string>();
  const echecs: Array<{ id: string; motif: string }> = [];
  for (const b of bilans) {
    for (const r of b.resultat) {
      if (r.etat === "ok") { ok.add(r.appareil); if (r.env === "sandbox") sandbox.add(r.appareil); }
      else if (r.etat === "invalide") { const j = jetonDe.get(r.appareil); if (j) invalides.add(j); }
      else echecs.push({ id: r.appareil, motif: `${r.etat}: ${r.motif ?? ""}`.slice(0, 200) });
    }
  }
  return {
    notes: bilans.map((b) => ({ id: b.id, statut: b.statut, motif: b.motif ?? null, resultat: b.resultat })),
    invalides: [...invalides], ok: [...ok], sandbox: [...sandbox], echecs,
  };
}
