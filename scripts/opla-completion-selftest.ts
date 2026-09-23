// ═══════════════════════════════════════════════════════════════════════════
// LA CHAÎNE, PAS SES MAILLONS — selftest de _shared/opla-completion.ts
// ═══════════════════════════════════════════════════════════════════════════
//   deno run --allow-read scripts/opla-completion-selftest.ts
//
// ⛔ CE FICHIER EXÉCUTE LE CODE DU SERVEUR sur les platform_fields RÉELS des
// jobs du 20/09 au soir, relevés en base. Il ne lit pas le code, il l'appelle.
// C'est la leçon du soir : « 38 → M » passait son propre selftest, la cascade
// passait le sien, et les trois robes de meminiandmove échouaient quand même —
// parce que rien n'exécutait leur ENCHAÎNEMENT.
// ═══════════════════════════════════════════════════════════════════════════
import { completerJobOpla, type OplaMem } from "../supabase/functions/_shared/opla-completion.ts";
import { brancheVinted } from "../supabase/functions/_shared/vinted-branche.ts";
import { feuillesParMot, trancherCandidats } from "../supabase/functions/_shared/opla-resolution.ts";

let ko = 0;
const ok = (nom: string, vrai: boolean, vu?: unknown) => {
  console.log(`  ${vrai ? "ok  " : "ÉCHEC"} ${nom}${vrai ? "" : `  — vu : ${JSON.stringify(vu)}`}`);
  if (!vrai) ko++;
};
const attr = (v: unknown, source = "vinted_detail") => ({ v, at: "2026-09-20T18:00:00.000Z", source });

/** Un job tel que get-pending-jobs le voit, puis complété. */
const passer = (j: {
  id: string;
  statut?: string;
  pf: Record<string, unknown>;
  attrs?: Record<string, unknown>;
  titre?: string;
  vintedCatalogId?: unknown;
  memoire?: Map<string, OplaMem>;
}) => {
  const pf = structuredClone(j.pf);
  const r = completerJobOpla({
    id: j.id,
    statut: j.statut ?? "pending",
    pf,
    attrs: j.attrs,
    titre: j.titre ?? null,
    vintedCatalogId: j.vintedCatalogId ?? null,
    memoire: j.memoire,
  });
  return { pf, ...r };
};

// ── LES CINQ DÉPÔTS DE meminiandmove, 20:03 → 20:07 ────────────────────────
// Relevés en base ce soir. Deux sont PASSÉS, trois ont échoué : un seul champ
// les sépare — `genre`. C'est le corpus de la passe.
console.log("\n── meminiandmove, 20/09 20:03-20:07 : les cinq du même lot ──");

const ROBE_ROUGE = {
  id: "ac1e01de",
  titre: "Robe rouge froncée Oh Polly – Taille 38",
  pf: { categorie_objet_ia: "robe", categorie_mot_cle_titre: "robe", genre: "", taille: "38" },
  attrs: { categorie_vinted: attr(178), taille: attr("M") }, // 178 = Femmes › Robes › Mini
};
const ROBE_CHAMPAGNE = {
  id: "1a22b0f3",
  titre: "Robe courte Oh Polly champagne froncée et ajourée – Taille 38",
  pf: { categorie_objet_ia: "robe", categorie_mot_cle_titre: "robe", genre: "", taille: "38" },
  attrs: { categorie_vinted: attr(178), taille: attr("M") },
};
const PANTALON = {
  id: "27fb9fb1",
  titre: "Pantalon cigarette Sandro gris anthracite – Taille 36",
  pf: { categorie_objet_ia: "pantalon", categorie_mot_cle_titre: "pantalon", genre: "", taille: "38" },
  attrs: { categorie_vinted: attr(1846), taille: attr("M / 38 / 10", "vinted_liste") },
};
const TSHIRT = { // PASSÉ ce soir — il ne doit pas bouger d'un octet
  id: "4871607e",
  titre: "T-shirt homme C&A bleu marine délavé – Taille S",
  pf: {
    categorie_objet_ia: "t-shirt",
    categorie_mot_cle_titre: "t-shirt",
    genre: "Homme",
    taille: "S",
    oplaCategoryCode: "MEN_TOP_T_SHIRTS",
  },
  attrs: { categorie_vinted: attr(1806), taille: attr("S", "vinted_liste") },
};
const POLO = { // PASSÉ ce soir — idem
  id: "0f6dbcba",
  titre: "Polo Yamaha Racing GYTR Yamalube bleu – Taille L",
  pf: {
    categorie_objet_ia: "polo",
    categorie_mot_cle_titre: "polo",
    genre: "Homme",
    taille: "L",
    oplaCategoryCode: "MEN_TOP_POLOS",
  },
  attrs: { categorie_vinted: attr(5492), taille: attr("L") },
};

for (
  const [nom, cas, feuille, taille] of [
    ["robe rouge Oh Polly", ROBE_ROUGE, "WOM_DRE_OTHER", "M"],
    ["robe champagne Oh Polly", ROBE_CHAMPAGNE, "WOM_DRE_OTHER", "M"],
    ["pantalon cigarette Sandro", PANTALON, "W_REGULAR_PANTS", "M"],
  ] as const
) {
  const { pf } = passer(cas);
  ok(`${nom} → ${feuille}`, pf.oplaCategoryCode === feuille, pf.oplaCategoryCode ?? pf.oplaCategoryAsk);
  ok(`${nom} → taille « ${taille} », et plus « 38 »`, pf.taille === taille, pf.taille);
  ok(`${nom} → aucune question posée`, !pf.oplaCategoryAsk, pf.oplaCategoryAsk);
  ok(`${nom} → genre « Femme », lu sur l'étagère Vinted`, pf.genre === "Femme", pf.genre);
}
for (
  const [nom, cas, feuille, taille] of [
    ["t-shirt C&A (passé)", TSHIRT, "MEN_TOP_T_SHIRTS", "S"],
    ["polo Yamaha (passé)", POLO, "MEN_TOP_POLOS", "L"],
  ] as const
) {
  const { pf } = passer(cas);
  ok(`${nom} : catégorie inchangée`, pf.oplaCategoryCode === feuille, pf.oplaCategoryCode);
  ok(`${nom} : taille inchangée`, pf.taille === taille, pf.taille);
  ok(`${nom} : genre inchangé`, pf.genre === "Homme", pf.genre);
}

// ── ① LA RÉPONSE DE LA PERSONNE S'APPLIQUE AU JOB ──────────────────────────
// L'état EXACT du job ac1e01de quand le serveur l'a servi à 20:11:27 : la
// question posée par l'extension (DEUX feuilles), et la réponse donnée.
// Avant ce soir, le serveur mémorisait la réponse et repartait de zéro : il
// réécrivait une question de TREIZE feuilles, `oplaCategoryCode` restait vide,
// donc le bloc taille ne tournait pas, « 38 » partait tel quel — et le pré-vol
// de l'extension 0.6.47, qui n'a pas la table femme, refusait.
console.log("\n── ① la réponse donnée n'est jamais recalculée (G2) ──");
{
  const avecReponse = {
    ...ROBE_ROUGE,
    pf: {
      ...ROBE_ROUGE.pf,
      oplaCategoryAsk: {
        ancre: null,
        le: "2026-09-20T18:05:00.000Z",
        options: [
          { code: "WOM_DRE_OTHER", title: "Femmes › Vêtements › Robes › Autres robes" },
          { code: "WOM_SPO_DRESSES", title: "Femmes › Vêtements › Vêtements de sport › Robes" },
        ],
      },
      oplaCategoryChoice: "Femmes › Vêtements › Robes › Autres robes",
      needsUserResolved: { oplaCategoryChoice: "Femmes › Vêtements › Robes › Autres robes" },
    },
  };
  const { pf, trace, aRetenir } = passer(avecReponse);
  ok("sa réponse devient la catégorie du job", pf.oplaCategoryCode === "WOM_DRE_OTHER", pf.oplaCategoryCode);
  ok(
    "le chemin part avec elle",
    Array.isArray(pf.oplaCategoryPath) && (pf.oplaCategoryPath as string[])[0] === "Femmes",
    pf.oplaCategoryPath,
  );
  ok("et la taille se normalise contre SA feuille : 38 → M", pf.taille === "M", pf.taille);
  ok("la question n'est pas reposée par-dessus", !(trace as Record<string, unknown>).oplaCategoryAsk, trace);
  ok("la trace nomme la source", /votre réponse/.test(JSON.stringify(trace)), trace);
  ok("la réponse est rangée pour le compte", aRetenir?.entree.code === "WOM_DRE_OTHER", aRetenir);
  ok("clé = la question posée, les deux codes triés", aRetenir?.cle === "WOM_DRE_OTHER|WOM_SPO_DRESSES", aRetenir?.cle);
}
{
  // Une réponse SANS `needsUserResolved` n'est pas la sienne : on ne la pose pas.
  const sansTrace = {
    ...ROBE_ROUGE,
    pf: {
      ...ROBE_ROUGE.pf,
      oplaCategoryAsk: {
        ancre: null,
        le: "x",
        options: [
          { code: "WOM_SPO_DRESSES", title: "Femmes › Vêtements › Vêtements de sport › Robes" },
          { code: "MAXI_DRESSES", title: "Femmes › Vêtements › Robes › Robes longues" },
        ],
      },
      oplaCategoryChoice: "Femmes › Vêtements › Vêtements de sport › Robes",
    },
  };
  const { pf, aRetenir } = passer(sansTrace);
  ok("une réponse que la personne n'a pas confirmée n'est pas rangée", aRetenir === null, aRetenir);
  ok("…et ne devient pas la catégorie du job", pf.oplaCategoryCode !== "WOM_SPO_DRESSES", pf.oplaCategoryCode);
}
{
  // G2 : un rayon DÉJÀ choisi ne se recalcule pas, même s'il contredit le mot.
  const choisi = { ...PANTALON, pf: { ...PANTALON.pf, oplaCategoryCode: "WOM_TRO_OTHER" } };
  const { pf } = passer(choisi);
  ok("une feuille déjà posée sur le job est intouchable", pf.oplaCategoryCode === "WOM_TRO_OTHER", pf.oplaCategoryCode);
}

// ── ② LE GENRE VIENT DE L'ÉTAGÈRE VINTED, ET DE RIEN D'AUTRE ──────────────
console.log("\n── ② le genre lu chez Vinted, jamais deviné ──");
ok("178 (Femmes › Robes › Mini) → Femme", brancheVinted(178) === "Femme", brancheVinted(178));
ok("5492 (Hommes › Polos) → Homme", brancheVinted(5492) === "Homme", brancheVinted(5492));
ok("1819 (Hommes › Jeans coupe droite) → Homme", brancheVinted(1819) === "Homme", brancheVinted(1819));
ok("1195 (Vêtements pour filles) → Fille", brancheVinted(1195) === "Fille", brancheVinted(1195));
ok("1918 (Maison) → aucun genre", brancheVinted(1918) === null, brancheVinted(1918));
ok("un identifiant inconnu → aucun genre", brancheVinted(999999) === null, brancheVinted(999999));
ok("pas d'identifiant → aucun genre", brancheVinted(null) === null, brancheVinted(null));
{
  // Une valeur sans source ne vaut rien — même règle que `valeurCertaine`.
  const sansSource = { ...ROBE_ROUGE, attrs: { categorie_vinted: { v: 178 } } };
  const { pf } = passer(sansSource);
  ok("une catégorie Vinted sans source ne pose aucun genre", !String(pf.genre ?? "").trim(), pf.genre);
  ok("…et la question repart plutôt que de deviner", !!pf.oplaCategoryAsk, pf.oplaCategoryAsk ? "question" : pf.oplaCategoryCode);
}
{
  // Le genre déjà posé sur le job gagne : on ne le remplace jamais.
  const dejaGenre = { ...ROBE_ROUGE, pf: { ...ROBE_ROUGE.pf, genre: "Fille" } };
  const { pf } = passer(dejaGenre);
  ok("un genre déjà posé n'est pas écrasé par l'étagère Vinted", pf.genre === "Fille", pf.genre);
}

// ── ② bis — « AUTRES X » EST LE FOURRE-TOUT, PAS LE NOM DU RAYON ──────────
console.log("\n── ② bis le départage entre frères ──");
{
  const pantalons = feuillesParMot(["pantalon"]).filter((f) => ["W_REGULAR_PANTS", "WOM_TRO_OTHER"].includes(f.code));
  ok("les deux feuilles existent bien dans l'arbre", pantalons.length === 2, pantalons.map((f) => f.code));
  const r = trancherCandidats(pantalons, { mots: ["pantalon"], genre: "Femme" });
  ok("« Pantalons » l'emporte sur « Autres pantalons »", r.feuille?.code === "W_REGULAR_PANTS", r.feuille?.code ?? r.motif);
  ok("…et le motif le dit", /fourre-tout/.test(r.motif), r.motif);
}
{
  // Trois frères dont UN seul fourre-tout, mais deux nommés : on ne tranche pas.
  const robes = feuillesParMot(["robe"]).filter((f) =>
    ["WOM_DRE_OTHER", "MAXI_DRESSES", "SUMMER_DRESSES"].includes(f.code)
  );
  ok("les trois feuilles existent bien dans l'arbre", robes.length === 3, robes.map((f) => f.code));
  const r = trancherCandidats(robes, { mots: ["robe"], genre: "Femme" });
  ok("deux étiquettes nommées ⇒ la question repart entière", r.feuille === null, r.feuille?.code);
}

// ── ③ CHAMP VIDE PLUTÔT QUE CHAMP MENTEUR (G1) ────────────────────────────
console.log("\n── ③ on ne force aucune taille ──");
{
  const demiPointure = {
    id: "sonde",
    titre: "Nike Pacific Rose – 44,5",
    pf: { categorie_objet_ia: "baskets", genre: "Homme", taille: "44,5", oplaCategoryCode: "MEN_SNEAKERS" },
  };
  const { pf } = passer(demiPointure);
  ok("une demi-pointure hors grille reste telle quelle", pf.taille === "44,5", pf.taille);
}
{
  const horsTable = { ...ROBE_ROUGE, pf: { ...ROBE_ROUGE.pf, taille: "46" } };
  const { pf } = passer(horsTable);
  ok("un « 46 » hors de la table femme n'est pas arrondi", pf.taille === "46", pf.taille);
}
{
  // La table femme ne vaut QUE la branche femme : un « 38 » d'homme reste 38.
  const homme = {
    id: "sonde",
    titre: "Jean droit homme 38",
    pf: { categorie_objet_ia: "jean", genre: "Homme", taille: "38", oplaCategoryCode: "MEN_STRAIGHTFIT_JEANS" },
  };
  const { pf } = passer(homme);
  ok("un « 38 » d'homme n'est jamais traduit en M", pf.taille === "38", pf.taille);
}

// ── ④ L'ÉTAGÈRE VINTED DE LA FICHE — LA COLONNE, PAS SEULEMENT L'ATTRIBUT ──
// Job 796582df (van-breugel.sandra, 23/09 12:35), platform_fields et fiche
// RELEVÉS EN BASE : « escarpins » deux fois, genre vide, aucune feuille Opla
// ne porte ce mot ; la fiche a `vinted_catalog_id = 543` (Femmes › Chaussures
// › Chaussures à talons) et AUCUN attribut `categorie_vinted` — comme 3 982
// articles du parc. La chaîne ne lisait que l'attribut : rien n'était posé,
// et le pré-vol proposait les huit racines.
console.log("\n── ④ l'étagère Vinted lue sur la colonne de la fiche ──");
const SANDRA = {
  id: "796582df",
  titre: "Escarpins rouges Even&Odd T37 neuf",
  pf: {
    etat: "new", genre: "", marque: "Even&Odd", taille: "37", couleur: "Rouge", couleurs: ["Rouge"],
    categorie: "Mode", categorie_source: "catalog_vinted", categorie_icone: "👠",
    categorie_objet_ia: "escarpins", categorie_mot_cle_titre: "escarpins",
  },
  attrs: {
    etat: attr("Neuf sans étiquette", "capture"), taille: attr("37", "capture"), couleur: attr("Rouge", "capture"),
    marque: attr("Even&Odd", "vinted_liste"),
  },
};
{
  const { pf } = passer(SANDRA);
  ok("AVANT (fiche sans colonne lue) : aucune catégorie, aucun genre — c'est le défaut du 23/09",
    !pf.oplaCategoryCode && !pf.oplaCategoryAsk && !String(pf.genre ?? ""), { code: pf.oplaCategoryCode, ask: pf.oplaCategoryAsk, genre: pf.genre });
}
{
  const { pf, trace } = passer({ ...SANDRA, vintedCatalogId: 543 });
  ok("APRÈS : la colonne vinted_catalog_id = 543 pose le genre Femme", pf.genre === "Femme", pf.genre);
  ok("… et la catégorie HIGH_HEELS (Femmes › Chaussures › Chaussures à talons)", pf.oplaCategoryCode === "HIGH_HEELS", pf.oplaCategoryCode);
  ok("… par l'étagère, et la trace le dit", String((trace.oplaCategoryCode as Record<string, unknown>)?.source ?? "").startsWith("étagère Vinted de l'article « Femmes › Chaussures › Chaussures à talons » (inventaire.vinted_catalog_id)"), trace.oplaCategoryCode);
  ok("… la taille 37 est dans la grille de la feuille, elle reste telle quelle", pf.taille === "37", pf.taille);
  ok("… et aucune question n'est posée", !pf.oplaCategoryAsk, pf.oplaCategoryAsk);
}
{
  // L'attribut garde la priorité quand il existe (il porte sa source) ; une
  // colonne différente ne le contredit pas.
  const { pf } = passer({ ...SANDRA, attrs: { ...SANDRA.attrs, categorie_vinted: attr(543) }, vintedCatalogId: 999999 });
  ok("l'attribut sourcé prime sur la colonne", pf.oplaCategoryCode === "HIGH_HEELS" && pf.genre === "Femme", [pf.oplaCategoryCode, pf.genre]);
  const sansSource = passer({ ...SANDRA, attrs: { ...SANDRA.attrs, categorie_vinted: { v: 543, source: "manuel" } } }).pf;
  ok("un attribut sans source relevée ne vaut rien (et sans colonne, rien n'est posé)", !sansSource.oplaCategoryCode && !sansSource.genre, [sansSource.oplaCategoryCode, sansSource.genre]);
  const inconnue = passer({ ...SANDRA, vintedCatalogId: 424242 }).pf;
  ok("une étagère inconnue de l'arbre relevé ne pose rien", !inconnue.oplaCategoryCode && !inconnue.genre, [inconnue.oplaCategoryCode, inconnue.genre]);
}
{
  // Job 6339a55e (geronimo0550, « Maillot NBA Mitchell & Ness »), relevé en
  // base : le serveur avait posé MEN_SNEAKERS — un maillot au rayon des
  // baskets, parce que « maillot de basket » contient « basket ». L'étagère
  // du vendeur (3267 = Hommes › … › Maillots) tranche parmi les deux.
  const { pf } = passer({
    id: "6339a55e",
    titre: "Maillot NBA Mitchell & Ness - Penny Hardaway - Orlando Magic 1994-95 - Hardwood Classics",
    pf: { genre: "Homme", categorie_objet_ia: "maillot de basket", categorie_mot_cle_titre: "maillot" },
    vintedCatalogId: 3267,
  });
  ok("un maillot de basket rangé sur « Maillots » part en MEN_JERSEYS, plus jamais en baskets", pf.oplaCategoryCode === "MEN_JERSEYS", pf.oplaCategoryCode);
}

console.log(ko ? `\n❌ ${ko} contrôle(s) en échec\n` : "\n✅ la chaîne Opla complète passe — catégorie, genre, taille\n");
Deno.exit(ko ? 1 : 0);
