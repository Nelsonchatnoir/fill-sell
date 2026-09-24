// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — « valeur générale + exception par plateforme » (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Trois garde-fous du lot, et ils ne se relisent pas à l'œil :
//   1. une carte DISSOCIÉE n'est jamais écrasée par la valeur générale ;
//   2. l'état traduit vers chaque plateforme n'est JAMAIS meilleur que le réel ;
//   3. la mise en conformité RETIRE ou RACCOURCIT, elle ne reformule pas.
// Plus le cas de Louis THONET, joué en entier sur son vrai texte.
//
//   node scripts/valeurs-generales-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import {
  appliquerGenerale, dissocier, rattacher, valeurCommune, valeurPourPlateforme,
  lireValeur, dissociationsVides, suitLaGenerale,
} from "../src/utils/valeursGenerales.js";
import { conformerTexte, couperAuMot, reduireSuitesDeSymboles } from "../src/utils/texteConforme.js";
import {
  etatPourPlateforme, tierEtat, RANG_ETAT, PALIERS_ETAT, retirerEtatContredit,
  etatAffirmeParLeTexte as etatAffirme,
} from "../supabase/functions/_shared/etat-plateformes.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs += 1;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};

const copie = (t, d, e) => ({ title: t, description: d, platform_fields: { etat: e }, price: 10 });
const PF = ["vinted", "leboncoin", "beebs", "ebay", "opla"];

console.log("\n1. LA CARTE DISSOCIÉE N'EST JAMAIS ÉCRASÉE");
{
  let edited = Object.fromEntries(PF.map((p) => [p, copie("Titre A", "Desc A", "Très bon état")]));
  let d = dissociationsVides();
  // eBay est modifiée à part, puis la valeur générale change deux fois.
  d = dissocier(d, "titre", "ebay");
  edited = { ...edited, ebay: { ...edited.ebay, title: "Titre eBay à moi" } };
  edited = appliquerGenerale(edited, { champ: "titre", valeur: "Titre B", plateformes: PF, dissociees: d });
  edited = appliquerGenerale(edited, { champ: "titre", valeur: "Titre C", plateformes: PF, dissociees: d });
  ok(edited.ebay.title === "Titre eBay à moi", "eBay garde son titre après deux changements généraux", edited.ebay.title);
  ok(edited.vinted.title === "Titre C", "Vinted suit la valeur générale", edited.vinted.title);
  ok(!suitLaGenerale(d, "titre", "ebay"), "eBay est bien marquée dissociée");
  ok(suitLaGenerale(d, "description", "ebay"), "la dissociation ne déborde pas d'un champ à l'autre");
  // Rétablir en un tap : eBay reprend la valeur générale, les autres ne bougent pas.
  d = rattacher(d, "titre", "ebay");
  edited = appliquerGenerale(edited, { champ: "titre", valeur: "Titre C", plateformes: PF, dissociees: d });
  ok(edited.ebay.title === "Titre C", "« Rétablir » ramène eBay sur la valeur générale", edited.ebay.title);
}

console.log("\n2. L'ÉTAT N'EST JAMAIS EMBELLI");
{
  for (const tier of PALIERS_ETAT) {
    for (const p of [...PF, "vestiaire"]) {
      const source = { neuf_etiquette: "Neuf avec étiquette", neuf_sans: "Neuf sans étiquette", tres_bon: "Très bon état", bon: "Bon état", satisfaisant: "Satisfaisant" }[tier];
      const r = etatPourPlateforme(source, p);
      if (!r) { ok(false, `${p} / ${tier} : aucune correspondance`); continue; }
      const pire = RANG_ETAT[r.tier] <= RANG_ETAT[tier];
      // Vestiaire n'a pas de palier bas : c'est le SEUL cas où la plateforme
      // force vers le haut, et il doit être SIGNALÉ (meilleur === true).
      if (!pire) ok(r.meilleur === true, `${p} / ${tier} → « ${r.valeur} » est signalé comme meilleur`);
      else ok(r.meilleur === false, `${p} / ${tier} → « ${r.valeur} » n'est pas meilleur que le réel`);
    }
  }
  // La traduction passe par la valeur générale, comme à l'écran.
  const r = valeurPourPlateforme("etat", "Satisfaisant", "beebs");
  ok(r.valeur === "État moyen", "« Satisfaisant » → « État moyen » chez Beebs", r.valeur);
  ok(valeurPourPlateforme("etat", "Satisfaisant", "leboncoin").valeur === "État satisfaisant",
    "« Satisfaisant » → « État satisfaisant » chez Leboncoin");
  ok(valeurPourPlateforme("etat", "Neuf sans étiquette", "beebs").valeur === "Neuf, sans étiquette",
    "la virgule de Beebs est respectée");
}

console.log("\n3. LA CONFORMITÉ RETIRE OU RACCOURCIT, ELLE NE REFORMULE PAS");
{
  const long = "Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices de la marque SEB, neuf";
  const c = conformerTexte("ebay", { titre: long, description: "ok" });
  ok(c.titre.length <= 80, `titre eBay ramené à ${c.titre.length} caractères`);
  ok(long.startsWith(c.titre), "le titre coupé est un PRÉFIXE de l'original (aucune reformulation)", c.titre);
  ok(c.notes.includes("titreCoupe"), "la coupe est signalée");
  ok(!/\s$/.test(c.titre), "pas d'espace en fin de coupe");
  ok(conformerTexte("leboncoin", { titre: long }).titre === long, "sous le plafond Leboncoin (200), le titre passe INTACT");

  const s = reduireSuitesDeSymboles("trois... et deux-- et ok!! et un.");
  ok(s.texte === "trois. et deux-- et ok!! et un.", "les suites de 3+ signes sont ramenées à un seul, pas les doubles", s.texte);
  ok(conformerTexte("vinted", { description: "trois..." }).description === "trois.", "Vinted : suite de symboles réduite");
  ok(conformerTexte("leboncoin", { description: "trois..." }).description === "trois...", "Leboncoin : rien à réduire, texte intact");

  ok(couperAuMot("abcdefghij", 5) === "abcde", "sans espace exploitable, on coupe net", couperAuMot("abcdefghij", 5));

  const lbc = conformerTexte("leboncoin", { description: "Voir mon dressing Vinted #a #b #c #d #e #f" });
  ok(lbc.description === "Voir mon dressing Vinted #a #b #c #d #e #f", "Leboncoin : le texte n'est PAS modifié ici (le serveur s'en charge)");
  ok(lbc.signale.includes("lbcMentions") && lbc.signale.includes("lbcHashtags"), "les deux retraits de Leboncoin sont SIGNALÉS", JSON.stringify(lbc.signale));
}

console.log("\n4. LA VALEUR GÉNÉRALE SE DÉDUIT DE CE QUI EXISTE");
{
  const d = dissociationsVides();
  const meme = Object.fromEntries(PF.map((p) => [p, copie("Même titre", "Même desc", etatPourPlateforme("Bon état", p).valeur)]));
  ok(valeurCommune(meme, "titre", PF, d) === "Même titre", "titre commun trouvé");
  ok(valeurCommune(meme, "etat", PF, d) === "Bon état", "état commun rendu dans le vocabulaire de référence", valeurCommune(meme, "etat", PF, d));

  const divergent = { ...meme, ebay: copie("Autre titre", "Même desc", "Bon état") };
  ok(valeurCommune(divergent, "titre", PF, d) === "", "titres divergents → aucune valeur générale (on n'en invente pas)");
  ok(valeurCommune(divergent, "description", PF, d) === "Même desc", "la divergence d'un champ n'emporte pas l'autre");

  // Une copie raccourcie par SON plafond n'est pas une divergence.
  const titreLong = "Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices SEB";
  const avecCoupe = Object.fromEntries(PF.map((p) => [p, copie(conformerTexte(p, { titre: titreLong }).titre, "d", "Bon état")]));
  ok(valeurCommune(avecCoupe, "titre", PF, d) === titreLong, "un titre coupé chez eBay ne casse pas la valeur générale", valeurCommune(avecCoupe, "titre", PF, d));

  // Dissociée = hors du vote.
  let d2 = dissocier(dissociationsVides(), "titre", "ebay");
  ok(valeurCommune(divergent, "titre", PF, d2) === "Même titre", "la carte dissociée ne vote pas");
}

console.log("\n5. LE CAS DE LOUIS THONET, EN ENTIER");
{
  // Son article 1789991601609, relevé Beebs du 21/09 — texte et état réels.
  const TITRE = "Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices";
  const DESC = "Rangement pratique pour yaourtière Multidélices de chez SEB 🥣\n📦 Capacité : 12 pots + 12 couvercles\n⚠️ Pots et couvercles non fournis\n✅ Permet un stockage propre et organisé\n✅ Idéal pour optimiser l'espace dans vos placards\n✅ État : neuf\nAccessoire pratique pour compléter votre équipement Multidélices.";
  const ETAT = "Neuf, sans étiquette";

  let edited = Object.fromEntries(["leboncoin", "vinted"].map((p) => [p, copie("", "", "")]));
  const pf = ["leboncoin", "vinted"];
  const d = dissociationsVides();
  edited = appliquerGenerale(edited, { champ: "titre", valeur: TITRE, plateformes: pf, dissociees: d });
  edited = appliquerGenerale(edited, { champ: "description", valeur: DESC, plateformes: pf, dissociees: d });
  edited = appliquerGenerale(edited, { champ: "etat", valeur: ETAT, plateformes: pf, dissociees: d });

  ok(lireValeur(edited.leboncoin, "titre") === TITRE, "son titre part INTACT sur Leboncoin", lireValeur(edited.leboncoin, "titre"));
  ok(lireValeur(edited.leboncoin, "description") === DESC, "sa description part INTACTE sur Leboncoin");
  ok(lireValeur(edited.leboncoin, "etat") === "Neuf sans étiquette", "l'état devient le libellé Leboncoin", lireValeur(edited.leboncoin, "etat"));
  ok(lireValeur(edited.vinted, "etat") === "Neuf sans étiquette", "et le libellé Vinted");
  ok(!/Remise en main propre ou envoi possible/.test(lireValeur(edited.leboncoin, "description")),
    "aucune phrase ajoutée (c'est exactement ce que l'IA lui ajoutait)");

  // Et le texte que l'IA lui avait produit, repassé au filtre du serveur :
  const iaDit = "Rangement blanc et orange pour yaourtière Multidélices - 12 pots. Article en TRÈS BON ÉTAT. Remise en main propre ou envoi possible.";
  const r = retirerEtatContredit(iaDit, ETAT);
  ok(r.modifie && !/TRÈS BON ÉTAT/.test(r.texte), "le segment « TRÈS BON ÉTAT » est retiré quand l'article est neuf", r.texte);
  ok(/Remise en main propre/.test(r.texte), "le reste de la phrase est conservé tel quel");
  ok(tierEtat(ETAT) === "neuf_sans", "l'état du relevé Beebs est bien lu comme « neuf sans étiquette »");
}

console.log("\n6. LES PIÈGES DU MOT « NEUF » ET LE FILET DU TEXTE VIDÉ");
{
  // « neuf » est aussi un NOMBRE en français. Une annonce de neuf pots n'est
  // pas une annonce d'un article neuf.
  ok(etatAffirme("Lot de neuf pots et neuf couvercles.") === null,
    "« neuf pots » n'est pas un état", String(etatAffirme("Lot de neuf pots et neuf couvercles.")));
  ok(etatAffirme("✅ État : neuf") === "neuf_sans", "« État : neuf » est lu, deux-points compris");
  ok(etatAffirme("Comme neuf, porté deux fois.") === "tres_bon", "« comme neuf » n'est pas « neuf »");
  ok(etatAffirme("Très bon état général.") === "tres_bon", "« très bon état » l'emporte sur « bon état »");
  ok(etatAffirme("Jamais porté, encore emballé.") === "neuf_sans", "« jamais porté » vaut neuf");

  // FAIL-SAFE : si retirer le segment vide le texte, on rend l'original.
  const r = retirerEtatContredit("Article en très bon état.", "Neuf sans étiquette");
  ok(!r.modifie && r.texte === "Article en très bon état.",
    "un texte qui ne contient QUE la phrase fautive est rendu intact (annonce sans description = pire)");

  // Un texte cohérent avec le champ n'est jamais touché.
  const coherent = "Rangement pratique 🥣\n✅ État : neuf\nAccessoire pratique.";
  ok(!retirerEtatContredit(coherent, "Neuf, sans étiquette").modifie,
    "un texte qui dit la même chose que le champ n'est pas touché");
  // Ni un texte qui ne parle pas d'état du tout.
  ok(!retirerEtatContredit("Pull en laine, taille M. Envoi rapide.", "Bon état").modifie,
    "un texte qui ne parle pas d'état n'est pas touché");
}

console.log("\n7. LA VALEUR GÉNÉRALE NE REGARDE PAS LES CASES COCHÉES (câblage, 21/09)");
{
  // ⛔ CE BLOC LIT LE FICHIER D'ÉCRAN, ET C'EST VOULU. Le défaut d'Ornella ne
  //    vivait PAS dans la logique : appliquerGenerale reçoit ses plateformes
  //    en paramètre et fait exactement ce qu'on lui demande. Il vivait dans le
  //    CÂBLAGE — les trois appels passaient `selected`, la liste des cases
  //    cochées. La copie Opla, elle, ne vient pas de generate-listing (elle
  //    est dérivée de celle de Vinted un rendu plus tard) et une fiche
  //    rouverte la décochait ; elle ne recevait donc aucune valeur générale et
  //    repartait au prix proposé par Lens. Mesuré en base : 13 lots sur 30
  //    jours, jusqu'à 42 € au lieu de 20.
  //    Un selftest de logique ne pouvait pas voir ça. Celui-ci le voit.
  const src = readFileSync(new URL("../src/components/ListingPreviewScreen.jsx", import.meta.url), "utf8");
  // (refonte 24/09) La forme du job vit dans le moteur (construireJobs,
  // src/publication/moteur/regles.js) : la ligne « prix de SA copie » se
  // cherche là aussi — le stepper ne fait plus que l'appeler.
  const regles = readFileSync(new URL("../src/publication/moteur/regles.js", import.meta.url), "utf8");
  const corpsDe = (nom, n) => {
    const i = src.indexOf(nom);
    return i < 0 ? "" : src.slice(i, i + n);
  };

  const prix = corpsDe("const applyCentralPrice = (raw)", 420);
  ok(/for \(const p of Object\.keys\(next\)\)/.test(prix), "le prix central écrit dans TOUTES les copies");
  ok(!/of selected\b/.test(prix), "le prix central ne boucle plus sur les cases cochées");
  ok(/customPriced\.has\(p\)/.test(prix), "et il saute toujours les cartes au prix personnalisé");

  const poser = corpsDe("const poserValeurGenerale = (champ, valeur)", 250);
  ok(/plateformes: Object\.keys\(prev\)/.test(poser), "titre / description / état sont écrits dans TOUTES les copies");
  ok(!/\[\.\.\.selected\]/.test(poser), "et pas sur les seules cases cochées");
  ok(/dissociees/.test(poser), "les cartes dissociées restent hors d'atteinte");

  ok(/const pf = Object\.keys\(edited\);/.test(src), "le semis des valeurs générales couvre lui aussi toutes les copies");

  // La copie Opla naît sur les valeurs générales, jamais sur l'exception de
  // Vinted : c'est ce qui la rend identique aux quatre autres dès sa création.
  const derive = corpsDe("function deriverCopieOpla(", 1100);
  ok(/prixGeneral/.test(derive) && /prix \?\? vinted\?\.price/.test(derive),
    "la copie Opla naît sur le prix général, la copie Vinted n'étant qu'un repli");
  ok(/valeurPourPlateforme\(champ, v, "opla"\)/.test(derive),
    "et sur le titre / la description / l'état généraux, mis en conformité Opla");
  ok(/deriverCopieOpla\(src, \{ prixGeneral: price, generales \}\)/.test(src),
    "l'appel lui passe bien le prix général et les valeurs générales");

  // Le déclencheur : une fiche rouverte ne doit plus décocher Opla.
  ok(/const aUneCopie = \(p\) => Boolean\(parPlateforme\[p\] \|\| f\.edited\?\.\[p\]\);/.test(src),
    "une fiche rouverte garde Opla cochée : une copie vaut une annonce générée");

  // Le chemin d'envoi : c'est la copie qui fait le prix du job.
  ok(/price:\s+edited\[platform\]\?\.price\s+\?\? price,/.test(src) || /price:\s+edited\[platform\]\?\.price\s+\?\? price,/.test(regles),
    "le job part avec le prix de SA copie, avec le prix général en repli");
}

console.log(echecs === 0 ? "\n✅ selftest valeurs générales : tout passe\n" : `\n❌ ${echecs} échec(s)\n`);
process.exit(echecs === 0 ? 0 : 1);
