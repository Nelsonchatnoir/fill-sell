// ═══════════════════════════════════════════════════════════════════════════
// L'EMPREINTE « MAISON » : LA RÉDUCTION DE SUPABASE REFAITE DANS NOS FONCTIONS (03/11)
// ═══════════════════════════════════════════════════════════════════════════
// Les photos de NOTRE bucket sont réduites à 400 px avant d'en calculer
// l'empreinte (_shared/empreinte-telechargement.ts, urlTransformee) : c'était
// la transformation d'images de Supabase, ≈ 235 à 390 $ par cycle, rien que
// pour les photos neuves. L'essai D (docs/enquetes/facture-supabase-0211/
// essai-empreintes-D/) l'a refaite à l'octet avec libvips 8.18.7 compilé sur
// UN SEUL THREAD (vips-mono/vips-mono.mjs : 3,4 Mo de WebAssembly embarqués,
// 16 Mo de mémoire au départ, 160 Mo au plus, ni Web Worker ni
// SharedArrayBuffer) : 200/200 empreintes identiques au bit près, 199/199 JPEG
// identiques à l'octet au fichier servi par Supabase, 12/12 dans une fonction.
// L'empreinte se calcule ensuite sur ces octets avec le module de la prod
// (decoderEmpreinte), exactement comme sur la version de Supabase.
//
// ⛔ PÉRIMÈTRE PROUVÉ SEULEMENT. Un JPEG (trame 0, 1 ou 2, 8 bits, 3 composantes,
// fichier complet) ou un PNG RVB 8 bits sans transparence, sans profil, non
// entrelacé (fichier complet), réduit (un côté au-dessus de 400 px), aucun côté
// au-dessus de 2 560 px (les plus gros JPEG du bucket, mesurés dans la fonction
// de test : 57 à 152 ms). Le module refuse en plus le gris, le CMJN, une
// orientation EXIF ≠ 1. Tout le reste — PNG à transparence, WebP, photo
// tournée, gris, CMJN, très grande image, cas inconnu — et toute erreur, tout
// piège du module, tout manque de temps lèvent `Repli` : l'appelant calcule
// alors la photo chez Supabase, exactement comme avant (empreinterUrl).
// Jamais une empreinte perdue ni vide pour autant.
import VipsMono from "./vips-mono/vips-mono.mjs";
import { DecodageRemis, decoderEmpreinte, telecharger, type BudgetDecodage } from "./empreinte-telechargement.ts";

/** coin_config : 1 = le module maison, toute autre valeur (ou clé absente, illisible) = Supabase. Sans redéploiement. */
export const CLE_MOTEUR_MAISON = "empreintes_moteur_maison";
/** photo_empreintes.source d'une empreinte faite par le module (relue par personne pour décider : traçabilité seule). */
export const SOURCE_MAISON = "empreintes-urls:maison";
export const COTE_CIBLE = 400;
export const COTE_MAX = 2_560;
/** Le temps de calcul d'un appel (réductions du module + décodages) au-delà duquel une photo repart chez Supabase. */
export const BUDGET_CALCUL_MS = 1_000;
/** Une réduction plus lente que ça (mesuré : 152 ms au pire) : le module n'est plus utilisé dans cet appel. */
export const LENTE_MS = 400;
const ESTIME_PREMIERE_MS = 250;

/** La photo repart chez Supabase (jamais un échec de la photo). */
export class Repli extends Error {
  categorie: string;
  constructor(categorie: string, motif: string) { super(motif); this.name = "Repli"; this.categorie = categorie; }
}

/** Le temps du module dans un appel. */
export type CalculMaison = { ms: number; pixels: number; reductions: number; lent: boolean };
export const calculMaison = (): CalculMaison => ({ ms: 0, pixels: 0, reductions: 0, lent: false });

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

/** Le périmètre prouvé, lu dans l'en-tête sans décoder : la largeur et la hauteur, ou le motif du repli. */
export function perimetre(buf: Uint8Array): { largeur: number; hauteur: number } | { motif: string } {
  const n = buf.byteLength;
  let largeur = 0, hauteur = 0;
  if (n >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    // JPEG : segments jusqu'à la première trame (SOF).
    let i = 2, trame = -1;
    while (i + 3 < n && trame < 0) {
      if (buf[i] !== 0xff) return { motif: "JPEG : en-tête illisible" };
      const m = buf[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) return { motif: "JPEG : données avant la trame" };
      const longueur = (buf[i + 2] << 8) | buf[i + 3];
      if (longueur < 2) return { motif: "JPEG : en-tête illisible" };
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        if (i + 9 >= n) return { motif: "JPEG : en-tête illisible" };
        if (m > 0xc2) return { motif: `JPEG : trame ${m.toString(16)} hors périmètre` };
        if (buf[i + 4] !== 8) return { motif: `JPEG : ${buf[i + 4]} bits` };
        if (buf[i + 9] !== 3) return { motif: `JPEG : ${buf[i + 9]} composante(s)` };
        hauteur = (buf[i + 5] << 8) | buf[i + 6];
        largeur = (buf[i + 7] << 8) | buf[i + 8];
        trame = m;
      }
      i += 2 + longueur;
    }
    if (trame < 0) return { motif: "JPEG : aucune trame" };
    // Fichier complet : le marqueur de fin dans les 16 derniers octets (un JPEG tronqué ne part jamais au module).
    let fin = false;
    for (let j = n - 2; j >= Math.max(0, n - 18); j--) if (buf[j] === 0xff && buf[j + 1] === 0xd9) { fin = true; break; }
    if (!fin) return { motif: "JPEG : fin de fichier absente" };
  } else if (n >= 33 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
             && buf[12] === 0x49 && buf[13] === 0x48 && buf[14] === 0x44 && buf[15] === 0x52) {
    // PNG : IHDR, puis les blocs jusqu'aux données.
    largeur = u32(buf, 16); hauteur = u32(buf, 20);
    if (buf[24] !== 8 || buf[25] !== 2) return { motif: `PNG : profondeur ${buf[24]}, couleur ${buf[25]} hors périmètre` };
    if (buf[28] !== 0) return { motif: "PNG entrelacé" };
    let i = 8;
    for (;;) {
      if (i + 8 > n) return { motif: "PNG : blocs illisibles" };
      const t = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
      if (t === "IDAT") break;
      if (t === "tRNS") return { motif: "PNG à transparence" };
      if (t === "iCCP") return { motif: "PNG avec profil" };
      i += 12 + u32(buf, i);
    }
    const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    if (!iend.every((v, k) => buf[n - 12 + k] === v)) return { motif: "PNG : fin de fichier absente" };
  } else {
    return { motif: "format hors périmètre (ni JPEG ni PNG)" };
  }
  if (!largeur || !hauteur) return { motif: "dimensions illisibles" };
  if (largeur > COTE_MAX || hauteur > COTE_MAX) return { motif: `très grande image (${largeur}×${hauteur})` };
  if (largeur <= COTE_CIBLE && hauteur <= COTE_CIBLE) return { motif: `image sans réduction (${largeur}×${hauteur})` };
  return { largeur, hauteur };
}

// ── Le module : chargé une fois par instance, jamais réutilisé après un piège ──
// deno-lint-ignore no-explicit-any
let modulePret: Promise<any> | null = null;
let horsService: string | null = null;

// deno-lint-ignore no-explicit-any
function moduleVips(): Promise<any> {
  if (!modulePret) {
    modulePret = (async () => {
      // deno-lint-ignore no-explicit-any
      const m: any = await VipsMono();
      if (m._essai_init() !== 0) throw new Error("démarrage : " + m.UTF8ToString(m._essai_erreur()));
      return m;
    })().catch((e) => { modulePret = null; throw e; });
  }
  return modulePret;
}

/** La réduction de Supabase (imgproxy : fit 400×400, quality 80) : 0 = faite, 1 = hors périmètre, -1 = erreur. */
// deno-lint-ignore no-explicit-any
function reduire(m: any, o: Uint8Array): { code: number; infos: number[]; octets?: Uint8Array; erreur?: string } {
  const p = m._malloc(o.length), pp = m._malloc(4), pl = m._malloc(4), pi = m._malloc(4 * 8);
  try {
    if (!p || !pp || !pl || !pi) return { code: -1, infos: [], erreur: "mémoire du module épuisée" };
    m.HEAPU8.set(o, p);
    const code = m._essai_reduire(p, o.length, pp, pl, pi);
    const infos = Array.from(m.HEAP32.subarray(pi >> 2, (pi >> 2) + 8)) as number[];
    if (code !== 0) return { code, infos, erreur: code < 0 ? String(m.UTF8ToString(m._essai_erreur())).slice(0, 160) : "hors périmètre" };
    const q = m.HEAPU32[pp >> 2], n = m.HEAPU32[pl >> 2];
    const octets = m.HEAPU8.slice(q, q + n) as Uint8Array;
    m._essai_liberer(q);
    return { code, infos, octets };
  } finally {
    if (p) m._free(p);
    if (pp) m._free(pp);
    if (pl) m._free(pl);
    if (pi) m._free(pi);
  }
}

/** L'empreinte d'une originale par le module — ou `Repli` (la photo repart chez Supabase) ; une remise reste une remise. */
export async function empreinterOctetsMaison(o: Uint8Array, decodage: BudgetDecodage, calcul: CalculMaison) {
  if (horsService) throw new Repli("module", `module hors service dans cette instance (${horsService})`);
  if (calcul.lent) throw new Repli("temps", "une réduction lente dans cet appel");
  const dim = perimetre(o);
  if ("motif" in dim) throw new Repli("perimetre", dim.motif);
  const pixels = dim.largeur * dim.hauteur;
  const estime = calcul.reductions > 0 && calcul.pixels > 0 ? pixels * (calcul.ms / calcul.pixels) : ESTIME_PREMIERE_MS;
  if (calcul.ms + decodage.consommeMs + estime > BUDGET_CALCUL_MS) throw new Repli("temps", "temps de calcul de l'appel bientôt atteint");
  let m;
  try { m = await moduleVips(); } catch (e) { throw new Repli("module", `chargement : ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
  const debut = performance.now();
  let r;
  try {
    r = reduire(m, o);
  } catch (e) {
    // Un piège du WebAssembly laisse le module dans un état inconnu : plus jamais utilisé par cette instance.
    horsService = String((e as Error)?.message ?? e).slice(0, 120);
    modulePret = null;
    throw new Repli("module", `piège : ${horsService}`);
  } finally {
    const ms = performance.now() - debut;
    calcul.ms += ms; calcul.pixels += pixels; calcul.reductions++;
    if (ms > LENTE_MS) calcul.lent = true;
  }
  if (r.code !== 0) throw new Repli(r.code === 1 ? "perimetre" : "module", `${r.code === 1 ? "hors périmètre" : "erreur"} : ${r.erreur} [${r.infos.join(",")}]`);
  let e;
  try {
    e = await decoderEmpreinte(r.octets!, decodage);
  } catch (err) {
    if (err instanceof DecodageRemis) throw err;
    throw new Repli("decodage", `réduite illisible : ${String((err as Error)?.message ?? err).slice(0, 120)}`);
  }
  // La réduite a la taille de celle de Supabase (« fit » : le grand côté à 400 px) — sinon, rien n'est gardé.
  if (Math.max(e.largeur, e.hauteur) !== COTE_CIBLE || Math.min(e.largeur, e.hauteur) < 1) {
    throw new Repli("decodage", `réduite de ${e.largeur}×${e.hauteur}, attendu ${COTE_CIBLE} px au grand côté`);
  }
  return e;
}

/** L'empreinte d'une photo de notre bucket par le module — ou `Repli` (la photo repart chez Supabase). */
export async function empreinterMaison(url: string, decodage: BudgetDecodage, calcul: CalculMaison) {
  let o: Uint8Array;
  try { o = await telecharger(url); } catch (e) {
    const err = e as Error;
    throw new Repli("originale", `originale : ${err?.name === "AbortError" ? "AbortError" : String(err?.message ?? e).slice(0, 120)}`);
  }
  return await empreinterOctetsMaison(o, decodage, calcul);
}
