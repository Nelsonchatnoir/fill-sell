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

  // ✅ DÉCISION DE NICO, PRISE LE 2026-09-16 : le plancher Opla est 1,00 €.
  // Ce n'est pas une observation — Opla n'annonce aucun plancher et accepte
  // 0,50 € (une annonce de test y est partie le 14/09, faute de cette borne).
  // C'est NOTRE garde contre l'erreur de parsing : centimes pris pour des
  // euros, virgule perdue. La valeur n'est plus « à confirmer ».
  const OPLA_PRIX_MIN_CENTIMES = 100; // 1,00 €

  // ── ✅ SEUIL DE PROFIL VÉRIFIÉ — mesuré au lot A (2026-09-16) ─────────────
  // Opla refuse en 403 toute annonce à PLUS de 300 €, création directe comme
  // mise en ligne d'un brouillon, tant que le profil n'est pas vérifié :
  //   403 {"error":"phone_verification_required","reason":"high_value_listing",
  //        "thresholdCents":30000,
  //        "message":"Seuls les articles à plus de 300 € demandent un profil vérifié. …"}
  // Le lot 2 avait attribué ce 403 à la TRANSITION draft → available : c'était
  // faux, il ne tient qu'au prix (docs/OPLA_VENTE.md § 4).
  //
  // ✅ DÉCISION DE NICO (2026-09-16) : c'est un REFUS DE PRÉ-VOL, au même titre
  // que le plafond de 1 000 €. Le lot A en avait fait un simple avertissement,
  // au motif que le seuil ne joue que pour un profil NON vérifié et que le
  // pré-vol, étant pur, ne sait pas si CE vendeur l'est ; Nico a tranché
  // l'inverse, et c'est appliqué tel quel. Conséquence assumée, écrite ici pour
  // qu'elle ne se redécouvre pas : un vendeur au profil VÉRIFIÉ ne pourra pas
  // publier au-dessus de 300 € sur Opla tant que le pré-vol ne saura pas lire
  // son statut. Le jour où ça gênera, le correctif est de lui passer
  // `profilVerifie`, pas de relâcher la borne.
  // Ce qui reste vrai, et qui motive le refus : l'envoi coûte le montage des
  // photos AVANT le POST — un 403 les gaspille toutes.
  const OPLA_SEUIL_PROFIL_VERIFIE_CENTIMES = 30000; // 300,00 €

  const MOTIFS = Object.freeze({
    CATEGORIE_ABSENTE: "opla_categorie_absente",
    CATEGORIE_INCONNUE: "opla_categorie_inconnue",
    CATEGORIE_PAS_UNE_FEUILLE: "opla_categorie_pas_une_feuille",
    TAILLE_REQUISE: "opla_taille_requise",
    TAILLE_HORS_GRILLE: "opla_taille_hors_grille",
    TAILLE_INATTENDUE: "opla_taille_inattendue",
    // ── AVERTISSEMENTS (lot 7) — jamais des refus ──────────────────────────
    // Couleur et matière sont FACULTATIVES chez Opla : une valeur qu'on ne sait
    // pas traduire ne doit pas coûter l'annonce. Mais elle ne doit pas partir
    // telle quelle non plus — le serveur l'écrirait en 200 sans broncher, et on
    // se retrouverait avec « Marine » dans un champ qui attend « NAVY »,
    // invisible partout. On JETTE la valeur et on le DIT, jamais la plus
    // proche (même doctrine que la marque Leboncoin : champ vide plutôt que
    // valeur approchée).
    COULEUR_INCONNUE: "opla_couleur_inconnue",
    MATIERE_INCONNUE: "opla_matiere_inconnue",
    // Liste indisponible (params de la feuille injoignables) : on ne peut ni
    // valider ni invalider. La valeur passe, et le doute est tracé.
    COULEURS_NON_VERIFIEES: "opla_couleurs_non_verifiees",
    MATIERES_NON_VERIFIEES: "opla_matieres_non_verifiees",
    MARQUE_ABSENTE: "opla_marque_absente",
    ETAT_ABSENT: "opla_etat_absent",
    ETAT_INCONNU: "opla_etat_inconnu",
    PRIX_ABSENT: "opla_prix_absent",
    PRIX_TROP_HAUT: "opla_prix_trop_haut",
    PRIX_TROP_BAS: "opla_prix_trop_bas",
    PRIX_PROFIL_VERIFIE: "opla_prix_exige_profil_verifie", // REFUS (décision Nico 16/09)
    TITRE_ABSENT: "opla_titre_absent",
    PHOTOS_ABSENTES: "opla_photos_absentes",
    PHOTOS_TROP_NOMBREUSES: "opla_photos_trop_nombreuses",
  });

  // ✅ les 5 codes d'état, relevés ET confirmés par le serveur, qui les
  // énumère lui-même dans son refus de schéma.
  const OPLA_ETATS = Object.freeze(["new-with-tags", "new", "like-new", "good", "fair"]);

  // `options` = ce que l'utilisateur peut CHOISIR pour débloquer, sous la forme
  // [{code,title}]. Absentes quand il n'y a rien à proposer (prix, marque,
  // photos : l'utilisateur corrige, il ne choisit pas dans une liste).
  const refus = (motif, message, champ, options) => ({
    ok: false, motif, message, champ,
    ...(Array.isArray(options) && options.length ? { options } : {}),
  });
  // ── DEMI-POINTURE SUR UNE GRILLE D'ENTIERS (2026-09-23 soir) ─────────────
  // tessy.galy, « Nike Pacific », MEN_SNEAKERS, 44.5 : la grille va de 14 à 50
  // par entiers. Le refus proposait les 37 valeurs de la grille — un choix à
  // faire défiler pour une question qui n'a que deux réponses. Quand la taille
  // est une demi-pointure absente de la grille et que ses deux voisines
  // entières y sont, on ne propose QUE ces deux-là. Jamais d'arrondi : c'est
  // la personne qui tranche, en un geste.
  const voisinesEntieres = (taille, grille) => {
    const v = String(taille ?? "").trim().replace(",", ".");
    const m = v.match(/^(\d{1,2})\.5$/);
    if (!m || !Array.isArray(grille) || !grille.length) return null;
    const bas = String(Number(m[1]));
    const haut = String(Number(m[1]) + 1);
    const codes = grille.map((g) => String(g));
    if (!codes.includes(bas) || !codes.includes(haut)) return null;
    return [bas, haut];
  };

  /**
   * Pré-vol COMPLET. Pur : aucune requête, aucun DOM.
   *
   * @param {object} job  { title, description, price, photos:[], platform_fields:{…} }
   * @param {object} ref  référentiel :
   *   { feuilles: Set<string>,        codes de feuilles connus (886)
   *     noeuds:   Set<string>,        TOUS les codes connus (1014) — pour distinguer
   *                                   « inconnue » de « nœud intermédiaire »
   *     grillePour: (code) => string[]|null   grille de CETTE feuille, ou null si la
   *                                   catégorie n'a pas de champ Taille
   *     couleursPour: (code) => {code,title}[]|null   liste de CETTE feuille (35 relevées)
   *     matieresPour: (code) => {code,title}[]|null   liste de CETTE feuille (65 relevées)
   *       ⚠️ les deux dernières sont FACULTATIVES : un référentiel qui ne les
   *       expose pas (selftest historique, params injoignables) ne fait pas
   *       échouer le pré-vol — il rend la vérification impossible, et on le dit.
   * @returns {{ok:true, corps:object, avertissements?:string[]} | {ok:false, motif, message, champ}}
   */
  function oplaPrevol(job, ref) {
    const pf = (job && job.platform_fields) || {};
    // Avertissements ACCUMULÉS, jamais un seul : depuis le lot 7 la taille
    // omise, une couleur jetée et une matière jetée peuvent arriver ensemble.
    const avertissements = [];

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
    // ⛔ CHAQUE REFUS DE CATÉGORIE PART AVEC SES OPTIONS — celles du NIVEAU QUI
    //    A ÉCHOUÉ, jamais les racines. C'est `ref.optionsNiveauEchoue`, calculé
    //    sur l'arbre LIVE que le handler vient de charger. Un référentiel qui
    //    ne l'expose pas (selftests historiques) rend simplement [] : le refus
    //    reste exact, il est seulement moins aidant.
    //    Sans ça on rejouerait le défaut Blaf69 du 16/09 : proposer les 8
    //    racines à quelqu'un dont la racine était déjà la bonne, c'est lui
    //    faire refaire le même choix pour rebuter au même endroit.
    const optionsDe = (c) => (typeof ref.optionsNiveauEchoue === "function"
      ? ref.optionsNiveauEchoue(c, pf.oplaCategoryPath ?? job.categoryPath ?? [])
      : []);
    const code = pf.oplaCategoryCode;
    if (!code) {
      return refus(
        MOTIFS.CATEGORIE_ABSENTE,
        "Aucune catégorie Opla n'a été résolue pour cet article.",
        "category", optionsDe(""),
      );
    }
    if (!ref.noeuds.has(code)) {
      return refus(
        MOTIFS.CATEGORIE_INCONNUE,
        `La catégorie Opla « ${code} » n'existe pas dans l'arbre. ` +
        `Opla l'accepterait en 200 et l'annonce serait invisible : on refuse.`,
        "category", optionsDe(code),
      );
    }
    if (!ref.feuilles.has(code)) {
      return refus(
        MOTIFS.CATEGORIE_PAS_UNE_FEUILLE,
        `« ${code} » est un nœud intermédiaire de l'arbre Opla, pas une feuille. ` +
        `Seules les feuilles sont déposables.`,
        "category", optionsDe(code),
      );
    }

    // ── 4. TAILLE — appartenance À LA GRILLE DE CETTE FEUILLE ───────────────
    // ⛔ jamais « ce code existe-t-il dans la liste plate ? » : 7 codes sont
    //    partagés entre deux grilles (cf. bandeau).
    const grille = ref.grillePour(code);
    // `oplaSizeChoice` PRIME : c'est la taille que l'utilisateur a cochée dans
    // la grille de CETTE feuille, au needs_user précédent. Elle prime sur
    // `taille` (la valeur de l'inventaire, celle qui vient d'échouer) — sans
    // quoi on lui reposerait indéfiniment la même question.
    const taille = pf.oplaSizeChoice ? String(pf.oplaSizeChoice)
      : (pf.taille ? String(pf.taille) : null);
    let tailleRetenue = taille;
    if (grille && grille.length) {
      // La grille de CETTE feuille part en options : c'est la liste exacte, ni
      // l'union des 150 entrées (qui accepterait « 90C » sur un t-shirt), ni
      // une grille déduite de la branche (elle ne l'est pas — BELTS est en G1
      // quand le reste des accessoires femme est en G0).
      const optionsTaille = grille.map((t) => ({ code: t, title: t }));
      if (!taille) {
        return refus(MOTIFS.TAILLE_REQUISE, `La catégorie « ${code} » exige une taille.`, "size", optionsTaille);
      }
      // ── TRADUIRE AVANT DE REFUSER (2026-09-20, passe 4) ─────────────────
      // 🚨 C'ÉTAIT UNE ÉGALITÉ DE CHAÎNES (`grille.indexOf(taille)`), et elle
      //    a refusé des tailles qui SONT dans la grille, écrites autrement :
      //      · « 5 ans »  contre LEGGINGS_GIRLS_NEW, qui contient `5Y`
      //        dont le titre Opla est littéralement « 5 ans » ;
      //      · « 18 mois » contre une grille qui contient `18M` = « 18 mois ».
      //    Le module qui sait traduire ça existe depuis le 18/09
      //    (_shared/tailles.js, « TRADUIRE, JAMAIS CONVERTIR ») ; il vivait
      //    côté serveur et le content script ne pouvait pas l'appeler. Il est
      //    désormais injecté avec nous (tailles-vocabulaire.js, OPLA_SCRIPTS).
      // ⛔ CE N'EST PAS UNE CONVERSION : « 5 ans » → `5Y` est la MÊME taille,
      //    deux orthographes. « 38 » → « M » resterait une conversion de
      //    système, et le module la refuse toujours.
      // ⛔ LA GARDE NE FAIBLIT PAS : si la traduction ne donne rien, on refuse
      //    exactement comme avant, avec la même liste d'options.
      // ⚠️ Repli : si le vocabulaire n'est pas là (injection partielle), on
      //    retombe sur l'égalité stricte — jamais sur « on laisse passer ».
      // ── « 38 » SUR UNE GRILLE DE LETTRES : LA TABLE FEMME, ET ELLE SEULE ──
      // Opla ne publie AUCUNE équivalence numérique (relevé du 20/09 : la
      // grille G1 écrit « XXS »… « 8XL », rien d'autre). Vinted, si :
      // /api/v2/size_groups groupe 4 écrit « M / 38 / 10 ». On lit SA table,
      // déjà relevée dans le projet depuis le 10/09.
      // ⛔ Elle ne vaut que pour la branche FEMMES : le MÊME « 38 » est une
      //    pointure ailleurs, et un « 36 » d'homme est un tour de taille.
      //    La branche se lit dans l'arbre Opla VIVANT (ref.cheminDe), pas
      //    dans platform_fields.oplaCategoryPath — absent de 64 jobs sur 159.
      const branche = typeof ref.cheminDe === "function" ? ref.cheminDe(code)?.[0] : null;
      const femmes = String(branche ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().trim() === "femmes";

      const vocab = globalThis.taillesVocabulaire;
      // ⚠️ Le module rend { valeur, motif } — `valeur` est l'option de la
      //    grille, écrite EXACTEMENT comme la grille l'écrit. Lire un autre
      //    champ donnerait « [object Object] » dans le payload.
      const traduite = typeof vocab?.tailleDansGrille === "function"
        ? vocab.tailleDansGrille(taille, grille, { tableFemme: femmes })
        : (grille.indexOf(taille) === -1 ? null : { valeur: taille, motif: "exacte" });
      if (!traduite) {
        // Deux refus qui n'ont rien à voir ne partagent pas un message : la
        // grille ne porte pas cette taille (44.5 sur des entiers = limite
        // d'Opla), ou plusieurs options y répondent (on ne tranche pas).
        const pourquoi = typeof vocab?.diagnosticTaille === "function"
          ? vocab.diagnosticTaille(taille, grille, { tableFemme: femmes }) : "hors_vocabulaire";
        const voisines = pourquoi === "ambigu" ? null : voisinesEntieres(taille, grille);
        if (voisines) {
          return refus(
            MOTIFS.TAILLE_HORS_GRILLE,
            `La taille « ${taille} » n'appartient pas à la grille de « ${code} » (entiers seulement) — ` +
            `demi-pointure : choisis ${voisines[0]} ou ${voisines[1]}. Opla l'accepterait en 200 : on refuse.`,
            "size", voisines.map((t) => ({ code: t, title: t })),
          );
        }
        return refus(
          MOTIFS.TAILLE_HORS_GRILLE,
          `La taille « ${taille} » n'appartient pas à la grille de « ${code} » ` +
          `(${grille.length} valeurs : ${grille.slice(0, 6).join(", ")}…)` +
          (pourquoi === "ambigu"
            ? ` — plusieurs valeurs de la grille lui répondent, on ne tranche pas.`
            : `. Opla l'accepterait en 200 : on refuse.`),
          "size", optionsTaille,
        );
      }
      // C'est la valeur DE LA GRILLE qui part, jamais le mot de la personne.
      const codeTaille = String(traduite.valeur ?? "").trim();
      if (codeTaille && codeTaille !== taille) tailleRetenue = codeTaille;
    } else if (taille) {
      // grille absente ⇒ pas de champ Taille ⇒ on n'envoie RIEN (on ne refuse
      // pas le job pour autant : on omet, et on le dit dans le verdict).
      //
      // ⛔ CORRECTION DU LOT 7 — CETTE BRANCHE RENDAIT `ok:true` SUR-LE-CHAMP.
      // Elle sautait donc les quatre gardes suivantes : MARQUE (obligatoire
      // chez Opla), ÉTAT (obligatoire, liste fermée), PRIX (plafond 1000 € ET
      // plancher 1 €, celui posé après l'annonce partie à 0,50 € le 14/09).
      // Autrement dit : n'importe quel article d'une catégorie SANS grille de
      // tailles — vases, décoration, loisirs, une bonne part du catalogue —
      // partait sans marque, sans état valide et sans borne de prix, pourvu
      // qu'une taille traîne dans platform_fields. On ne sort plus d'ici : on
      // note, on omet la taille, et on continue le pré-vol jusqu'au bout.
      avertissements.push(MOTIFS.TAILLE_INATTENDUE);
      tailleRetenue = null;
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
    // Au-dessus de 300 €, Opla exige un profil vérifié et répond 403 — APRÈS
    // que les photos soient montées. On refuse donc AVANT l'envoi, comme pour
    // le plafond de 1 000 €, avec le seuil et les deux issues NOMMÉS.
    if (centimes > OPLA_SEUIL_PROFIL_VERIFIE_CENTIMES) {
      return refus(
        MOTIFS.PRIX_PROFIL_VERIFIE,
        `Opla exige un profil vérifié au-dessus de ${OPLA_SEUIL_PROFIL_VERIFIE_CENTIMES / 100} € ; ` +
        `cette annonce est à ${(centimes / 100).toFixed(2)} €. Baisser le prix, ou faire vérifier ` +
        `le profil sur Opla. Rien n'a été envoyé.`,
        "price",
      );
    }

    // ── 8. COULEURS ET MATIÈRES — la garde qui manquait (lot 7) ─────────────
    // Le pré-vol gardait la catégorie et la taille, et laissait passer
    // n'importe quelle chaîne en metadata.colors/materials. C'est le MÊME
    // piège, une case plus loin : Opla ne valide rien, il écrit. Mesuré au
    // lot 6 — l'article portait « NAVY »/« cotton » parce que je les avais
    // traduits À LA MAIN ; l'app, elle, sert « Marine »/« Coton » (les
    // libellés d'inventaire.attributs), qui seraient partis tels quels.
    const couleurs = resoudreCodes(
      pf.couleurs, listeDe(ref, "couleursPour", code),
      MOTIFS.COULEUR_INCONNUE, MOTIFS.COULEURS_NON_VERIFIEES, avertissements,
    );
    const matieres = resoudreCodes(
      pf.matieres, listeDe(ref, "matieresPour", code),
      MOTIFS.MATIERE_INCONNUE, MOTIFS.MATIERES_NON_VERIFIEES, avertissements,
    );

    return {
      ok: true,
      ...(avertissements.length ? { avertissements } : {}),
      corps: construire(job, pf, photos, titre, tailleRetenue, couleurs, matieres),
    };
  }

  // Liste de référence d'une feuille, ou null si le référentiel ne l'expose pas.
  // ⛔ Jamais de repli statique : une liste absente est un DOUTE, pas un vide
  //    (règle du 02/09 sur les gardes permissives). Le doute est tracé plus bas.
  function listeDe(ref, nom, code) {
    if (!ref || typeof ref[nom] !== "function") return null;
    const liste = ref[nom](code);
    return Array.isArray(liste) && liste.length ? liste : null;
  }

  // Correspondance EXACTE, jamais approchée : le code lui-même, ou le libellé
  // exact rendu par Opla pour CETTE feuille (à la casse et aux espaces près,
  // rien d'autre — « Creme » ne vaut pas « Crème », et c'est voulu : une
  // approximation qui passe est pire qu'une valeur jetée qui se voit).
  function resoudreCodes(valeurs, liste, motifInconnu, motifNonVerifie, avertissements) {
    const brutes = (Array.isArray(valeurs) ? valeurs : [])
      .filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
    if (!brutes.length) return [];
    if (!liste) {
      avertissements.push(`${motifNonVerifie}: ${brutes.join(", ")}`);
      return brutes; // liste injoignable : on n'invente pas de refus
    }
    const plat = (s) => String(s == null ? "" : s).trim().toLowerCase();
    const retenus = [];
    for (const brute of brutes) {
      const trouve = liste.find((e) => plat(e && e.code) === plat(brute))
                  ?? liste.find((e) => plat(e && e.title) === plat(brute));
      if (trouve) {
        if (retenus.indexOf(trouve.code) === -1) retenus.push(trouve.code);
      } else {
        avertissements.push(`${motifInconnu}: « ${brute} » sans correspondance exacte — valeur JETÉE, jamais la plus proche`);
      }
    }
    return retenus;
  }

  // Corps du POST — forme OBSERVÉE au lot 1 (201 Created).
  // ⛔ un champ vide ne s'envoie PAS (on omet la clé) ; categoriesPath ne
  //    s'envoie PAS (le serveur le calcule).
  function construire(job, pf, photos, titre, taille, couleurs, matieres) {
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
    // ⛔ couleurs/matières arrivent RÉSOLUES (codes Opla validés contre la
    //    feuille) — plus jamais lues à cru dans platform_fields.
    if (couleurs && couleurs.length) meta.colors = couleurs;
    if (matieres && matieres.length) meta.materials = matieres;
    if (Object.keys(meta).length) corps.metadata = meta;
    return corps;
  }

  return {
    oplaPrevol,
    OPLA_PREVOL_MOTIFS: MOTIFS,
    OPLA_ETATS,
    OPLA_BORNES: Object.freeze({
      OPLA_PRIX_MAX_CENTIMES, OPLA_PRIX_MIN_CENTIMES,
      OPLA_SEUIL_PROFIL_VERIFIE_CENTIMES,
      OPLA_TITRE_MAX, OPLA_DESCRIPTION_MAX,
      OPLA_PHOTOS_MAX, OPLA_PHOTOS_MIN,
    }),
  };
});
