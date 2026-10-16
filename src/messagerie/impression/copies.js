// ═══════════════════════════════════════════════════════════════════════════
// BORDEREAUX — LIRE UNE COPIE, RETENIR UN RECADRAGE (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Léger : importé par les écrans. Le moteur (pdf.js, pdf-lib) n'est jamais
// chargé ici.
import { genreFichier } from './geometrie.js';

/**
 * Les octets d'une copie : {octets} tels quels, {chemin} lu dans le dossier
 * privé `bordereaux` (session de la personne), ou {url} (adresse signée).
 * Rend {octets: Uint8Array, genre: 'pdf'|'png'|'jpeg'} ou lève.
 */
export async function chargerCopieBordereau(copie, supabase) {
  let octets = null;
  if (copie?.octets) octets = copie.octets instanceof Uint8Array ? copie.octets : new Uint8Array(copie.octets);
  else if (copie?.chemin && supabase) {
    const { data, error } = await supabase.storage.from('bordereaux').download(copie.chemin);
    if (error || !data) throw new Error('copie_illisible');
    octets = new Uint8Array(await data.arrayBuffer());
  } else if (copie?.url) {
    const r = await fetch(copie.url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`copie_http_${r.status}`);
    octets = new Uint8Array(await r.arrayBuffer());
  }
  if (!octets?.length) throw new Error('copie_absente');
  const genre = genreFichier(octets);
  if (!genre) throw new Error('fichier_inconnu');
  return { octets, genre };
}

// Le recadrage choisi par la personne pour un transporteur, retenu sur CET
// appareil (localStorage, jamais en base). « auto » efface le choix.
const CLE = 'fillsell.bordereau.recadrage';
export function cleTransporteur(copie) {
  const p = String(copie?.platform ?? '').toLowerCase() || 'inconnue';
  const t = String(copie?.transporteur ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'inconnu';
  return `${p}:${t}`;
}
export function recadrageRetenu(copie) {
  try {
    const v = JSON.parse(window.localStorage.getItem(CLE) ?? '{}')?.[cleTransporteur(copie)];
    return typeof v === 'string' && v ? v : 'auto';
  } catch { return 'auto'; }
}
export function retenirRecadrage(copie, nom) {
  try {
    const tout = JSON.parse(window.localStorage.getItem(CLE) ?? '{}') ?? {};
    if (!nom || nom === 'auto') delete tout[cleTransporteur(copie)];
    else tout[cleTransporteur(copie)] = nom;
    window.localStorage.setItem(CLE, JSON.stringify(tout));
  } catch { /* stockage fermé : le choix vaut pour cette fois */ }
}
