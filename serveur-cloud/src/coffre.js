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

export function creerCoffre({ base, cle, cleVersion = 1 }) {
  const cleBuf = Buffer.isBuffer(cle) ? cle : Buffer.from(cle, 'base64');

  async function lire(user) {
    const { data, error } = await base.rpc('cloud_coffre_lire', { p_user: user });
    if (error) throw new Error(`cloud_coffre_lire : ${error.message}`);
    const out = {};
    for (const l of data ?? []) {
      try {
        out[l.plateforme] = { ...dechiffrer(l, cleBuf, { user, plateforme: l.plateforme }), connecte: l.connecte, maj_le: l.maj_le };
      } catch {
        out[l.plateforme] = { illisible: true, connecte: false, maj_le: l.maj_le };
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
    for (const p of PLATEFORMES_CLOUD) {
      const de = cookiesDe(cookies, p);
      if (!estConnectee(cookies, p)) { bilan[p] = 'absente'; continue; }
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
