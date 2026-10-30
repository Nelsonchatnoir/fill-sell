// LE COFFRE DES CONNEXIONS — chiffré ICI (AES-256-GCM), la base ne voit que du
// chiffré (table cloud_coffre, RPC cloud_coffre_*). La clé ne vit que sur les
// serveurs de l'orchestrateur (COFFRE_CLE) : une fuite de la base ne donne
// aucune connexion.
//
// Une ligne par plateforme (cookies de son domaine) + 'fillsell' (la session
// FillSell posée par le serveur). Règle du 26/09 (profil Steel vidé) : une
// sauvegarde « déconnectée » n'écrase JAMAIS une connexion connue — tenu ici
// ET en base (cloud_coffre_ecrire).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PLATEFORMES_CLOUD, cookiesDe, estConnectee, versCookieParam } from './plateformes.js';

const ALGO = 'aes-256-gcm';

/** Chiffre un objet JSON. L'identité du compte et de la plateforme entrent dans
 *  les données authentifiées : un chiffré ne se recolle jamais sur un autre compte. */
export function chiffrer(objet, cle, { user, plateforme }) {
  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, cle, iv);
  c.setAAD(Buffer.from(`${user}|${plateforme}`, 'utf8'));
  const corps = Buffer.concat([c.update(Buffer.from(JSON.stringify(objet), 'utf8')), c.final()]);
  const tag = c.getAuthTag();
  return { chiffre: Buffer.concat([corps, tag]).toString('base64'), iv: iv.toString('base64') };
}

export function dechiffrer({ chiffre, iv }, cle, { user, plateforme }) {
  const brut = Buffer.from(chiffre, 'base64');
  const d = createDecipheriv(ALGO, cle, Buffer.from(iv, 'base64'));
  d.setAAD(Buffer.from(`${user}|${plateforme}`, 'utf8'));
  d.setAuthTag(brut.subarray(brut.length - 16));
  const clair = Buffer.concat([d.update(brut.subarray(0, brut.length - 16)), d.final()]);
  return JSON.parse(clair.toString('utf8'));
}

// ── (29/10, lot C partie 6) LE TROUSSEAU : UNE ROTATION DE CLÉ NE REND RIEN ILLISIBLE ───────────────────────────────
// Chaque ligne du coffre porte la version de la clé qui l'a chiffrée (cloud_coffre.cle_version). Avant, la lecture ne
// connaissait que la clé COURANTE : une rotation (COFFRE_CLE changée) rendait toutes les connexions « illisibles » et
// chaque compte Cloud aurait dû se reconnecter. Désormais : on écrit toujours avec la clé courante (cleVersion), on lit
// avec la clé de LA VERSION de la ligne (`anciennes` : { version: clé base64 }, COFFRE_CLES_ANCIENNES), et une ligne
// lue avec une ancienne clé est rechiffrée avec la courante à la sauvegarde suivante (jamais d'écriture à la lecture).
export function creerCoffre({ base, cle, cleVersion = 1, anciennes = {} }) {
  const versBuf = (k) => (Buffer.isBuffer(k) ? k : Buffer.from(String(k), 'base64'));
  const cleBuf = versBuf(cle);
  const trousseau = new Map(Object.entries(anciennes ?? {}).map(([v, k]) => [Number(v), versBuf(k)]));
  trousseau.set(Number(cleVersion), cleBuf);
  const cleDeLaLigne = (l) => trousseau.get(Number(l?.cle_version ?? cleVersion)) ?? null;

  async function lire(user) {
    const { data, error } = await base.rpc('cloud_coffre_lire', { p_user: user });
    if (error) throw new Error(`cloud_coffre_lire : ${error.message}`);
    const out = {};
    for (const l of data ?? []) {
      const k = cleDeLaLigne(l);
      try {
        if (!k) throw new Error('version de clé inconnue');
        out[l.plateforme] = { ...dechiffrer(l, k, { user, plateforme: l.plateforme }), connecte: l.connecte, maj_le: l.maj_le,
          ...(Number(l?.cle_version ?? cleVersion) !== Number(cleVersion) ? { cle_ancienne: Number(l.cle_version) } : {}) };
      } catch {
        out[l.plateforme] = { illisible: true, connecte: false, maj_le: l.maj_le, cle_version: l?.cle_version ?? null };
      }
    }
    return out;
  }

  async function ecrire(user, plateforme, objet, connecte) {
    const { chiffre, iv } = chiffrer(objet, cleBuf, { user, plateforme });
    const { error } = await base.rpc('cloud_coffre_ecrire', {
      p_user: user, p_plateforme: plateforme, p_chiffre: chiffre, p_iv: iv, p_cle_version: cleVersion, p_connecte: connecte,
    });
    if (error) throw new Error(`cloud_coffre_ecrire : ${error.message}`);
  }

  async function vider(user) {
    const { data, error } = await base.rpc('cloud_coffre_vider', { p_user: user });
    if (error) throw new Error(`cloud_coffre_vider : ${error.message}`);
    return Number(data ?? 0);
  }

  /** Sauvegarde, plateforme par plateforme, les cookies d'un navigateur. Une
   *  plateforme non connectée ne touche pas sa sauvegarde (bilan : noms et nombres). */
  async function sauvegarderCookies(user, cookies) {
    const bilan = {};
    let avant = null;
    for (const p of PLATEFORMES_CLOUD) {
      const de = cookiesDe(cookies, p);
      if (!estConnectee(cookies, p)) {
        // (30/10, lot D) Une connexion FAITE qui a lâché (la plateforme a fermé la session) se dit « à reconnecter » :
        // le drapeau `connecte` passe à faux, une fois — avant, il restait vrai pour toujours. Une plateforme jamais
        // connectée (aucune ligne au coffre) ne crée rien.
        avant ??= await lire(user).catch(() => ({}));
        if (avant[p]?.connecte === true) {
          await ecrire(user, p, { le: new Date().toISOString(), cookies: [], session_fermee: true }, false);
          bilan[p] = 'a_reconnecter';
        } else bilan[p] = 'absente';
        continue;
      }
      await ecrire(user, p, { le: new Date().toISOString(), cookies: de }, true);
      bilan[p] = `sauvegardee(${de.length})`;
    }
    return bilan;
  }

  /** Les cookies à réinjecter : seulement pour les plateformes ABSENTES du navigateur
   *  (présente = on ne touche à rien : le profil peut porter des jetons plus récents). */
  async function cookiesARestaurer(user, cookiesCourants) {
    const coffre = await lire(user);
    const aPoser = [];
    const bilan = {};
    for (const p of PLATEFORMES_CLOUD) {
      if (estConnectee(cookiesCourants, p)) { bilan[p] = 'profil'; continue; }
      const s = coffre[p];
      if (!s?.cookies?.length) { bilan[p] = s?.illisible ? 'illisible' : 'absente'; continue; }
      const params = s.cookies.map((c) => versCookieParam(c)).filter(Boolean);
      aPoser.push(...params);
      bilan[p] = `restauree(${params.length})`;
    }
    return { aPoser, bilan };
  }

  return { lire, ecrire, vider, sauvegarderCookies, cookiesARestaurer };
}
