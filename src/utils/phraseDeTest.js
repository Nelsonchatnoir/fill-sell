// ═══════════════════════════════════════════════════════════════════════════
// LA PHRASE DE TEST : UNE DATE STOCKÉE À PART, UNE PHRASE ÉCRITE À CHAQUE ENVOI (13/11, lot « zéro problème », 5a)
// ═══════════════════════════════════════════════════════════════════════════
// Compte de63ca45 : ses consignes demandent « Jeu testé aujourd’hui, le [date], et fonctionnel. » le jour même et
// « Jeu testé le [date] et fonctionnel. » plus tard. La phrase était FIGÉE dans le texte de la fiche et recopiée par
// chaque republication : 70 annonces Vinted en ligne et 80 republications Leboncoin en 12 jours disaient « testé
// aujourd’hui, le <date> » avec 17 jours de retard médian (54 au plus) ; Beebs a refusé les 4 dépôts du 02/11 qui la
// portaient. Décision de Nico (12/11) : la DATE est une donnée à part (inventaire.attributs.teste_le), la PHRASE est
// écrite à chaque envoi selon le modèle du vendeur, et omise là où la plateforme la refuse (capacites-texte.js).
// Pour TOUS les comptes : sans modèle ni date, rien ne bouge ; un texte qui porte déjà une phrase du modèle du vendeur
// (tapée à la main) est relu — sa date devient la date du test — et la phrase est réécrite au jour de l'envoi.
// Prêt pour d'autres langues : les mois, les jours et le format de la date viennent d'Intl (langue du compte).
// Pur (Deno + Node + Vite) : scripts/phrase-test-datee-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const echapper = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const langueCourte = (l) => String(l ?? "fr").slice(0, 2).toLowerCase() || "fr";

/** Le jour d'aujourd'hui à Paris, « AAAA-MM-JJ ». */
export function aujourdhuiParis(maintenant = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
}

const dateUtc = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
};

/** « 2 novembre 2026 », « 1er novembre 2026 » (fr), « November 2, 2026 » (en). null si la date n'en est pas une. */
export function formaterDateTest(iso, langue = "fr") {
  const d = dateUtc(iso);
  if (!d) return null;
  const l = langueCourte(langue);
  const txt = new Intl.DateTimeFormat(l, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  return l === "fr" && d.getUTCDate() === 1 ? txt.replace(/^1(?=\s)/, "1er") : txt;
}

const CACHE_CALENDRIER = new Map();
function calendrier(langue) {
  const l = langueCourte(langue);
  if (!CACHE_CALENDRIER.has(l)) {
    const mois = new Intl.DateTimeFormat(l, { month: "long", timeZone: "UTC" });
    const jours = new Intl.DateTimeFormat(l, { weekday: "long", timeZone: "UTC" });
    CACHE_CALENDRIER.set(l, {
      mois: Array.from({ length: 12 }, (_, i) => sansAccents(mois.format(new Date(Date.UTC(2026, i, 15))))),
      jours: Array.from({ length: 7 }, (_, i) => sansAccents(jours.format(new Date(Date.UTC(2026, 10, 2 + i))))),
    });
  }
  return CACHE_CALENDRIER.get(l);
}

/** La date écrite dans un texte (« samedi 10 octobre 2026 », « 1er novembre 2026 », « 02/11/2026 ») → « AAAA-MM-JJ ». */
export function lireDateTest(texte, langue = "fr") {
  const t = sansAccents(texte).replace(/\s+/g, " ").trim();
  const { mois, jours } = calendrier(langue);
  const iso = (a, m, j) => {
    if (!(m >= 1 && m <= 12 && j >= 1 && j <= 31 && a >= 2000 && a <= 2100)) return null;
    const d = new Date(Date.UTC(a, m - 1, j));
    return d.getUTCMonth() === m - 1 ? `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}` : null;
  };
  const jourSemaine = `(?:(?:${jours.map(echapper).join("|")})\\s+)?`;
  // « 2 novembre 2026 » / « 1er novembre 2026 »
  let m = new RegExp(`^${jourSemaine}(\\d{1,2})(?:er|re|st|nd|rd|th)?\\s+(${mois.map(echapper).join("|")})\\s+(\\d{4})$`, "u").exec(t);
  if (m) return iso(Number(m[3]), mois.indexOf(m[2]) + 1, Number(m[1]));
  // « November 2, 2026 »
  m = new RegExp(`^${jourSemaine}(${mois.map(echapper).join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, "u").exec(t);
  if (m) return iso(Number(m[3]), mois.indexOf(m[1]) + 1, Number(m[2]));
  // « 02/11/2026 » (jour d'abord, sauf en anglais)
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return langueCourte(langue) === "en" ? iso(Number(m[3]), Number(m[1]), Number(m[2])) : iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

const REPERE_DATE = /\[(?:date|jour|day|jj\/mm(?:\/aaaa)?)\]|\{date\}|<date>/iu;

/** Le modèle par défaut d'une langue, quand une date existe et que le vendeur n'a pas écrit le sien. */
export const MODELES_PAR_DEFAUT = Object.freeze({
  fr: Object.freeze({ jourMeme: "Testé aujourd’hui, le [date], et fonctionnel.", plusTard: "Testé le [date] et fonctionnel.", sansDate: null }),
  en: Object.freeze({ jourMeme: "Tested today, [date], and working.", plusTard: "Tested on [date] and working.", sansDate: null }),
});

/** Le motif qui reconnaît une phrase du modèle, quelle que soit sa date (apostrophes et espaces tolérés). */
function motifDuModele(modele) {
  const morceaux = String(modele ?? "").split(REPERE_DATE);
  const lettres = (s) => echapper(s).replace(/['’]/g, "['’]").replace(/\s+/g, "\\s+");
  return new RegExp(morceaux.map(lettres).join("(?<date>[^\\n]{3,40}?)"), "iu");
}

/**
 * Les motifs (sources de RegExp sans groupe nommé, drapeaux « giu ») qui reconnaissent une phrase du modèle, toutes
 * formes : servis à l'extension pour la recréation Vinted, qui tape le texte de la CAPTURE. À appliquer EN UNE PASSE
 * (une seule expression, les motifs en alternative) : la première phrase trouvée devient la phrase du jour servie, les
 * autres sont retirées — jamais motif après motif (la phrase du jour serait reprise par le motif suivant).
 * Sans modèle : aucun motif.
 * @param {{jourMeme?: string|null, plusTard?: string|null, sansDate?: string|null}|null} modele
 * @returns {string[]}
 */
export function motifsDePhraseDeTest(modele) {
  if (!modele) return [];
  return [...new Set([modele.jourMeme, modele.plusTard, modele.sansDate].filter(Boolean))]
    .map((m) => motifDuModele(m).source.replace(/\(\?<date>/g, "(?:"));
}

/**
 * Les phrases du modèle trouvées dans un texte, dans l'ordre : { debut, fin, date (ISO ou null), forme }.
 * Une phrase dont la « date » ne se lit pas comme une date n'est pas une phrase du modèle (rien n'est touché).
 */
export function phrasesDeTestDansLeTexte(texte, modele, langue = "fr") {
  const t = String(texte ?? "");
  if (!t || !modele) return [];
  const formes = [["jourMeme", modele.jourMeme], ["plusTard", modele.plusTard], ["sansDate", modele.sansDate]]
    .filter(([, m], i, tout) => m && tout.findIndex(([, x]) => x === m) === i);
  const trouvees = [];
  for (const [forme, m] of formes) {
    const re = new RegExp(motifDuModele(m).source, "giu");
    for (const x of t.matchAll(re)) {
      const date = x.groups?.date != null ? lireDateTest(x.groups.date, langue) : null;
      if (x.groups?.date != null && !date) continue;
      const debut = x.index, fin = x.index + x[0].length;
      if (trouvees.some((y) => debut < y.fin && fin > y.debut)) continue;
      trouvees.push({ debut, fin, date, forme });
    }
  }
  return trouvees.sort((a, b) => a.debut - b.debut);
}

/** La phrase du jour : « aujourd'hui » si le test date d'aujourd'hui (Paris), sinon la forme datée. */
export function phraseDeTest({ testeLe, aujourdhui = aujourdhuiParis(), modele = null, langue = "fr" }) {
  const date = formaterDateTest(testeLe, langue);
  if (!date) return null;
  const m = modele ?? MODELES_PAR_DEFAUT[langueCourte(langue)] ?? MODELES_PAR_DEFAUT.fr;
  const gabarit = testeLe === aujourdhui ? m.jourMeme : m.plusTard;
  return gabarit ? gabarit.replace(REPERE_DATE, date) : null;
}

/** Normalisation d'une ligne pour la comparer (émojis, espaces, apostrophes, casse et accents ignorés). */
export const ligneComparable = (l) => sansAccents(String(l ?? "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ""))
  .replace(/['’]/g, "'").replace(/\s+/g, " ").trim();

/** L'index où commencent les phrases finales si le texte finit par elles (lignes comparées), sinon -1. */
export function debutDesFinales(texte, finales) {
  const lignesFin = String(finales ?? "").split("\n").map(ligneComparable).filter(Boolean);
  if (!lignesFin.length) return -1;
  const t = String(texte ?? "");
  const lignes = t.split("\n");
  const pleines = [];
  let pos = 0;
  for (const l of lignes) { if (ligneComparable(l)) pleines.push({ pos, l }); pos += l.length + 1; }
  if (pleines.length < lignesFin.length) return -1;
  const fin = pleines.slice(-lignesFin.length);
  return fin.every((x, i) => ligneComparable(x.l) === lignesFin[i]) ? fin[0].pos : -1;
}

/**
 * Le texte d'un envoi, sa phrase de test écrite au jour de l'envoi.
 *   · les phrases du modèle déjà dans le texte sont retirées ; la première donne sa PLACE (et sa date si la fiche
 *     n'en a pas) ;
 *   · la plateforme refuse la phrase (`accepte: false`) → elle ne part pas, sous aucune forme ;
 *   · une date connue → la phrase du jour, à la place de l'ancienne, sinon juste avant les phrases finales du
 *     vendeur, sinon à la fin ; « date inconnue » écrite par le vendeur → gardée telle quelle ;
 *   · ni modèle trouvé dans le texte, ni date : le texte part tel quel, à l'octet près.
 * @param {string} texte
 * @param {{testeLe?: string|null, aujourdhui?: string, modele?: {jourMeme: string, plusTard: string, sansDate: string|null}|null,
 *   langue?: string, accepte?: boolean, finales?: string|null}} [opts]
 * @returns {{texte: string, modifie: boolean, phrase: string|null, date: string|null, omise: boolean}}
 */
export function rendrePhraseDeTest(texte, { testeLe = null, aujourdhui = aujourdhuiParis(), modele = null, langue = "fr", accepte = true, finales = null } = {}) {
  const t = String(texte ?? "");
  const intact = { texte: t, modifie: false, phrase: null, date: null, omise: false };
  const dateFiche = dateUtc(testeLe) ? testeLe : null;
  const trouvees = phrasesDeTestDansLeTexte(t, modele, langue);
  if (!trouvees.length && !dateFiche) return intact;
  if (!trouvees.length && !accepte) return { ...intact, omise: true };
  const date = dateFiche ?? trouvees.find((x) => x.date)?.date ?? null;
  const sansDateEcrite = trouvees.some((x) => x.forme === "sansDate");
  const phrase = !accepte ? null
    : date ? phraseDeTest({ testeLe: date, aujourdhui, modele, langue })
    : (sansDateEcrite ? modele?.sansDate ?? null : null);
  // On retire les phrases trouvées ; la première laisse un repère à sa place.
  const REPERE = "\u0000TEST\u0000";
  let sortie = "", dernier = 0;
  trouvees.forEach((x, i) => { sortie += t.slice(dernier, x.debut) + (i === 0 ? REPERE : ""); dernier = x.fin; });
  sortie += t.slice(dernier);
  if (!trouvees.length && phrase) {
    const i = debutDesFinales(sortie, finales);
    sortie = i >= 0
      ? `${sortie.slice(0, i).replace(/\s+$/, "")}\n\n${REPERE}\n\n${sortie.slice(i)}`
      : `${sortie.replace(/\s+$/, "")}\n\n${REPERE}`;
  }
  sortie = phrase ? sortie.replace(REPERE, phrase) : sortie.replace(REPERE, "");
  // Une ligne vidée tombe ; jamais plus d'une ligne vide de suite ; les espaces doublées d'un retrait au milieu d'une
  // phrase se referment.
  sortie = sortie.split("\n").map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "");
  // Même texte (la phrase du jour est celle qui y était déjà) : le texte part tel quel, à l'octet près.
  if (sortie === t.replace(/\s+$/, "")) return { ...intact, phrase, date };
  return { texte: sortie, modifie: true, phrase, date, omise: !accepte };
}
