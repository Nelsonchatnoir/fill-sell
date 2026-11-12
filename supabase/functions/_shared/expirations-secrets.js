// ═══════════════════════════════════════════════════════════════════════════
// LES CLÉS ET CERTIFICATS QUI EXPIRENT (12/11/2026, urgence « Se connecter avec Apple » du web)
// ═══════════════════════════════════════════════════════════════════════════
// Le 11/11 à 21:56, la connexion Apple du WEB est tombée (« oauth2: invalid_client — Unable to exchange external code ») :
// le secret client « Sign in with Apple » (un JWT ES256 que Supabase présente à Apple) avait atteint ses 6 mois, la durée
// maximale imposée par Apple. L'app iPhone (jeton natif) n'en dépend pas. Rien ne le surveillait.
// LA RÈGLE (Nico, 12/11) : ce secret se RENOUVELLE SEUL (fonction expirations-secrets, chaque jour : dès qu'il a plus de
// 30 jours, un neuf de 180 jours le remplace — un par mois), la clé .p8 vit en secret serveur, jamais dans le dépôt ; et
// toute clé ou certificat qui expire est inscrit dans public.expirations_secrets : alerte à support 30 jours avant, et
// tout de suite si un renouvellement échoue.
// Pur (Deno + Node) : WebCrypto seulement. Verrou : scripts/expirations-secrets-selftest.mjs.

export const JOUR_MS = 86_400_000;
/** Apple : 6 mois au plus pour un secret client ; on en fait 180 jours. */
export const DUREE_SECRET_APPLE_JOURS = 180;
/** On renouvelle dès qu'il reste moins de 150 jours (= un secret de plus de 30 jours) : un par mois. */
export const RENOUVELER_SOUS_JOURS = 150;
/** Alerte à support quand une échéance approche à moins de 30 jours. */
export const ALERTE_SOUS_JOURS = 30;
/** Une alerte par élément tous les 7 jours au plus (un échec de renouvellement, lui, est dit chaque jour). */
export const ALERTE_REPETEE_JOURS = 7;
export const NOM_SECRET_APPLE_WEB = "apple_siwa_secret_web";

const b64u = (octets) => {
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};
const texteB64u = (t) => b64u(new TextEncoder().encode(t));

function pemVersOctets(pem) {
  const corps = String(pem ?? "").replace(/-----BEGIN [A-Z ]+-----|-----END [A-Z ]+-----|\s+/g, "");
  if (!corps) throw new Error("clé .p8 vide");
  const bin = atob(corps);
  const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return o;
}

/**
 * Le secret client « Sign in with Apple » : JWT ES256 { alg, kid } · { iss = Team ID, iat, exp, aud, sub = Services ID }.
 * @returns {Promise<{ jwt: string, iat: number, exp: number }>}
 */
export async function secretClientApple({ p8, keyId, teamId, clientId, maintenantMs = Date.now(), dureeJours = DUREE_SECRET_APPLE_JOURS }) {
  if (!keyId || !teamId || !clientId) throw new Error("keyId, teamId et clientId sont obligatoires");
  const jours = Math.min(Number(dureeJours) || DUREE_SECRET_APPLE_JOURS, DUREE_SECRET_APPLE_JOURS);
  const iat = Math.floor(maintenantMs / 1000), exp = iat + jours * 86_400;
  const tete = texteB64u(JSON.stringify({ alg: "ES256", kid: keyId }));
  const corps = texteB64u(JSON.stringify({ iss: teamId, iat, exp, aud: "https://appleid.apple.com", sub: clientId }));
  const cle = await crypto.subtle.importKey("pkcs8", pemVersOctets(p8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, new TextEncoder().encode(`${tete}.${corps}`)));
  return { jwt: `${tete}.${corps}.${b64u(sig)}`, iat, exp };
}

/** Le secret en place doit-il être remplacé ? (il reste moins de RENOUVELER_SOUS_JOURS, ou l'échéance est inconnue) */
export function doitRenouveler(expireLe, maintenantMs = Date.now()) {
  const t = expireLe ? new Date(expireLe).getTime() : NaN;
  if (!Number.isFinite(t)) return true;
  return t - maintenantMs < RENOUVELER_SOUS_JOURS * JOUR_MS;
}

/**
 * Les alertes du jour. Une ligne de public.expirations_secrets : { nom, libelle, expire_le, dernier_echec, echec_le,
 * alerte_envoyee_le }. Alerte : échéance à moins de ALERTE_SOUS_JOURS (ou passée), une fois tous les ALERTE_REPETEE_JOURS ;
 * un échec de renouvellement des dernières 24 h, chaque jour.
 * @returns {Array<{ nom: string, libelle: string, motif: 'echeance'|'echec', jours: number|null, expire_le: string|null, echec: string|null }>}
 */
export function alertesDuJour(lignes, maintenantMs = Date.now()) {
  const out = [];
  for (const l of lignes ?? []) {
    const exp = l?.expire_le ? new Date(l.expire_le).getTime() : NaN;
    const jours = Number.isFinite(exp) ? Math.floor((exp - maintenantMs) / JOUR_MS) : null;
    const derniere = l?.alerte_envoyee_le ? new Date(l.alerte_envoyee_le).getTime() : 0;
    const echecRecent = l?.dernier_echec && l?.echec_le && maintenantMs - new Date(l.echec_le).getTime() < JOUR_MS;
    if (echecRecent) { out.push({ nom: l.nom, libelle: l.libelle ?? l.nom, motif: "echec", jours, expire_le: l.expire_le ?? null, echec: String(l.dernier_echec) }); continue; }
    if (jours !== null && jours < ALERTE_SOUS_JOURS && maintenantMs - derniere >= ALERTE_REPETEE_JOURS * JOUR_MS) {
      out.push({ nom: l.nom, libelle: l.libelle ?? l.nom, motif: "echeance", jours, expire_le: l.expire_le, echec: null });
    }
  }
  return out;
}
