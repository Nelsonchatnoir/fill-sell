// Non-régression de la garde « la passe 2 propose, elle ne décide plus seule »
// (resolveArticleIconDetail, src/components/ListingPreviewScreen.jsx).
//
// Le composant n'est pas importable ici (JSX, 12 000 lignes) : on rejoue
// l'EXPRESSION EXACTE de la garde sur des cas RÉELS relevés en base. Si elle
// change là-bas, ce fichier doit changer aussi — c'est le prix d'un test qui
// ne dépend pas de React, et il est explicite.
//
//   const passe2Ecartee = motCle?.passe === 2 && (
//     estAnglaisAvere(frDesc) ||
//     (iconeDuMotIa != null && iconeDuMotIa !== motCle.icon)
//   );
//
// CORPUS : les fiches créées par l'app du 20/08 au 19/09/2026 dont l'icône est
// posée par la passe 2 (31 sur 754), plus des cas de passe 1 qui doivent
// rester intouchés.
import { detectObjectKeywordDetail, detectObjectIconKeyword } from "../src/utils/shared.js";
import { estAnglaisAvere } from "../supabase/functions/_shared/langue.js";

function decision({ titre, description = "", marque = "", objetIa = "" }) {
  const motCle = detectObjectKeywordDetail(titre, `${description} ${marque}`);
  const iconeDuMotIa = objetIa ? detectObjectIconKeyword(objetIa, "") : null;
  const passe2Ecartee = motCle?.passe === 2 && (
    estAnglaisAvere(description) ||
    (iconeDuMotIa != null && iconeDuMotIa !== motCle.icon)
  );
  if (motCle && !passe2Ecartee) {
    return { source: motCle.passe === 1 ? "mot_cle" : "mot_cle_description", icon: motCle.icon };
  }
  return { source: passe2Ecartee ? "passe2_ecartee" : "aucun_mot", icon: null };
}

const CAS = [
  // ── LA PASSE 1 N'EST JAMAIS TOUCHÉE. C'est l'invariant le plus important :
  // le garde-fou de catégorie épargne « mot_cle » et doit continuer.
  { nom: "titre qui nomme l'objet (passe 1)", titre: "Robe Zara beige ajustée taille S",
    description: "Jolie robe beige, aucune usure visible.", attendu: "mot_cle", icone: "👗" },
  { nom: "passe 1 malgré une description anglaise", titre: "Pull rose taille L",
    description: "Pink knitted sweater with no visible wear and a clean condition overall.",
    attendu: "mot_cle", icone: "🧶" },
  // Le mot de l'IA n'a AUCUN pouvoir sur un mot du titre : la passe 1 passe
  // avant la garde, et la garde ne regarde que la passe 2.
  { nom: "passe 1 malgré un mot d'IA qui contredit", titre: "Pantalon chino beige",
    description: "Chino 5 poches pour homme, coloris beige clair.", objetIa: "Sac à main",
    attendu: "mot_cle", icone: "👖" },
  // « derbies » n'est PAS un mot de nos règles (« derby » l'est, mais la borne
  // droite n'accepte que s/x/es) : le mot vient donc de la description, et
  // l'article est bien rangé grâce à elle. Trouvé en écrivant ce test — les
  // règles ne sont pas touchées, c'est hors périmètre du lot du 19/09.
  { nom: "derbies : le titre ne matche pas, la description sauve",
    titre: "Derbies beige suède paillettes", marque: "André",
    description: "Chaussures Derbies André en suède beige. Aucune usure visible.",
    attendu: "mot_cle_description", icone: "👟" },

  // ── VOIE 4 : description anglaise → la passe 2 se tait ────────────────────
  { nom: "CIGARES (roehrricky24, 19/09) — « pull-tab » dans un texte anglais",
    titre: "Lot of 10 Cigars", marque: "Swisher Sweets", objetIa: "Cigars",
    description: "Lot of 10 Swisher Sweets cigars in original packaging. Multiple varieties visible including Swisher Sweets Cigar Blunt Wraps and Swisher Sweets Smooth Cigars. All cigars appear to be in sealed plastic wrapping with blue and yellow pull-tab bands. Stored in a green plastic container. No visible damage to packaging or product.",
    attendu: "passe2_ecartee" },

  // ── VOIE 2 : le mot de l'IA contredit → la passe 2 se tait ────────────────
  { nom: "carte Pokémon rangée en Consoles par « Nintendo »",
    titre: "Carte Lanssorien Poing de Fusion niveau 2 PV 150", marque: "Pokémon",
    objetIa: "Carte Pokémon Lanssorien",
    description: "Carte de niveau 2 représentant Lanssorien. Points de vie : 150. Édition française, copyright 2021 /Nintendo/Creatures/GAME FREAK.",
    attendu: "passe2_ecartee" },
  { nom: "carte Pokémon rangée en Bagagerie par « pochette de protection »",
    titre: "Carte Regigigas 150 PV BASE SWSH247", marque: "Pokémon",
    objetIa: "Carte Pokémon Regigigas",
    description: "Carte Regigigas de type Métal, 150 PV, de la série de base. Carte en très bon état, sans usure visible, conservée en pochette de protection.",
    attendu: "passe2_ecartee" },

  // ── LES SAUVETAGES, QUI DOIVENT TOUS SURVIVRE ────────────────────────────
  // Le mot de l'IA est INCONNU de nos règles → aucune contradiction prouvable
  // → on ne bloque pas. C'est la voie 3, écartée, qui les aurait perdus.
  { nom: "chapka : « Chapka bébé » inconnu de nos règles, la passe 2 garde la main",
    titre: "Chapka 18-23 mois gris et blanc", marque: "Obaibi", objetIa: "Chapka bébé",
    description: "Chapka pour bébé en taille 18-23 mois. Bonnet gris avec doublure et cache-oreilles en fourrure synthétique blanche.",
    attendu: "mot_cle_description", icone: "🧢" },
  { nom: "fleece : « Fleece half-zip » inconnu, la passe 2 garde la main",
    titre: "Fleece half-zip bleu marine", marque: "Quechua", objetIa: "Fleece half-zip",
    description: "Veste polaire Quechua avec fermeture éclair demi-zip et col montant. Intérieur turquoise contrastant. Aucune usure visible.",
    attendu: "mot_cle_description", icone: "🧥" },
  { nom: "titre = faute de frappe, la description sauve",
    titre: "Je an bleu", marque: "Kiabi",
    description: "Jean bleu Kiabi taille 5 ans",
    attendu: "mot_cle_description", icone: "👖" },
  { nom: "l'IA et la passe 2 s'accordent : rien ne change",
    titre: "Air 1 Retro High Shattered Backboard 3.0 noir orange", marque: "Jordan",
    objetIa: "Baskets Jordan 1 Shattered Backboard",
    description: "Air Jordan 1 Retro High OG Shattered Backboard 3.0. Aucune usure visible, état impeccable.",
    attendu: "mot_cle_description", icone: "👟" },
  { nom: "dessous de plat → Arts de la table (sauvetage sans mot d'IA)",
    titre: "Dessous de plat Salvamanteles bambou 6 emplacements",
    description: "Dessous de plat en bambou avec 6 emplacements pour verres ou couverts. Produit neuf, jamais utilisé.",
    attendu: "mot_cle_description", icone: "🍽️" },

  // ── CE QUE LA GARDE NE RÉPARE PAS, ET C'EST ASSUMÉ ───────────────────────
  // Le mot de l'IA est inconnu de nos règles : aucune contradiction prouvable,
  // la description garde la main et se trompe. Mesuré, écrit, pas masqué.
  { nom: "NON RÉPARÉ : robot cuiseur → Ordinateurs par « écran LCD »",
    titre: "My Little Chef - Robot cuiseur multifonction 2L", marque: "Senya",
    objetIa: "Robot cuiseur multifonction",
    description: "Robot cuiseur multifonction My Little Chef neuf avec emballage d'origine. Bol inox 2L, écran LCD tactile, 5 programmes automatiques.",
    attendu: "mot_cle_description", icone: "🖥️" },
];

let ko = 0;
for (const c of CAS) {
  const d = decision(c);
  if (d.source !== c.attendu) {
    ko++;
    console.error(`✗ ${c.nom}\n    attendu source=${c.attendu}, obtenu source=${d.source} (icône ${d.icon})`);
    continue;
  }
  if (c.icone && d.icon !== c.icone) {
    ko++;
    console.error(`✗ ${c.nom}\n    attendu icône=${c.icone}, obtenu ${d.icon}`);
  }
}

if (ko) { console.error(`\n${ko} échec(s).`); process.exit(1); }
console.log(`✓ passe 2 : ${CAS.length} cas réels conformes — passe 1 intacte, 3 cassés réparés, 5 sauvetages conservés.`);
