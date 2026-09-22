// ═══════════════════════════════════════════════════════════════════════════
// LA RÉSOLUTION DE CATÉGORIE ET DE CHAMPS PLATEFORME (2026-09-20, lot A)
// ═══════════════════════════════════════════════════════════════════════════
// CE FICHIER EST UN DÉPLACEMENT, PAS UNE RÉÉCRITURE. Tout ce qui suit vivait
// dans `handlePublish` (ListingPreviewScreen.jsx), donc APRÈS le clic Publier.
// Il en sort pour pouvoir tourner À LA FIN DE LA GÉNÉRATION, quand l'annonce
// vient d'être écrite — le préalable de l'écran unique : on ne peut pas
// montrer une catégorie, ni les champs qu'elle appelle, tant qu'ils sont
// calculés une seconde plus tard, au clic.
//
// ⛔ AUCUNE RÈGLE N'A CHANGÉ. Les lignes ont été RECOPIÉES par un script, pas
//    retapées, et scripts/verifier-deplacement-resolution.mjs le REPROUVE à
//    chaque exécution : il relit le fichier d'origine au commit du
//    déplacement, réextrait les mêmes tranches et compare caractère à
//    caractère. Pas une condition, pas un seuil, pas un mapping, pas un ordre.
//    Les défauts vus pendant le déplacement ont été NOTÉS, jamais corrigés :
//    un lot qui répare en même temps qu'il déplace rend toute régression
//    inattribuable.
//
// CE QUI EST RESTÉ DANS handlePublish, ET POURQUOI — trois choses, toutes
// parce qu'elles dépendent d'une donnée qui bouge jusqu'au dernier moment :
//   · la forme du job (user_id, statut, photos, titre, prix) : ce n'est pas de
//     la résolution ;
//   · le plafond de photos gratuites Leboncoin : il se calcule sur les photos,
//     qu'on peut ajouter ou retirer après la génération ;
//   · l'adresse de remise : elle est relue FRAÎCHE au clic (quelqu'un qui
//     vient de la saisir dans les Réglages ne doit pas être bloqué par un état
//     périmé) — la figer au pré-calcul ferait partir sans adresse le job de
//     celui qui l'a renseignée entre-temps.
// Restent aussi au clic l'écartement des plateformes sans catégorie, les
// gardes eBay et le débit : des décisions de publication, pas de résolution.
//
// LE FILET. Cette fonction peut ne pas avoir tourné (article préparé avant
// l'OTA, brouillon repris, génération d'avant ce lot) ou avoir tourné sur un
// état devenu faux. handlePublish le voit à l'EMPREINTE et recalcule alors
// comme avant. Une publication ne doit JAMAIS échouer ni partir amputée
// parce qu'un pré-calcul a manqué.
//
// ⚠️ ELLE NE LÈVE PAS D'EXCEPTION. Le refus « on n'a pas reconnu l'objet »
//    était un `throw` au clic ; ici il REVIENT en valeur (`refus`), avec son
//    message mot pour mot, et handlePublish le relance. La génération, elle,
//    se contente de ne rien ranger : elle ne doit pas casser parce qu'une
//    catégorie n'a pas été trouvée — la question se pose au clic.
import { texteComparable } from "./texteComparable";
import { detectObjectKeywordDetail } from "./shared";
import { getVintedCategoryPath, vintedGenreRequired } from "./vintedCategories";
import { normalizeVintedColors } from "./vintedColors";
import { getLbcCategoryPath, getLbcBabyEquipment, getLbcBabyClothingProduct } from "./lbcCategories";
import { lbcClePremierCombobox, pairesMaisonJardinDeSecours } from "./lbcMaisonJardin";
import { gardeFouCategorie, categorieIncertaine } from "./categorieGardeFou";
import { chaussureMalgreLeMot } from "./chaussureMalgreLeMot";
import { resoudreParMot, candidatsParMot, niveauSousChemin, estFeuilleDeLArbre } from "./categorieParMot";
import { maisonDesLivres, feuillesDuNoeud, sortDeLaMaison } from "./motObjetOuSujet";
import { familleJeuVideo, cheminJeuVideo, classementAgeEcrit, classementPourPlateforme,
         VINTED_CHAMP_PLATEFORME, VINTED_CHAMP_CLASSEMENT, EBAY_ASPECT_CLASSEMENT } from "./jeuxVideo";
import { familleDeLObjet, plausibiliteDuChemin } from "./familleCategorie";
import { getEbayCategoryPath, getEbayCategoryId, ebayGenreRequired } from "./ebayCategories";
import { getBeebsCategoryPath, beebsGenreRequired } from "./beebsCategories";
import { isChildGenre, toPlatformChildSize, lbcChildSizeCategory } from "./childSizes";
import { tailleAGarder } from "./tailleInventee";
import { rayonContreditLaFiche } from "./rayonIncoherent";

// ── L'EMPREINTE — À QUELLES CONDITIONS UN PRÉ-CALCUL RESTE VALABLE ────────
// Elle couvre TOUT ce que la résolution lit : les copies, leurs champs, les
// champs partagés, l'article, l'icône et le mot de l'IA, la catégorie
// d'origine. Pas un sous-ensemble « malin » : un seul caractère qui bouge et
// on recalcule. Le doute coûte un calcul ; se tromper coûte un job publié
// avec les champs d'avant.
//
// ⚠️ ELLE SE PREND SUR L'ÉTAT D'APRÈS FUSION, jamais sur celui d'avant. La
//    résolution réécrit ce qu'elle lit (genre auto-résolu, taille au libellé
//    de la plateforme, état Opla en code, couleurs éclatées) et ses champs
//    sont refondus dans `edited` dans la foulée. Prise avant, l'empreinte
//    serait fausse une seconde plus tard et le filet tournerait à chaque
//    publication — le lot pour rien. Prise après, elle ne bouge plus tant que
//    personne n'édite, et bouge dès que quelqu'un édite : exactement la
//    question posée.
export function signatureResolution({ plateformes, edited, initialListing, sharedFields, sharedOverrides, activeAiIcon, activeAiObjet, origineCat }) {
  const ordre = [...plateformes].sort();
  return JSON.stringify({
    p: ordre,
    c: ordre.map((p) => [p, edited?.[p]?.title ?? "", edited?.[p]?.description ?? "", edited?.[p]?.platform_fields ?? null]),
    s: sharedFields ?? null,
    o: Object.fromEntries(Object.entries(sharedOverrides ?? {}).map(([p, v]) => [p, [...(v ?? [])].sort()])),
    a: {
      titre: initialListing?.titre ?? null,
      description: String(initialListing?.description ?? "").slice(0, 400),
      categorie: initialListing?.categorie ?? null,
      famille: initialListing?.famille ?? null,
      marque: initialListing?.marque ?? null,
      taille: initialListing?.taille ?? null,
      catalog: initialListing?.vinted_catalog_id ?? null,
      classement: initialListing?.attributs?.classement_age?.v ?? null,
    },
    ai: activeAiIcon ?? null,
    ao: activeAiObjet ?? null,
    or: origineCat ? { p: origineCat.platform, c: origineCat.chemin, g: origineCat.genre ?? null } : null,
  });
}

// `outils` : ce que la résolution lit dans ListingPreviewScreen et qui n'est
// pas un module à soi — helpers locaux du fichier, configuration dépendant du
// traducteur, client Supabase reçu en prop. Passés plutôt que déménagés : les
// déménager serait du rangement, et ce lot ne range rien.
export async function resoudrePublication({
  plateformes,
  selected,
  edited,
  initialListing,
  sharedFields,
  sharedOverrides,
  activeAiIcon,
  activeAiObjet,
  origineCat,
  lang,
  supabase,
  outils,
}) {
  const {
    platformFieldsConfig, isConditionKey, defaultConditionFor, GENERIC_ASPECTS_PF_KEY,
    normAspectVal, resolveArticleIcon, resolveArticleIconDetail, OPLA_ETAT_PAR_LIBELLE,
  } = outils;
  // Le corps lit `plateformesAPublier` : le nom qu'il portait au clic. On le
  // relie ici plutôt que de renommer quarante occurrences — un renommage est
  // un changement, et ce lot n'en fait aucun.
  const plateformesAPublier = plateformes;

  const iconFor = (platform) => {
    const pf = edited[platform]?.platform_fields ?? {};
    return resolveArticleIcon({ initialListing, edited, pf, aiIcon: activeAiIcon });
  };
  const genreUnresolved = (platform) => {
    if (!selected.has(platform)) return false;
    const g = edited[platform]?.platform_fields?.genre ?? "";
    if (g && g !== "Mixte") return false; // choix explicite respecté
    const icon = iconFor(platform);
    if (platform === "vinted") return vintedGenreRequired(icon);
    // Opla (2026-09-17 soir) : 62 % des feuilles sont sous une racine genrée
    // (docs/OPLA_MAPPING.md § 7). Sans genre, « t-shirt » tombe sur 4 feuilles
    // (femme/homme/fille/garçon), rien n'est posé, et l'extension pose la
    // question (job cb3dfbb6). On résout donc le genre comme pour les trois
    // autres — mais le défaut « Femme » ne sert JAMAIS à Opla (cf.
    // autoGenreDefaut) : mieux vaut une question qu'un rayon femme posé en
    // 200 sur un t-shirt homme.
    if (platform === "opla") return true;
    // 🌸 + Mixte résout un vrai rayon eBay (Parfums mixtes) : pas touché.
    if (platform === "ebay") return ebayGenreRequired(icon) && !getEbayCategoryId(icon, g);
    if (platform === "beebs") return beebsGenreRequired(icon);
    return false;
  };
  let autoGenre = null;
  let autoGenreDefaut = false; // « Femme » posé faute de mieux — jamais servi à Opla
  if (["vinted", "ebay", "beebs", "opla"].some(genreUnresolved)) {
    autoGenre = [
      edited.vinted?.platform_fields?.genre,
      edited.ebay?.platform_fields?.genre,
      edited.beebs?.platform_fields?.genre,
      edited.leboncoin?.platform_fields?.univers,
    ].find(g => g && g !== "Mixte" && g !== "Enfant") ?? null;
    if (!autoGenre) {
      const refP = ["vinted", "ebay", "beebs", "leboncoin"].find(p => edited[p]);
      try {
        const { data: gRes } = await supabase.functions.invoke("generate-listing", {
          body: {
            resolve_genre: true,
            item_data: {
              titre:       edited[refP]?.title       || initialListing?.titre       || "",
              marque:      initialListing?.marque      || null,
              description: edited[refP]?.description || initialListing?.description || null,
              type:        initialListing?.categorie   || null,
            },
          },
        });
        if (["Femme", "Homme", "Fille", "Garçon", "Bébé"].includes(gRes?.genre)) autoGenre = gRes.genre;
      } catch { /* IA indisponible : défaut ci-dessous */ }
    }
    if (!autoGenre) { autoGenre = "Femme"; autoGenreDefaut = true; }
  }
  // Le genre servi à la résolution de catégorie : le défaut « Femme » vaut
  // pour Vinted/eBay/Beebs (rayon obligatoire), pas pour Opla.
  const genrePourCategorie = (platform) => (platform === "opla" && autoGenreDefaut ? "" : autoGenre) || "";

  // ── Garde-fou d'insert (2026-07-30) : aucune valeur manifestement
  // incomplète ou non voulue ne part en prod sans trace. Deux classes
  // réellement observées en base (8 jobs, 3 comptes, 27→30/07) :
  //   · valeur d'UNE lettre ("V", "C", "B", "?") — input démonté à la
  //     première frappe (fix racine dans StepPublish, ceci est le filet) ;
  //   · marque DIVERGENTE de celle de l'article sans édition explicite
  //     ("Springfield" → "Levi's") — résolution IA sur liste partielle
  //     (fix racine dans l'effet resolve_aspects, ceci est le filet).
  //     ⚠️ TRACE SANS ÉCRASER (décision 30/07 soir) : 10 jobs en base
  //     portaient une VRAIE marque lue sur l'article (étiquette en photo,
  //     description) alors que l'inventaire disait « Sans marque » —
  //     divergente ≠ suspecte. Le critère qui discriminerait est la
  //     PROVENANCE (lue sur l'article vs choisie dans une liste relevée),
  //     qu'on ne marque pas aujourd'hui ; la source empoisonnée (listes
  //     partielles transmises à l'IA) étant tarie à l'amont, écraser ici
  //     détruirait plus d'information correcte qu'il n'en protégerait.
  // Toute valeur écartée/corrigée laisse une trace REQUÊTABLE :
  //   platform_fields->'suspect_values' IS NOT NULL
  // Format : { "<champ>": { rejected, kept, reason } }.
  // Tourne AVANT les branches par plateforme : la normalisation Vinted
  // des couleurs (colors) repart d'un pf.couleur déjà assaini.
  // `expected` (optionnel) : valeur attendue quand on trace une
  // divergence SANS la corriger (brand_mismatch) — rejected === kept
  // signifie « rien retiré, la valeur part telle quelle ».
  const flagSuspect = (pf, field, rejected, kept, reason, expected) => {
    pf.suspect_values = {
      ...(pf.suspect_values ?? {}),
      [field]: { rejected, kept: kept ?? null, reason, ...(expected !== undefined ? { expected } : {}) },
    };
  };
  // Une lettre seule (ou "?") n'est une valeur plausible pour aucun champ
  // texte libre — mais "S"/"M"/"L" sont des TAILLES légitimes et "9" une
  // pointure : les clés taille/pointure/âge et les chiffres sont exclus.
  const SUSPECT_SINGLE_RE = /^[A-Za-zÀ-ÿ?]$/;
  const SIZE_LIKE_KEY_RE = /taille|size|pointure|age|âge/i;
  const brandChannelKey = (platform, k) =>
    (platform === "vinted" && k === "brand") ||
    (platform === "leboncoin" && /_brand$/.test(k)) ||
    ((platform === "beebs" || platform === "ebay") && k === "Marque");
  // eBay a le même canal d'aspects (ebayAspects, rempli par la même
  // résolution IA) : même exposition, même filet. Le "p" tapé en Marque
  // du run réel du 12/07 était exactement cette classe.
  const ASPECTS_PF_KEY = { ...GENERIC_ASPECTS_PF_KEY, ebay: "ebayAspects" };
  const sanitizeJobFields = (platform, pf) => {
    const OPEN_TEXT_KEYS = ["marque", "matiere", "couleur", "modele"];
    // Espaces parasites des relevés/committs ("Boutique italienne ").
    for (const k of OPEN_TEXT_KEYS) if (typeof pf[k] === "string") pf[k] = pf[k].trim();
    // 1. Valeurs d'une lettre sur les champs dédiés — restauration depuis
    // l'article (valeur IA d'origine) quand elle existe, sinon retrait :
    // mieux vaut un requis manquant VISIBLE qu'une marque "B" publiée.
    for (const k of OPEN_TEXT_KEYS) {
      const v = pf[k];
      if (typeof v === "string" && SUSPECT_SINGLE_RE.test(v)) {
        const restore = String(initialListing?.[k] ?? "").trim();
        const kept = restore.length > 1 ? restore : null;
        flagSuspect(pf, k, v, kept, "single_char");
        if (kept) pf[k] = kept; else delete pf[k];
      }
    }
    // 1bis. Même règle sur le canal d'aspects (vintedAspects/lbcAspects/
    // beebsAspects/ebayAspects), clés de type taille exclues.
    const aspectsKey = ASPECTS_PF_KEY[platform];
    const aspects = aspectsKey && pf[aspectsKey] && typeof pf[aspectsKey] === "object" ? { ...pf[aspectsKey] } : null;
    if (aspects) {
      for (const [k, v] of Object.entries(aspects)) {
        if (typeof v !== "string") continue;
        const t = v.trim();
        if (t !== v) aspects[k] = t;
        if (SUSPECT_SINGLE_RE.test(t) && !SIZE_LIKE_KEY_RE.test(k)) {
          flagSuspect(pf, `${aspectsKey}.${k}`, t, null, "single_char");
          delete aspects[k];
        }
      }
    }
    // 2. Marque divergente de celle de l'article sans édition explicite
    // de CETTE copie (sharedOverrides trace les éditions manuelles ; les
    // écritures IA n'en posent pas) : TRACÉE, JAMAIS écrasée — une marque
    // lue sur l'article (étiquette, description) diverge légitimement
    // d'un inventaire « Sans marque » (cf. bloc de tête du garde-fou).
    // `rejected: null` = rien retiré, la valeur part telle quelle ;
    // `expected` = la marque de l'article, pour compter/comparer en SQL.
    const canonicalMarque = String(sharedFields.marque || initialListing?.marque || "").trim();
    const overridden = Boolean(sharedOverrides[platform]?.has("marque"));
    if (canonicalMarque.length > 1 && !overridden) {
      if (typeof pf.marque === "string" && pf.marque &&
          normAspectVal(pf.marque) !== normAspectVal(canonicalMarque)) {
        flagSuspect(pf, "marque", pf.marque, pf.marque, "brand_mismatch", canonicalMarque);
      }
      if (aspects) {
        for (const [k, v] of Object.entries(aspects)) {
          if (typeof v === "string" && v && brandChannelKey(platform, k) &&
              normAspectVal(v) !== normAspectVal(canonicalMarque)) {
            flagSuspect(pf, `${aspectsKey}.${k}`, v, v, "brand_mismatch", canonicalMarque);
          }
        }
      }
    }
    if (aspects) pf[aspectsKey] = aspects;
  };

  // ══ ÉTAPE 2 : LA CATÉGORIE PAR LE MOT, CONTRE NOS ARBRES ══════════════
  // L'IA a nommé l'objet en français (étape 1). On résout ce nom contre les
  // FEUILLES RELEVÉES de chaque plateforme, chez nous, sans IA : recherche
  // texte, instantanée et gratuite. Aucun emoji dans ce chemin — c'est la
  // sortie de l'intermédiaire qui coûtait « Claviers arrangeurs, synthés »
  // à une chapka de bébé.
  //
  // ⛔ EXACT, OU RIEN. Une seule feuille dont le libellé est EXACTEMENT le
  //    mot (jetons identiques, pluriels ramenés au singulier), après
  //    filtrage par le genre de la fiche. Deux feuilles, ou seulement des
  //    voisines, ne décident RIEN : on garde le chemin de l'icône, et la
  //    règle n°2 laissera la plateforme trancher si la source est incertaine.
  //    « bonnet » rend « Bonnets de bain » et « Bonnets de douche » comme
  //    voisines : c'est précisément ce qu'il ne faut jamais poser.
  // ⛔ Les feuilles viennent des RELEVÉS (scripts/gen-arbres-feuilles.mjs) :
  //    l'IA ne peut pas produire une catégorie qui n'existe pas chez nous.
  // Index chargés en import() dynamique, une seule fois, ici — au clic
  // Publier, jamais au démarrage de l'app.
  //
  // ── LE MOT QUI NOURRIT L'ARBRE (2026-09-10, GO Nico) ────────────────
  // Jusqu'ici seul le mot de l'IA entrait ici. Sans lui (scan Lens avant
  // la v90, IA muette), on retombait DIRECTEMENT sur l'icône du repli
  // mot-clé — le dernier endroit où l'emoji décidait seul : « jupe » →
  // 👗 → « Robes > Midi ». Désormais le mot-clé du TITRE (passe 1 de
  // detectObjectKeywordDetail, la source du vendeur) prend le relais du
  // mot de l'IA et se compare aux arbres exactement comme lui.
  // ⛔ Le titre SEUL : un mot-clé lu dans la description est un filet
  //    trop lâche pour poser une catégorie (« coton côtelé » → « télé »).
  // ── RÈGLE (a) : SANS MOT, ON NE PUBLIE PAS DANS UNE CATÉGORIE DEVINÉE ─
  // Ni mot de l'IA, ni mot-clé au titre, ni catalogue Vinted d'origine,
  // ni famille livres : on s'arrête et on demande, comme sur Beebs (« on
  // ne publie jamais une catégorie que le pont n'a pas confirmée »).
  // Mesuré le 10/09 sur 60 j : 2 articles sur 12 sans mot IA auraient été
  // retenus (combinaison → Téléviseurs, dessous de plat → Assiettes) ;
  // avec la v90 de lens-analysis (objet joint), quelques-uns par mois.
  const frTitrePublication = initialListing?.titre ?? edited?.leboncoin?.title ?? edited?.vinted?.title ?? edited?.beebs?.title ?? "";
  // Le texte FR de l'article — jamais la copie eBay, traduite en anglais.
  // Sert de FILET à la reconnaissance jeu/console/accessoire (le titre
  // reste prioritaire), comme la passe 2 de detectObjectKeywordDetail.
  const frDescriptionPublication = String(
    initialListing?.description ?? edited?.leboncoin?.description ?? edited?.vinted?.description ?? ""
  ).slice(0, 400);
  // ── LE CLASSEMENT PAR ÂGE : ON LE REPREND AVANT DE LE REDEMANDER ──────
  // Trois sources, dans cet ordre, la première qui répond gagne :
  //   1. la RÉPONSE de l'utilisateur, déjà dans la copie Vinted — c'est le
  //      stepper ou le mini-éditeur ; elle prime sur tout ;
  //   2. l'ARTICLE lui-même (inventaire.attributs.classement_age) : il l'a
  //      déjà tranché une fois, on ne le redemande jamais ;
  //   3. le TEXTE de l'annonce, s'il l'écrit noir sur blanc (« PEGI 12 »).
  // ⛔ Rien d'autre. Pas de déduction depuis le titre du jeu, pas de valeur
  //    par défaut : un classement faux fait retirer une annonce.
  const classementUtilisateur = String(
    edited?.vinted?.platform_fields?.vintedAspects?.[VINTED_CHAMP_CLASSEMENT] ?? ""
  ).trim();
  const classementFiche = String(initialListing?.attributs?.classement_age?.v ?? "").trim();
  const classementConnu =
    classementUtilisateur
    || classementFiche
    || classementAgeEcrit(frTitrePublication, frDescriptionPublication)
    || null;
  const motCleTitre = detectObjectKeywordDetail(frTitrePublication, "")?.mot ?? null;
  const catalogVintedFiche = initialListing?.vinted_catalog_id ?? null;
  const familleLivresFiche = initialListing?.famille === "livres_medias" || /^livres?$/i.test(String(initialListing?.categorie ?? ""));
  // ⛔ 5ᵉ CLÉ : la catégorie d'ORIGINE (2026-09-19). Même nature que le
  // catalogue Vinted juste à côté — une catégorie déclarée par la personne
  // sur la plateforme qui héberge déjà l'annonce. Un article importé d'un
  // relevé n'est PAS un article dont on ne sait rien : refuser de publier
  // « faute de savoir ce que c'est » alors que sa catégorie est en base
  // depuis le relevé, c'est refuser une information qu'on possède.
  if (!activeAiObjet && !motCleTitre && !catalogVintedFiche && !familleLivresFiche && !origineCat) {
    console.warn(`[publish] catégorie NON reconnue pour « ${frTitrePublication} » (ni mot IA, ni mot-clé au titre) — publication retenue, on demande`);
    // ⚠️ LA SEULE ADAPTATION QUI TOUCHE UN FLUX DE CONTRÔLE : c'était un
    //    `throw` au clic ; le refus REVIENT maintenant à l'appelant, qui le
    //    relance à l'identique au moment de publier. Le texte n'a pas bougé
    //    d'un caractère — il est recopié des deux mêmes lignes.
    return {
      refus: {
        code: "objet_non_reconnu",
        // ── LE MESSAGE NE DONNE PLUS DE TRAVAIL (2026-09-20, passe 2) ───────
        // AVANT : « On n'a pas reconnu l'objet dans « <titre> » […] Nomme
        // l'objet dans le titre (« combinaison », « dessous de plat »,
        // « veste »…) ou régénère l'annonce ». Trois défauts, vus sur le
        // compte d'Ornella le 20/09 à 16:24 :
        //   · il citait un TITRE que la personne ne voit nulle part à l'écran
        //     (celui de l'article, pas celui de la carte qu'elle regarde) ;
        //   · il lui demandait de réécrire un titre pour réparer NOTRE
        //     correspondance de catégories ;
        //   · « régénère l'annonce » est un geste PAYANT.
        // Et il s'affichait alors qu'elle venait de choisir son rayon à la
        // main sur Vinted. Le message dit maintenant que ça vient de chez
        // nous, montre la porte qui existe déjà — le sélecteur de rayon, sur
        // la carte de chaque plateforme — et s'arrête là.
        message: lang === "en"
          ? "We could not file this item on our own. Its category can be picked on each platform card, just above. Nothing was charged."
          : "On n'a pas su ranger cet article tout seul. Son rayon se choisit sur la carte de chaque plateforme, juste au-dessus. Rien n'a été débité.",
      },
    };
  }
  // ══ LE MOT DU TITRE NE GAGNE PAS CONTRE L'ARTICLE (2026-09-22) ═══════════
  // « Nike Blazer Mid 77 » partait au rayon des blazers sur les quatre
  // plateformes, et Vinted refusait ensuite la taille « EU 10 » — qui n'existe
  // pas dans un rayon de vêtements. La fiche disait pourtant trois fois que
  // c'était une paire de baskets (pointure relevée, marque + modèle, texte du
  // vendeur). Le module ne corrige QUE sur preuve (cf. son en-tête) : sans
  // preuve il rend null et rien ne change. Il s'applique AVANT la résolution
  // par le mot, donc chaque plateforme résout « baskets » contre SON arbre —
  // et le garde-fou d'icône plus bas reçoit 👟 au lieu de 🥼.
  const motAvantChaussure = activeAiObjet ?? motCleTitre ?? null;
  const chaussureCorrigee = chaussureMalgreLeMot({
    mot: motAvantChaussure,
    titre: frTitrePublication,
    description: frDescriptionPublication,
    marque: initialListing?.marque ?? "",
    attributs: initialListing?.attributs ?? null,
  });
  if (chaussureCorrigee) {
    console.warn(`[publish] classement corrigé — ${chaussureCorrigee.motif}`);
  }
  const motCategorie = chaussureCorrigee ? chaussureCorrigee.mot : motAvantChaussure;
  const motCategorieSource = chaussureCorrigee
    ? "modele_chaussure"
    : (activeAiObjet ? "ia" : (motCleTitre ? "mot_cle" : null));
  // ══ LA FAMILLE DE L'OBJET — SOURCES CERTAINES SEULEMENT (2026-09-10) ══
  // Cas fondateur : « Salopette Le Mont Saint Michel » (Victor, dddc7f2a),
  // catalogue Vinted Hommes > Vêtements, partie sur eBay en « Auto, moto >
  // Vêtements mécanicien > Combinaisons, salopettes » : la seule feuille
  // eBay qui contient « salopette », passée au genre (aucune branche
  // genrée), retenue par l'IA faute d'autre candidate. Rien ne comparait
  // la FAMILLE du chemin à celle de l'objet. Désormais la famille de l'objet
  // (catalogue Vinted, icône d'autorité — jamais un mot ou une icône
  // devinés, et plus jamais la taille depuis le 13/09 : elle rangeait les
  // jouets importés de Vinted en « mode » et faisait écarter leur rayon
  // Jeux, cf. familleCategorie.js) filtre les feuilles candidates comme le
  // genre le fait déjà, et contrôle le chemin final avant l'insert (bloc
  // PLAUSIBILITÉ plus bas). Famille inconnue → rien ne change.
  const pfFamille = edited[plateformesAPublier[0]]?.platform_fields ?? {};
  const detIconeFamille = resolveArticleIconDetail({ initialListing, edited, pf: pfFamille, aiIcon: activeAiIcon, aiObjet: activeAiObjet });
  const familleObjetDetail = familleDeLObjet({
    catalogId: catalogVintedFiche, icone: detIconeFamille.icon, sourceIcone: detIconeFamille.source,
    // La catégorie d'origine entre ici comme source CERTAINE, au même rang
    // que le catalogue Vinted (cf. familleDeLObjet). Le catalog_id ne sait
    // dire qu'une famille — « mode » — parce que sa table ne couvre que
    // les branches mode de Vinted ; l'origine en couvre les huit.
    origine: origineCat,
  });
  const familleObjet = familleObjetDetail.famille;
  if (origineCat) console.log(`[publish] catégorie d'origine (${origineCat.platform}) : ${origineCat.chemin.join(" > ")}${origineCat.genre ? ` · genre ${origineCat.genre}` : ""}`);
  if (familleObjet) console.log(`[publish] famille de l'objet : ${familleObjet} (source ${familleObjetDetail.source})`);
  const categorieParMotParPf = {};
  // Feuilles écartées par le garde-fou d'escamotage (2026-09-12) : une
  // correspondance exacte qui ne tenait que parce que des mots étaient
  // escamotés. On ne pose RIEN à sa place ici — l'étape 3 tranche — mais on
  // garde la trace sur le job : sans elle, « pourquoi cette catégorie n'a
  // pas été posée ? » redevient une reconstitution à rebours.
  const escamotageParPf = {};
  if (motCategorie) {
    await Promise.all(plateformesAPublier.map(async (platform) => {
      const pfE = edited[platform]?.platform_fields ?? {};
      // ── LE GENRE DE L'ORIGINE, EN DERNIER RECOURS (2026-09-19) ────────
      // Beebs suffixe ses feuilles « (femme) », « (fille) », eBay écrit
      // « Femme : vêtements », Opla code GIRLS_/MENS_ : 85 des 192
      // catégories d'origine relevées portent un genre EXPLICITE. Il ne
      // passe qu'APRÈS ce que la fiche dit d'elle-même — la personne a pu
      // corriger le genre dans l'app, et sa correction prime toujours.
      // ⛔ Sert UNIQUEMENT à filtrer les feuilles candidates ici. Il
      //    n'est jamais écrit dans platform_fields.genre : ce champ-là
      //    part dans le formulaire, il ne se déduit pas d'un autre site.
      const genrePf = pfE.genre || pfE.univers || genrePourCategorie(platform) || origineCat?.genre || "";
      try {
        const r = await resoudreParMot(motCategorie, platform, { genre: genrePf, famille: familleObjet });
        // ── LE MOT DÉCRIT-IL L'OBJET, OU SON SUJET ? (2026-09-20) ─────────
        // « La Méthode Delavier de MUSCULATION pour la Femme » — un LIVRE —
        // est parti sur Opla en « Sport > Fitness > Musculation » : le mot
        // est une feuille de l'arbre, donc une correspondance EXACTE, donc
        // une certitude sans recours. Le garde-fou de famille n'a rien vu :
        // chez Opla « Sport » et « Culture et Loisirs » sont tous les deux
        // « loisirs ». Un haltère et un livre y sont la même chose.
        // Quand la fiche dit, DE SOURCE CERTAINE, que l'objet est un livre,
        // on connaît sa maison dans l'arbre de la plateforme. Une feuille
        // trouvée AILLEURS décrit le sujet, pas l'objet : on retire la
        // certitude — on ne pose rien à sa place, l'étape 3 tranche avec
        // les feuilles de la maison (ajoutées aux candidates plus bas).
        // ⛔ On ne le fait QUE si la maison existe dans cet arbre : sur
        //    Leboncoin et eBay elle n'existe pas, et on ne conclut rien.
        let horsMaison = false;
        if (r.certitude === "exact" && familleLivresFiche) {
          const maison = await maisonDesLivres(platform);
          if (maison && sortDeLaMaison(r.chemin, maison)) {
            horsMaison = true;
            console.warn(
              `[publish] ${platform} — « ${motCategorie} » tombe sur « ${r.chemin.join(" > ")} », hors de la maison ` +
              `des livres (« ${maison.join(" > ")} ») : le mot décrit le SUJET, pas l'objet — certitude retirée`
            );
          }
        }
        if (r.certitude === "exact" && !horsMaison) categorieParMotParPf[platform] = r;
        if (r.escamotage) {
          escamotageParPf[platform] = r.escamotage;
          console.warn(`[publish] ${platform} — ${r.escamotage.motif}`);
        }
      } catch (e) {
        console.warn(`[publish] ${platform} — arbre indisponible pour « ${motCategorie} » :`, e?.message ?? e);
      }
    }));
    const poses = Object.keys(categorieParMotParPf);
    console.log(
      `[publish] mot « ${motCategorie} » → catégorie EXACTE sur ${poses.length ? poses.join(", ") : "aucune plateforme"}`
    );
  }

  // Candidates ratissées à l'étape 3, gardées pour la VÉRIFICATION du chemin
  // tiré de l'icône (bloc après la construction des jobs).
  const candidatsRatisses = {};
  // ══ ÉTAPE 3 : LA MACHINE PROPOSE, L'IA TRANCHE ════════════════════════
  // Le mot n'est pas tombé EXACT sur cette plateforme. Plutôt que de
  // retomber tout de suite sur l'emoji, on RATISSE des candidates dans
  // l'arbre relevé (dix à vingt feuilles qui ressemblent, de près ou de
  // loin) et on demande à l'IA laquelle — resolve-categorie vérifie côté
  // serveur que sa réponse est bien l'une des candidates ENVOYÉES et rend
  // la candidate d'origine.
  // Pourquoi pas un rapprochement de lettres : mesuré sur l'arbre réel,
  // « bonnet » ne ressemble qu'à « Bonnets de bain » (Natation) et
  // « Bonnets de douche » (Beauté). Un score choisirait l'un des deux ;
  // seul un modèle sait qu'un bonnet de bébé n'est ni l'un ni l'autre.
  // ⛔ AUCUN APPEL s'il n'y a rien à choisir : zéro candidate → on garde
  //    l'emoji, et la règle n°2 laissera la plateforme trancher. Le coût
  //    ne se paie donc que sur les cas difficiles.
  // ⛔ L'IA a le droit de répondre « aucune » : on ne pose alors rien.
  // ⛔ Une source CERTAINE n'est jamais écrasée : on ne ratisse que pour
  //    les plateformes sans correspondance exacte.
  if (motCategorie) {
    const aRatisser = plateformesAPublier.filter(p => !categorieParMotParPf[p]);
    const candidats = candidatsRatisses;
    await Promise.all(aRatisser.map(async (platform) => {
      const pfE = edited[platform]?.platform_fields ?? {};
      try {
        const liste = await candidatsParMot(motCategorie, platform, {
          // Même cascade qu'à l'étape 2 : le genre de l'origine ne parle
          // qu'après la fiche, et ne sert qu'au filtrage des candidates.
          genre: pfE.genre || pfE.univers || genrePourCategorie(platform) || origineCat?.genre || "",
          titre: edited[platform]?.title || initialListing?.titre || "",
          famille: familleObjet,
        });
        let retenues = liste.map(c => ({ chemin: c.chemin, id: c.id }));
        // ── LA BONNE RÉPONSE DOIT ÊTRE DANS LA LISTE (2026-09-20) ────────
        // Mesuré sur les 3 livres publiés sur Opla : tous les trois rangés
        // en « Livres SONORES » — des livres papier. Ce n'est PAS une erreur
        // de l'IA. Pour le mot « livre », les seules candidates qu'on lui
        // donnait étaient « Livres sonores » et « Livres pour bébé » : les
        // deux seules feuilles qui RÉPÈTENT le mot. « Romans pour adultes »,
        // « Fictions », « Non-fiction » n'y entraient jamais. L'IA a choisi
        // le moins faux de deux mauvais.
        // Quand la fiche dit, de source certaine, que l'objet est un livre,
        // les candidates sont les feuilles de sa MAISON — les onze d'Opla,
        // les huit de Vinted, les douze de Beebs. Elles passent en TÊTE :
        // ce sont les seules dont on sait qu'elles sont du bon rayon.
        // ⛔ On n'en choisit AUCUNE ici : c'est l'IA qui tranche, comme avant.
        if (familleLivresFiche) {
          const maison = await maisonDesLivres(platform);
          if (maison) {
            const dedans = (await feuillesDuNoeud(maison, platform)).map(f => ({ chemin: f.chemin, id: f.id }));
            const cle = (c) => c.chemin.join(" > ");
            const vus = new Set(dedans.map(cle));
            // ⛔ LE PLAFOND DE 20 NE DOIT PAS AMPUTER LA MAISON (2026-09-22).
            // Il a été écrit quand les trois maisons connues faisaient 11
            // feuilles (Opla), 8 (Vinted) et 12 (Beebs) : il ne coupait rien.
            // eBay en a SOIXANTE-QUATRE. Tronquer à 20 dans l'ordre de l'arbre
            // laissait « Non-fiction » (171243) DEHORS — celle-là même qu'eBay
            // proposait sur le Hawking d'ornellaracano. C'est le défaut nº2
            // ci-dessus, rejoué à l'échelle d'eBay : la bonne réponse absente
            // de la liste, et l'IA qui choisit le moins faux.
            // LA BORNE EST MESURÉE (21/09, resolve-categorie appelée en PROD
            // sur le maillot NBA) : 312 feuilles d'un coup → « aucune » ;
            // 65 → la bonne ; 42 → la bonne ; 8 → la bonne. Une maison de 64
            // est donc lisible. Au-delà, on ne sert pas une liste qu'on sait
            // intranchable : on garde le plafond d'avant, et la descente de
            // l'arbre (dernier recours) prend le relais.
            const MAISON_LISIBLE_MAX = 80;
            const plafond = dedans.length <= MAISON_LISIBLE_MAX ? Math.max(20, dedans.length) : 20;
            retenues = [...dedans, ...retenues.filter(c => !vus.has(cle(c)))].slice(0, plafond);
          }
        }
        if (retenues.length) candidats[platform] = retenues;
      } catch { /* arbre indisponible : on garde l'icône */ }
    }));
    if (Object.keys(candidats).length) {
      try {
        const { data: choixIa } = await supabase.functions.invoke("resolve-categorie", {
          body: {
            titre: initialListing?.titre || edited[plateformesAPublier[0]]?.title || "",
            attributs: {
              genre: sharedFields.genre || autoGenre || "",
              taille: sharedFields.taille || initialListing?.taille || "",
              marque: sharedFields.marque || initialListing?.marque || "",
              objet: motCategorie,
            },
            candidats,
          },
        });
        for (const [platform, choix] of Object.entries(choixIa?.choix ?? {})) {
          if (!Array.isArray(choix?.chemin) || !choix.chemin.length) continue;
          categorieParMotParPf[platform] = { chemin: choix.chemin, id: choix.id ?? null, choisiParIa: true };
        }
        const retenus = Object.keys(choixIa?.choix ?? {});
        console.log(
          `[publish] mot « ${motCategorie} » — l'IA a choisi dans nos candidats sur ` +
          `${retenus.length ? retenus.join(", ") : "aucune plateforme"}` +
          (choixIa?.refuses?.length ? ` (réponses hors liste ignorées : ${choixIa.refuses.join(", ")})` : "")
        );
      } catch (e) {
        console.warn("[publish] resolve-categorie injoignable — on garde l'icône :", e?.message ?? e);
      }
    }
  }

  // Chemins posés depuis l'ICÔNE (aucun mot exact, aucun arbitrage) — relevés
  // ici par plateforme pour être VÉRIFIÉS contre le mot juste après.
  const poseParIcone = {};
  const pfParPlateforme = {};
  for (const platform of plateformesAPublier) {
    const pf = { ...(edited[platform]?.platform_fields ?? {}) };
    // Dernier filet avant l'insert du job : un état vidé à la main (ou un
    // `edited` venant d'un chemin qui n'est pas passé par
    // mergeFieldsWithLens) ne part JAMAIS vide vers l'extension.
    for (const field of platformFieldsConfig[platform] ?? []) {
      if (isConditionKey(field.key) && !String(pf[field.key] ?? "").trim())
        pf[field.key] = defaultConditionFor(field);
    }
    sanitizeJobFields(platform, pf);
    // ══ GARDE-FOU DE CATÉGORIE — LES QUATRE PLATEFORMES (2026-09-07 soir) ══
    // L'ICÔNE est le pivot unique dont dérivent les quatre catégories. Le
    // garde-fou la corrige ICI, une fois, AVANT les blocs par plateforme :
    // il devient structurellement impossible qu'une plateforme reçoive un
    // filet que les autres n'ont pas. C'était le défaut de la version du
    // matin, qui ne corrigeait que le CHEMIN Leboncoin — et le soir même,
    // « Lot de 4 taies d'oreiller » partait en rayon Beauté sur Vinted,
    // Beebs et eBay (needs_user « État exigé » sur les trois, parce que ces
    // rayons n'acceptent qu'un état neuf), pendant que Leboncoin passait
    // par le fourre-tout « Divers > Autres ».
    const detIcone = resolveArticleIconDetail({ initialListing, edited, pf, aiIcon: activeAiIcon, aiObjet: activeAiObjet });
    const catalogVinted = initialListing?.vinted_catalog_id ?? null;
    const garde = gardeFouCategorie({
      icone: detIcone.icon,
      sourceIcone: detIcone.source,
      catalogId: catalogVinted,
      genre: pf.univers || pf.genre || edited.vinted?.platform_fields?.genre || "",
      taille: pf.taille || sharedFields.taille || initialListing?.taille || "",
      typeFiche: pf.categorie || initialListing?.categorie || "",
      familleFiche: initialListing?.famille || "",
      iconeSansIa: detIcone.iconeSansIa ?? null,
    });
    // L'icône suit le classement corrigé : sans ça le chemin d'icône (le
    // repli de toute plateforme où « baskets » ne résout pas — Leboncoin,
    // dont l'arbre n'a pas ce mot) renverrait l'article au rayon 🥼.
    const iconeArticle = chaussureCorrigee ? chaussureCorrigee.icone : (garde.icone ?? detIcone.icon);
    if (chaussureCorrigee) {
      pf.categorie_chaussure_malgre_le_mot = {
        regle: chaussureCorrigee.regle,
        mot_ecarte: motAvantChaussure ?? null,
        icone_ecartee: garde.icone ?? detIcone.icon,
        preuves: chaussureCorrigee.preuves,
      };
    }
    // TRAÇABILITÉ SUR LES QUATRE PLATEFORMES (elle n'existait que sur
    // Leboncoin) : un job en main, on doit pouvoir répondre « d'où venait
    // cette catégorie ? » — y compris pour un job eBay.
    pf.categorie_icone = iconeArticle;
    pf.categorie_icone_ia = activeAiIcon ?? null;
    // Le MOT rendu par l'IA, tel quel. C'est la seule façon de répondre à
    // « qu'est-ce que l'IA a compris ? » sans reconstituer à rebours trois
    // transformations — la question posée le 07/09 sur la chapka.
    pf.categorie_objet_ia = activeAiObjet ?? null;
    // Le mot-clé lu au TITRE (2026-09-10) : c'est lui qui a nourri l'arbre
    // quand l'IA n'avait rien dit — la trace doit pouvoir le dire.
    pf.categorie_mot_cle_titre = motCleTitre ?? null;
    pf.categorie_source = garde.source;
    if (garde.corrige) {
      pf.categorie_garde_fou = {
        motif: garde.motif, icone_ecartee: garde.iconeEcartee, source_icone: detIcone.source,
      };
      console.warn(`[publish] ${platform} — catégorie corrigée par le garde-fou : ${garde.motif}`);
    }
    // ── RÈGLE N°2 : LA PLATEFORME BAT UNE ICÔNE DEVINÉE (07/09 soir) ────
    // Quand notre catégorie n'est qu'une SUPPOSITION de l'IA — aucun
    // mot-objet dans le titre, aucun catalogue Vinted, aucun garde-fou
    // pour trancher — la catégorie que la plateforme propose ELLE-MÊME à
    // partir du titre et des photos fait foi. Elle gagne SILENCIEUSEMENT :
    // ni écran, ni question. Cas fondateur : « Chapka Obaibi bébé »,
    // classée « Claviers arrangeurs, synthés » par une icône 🎹 devinée,
    // alors qu'eBay proposait « Pyjamas » — et nous lui avons désobéi.
    // ⛔ JAMAIS quand la source est certaine (mot-objet, catalogue Vinted,
    // famille Lens) : le drapeau n'est alors pas posé.
    // Lu par : ebay-api-worker (voie API), vinted.js et leboncoin.js
    // (0.6.21). Beebs n'expose AUCUNE suggestion — son sélecteur est un
    // arbre nu : rien à préférer là-bas, constaté au relevé.
    if (categorieIncertaine({ sourceFinale: garde.source, catalogId: catalogVinted })) {
      pf.categorie_incertaine = true;
    }
    // La catégorie tirée du MOT prime sur celle tirée de l'icône : elle
    // vient du libellé exact d'une feuille relevée, pas d'un emoji.
    if (escamotageParPf[platform]) pf.categorie_escamotage_ecarte = escamotageParPf[platform];
    // ══ JEU / CONSOLE / ACCESSOIRE (2026-09-20, demande XEWER) ═══════════
    // L'icône 🎮 envoyait TOUT le domaine au rayon des machines — et sur
    // Vinted la catégorie choisit la GRILLE DE COLIS : « Consoles » n'offre
    // que des paliers en kilos (plancher 5 kg, mesuré sur le parc), donc
    // l'acheteur d'un jeu DS payait un port de gros colis. Même mécanique
    // sur Leboncoin (le poids est un critère DE la catégorie) et Beebs
    // (notre défaut de colis se déduit du chemin).
    // On ne déplace pas l'icône : on SÉPARE les trois familles et chacune
    // vise sa feuille relevée, sur les cinq plateformes.
    // ⛔ La garde, c'est l'icône : hors 🎮 ce bloc n'existe pas. Mesuré le
    //    20/09 sur 657 articles du parc (85 comptes), confronté à la
    //    catégorie choisie par les vendeurs eux-mêmes sur 147 d'entre eux :
    //    141/141 jeux, 4/4 consoles, 1/1 accessoire, AUCUNE bascule à tort.
    // ⛔ Doute → familleJeuVideo rend null → rien ne change.
    const jeuVideo = iconeArticle === "🎮"
      ? familleJeuVideo(frTitrePublication, frDescriptionPublication)
      : null;
    const feuilleJeuVideo = jeuVideo ? cheminJeuVideo(platform, jeuVideo) : null;
    // Elle PRIME sur l'arbitrage par le mot : « Xbox » ou « PS5 » dans un
    // titre ne dit pas si l'objet est un jeu ou la machine — c'est
    // exactement ce que cette règle tranche, et le mot ne le sait pas.
    const parMot = feuilleJeuVideo
      ? { chemin: feuilleJeuVideo.chemin, id: feuilleJeuVideo.id ?? null, regle: `jeux_video_${jeuVideo.famille}` }
      : (categorieParMotParPf[platform] ?? null);
    if (parMot) {
      pf.categorie_source = parMot.regle?.startsWith("jeux_video")
        ? "famille_jeu_video"
        : parMot.choisiParIa ? "ia_parmi_candidats" : (motCategorieSource === "ia" ? "mot_objet_arbre" : "mot_cle_arbre");
      pf.categorie_par_mot = {
        mot: motCategorie, mot_source: motCategorieSource, chemin: parMot.chemin, id: parMot.id ?? null,
        ...(parMot.choisiParIa ? { choisi_par_ia: true } : {}),
        // Un job en main doit dire POURQUOI il est dans ce rayon : la
        // famille reconnue et la règle qui l'a reconnue, pas seulement le
        // chemin (question posée le 07/09 sur la chapka).
        ...(jeuVideo ? { famille_jeu_video: jeuVideo.famille, regle_jeu_video: jeuVideo.regle,
                         machine: jeuVideo.machine?.cle ?? null } : {}),
        // Synonyme dirigé (categorieParMot.js, SYNONYMES_DIRIGES) : la
        // règle qui a posé le chemin reste lisible sur le job.
        ...(parMot.regle ? { regle: parMot.regle } : {}),
      };
      delete pf.categorie_incertaine;
    }
    if (platform === "leboncoin") {
      // La catégorie Leboncoin découle de l'icône DÉJÀ passée au
      // garde-fou (bloc commun ci-dessus) — plus aucun calcul local.
      const icon = iconeArticle;
      const lbcPath = parMot?.chemin ?? getLbcCategoryPath(icon);
      if (lbcPath) pf.lbcCategoryPath = lbcPath;
      // Marque du constructeur — le critère `console_brand` existe sur les
      // DEUX feuilles du domaine (« Jeux vidéo » et « Consoles », relevé du
      // 20/09) avec la même liste fermée de 10 valeurs. On pose la valeur
      // EXACTE de cette liste, jamais autre chose ; jamais par-dessus une
      // saisie de l'utilisateur.
      if (jeuVideo?.machine?.lbc) {
        const aspectsLbc = { ...(pf.lbcAspects && typeof pf.lbcAspects === "object" ? pf.lbcAspects : {}) };
        if (!String(aspectsLbc.console_brand ?? "").trim()) {
          aspectsLbc.console_brand = jeuVideo.machine.lbc;
          pf.lbcAspects = aspectsLbc;
        }
      }
      if (!parMot?.chemin && lbcPath) poseParIcone.leboncoin = { chemin: lbcPath, id: null };
      // Nom historique du même drapeau, conservé pour les extensions
      // ≤ 0.6.20 déjà déployées. La décision, elle, est prise une seule
      // fois dans le bloc commun ci-dessus. Aucun job ne part sans
      // catégorie : le chemin reste posé dans tous les cas.
      if (pf.categorie_incertaine) pf.lbcCategorieIncertaine = true;
      // ── QUAND LEBONCOIN CHOISIT UNE AUTRE FEUILLE QUE LA NÔTRE (22/09) ──
      // `categorie_incertaine` veut dire : notre catégorie n'est qu'une
      // supposition de l'IA, et leboncoin.js laisse alors la SUGGESTION de
      // Leboncoin l'emporter (règle du 07/09 — et il a raison, c'est lui qui
      // voit le titre). Mais nos critères, eux, restaient collés à NOTRE
      // feuille : le formulaire rendait `table_art_*` pendant que nous
      // posions `decoration_type`. Le Produit obligatoire restait vide, le
      // repli écrivait « Autre » — absent de la liste d'« Accessoire de
      // table » — et la personne lisait « la valeur "Autre" n'a pas été
      // reconnue » pour une valeur qu'elle n'avait jamais choisie.
      // MESURÉ EN DIRECT le 22/09 sur le formulaire Leboncoin : le titre
      // « Ancien plateau à olives faïence peint main » lui fait proposer
      // TROIS feuilles (Arts de la table en tête, puis Bricolage, puis
      // Décoration) et pré-remplir Univers « Accessoire de table », Produit
      // « Plateau », Matière « Faïence ».
      // On pose donc aussi, pour les AUTRES feuilles Maison & Jardin, la
      // paire (Univers, Produit) que le titre nomme — et RIEN quand il n'en
      // nomme aucune (cf. le commentaire du module : une paire fourre-tout
      // ne survit pas à `skipIfPrefilled`). Jamais par-dessus une clé déjà
      // posée : ce qui vient de la personne ou du relevé passe avant.
      if (pf.categorie_incertaine && Array.isArray(pf.lbcCategoryPath)) {
        const feuilleLbc = pf.lbcCategoryPath.join(" > ");
        if (feuilleLbc.startsWith("Maison & Jardin > ")) {
          const texteLbc = `${initialListing?.titre ?? ""} ${edited?.leboncoin?.title ?? ""}`;
          const secours = pairesMaisonJardinDeSecours(texteLbc, feuilleLbc);
          const clesSecours = Object.keys(secours);
          if (clesSecours.length) {
            const aspects = { ...(pf.lbcAspects && typeof pf.lbcAspects === "object" ? pf.lbcAspects : {}) };
            const poses = [];
            for (const [k, v] of Object.entries(secours)) {
              if (String(aspects[k] ?? "").trim()) continue;
              aspects[k] = v;
              poses.push(`${k} ← « ${v} »`);
            }
            if (poses.length) {
              pf.lbcAspects = aspects;
              pf.lbcFeuillesDeSecours = { at: new Date().toISOString(), poses };
              console.log(`[publish] leboncoin — feuille incertaine, paires de secours posées : ${poses.join(" ; ")}`);
            }
          }
        }
      }
      // ── ORDRE DES CRITÈRES DANS lbcAspects (2026-09-07) ──────────────
      // Sur les 6 feuilles Maison & Jardin, la liste « Produit » DÉPEND de
      // l'Univers/Type et se VIDE quand celui-ci change : poser Produit
      // avant lui le perdrait. La 0.6.21 trie par position dans le DOM ;
      // les versions ≤ 0.6.20 parcourent lbcAspects dans l'ordre
      // D'INSERTION des clés — c'est-à-dire l'ordre des saisies dans
      // l'app, qui ne garantit rien. On réordonne donc ici, une fois, à
      // l'insert du job : Univers/Type d'abord, Produit ensuite.
      //
      // ⛔ ET SURTOUT : ON NE POSE PLUS DE MIROIR lbcProduit. C'était
      // l'intention première de ce bloc, et elle était FAUSSE : sur les
      // extensions ≤ 0.6.20, un lbcProduit non vide fait SAUTER toutes les
      // clés `_type` du canal générique (dedieAvaitValeur), donc le
      // « Produit » de Décoration n'aurait jamais été posé — exactement le
      // bug qu'on corrige (job 2374ed7f : lbcProduit = « Objet décoratif »,
      // l'Univers, et Produit resté vide). Sans miroir, ces versions
      // posent les DEUX critères par le canal générique. lbcProduit reste
      // réservé aux routes qui l'écrivent vraiment (Équipement bébé,
      // Vêtements bébé, plus bas).
      if (pf.lbcAspects && typeof pf.lbcAspects === "object") {
        const catKey = Array.isArray(pf.lbcCategoryPath) ? pf.lbcCategoryPath.join(" > ") : "";
        const clePremier = lbcClePremierCombobox(catKey);
        const rang = (k) => (k === clePremier ? 0 : /_type$/.test(k) && !/^decoration_type$/.test(k) ? 1 : 2);
        const ordonne = {};
        for (const [k, v] of Object.entries(pf.lbcAspects).sort((a, b) => rang(a[0]) - rang(b[0]))) {
          ordonne[k] = v;
        }
        pf.lbcAspects = ordonne;
      }
      // Famille > Équipement bébé : Univers* est FONCTIONNEL
      // (Alimentation/Mobilité/…) et Produit* en dépend — deux critères
      // bloquants indéductibles du genre (relevé campagne 2026-07-08).
      // On écrase l'univers genre (IA/stepper) par la valeur mappée
      // depuis l'icône, et on pose le Produit attendu par l'extension.
      const babyEquip = getLbcBabyEquipment(icon);
      if (babyEquip) {
        pf.univers = babyEquip.univers;
        pf.lbcProduit = babyEquip.produit;
      }
      // ── Vêtements/chaussures ENFANT (2026-07-15) — relevé DOM réel :
      // LBC a DEUX foyers de tailles enfant STRUCTURÉES (l'assertion
      // historique « pas de champ Taille côté LBC » était fausse) :
      //   - Famille > Vêtements bébé : Prématuré → 36 mois, Produit*
      //     OBLIGATOIRE — seule feuille à porter la grille 0-36 mois ;
      //   - Mode > Vêtements : grille enfant 3 → 18 ans SEULEMENT si
      //     Univers = Enfant/Fille/Garçon. Un Univers adulte poserait la
      //     grille ADULTE en silence (seul risque résiduel identifié par
      //     le relevé) → on FORCE l'Univers depuis le genre détecté.
      // Le genre vient de la copie LBC elle-même (univers IA), sinon des
      // copies sœurs du même run, sinon de l'auto-résolution.
      const childGenre = [
        pf.univers,
        edited.vinted?.platform_fields?.genre,
        edited.beebs?.platform_fields?.genre,
        edited.ebay?.platform_fields?.genre,
        autoGenre,
      ].find(g => isChildGenre(g)) ?? null;
      const sizeRoute = lbcChildSizeCategory(pf.taille); // "bebe" | "mode" | null
      const babyClothingProduct = getLbcBabyClothingProduct(icon);
      if (babyClothingProduct && lbcPath?.[0] === "Mode" &&
          (sizeRoute === "bebe" || (!sizeRoute && childGenre === "Bébé"))) {
        // Taille en mois (ou article Bébé sans taille exploitable) sur un
        // article d'habillement : la vraie feuille est Vêtements bébé.
        // Pas d'Univers sur cette feuille (relevé : Genre facultatif,
        // Produit*, Taille) — le filet Mixte ci-dessous ne s'applique pas.
        pf.lbcCategoryPath = ["Famille", "Vêtements bébé"];
        pf.lbcProduit = babyClothingProduct;
      } else if (childGenre && lbcPath?.[0] === "Mode") {
        // Fille/Garçon/Enfant sont des valeurs RÉELLES du dropdown
        // Univers (relevé 2026-07-15) ; « Bébé » n'y existe pas → Enfant
        // (cas chaussures/accessoires bébé restés sur le rayon Mode).
        pf.univers = childGenre === "Bébé" ? "Enfant" : childGenre;
      }
      // Univers obligatoire sur le rayon Mode LBC ("Veuillez choisir un
      // univers de vêtement"). Contrairement à Vinted, LBC a un rayon
      // Mixte → filet sans friction quand l'IA n'a pas tranché.
      if (!pf.univers && lbcPath?.[0] === "Mode" &&
          pf.lbcCategoryPath?.[1] !== "Vêtements bébé") pf.univers = "Mixte";
    }
    if (platform === "vinted") {
      // Chemin catalogue Vinted calculé à l'insert : icône objet (mêmes
      // règles que les tuiles Stock/Ventes) + genre IA/corrigé. null →
      // pas de categoryPath → l'extension marque le job "failed" avec un
      // message explicite (fallback volontaire, cf. vintedCategories.js).
      const icon = iconeArticle; // passée au garde-fou, comme les 3 autres
      // Genre vide/Mixte sur une catégorie qui l'exige → genre auto-résolu
      // (cf. bloc autoGenre) : le job part avec un rayon réel au lieu
      // d'être condamné au fallback.
      if (autoGenre && vintedGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
      // Titre de la copie joint (2026-08-08, B3b) : il affine la feuille
      // enfant (body → Bodies, manteau → Manteaux) — même chemin sinon.
      const categoryPath = parMot?.chemin ?? getVintedCategoryPath(icon, pf.genre, edited[platform]?.title ?? "");
      if (categoryPath) pf.categoryPath = categoryPath;
      if (!parMot?.chemin && categoryPath) poseParIcone.vinted = { chemin: categoryPath, id: null };
      // ── Les deux champs que Vinted EXIGE au rayon des jeux ────────────
      // Relevé du 20/09 (platform_category_aspects) : « Jeux » comme
      // « Consoles » exigent `video_game_platform` (48 valeurs), et
      // « Jeux » exige en plus `video_game_ratings` (17 valeurs) — le
      // classement par âge. Sans eux, le dépôt s'arrête et l'app ne savait
      // rien ouvrir : cas « Rage 2 » d'ornellaracano (04/09), où le seul
      // geste possible était d'aller les remplir sur Vinted.
      // ⚠️ `video_game_ratings` est au PLURIEL — vérifié en prod : le job
      //    8256bf6d (« Bravely Default II ») est PUBLIÉ avec cette clé.
      // ⛔ LA PLATEFORME DE JEU SE LIT (« PS5 », « Switch » sont dans le
      //    titre), LE CLASSEMENT PAR ÂGE NE SE DEVINE PAS : on ne pose que
      //    ce qui est ÉCRIT noir sur blanc (« PEGI 12 »). Rien d'écrit →
      //    champ laissé vide, et le stepper pose la question avec la liste
      //    relevée. Un PEGI faux fait retirer l'annonce.
      // ⛔ Une valeur déjà posée par l'utilisateur (stepper, mini-éditeur)
      //    n'est JAMAIS écrasée.
      if (jeuVideo) {
        const aspectsJv = { ...(pf.vintedAspects && typeof pf.vintedAspects === "object" ? pf.vintedAspects : {}) };
        const plateformeJeu = jeuVideo.machine?.vinted ?? null;
        if (plateformeJeu && !String(aspectsJv[VINTED_CHAMP_PLATEFORME] ?? "").trim()) {
          aspectsJv[VINTED_CHAMP_PLATEFORME] = plateformeJeu;
        }
        const classement = classementPourPlateforme("vinted", classementConnu);
        if (classement && jeuVideo.famille === "jeu" && !String(aspectsJv[VINTED_CHAMP_CLASSEMENT] ?? "").trim()) {
          aspectsJv[VINTED_CHAMP_CLASSEMENT] = classement;
        }
        if (Object.keys(aspectsJv).length) pf.vintedAspects = aspectsJv;
      }
      // Flag statique lu par l'extension : permet un message d'échec
      // précis ("genre requis") quand un job sans categoryPath vient d'un
      // article de mode plutôt que d'une icône hors mapping.
      if (vintedGenreRequired(icon)) pf.vintedGenreRequired = true;
      // L'extension consomme `colors` (tableau, 2 max côté Vinted).
      // NORMALISATION vers la palette FERMÉE Vinted (2026-07-30, job
      // 243097d4 : couleur IA "Argent" ∉ palette → champ laissé vide →
      // 400 serveur "Le champ Couleur doit être renseigné"). Le split
      // brut d'avant laissait passer n'importe quel libellé ; désormais
      // colors ne porte QUE des libellés exacts (variantes normalisées :
      // Argent→Argenté, Or→Doré…, composés éclatés : "Bleu gris" →
      // Bleu + Gris, 2 max, dominante d'abord). Rien ne se normalise →
      // colors ABSENT + color_unmapped = valeur brute, requêtable :
      //   platform_fields->>'color_unmapped' IS NOT NULL
      // Vinted UNIQUEMENT : les couleurs LBC/Beebs sont des champs
      // libres ("Argent" y passe très bien), eBay fait son propre split.
      if (pf.couleur) {
        const { colors, unmapped } = normalizeVintedColors(pf.couleur);
        if (colors.length) {
          pf.colors = colors;
        } else {
          delete pf.colors;
          if (unmapped) pf.color_unmapped = unmapped;
        }
      }
    }
    if (platform === "ebay") {
      // Catégorie eBay posée à l'insert : categoryPath (libellés, pour
      // les messages d'erreur et la vérification post-navigation) ET
      // categoryId numérique (c'est LUI que l'extension met dans l'URL
      // /sl/list — le path ne sert jamais à naviguer). Genre : les
      // valeurs du stepper (Femme/Homme/Enfant) passent TELLES QUELLES
      // — eBay a un vrai rayon "Enfant : unisexe" (contrairement à
      // Vinted/Beebs) ; seul Mixte reste sans rayon (sauf 🌸 parfums).
      const icon = iconeArticle; // passée au garde-fou, comme les 3 autres
      // Même auto-résolution que Vinted — sauf si le genre actuel résout
      // déjà un rayon (🌸+Mixte = Parfums mixtes, rayon réel).
      if (autoGenre && ebayGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")
          && !getEbayCategoryId(icon, pf.genre)) pf.genre = autoGenre;
      // ⚠️ eBay NAVIGUE PAR IDENTIFIANT, pas par chemin (c'est lui qui va
      // dans l'URL /sl/list ; le chemin ne sert qu'aux messages et à la
      // vérification). Un chemin venu du mot avec un identifiant venu de
      // l'icône publierait dans une catégorie qui ne correspond PAS au
      // libellé affiché — le pire des deux mondes, et invisible. On ne
      // retient donc le mot que s'il porte les DEUX.
      const parMotEbay = parMot?.id ? parMot : null;
      const categoryPath = parMotEbay?.chemin ?? getEbayCategoryPath(icon, pf.genre);
      const categoryId = parMotEbay?.id ?? getEbayCategoryId(icon, pf.genre);
      if (categoryPath) pf.ebayCategoryPath = categoryPath;
      if (categoryId) pf.ebayCategoryId = categoryId;
      // Le classement d'âge voyage aussi chez eBay (20/09). Relevé sur la
      // feuille « Jeux » (139973) : aspect « Classification », FACULTATIF,
      // 5 valeurs — les cinq PEGI, écrites EXACTEMENT comme chez Vinted.
      // Les 12 autres valeurs de Vinted (USK, ESRB, « Non précisé »)
      // n'existent pas ici : classementPourPlateforme rend null et on ne
      // pose rien. Facultatif = jamais bloquant : sans valeur, l'annonce
      // part quand même.
      if (jeuVideo?.famille === "jeu") {
        const classementEbay = classementPourPlateforme("ebay", classementConnu);
        const aspectsEbay = { ...(pf.ebayAspects && typeof pf.ebayAspects === "object" ? pf.ebayAspects : {}) };
        if (classementEbay && !String(aspectsEbay[EBAY_ASPECT_CLASSEMENT] ?? "").trim()) {
          aspectsEbay[EBAY_ASPECT_CLASSEMENT] = classementEbay;
          pf.ebayAspects = aspectsEbay;
        }
      }
      if (!parMotEbay && categoryPath && categoryId) poseParIcone.ebay = { chemin: categoryPath, id: String(categoryId) };
      if (ebayGenreRequired(icon)) pf.ebayGenreRequired = true;
      // Couleur : l'extension consomme colors[0] (les specifics eBay
      // Couleur sont mono-valeur) — même split que Vinted, dominante
      // d'abord.
      if (pf.couleur && !pf.colors) {
        const colors = String(pf.couleur)
          .split(/\s+et\s+|[,/&+]/i)
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 2);
        if (colors.length) pf.colors = colors;
      }
    }
    if (platform === "beebs") {
      // Même contrat que Vinted/eBay : chemin catalogue calculé à
      // l'insert depuis l'icône objet + genre. beebsCategories.js gère
      // déjà lui-même le cas Enfant/Mixte/vide → null (genre Beebs a 5
      // valeurs Femme/Homme/Fille/Garçon/Bébé, pas de résolution
      // automatique depuis Enfant pour l'instant, cf. commentaire de
      // tête du fichier) — pas de blocage dur ici, comme eBay : le flag
      // beebsGenreRequired est posé pour que l'extension retourne un
      // needsUser explicite plutôt qu'un échec silencieux.
      const icon = iconeArticle; // passée au garde-fou, comme les 3 autres
      // Même auto-résolution que Vinted/eBay. Indispensable ici : l'arbre
      // Mode Beebs est genré jusqu'aux accessoires (montres, bijoux,
      // sacs…) — sans genre, AUCUNE montre ne pouvait jamais partir
      // (pré-check extension → failed à 100 %, cas réel Casio 2026-07-09).
      if (autoGenre && beebsGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
      const categoryPath = parMot?.chemin ?? getBeebsCategoryPath(icon, pf.genre);
      if (categoryPath) pf.beebsCategoryPath = categoryPath;
      // « Console » est un champ REQUIS de la feuille « Consoles de jeux »
      // (18 valeurs relevées le 20/09). Il n'existe PAS au relevé de la
      // feuille « Jeux vidéo » : on ne le pose donc que pour une machine,
      // là où on sait qu'il est attendu — on ne sème pas un champ qu'on
      // n'a jamais vu.
      if (jeuVideo?.famille === "console" && jeuVideo.machine?.beebs) {
        const aspectsBeebs = { ...(pf.beebsAspects && typeof pf.beebsAspects === "object" ? pf.beebsAspects : {}) };
        if (!String(aspectsBeebs["Console"] ?? "").trim()) {
          aspectsBeebs["Console"] = jeuVideo.machine.beebs;
          pf.beebsAspects = aspectsBeebs;
        }
      }
      if (!parMot?.chemin && categoryPath) poseParIcone.beebs = { chemin: categoryPath, id: null };
      if (beebsGenreRequired(icon)) pf.beebsGenreRequired = true;
      // Format du colis (généralisation 2026-07-19 soir) : requis Beebs
      // sur des catégories de TOUT l'arbre (15 au catalogue : Mode,
      // Jouets, Puériculture, beauté…), mais le prompt Beebs de
      // generate-listing ne produit PAS format_colis — seule la copie LBC
      // le porte. On sème donc la valeur LBC quand la copie Beebs n'en a
      // pas : beebs.js la mappe sur ses paliers de poids
      // (BEEBS_PACKAGE_BY_FORMAT) et ne retombe sur le défaut prudent
      // 1 kg qu'à défaut de toute donnée.
      if (!String(pf.format_colis ?? "").trim()) {
        const lbcFormat = String(edited.leboncoin?.platform_fields?.format_colis ?? "").trim();
        if (lbcFormat) pf.format_colis = lbcFormat;
      }
    }
    if (platform === "opla") {
      // ── OPLA (2026-09-17 soir) — champs attendus par le connecteur
      // (content-scripts/opla-prevol.js, docs/OPLA_MAPPING.md § 2) :
      // oplaCategoryCode (feuille), etat (5 codes), marque (obligatoire,
      // texte libre), taille (code de la grille de la feuille), couleurs[]
      // / matieres[] (résolus par le pré-vol contre la liste de la feuille,
      // l'inconnu est JETÉ avec avertissement — jamais envoyé tel quel).
      // Catégorie : le MOT → feuille Opla (categorieParMot, id = code).
      // Sans feuille certaine on ne pose RIEN : le pré-vol pose alors la
      // question avec les options du NIVEAU qui a échoué (jamais les 8
      // racines — défaut Blaf69 du 16/09, à ne pas reproduire).
      const parMotOpla = parMot?.id ? parMot : null;
      if (parMotOpla) {
        pf.oplaCategoryCode = String(parMotOpla.id);
        pf.oplaCategoryPath = parMotOpla.chemin;
      }
      const codeEtat = OPLA_ETAT_PAR_LIBELLE[texteComparable(String(pf.etat ?? "")).toLowerCase()];
      if (codeEtat) { pf.opla_etat_libelle = pf.etat; pf.etat = codeEtat; }
      // Marque obligatoire chez Opla (« La marque est obligatoire. »),
      // champ libre : « Sans marque » dit l'absence, comme sur Vinted.
      if (!String(pf.marque ?? "").trim()) pf.marque = "Sans marque";
      if (pf.taille) pf.taille = String(pf.taille).replace(/^EU\s*/i, "").trim();
      if (pf.couleur) {
        pf.couleurs = String(pf.couleur).split(/\s+et\s+|[,/&+]/i).map(s => s.trim()).filter(Boolean).slice(0, 3);
      }
      if (pf.matiere) pf.matieres = [String(pf.matiere).trim()].filter(Boolean);
    }
    // ── Tailles ENFANT (2026-07-15) : conversion canonique → libellé
    // EXACT de la plateforme (référentiel childSizes.js, relevé DOM réel
    // docs/sizes-baby-child-raw.txt). Les copies affichées gardent la
    // canonique (« 6 mois ») ; seul le JOB porte le libellé plateforme
    // (« 3-6 mois / 62 cm » Vinted, « 6 mois (60-66 cm) » Beebs…) pour
    // que les cascades des content scripts matchent en EXACT — la garde
    // anti-nombre-nu des scripts interdit désormais le fuzzy numérique
    // sur les champs taille. Placée APRÈS les blocs plateforme : le genre
    // auto-résolu (autoGenre) doit déjà être posé — les pointures ne
    // convertissent que sur genre enfant (« EU 38 » existe en adulte).
    // null (pas d'équivalent exact, ex. « 18 ans » hors LBC) → canonique
    // conservée : échec de cascade VISIBLE plutôt que taille fausse.
    // ── UNE TAILLE QUE PERSONNE N'A DITE N'EST PAS UNE TAILLE (2026-09-21) ──
    // Jobs fd5c84be et 837d2c8a (meminiandmove) : deux lots de BARRETTES À
    // CHEVEUX, fiche sans aucune taille, titre « Lot de 2 barrettes Marie Les
    // Aristochats Disney ». La rédaction a posé « Prématuré » sur les copies
    // Leboncoin, Opla et Beebs — pas sur Vinted. Les deux sont parties EN LIGNE
    // avec une taille de vêtement de nouveau-né, et sur Beebs le rayon exige
    // une taille de SA liste : le job est mort dessus.
    // Le prompt disait déjà « ne devine JAMAIS ». Une consigne de prompt n'est
    // pas une garde ; celle-ci en est une, et elle est déterministe.
    // Mesuré sur tout le parc publié : 10 annonces en ligne portent une taille
    // que leur fiche ne dit pas (leboncoin 3, vinted 3, beebs 2, opla 2,
    // ebay 0) sur 4 comptes — dont les 5 barrettes/chouchous en « Prématuré »
    // et un « 12 mois » sur un article dont le titre est littéralement
    // « Article ».
    // ⛔ CE QUI EST GARDÉ, ET POURQUOI (cf. utils/tailleInventee.js) : la
    //    fiche, le texte de l'article, la valeur neutre — et TOUT ce que la
    //    personne a touché elle-même (encart partagé ou carte de la copie).
    //    On ne jette que ce que personne n'a dit.
    if (pf.taille) {
      const editeeIci = Boolean(sharedOverrides[platform]?.has("taille"));
      const partagee = String(sharedFields.taille ?? "").trim();
      const verdict = tailleAGarder(pf.taille, {
        tailleFiche: String(
          initialListing?.attributs?.taille?.v ?? initialListing?.attributs?.taille ?? initialListing?.taille ?? "",
        ),
        texte: `${initialListing?.titre ?? ""} ${initialListing?.description ?? ""}`,
      });
      if (!editeeIci && !partagee && !verdict.garder) {
        console.warn(`[publish] ${platform} — taille « ${pf.taille} » ÉCARTÉE : ${verdict.motif}`);
        pf.taille_ecartee = { valeur: pf.taille, motif: verdict.motif, le: new Date().toISOString() };
        delete pf.taille;
      }
    }
    if (pf.taille) {
      const converted = toPlatformChildSize(pf.taille, platform, {
        isChildGenre: isChildGenre(pf.genre) || isChildGenre(pf.univers),
      });
      if (converted) pf.taille = converted;
    }
    pfParPlateforme[platform] = pf;
  }

  const rows = plateformesAPublier
    .filter((platform) => pfParPlateforme[platform])
    .map((platform) => ({ platform, platform_fields: pfParPlateforme[platform] }));

  // ══ VÉRIFICATION DU CHEMIN TIRÉ DE L'ICÔNE CONTRE LE MOT (2026-09-08 soir) ══
  // Cas fondateur : deux soutiens-gorge (Marie-Pierre, 08/09 15:24 et 15:25)
  // publiés sur Beebs en « Nuit et pyjamas > Pyjamas (femme) », avec
  // categorie_objet_ia = « soutien-gorge » et categorie_source =
  // catalog_vinted. MESURÉ : l'étape 3 avait bien tourné (arbitrage du
  // legging voisin dans categorie_journal à 15:24:17), mais l'arbre Beebs
  // n'a AUCUNE feuille lingerie hors maternité → zéro candidate → aucun
  // appel → le chemin de l'ICÔNE (🩲 → Pyjamas) partait tel quel, étiqueté
  // « catalog_vinted » par le garde-fou — une étiquette qui ne certifie que
  // la BRANCHE (Mode / Femme), jamais la feuille. Sur les 22 jobs Beebs
  // « catalog_vinted » de 3 jours, 18 portaient le mot et aucun ne l'avait
  // utilisé. Le mot juste était en main et ne servait à rien.
  // RÈGLE : un chemin qui ne vient PAS du mot (icône, transposition du
  // catalogue Vinted, garde-fou) est VÉRIFIÉ contre le mot avant de partir,
  // sur les quatre plateformes : l'IA reçoit ce chemin ET les voisines
  // ratissées à l'étape 3, et tranche — même resolve-categorie, mêmes clés
  // opaques, même « aucune » légitime. Confirmé → il part, tracé. Une
  // voisine préférée → elle remplace (source ia_parmi_candidats). « Aucune »
  // → INCOHÉRENCE : ce chemin ne part pas tel quel. Beebs n'expose aucune
  // suggestion : le job part SANS chemin et l'extension le met en needs_user
  // en disant pourquoi (categorie_a_choisir). Vinted, eBay, Leboncoin
  // gardent le chemin mais FLAGUÉ incertain → la suggestion de la
  // plateforme gagne (règle n°2, déjà câblée des trois côtés).
  // ⛔ Sans mot (categorie_objet_ia absent), rien à vérifier : rien ne change.
  // ⛔ IA injoignable : rien ne change non plus — on ne bloque pas un dépôt
  //    sur une panne, on le trace (categorie_verification absent).
  // Coût : un appel Haiku de plus par publication concernée (≈ 0,0013 $,
  // mesuré le 07/09), soit au pire quelques centimes par jour.
  if (motCategorie && Object.keys(poseParIcone).length) {
    const cle = (chemin) => (Array.isArray(chemin) ? chemin : [chemin])
      .map(s => texteComparable(String(s ?? ""))).join(" > ");
    const memeChemin = (a, b) => cle(a) === cle(b);
    const candidatsVerif = {};
    for (const [pfKey, pose] of Object.entries(poseParIcone)) {
      const voisines = (candidatsRatisses[pfKey] ?? []).filter(c => !memeChemin(c.chemin, pose.chemin));
      candidatsVerif[pfKey] = [{ chemin: pose.chemin, id: pose.id ?? null }, ...voisines].slice(0, 20);
    }
    let reponse = null;
    try {
      const { data } = await supabase.functions.invoke("resolve-categorie", {
        body: {
          titre: initialListing?.titre || edited[plateformesAPublier[0]]?.title || "",
          attributs: {
            genre: sharedFields.genre || autoGenre || "",
            taille: sharedFields.taille || initialListing?.taille || "",
            marque: sharedFields.marque || initialListing?.marque || "",
            objet: motCategorie,
          },
          candidats: candidatsVerif,
        },
      });
      reponse = data ?? null;
    } catch (e) {
      console.warn("[publish] vérification du chemin de l'icône : resolve-categorie injoignable — chemins conservés :", e?.message ?? e);
    }
    const choixVerif = reponse && reponse.motif !== "ia_indisponible" && reponse.choix && typeof reponse.choix === "object"
      ? reponse.choix : null;
    if (choixVerif) {
      // eBay NAVIGUE PAR IDENTIFIANT : un chemin sans id n'y remplace rien.
      const poserChemin = (platform, pf, chemin, id) => {
        if (platform === "vinted") pf.categoryPath = chemin;
        else if (platform === "beebs") pf.beebsCategoryPath = chemin;
        else if (platform === "leboncoin") pf.lbcCategoryPath = chemin;
        else if (platform === "ebay") { if (!id) return false; pf.ebayCategoryPath = chemin; pf.ebayCategoryId = id; }
        return true;
      };
      for (const row of rows) {
        const pose = poseParIcone[row.platform];
        if (!pose) continue;
        const pf = row.platform_fields;
        const choix = choixVerif[row.platform] ?? null;
        const cheminChoisi = Array.isArray(choix?.chemin) && choix.chemin.length ? choix.chemin : null;
        const trace = { objet: motCategorie, chemin_icone: pose.chemin, source_avant: pf.categorie_source ?? null };
        if (cheminChoisi && memeChemin(cheminChoisi, pose.chemin)) {
          pf.categorie_verification = { ...trace, verdict: "confirme" };
          continue;
        }
        if (cheminChoisi && poserChemin(row.platform, pf, cheminChoisi, choix.id ?? null)) {
          pf.categorie_source = "ia_parmi_candidats";
          pf.categorie_par_mot = {
            mot: motCategorie, mot_source: motCategorieSource, chemin: cheminChoisi, id: choix.id ?? null, choisi_par_ia: true, apres_verification: true,
          };
          delete pf.categorie_incertaine;
          delete pf.lbcCategorieIncertaine;
          pf.categorie_verification = { ...trace, verdict: "remplace", chemin_retenu: cheminChoisi };
          console.log(`[publish] ${row.platform} — « ${motCategorie} » : l'IA préfère « ${cheminChoisi.join(" > ")} » au chemin de l'icône « ${pose.chemin.join(" > ")} »`);
          continue;
        }
        // INCOHÉRENCE : l'IA refuse le chemin de l'icône et n'en retient aucun autre.
        pf.categorie_verification = { ...trace, verdict: "incoherent" };
        pf.categorie_source = "icone_non_confirmee";
        console.warn(`[publish] ${row.platform} — « ${motCategorie} » : le chemin de l'icône « ${pose.chemin.join(" > ")} » est INCOHÉRENT avec le mot — il ne part pas tel quel`);
        if (row.platform === "beebs") {
          delete pf.beebsCategoryPath;
          pf.categorie_a_choisir = { objet: motCategorie, chemin_ecarte: pose.chemin };
        } else {
          pf.categorie_incertaine = true;
          if (row.platform === "leboncoin") pf.lbcCategorieIncertaine = true;
        }
      }
    }
  }

  // ══ LE DERNIER RECOURS — DESCENDRE L'ARBRE, AVANT DE DIRE « IMPUBLIABLE » ══
  // (2026-09-21, jobs fd5c84be « barrette » et 1ad1434a « maillot de basket »)
  // À ce point, pour Beebs, `categorie_a_choisir` est écrit : le job partira
  // SANS chemin et le handler dira « Beebs n'a pas de rayon reconnu pour
  // « barrette » […] cet article n'est pas publiable sur Beebs tel quel ».
  // C'était FAUX les deux fois — les rayons existent (« Accessoires (fille) »,
  // « Hauts et t-shirts de sport (homme) »), mais ils ne partagent aucun mot
  // avec l'objet, donc le ratissage ne les avait jamais proposés et l'IA
  // n'avait pas pu les choisir. Elle a refusé une liste fausse, pas l'article.
  //
  // ON REDESCEND DONC L'ARBRE AVEC ELLE, NIVEAU PAR NIVEAU, comme un vendeur
  // le ferait à l'écran : six racines, puis les enfants du rayon choisi, et
  // ainsi de suite. Mesuré le 21/09 en appelant resolve-categorie pour de vrai
  // sur le maillot NBA : 312 feuilles d'un coup → « aucune » ; 65 → la bonne ;
  // 42 → la bonne ; 8 → la bonne. Une liste qu'on ne peut pas lire ne se
  // tranche pas — c'est la leçon des questions Opla, appliquée à l'IA.
  //
  // ⛔ ELLE GARDE LE DROIT DE REFUSER, À CHAQUE NIVEAU. Un « aucune » arrête
  //    la descente et le refus d'origine tient : mieux vaut pas de rayon qu'un
  //    rayon faux, et certains articles n'en ont vraiment pas chez Beebs.
  // ⛔ UNIQUEMENT SUR LE CHEMIN D'ÉCHEC : on n'entre ici qu'après un verdict
  //    « incohérent », c'est-à-dire juste avant de perdre l'annonce. Aucune
  //    publication qui marche aujourd'hui ne passe par là.
  // ⛔ ET SEULEMENT SUR UN ARBRE QUI SE DESCEND : Beebs (579 feuilles),
  //    Leboncoin (79), Opla (886). Vinted (2 489) et eBay (des dizaines de
  //    milliers) ne sont pas de cette taille et n'essaient pas.
  const ARBRES_DESCENDABLES = new Set(["beebs", "leboncoin", "opla"]);
  const PALIERS_MAX = 8;
  const aSauver = rows.filter((r) =>
    r.platform_fields?.categorie_verification?.verdict === "incoherent"
    && ARBRES_DESCENDABLES.has(r.platform));
  if (motCategorie && aSauver.length) {
    const genreVerif = sharedFields.genre || autoGenre || "";
    const attributsVerif = {
      genre: genreVerif,
      taille: sharedFields.taille || initialListing?.taille || "",
      marque: sharedFields.marque || initialListing?.marque || "",
      objet: motCategorie,
    };
    const titreVerif = initialListing?.titre || edited[plateformesAPublier[0]]?.title || "";
    for (const r of aSauver) {
      const pf = r.platform_fields;
      let chemin = [];
      let appels = 0;
      const journal = [];
      try {
        for (let palier = 0; palier < PALIERS_MAX; palier++) {
          const { options, feuille } = await niveauSousChemin(r.platform, chemin, { genre: genreVerif });
          if (feuille && !options.length) break;
          if (!options.length) break;
          // Un seul chemin possible : on ne dérange pas l'IA pour ça.
          if (options.length === 1) { chemin = options[0]; journal.push(`${chemin[chemin.length - 1]} (seul)`); continue; }
          const { data } = await supabase.functions.invoke("resolve-categorie", {
            body: {
              titre: titreVerif, attributs: attributsVerif,
              candidats: { [r.platform]: options.map((c) => ({ chemin: c, id: null })) },
              // Le branchement maximal des arbres descendables, relevé le 21/09 :
              // Beebs 19, Leboncoin 14, Opla 22. 25 couvre le plus large sans
              // jamais tronquer un niveau — et le serveur borne de toute façon.
              max_candidats: 25,
            },
          });
          appels++;
          const choix = data && data.motif !== "ia_indisponible" ? (data.choix?.[r.platform] ?? null) : null;
          const suivant = Array.isArray(choix?.chemin) && choix.chemin.length ? choix.chemin : null;
          if (!suivant) { journal.push(`aucune parmi ${options.length}`); chemin = []; break; }
          chemin = suivant;
          journal.push(`${chemin[chemin.length - 1]} (parmi ${options.length})`);
          if (await estFeuilleDeLArbre(r.platform, chemin)) break;
        }
      } catch (e) {
        console.warn(`[publish] dernier recours ${r.platform} : interrompu —`, e?.message ?? e);
        chemin = [];
      }
      // ⛔ UNE FEUILLE, OU RIEN. Un nœud intermédiaire n'est pas déposable : le
      //    refus d'origine vaut mieux qu'un chemin qui s'arrête en route.
      if (!chemin.length || !(await estFeuilleDeLArbre(r.platform, chemin))) {
        console.log(`[publish] dernier recours ${r.platform} — « ${motCategorie} » : ${journal.join(" | ") || "rien à descendre"} → le refus tient (${appels} appel(s))`);
        continue;
      }
      // ── LA DESCENTE PROPOSE, ELLE NE DÉCIDE PAS SEULE (2026-09-21) ────────
      // Job f4c1d7ef (derbies André de philippaa) : la descente rend
      // « Chaussures à talon (femme) » pour un derby PLAT — Beebs n'a aucune
      // feuille pour ce type de chaussure, et à chaque palier les options
      // restaient plausibles ; seul le DERNIER ne l'était plus, et elle a pris
      // la moins mauvaise au lieu de rendre la main.
      // Deux gardes, dans cet ordre, et aucune ne coûte quoi que ce soit quand
      // la feuille est juste :
      //   1. L'ALERTE DU 20/09, réutilisée telle quelle (utils/rayonIncoherent)
      //      — un rayon dont l'âge ou le sexe contredit la fiche ne part pas.
      //      Déterministe, gratuite, et c'est déjà le vocabulaire que la carte
      //      du stepper affiche au vendeur.
      //   2. UNE DERNIÈRE QUESTION, la feuille SEULE : « est-ce bien là ? ».
      //      L'IA a le droit de dire non, et elle le dit. MESURÉ le 21/09 sur
      //      les quatre cas réels, deux passages chacun : barrette ✓✓,
      //      barrette ✓✓, maillot NBA ✓✓, derbies ✗✗.
      // Un refus laisse `categorie_a_choisir` en place — le job ne part pas
      // dans un rayon faux — mais il porte désormais le chemin PROPOSÉ : la
      // personne voit ce qu'on avait trouvé, et tranche.
      const incoherence = rayonContreditLaFiche(chemin, pf);
      let confirme = !incoherence;
      if (confirme) {
        try {
          const { data } = await supabase.functions.invoke("resolve-categorie", {
            body: {
              titre: titreVerif, attributs: attributsVerif,
              candidats: { [r.platform]: [{ chemin, id: null }] },
            },
          });
          appels++;
          confirme = Boolean(data && data.motif !== "ia_indisponible"
            && Array.isArray(data.choix?.[r.platform]?.chemin)
            && data.choix[r.platform].chemin.length);
        } catch (e) {
          // IA injoignable : on ne publie pas sur une confirmation qu'on n'a
          // pas eue. Le refus d'origine tient, comme avant ce lot.
          console.warn(`[publish] dernier recours ${r.platform} : confirmation injoignable —`, e?.message ?? e);
          confirme = false;
        }
      }
      if (!confirme) {
        const pourquoi = incoherence
          ? `le rayon dit « ${incoherence.rayon} » et la fiche dit « ${incoherence.fiche} »`
          : "l'IA ne confirme pas que cette feuille décrive l'article";
        console.log(`[publish] dernier recours ${r.platform} — « ${chemin.join(" > ")} » ÉCARTÉ : ${pourquoi}`);
        pf.categorie_a_choisir = {
          ...(pf.categorie_a_choisir ?? {}),
          objet: motCategorie,
          chemin_propose: chemin,
          motif_propose: pourquoi,
        };
        pf.categorie_verification = {
          ...(pf.categorie_verification ?? {}), verdict: "descente_non_confirmee",
          chemin_propose: chemin, paliers: journal, appels, pourquoi,
        };
        continue;
      }
      if (r.platform === "beebs") pf.beebsCategoryPath = chemin;
      else if (r.platform === "leboncoin") pf.lbcCategoryPath = chemin;
      else if (r.platform === "opla") pf.oplaCategoryPath = chemin;
      pf.categorie_source = "ia_descente_arbre";
      pf.categorie_par_mot = {
        mot: motCategorie, mot_source: motCategorieSource, chemin, id: null,
        choisi_par_ia: true, descente_arbre: true,
      };
      pf.categorie_verification = {
        ...(pf.categorie_verification ?? {}), verdict: "descente_arbre",
        chemin_retenu: chemin, paliers: journal, appels,
      };
      delete pf.categorie_a_choisir;
      delete pf.categorie_incertaine;
      delete pf.lbcCategorieIncertaine;
      console.log(`[publish] dernier recours ${r.platform} — « ${motCategorie} » → « ${chemin.join(" > ")} » (${journal.join(" | ")}, ${appels} appel(s))`);
    }
  }

  // ══ PLAUSIBILITÉ DU CHEMIN FINAL — LA FAMILLE (2026-09-10) ══════════
  // Dernier contrôle avant l'insert, sur les quatre plateformes, quelle
  // que soit l'origine du chemin (mot, IA parmi candidats, icône, garde-
  // fou, vérification) : un chemin dont la famille est CONNUE et
  // INCOMPATIBLE avec la famille CERTAINE de l'objet ne part pas tel quel.
  //   · Beebs : aucune suggestion de plateforme → le job part SANS chemin
  //     et l'extension demande (categorie_a_choisir), comme pour une
  //     incohérence de mot.
  //   · Vinted, Leboncoin, eBay : chemin gardé mais FLAGUÉ incertain → la
  //     suggestion de la plateforme gagne (règle n°2, déjà câblée) ; le
  //     worker eBay, sans suggestion retenue, DEMANDE au lieu de publier
  //     dans une famille fausse (jamais une catégorie approchée en silence).
  // ⛔ Famille de l'objet inconnue → rien à contrôler, rien ne change.
  if (familleObjet) {
    const cheminDe = (platform, pf) =>
      platform === "vinted" ? pf.categoryPath
        : platform === "beebs" ? pf.beebsCategoryPath
          : platform === "leboncoin" ? pf.lbcCategoryPath
            : pf.ebayCategoryPath;
    for (const row of rows) {
      const pf = row.platform_fields;
      const chemin = cheminDe(row.platform, pf);
      if (!Array.isArray(chemin) || !chemin.length) continue;
      const verdict = plausibiliteDuChemin(row.platform, chemin, familleObjet);
      if (verdict.ok) continue;
      pf.categorie_plausibilite = {
        verdict: "hors_famille", famille_objet: familleObjet, source_famille: familleObjetDetail.source,
        famille_chemin: verdict.familleChemin, chemin_ecarte: chemin, source_avant: pf.categorie_source ?? null,
      };
      pf.categorie_source = "hors_famille";
      // ── Une confirmation IA ne survit pas à un « hors_famille » sur le
      // MÊME chemin (2026-09-12, job 1f9d4c82, ornellaracano : « Jouet
      // VTech – Trompette, mon éléphant des découvertes » → mot « trompette »
      // → Loisirs > Instruments de musique, CONFIRMÉ par la vérification du
      // chemin, puis jugé hors famille ici — deux verdicts contraires sur
      // un même job, et c'est le « confirme » qui se lisait). Le
      // « confirme » est RETIRÉ : verdict « refuse_hors_famille », l'avis
      // de l'IA conservé dans la trace (verdict_ia). Le chemin reste
      // flagué incertain ci-dessous, exactement comme pour tout autre
      // hors_famille, et l'arbitrage sur les suggestions de la plateforme
      // tranche. Rien d'autre ne bouge : ni la plausibilité (on ne fait que
      // lire son verdict), ni l'arbitrage, ni le mot du titre ; aucun
      // needs_user nouveau. Périmètre STRICT : verdict « confirme » ET même
      // chemin — « remplace », « incoherent » ou un autre chemin gardent
      // leur comportement.
      const verif = pf.categorie_verification;
      const cheminConfirme = verif && verif.verdict === "confirme" && Array.isArray(verif.chemin_icone) ? verif.chemin_icone : null;
      const cleChemin = (c) => c.map(s => texteComparable(String(s ?? ""))).join(" > ");
      const confirmationRefusee = Boolean(cheminConfirme && cleChemin(cheminConfirme) === cleChemin(chemin));
      if (confirmationRefusee) {
        pf.categorie_verification = {
          ...verif,
          verdict: "refuse_hors_famille",
          verdict_ia: "confirme",
          refuse_par: "categorie_plausibilite",
          refuse_le: new Date().toISOString(),
        };
      }
      console.warn(
        `[publish] ${row.platform} — chemin « ${chemin.join(" > ")} » (famille ${verdict.familleChemin}) HORS de la famille de l'objet (${familleObjet}, ${familleObjetDetail.source}) — il ne part pas tel quel` +
        (confirmationRefusee ? " ; la confirmation IA de ce même chemin (categorie_verification « confirme ») est REFUSÉE, l'arbitrage sur les suggestions de la plateforme tranche" : "")
      );
      if (row.platform === "beebs") {
        delete pf.beebsCategoryPath;
        pf.categorie_a_choisir = { objet: motCategorie ?? null, chemin_ecarte: chemin, motif: "hors_famille" };
      } else {
        pf.categorie_incertaine = true;
        if (row.platform === "leboncoin") pf.lbcCategorieIncertaine = true;
      }
    }
  }

  return {
    refus: null,
    pfParPlateforme,
    autoGenre,
    autoGenreDefaut,
    motCategorie,
    motCategorieSource,
    familleObjet,
    familleObjetDetail,
    poseParIcone,
    candidatsRatisses,
  };
}
