// ── LE TÉLÉVERSEMENT DES PHOTOS — UNE SEULE BRIQUE (2026-09-19) ─────────────
//
// Le même geste était écrit TROIS fois : LensTab.televerserPhotos (viseur),
// ListingPreviewScreen.handleUpload (step 0) et .handleAddMorePhotos (step 1).
// Trois copies veut dire trois occasions d'oublier une règle — et il y en a
// trois à ne jamais oublier, toutes payées :
//
//   1. LE DÉCODAGE NE DOIT JAMAIS RESTER PENDANT (04/09, retour Romain Colson).
//      Une image que le navigateur ne sait pas décoder — un HEIC d'iPhone dans
//      Chrome — ne déclenche jamais `onload`. Sans `onerror` NI délai maximum,
//      la Promise n'est jamais résolue, l'`await` ne rend jamais la main et
//      l'écran reste sur « Upload en cours… » définitivement.
//      ⚠️ La copie de LensTab portait ENCORE ce défaut : elle posait `onload`
//         seul. Elle n'était pas atteignable en pratique — les photos du viseur
//         passent déjà par versImageDecodable en amont (App.jsx, handleLens…) —
//         mais on ne recopie pas une bombe désamorcée dans une brique commune.
//      `versImageDecodable` porte les deux gardes ET la conversion HEIC
//      (décodeur importé à la demande). `toBlob` reçoit un rejet explicite : il
//      peut rendre null, ce qui serait une autre pendante.
//
//   2. `?v=<ts>` SUR L'URL PUBLIQUE (02/09 soir, incident Delavier). Le CDN
//      Supabase avait servi puis MIS EN CACHE un 404 sur ces URLs — les trois
//      plateformes refusaient « photo indisponible (HTTP 404) » sur des
//      fichiers pourtant présents. Le paramètre entre dans la clé de cache :
//      une clé NEUVE par téléversement ne peut, par construction, avoir été
//      demandée avant le téléversement, donc aucun 404 antérieur ne peut être
//      resservi. Le même `v` pour la vie de la photo → le cache utile (200)
//      reste intact. ⛔ Ne jamais le retirer.
//
//   3. LA FORME DES DONNÉES (05/09, incident lecarnetdemercury). On LIT les
//      deux formes, on ÉCRIT toujours `{ type, url }` — et cette écriture-là
//      passe par `entreesPhotos` (src/utils/photos.js), jamais par un `.url`
//      posé à la main. `televerserPhotos` rend donc les DEUX : `urls` (les
//      chaînes, ce que les appelants historiques manipulent) et `entrees`
//      (la forme des jobs). Les appelants existants continuent de lire `urls`
//      — cette brique ne change le comportement d'aucun d'entre eux.
//
// ⛔ Les paramètres de compression sont ceux d'avant, à l'identique :
//    1024 px de large au plus, qualité 0,85, sortie JPEG. Le schéma de chemin
//    aussi : <uid>/raw/<lot>_<i>.jpg, où <lot> est le Date.now() de la fournée.

import { versImageDecodable, chargerImage } from "./imageDecode";
import { entreesPhotos } from "./photos";

/** Côté le plus large après compression, et qualité JPEG. Valeurs d'origine. */
export const LARGEUR_MAX_UPLOAD = 1024;
export const QUALITE_UPLOAD = 0.85;

/** Le bucket durable des photos d'annonce. */
export const BUCKET_PHOTOS = "listing-photos";

/**
 * Compresse une image en JPEG. Lève une erreur explicite si elle est
 * indécodable ou si le canvas ne rend rien — jamais de promesse pendante.
 * @param {File|Blob} source
 * @returns {Promise<Blob>}
 */
export async function compresserImage(
  source,
  maxWidth = LARGEUR_MAX_UPLOAD,
  quality = QUALITE_UPLOAD,
) {
  const { blob } = await versImageDecodable(source);
  const img = await chargerImage(blob);
  const c = document.createElement("canvas");
  const sc = Math.min(1, maxWidth / img.width);
  c.width = img.width * sc;
  c.height = img.height * sc;
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((resolve, reject) => {
    c.toBlob(b => (b ? resolve(b) : reject(new Error("compression_impossible"))), "image/jpeg", quality);
  });
}

/** Le nom lisible d'une source, pour nommer une photo illisible à l'écran. */
function nomDeSource(source, i) {
  const n = typeof source === "object" && source ? source.name : null;
  return n || `photo ${i + 1}`;
}

/** Rend un Blob depuis un File, un Blob, ou une URL (y compris une dataURL). */
async function versBlob(source) {
  if (typeof source === "string") {
    const res = await fetch(source);
    return await res.blob();
  }
  return source;
}

/**
 * Compresse puis téléverse une fournée de photos dans <uid>/raw/.
 *
 * @param {object} supabase        le client (passé en paramètre : les deux
 *                                 composants appelants le reçoivent en prop)
 * @param {object}   opts
 * @param {string}   opts.userId   le dossier racine — TOUJOURS l'uid (RLS)
 * @param {Array<File|Blob|string>} opts.sources
 * @param {string}  [opts.marqueur] inséré dans le nom : `<ts>_<marqueur><i>.jpg`
 * @param {number}  [opts.ts]       le lot ; une seule valeur pour la fournée
 * @param {"lever"|"ignorer"} [opts.surErreur]
 *        "lever"   : une photo illisible fait échouer l'appel (comportement du
 *                    viseur Lens et de l'ajout de photos en step 1) ;
 *        "ignorer" : elle est SAUTÉE et nommée dans `illisibles` (step 0 —
 *                    depuis le 04/09 un HEIC ne fait plus tomber tout le lot).
 * @returns {Promise<{urls: string[], entrees: Array<{type:string,url:string}>,
 *                    illisibles: string[], ts: number}>}
 */
export async function televerserPhotos(supabase, {
  userId,
  sources,
  marqueur = "",
  ts = Date.now(),
  surErreur = "lever",
  maxWidth = LARGEUR_MAX_UPLOAD,
  quality = QUALITE_UPLOAD,
}) {
  const urls = [];
  const illisibles = [];
  const liste = Array.isArray(sources) ? sources : [];
  for (let i = 0; i < liste.length; i++) {
    let blob;
    try {
      blob = await compresserImage(await versBlob(liste[i]), maxWidth, quality);
    } catch (e) {
      if (surErreur === "lever") throw e;
      console.warn(`[photos] « ${nomDeSource(liste[i], i)} » illisible :`, e?.message ?? e);
      illisibles.push(nomDeSource(liste[i], i));
      continue;
    }
    const path = `${userId}/raw/${ts}_${marqueur}${i}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET_PHOTOS)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    // Un échec de téléversement ne pousse rien : la photo n'existe pas, on ne
    // fabrique pas une URL qui rendrait 404 plus tard. Comportement d'origine.
    if (!upErr) {
      urls.push(supabase.storage.from(BUCKET_PHOTOS).getPublicUrl(path).data.publicUrl + `?v=${ts}`);
    }
  }
  return { urls, entrees: entreesPhotos(urls), illisibles, ts };
}
