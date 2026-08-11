// ══════════════════════════════════════════════════════════════════════════
// Auto-test des garde-fous de cohérence du Lens (2026-08-11)
// ══════════════════════════════════════════════════════════════════════════
//
//     deno run --allow-net --allow-env scripts/lens-coherence-selftest.ts
//
// POURQUOI CE FICHIER EXISTE. Le 11/08 à 10:18, une pince plate Facom est
// ressortie en « Fourche à bêcher Spear & Jackson 4 dents », 22 € « basé sur
// 6 annonces Leboncoin ». Le correctif de la veille avait posé la règle de
// cohérence marque ↔ description DANS LE PROMPT : elle a été violée le
// lendemain. Les garde-fous vivent désormais dans le code, et ce fichier
// vérifie qu'ils tiennent — sur le cas réel de l'incident, ET sur les cas
// corrects qui ne doivent PAS bouger.
//
// CE QUE CE TEST COUVRE, ET CE QU'IL NE COUVRE PAS.
// Il rejoue la SORTIE du modèle à travers assainirSortie(), pas la VISION.
// C'est volontaire et c'est le bon niveau : tout l'objet du chantier est que
// le serveur rattrape l'erreur QUOI QUE le modèle réponde. La moitié vision
// (« le modèle voit-il une pince ? ») n'est pas rejouable ici — la photo de
// l'incident n'a pas été conservée (rien dans le bucket lens-temp après 09:27)
// et la clé Anthropic n'existe pas en local. Elle est traitée côté prompt, et
// se mesurera sur usage_logs (cf. docs/LENS_MULTI_CATEGORIE.md §8).
//
// ⚠️ Importer index.ts exécute son serve() : un listener s'ouvre sur le port
// 8000 le temps du test. Sans conséquence, et c'est le prix à payer pour
// tester les fonctions LÀ OÙ ELLES SONT DÉPLOYÉES plutôt qu'une copie.

import {
  assainirSortie,
  empreinteSortie,
  negationDeMarque,
  nettoyerFuites,
  retirerJustificationMarqueLue,
  retirerMarqueDuTitre,
  retirerPhrasesDePrix,
  buildSystemPrompt,
} from "../supabase/functions/lens-analysis/index.ts";

let echecs = 0;
let total = 0;

function verifier(nom: string, reel: unknown, attendu: unknown) {
  total++;
  const a = JSON.stringify(reel);
  const b = JSON.stringify(attendu);
  if (a === b) {
    console.log(`  \x1b[32m✓\x1b[0m ${nom}`);
  } else {
    echecs++;
    console.log(`  \x1b[31m✗\x1b[0m ${nom}\n      attendu : ${b}\n      obtenu  : ${a}`);
  }
}

function titre(t: string) {
  console.log(`\n\x1b[1m${t}\x1b[0m`);
}

const FR = { photos: 1, lang: "fr" as const };
const FR3 = { photos: 3, lang: "fr" as const };

// ══════════════════════════════════════════════════════════════════════════
// 1. LE CAS DE L'INCIDENT — pince Facom, 11/08 10:18
// ══════════════════════════════════════════════════════════════════════════
// Sortie modèle reconstituée à partir de ce qui a été rendu à l'utilisateur et
// des métadonnées usage_logs (photos: 1, marque_nulle: FALSE, ws: 3,
// nb_attributs: 3, confiance « moyenne », famille « jardin »).
titre("1. Incident du 11/08 10:18 — pince Facom rendue en fourche à bêcher");
{
  const item: Record<string, unknown> = {
    objet: "fourche à bêcher",
    objet_source: "lu",
    titre: "Fourche à bêcher Spear & Jackson 4 dents",
    famille: "jardin",
    marque: "Spear & Jackson",
    modele: null,
    modele_source: null,
    matiere: "Acier et bois",
    couleur: "Marron",
    etat_estime: "Bon état",
    taille_estimee: null,
    description: "Fourche à bêcher à 4 dents, manche en bois, tête en acier forgé.",
    confiance: "moyenne",
    notes:
      "Objet sans marque visible sur les photos fournie, identification basée sur la transcription lisible du manche. Confiance moyenne car marque LUE. " +
      "Marge négative : prix_vente_suggere (22€) < prix_achat_suggere (25€).",
    prix_vente_suggere: 22,
    prix_achat_suggere: 25,
    fourchette_min: 15,
    fourchette_max: 30,
    fourchette_marche: { bas: 15, moyen: 22, haut: 30 },
    annonces_marche: [{ titre: "Fourche à bêcher 4 dents", prix: 20, plateforme: "Leboncoin" }],
    vitesse_vente: "moyen",
    verdict: "eviter",
    score: 3,
    est_vendu: false,
    prix_vente_reel: null,
    attributs_visibles: { fonctionne: "oui", accessoires_manquants: "non", nb_dents: "4" },
  };
  const r = assainirSortie(item, FR);

  verifier("marque forcée à null (la note nie toute marque visible)", item.marque, null);
  verifier("drapeau marque_forcee_null levé", r.marqueForceeNull, true);
  verifier("la marque quitte aussi le titre", item.titre, "Fourche à bêcher 4 dents");
  verifier("confiance ramenée à basse", item.confiance, "basse");
  verifier("identification signalée contredite", r.identificationContredite, true);
  verifier("identification signalée incertaine", r.identificationIncertaine, true);
  verifier("exposé au client : identification_contredite", item.identification_contredite, true);
  verifier("justification « car marque LUE » retirée de la note", /marque LUE/.test(String(item.notes)), false);
  verifier("la négation, elle, est conservée", /sans marque visible/.test(String(item.notes)), true);
  verifier("drapeau note_contradiction levé", r.noteContradiction, true);
  verifier(
    "attribut fabriqué NB DENTS écarté",
    Object.keys((item.attributs_visibles ?? {}) as Record<string, string>).includes("nb_dents"),
    false,
  );
  verifier(
    "FONCTIONNE=Oui neutralisé en « non testé »",
    (item.attributs_visibles as Record<string, string>)?.fonctionne,
    "non testé",
  );
  verifier(
    "ACCESSOIRES MANQUANTS=Non supprimé",
    Object.keys((item.attributs_visibles ?? {}) as Record<string, string>).includes("accessoires_manquants"),
    false,
  );
  verifier("aucun nom de variable interne dans la note", /prix_vente_suggere|prix_achat_suggere/.test(String(item.notes)), false);
  verifier(
    "la phrase reste lisible",
    /prix de vente conseillé \(22€\) < prix d'achat estimé \(25€\)/.test(String(item.notes)),
    true,
  );
  verifier("drapeau fuite_variable levé", r.fuiteVariable, true);
  verifier(
    "… et il dit DÉSORMAIS lesquels",
    r.fuiteIdentifiants,
    ["prix_achat_suggere", "prix_vente_suggere"],
  );
  verifier("un « lu » ne survit pas à une identification non établie", item.objet_source, "deduit");
  verifier("drapeau objetDeduit levé", r.objetDeduit, true);
  verifier("empreinte : identification_incertaine remontée", empreinteSortie(item).identification_incertaine, true);
}

// ══════════════════════════════════════════════════════════════════════════
// 2. NON-RÉGRESSION — les identifications correctes ne bougent pas
// ══════════════════════════════════════════════════════════════════════════
titre("2. Non-régression — textile correctement identifié");
{
  const item: Record<string, unknown> = {
    titre: "Polo Tommy Hilfiger bleu marine taille M",
    famille: "mode",
    marque: "Tommy Hilfiger",
    modele: null,
    modele_source: null,
    matiere: "Coton",
    couleur: "Bleu",
    etat_estime: "Très bon état",
    taille_estimee: "M",
    description: "Polo Tommy Hilfiger bleu marine, logo brodé sur la poitrine, taille M lue sur l'étiquette cousue.",
    confiance: "haute",
    notes: "Marque et taille lues sur l'étiquette cousue.",
    attributs_visibles: { taille: "M", composition: "100% coton" },
    prix_vente_suggere: 18,
  };
  const r = assainirSortie(item, FR3);
  verifier("marque conservée", item.marque, "Tommy Hilfiger");
  verifier("titre intact", item.titre, "Polo Tommy Hilfiger bleu marine taille M");
  verifier("confiance haute conservée", item.confiance, "haute");
  verifier("attributs intacts", item.attributs_visibles, { taille: "M", composition: "100% coton" });
  verifier("catégorie dérivée Mode", item.categorie, "Mode");
  verifier("aucun drapeau levé", [r.marqueForceeNull, r.identificationIncertaine, r.fuiteVariable], [false, false, false]);
}

{
  const item: Record<string, unknown> = {
    titre: "Pantalon de survêtement Adidas noir taille L",
    famille: "mode",
    marque: "Adidas",
    matiere: "Polyester",
    couleur: "Noir",
    etat_estime: "Très bon état",
    taille_estimee: "L",
    description: "Pantalon de survêtement Adidas noir, trois bandes blanches, logo trèfle.",
    confiance: "haute",
    notes: "",
    attributs_visibles: { taille: "L" },
    prix_vente_suggere: 15,
  };
  const r = assainirSortie(item, FR3);
  verifier("Adidas : marque conservée", item.marque, "Adidas");
  verifier("Adidas : confiance haute", item.confiance, "haute");
  verifier("Adidas : rien de contredit", r.identificationContredite, false);
}

{
  // Cardigan Tampy : marque LUE mais peu connue — c'est exactement le cas que
  // la règle marque doit laisser passer (elle interdit de deviner, pas de lire).
  const item: Record<string, unknown> = {
    titre: "Cardigan Tampy beige col V",
    famille: "mode",
    marque: "Tampy",
    matiere: "Laine",
    couleur: "Beige",
    etat_estime: "Très bon état",
    taille_estimee: "38",
    description: "Cardigan beige col V, marque Tampy lisible sur l'étiquette cousue.",
    confiance: "moyenne",
    notes: "Une photo de l'étiquette de composition préciserait la matière.",
    attributs_visibles: { taille: "38" },
    prix_vente_suggere: 12,
  };
  const r = assainirSortie(item, FR3);
  verifier("Tampy : marque peu connue conservée", item.marque, "Tampy");
  verifier("Tampy : confiance moyenne conservée", item.confiance, "moyenne");
  verifier("Tampy : rien de contredit", r.identificationContredite, false);
}

titre("3. Non-régression — hors textile correctement identifié (niveau Milwaukee)");
{
  // Le cas cité dans l'audit du 11/08 comme la PREUVE que le modèle en est
  // capable : hors textile, marque lue, note honnête. Il doit rester tel quel.
  const item: Record<string, unknown> = {
    objet: "niveau à bulle",
    objet_source: "lu",
    titre: "Niveau à bulle Milwaukee 60 cm",
    famille: "bricolage",
    marque: "Milwaukee",
    matiere: "Aluminium",
    couleur: "Rouge",
    etat_estime: "Bon état",
    taille_estimee: null,
    description: "Niveau à bulle Milwaukee, corps aluminium rouge, trois fioles.",
    confiance: "haute",
    notes: "Une photo du dos préciserait la référence exacte.",
    attributs_visibles: { type_outil: "niveau à bulle", longueur: "60 cm", materiau: "aluminium" },
    prix_vente_suggere: 25,
  };
  const r = assainirSortie(item, FR);   // UNE seule photo, volontairement
  verifier("Milwaukee : marque lue conservée", item.marque, "Milwaukee");
  verifier("Milwaukee : confiance haute conservée malgré 1 photo", item.confiance, "haute");
  verifier("Milwaukee : la mesure lue « 60 cm » survit", (item.attributs_visibles as Record<string, string>).longueur, "60 cm");
  verifier("Milwaukee : catégorie Bricolage atteinte", item.categorie, "Bricolage");
  verifier("Milwaukee : identification tenue", r.identificationIncertaine, false);
  verifier("Milwaukee : objet lu conservé", [item.objet, item.objet_source], ["niveau à bulle", "lu"]);
  verifier("Milwaukee : autorité de prix conservée", r.objetDeduit, false);
}

// ══════════════════════════════════════════════════════════════════════════
// 4. LE PLAFOND PAR NOMBRE DE PHOTOS
// ══════════════════════════════════════════════════════════════════════════
titre("4. Plafond par nombre de photos");
{
  const base = () => ({
    titre: "Vase en céramique émaillée bleu",
    famille: "maison_deco",
    marque: null,
    description: "Vase en céramique émaillée bleue, forme balustre.",
    confiance: "moyenne",
    notes: "Aucune marque ni poinçon visible. Une photo du dessous trancherait.",
    attributs_visibles: { materiau: "céramique" },
    prix_vente_suggere: 14,
  }) as Record<string, unknown>;

  const un = base();
  assainirSortie(un, FR);
  verifier("1 photo, ni marque ni référence → basse", un.confiance, "basse");
  verifier("1 photo, ni marque ni référence → incertaine", un.identification_incertaine, true);
  verifier("… mais PAS contredite (le prix survit)", un.identification_contredite, false);

  const trois = base();
  assainirSortie(trois, FR3);
  verifier("3 photos, ni marque ni référence → moyenne (plafond d'avant)", trois.confiance, "moyenne");
  verifier("3 photos → identification non signalée incertaine", trois.identification_incertaine, false);

  // Une référence fabricant lue suffit à tenir l'identification sur 1 photo.
  const avecRef = base();
  avecRef.attributs_visibles = { materiau: "céramique", reference_fabricant: "K-4552" };
  assainirSortie(avecRef, FR);
  verifier("1 photo + référence lue → moyenne conservée", avecRef.confiance, "moyenne");
  verifier("1 photo + référence lue → identification tenue", avecRef.identification_incertaine, false);
  verifier("la référence est recopiée dans `reference`", avecRef.reference, "K-4552");
}

// ══════════════════════════════════════════════════════════════════════════
// 5. LES BRIQUES, UNE PAR UNE
// ══════════════════════════════════════════════════════════════════════════
titre("5. Détection de négation de marque");
{
  const positifs = [
    "Objet sans marque visible sur les photos fournie.",
    "Aucune marque lisible sur l'article.",
    "Pas de marque apparente.",
    "La marque est illisible sur cette photo.",
    "La marque n'est pas visible sur les photos fournies.",
    "Marque non identifiable.",
    "Aucun logo n'est visible.",
    "No brand visible on the item.",
    "The brand is not legible.",
    "Unbranded ceramic vase.",
  ];
  for (const t of positifs) verifier(`nie une marque : « ${t.slice(0, 44)}… »`, negationDeMarque(t) != null, true);

  const negatifs = [
    "Marque Milwaukee bien lisible sur le corps de l'outil.",
    "La marque est visible au dos, gravée dans le plastique.",
    "Étiquette cousue sans marquer d'usure particulière.",
    "Brand new, never worn, tag still attached.",
    "Le logo brodé est net sur la poitrine.",
  ];
  for (const t of negatifs) verifier(`ne nie PAS : « ${t.slice(0, 44)}… »`, negationDeMarque(t), null);
}

titre("6. Retrait de la justification contradictoire");
{
  const { texte, retire } = retirerJustificationMarqueLue(
    "Objet sans marque visible. Confiance moyenne car marque LUE. Une photo du manche trancherait.",
  );
  verifier("la justification est retirée", retire, true);
  verifier(
    "le reste est conservé mot pour mot",
    texte,
    "Objet sans marque visible. Une photo du manche trancherait.",
  );

  // Une note qui NE se contredit pas ne doit rien perdre.
  const intact = retirerJustificationMarqueLue("Marque Milwaukee bien lisible. Une photo du dos préciserait la référence.");
  verifier("note cohérente : rien retiré", intact.retire, false);

  // Une note qui deviendrait VIDE est rendue telle quelle : mieux vaut une note
  // contradictoire qu'un encart « une photo de plus » qui disparaît.
  const vide = retirerJustificationMarqueLue("Confiance moyenne car marque lue.");
  verifier("note qui se viderait : conservée", vide.texte, "Confiance moyenne car marque lue.");
}

titre("7. Fuite de noms de variables internes");
{
  verifier(
    "prix_vente_suggere / prix_achat_suggere remplacés (fr)",
    nettoyerFuites("Marge négative : prix_vente_suggere (22€) < prix_achat_suggere (25€).", "fr").texte,
    "Marge négative : prix de vente conseillé (22€) < prix d'achat estimé (25€).",
  );
  verifier(
    "traduits en anglais quand la sortie est anglaise",
    nettoyerFuites("Negative margin: prix_vente_suggere below prix_achat_reel.", "en").texte,
    "Negative margin: suggested sale price below purchase price.",
  );
  verifier(
    "un mot français ordinaire n'est JAMAIS touché",
    nettoyerFuites("La marque est visible, le verdict est bon, la description est complète.", "fr").texte,
    "La marque est visible, le verdict est bon, la description est complète.",
  );
  const inconnu = nettoyerFuites("Référence lue : ga_2100_a1.", "fr");
  verifier("un identifiant inconnu est laissé tel quel", inconnu.texte, "Référence lue : ga_2100_a1.");
  verifier("… mais compté pour pouvoir l'ajouter plus tard", inconnu.inconnu, "ga_2100_a1");
}

titre("8. Retrait de la marque du titre");
{
  verifier(
    "marque au milieu du titre",
    retirerMarqueDuTitre("Fourche à bêcher Spear & Jackson 4 dents", "Spear & Jackson"),
    "Fourche à bêcher 4 dents",
  );
  verifier("marque en tête", retirerMarqueDuTitre("Nike air max 90 blanches", "Nike"), "air max 90 blanches");
  verifier(
    "un titre qui se viderait est conservé",
    retirerMarqueDuTitre("Zara", "Zara"),
    "Zara",
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 8bis. L'OBJET ET SA PROVENANCE (2026-08-11, incident 14:10)
// ══════════════════════════════════════════════════════════════════════════
// Le cas que rien ne voyait : une réponse COHÉRENTE et FAUSSE. La pince plate
// rendue en « Cisailles de jardin à main poignée rouge » ne se contredisait
// nulle part (marque null assumée, famille valide, 2 photos) — donc
// identification_contredite = false ET identification_incertaine = false, et
// « Achète en dessous de 8 € » est sorti avec 6 Pépites débitées.
// `objet_source` est le seul signal qui la voit : il ne demande pas au modèle
// d'être d'accord avec lui-même, il lui demande d'où vient ce qu'il affirme.
titre("8bis. objet / objet_source — l'erreur cohérente");
{
  const cisailles = () => ({
    objet: "cisailles de jardin à main",
    objet_source: "deduit",
    titre: "Cisailles de jardin à main poignée rouge",
    famille: "jardin",
    marque: null,
    description: "Cisailles de jardin à main, poignée rouge, lames en acier.",
    confiance: "moyenne",
    notes: "Une photo des lames ouvertes trancherait.",
    attributs_visibles: null,
    prix_vente_suggere: 15,
    prix_achat_suggere: 8,
    verdict: "bon",
    score: 6,
  }) as Record<string, unknown>;

  const c = cisailles();
  const r = assainirSortie(c, FR3);   // 2+ photos : le plafond ne joue PAS
  verifier("le scan de 14:10 n'est toujours PAS contredit", r.identificationContredite, false);
  verifier("… ni incertain (2 photos, c'est la règle et elle est juste)", r.identificationIncertaine, false);
  verifier("… mais l'objet est signalé DÉDUIT", r.objetDeduit, true);
  verifier("objet_source exposé au client", c.objet_source, "deduit");
  verifier("empreinte : objet remonté", empreinteSortie(c).objet, "cisailles de jardin à main");
  verifier("empreinte : objet_source remonté", empreinteSortie(c).objet_source, "deduit");

  // Provenance absente / hors liste → "deduit", JAMAIS "lu". Un silence n'est
  // pas une lecture : c'est le piège du plafond de confiance du matin même.
  const sansSource = cisailles();
  delete sansSource.objet_source;
  const rs = assainirSortie(sansSource, FR3);
  verifier("provenance absente → deduit", sansSource.objet_source, "deduit");
  verifier("… et tracée comme rejetée", rs.objetSourceRejetee, true);

  for (const brut of ["lue", "vu", "read", "LU!", ""]) {
    const x = cisailles();
    x.objet_source = brut;
    assainirSortie(x, FR3);
    verifier(`provenance « ${brut} » hors liste → deduit`, x.objet_source, "deduit");
  }

  // Casse et espaces tolérés : c'est une valeur d'énumération, pas un secret.
  const casse = cisailles();
  casse.objet_source = "  LU  ";
  const rc = assainirSortie(casse, FR3);
  verifier("« LU » toléré et normalisé", casse.objet_source, "lu");
  verifier("… sans être compté comme rejet", rc.objetSourceRejetee, false);
  verifier("… et l'autorité de prix est conservée", rc.objetDeduit, false);

  // Aucun objet nommé du tout (réponse d'un modèle qui a sauté l'étape 0) :
  // rien à garantir, donc pas de provenance et pas d'autorité de prix.
  const sansObjet = cisailles();
  delete sansObjet.objet;
  const ro = assainirSortie(sansObjet, FR3);
  verifier("objet absent → null", sansObjet.objet, null);
  verifier("objet absent → provenance null", sansObjet.objet_source, null);
  verifier("objet absent → pas d'autorité de prix", ro.objetDeduit, true);
  verifier("objet absent → pas compté comme provenance rejetée", ro.objetSourceRejetee, false);

  // Bornage : guillemets rognés, longueur plafonnée.
  const sale = cisailles();
  sale.objet = '  « pince plate »  ';
  assainirSortie(sale, FR3);
  verifier("guillemets et espaces rognés", sale.objet, "pince plate");

  const long = cisailles();
  long.objet = "x".repeat(300);
  assainirSortie(long, FR3);
  verifier("longueur bornée à 120", String(long.objet).length, 120);
}

// ══════════════════════════════════════════════════════════════════════════
// 8quater. INVARIANT DE MARGE (bouilloire Grifema, 11/08 15:39)
// ══════════════════════════════════════════════════════════════════════════
// « prix indicatif 8,00 € » ET « ACHÈTE EN DESSOUS DE 15,00 € » sur le même
// écran. objet_source valait "lu" — l'identification était bonne, ce sont les
// DEUX PRIX qui se contredisent, et aucun garde-fou ne regardait ça.
titre("8quater. Invariant de marge — achat conseillé >= prix de vente");
{
  const grifema = (achat: number | null, vente: number | null) => ({
    objet: "bouilloire électrique",
    objet_source: "lu",
    titre: "Bouilloire électrique Grifema 1,7 L inox",
    famille: "electromenager",
    marque: "Grifema",
    description: "Bouilloire électrique Grifema, cuve inox, capacité 1,7 L.",
    confiance: "haute",
    notes: "Marque lue sur le socle.",
    attributs_visibles: { capacite: "1,7 L" },
    prix_vente_suggere: vente,
    prix_achat_suggere: achat,
    verdict: "bon",
    score: 7,
  }) as Record<string, unknown>;

  // LE cas : acheter 15 pour revendre 8 = −7 €, présenté comme un conseil.
  const cas = grifema(15, 8);
  const r = assainirSortie(cas, FR3);
  verifier("marge négative détectée", r.margeNegativeRetiree, true);
  verifier("le conseil d'achat est retiré", cas.prix_achat_suggere, null);
  verifier("le verdict tombe avec lui", cas.verdict, null);
  verifier("le score aussi", cas.score, null);
  verifier("⚠️ le prix de vente est CONSERVÉ, jamais recalculé", cas.prix_vente_suggere, 8);
  verifier("l'identification n'est pas mise en cause", cas.objet_source, "lu");
  verifier("… ni signalée contredite", r.identificationContredite, false);

  // Égalité : marge nulle, aucun conseil à donner non plus.
  const egal = grifema(12, 12);
  verifier("achat == vente → retiré aussi", assainirSortie(egal, FR3).margeNegativeRetiree, true);

  // Le cas NORMAL ne bouge pas d'un pouce.
  const sain = grifema(8, 15);
  const rs = assainirSortie(sain, FR3);
  verifier("marge positive : rien retiré", rs.margeNegativeRetiree, false);
  verifier("marge positive : conseil conservé", sain.prix_achat_suggere, 8);
  verifier("marge positive : verdict conservé", sain.verdict, "bon");

  // ⚠️ PRÉSENCE AVANT CONVERSION : `Number(null) === 0`, donc un test bâclé
  // ferait 0 >= 0 = true et déclencherait l'invariant sur deux champs
  // simplement ABSENTS — c'est-à-dire sur TOUT le mode identify.
  const identify = grifema(null, null);
  const ri = assainirSortie(identify, FR3);
  verifier("deux prix absents → invariant NON déclenché", ri.margeNegativeRetiree, false);
  verifier("… et le verdict n'est pas effacé au passage", identify.verdict, "bon");

  const venteSeule = grifema(null, 15);
  verifier("achat absent seul → non déclenché", assainirSortie(venteSeule, FR3).margeNegativeRetiree, false);
  const achatSeul = grifema(8, null);
  verifier("vente absente seule → non déclenché", assainirSortie(achatSeul, FR3).margeNegativeRetiree, false);
}

// ══════════════════════════════════════════════════════════════════════════
// 8ter. LE CONSEIL D'ACHAT NE SURVIT PAS DANS LE TEXTE (bouilloire, 15:32)
// ══════════════════════════════════════════════════════════════════════════
// Premier scan réel en objet_source="deduit" : les trois champs d'autorité
// étaient bien à null, et la note affichait quand même le conseil en toutes
// lettres. Vider un champ ne suffit pas quand une phrase le répète.
titre("8ter. Retrait des phrases de prix / marge / verdict");
{
  // LE cas de l'incident, mot pour mot (post-scrub : « prix_achat_suggere »
  // est déjà devenu « prix d'achat estimé » à ce stade).
  const incident = retirerPhrasesDePrix(
    "Bouilloire électrique sans marque visible. Marge estimée à 75% si vendue 14€ (prix d'achat estimé 8€). Une photo du dessous trancherait.",
  );
  verifier("la phrase de marge est retirée", incident.retirees, 1);
  verifier(
    "le reste est conservé mot pour mot",
    incident.texte,
    "Bouilloire électrique sans marque visible. Une photo du dessous trancherait.",
  );

  // Un verdict sans le moindre chiffre part quand même.
  const verdictNu = retirerPhrasesDePrix("Objet courant. C'est une bonne affaire. Photo nette.");
  verifier("verdict sans chiffre retiré", verdictNu.texte, "Objet courant. Photo nette.");

  // ⚠️ LE FAUX POSITIF À NE PAS FAIRE : « acheté » + un chiffre nu, c'est une
  // information de description parfaitement légitime.
  for (const legitime of [
    "Acheté il y a deux ans, très peu servi.",
    "Bouilloire 1,7 L en inox brossé, socle rotatif 360°.",
    "Capacité 1,7 litre, puissance 2200 W.",
    "La marque est visible au dos, gravée dans le plastique.",
    "Vendue avec sa boîte d'origine et sa notice.",
  ]) {
    const r = retirerPhrasesDePrix(legitime);
    verifier(`intacte : « ${legitime.slice(0, 42)}… »`, r.texte, legitime);
  }

  // Mesures et pourcentages techniques : un % ne suffit pas, il faut le marqueur.
  const compo = retirerPhrasesDePrix("Composition 80% coton 20% polyester.");
  verifier("un pourcentage de composition n'est pas une marge", compo.retirees, 0);

  // Anglais.
  const en = retirerPhrasesDePrix("Stainless steel kettle. Estimated margin of 75% if sold at €14. Add a photo of the base.");
  verifier("anglais : la marge part", en.texte, "Stainless steel kettle. Add a photo of the base.");

  // Une chaîne entièrement composée de conseil devient VIDE — volontaire.
  const toutConseil = retirerPhrasesDePrix("Marge estimée à 75% si vendue 14€.");
  verifier("texte entièrement conseil → vide", toutConseil.texte, "");
  verifier("… et compté", toutConseil.retirees, 1);

  // Rien à faire = la chaîne d'origine, à l'identité (pas de recomposition).
  const intact = "Bouilloire inox 1,7 L, socle rotatif. Une photo du dessous préciserait la marque.";
  verifier("aucune phrase suspecte → chaîne inchangée", retirerPhrasesDePrix(intact).texte, intact);
  verifier("null / vide traversent sans bruit", [
    retirerPhrasesDePrix(null).texte,
    retirerPhrasesDePrix("").texte,
    retirerPhrasesDePrix(42).texte,
  ], [null, "", 42]);
}

// ══════════════════════════════════════════════════════════════════════════
// 9. LE PROMPT PORTE BIEN LES RÈGLES (les deux langues, les deux modes)
// ══════════════════════════════════════════════════════════════════════════
titre("9. Contenu du prompt");
{
  for (const [lang, mode, attendus] of [
    ["fr", "full", ["JAMAIS AFFIRMER ET NIER", "CE QU'UNE PHOTO NE PEUT PAS ÉTABLIR", "NE JAMAIS NOMMER UN CHAMP INTERNE", "OUTILLAGE À MAIN"]],
    ["fr", "identify", ["JAMAIS AFFIRMER ET NIER", "CE QU'UNE PHOTO NE PEUT PAS ÉTABLIR", "NE JAMAIS NOMMER UN CHAMP INTERNE", "OUTILLAGE À MAIN"]],
    ["en", "full", ["NEVER ASSERT AND DENY", "WHAT A PHOTO CANNOT ESTABLISH", "NEVER NAME AN INTERNAL FIELD", "HAND TOOLS"]],
    ["en", "identify", ["NEVER ASSERT AND DENY", "WHAT A PHOTO CANNOT ESTABLISH", "NEVER NAME AN INTERNAL FIELD", "HAND TOOLS"]],
  ] as Array<[string, "full" | "identify", string[]]>) {
    const p = buildSystemPrompt(lang, "Vinted, eBay", "France", 3, mode);
    for (const a of attendus) verifier(`${lang}/${mode} : « ${a} »`, p.includes(a), true);
  }

  // ── L'ordre du 11/08 après-midi : l'objet AVANT la famille ──────────────
  // Le schéma commande l'ordre d'émission, donc l'ordre dans lequel les faits
  // sont décidés : ces assertions-là sont le cœur du chantier, pas du décor.
  for (const [lang, mode, etape0, etape0bis] of [
    ["fr", "full", "0. NOMMER L'OBJET", "0bis. LA FAMILLE"],
    ["fr", "identify", "0. NOMMER L'OBJET", "0bis. LA FAMILLE"],
    ["en", "full", "0. NAME THE OBJECT", "0bis. FAMILY"],
    ["en", "identify", "0. NAME THE OBJECT", "0bis. FAMILY"],
  ] as Array<[string, "full" | "identify", string, string]>) {
    const p = buildSystemPrompt(lang, "Vinted, eBay", "France", 3, mode);
    verifier(`${lang}/${mode} : l'étape 0 nomme l'objet`, p.includes(etape0), true);
    verifier(`${lang}/${mode} : la famille est passée en 0bis`, p.includes(etape0bis), true);
    verifier(`${lang}/${mode} : « la famille d'abord » a disparu`, /LA FAMILLE D'ABORD|FAMILY FIRST/.test(p), false);
    verifier(`${lang}/${mode} : objet avant famille dans le schéma`, p.indexOf('"objet"') < p.indexOf('"famille"'), true);
    verifier(`${lang}/${mode} : objet avant titre dans le schéma`, p.indexOf('"objet"') < p.indexOf('"titre"'), true);
    verifier(`${lang}/${mode} : objet_source dans le schéma`, p.includes('"objet_source":"lu"|"deduit"'), true);
  }

  // La recherche peut contredire l'objet — mode complet SEULEMENT (identify
  // n'a aucun outil : lui dire de recouper avec le web serait un mensonge).
  verifier(
    "fr/full : la recherche est autorisée à contredire l'objet",
    buildSystemPrompt("fr", "Vinted", null, 3, "full").includes("LA RECHERCHE PEUT — ET DOIT — CONTREDIRE L'OBJET"),
    true,
  );
  verifier(
    "fr/identify : la règle est absente (aucun outil attaché)",
    buildSystemPrompt("fr", "Vinted", null, 3, "identify").includes("CONTREDIRE L'OBJET"),
    false,
  );
  verifier(
    "en/full : idem côté anglais",
    buildSystemPrompt("en", "Vinted", null, 3, "full").includes("THE SEARCH MAY — AND MUST — CONTRADICT THE OBJECT"),
    true,
  );
  verifier(
    "en/identify : absente",
    buildSystemPrompt("en", "Vinted", null, 3, "identify").includes("CONTRADICT THE OBJECT"),
    false,
  );
  // L'interdiction sur la MARQUE, elle, reste : c'est la règle du matin, elle
  // n'est pas remplacée mais bornée à ce qu'elle protégeait vraiment.
  verifier(
    "fr/full : le verrou sur la marque est conservé",
    buildSystemPrompt("fr", "Vinted", null, 3, "full").includes("une recherche ne REMPLACE jamais ce que tu as lu"),
    true,
  );

  // Objet déduit → aucun conseil d'achat, y compris dans le texte libre.
  // Mode complet seulement : identify n'a AUCUN prix à interdire deux fois.
  verifier(
    "fr/full : interdiction du conseil d'achat dans le texte libre",
    buildSystemPrompt("fr", "Vinted", null, 3, "full").includes("UN OBJET DÉDUIT NE DONNE DROIT À AUCUN CONSEIL D'ACHAT, NULLE PART"),
    true,
  );
  verifier(
    "en/full : idem",
    buildSystemPrompt("en", "Vinted", null, 3, "full").includes("A GUESSED OBJECT EARNS NO BUYING ADVICE, ANYWHERE"),
    true,
  );
  verifier(
    "fr/identify : l'interdiction générale de prix suffit",
    buildSystemPrompt("fr", "Vinted", null, 3, "identify").includes("AUCUN PRIX, AUCUN VERDICT"),
    true,
  );

  // Invariant de marge : dit AU MODÈLE aussi, avec l'interdiction de rabaisser
  // le chiffre pour faire tenir la marge (sinon on déplace l'invention).
  verifier(
    "fr/full : le prix d'achat conseillé doit être sous le prix de vente",
    buildSystemPrompt("fr", "Vinted", null, 3, "full").includes("UN PRIX D'ACHAT CONSEILLÉ EST TOUJOURS STRICTEMENT INFÉRIEUR AU PRIX DE VENTE"),
    true,
  );
  verifier(
    "fr/full : … et il est interdit de le rabaisser",
    buildSystemPrompt("fr", "Vinted", null, 3, "full").includes("NE LE RABAISSE PAS pour faire tenir la marge"),
    true,
  );
  verifier(
    "en/full : idem",
    buildSystemPrompt("en", "Vinted", null, 3, "full").includes("A SUGGESTED BUYING PRICE IS ALWAYS STRICTLY BELOW THE SELLING PRICE"),
    true,
  );
  // La consigne « une seule photo » n'apparaît QUE quand il n'y en a qu'une.
  verifier("1 photo : la consigne apparaît", buildSystemPrompt("fr", "Vinted", null, 1, "full").includes("QU'UNE SEULE photo"), true);
  verifier("3 photos : elle disparaît", buildSystemPrompt("fr", "Vinted", null, 3, "full").includes("QU'UNE SEULE photo"), false);

  // Non-régression : les étapes inchangées le sont restées.
  const fr = buildSystemPrompt("fr", "Vinted", null, 3, "full");
  for (const a of [
    "6. EXTRACTION PRIX D'ACHAT",
    "7. DÉTECTION VENTE",
    "Neuf avec étiquette",
    "TYPE DE PRODUIT — LE DOUTE SE RÉSOUT TOUJOURS VERS LE GÉNÉRIQUE",
    "MODÈLE ET SA PROVENANCE",
  ]) verifier(`étape inchangée présente : « ${a} »`, fr.includes(a), true);
}

// ══════════════════════════════════════════════════════════════════════════
titre(`Résultat : ${total - echecs}/${total}`);
if (echecs) {
  console.log(`\x1b[31m${echecs} échec(s)\x1b[0m`);
  Deno.exit(1);
}
console.log("\x1b[32mTous les garde-fous tiennent.\x1b[0m");
Deno.exit(0);
