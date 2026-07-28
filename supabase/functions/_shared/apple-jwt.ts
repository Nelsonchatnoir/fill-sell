// Signature des JWT pour l'App Store Server API (api.storekit.itunes.apple.com).
//
// Pourquoi ce module existe (28/07/2026) :
// L'incident raraajaws a mis au jour DEUX problèmes empilés sur la clé de
// signature, qui se masquaient l'un l'autre :
//   1. la clé posée en secret était une clé d'ÉQUIPE App Store Connect, pas une
//      clé « Achat intégré » — seule cette dernière peut signer un JWT portant
//      le claim `bid` accepté par l'App Store Server API. La section « Achat
//      intégré » d'App Store Connect était vide : aucune clé de ce type n'avait
//      jamais été créée ;
//   2. le secret arrivait mangé (sauts de ligne remplacés par « ~ », en-têtes à
//      nombre de tirets non standard, corps tantôt base64 standard tantôt
//      base64url), si bien que le décodage cassait AVANT l'appel réseau — donc
//      Apple ne renvoyait jamais le 401 qui aurait révélé le problème n°1.
//
// Leçon appliquée ici : on ne pattern-matche plus UN format supposé. On essaie
// une liste de nettoyages candidats et on garde le premier qui produit une clé
// P-256 réellement importable par WebCrypto. Et si tout échoue, on lève une
// erreur qui DIT ce qui a été vu (longueurs, modulo 4, préfixe structurel) au
// lieu d'un « InvalidEncoding » nu — sans jamais exposer de matière secrète.

export class AppleKeyError extends Error {
  readonly diag: Record<string, unknown>;
  constructor(message: string, diag: Record<string, unknown>) {
    super(message);
    this.name = "AppleKeyError";
    this.diag = diag;
  }
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Retire le padding existant puis re-pade à un multiple de 4. */
function repad(s: string): string {
  const body = s.replace(/=+$/g, "");
  const mod = body.length % 4;
  return mod === 0 ? body : body + "=".repeat(4 - mod);
}

/**
 * Nettoyages candidats, du plus probable au plus permissif. Chacun est un
 * couple (nom lisible, corps base64 supposé). Les variantes se croisent :
 *   source     : brut | déséchappé (les « \n » littéraux d'un secret posé via
 *                 un shell qui n'a pas interprété les sauts de ligne)
 *   en-tête    : regex tolérante ciblant BEGIN/END PRIVATE KEY
 *              | générique « tout ce qui est entre deux séries de tirets »
 *   alphabet   : base64 standard | base64url (- et _ traités comme données)
 */
function candidats(raw: string): Array<{ nom: string; corps: string }> {
  const deséchappé = raw.replace(/\\r/g, "").replace(/\\n/g, "\n");
  const sources: Array<[string, string]> = [["brut", raw]];
  if (deséchappé !== raw) sources.push(["deséchappé", deséchappé]);

  const out: Array<{ nom: string; corps: string }> = [];
  const vus = new Set<string>();

  for (const [nomSrc, src] of sources) {
    const strict = src
      .replace(/-+[\s~]*BEGIN[\s~]*(?:EC[\s~]*|RSA[\s~]*)?PRIVATE[\s~]*KEY[\s~]*-+/gi, "")
      .replace(/-+[\s~]*END[\s~]*(?:EC[\s~]*|RSA[\s~]*)?PRIVATE[\s~]*KEY[\s~]*-+/gi, "");
    // Générique : supprime tout bloc délimité par deux séries d'au moins deux
    // tirets, quel que soit le libellé entre les deux (en-têtes exotiques,
    // « BEGIN EC PRIVATE KEY », mots collés parce que les espaces ont sauté…).
    const large = src.replace(/-{2,}[^-]*-{2,}/g, "");

    for (const [nomEntête, sansEntête] of [["entête-strict", strict], ["entête-large", large]] as const) {
      const standard = repad(sansEntête.replace(/[^A-Za-z0-9+/=]/g, ""));
      const url = repad(
        sansEntête.replace(/[^A-Za-z0-9+/=_-]/g, "").replace(/-/g, "+").replace(/_/g, "/"),
      );
      for (const [nomAlpha, corps] of [["base64", standard], ["base64url", url]] as const) {
        if (!corps || vus.has(corps)) continue;
        vus.add(corps);
        out.push({ nom: `${nomSrc}/${nomEntête}/${nomAlpha}`, corps });
      }
    }
  }
  return out;
}

/** PKCS#8 P-256 minimal reconstruit autour du scalaire privé de 32 octets. */
function pkcs8Minimal(d: Uint8Array): Uint8Array {
  return new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00,
    0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20, ...d,
  ]);
}

async function importerP256(der: Uint8Array): Promise<CryptoKey | null> {
  // 1) le DER tel quel : cas nominal d'un .p8 bien formé.
  try {
    return await crypto.subtle.importKey(
      "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
  } catch { /* format non minimal / paramètres de courbe redondants */ }

  // 2) repli : on extrait le scalaire privé (motif ECPrivateKey
  //    02 01 01 04 20 <d:32>) et on reconstruit un PKCS#8 connu-bon. Plusieurs
  //    occurrences du motif sont possibles par hasard — on les essaie toutes,
  //    l'import fait juge.
  for (let i = 0; i + 37 <= der.length; i++) {
    if (der[i] === 0x02 && der[i + 1] === 0x01 && der[i + 2] === 0x01 &&
        der[i + 3] === 0x04 && der[i + 4] === 0x20) {
      try {
        return await crypto.subtle.importKey(
          "pkcs8", pkcs8Minimal(der.slice(i + 5, i + 37)),
          { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
        );
      } catch { /* faux positif du motif, on continue */ }
    }
  }
  return null;
}

let clé: CryptoKey | null = null;
let variante = "";

/**
 * Charge (et mémorise) la clé privée depuis le secret APPLE_API_PRIVATE_KEY.
 * Lève une AppleKeyError descriptive si aucun candidat ne donne une clé
 * importable.
 */
export async function chargerCléApple(): Promise<{ clé: CryptoKey; variante: string }> {
  if (clé) return { clé, variante };

  const pem = Deno.env.get("APPLE_API_PRIVATE_KEY");
  if (!pem) throw new AppleKeyError("apple_private_key_absent", { secretPosé: false });

  const essais: Array<Record<string, unknown>> = [];
  for (const c of candidats(pem)) {
    // Les 16 premiers caractères d'un corps PKCS#8 P-256 sont une constante
    // structurelle (« MIGHAgEAMBMGByqG ») : diagnostic sans matière secrète.
    const trace: Record<string, unknown> = {
      variante: c.nom, longueur: c.corps.length, préfixe16: c.corps.slice(0, 16),
    };
    let der: Uint8Array;
    try {
      der = b64ToBytes(c.corps);
    } catch (e) {
      trace.base64 = `échec: ${String((e as Error)?.message ?? e)}`;
      essais.push(trace);
      continue;
    }
    trace.base64 = "ok";
    trace.octets = der.length;
    const k = await importerP256(der);
    if (k) {
      clé = k;
      variante = c.nom;
      return { clé, variante };
    }
    trace.import = "aucune clé P-256 exploitable";
    essais.push(trace);
  }

  throw new AppleKeyError(
    "apple_private_key_illisible — aucun nettoyage candidat ne donne une clé P-256 importable ; re-poser APPLE_API_PRIVATE_KEY depuis le .p8 « Achat intégré »",
    { longueurSecret: pem.length, essais },
  );
}

/**
 * JWT ES256 pour l'App Store Server API.
 * ⚠️ Le claim `bid` n'est accepté QUE si la clé vient de la section « Achat
 * intégré » d'App Store Connect. Une clé d'équipe donne un 401 côté Apple.
 */
export async function genererJWTApple(bundleId: string): Promise<string> {
  const keyId = Deno.env.get("APPLE_API_KEY_ID");
  const issuerId = Deno.env.get("APPLE_ISSUER_ID");
  if (!keyId || !issuerId) {
    throw new AppleKeyError("apple_ids_absents", {
      APPLE_API_KEY_ID: Boolean(keyId), APPLE_ISSUER_ID: Boolean(issuerId),
    });
  }

  const { clé: privateKey } = await chargerCléApple();
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${b64url({ alg: "ES256", kid: keyId, typ: "JWT" })}.${
    b64url({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1", bid: bundleId })
  }`;
  const rawSig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(rawSig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${signingInput}.${sigB64}`;
}
