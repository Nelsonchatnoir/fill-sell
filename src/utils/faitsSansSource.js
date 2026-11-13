// ═══════════════════════════════════════════════════════════════════════════
// UN TEXTE RÉDIGÉ N'AFFIRME QUE CE QUE SA SOURCE DIT (13/11, lot « zéro problème », point 5a de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Compte de63ca45, 7 propositions sur 7 (02/11) : un état ou une absence de défaut que la note ne donne pas
// (« fermeture impeccable » pour « elle ferme bien », « Jaquette propre, sans dommage », « Jaquette : excellent état »
// sur une lecture « jaquette en bon état »), 6 sur 7 un document ou une édition mal nommés (« Notice », « Livret »,
// « Boîte cartonnée » et « Jaquette » pour une pochette cartonnée), des faits superflus (« édité par Activision »,
// « PEGI 16 », « version française intégrale »). Le garde-fou du prompt les interdisait déjà : il ne suffit pas.
// La règle, pour TOUS les comptes, appliquée APRÈS le modèle et seulement sur le texte que FillSell a rédigé :
//   · LA SOURCE : la note du vendeur quand il en a donné une (elle fait foi ; la lecture des photos, qui ne suit pas
//     ses consignes, n'est plus une source de faits), sinon la lecture des photos ; plus le titre, la marque et les
//     champs confirmés de la fiche ;
//   · un mot d'embellissement (impeccable, parfait, excellent, comme neuf, propre, intact, léger), une absence de
//     défaut (sans rayure, sans dommage, sans usure, sans casse…), un test réussi, un éditeur, un PEGI, une version
//     linguistique — absents de la source : la proposition qui le porte tombe ;
//   · un document, un contenant ou une édition (notice ≠ livret ≠ feuillet ≠ guide, jaquette, pochette, fourreau,
//     Steelbook, Artbook…) que la source ne nomme pas : la proposition tombe (« sans notice » dit une absence : gardé) ;
//   · un état général affirmé alors que l'état est INCONNU (aucun « Très bon état » par défaut) : il tombe ;
//   · ⛔ un DÉFAUT dit (usure, rayure, pliure, tache…) ne tombe jamais pour un nom d'élément : cacher un défaut est un
//     embellissement par omission, pire qu'un nom approximatif.
// ⛔ ON RETIRE, ON NE REFORMULE PAS (même doctrine que retirerEtatContredit et description-leboncoin.ts). Texte vidé
//    → l'original (une annonce sans description ne vaut pas mieux).
// Lexiques PAR LANGUE (celle du texte) : français livré, anglais prêt (sans entrée, rien ne tombe).
// Pur (Deno + Node + Vite) : scripts/etat-jamais-embelli-selftest.ts, scripts/elements-nommes-selftest.ts.
// ═══════════════════════════════════════════════════════════════════════════
import { etatAffirmeParLeTexte } from "../../supabase/functions/_shared/etat-plateformes.js";
import {
  elementsNommes, groupesDeLaSource, lexiqueElements, etatDUnePartie,
} from "../../supabase/functions/_shared/elements-article.js";

const ABS = "(?:sans|aucune?s?|pas\\s+de|pas\\s+d['’]|ni)\\s+(?:[\\p{L}'’-]+\\s+){0,2}?";
const ABS_SOURCE = "(?:sans|aucune?s?|pas\\s+de|pas\\s+d['’]|n['’]a\\s+(?:pas|aucune?)|ni|non)\\s*(?:[\\p{L}'’-]+[\\s-]+){0,3}?";
const re = (s) => new RegExp(s, "iu");

const LEXIQUES_FAITS = Object.freeze({
  fr: Object.freeze({
    affirmations: Object.freeze([
      { motif: "embellissement", re: /impeccabl\p{L}*/iu, source: /impeccabl/iu },
      { motif: "embellissement", re: /(?<!\p{L})parfait(?:e|s|es|ement)?(?!\p{L})/iu, source: /parfait/iu },
      { motif: "embellissement", re: /(?<!\p{L})excellent(?:e|s|es)?(?!\p{L})/iu, source: /excellent/iu },
      { motif: "embellissement", re: /comme\s+neu(?:f|ve|fs|ves)(?!\p{L})/iu, source: /comme\s+neu/iu },
      { motif: "embellissement", re: /(?<!\p{L})(?<!main\s)propres?(?!\p{L})/iu, source: /(?<!main\s)propre/iu },
      { motif: "embellissement", re: /(?<!\p{L})intact(?:e|s|es)?(?!\p{L})/iu, source: /intact/iu },
      { motif: "embellissement", re: /(?<!\p{L})(?:l[ée]g[eè]re?s?|l[ée]g[eè]rement)(?!\p{L})/iu, source: /l[ée]g[eè]r/iu },
      { motif: "absence de défaut", re: re(`${ABS}dommages?`), source: /dommage/iu },
      { motif: "absence de défaut", re: re(`${ABS}d[ée]fauts?`), source: re(`${ABS_SOURCE}d[ée]fauts?`) },
      { motif: "absence de défaut", re: re(`${ABS}(?:micro[\\s-]?)?rayures?`), source: re(`${ABS_SOURCE}(?:micro[\\s-]?)?rayures?`) },
      { motif: "absence de défaut", re: re(`${ABS}usures?`), source: re(`${ABS_SOURCE}usures?`) },
      { motif: "absence de défaut", re: re(`${ABS}(?:casses?|cassures?|fissures?)`), source: /cass|fissur/iu },
      { motif: "absence de défaut", re: re(`${ABS}(?:d[ée]chirures?|taches?)`), source: /d[ée]chir|tache/iu },
      { motif: "absence de défaut", re: /aucun\s+(?:souci|probl[eè]me)s?/iu, source: /souci|probl[eè]me/iu },
      { motif: "fabricant", re: /[ée]dit[ée](?:e|s|es)?\s+par|(?<!\p{L})[ée]diteur(?!\p{L})/iu, source: /[ée]dit[ée]|[ée]diteur/iu },
      { motif: "fabricant", re: /d[ée]velopp[ée](?:e|s|es)?\s+(?:par|avec)|(?<!\p{L})d[ée]veloppeur(?!\p{L})/iu, source: /d[ée]velopp/iu },
      { motif: "fabricant", re: /(?<!\p{L})pegi\s*\d+/iu, source: /pegi/iu },
      { motif: "version", re: /version\s+fran[cç]aise|(?<!\p{L})vf(?!\p{L})/iu, source: /version\s+fran[cç]aise|(?<!\p{L})vf(?!\p{L})|en\s+fran[cç]ais/iu },
    ]),
    // Un test RÉUSSI (« testé et fonctionnel », « fonctionne ») ne s'affirme que si la source le dit sans négation.
    test: /(?<!\p{L})(?:test[ée](?:e|s|es)?|fonctionn\p{L}*)(?!\p{L})/iu,
    negation: /(?<!\p{L})(?:non|pas|jamais|aucune?|n['’]|sans)(?!\p{L})/iu,
    // Un DÉFAUT dit (usure, rayure, pliure, marque, tache…) : la proposition qui le porte ne tombe jamais pour un nom
    // d'élément — cacher un défaut est pire qu'un nom approximatif (Rise of the Tomb Raider, 02/11 : « Boîtier : petites
    // marques d'usure » pour la pochette — retirer la ligne aurait effacé la seule usure de l'annonce).
    defaut: /(?<!\p{L})(?:usures?|us[ée](?:e|s|es)?|rayures?|ray[ée](?:e|s|es)?|pliures?|pli[ée](?:e|s|es)?|plis|marques?\s+d|taches?|tach[ée](?:e|s|es)?|d[ée]chir\p{L}*|cass[ée]\p{L}*|fissur\p{L}*|ab[iî]m[ée]\p{L}*|traces?|jauni\p{L}*|d[ée]fauts?|accrocs?|bosses?|[ée]caill\p{L}*)(?!\p{L})/iu,
    absenceDeDefaut: new RegExp(`${ABS}$`, "iu"),
  }),
  en: Object.freeze({
    affirmations: Object.freeze([
      { motif: "embellissement", re: /(?<!\p{L})(?:flawless|perfect|mint|pristine|immaculate)(?!\p{L})/iu, source: /flawless|perfect|mint|pristine|immaculate/iu },
      { motif: "absence de défaut", re: /(?<!\p{L})no\s+(?:\p{L}+\s+){0,2}?(?:scratch(?:es)?|damage|wear|defects?)(?!\p{L})/iu, source: /scratch|damage|wear|defect/iu },
    ]),
    test: /(?<!\p{L})(?:tested|working|works)(?!\p{L})/iu,
    negation: /(?<!\p{L})(?:not|no|never|untested|without)(?!\p{L})/iu,
  }),
});

const lexiqueFaits = (langue) => LEXIQUES_FAITS[String(langue ?? "").slice(0, 2).toLowerCase()] ?? LEXIQUES_FAITS.fr;

/**
 * Les sources des faits d'un texte rédigé : la note du vendeur quand il en a donné une (elle fait foi), sinon la
 * lecture des photos ; plus le titre, la marque, le type et les champs confirmés de la fiche.
 * @param {{note?: string|null, lecturePhotos?: string|null, titre?: string|null, marque?: string|null,
 *   type?: string|null, champs?: Array<string|null|undefined>}} [args]
 * @returns {string[]}
 */
export function sourcesDesFaits({ note = null, lecturePhotos = null, titre = null, marque = null, type = null, champs = [] } = {}) {
  const n = String(note ?? "").trim();
  return [n || String(lecturePhotos ?? "").trim(), titre, marque, type, ...(champs ?? [])]
    .map((s) => String(s ?? "").trim()).filter(Boolean);
}

const PUCE = /^(?:[\s\p{Extended_Pictographic}•·\-–—*✓✔]|\u{FE0F}|\u{200D})*/u;

/**
 * Retire d'un texte RÉDIGÉ les propositions qui affirment ce que la source ne dit pas (cf. bandeau).
 * @param {string} texte
 * @param {{sources?: string[], langue?: string, etatConnu?: string|null|undefined}} [opts]  etatConnu : le palier
 *   de l'état qui part ; `null` = état INCONNU (un état général affirmé tombe) ; absent = non contrôlé ici.
 * @returns {{texte: string, retires: Array<{segment: string, motif: string}>, modifie: boolean}}
 */
export function retirerFaitsSansSource(texte, { sources = [], langue = "fr", etatConnu } = {}) {
  const original = String(texte ?? "");
  const lex = lexiqueFaits(langue);
  const source = (sources ?? []).filter(Boolean).join("\n");
  if (!original.trim()) return { texte: original, retires: [], modifie: false };
  const groupesSource = groupesDeLaSource(source, langue);
  const editions = lexiqueElements(langue).editions;
  const phrasesSource = source.split(/(?<=[.!?…])\s+|\n+/);
  const testReussiDansSource = phrasesSource.some((p) => lex.test.test(p) && !lex.negation.test(p));
  const paliersSource = new Set(phrasesSource.map((p) => etatAffirmeParLeTexte(p)).filter(Boolean));

  /** La proposition dit-elle un défaut (et non son absence : « aucune rayure ») ? */
  const porteUnDefaut = (prop) => {
    if (!lex.defaut) return false;
    const re = new RegExp(lex.defaut.source, "giu");
    for (const m of prop.matchAll(re)) if (!lex.absenceDeDefaut.test(prop.slice(0, m.index))) return true;
    return false;
  };

  /** Pourquoi une proposition tombe (null = elle reste). */
  const motifDe = (prop, contexte, index, phraseADefaut = false) => {
    for (const a of lex.affirmations) if (a.re.test(prop) && !a.source.test(source)) return `${a.motif} « ${a.re.exec(prop)[0].trim()} »`;
    if (lex.test.test(prop) && !lex.negation.test(prop) && !testReussiDansSource) return `test « ${lex.test.exec(prop)[0]} »`;
    if (!phraseADefaut && !porteUnDefaut(prop)) {
      for (const el of elementsNommes(prop, langue)) if (!groupesSource.has(el.groupe)) return `élément « ${el.mot} »`;
      for (const ed of editions) if (ed.test(prop) && !ed.test(source)) return `édition « ${ed.exec(prop)[0].trim()} »`;
    }
    if (etatConnu === null) {
      const palier = etatAffirmeParLeTexte(prop);
      if (palier && !paliersSource.has(palier) && !etatDUnePartie(contexte, index, langue)) return `état « ${palier} » (état inconnu)`;
    }
    return null;
  };

  const retires = [];
  const lignes = original.split("\n").map((ligne) => {
    if (!ligne.trim()) return ligne;
    const puce = PUCE.exec(ligne)[0];
    const corps = ligne.slice(puce.length);
    if (!corps.trim()) return ligne;
    const phrases = corps.split(/(?<=[.!?…])\s+/);
    const gardees = [];
    let touchee = false;
    for (const phrase of phrases) {
      const fin = /[.!?…]+$/.exec(phrase)?.[0] ?? "";
      const coeur = fin ? phrase.slice(0, -fin.length) : phrase;
      const props = coeur.split(/,\s*/);
      // Une phrase qui dit un défaut garde ses noms d'éléments (le défaut ne disparaît jamais avec eux).
      const phraseADefaut = porteUnDefaut(coeur);
      let pos = 0;
      const restent = [];
      for (const p of props) {
        const motif = p.trim() ? motifDe(p, coeur, pos + p.length, phraseADefaut) : null;
        if (motif) { retires.push({ segment: p.trim(), motif }); touchee = true; } else restent.push(p);
        pos += p.length + 2;
      }
      const vides = restent.every((p) => !p.trim());
      // La première proposition porte le sujet (« Disque : excellent état, sans rayure ») : elle tombée, la phrase
      // entière tombe — jamais un morceau orphelin (« Sans rayure. ») qui ne dit plus de quoi il parle.
      if (vides || restent[0] !== props[0]) continue;
      if (restent.length === props.length) { gardees.push(phrase); continue; }
      let r = restent.map((p) => p.trim()).filter(Boolean).join(", ");
      if (/^\p{Lu}/u.test(coeur.trim()) && /^\p{Ll}/u.test(r)) r = r.charAt(0).toUpperCase() + r.slice(1);
      gardees.push(r + fin);
    }
    if (!touchee) return ligne;
    return gardees.length ? `${puce}${gardees.join(" ")}` : null;
  }).filter((l) => l !== null);

  if (!retires.length) return { texte: original, retires: [], modifie: false };
  // Une rubrique vidée (« État : » sans rien dessous) tombe aussi.
  const estRubrique = (l) => /:\s*$/.test(String(l ?? "").replace(PUCE, "").trim());
  const sansRubriquesVides = lignes.filter((l, i) => {
    if (!estRubrique(l)) return true;
    const suivante = lignes.slice(i + 1).find((x) => x.trim());
    return suivante !== undefined && !estRubrique(suivante);
  });
  const reconstruit = sansRubriquesVides.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!reconstruit) return { texte: original, retires: [], modifie: false };
  return { texte: reconstruit, retires, modifie: reconstruit !== original };
}
