// (13/11, décision de Nico : « Essai de la 0.6.187 : sur MON poste Cloud. Garde-fou : seul mon poste est touché, jamais
// celui d'un client Cloud. Remets tout comme avant après l'essai ») L'EXTENSION PILOTE D'UN SEUL COMPTE.
// La copie Cloud de l'extension est COMMUNE à tous les navigateurs d'un serveur (config.dossierExtension, non empaquetée ;
// config.dossierExtensionCrx, le CRX signé que le relais du conteneur sert à Chrome). Un dossier pilote, posé À LA MAIN
// sur le serveur (root seul — jamais une liste en base, jamais un réglage qu'un client atteint), la remplace pour UN compte :
//   <dossierExtensionPilote>/<user_id>/extension/   la copie Cloud non empaquetée (scripts/cloud/build-extension-cloud.mjs)
//   <dossierExtensionPilote>/<user_id>/crx/         fillsell-cloud.crx + update.xml (navigateur-chrome/empaqueter-extension.sh)
// Présent et COMPLET = monté pour CE compte seulement ; absent, en préparation (« <user_id>.nouveau ») ou incomplet = la
// copie commune, exactement comme avant (un pilote refusé se dit : extension_pilote_refusee).
// Conditions d'un pilote : nom = un identifiant de compte ; clé du manifeste = celle de la copie commune (l'orchestrateur
// pose la session FillSell, la vidange et les pauses par CET identifiant : postes.js:56, index.js:90, pausesMessagerie.js:51) ;
// update.xml de la même extension, à une version AU-DESSUS de la copie commune servie (Chrome ne prend jamais une version
// égale ou plus basse que celle qu'il a : un pilote en dessous ne serait jamais installé).
// ⛔ CHROME NE DESCEND JAMAIS DE VERSION : retirer le dossier pilote ne ramène PAS la copie commune (0.6.186.45160 < pilote).
// Le RETOUR = la copie commune re-signée AU-DESSUS du pilote, servie à ce seul compte (même dossier pilote), puis le dossier
// retiré. Un retrait sans retour n'est pas redémarré (rien ne changerait) et se dit : extension_pilote_retour_impossible.
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { idExtensionDepuisCle } from './sessionFillsell.js';

export const UUID_COMPTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const dossierPilotes = (config) => config?.dossierExtensionPilote || '/srv/fillsell-cloud/extension-pilote';
/** L'empreinte d'un script de fond (celle de rafraichirExtensionDuProfil, navigateur.js). */
export const empreinteScript = (octets) => createHash('sha256').update(octets).digest('hex').slice(0, 16);

/** Compare deux versions Chrome (« 0.6.186.45160 ») : < 0, 0, > 0 (pure : testée). Parties absentes = 0. */
export function comparerVersions(a, b) {
  const pa = String(a ?? '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b ?? '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** La version annoncée par un update.xml, s'il est bien celui de l'extension `id` (pure : testée) ; sinon null. */
export function versionDeUpdateXml(xml, id) {
  const app = /<app\s+appid=['"]([a-p]{32})['"]/.exec(String(xml ?? ''));
  const v = /<updatecheck\b[^>]*\bversion=['"](\d+(?:\.\d+){0,3})['"]/.exec(String(xml ?? ''));
  if (!app || !v || (id && app[1] !== id)) return null;
  return v[1];
}

/**
 * Le verdict d'un dossier pilote (pure : testée). Rend { ok: true, version, empreinte } ou { ok: false, raison }.
 * `manifeste` : le manifest.json lu (objet) ; `background` : les octets de background.js ; `updateXml` : le texte ;
 * `crx` : vrai si fillsell-cloud.crx est là et non vide ; `cleCommune` / `versionCommune` : la copie commune servie.
 */
export function verdictPilote({ user, manifeste, background, updateXml, crx, cleCommune, versionCommune }) {
  if (!UUID_COMPTE.test(String(user ?? ''))) return { ok: false, raison: 'compte_illisible' };
  if (!manifeste || typeof manifeste !== 'object') return { ok: false, raison: 'manifeste_illisible' };
  if (!cleCommune || manifeste.key !== cleCommune) return { ok: false, raison: 'cle_differente' };
  if (!background?.length) return { ok: false, raison: 'background_absent' };
  if (!crx) return { ok: false, raison: 'crx_absent' };
  const version = versionDeUpdateXml(updateXml, idExtensionDepuisCle(cleCommune));
  if (!version) return { ok: false, raison: 'update_xml_illisible' };
  if (versionCommune && comparerVersions(version, versionCommune) <= 0) return { ok: false, raison: 'version_pas_au_dessus' };
  return { ok: true, version, empreinte: empreinteScript(background) };
}

/** Les comptes qui ont un dossier pilote (noms = identifiants de compte seulement) ; [] sans dossier des pilotes. */
export async function listerPilotes(config) {
  const noms = await readdir(dossierPilotes(config), { withFileTypes: true }).catch(() => []);
  return noms.filter((e) => e.isDirectory() && UUID_COMPTE.test(e.name)).map((e) => e.name).sort();
}

const lireJson = (f) => readFile(f, 'utf8').then((t) => JSON.parse(t), () => null);
const lireTexte = (f) => readFile(f, 'utf8').catch(() => null);

/** La copie COMMUNE, telle qu'elle est servie aujourd'hui : ses deux dossiers, son script de fond, sa version servie. */
export async function lireSourceCommune(config) {
  const [bg, xml] = await Promise.all([readFile(`${config.dossierExtension}/background.js`).catch(() => null), lireTexte(`${config.dossierExtensionCrx}/update.xml`)]);
  return { pilote: false, dossier: config.dossierExtension, dossierCrx: config.dossierExtensionCrx,
    empreinte: bg ? empreinteScript(bg) : null, version: versionDeUpdateXml(xml, null) };
}

/**
 * La copie de l'extension d'UN compte : son pilote s'il est présent et valable, sinon la commune (lireSourceCommune). Un
 * pilote présent mais refusé rend la commune avec `raison`. Rien d'autre que le dossier de CE compte n'est lu.
 */
export async function lireSourceExtension({ config, user }) {
  const commune = await lireSourceCommune(config);
  if (!UUID_COMPTE.test(String(user ?? ''))) return commune;
  const racine = `${dossierPilotes(config)}/${user}`;
  const present = await stat(racine).then((s) => s.isDirectory(), () => false);
  if (!present) return commune;
  const dossier = `${racine}/extension`;
  const dossierCrx = `${racine}/crx`;
  const [manifeste, background, updateXml, crx, communeMan] = await Promise.all([
    lireJson(`${dossier}/manifest.json`), readFile(`${dossier}/background.js`).catch(() => null), lireTexte(`${dossierCrx}/update.xml`),
    stat(`${dossierCrx}/fillsell-cloud.crx`).then((s) => s.size > 0, () => false), lireJson(`${config.dossierExtension}/manifest.json`)]);
  const v = verdictPilote({ user, manifeste, background, updateXml, crx, cleCommune: communeMan?.key, versionCommune: commune.version });
  if (!v.ok) return { ...commune, raison: v.raison };
  return { pilote: true, dossier, dossierCrx, empreinte: v.empreinte, version: v.version };
}

/**
 * Faut-il redémarrer ce navigateur pour sa copie ? (pure : testée) `avec` = la copie avec laquelle il a été ouvert
 * (h.extension), `courante` = celle d'aujourd'hui. JAMAIS un compte sans pilote, ni avant ni maintenant (tous les autres :
 * comme aujourd'hui). Sinon : seulement si le script de fond change ET que la copie servie est AU-DESSUS de celle qui
 * tourne (sinon Chrome la garderait : raison « version_pas_au_dessus »).
 */
export function decisionPilote(avec, courante) {
  if (!courante || (!avec?.pilote && !courante.pilote)) return { redemarrer: false };
  if (String(avec?.empreinte ?? '') === String(courante.empreinte ?? '')) return { redemarrer: false };
  if (avec?.version && courante.version && comparerVersions(courante.version, avec.version) <= 0) {
    return { redemarrer: false, raison: 'version_pas_au_dessus' };
  }
  return { redemarrer: true };
}
