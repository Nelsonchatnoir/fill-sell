// ═══════════════════════════════════════════════════════════════════════════
// COMPLÉTER UN JOB OPLA DEPUIS LA FICHE DE L'ARTICLE
// ═══════════════════════════════════════════════════════════════════════════
// Ce code vivait dans le corps d'une boucle de get-pending-jobs (4700 lignes,
// un `serve()` au bout). Il en sort le 2026-09-20 SANS UNE LIGNE DE LOGIQUE
// CHANGÉE, pour une seule raison : il n'était pas exécutable par un selftest.
//
// ⛔ ET C'EST EXACTEMENT LÀ QUE LE DÉFAUT DU SOIR S'EST LOGÉ. Chaque morceau
// marchait — la table femme rendait bien « 38 → M », la cascade rendait bien
// WOM_DRE_OTHER — mais leur CHAÎNAGE ne tournait nulle part : la taille se
// normalise contre la grille de la FEUILLE, la feuille venait de la réponse de
// la personne, et cette réponse n'était jamais posée sur le job. Trois
// fonctions vertes, une chaîne rouge. On teste désormais la chaîne.
//
// ⛔ AUCUNE DÉCISION DE DÉPÔT ICI. On complète ce que la fiche sait déjà ; le
// pré-vol de l'extension reste la seule garde.
// ═══════════════════════════════════════════════════════════════════════════
import { oplaChemin, oplaNoeud } from "./opla-catalogue.ts";
import { cheminLisible, cleFourche, normaliserTailleOpla, optionsFeuilles, resoudreCategorieOpla } from "./opla-resolution.ts";
import { genreDeLEtagereVinted } from "./vinted-branche.ts";

/** Une réponse déjà donnée par la personne, rangée par QUESTION (cf. `cleFourche`). */
export type OplaMem = { code: string; titre: string; options: string[]; mot: string | null; le: string };

export interface CompletionOpla {
  /** Ce qui a été posé, et d'où ça vient — recopié dans `pf.opla_deduit`. */
  trace: Record<string, unknown>;
  /** La réponse fraîche à ranger dans le compte, s'il vient d'en donner une. */
  aRetenir: { cle: string; entree: OplaMem } | null;
  /** Ce qu'il y aurait eu à journaliser — l'appelant décide quoi en faire. */
  journal: string[];
}

// { v, at, source } (écriture actuelle) ou la chaîne nue des lignes
// anciennes — la chaîne nue n'a pas de source, on ne la retient pas.
const valeurCertaine = (attrs: Record<string, unknown> | undefined, cle: string): { v: string; source: string } | null => {
  const e = attrs?.[cle];
  if (!e || typeof e !== "object") return null;
  const v = String((e as Record<string, unknown>).v ?? "").trim();
  const source = String((e as Record<string, unknown>).source ?? "");
  if (!v || !/^(capture|vinted|releve)/.test(source)) return null;
  return { v, source };
};
const GENRE_RAYON: Record<string, string> = {
  GIRLS_NEW: "Fille", BOYS_NEW: "Garçon",
};
const genreDeLaBranche = (code: string): { genre: string; via: string } | null => {
  if (!code || !oplaNoeud(code)) return null;
  // On remonte jusqu'à la racine en gardant le dernier rayon traversé.
  let c: string | null = code;
  let rayon = code;
  for (let n = 0; c && n < 12; n++) {
    const noeud = oplaNoeud(c);
    if (!noeud?.parent) break;
    rayon = c;
    c = noeud.parent;
  }
  const racine = c ?? "";
  if (racine === "MENS") return { genre: "Homme", via: "racine Hommes" };
  if (racine === "WOMEN_ROOT") return { genre: "Femme", via: "racine Femmes" };
  if (racine === "CHILDREN_NEW" && GENRE_RAYON[rayon]) {
    return { genre: GENRE_RAYON[rayon], via: `rayon ${oplaNoeud(rayon)?.titre ?? rayon}` };
  }
  return null; // racine non genrée : on ne pose rien
};


// La clé vit dans _shared/opla-resolution.ts (`cleFourche`) : la pose
// et la relecture DOIVENT la calculer pareil, sinon la mémoire ne se
// retrouve jamais elle-même. Un selftest la verrouille.
const optionsDuJob = (pf: Record<string, unknown>): Array<{ code: string; title: string }> => {
  const ask = pf.oplaCategoryAsk;
  const brut = (ask && typeof ask === "object") ? (ask as Record<string, unknown>).options : null;
  if (!Array.isArray(brut)) return [];
  return brut
    .map((o) => {
      const e = (o && typeof o === "object") ? (o as Record<string, unknown>) : {};
      return { code: String(e.code ?? "").trim(), title: String(e.title ?? "").trim() };
    })
    .filter((o) => o.code && o.title);
};
// ⚠️ Un job en needs_user ne porte pas de réponse fraîche et n'est pas
//    exécuté : ni récolte ni rejeu dessus. Les jobs déjà en attente se
//    débloquent par le chemin normal, jamais par cette mémoire.

/**
 * Complète `pf` EN PLACE (la catégorie, puis le genre, la taille et le reste).
 * `memoire` est lue ET écrite : une réponse récoltée sur un job sert aux
 * suivants du même lot, comme dans la boucle d'origine.
 */
export function completerJobOpla(
  { id, statut, pf, attrs, titre = null, memoire = new Map<string, OplaMem>() }: {
    id: unknown;
    statut: unknown;
    pf: Record<string, unknown>;
    attrs?: Record<string, unknown>;
    titre?: string | null;
    memoire?: Map<string, OplaMem>;
  },
): CompletionOpla {
  const journal: string[] = [];
  let aRetenir: { cle: string; entree: OplaMem } | null = null;
  const trace: Record<string, unknown> = {};
  const vivant = String(statut ?? "") !== "needs_user";

  // ── LA RÉCOLTE : IL VIENT DE RÉPONDRE, ON RETIENT ─────────────────
  // Trois conditions, toutes nécessaires :
  //   · `oplaCategoryChoice` présent = réponse FRAÎCHE, pas encore
  //     consommée par l'extension (elle la met à null au passage
  //     suivant) — c'est notre unique fenêtre ;
  //   · `needsUserResolved.oplaCategoryChoice` = c'est bien LUI qui a
  //     tranché (l'app l'écrit au geste « ✋ Compléter »), pas nous ;
  //   · la réponse est l'un des LIBELLÉS de la liste montrée, sinon on
  //     ne sait pas de quelle feuille il parle. C'est ce troisième
  //     point qui écarte les réponses de l'ancienne forme — « Hommes »,
  //     « Accessoires », « Vêtements », relevées en base sur 6 des 7
  //     réponses du parc : des choix de NIVEAU, pas de feuille. Les
  //     rejouer serait répondre à une autre question que celle posée.
  if (vivant) {
    const choix = String(pf.oplaCategoryChoice ?? "").trim();
    const res = (pf.needsUserResolved && typeof pf.needsUserResolved === "object")
      ? (pf.needsUserResolved as Record<string, unknown>) : null;
    const tranche = String(res?.["oplaCategoryChoice"] ?? "").trim();
    const posees = optionsDuJob(pf);
    if (choix && tranche && posees.length > 1) {
      const dit = posees.find((o) => o.title.toLowerCase() === choix.toLowerCase());
      if (dit && oplaNoeud(dit.code)?.feuille) {
        // ── SA RÉPONSE S'APPLIQUE À CE JOB, ICI ET MAINTENANT ───────
        // ⛔ ELLE NE SE RECALCULE PAS. Le serveur ne mémorisait que la
        //    réponse et laissait l'extension la traduire en code : il
        //    repartait donc de zéro sur CE job, `oplaCategoryCode`
        //    vide, et re-posait la question. Mesuré sur le job
        //    ac1e01de (meminiandmove, 20/09, « Robe rouge Oh Polly ») :
        //    l'extension avait posé DEUX feuilles, la personne avait
        //    répondu « Femmes › Vêtements › Robes › Autres robes », et
        //    à 20:11:27 le serveur a réécrit une question de TREIZE
        //    feuilles par-dessus — autre liste, donc autre clé, donc
        //    mémoire introuvable, et la réponse jetée.
        // ⚠️ ET C'EST CE QUI FAISAIT ÉCHOUER LA TAILLE. La grille se
        //    lit sur LA FEUILLE : sans code posé ici, le bloc taille
        //    plus bas ne tourne pas, « 38 » partait tel quel, et la
        //    table femme (38 = M) — corrigée le 20/09 côté serveur
        //    justement pour atteindre tous les builds — n'était JAMAIS
        //    appelée. Le pré-vol de l'extension 0.6.47, lui, ne l'a
        //    pas. D'où un refus sur une correction déjà livrée.
        const avantChoix = String(pf.oplaCategoryCode ?? "").trim() || null;
        pf.oplaCategoryCode = dit.code;
        pf.oplaCategoryPath = oplaChemin(dit.code);
        trace.oplaCategoryCode = {
          valeur: dit.code, avant: avantChoix,
          source: `votre réponse à la question posée (${posees.length} feuilles)`,
        };
        const cle = cleFourche(posees);
        const e: OplaMem = {
          code: dit.code, titre: dit.title,
          options: posees.map((o) => o.title),
          mot: String(pf.categorie_objet_ia ?? "").trim() || null,
          le: new Date().toISOString(),
        };
        aRetenir = { cle, entree: e };   // la plus récente gagne : il a le droit de changer d'avis
        memoire.set(cle, e);    // …et elle sert dès CE passage aux autres jobs du lot
        journal.push(`[get-pending-jobs] mémoire catégories Opla ${String(id).slice(0, 8)} : réponse retenue « ${dit.title} » pour la question ${cle} — et posée sur ce job`);
      } else if (!dit) {
        journal.push(`[get-pending-jobs] mémoire catégories Opla ${String(id).slice(0, 8)} : réponse « ${choix} » hors de la liste posée — laissée à l'extension, jamais mémorisée`);
      }
    }
  }

  // ── LE GENRE EST DÉJÀ CHEZ NOUS : VINTED L'A RANGÉ (2026-09-20) ───
  // MESURE, ce soir, sur les cinq dépôts de meminiandmove à 20:03-20:07 :
  // le Polo et le T-shirt portaient genre « Homme » et sont PASSÉS ; la
  // robe rouge, la robe champagne et le pantalon Sandro portaient genre
  // « » et ont échoué. Un seul champ les sépare — pas la plateforme,
  // pas le compte, pas la minute. Et la cascade le dit elle-même :
  // « 2 rayons possibles (Femmes, Enfants) et aucun genre connu ».
  // Elle a raison de ne pas deviner ; c'est de ne pas SAVOIR qui est le
  // défaut.
  //
  // ⛔ CE N'EST PAS UNE DÉDUCTION. L'article vient du dressing Vinted :
  //    il porte le catalog_id de l'étagère où SON VENDEUR l'a rangé,
  //    relevé chez Vinted (`attributs.categorie_vinted`, source
  //    « vinted_* »). 178 = « Femmes › Vêtements › Robes › Mini ». On
  //    lit le nom du rayon, on ne l'invente pas — même doctrine que
  //    `valeurCertaine` juste au-dessus : une valeur ne vaut que par sa
  //    source. Un titre, une icône, un mot d'IA n'entrent pas ici.
  // ⛔ IL N'ÉCARTE JAMAIS, IL N'AJOUTE QUE. Un identifiant hors des
  //    racines genrées (Maison, Sport, Électronique…) rend null, et
  //    tout se passe comme avant. Mesuré sur les 172 jobs Opla des
  //    30 derniers jours : 117 catégories résolues → 125, zéro perdue,
  //    zéro changée.
  if (!String(pf.genre ?? "").trim() && !valeurCertaine(attrs, "genre")) {
    const g = genreDeLEtagereVinted(attrs?.categorie_vinted);
    if (g) {
      pf.genre = g.genre;
      trace.genre = { valeur: g.genre, avant: null, source: `catégorie Vinted de l'article (${g.via})` };
    }
  }

  // ── LA CATÉGORIE D'ABORD : TOUT LE RESTE EN DÉPEND (2026-09-18) ────
  // Mesure de Nico : la chemise H&M a une catégorie résolue et tout est
  // posé ; la robe Maje n'en a pas et rien ne l'est. Le genre se déduit
  // de la BRANCHE (genreDeLaBranche, juste en dessous) et la taille se
  // valide contre la grille de LA FEUILLE : sans catégorie, les deux
  // sont impossibles. On la résout donc ICI, avant eux.
  //
  // ⚠️ LES MOTS. L'extension cherche la feuille avec
  // `categorie_objet_ia` et `categorie_mot_cle_titre` — mais ces deux
  // champs ne sont posés QUE par le stepper (ListingPreviewScreen).
  // Un job créé depuis le Stock arrive donc SANS aucun mot, la
  // recherche ne rend rien et la descente s'arrête sur un nœud : c'est
  // la deuxième porte vers « on propose un nœud puis on le refuse ». On
  // ajoute le TITRE de l'article en dernier recours — la recherche est
  // conservatrice (trois passes, plafond, et il faut que le libellé de
  // la feuille soit entièrement contenu dans le mot), elle ne fabrique
  // pas de correspondance à partir d'un titre bavard.
  // ⚠️ ON RE-RÉSOUT AUSSI QUAND LE CODE N'EST PAS UNE FEUILLE. Le job
  //    eba8a512 porte oplaCategoryCode = MEN_TOPS_T_SHIRTS — un NŒUD,
  //    choisi par l'utilisateur dans une liste qui n'aurait jamais dû le
  //    lui proposer. Un nœud n'est pas déposable : ce n'est pas une
  //    catégorie, c'est une réponse à une mauvaise question. On le
  //    reprend comme point de départ, et si la branche est une impasse
  //    la résolution repart des racines toute seule.
  const codeCourant = String(pf.oplaCategoryCode ?? "").trim();
  if (!codeCourant || !oplaNoeud(codeCourant)?.feuille) {
    // ⚠️ LE TITRE PASSE PAR SON PROPRE PARAMÈTRE (2026-09-20). Versé
    //    dans `mots`, il jouait à égalité avec les mots-objets — et un
    //    titre est bavard. Job 9cb681ba : mot-objet « briques de
    //    construction » (aucune feuille), titre « Lego friends l'aire
    //    de jeux des bébés chiens » → le Lego est parti dans
    //    « Maison › Animaux › Chiens ». `resoudreCategorieOpla` ne le
    //    lit maintenant que si les mots-objets n'ont rien donné.
    const mots = [pf.categorie_objet_ia, pf.categorie_mot_cle_titre]
      .map((m) => String(m ?? "").trim()).filter(Boolean);
    const titreArticle = String(titre ?? "").trim() || null;
    const genreConnu = String(pf.genre ?? "").trim() || valeurCertaine(attrs, "genre")?.v || null;
    const r = resoudreCategorieOpla({ mots, titre: titreArticle, depart: codeCourant || null, genre: genreConnu });
    if (r.code) {
      pf.oplaCategoryCode = r.code;
      trace.oplaCategoryCode = { valeur: r.code, avant: codeCourant || null, source: `arbre Opla → ${cheminLisible(r.code)}` };
    } else if (r.candidats.length) {
      const options = optionsFeuilles(r.candidats);
      const cle = cleFourche(options);
      const deja = vivant ? memoire.get(cle) : undefined;
      // ── IL A DÉJÀ TRANCHÉ CETTE QUESTION-LÀ ────────────────────────
      // ⛔ La garde qui rend ce rejeu honnête : la feuille mémorisée
      //    doit être l'un des candidats D'AUJOURD'HUI. La clé le
      //    garantit déjà (même ensemble de codes), on le vérifie quand
      //    même — c'est l'invariant, il doit être lisible dans le code
      //    et pas seulement dans un commentaire.
      if (deja && r.candidats.some((f) => f.code === deja.code)) {
        pf.oplaCategoryCode = deja.code;
        trace.oplaCategoryCode = {
          valeur: deja.code, avant: codeCourant || null,
          source: `mémoire du compte — votre réponse du ${deja.le.slice(0, 10)} à cette même question (${options.length} feuilles : ${cle})`,
        };
      } else {
        // ⛔ ON NE PROPOSE QUE DES FEUILLES. C'est la règle : si seules
        //    les feuilles sont déposables, seules les feuilles
        //    apparaissent dans la liste. L'extension relit
        //    `oplaCategoryAsk` en PRIORITÉ ABSOLUE (opla.js:706-712) et
        //    accepte le code qu'elle y trouve — donc une feuille profonde
        //    répond en UN geste, là où on brûlait trois paliers.
        pf.oplaCategoryAsk = { ancre: null, options, le: new Date().toISOString() };
        trace.oplaCategoryAsk = {
          valeur: `${r.candidats.length} feuilles`, avant: null,
          source: `arbre Opla — question posée sur des feuilles (${r.etapes.at(-1) ?? "ambiguïté"})`,
        };
      }
    }
  }

  for (const cle of ["taille", "couleur", "matiere", "etat", "marque"]) {
    if (String(pf[cle] ?? "").trim()) continue;
    const t = valeurCertaine(attrs, cle);
    if (!t) continue;
    pf[cle] = t.v;
    trace[cle] = { valeur: t.v, avant: null, source: `inventaire.attributs.${cle} (${t.source})` };
  }

  // ── LA TAILLE, NORMALISÉE AVANT D'ÊTRE REFUSÉE ────────────────────
  // « L / 40 / 12 » est du format composé Vinted ; la grille Opla attend
  // « L ». La valeur est JUSTE, c'est le format qui ne l'est pas — et le
  // pré-vol compare en égalité stricte (opla-prevol.js:229).
  // ⛔ Pas de correspondance ⇒ ON NE TOUCHE À RIEN. On ne retire pas la
  //    taille (elle reste lisible dans le message du pré-vol) et on ne
  //    met JAMAIS la plus proche : « 59 cm » → « 1-3 mois » est
  //    exactement l'erreur qu'on a déjà payée côté Vinted.
  {
    const feuille = String(pf.oplaCategoryCode ?? "").trim();
    const brute = String(pf.taille ?? "").trim();
    if (feuille && brute) {
      const norm = normaliserTailleOpla(feuille, brute);
      if (norm && norm !== brute) {
        pf.taille = norm;
        trace.taille = { valeur: norm, avant: brute, source: `grille Opla de ${cheminLisible(feuille)}` };
      }
    }
  }

  if (!String(pf.genre ?? "").trim()) {
    const g = genreDeLaBranche(String(pf.oplaCategoryCode ?? "").trim());
    if (g) {
      pf.genre = g.genre;
      trace.genre = { valeur: g.genre, avant: null, source: `branche de la catégorie Opla (${g.via})` };
    }
  }
  if (Object.keys(trace).length) {
    pf.opla_deduit = { ...trace, le: new Date().toISOString(), pose_par: "get-pending-jobs (fiche de l'article + branche de catégorie)" };
    journal.push(`[get-pending-jobs] Opla ${String(id).slice(0, 8)} : ${Object.entries(trace).map(([k, v]) => `${k} ← « ${(v as Record<string, unknown>).valeur} » (${(v as Record<string, unknown>).source})`).join(" ; ")}`);
  }
  return { trace, aRetenir, journal };
}
