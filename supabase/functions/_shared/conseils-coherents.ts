// ══════════════════════════════════════════════════════════════════════════
// UN ATTRIBUT « NON TESTÉ » N'EST PAS UN ARGUMENT DE VENTE (2026-09-15)
// ══════════════════════════════════════════════════════════════════════════
// Capture du 15/09, pistolet à colle Bosch IXO : l'écran affichait en même
// temps
//     Fonctionne : ? Non testé            (attributs_visibles, étape 1bis)
//     1. Mettre en avant le fonctionnement testé   (conseils, étape 4)
// Les deux sortent du MÊME appel et du MÊME prompt. Rien, dans le prompt, ne
// demande à l'étape 4 de relire ce que l'étape 1bis vient d'écrire.
//
// ET SURTOUT : le serveur FABRIQUE lui-même une partie de ces contradictions.
// assainirSortie (lens-analysis/index.ts) réécrit tout `fonctionne: "oui"` en
// « non testé » — aucune photo fixe ne montre un outil en marche. Le modèle a
// donc pu écrire un attribut affirmatif ET le conseil qui va avec, en parfaite
// cohérence, avant que le serveur ne neutralise l'attribut seul. Une consigne
// de prompt ne peut RIEN contre ce cas-là : elle s'applique avant la
// neutralisation. C'est pourquoi la garde ci-dessous existe en plus de la
// consigne, et non à sa place.
//
// Même patron que retirerPrixDivergents : on ne réécrit jamais la phrase du
// modèle (ce serait fabriquer un conseil qu'il n'a pas écrit), on retire
// l'élément qui contredit, et le champ reste seul à parler.
//
// ⛔ ÉTROITESSE VOULUE. Un filtre trop large viderait la liste sans que
// personne ne s'en aperçoive. Il faut DEUX conditions réunies dans le même
// conseil :
//   (a) il CITE l'attribut resté non testé — marqueur propre à cette clé ;
//   (b) il l'AFFIRME, soit en le présentant comme argument (« mettre en
//       avant », « souligner », « highlight »…), soit en assurant le résultat
//       (« fonctionne parfaitement », « in working order », « rien ne
//       manque »…).
// Un conseil qui ne parle d'aucun attribut, qui parle d'un attribut CONFIRMÉ,
// ou qui conseille de VÉRIFIER (« photographie-le en marche », « précise si
// l'appareil fonctionne ») passe intact : dire qu'on ne sait pas n'est pas
// affirmer. Une clé « non testé » absente de MARQUEURS_ATTRIBUT ne retire
// jamais rien — le défaut est de ne rien faire.

/** « Non testé », « non teste », « NOT TESTED »… → une forme unique. */
const aplatir = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Les deux seules valeurs qui disent « je n'ai pas pu vérifier ». */
const VALEURS_NON_TESTE = new Set(["non teste", "not tested"]);

// ── (a) Le conseil cite-t-il CET attribut ? ────────────────────────────────
// Table FERMÉE, clé par clé, français et anglais dans la même alternative.
// Les clés reprennent celles que lens-analysis peut laisser à « non testé »
// (fonctionnement, complétude, accessoires, emballage, entamé).
const MARQUEURS_ATTRIBUT: Record<string, RegExp> = {
  // ⚠️ PAS de `\bmarche\b` nu : aplatir() retire les accents, donc « marché »
  // devient « marche » et « mettre en avant un prix sous la moyenne du marché »
  // se faisait retirer (auto-test du 15/09). « etat de (?:marche|fonctionnement) » suffit.
  fonctionne:        /(fonctionn|etat de (?:marche|fonctionnement)|\bteste|\bworking\b|\bworks\b|\btested\b)/,
  fonctionnel:       /(fonctionn|etat de (?:marche|fonctionnement)|\bteste|\bworking\b|\bworks\b|\btested\b)/,
  fonctionnement:    /(fonctionn|etat de (?:marche|fonctionnement)|\bteste|\bworking\b|\bworks\b|\btested\b)/,
  en_etat_de_marche: /(fonctionn|etat de (?:marche|fonctionnement)|\bteste|\bworking\b|\bworks\b|\btested\b)/,
  teste:             /(fonctionn|\bteste|\bworking\b|\btested\b)/,
  testee:            /(fonctionn|\bteste|\bworking\b|\btested\b)/,
  working:           /(fonctionn|\bworking\b|\bworks\b|\btested\b)/,
  tested:            /(fonctionn|\bteste|\bworking\b|\btested\b)/,
  complet:           /(\bcomplet|\bcomplete\b|rien ne manque|nothing (?:is )?missing|ensemble complet)/,
  complete:          /(\bcomplet|\bcomplete\b|rien ne manque|nothing (?:is )?missing|ensemble complet)/,
  accessoires_inclus:   /(accessoire|accessor)/,
  accessoires_manquants:/(accessoire|accessor|manquant|missing)/,
  chargeur_inclus:   /(chargeur|charger|charging)/,
  cables_inclus:     /(\bcable|\bcord\b|\blead\b)/,
  boite:             /(\bboite\b|\bboîte\b|\bbox\b|emballage|packaging)/,
  boite_origine:     /(\bboite\b|\bboîte\b|\bbox\b|emballage|packaging|origine|original)/,
  coffret:           /(coffret|\bcase\b|\bbox\b)/,
  entame:            /(entam|\bneuf\b|jamais servi|\bunopened\b|\bunused\b|never used)/,
};

// ── (b1) Le conseil en fait-il un ARGUMENT ? ───────────────────────────────
const MISE_EN_AVANT =
  /(mettre? en avant|mets en avant|mise en avant|mettre? en valeur|mets en valeur|soulign|insist|valoris|met(?:s|tre)? l['’]accent|highlight|emphasi[sz]|showcase|stress that|play up|sell(?:ing)? point|argument de vente)/;

// ── (b2) Ou ASSURE-t-il le résultat ? ──────────────────────────────────────
// Affirmations fermes uniquement. « fonctionne » seul n'y est PAS : « précise
// si l'appareil fonctionne » est un conseil honnête, il doit survivre.
const AFFIRMATION_FERME =
  /(fonctionne (?:parfaitement|tres bien|bien|correctement|sans probleme|toujours)|(?:parfaitement |100 ?% |totalement |entierement )?fonctionnel|en (?:parfait |tres bon |bon )?etat de (?:marche|fonctionnement)|works (?:perfectly|fine|well|great)|in (?:full |perfect )?working order|fully (?:working|functional)|tested and working|rien ne manque|ensemble complet|nothing (?:is )?missing|complete set|jamais servi|never used)/;

/** Clés dont la valeur dit « je n'ai pas pu vérifier ». */
function clesNonTestees(attributs: unknown): string[] {
  if (!attributs || typeof attributs !== "object" || Array.isArray(attributs)) return [];
  return Object.entries(attributs as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && VALEURS_NON_TESTE.has(aplatir(v)))
    .map(([k]) => k);
}

/** Vrai si ce conseil AFFIRME l'un des attributs restés non testés. */
export function conseilContredit(conseil: unknown, attributs: unknown): boolean {
  if (typeof conseil !== "string" || !conseil.trim()) return false;
  const cles = clesNonTestees(attributs);
  if (!cles.length) return false;
  const plat = aplatir(conseil);
  // (b) d'abord : la plupart des conseils n'affirment rien, on sort tout de suite.
  if (!MISE_EN_AVANT.test(plat) && !AFFIRMATION_FERME.test(plat)) return false;
  // (a) ensuite : l'affirmation doit porter sur UN attribut non testé, pas sur
  // autre chose. « Mettre en avant la marque » survit à un `fonctionne` inconnu.
  return cles.some((cle) => MARQUEURS_ATTRIBUT[aplatir(cle)]?.test(plat) ?? false);
}

/**
 * Retire du tableau les conseils qui affirment un attribut resté « non testé ».
 *
 * Rend `null` quand il ne reste RIEN : un tableau vide ferait un titre de
 * section « Conseils pour mieux vendre » sans contenu à l'écran, alors que
 * `null` fait disparaître la section entière (AnalyseMarche teste la
 * longueur). Un seul conseil restant est un cas normal et s'affiche.
 */
export function retirerConseilsContredits(
  conseils: unknown,
  attributs: unknown,
): { conseils: unknown[] | null; retires: number; motifs: string[] } {
  if (!Array.isArray(conseils) || !conseils.length) {
    return { conseils: Array.isArray(conseils) && conseils.length ? conseils : null, retires: 0, motifs: [] };
  }
  const gardes: unknown[] = [];
  const motifs: string[] = [];
  for (const c of conseils) {
    if (conseilContredit(c, attributs)) motifs.push(String(c).slice(0, 60));
    else gardes.push(c);
  }
  return { conseils: gardes.length ? gardes : null, retires: motifs.length, motifs };
}
