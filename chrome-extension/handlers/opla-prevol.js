// ═══════════════════════════════════════════════════════════════════════════
// OPLA — PRÉ-VOL : LA SEULE GARDE QUI EXISTE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI CE FICHIER EXISTE (mesuré le 2026-09-14, lot 1) :
//
//     PATCH {"category":"CATEGORIE_QUI_NEXISTE_PAS"}        → 200, ACCEPTÉ ET ÉCRIT
//     PATCH {"metadata":{"sizes":["75A"]}} sur une robe      → 200, ACCEPTÉ ET ÉCRIT
//
// Le serveur Opla ne valide NI la catégorie, NI la taille contre la grille de
// la catégorie. Une faute de mapping ne rend donc pas d'erreur : elle produit
// une annonce SILENCIEUSEMENT MORTE — rangée dans une catégorie qui n'existe
// pas, introuvable en navigation comme en recherche, et parfaitement
// « publiée » de notre point de vue. Aucun code HTTP ne nous préviendra, aucune
// plateforme ne nous rattrapera.
//
//   ⇒ Ce pré-vol REFUSE AVANT L'ENVOI, jamais après.
//   ⇒ Un pré-vol qui échoue = le job NE PART PAS et remonte needs_user.
//      Jamais de publication à l'aveugle.
//
// ⚠️ LE PIÈGE DES TAILLES, à ne pas sous-estimer : la liste plate d'Opla compte
// 150 entrées pour 143 codes UNIQUES — `TAILLE_UNIQUE`, `XS`, `S`, `M`, `L`,
// `XL`, `XXL` y figurent DEUX FOIS, dans deux grilles différentes. Tester
// « ce code existe-t-il quelque part ? » est donc FAUX : `75A` est un code
// parfaitement valide… pour les soutiens-gorge, pas pour une robe. On teste
// l'appartenance À LA GRILLE DE CETTE FEUILLE, jamais autre chose.
//
// Ce module est PUR : aucune requête, aucun DOM, aucun effet. Il prend un
// référentiel en entrée et rend un verdict. C'est ce qui le rend testable —
// cf. scripts/opla-prevol-selftest.mjs, qui le passe contre les cas qui nous
// ont réellement piégés.
//
// Publié sur `globalThis`, et rien d'autre. C'est le monde isolé du content
// script côté Chrome, et le global du module ESM côté Node (le dépôt est en
// "type":"module") : le selftest tourne donc sur EXACTEMENT ce fichier-là.
// ⛔ Ne pas réintroduire de branche `module.exports` : `module` n'existe pas
//    dans le monde d'un content script, et scripts/content-scripts-selftest.mjs
//    le refuse — à raison.
// ═══════════════════════════════════════════════════════════════════════════

(function (racine, fabrique) {
  Object.assign(racine, fabrique());
})(globalThis, function () {
  "use strict";

  // ── Bornes, toutes OBSERVÉES sauf une, signalée comme telle ───────────────
  const OPLA_PRIX_MAX_CENTIMES = 100000; // ✅ refus serveur : price_too_high, maxCents 100000
  const OPLA_TITRE_MAX = 80;             // ✅ maxlength observé (mais NON imposé : on tronque)
  const OPLA_DESCRIPTION_MAX = 2000;     // ✅ idem
  const OPLA_PHOTOS_MAX = 20;            // ✅ mesuré : 22 posées → 20 retenues EN SILENCE
  const OPLA_PHOTOS_MIN = 1;             // ✅ « Une image est requise au minimum. »

  // ⚠️ DÉCISION, PAS UNE OBSERVATION. Opla n'annonce aucun prix plancher et
  // accepte 0,50 €. Ce plancher est à NOUS : il existe pour qu'une erreur de
  // parsing (centimes pris pour des euros, virgule perdue) ne parte pas en
  // ligne. Le 14/09 une annonce de test est partie à 0,50 € faute de cette
  // borne. Valeur à confirmer par Nico.
  const OPLA_PRIX_MIN_CENTIMES = 100; // 1,00 €

  const MOTIFS = Object.freeze({
    CATEGORIE_ABSENTE: "opla_categorie_absente",
    CATEGORIE_INCONNUE: "opla_categorie_inconnue",
    CATEGORIE_PAS_UNE_FEUILLE: "opla_categorie_pas_une_feuille",
    TAILLE_REQUISE: "opla_taille_requise",
    TAILLE_HORS_GRILLE: "opla_taille_hors_grille",
    TAILLE_INATTENDUE: "opla_taille_inattendue",
    MARQUE_ABSENTE: "opla_marque_absente",
    ETAT_ABSENT: "opla_etat_absent",
    ETAT_INCONNU: "opla_etat_inconnu",
    PRIX_ABSENT: "opla_prix_absent",
    PRIX_TROP_HAUT: "opla_prix_trop_haut",
    PRIX_TROP_BAS: "opla_prix_trop_bas",
    TITRE_ABSENT: "opla_titre_absent",
    PHOTOS_ABSENTES: "opla_photos_absentes",
    PHOTOS_TROP_NOMBREUSES: "opla_photos_trop_nombreuses",
  });

  // ✅ les 5 codes d'état, relevés ET confirmés par le serveur, qui les
  // énumère lui-même dans son refus de schéma.
  const OPLA_ETATS = Object.freeze(["new-with-tags", "new", "like-new", "good", "fair"]);

  const refus = (motif, message, champ) => ({ ok: false, motif, message, champ });

  /**
   * Pré-vol COMPLET. Pur : aucune requête, aucun DOM.
   *
   * @param {object} job  { title, description, price, photos:[], platform_fields:{…} }
   * @param {object} ref  référentiel :
   *   { feuilles: Set<string>,        codes de feuilles connus (886)
   *     noeuds:   Set<string>,        TOUS les codes connus (1014) — pour distinguer
   *                                   « inconnue » de « nœud intermédiaire »
   *     grillePour: (code) => string[]|null   grille de CETTE feuille, ou null si la
   *                                   catégorie n'a pas de champ Taille }
   * @returns {{ok:true, corps:object} | {ok:false, motif, message, champ}}
   */
  function oplaPrevol(job, ref) {
    const pf = (job && job.platform_fields) || {};

    // ── 1. TITRE ────────────────────────────────────────────────────────────
    const titre = String(job && job.title != null ? job.title : "").trim();
    if (!titre) return refus(MOTIFS.TITRE_ABSENT, "Opla exige un titre.", "title");

    // ── 2. PHOTOS — comptées par NOUS, l'excédent étant jeté en silence ─────
    const photos = Array.isArray(job && job.photos) ? job.photos.filter(Boolean) : [];
    if (photos.length < OPLA_PHOTOS_MIN) {
      return refus(MOTIFS.PHOTOS_ABSENTES, "Opla exige au moins une photo.", "photos");
    }
    if (photos.length > OPLA_PHOTOS_MAX) {
      return refus(
        MOTIFS.PHOTOS_TROP_NOMBREUSES,
        `Opla n'accepte que ${OPLA_PHOTOS_MAX} photos ; l'article en a ${photos.length}. ` +
        `Au-delà, Opla les jette SANS message : on refuse plutôt que de perdre les dernières.`,
        "photos",
      );
    }

    // ── 3. CATÉGORIE — la garde qui n'existe que chez nous ──────────────────
    const code = pf.oplaCategoryCode;
    if (!code) return refus(MOTIFS.CATEGORIE_ABSENTE, "Aucune catégorie Opla n'a été résolue pour cet article.", "category");
    if (!ref.noeuds.has(code)) {
      return refus(
        MOTIFS.CATEGORIE_INCONNUE,
        `La catégorie Opla « ${code} » n'existe pas dans l'arbre. ` +
        `Opla l'accepterait en 200 et l'annonce serait invisible : on refuse.`,
        "category",
      );
    }
    if (!ref.feuilles.has(code)) {
      return refus(
        MOTIFS.CATEGORIE_PAS_UNE_FEUILLE,
        `« ${code} » est un nœud intermédiaire de l'arbre Opla, pas une feuille. ` +
        `Seules les feuilles sont déposables.`,
        "category",
      );
    }

    // ── 4. TAILLE — appartenance À LA GRILLE DE CETTE FEUILLE ───────────────
    // ⛔ jamais « ce code existe-t-il dans la liste plate ? » : 7 codes sont
    //    partagés entre deux grilles (cf. bandeau).
    const grille = ref.grillePour(code);
    const taille = pf.taille ? String(pf.taille) : null;
    if (grille && grille.length) {
      if (!taille) {
        return refus(MOTIFS.TAILLE_REQUISE, `La catégorie « ${code} » exige une taille.`, "size");
      }
      if (grille.indexOf(taille) === -1) {
        return refus(
          MOTIFS.TAILLE_HORS_GRILLE,
          `La taille « ${taille} » n'appartient pas à la grille de « ${code} » ` +
          `(${grille.length} valeurs : ${grille.slice(0, 6).join(", ")}…). ` +
          `Opla l'accepterait en 200 : on refuse.`,
          "size",
        );
      }
    } else if (taille) {
      // grille absente ⇒ pas de champ Taille ⇒ on n'envoie RIEN (on ne refuse
      // pas le job pour autant : on omet, et on le dit dans le verdict)
      return { ok: true, avertissement: MOTIFS.TAILLE_INATTENDUE, corps: construire(job, pf, photos, titre, null) };
    }

    // ── 5. MARQUE — obligatoire (« La marque est obligatoire. ») ────────────
    const marque = pf.marque ? String(pf.marque).trim() : "";
    if (!marque) return refus(MOTIFS.MARQUE_ABSENTE, "Opla exige une marque (champ libre, mais obligatoire).", "brand");

    // ── 6. ÉTAT ─────────────────────────────────────────────────────────────
    if (!pf.etat) return refus(MOTIFS.ETAT_ABSENT, "Opla exige un état.", "condition");
    if (OPLA_ETATS.indexOf(String(pf.etat)) === -1) {
      return refus(MOTIFS.ETAT_INCONNU, `État Opla inconnu : « ${pf.etat} ». Admis : ${OPLA_ETATS.join(", ")}.`, "condition");
    }

    // ── 7. PRIX ─────────────────────────────────────────────────────────────
    const centimes = Math.round(Number(job.price) * 100);
    if (!Number.isFinite(centimes) || centimes <= 0) {
      return refus(MOTIFS.PRIX_ABSENT, "Opla exige un prix.", "price");
    }
    if (centimes > OPLA_PRIX_MAX_CENTIMES) {
      return refus(
        MOTIFS.PRIX_TROP_HAUT,
        `Opla plafonne les annonces à ${OPLA_PRIX_MAX_CENTIMES / 100} € ; ` +
        `celle-ci est à ${(centimes / 100).toFixed(2)} €.`,
        "price",
      );
    }
    if (centimes < OPLA_PRIX_MIN_CENTIMES) {
      return refus(
        MOTIFS.PRIX_TROP_BAS,
        `Prix de ${(centimes / 100).toFixed(2)} € sous notre plancher de ` +
        `${(OPLA_PRIX_MIN_CENTIMES / 100).toFixed(2)} € — presque toujours une erreur de conversion. ` +
        `Refusé avant envoi.`,
        "price",
      );
    }

    return { ok: true, corps: construire(job, pf, photos, titre, taille) };
  }

  // Corps du POST — forme OBSERVÉE au lot 1 (201 Created).
  // ⛔ un champ vide ne s'envoie PAS (on omet la clé) ; categoriesPath ne
  //    s'envoie PAS (le serveur le calcule).
  function construire(job, pf, photos, titre, taille) {
    const corps = { title: titre.slice(0, OPLA_TITRE_MAX) };
    const d = String(job.description == null ? "" : job.description).trim().slice(0, OPLA_DESCRIPTION_MAX);
    if (d) corps.description = d;
    corps.priceCents = Math.round(Number(job.price) * 100);
    corps.images = photos.slice(0, OPLA_PHOTOS_MAX);
    corps.category = pf.oplaCategoryCode;
    corps.brand = String(pf.marque).trim();
    corps.condition = pf.etat;
    const meta = {};
    if (taille) meta.sizes = [taille];
    const couleurs = (pf.couleurs || []).filter(Boolean);
    const matieres = (pf.matieres || []).filter(Boolean);
    if (couleurs.length) meta.colors = couleurs;
    if (matieres.length) meta.materials = matieres;
    if (Object.keys(meta).length) corps.metadata = meta;
    return corps;
  }

  return {
    oplaPrevol,
    OPLA_PREVOL_MOTIFS: MOTIFS,
    OPLA_ETATS,
    OPLA_BORNES: Object.freeze({
      OPLA_PRIX_MAX_CENTIMES, OPLA_PRIX_MIN_CENTIMES,
      OPLA_TITRE_MAX, OPLA_DESCRIPTION_MAX,
      OPLA_PHOTOS_MAX, OPLA_PHOTOS_MIN,
    }),
  };
});
