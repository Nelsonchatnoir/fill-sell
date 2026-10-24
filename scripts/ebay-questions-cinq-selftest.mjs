// ── AUTOTEST : eBay ÷ 5 (18/10/2026) — LES QUESTIONS eBAY DONT LA RÉPONSE EXISTAIT ──
// Semaine du 11/10 15:00 au 18/10 15:00 (heure de Paris) : 156 questions eBay
// affichées, 41 vraies encore après le chantier « zéro friction » (rejeu :
// scripts/bancs/zero-friction/rejeu-ebay.mjs). Ce fichier verrouille, sans
// réseau ni IA :
//   L1  « Longueur de la robe » n'est pas une mesure (garde des mesures sur le
//       NOM EXACT) et se lit dans le texte du vendeur (longue → Longue,
//       mi-longue → Midi, jamais courte) ;
//   L2  une valeur que le moteur connaît (défaut, réponse de l'IA pour cette
//       catégorie) ne redevient jamais une question — sauf geste de la personne ;
//   L3a aucune question eBay avant la réponse du pré-calcul de catégorie ;
//   L3b l'icône démentie par la vérification ne pose pas ses aspects (voie API) ;
//   L3c une décoration murale ne prend pas l'icône du motif de sa description ;
//   T   la plateforme décochée est une issue à part (plateforme_decochee).
//   node scripts/ebay-questions-cinq-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(R, p), "utf8");
const imp = (p) => import(pathToFileURL(path.join(R, p)).href);
let echecs = 0;
const ok = (t, c, d = "") => { if (c) console.log(`  ✓ ${t}`); else { echecs++; console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); } };

const A = await imp("src/publication/moteur/aspectsEbayAuto.js");
const { issueQuestionDisparue, estDimensionEbay } = await imp("src/publication/moteur/regles.js");
const { titreNommeUneDecorationMurale, detectObjectKeywordDetail } = await imp("src/utils/shared.js");
const { familleJeuVideo, plateformeEbayDuJeu } = await imp("src/utils/jeuxVideo.js");
const LPS = lire("src/components/ListingPreviewScreen.jsx");
const IA = lire("supabase/functions/_shared/ebay-aspects-ia.ts");

console.log("\n── eBay ÷ 5 : LES QUESTIONS DONT LA RÉPONSE EXISTAIT ───────────");

console.log("\nL1. « Longueur de la robe » n'est pas une mesure");
{
  const m = IA.match(/export const ASPECT_MESURE_RE = (\/.+\/)([a-z]*);/);
  ok("la garde des mesures est une expression lisible ici", Boolean(m));
  const re = m ? new RegExp(m[1].slice(1, -1), m[2]) : /$^/;
  const mesures = ["Hauteur", "Largeur", "Longueur", "Profondeur", "Diamètre", "Épaisseur", "Dimensions", "Dimension", "Volume", "Contenance",
    "Tour de taille", "Tour de poitrine", "Hauteur (intérieur)", "Dimensions (cm)"];
  const styles = ["Longueur de la robe", "Longueur des manches", "Hauteur du talon", "Largeur de ceinture", "Longueur de veste/manteau",
    "Longueur de la jupe", "Hauteur des chaussettes", "Largeur de la chaussure", "Profondeur de couleur"];
  ok("les dimensions nues, Volume, Contenance, tours : mesures (garde maintenue)", mesures.every((n) => re.test(n)), mesures.filter((n) => !re.test(n)).join(", "));
  ok("les styles à liste de mots ne sont plus lus comme des mesures", styles.every((n) => !re.test(n)), styles.filter((n) => re.test(n)).join(", "));
  ok("même verdict que estDimensionEbay sur les six dimensions", ["Longueur", "Largeur", "Hauteur", "Profondeur", "Épaisseur", "Diamètre"].every((n) => re.test(n) && estDimensionEbay(n))
    && !re.test("Longueur de la robe") && !estDimensionEbay("Longueur de la robe"));
  ok("la garde s'applique toujours aux deux chemins (resoudreAspectsIA, groupé)", (IA.match(/if \(ASPECT_MESURE_RE\.test\(nom\) && !mesureLueDansLeContexte\(/g) ?? []).length === 2);
}

console.log("\nL1 bis. « Longueur de la robe » lue dans le texte du vendeur");
{
  const LISTE = ["Au genou", "Midi", "Asymétrique"];
  const lr = (titre, description = "", feuille = "", opts = {}) => A.longueurDeLaRobeDuTexte({ allowedValues: opts.liste ?? LISTE, mode: opts.mode ?? "FREE_TEXT",
    textes: [{ source: "titre", texte: titre }, { source: "description", texte: description }, { source: "categorie_vinted", texte: feuille }] });
  const v = (x) => x?.valeur ?? null;
  // Les cinq questions de la semaine (a3002ab6, 63861) :
  ok("« Robe longue » → Longue (titre)", v(lr("Robe longue", "Robe Emma Keller. Taille S jamais portée Neuf")) === "Longue" && lr("Robe longue").source === "titre");
  ok("« Robe mi jambe » → Midi", v(lr("Robe mi jambe", "Robe de chez chic me.Taille M jamais portée Neuf.", "Midi")) === "Midi");
  ok("« Jupe longue » → Longue", v(lr("Jupe longue", "Jupe longue à motif taille 42/44 de marque Meja")) === "Longue");
  ok("« Robe femme », texte muet → rien (la question reste)", lr("Robe femme", "Robe de chez chic me.Taille M jamais portée Neuf.") === null);
  // Les faux du banc, écartés par construction :
  ok("« manches longues » ne parle pas de la robe", lr("Robe gris foncé manches longues coupe évasée") === null);
  ok("« Robe courte à manches longues » → jamais posée (courte)", lr("Robe noire", "Robe courte à manches longues de la marque Urban Outfitters.") === null);
  ok("« courte », « mini » ne sont JAMAIS posées", lr("Robe courte Farm Rio") === null && lr("Robe mini noire dos nu") === null);
  ok("deux longueurs dans le même texte → doute → rien", lr("Robe longue mini prix") === null
    && lr("Robe D&G", "Longue fermeture éclair dans le dos. Longueur : mi-longue") === null);
  ok("le premier texte qui parle tranche (le titre avant la description)", v(lr("Robe longue de soirée", "existe aussi en midi")) === "Longue");
  ok("titre et description muets : la feuille Vinted du vendeur (« Robes longues »)", lr("Robe Morgan", "Très bon état", "Robes longues")?.source === "categorie_vinted"
    && v(lr("Robe Morgan", "", "Robes longues")) === "Longue");
  ok("« Robes courtes » (Vinted) → rien", lr("Robe brodée", "", "Robes courtes") === null);
  ok("l'écriture de la liste quand elle existe (« Longue », « Maxi »)", v(lr("Robe longue", "", "", { liste: ["Courte", "Longue", "Midi"] })) === "Longue"
    && v(lr("Robe maxi", "", "", { liste: ["Mini", "Maxi"], mode: "SELECTION_ONLY" })) === "Maxi");
  ok("liste FERMÉE sans cette longueur → rien (eBay refuserait)", lr("Robe longue", "", "", { liste: ["Au genou", "Midi"], mode: "SELECTION_ONLY" }) === null);
  ok("l'écran passe le texte FR du vendeur et sa feuille Vinted", /if \(name === EBAY_LONGUEUR_ROBE\) \{\s*const fr = textesFrDeLaPublication\(\{ initialListing, edited \}\);/.test(LPS)
    && /\{ source: "categorie_vinted", texte: Array\.isArray\(cheminV\)/.test(LPS) && /deduit: \{ valeur: lr\.valeur, source: `longueur_\$\{lr\.source\}` \}/.test(LPS));
}

console.log("\nL2. Une valeur connue ne redevient jamais une question");
{
  const p = A.poseAutoAutorisee;
  ok("première pose : comme avant (même si la personne a touché ailleurs)", p({ dejaPosee: false, touche: false }) && p({ dejaPosee: false, touche: true }));
  ok("repose d'une valeur perdue sans geste : oui", p({ dejaPosee: true, touche: false, reposes: 0 }));
  ok("la personne a vidé ou retouché : jamais recouverte", !p({ dejaPosee: true, touche: true, reposes: 0 }));
  ok(`plafond : ${A.REPOSES_MAX} reposes par champ et par catégorie`, p({ dejaPosee: true, touche: false, reposes: A.REPOSES_MAX - 1 }) && !p({ dejaPosee: true, touche: false, reposes: A.REPOSES_MAX }));
  ok("une réponse ne vaut que pour SA catégorie", A.cleValeurConnue("139973", "Plateforme") === "139973|Plateforme" && A.cleValeurConnue("31388", "Type") !== A.cleValeurConnue("11720", "Type"));
  // Les trois « Plateforme » de la semaine : la règle des jeux donnait la valeur EN LIGNE.
  const pj = (t, d = "") => plateformeEbayDuJeu(familleJeuVideo(t, d), t);
  ok("Blur – PS3 → Sony PlayStation 3 (= annonce publiée)", pj("🎮 Blur – PS3 – Disque et livret seuls, sans boîte") === "Sony PlayStation 3");
  ok("Tomb Raider: Legend – Xbox 360 → Microsoft Xbox 360", pj("🎮 Tomb Raider: Legend – Xbox 360") === "Microsoft Xbox 360");
  ok("Harvest Life … Switch cartouche → Nintendo Switch", pj("Harvest Life / Ma Vie à la Ferme Switch cartouche") === "Nintendo Switch");
  ok("le statut porte le défaut sûr (`deduit`, source « defaut »)", /const defaut = defautAspectEbay\(\{ name, mode, allowedValues \}, ctxDefautEbay\);\s*if \(defaut\) return \{ \.\.\.manquant, deduit: \{ valeur: defaut, source: "defaut" \} \};/.test(LPS)
    && /const ctxDefautEbay = \{\s*marque: String\(pf\.marque \?\? pf\.ebayAspects\?\.\["Marque"\] \?\? ""\)\.trim\(\),\s*famille: initialListing\?\.famille \?\? null, plateformeJeu: plateformeJeuEbay,/.test(LPS));
  ok("le statut porte la réponse de l'IA déjà reçue (« ia_connue »)", /const connue = ebayValeursConnues\.current\.get\(cleValeurConnue\(ebayPreviewCategoryId, name\)\);\s*if \(connue\) return \{ \.\.\.manquant, deduit: \{ valeur: connue, source: "ia_connue" \} \};/.test(LPS));
  const iGarde = LPS.indexOf("for (const [k, v] of Object.entries(clean)) ebayValeursConnues.current.set(cleValeurConnue(cat, k), String(v).trim());");
  const iCat = LPS.indexOf("if (ebayCategorieCourante.current !== cat) return;");
  ok("la réponse de l'IA est gardée AVANT le test de catégorie (même revenue tard)", iGarde > 0 && iCat > iGarde);
  ok("aucun nouvel appel IA : la file des demandes est inchangée", /for \(const n of aDemander\) aspectsDemandesIa\.current\.add\(`\$\{cat\}\|\$\{n\}`\);/.test(LPS));
  ok("les trois poses (défaut, Département, option/IA) passent par peutPoser", (LPS.match(/&& peutPoser\(a\)\)/g) ?? []).length === 3
    && /const peutPoser = \(a\) => poseAutoAutorisee\(\{/.test(LPS));
  ok("un geste de la personne arrête le moteur (encart, bloc, mémoire)", /if \(name\) ebayTouchesPersonne\.current\.add\(String\(name\)\);/.test(LPS)
    && /if \(c\.startsWith\("ebay:"\)\) ebayTouchesPersonne\.current\.add\(c\.slice\(5\)\);/.test(LPS));
  ok("une valeur sur le point d'être reposée n'ouvre pas de question", /if \(a\.state === "missing" && a\.deduit\?\.valeur && !ebayToucheParPersonne\(a\) && !champBloquantVus\.current\[k\]\) continue;/.test(LPS));
  const iRefs = LPS.indexOf("const ebayTouchesPersonne = useRef(new Set());");
  const iStatut = LPS.indexOf("const ebayRequiredStatus = useMemo(");
  ok("les mémoires du moteur sont déclarées avant le statut qui les lit", iRefs > 0 && iRefs < iStatut);
}

console.log("\nL3a / L3b. La catégorie de l'encart : attendre le pré-calcul, refuser l'icône démentie");
{
  const ad = A.iconeEbayAdmise;
  ok("pré-calcul en cours → pas d'icône", !ad({ preCalculAttendu: true, preCalculFini: false, attenteEcoulee: false }));
  ok("pré-calcul fini → l'icône peut servir de repli", ad({ preCalculAttendu: true, preCalculFini: true, attenteEcoulee: false }));
  ok(`pré-calcul muet plus de ${A.ATTENTE_PRECALCUL_EBAY_MS / 1000} s → l'icône reprend la main (filet)`, ad({ preCalculAttendu: true, preCalculFini: false, attenteEcoulee: true }));
  ok("aucune rédaction (rien à attendre) → comme avant", ad({ preCalculAttendu: false, preCalculFini: false, attenteEcoulee: false }));
  const nc = A.precalculEbayNonConfirme;
  const pf = { categorie_source: "icone_non_confirmee", ebayCategoryId: "11071" };
  ok("« Tele de lion » : icône démentie, voie API → pas d'aspects de l'icône", nc({ pfEbay: pf, voieApi: true }));
  ok("voie extension → inchangé (ebay.js part sur l'identifiant du job)", !nc({ pfEbay: pf, voieApi: false }));
  ok("rayon choisi par la personne → ses questions restent", !nc({ pfEbay: pf, voieApi: true, choisi: true }));
  ok("une catégorie confirmée ou trouvée par le mot → inchangé", !nc({ pfEbay: { categorie_source: "ia_parmi_candidats" }, voieApi: true }) && !nc({ pfEbay: null, voieApi: true }));
  const bloc = LPS.slice(LPS.indexOf("const ebayPreviewCategoryId = useMemo"), LPS.indexOf("// « Plateforme » d'un jeu vidéo, lue sur la machine"));
  const i = (s) => bloc.indexOf(s);
  const iCopie = i("const resolue = String(pf.ebayCategoryId");
  const iNc = i("if (precalculEbayNonConfirme({ pfEbay: resolutionAffichee?.pfParPlateforme?.ebay, voieApi: ebayVoieApiReelle, choisi: Boolean(rayonEbay?.choisi) })) return null;");
  const iPrevu = i("const prevue = String(rayonEbay?.id");
  const iAttente = i("if (!iconeEbayAdmise({ preCalculAttendu: Boolean(platformListings?.platforms), preCalculFini: resolutionFaitePour === platformListings,");
  const iIcone = i("const direct = getEbayCategoryId(icon, pf.genre);");
  ok("ordre : choix → copie → icône démentie → pré-calcul → attente → icône", iCopie > 0 && iCopie < iNc && iNc < iPrevu && iPrevu < iAttente && iAttente < iIcone,
    [iCopie, iNc, iPrevu, iAttente, iIcone].join(" < "));
  ok("l'encart se recalcule quand le pré-calcul répond ou que le filet tombe", /resolutionAffichee, ebayVoieApiReelle, platformListings, resolutionFaitePour, attentePrecalculEbayPour, activeAiIcon, ebayCategorieDuClic, rayonsParPf\]\);/.test(LPS));
  ok("le bouton attend aussi le pré-calcul eBay (et le dit)", /const ebayAttendLePrecalcul = selected\.has\("ebay"\) && plateformesPubliables\.has\("ebay"\) && Boolean\(edited\.ebay\)\s*&& !ebayPreviewCategoryId && Boolean\(platformListings\?\.platforms\)\s*&& resolutionFaitePour !== platformListings && attentePrecalculEbayPour !== platformListings;/.test(LPS)
    && /poidsLbcManquant \|\|[\s\S]{0,320}ebayAttendLePrecalcul \|\|/.test(LPS) && /if \(ebayAttendLePrecalcul\) m\.push\(/.test(LPS));
  ok("un seul minuteur par rédaction, sans lecture de base", /const minuteur = setTimeout\(\(\) => setAttentePrecalculEbayPour\(pour\), ATTENTE_PRECALCUL_EBAY_MS\);\s*return \(\) => clearTimeout\(minuteur\);/.test(LPS) && !/setInterval\(\(\) => setAttentePrecalculEbayPour/.test(LPS));
  ok("le clic ne refuse pas sur les aspects de l'icône démentie (et n'y remonte pas l'encart)",
    /const iconeDementie = precalculEbayNonConfirme\(\{ pfEbay: pfE, voieApi: ebayVoieApiReelle, choisi: Boolean\(edited\.ebay\?\.rayon_choisi\?\.chemin\?\.length\) \}\);/.test(LPS)
    && /if \(verdict\.missingEmpty\.length && !iconeDementie\) \{/.test(LPS) && /\(verdict\.missingEmpty\.length \|\| verdict\.invalides\.length\) && !iconeDementie && String\(ebayPreviewCategoryId/.test(LPS));
}

console.log("\nL3c. Une décoration murale ne prend pas l'icône de son motif");
{
  ok("« Décoration murale chambre / cuisine », « Déco murale », « Décor mural », « stickers muraux »",
    ["Décoration murale chambre", "Décoration murale cuisine", "Déco Murale Japon Silhouette Noire", "Décor mural oiseau sur branche", "Stickers muraux enfants", "Triptyque mural feuilles tropicales"].every(titreNommeUneDecorationMurale));
  ok("une horloge, une étagère murale, une décoration non murale : pas concernées",
    !["Horloge murale bois", "Étagère murale chêne", "Décoration de Noël", "Lampe de chevet chambre", "Tele de lion"].some(titreNommeUneDecorationMurale));
  const d = detectObjectKeywordDetail("Décoration murale chambre", "Décoration murale noire « CHAMBRE » avec un lit, un miroir et un lampadaire.");
  ok("la détection seule n'est pas touchée (le « lit » de la description reste en passe 2)", d?.icon === "🛏️" && d?.passe === 2);
  ok("resolveArticleIconDetail écarte cette passe 2 (voie 5)", /\(iconeDuMotIa != null && iconeDuMotIa !== motCle\.icon\) \|\|\s*titreNommeUneDecorationMurale\(frTitle\)\s*\);/.test(LPS));
}

console.log("\nT. La plateforme décochée est une issue à part");
{
  ok("plateforme décochée → plateforme_decochee (même si le rayon a changé)", issueQuestionDisparue({ plateformeCochee: false }) === "plateforme_decochee"
    && issueQuestionDisparue({ plateformeCochee: false, rayonChange: true }) === "plateforme_decochee");
  ok("rayon changé → retiree ; sinon complete", issueQuestionDisparue({ plateformeCochee: true, rayonChange: true }) === "retiree" && issueQuestionDisparue({}) === "complete");
  ok("la télémétrie l'écrit, avec « par » et le délai", /const issue = issueQuestionDisparue\(\{ plateformeCochee: selected\.has\(vu\.platform\), rayonChange \}\);\s*logChampBloquant\(issue, issue === "retiree" \? \{ \.\.\.vu, \.\.\.suite, categorie_apres: catApres \} : \{ \.\.\.vu, \.\.\.suite \}\);/.test(LPS));
  // (18/10 soir, feu vert de Nico) Les deux bilans SQL la lisent : abandon, avec sa propre colonne (migration 20261018240000).
  const M240 = lire("supabase/migrations/20261018240000_bilans_plateforme_decochee.sql");
  ok("questions_publication_bilan : décochée = abandon + colonne plateformes_decochees",
    /'abandonne', 'publie_sans_plateforme', 'bloque_au_clic', 'plateforme_decochee'\)/.test(M240) && /comptes bigint, plateformes_decochees bigint\)/.test(M240)
    && /count\(\*\) FILTER \(WHERE s ->> 'issue' = 'plateforme_decochee'\)/.test(M240));
  ok("champs_requis_veille : décochée = abandon + plateformes_decochees",
    /issue IN \('abandonne', 'publie_sans_plateforme', 'plateforme_decochee'\)\) AS abandons/.test(M240) && /issue = 'plateforme_decochee'\) AS plateformes_decochees/.test(M240));
  ok("lecture seule, droits reposés (service_role seulement)", /GRANT EXECUTE ON FUNCTION public\.questions_publication_bilan\(timestamptz, timestamptz\) TO service_role;/.test(M240)
    && /REVOKE ALL ON FUNCTION public\.questions_publication_bilan\(timestamptz, timestamptz\) FROM PUBLIC, anon, authenticated;/.test(M240)
    && fs.existsSync(path.join(R, "supabase/rollbacks/20261018240000_bilans_plateforme_decochee_INVERSE.sql")));
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ eBay ÷ 5 — tout est vert");
process.exit(echecs ? 1 : 0);
