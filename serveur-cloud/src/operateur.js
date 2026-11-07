// (07/11 soir, borne de Nico : « la 3 est donnée en dernier » — la RÈGLE, pas le cas) L'OPÉRATEUR DE SORTIE D'UNE IP.
// Une IP libre dont la sortie n'est pas annoncée par un opérateur FRANÇAIS est « atypique » : elle reste saine et
// attribuable, mais passe EN DERNIER (attribution : cloud_ip_attribuer / cloud_ip_reserver ; renouvellement : les saines
// gardées pour la marge). Relevé du 07/11 (ip-api, Team Cymru) : 1, 39, 41 → AS5511 Orange (FR) ; 2, 4 → AS6830 Liberty
// Global Europe (NL) ; 3, 40 → AS2914 NTT America (US).
// Comment « opérateur français » est reconnu, SANS liste à tenir : le PAYS D'ENREGISTREMENT de l'AS, lu dans les fichiers
// de délégation des registres régionaux, par le service DNS public de Team Cymru (AS<n>.asn.cymru.com, TXT
// « 2914 | US | arin | 1998-12-07 | NTT-DATA-2914 - NTT America, Inc., US »). Le numéro d'AS vient d'ip-api (« as », lu par
// le contrôle de santé À TRAVERS le proxy) ; à défaut, de l'origine BGP de l'IP (<ip inversée>.origin.asn.cymru.com).
// Une lecture DNS depuis l'orchestrateur, comme les listes noires de controle.js : aucun trafic par l'IP, aucune clé.
// Le rang (stocké dans cloud_ips.sante.operateur, lu par cloud_ip_rang_operateur en SQL et rangOperateur en JS) :
//   0 = AS enregistré en France (Orange, SFR, Bouygues, Free… : opérateur français) ;
//   1 = AS enregistré ailleurs dans la région du RIPE NCC (Europe, Moyen-Orient : Liberty Global, NL) — atypique ;
//   2 = AS enregistré hors de la région européenne (ARIN, APNIC, LACNIC, AFRINIC : NTT America, US) — atypique, le dernier ;
//   inconnu (DNS muet, AS illisible) = rien d'écrit ; en base, traité comme 1 (au milieu : ni préféré ni relégué).
import { resolveTxt } from 'node:dns/promises';

export const RANG_FRANCAIS = 0;
export const RANG_EUROPEEN = 1;
export const RANG_HORS_EUROPE = 2;
const REGISTRES_HORS_EUROPE = Object.freeze(['arin', 'apnic', 'lacnic', 'afrinic']);

/** Le numéro d'AS d'un libellé ip-api / ipinfo (« AS2914 NTT America, Inc. ») — pure ; null si illisible. */
export function asnDe(texte) {
  const m = /^\s*AS(\d{1,10})\b/i.exec(String(texte ?? ''));
  return m ? m[1] : null;
}

/** Une réponse TXT de Team Cymru pour un AS (« 2914 | US | arin | 1998-12-07 | NTT-DATA-2914 - NTT America, Inc., US ») — pure. */
export function lireAsCymru(txt) {
  const ligne = (Array.isArray(txt) ? txt.flat().join('') : String(txt ?? '')).trim();
  const champs = ligne.split('|').map((x) => x.trim());
  if (champs.length < 3 || !/^\d+$/.test(champs[0])) return null;
  const pays = /^[A-Z]{2}$/i.test(champs[1]) ? champs[1].toUpperCase() : null;
  const registre = String(champs[2] ?? '').toLowerCase() || null;
  return { as: champs[0], pays, registre, nom: (champs[4] ?? '').slice(0, 120) || null };
}

/** L'origine BGP d'une IP (« 5511 | 94.194.92.0/22 | GB | ripencc | 2008-08-14 ») → le numéro d'AS (pure) ; null. */
export function asnOrigineCymru(txt) {
  const ligne = (Array.isArray(txt) ? txt.flat().join('') : String(txt ?? '')).trim();
  const premier = ligne.split('|')[0]?.trim().split(/\s+/)[0];
  return /^\d+$/.test(premier ?? '') ? premier : null;
}

/** Le rang d'un opérateur d'après son pays et son registre d'enregistrement (pure) : 0, 1, 2, ou null (inconnu). */
export function rangDeLOperateur({ pays = null, registre = null } = {}) {
  if (pays === 'FR') return RANG_FRANCAIS;
  if (registre === 'ripencc') return RANG_EUROPEEN;
  if (REGISTRES_HORS_EUROPE.includes(registre)) return RANG_HORS_EUROPE;
  return null;
}

/**
 * L'opérateur de sortie d'une IP (effet : deux lectures DNS au plus). `asTexte` : le champ « as » d'ip-api (ou l'« org »
 * d'ipinfo). Rend { as, pays, registre, nom, rang, atypique, source } ou null (rien de lisible — jamais une cause d'échec).
 */
export async function operateurDeSortie({ ip, asTexte = null, resoudreTxt = resolveTxt }) {
  let as = asnDe(asTexte);
  let source = as ? 'sortie' : null;   // l'AS lu à la sortie (ip-api « as », sinon ipinfo « org »)
  if (!as && /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip ?? ''))) {
    const inverse = String(ip).split('.').reverse().join('.');
    as = asnOrigineCymru(await resoudreTxt(`${inverse}.origin.asn.cymru.com`).catch(() => null));
    source = as ? 'origine_bgp' : null;
  }
  if (!as) return null;
  const info = lireAsCymru(await resoudreTxt(`AS${as}.asn.cymru.com`).catch(() => null));
  const rang = info ? rangDeLOperateur(info) : null;
  return { as, pays: info?.pays ?? null, registre: info?.registre ?? null, nom: info?.nom ?? null, rang, atypique: rang != null && rang > 0, source };
}
