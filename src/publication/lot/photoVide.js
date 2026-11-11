// ═══════════════════════════════════════════════════════════════════════════
// « SANS PHOTO » DIT TOUT DE SUITE (26/10, Medik8 de Nico) — l'image par défaut d'une plateforme, lue dans la page
// ═══════════════════════════════════════════════════════════════════════════
// La « photo » du Medik8 était l'image par défaut de Beebs (une casquette, 200 × 200), rapatriée comme photo de la
// fiche. Le lot le disait… à la fin. Ici, dès la ligne.
//
// (11/11/2026, décisions de Nico) L'image par défaut d'une plateforme n'est jamais envoyée sur une plateforme, quelle
// que soit sa place ; il ne reste aucune vraie photo : « 0 photo », ça bloque (utils/photos.js, vraiesPhotos).
// (11/11 vers 14:50, choix b) On ne retire QUE les images par défaut CONNUES, reconnues À L'IDENTIQUE : la liste
// fermée de imagesParDefaut.js (adresse exacte, ou octets exacts : taille puis SHA-256). Zéro faux positif — on ne
// retire jamais une photo sur un doute. Une image non lue, illisible, ou lue trop tard est GARDÉE.
// L'estimation (estPhotoDeRemplissage, ficheLue.js : ≤ 256 px et ≤ 40 couleurs) ne retire plus rien : elle signale
// un cas DOUTEUX (quandDouteuse → usage_logs, une fois par photo et par session) pour qu'on ajoute la vraie image par
// défaut à la liste, après l'avoir regardée.
// Le coût, borné :
//   · seule une photo VENUE D'UNE PLATEFORME peut être une image par défaut — jamais une photo prise ou ajoutée dans
//     FillSell, ni sa retouche : aucune lecture ;
//   · une photo encore chez la plateforme se reconnaît à son ADRESSE (aucun téléchargement : cdn.beebs.app ne sert
//     même aucun en-tête CORS) ; seule sa copie chez nous (bucket listing-photos) se lit en octets : une taille
//     annoncée (Content-Length) qui n'est celle d'AUCUNE image de la liste arrête tout de suite la lecture (rien que
//     les en-têtes), et la lecture s'arrête dès qu'elle dépasse la plus grande image connue (OCTETS_MAX) ;
//   · en arrière-plan, seulement ce que l'affichage demande : la 1re photo (vignette, bouton), puis la suivante
//     seulement si celle d'avant est une image par défaut reconnue ; l'estimation, sur la photo où l'on s'arrête ;
//   · la reconnaissance de TOUTES les photos se fait au clic qui construit les tâches (reconnaitreAuClic), attente
//     bornée (DELAIS.auClicMs) : ce qui n'est pas lu à temps part. Dans le lot, le moteur de chaque article la
//     pré-lit pendant la préparation (prelireImagesParDefaut, à petite priorité) : au clic, c'est déjà lu ;
//   · LECTURES_SIMULTANEES lectures au plus à la fois, une 1re photo devant les autres ; une lecture qui ne répond pas
//     est abandonnée (rien n'est conclu) ; la file se libère quand l'écran qui l'a demandée se ferme ;
//   · un résultat par adresse, gardé pour la session ; un écran n'est redessiné que lorsqu'une image est reconnue.
import { useEffect, useMemo, useState } from "react";
import { estPhotoDeRemplissage } from "./ficheLue";
import { imageParDefautDeLAdresse, imageParDefautDesOctets, tailleDImageParDefaut, sha256Hex, OCTETS_MAX } from "./imagesParDefaut";

/** Lectures en même temps, au plus. */
export const LECTURES_SIMULTANEES = 4;
/** Les délais : une lecture qui ne répond pas est abandonnée (rien n'est conclu) ; l'attente au clic est bornée.
 *  (Le selftest les raccourcit.) */
export const DELAIS = { lectureMs: 8_000, auClicMs: 4_000 };

const reconnues = new Map();   // url → l'entrée de la liste fermée | false (pas une image par défaut connue)
const estimations = new Map(); // url → true (douteuse) | false
const enCours = new Map();     // clé → { promesse, demandeurs, ctl, place, lancee }
const premieres = [];          // places en attente, prioritaires (une 1re photo, le clic)
const suivantes = [];          // les autres
let actives = 0;
const signalees = new Set();   // les photos douteuses déjà signalées pendant cette session
const AUCUNE = Object.freeze([]);

// Un aperçu local (photo qui vient d'être prise ou choisie), ou un fichier que la personne a téléversé dans FillSell
// (<uid>/raw/, utils/photosUpload.js) ou sa retouche (<uid>/enhanced/, generate-listing) : jamais l'image par défaut
// d'une plateforme.
const APERCU_LOCAL = /^(blob|data):/i;
const AJOUTEE_DANS_FILLSELL = /\/storage\/v1\/object\/public\/listing-photos\/[^/]+\/(raw|enhanced)\//;
// Une copie chez nous (rapatrie-fiche/, rehosted/, rapatrie-job/…) : CORS ouvert, octets recopiés tels quels.
const COPIE_CHEZ_NOUS = /\/storage\/v1\/object\/public\/listing-photos\//;

/** Cette photo peut-elle être l'image par défaut d'une plateforme ? Seules celles-là se lisent. */
export function peutEtreDeRemplissage(url) {
  if (typeof url !== "string" || !url) return false;
  return !APERCU_LOCAL.test(url) && !AJOUTEE_DANS_FILLSELL.test(url);
}

/** Ses octets se lisent-ils ? Seulement sa copie chez nous ; une photo encore chez la plateforme ne se reconnaît
 *  qu'à son adresse. */
export function octetsLisibles(url) {
  return peutEtreDeRemplissage(url) && COPIE_CHEZ_NOUS.test(url);
}

/** Oublie tout ce que la session a lu (reconnaissances, estimations, signalements) — le selftest, avant de monter
 *  un écran, pour que ce qu'il voit vienne de SA lecture. Les lectures en cours vont au bout. */
export function oublierLaSession() {
  reconnues.clear();
  estimations.clear();
  signalees.clear();
}

/** L'image par défaut connue reconnue à cette adresse (adresse exacte, ou octets déjà lus), ou null. Synchrone. */
export function imageParDefautReconnue(url) {
  return imageParDefautDeLAdresse(url) ?? (reconnues.get(url) || null);
}

/** Une de ces photos est-elle l'image par défaut CONNUE de `plateforme`, reconnue à l'identique ? Le texte qui nomme
 *  la plateforme (« l'image vient de Beebs ») ne se dit qu'alors — jamais sur une supposition. */
export function imageParDefautDe(plateforme, urls) {
  return (Array.isArray(urls) ? urls : []).some((u) => imageParDefautReconnue(u)?.plateforme === plateforme);
}

// ── La file ───────────────────────────────────────────────────────────────────────────────────────────────────────
function rendreSaPlace() {
  const suivante = premieres.shift() ?? suivantes.shift();
  if (suivante) suivante.partir();   // la place passe à la lecture qui attendait
  else actives--;
}
function attendreSaPlace(e, prioritaire) {
  return new Promise((lancer, renoncer) => {
    const partir = () => { e.place = null; e.lancee = true; lancer(); };
    if (actives < LECTURES_SIMULTANEES) { actives++; partir(); return; }
    e.place = { partir };
    (prioritaire ? premieres : suivantes).push(e.place);
    e.ctl.signal.addEventListener("abort", () => {
      if (!e.place) return;   // déjà partie : la lecture voit le signal
      for (const f of [premieres, suivantes]) { const i = f.indexOf(e.place); if (i >= 0) f.splice(i, 1); }
      e.place = null;
      renoncer(new Error("abandonnée"));
    }, { once: true });
  });
}
// Une lecture partagée par clé : tous ceux qui la demandent reçoivent la même promesse. `signal` : celui qui la
// demande s'en va (écran fermé) — quand plus personne ne l'attend, elle quitte la file (ou s'arrête). Sans signal
// (le clic), elle va au bout.
function lecture(cle, faire, { prioritaire = false, signal = null } = {}) {
  let e = enCours.get(cle);
  if (e && e.ctl.signal.aborted) e = null;   // abandonnée (plus personne ne l'attendait) : une nouvelle lecture
  if (!e) {
    e = { demandeurs: 0, ctl: new AbortController(), place: null, lancee: false };
    const ici = e;
    ici.promesse = attendreSaPlace(ici, prioritaire)
      .then(() => faire(ici.ctl.signal))
      .catch(() => null)
      .finally(() => { if (enCours.get(cle) === ici) enCours.delete(cle); if (ici.lancee) rendreSaPlace(); });
    enCours.set(cle, ici);
  } else if (prioritaire && e.place) {
    const i = suivantes.indexOf(e.place);
    if (i >= 0) premieres.push(...suivantes.splice(i, 1));
  }
  e.demandeurs++;
  if (signal) {
    const ici = e;
    const lacher = () => { if (--ici.demandeurs <= 0) ici.ctl.abort(); };
    if (signal.aborted) lacher(); else signal.addEventListener("abort", lacher, { once: true });
  }
  return e.promesse;
}

// ── La reconnaissance exacte (octets) ─────────────────────────────────────────────────────────────────────────────
// L'entrée de la liste fermée | false (ces octets ne sont aucune image par défaut connue) | null (rien de conclu).
async function lireOctets(url, signal) {
  const ctl = new AbortController();
  const couper = () => ctl.abort();
  if (signal?.aborted) return null;
  signal?.addEventListener("abort", couper, { once: true });
  const minuteur = setTimeout(couper, DELAIS.lectureMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, mode: "cors", credentials: "omit" });
    if (!r.ok) { couper(); return null; }   // une réponse d'erreur : son corps n'est pas téléchargé
    // Une taille annoncée qui n'est celle d'AUCUNE image connue : ce n'en est aucune, rien à lire de plus (le
    // stockage sert les images telles quelles, sans compression : Content-Length = la taille exacte du fichier).
    const annoncee = Number(r.headers.get("content-length"));
    if (r.headers.has("content-length") && Number.isFinite(annoncee) && !tailleDImageParDefaut(annoncee)) { couper(); return false; }
    const morceaux = [];
    let total = 0;
    const lecteur = r.body?.getReader?.();
    if (lecteur) {
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        total += value.byteLength;
        if (total > OCTETS_MAX) { couper(); return false; }   // plus grande que toute image connue
        morceaux.push(value);
      }
    } else {
      const b = new Uint8Array(await r.arrayBuffer());
      total = b.byteLength;
      if (total > OCTETS_MAX) return false;
      morceaux.push(b);
    }
    if (!tailleDImageParDefaut(total)) return false;
    const octets = new Uint8Array(total);
    let n = 0;
    for (const m of morceaux) { octets.set(m, n); n += m.byteLength; }
    const empreinte = await sha256Hex(octets);
    if (!empreinte) return null;
    return imageParDefautDesOctets(total, empreinte) ?? false;
  } catch {
    return null;   // réseau, CORS, délai, écran fermé : rien n'est conclu
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener("abort", couper);
  }
}

/**
 * Cette photo est-elle une image par défaut CONNUE, reconnue à l'identique ? true | false | null (rien de conclu :
 * elle compte alors pour une vraie photo). Une fois par adresse et par session (un « null » se relit plus tard).
 * `prioritaire` : passe devant les lectures qui attendent ; `signal` : celui qui la demande s'en va.
 */
export function reconnaitrePhoto(url, { prioritaire = false, signal = null } = {}) {
  if (typeof url !== "string" || !url) return Promise.resolve(null);
  if (imageParDefautDeLAdresse(url)) return Promise.resolve(true);
  if (!octetsLisibles(url)) return Promise.resolve(false);
  if (reconnues.has(url)) return Promise.resolve(Boolean(reconnues.get(url)));
  return lecture(`octets ${url}`, async (s) => {
    const v = await lireOctets(url, s);
    if (v === null || v === undefined) return null;
    reconnues.set(url, v || false);
    return Boolean(v);
  }, { prioritaire, signal });
}

// ── L'estimation (signaler, jamais retirer) ───────────────────────────────────────────────────────────────────────
// true : petite ET presque sans couleurs (douteuse) ; false : non ; null : rien de conclu (réseau, canevas, délai).
function mesurer(url, signal) {
  return new Promise((resolve) => {
    let fini = false;
    let minuteur = null;
    let img = null;
    const finir = (v) => { if (fini) return; fini = true; clearTimeout(minuteur); signal?.removeEventListener("abort", abandon); resolve(v); };
    // Abandonnée (écran fermé, délai) : le téléchargement de l'image s'arrête aussi.
    const abandon = () => {
      if (img && !fini) { img.onload = null; img.onerror = null; try { img.src = ""; } catch { /* rien à arrêter */ } }
      finir(null);
    };
    if (signal?.aborted) { resolve(null); return; }
    signal?.addEventListener("abort", abandon, { once: true });
    minuteur = setTimeout(abandon, DELAIS.lectureMs);
    try {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const largeur = img.naturalWidth, hauteur = img.naturalHeight;
          // Trop grande pour une image par défaut, quelles que soient ses couleurs : aucun pixel à lire.
          if (!estPhotoDeRemplissage({ largeur, hauteur, couleurs: 0 })) { finir(false); return; }
          const c = document.createElement("canvas");
          c.width = 48; c.height = 48;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 48, 48);
          const d = ctx.getImageData(0, 0, 48, 48).data;
          const vues = new Set();
          for (let i = 0; i < d.length; i += 4) vues.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
          finir(estPhotoDeRemplissage({ largeur, hauteur, couleurs: vues.size }));
        } catch { finir(null); } // canevas refusé : rien n'est conclu
      };
      img.onerror = () => finir(null);
      img.src = url;
    } catch { finir(null); }
  });
}

/** L'estimation d'une photo venue d'une plateforme : true (douteuse) | false | null. Une fois par session. Elle ne
 *  retire jamais rien : elle sert à SIGNALER. */
export function estimerPhoto(url, { signal = null } = {}) {
  if (!peutEtreDeRemplissage(url)) return Promise.resolve(false);
  if (estimations.has(url)) return Promise.resolve(estimations.get(url));
  return lecture(`estimation ${url}`, async (s) => {
    const v = await mesurer(url, s);
    if (v !== null) estimations.set(url, v);
    return v;
  }, { signal });
}

/** Signale une photo douteuse au plus une fois par session : rend true quand `envoyer` a été appelé. */
export function signalerUneFois(url, envoyer) {
  if (typeof url !== "string" || !url || signalees.has(url)) return false;
  signalees.add(url);
  try { envoyer(url); } catch { /* un signalement ne casse jamais l'écran */ }
  return true;
}

// ── Ce qui se lit ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Les lectures à lancer maintenant, dans l'ordre. `verdict(url)` : true | false | null (lue, rien de conclu) |
 * undefined (pas encore lue). Sans cascade : toutes celles qui ne sont pas encore lues. En cascade : la première,
 * puis la suivante seulement si celle d'avant est une image par défaut reconnue — on s'arrête à la première autre.
 */
export function lecturesALancer(urls, verdict, { enCascade = false } = {}) {
  const sortie = [];
  for (const u of urls ?? []) {
    const v = verdict(u);
    if (v === undefined) { sortie.push(u); if (enCascade) break; }
    else if (enCascade && v !== true) break;
  }
  return sortie;
}

/**
 * LE CORPS DE LA LECTURE D'UNE LISTE, en cascade (pur : aucun React — le selftest l'exécute tel quel). La 1re photo,
 * puis la suivante seulement si celle d'avant est une image par défaut reconnue ; on s'arrête à la première qui n'en
 * est pas une (ou qui n'a pas pu être lue). `quandReconnue(url)` : une image vient d'être reconnue (l'écran se
 * redessine — seulement alors) ; `quandConclue()` : la cascade a CONCLU — une photo lue qui n'est pas une image par
 * défaut, ou toutes reconnues (jamais sur une lecture ratée : rien n'est conclu, comme avant le 11/11) ;
 * `estimer` + `quandDouteuse(url)` : la photo où l'on s'arrête, jugée douteuse par l'estimation, est signalée — elle
 * reste. Ce que CETTE liste a appris n'est pas redemandé tant qu'elle vit (un « null » se relit avec la liste
 * suivante). Rend arreter().
 */
export function suivreLectures(liste, { reconnaitre, estimer = null, quandReconnue = () => {}, quandDouteuse = null, quandConclue = () => {} }) {
  let vivant = true;
  const verdicts = new Map();
  const demandees = new Set();
  const verdict = (u) => (verdicts.has(u) ? verdicts.get(u) : undefined);
  const derniere = liste[liste.length - 1];
  const avancer = () => {
    for (const u of lecturesALancer(liste, verdict, { enCascade: true })) {
      if (demandees.has(u)) continue;
      demandees.add(u);
      Promise.resolve(reconnaitre(u, { prioritaire: u === liste[0] })).then((v) => {
        verdicts.set(u, v);
        if (!vivant) return;
        if (v === true) { quandReconnue(u); if (u === derniere) quandConclue(); avancer(); return; }
        if (v === false) quandConclue();
        if (estimer && quandDouteuse) {
          Promise.resolve(estimer(u)).then((d) => { if (vivant && d === true) quandDouteuse(u); });
        }
      });
    }
  };
  if (!liste.length) quandConclue();
  avancer();
  return () => { vivant = false; };
}

/** La cascade est-elle déjà conclue d'après la mémoire de la session (le premier rendu n'attend rien) ? */
export function cascadeConclue(liste) {
  for (const u of liste ?? []) {
    if (imageParDefautReconnue(u)) continue;
    if (!octetsLisibles(u) || reconnues.has(u)) return true;   // pas une image par défaut connue : c'est conclu
    return false;                                              // pas encore lue
  }
  return true;
}

/**
 * LE CORPS DE L'EFFET de useLectureImagesParDefaut (pur : le selftest l'exécute tel quel) : la lecture en cascade de
 * `liste` par la vraie lecture (reconnaitrePhoto, estimerPhoto), sous un signal qui libère la file. Rend la fonction
 * qui l'arrête (l'écran se ferme : ses lectures qui attendent encore ne partent jamais).
 */
export function lireEnArrierePlan(liste, { quandReconnue = () => {}, quandConclue = () => {}, quandDouteuse = null } = {}) {
  const ctl = new AbortController();
  const arreter = suivreLectures(Array.isArray(liste) ? liste : [], {
    reconnaitre: (u, o) => reconnaitrePhoto(u, { ...o, signal: ctl.signal }),
    estimer: quandDouteuse ? (u) => estimerPhoto(u, { signal: ctl.signal }) : null,
    quandReconnue, quandConclue, quandDouteuse,
  });
  return () => { arreter(); ctl.abort(); };
}

/**
 * Les images par défaut CONNUES, reconnues à l'identique parmi `urls` — à passer à vraiesPhotos (utils/photos.js) —
 * et `conclue` : la lecture en cascade a conclu (la vignette du lot ne dit « Sans photo », ou ne l'ôte, qu'alors).
 * La liste rendue ne change (et l'écran n'est redessiné) que lorsqu'une image est reconnue ; une image pas lue, ou
 * illisible, n'y figure jamais. `quandDouteuse(url)` (le moteur) : une photo jugée douteuse par l'estimation, à
 * signaler — sans lui, aucune estimation ne se lance (la vignette du lot).
 */
export function useLectureImagesParDefaut(urls, { quandDouteuse = null } = {}) {
  const cle = [...new Set((Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && u))].join("\n");
  const [, redessiner] = useState(0);
  const [conclueCle, setConclueCle] = useState(null);
  useEffect(() => {
    if (!cle) return undefined;
    return lireEnArrierePlan(cle.split("\n"), {
      quandReconnue: () => redessiner((n) => n + 1),
      quandConclue: () => setConclueCle(cle),
      quandDouteuse,
    });
  }, [cle, quandDouteuse]);
  const signature = cle ? cle.split("\n").filter((u) => imageParDefautReconnue(u)).join("\n") : "";
  const reconnues = useMemo(() => (signature ? signature.split("\n") : AUCUNE), [signature]);
  const conclue = !cle || conclueCle === cle || cascadeConclue(cle.split("\n"));
  return useMemo(() => ({ reconnues, conclue }), [reconnues, conclue]);
}

/** Les seules images reconnues (le moteur : le bouton, « Ce qui va partir »). */
export function useImagesParDefaut(urls, options) {
  return useLectureImagesParDefaut(urls, options).reconnues;
}

/**
 * PRÉ-LECTURE (le moteur d'un article du lot, pendant la préparation) : toutes les photos qui peuvent partir, à
 * petite priorité, pour qu'au clic tout soit déjà lu. `signal` : l'écran se ferme, ce qui attend ne part pas. Rien
 * n'attend cette lecture. Rend le nombre d'adresses demandées.
 */
export function prelireImagesParDefaut(urls, { signal = null } = {}) {
  const liste = [...new Set((Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && u))];
  for (const u of liste) reconnaitrePhoto(u, { signal });
  return liste.length;
}

/**
 * AU CLIC qui construit les tâches : la reconnaissance de TOUTES les photos, attente bornée (DELAIS.auClicMs). Rend
 * les adresses reconnues à l'identique ; une photo pas lue à temps, ou illisible, n'y figure pas — elle part.
 */
export async function reconnaitreAuClic(urls, { delaiMs = DELAIS.auClicMs } = {}) {
  const liste = [...new Set((Array.isArray(urls) ? urls : []).filter((u) => typeof u === "string" && u))];
  if (!liste.length) return [];
  let minuteur = null;
  await Promise.race([
    Promise.all(liste.map((u) => reconnaitrePhoto(u, { prioritaire: true }))),
    new Promise((fin) => { minuteur = setTimeout(fin, delaiMs); }),
  ]);
  clearTimeout(minuteur);
  return liste.filter((u) => imageParDefautReconnue(u));
}
