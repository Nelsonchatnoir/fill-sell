// ═══════════════════════════════════════════════════════════════════════════
// eBay — CE QUE LE MOTEUR REMPLIT SEUL, ET QUAND (10/10/2026, cas Manon)
// ═══════════════════════════════════════════════════════════════════════════
// Publication en lot de quatre vêtements importés de Vinted vers eBay : trois
// questions « Style » et une « Type » sur des champs que l'IA pouvait remplir.
// Deux décisions du moteur (ListingPreviewScreen, stepper ET lot) vivent ici,
// pures, pour être éprouvées sans écran (scripts/ebay-aspects-auto-selftest.mjs) :
//
//   1. QUOI DEMANDER À L'IA, MAINTENANT (aspectsADemanderIa)
//      · jamais sur la liste d'une AUTRE catégorie : tant que la liste des
//        exigés relue n'est pas celle de la catégorie courante, rien ne part
//        et rien n'est déclaré « terminé » ;
//      · chaque aspect manquant est demandé UNE fois PAR catégorie — plus
//        « une seule tentative par catégorie » : un exigé devenu manquant après
//        le premier appel est demandé à son tour ;
//      · « terminé » = plus rien à demander et aucun appel en vol : c'est
//        alors seulement qu'un champ vide devient une question.
//
//   2. CE QUI DOIT PARTIR QUAND LA CATÉGORIE CHANGE (valeursAutoAReprendre)
//      Une valeur que le MOTEUR a posée pour une autre catégorie et qui n'est
//      pas dans la liste de celle-ci n'y a jamais été choisie : elle est
//      retirée et l'aspect repart comme neuf (option nommée par le titre, IA,
//      puis question). Une valeur valable ici reste. Une valeur posée ou
//      retouchée par la personne n'est jamais touchée.
//
// ES module sans dépendance : importé par ListingPreviewScreen (Vite) et par
// le selftest (Node).

/**
 * @param {object} p
 * @param {string|null} p.categorie       la catégorie eBay courante de l'encart
 * @param {boolean} p.listeAJour          la liste des exigés relue est-elle celle de `categorie` ?
 * @param {Array<{name:string,state:string}>|null} p.statut  ebayRequiredStatus
 * @param {Set<string>} p.dejaDemandes    `${categorie}|${aspect}` déjà envoyés à l'IA
 * @param {(a:object)=>unknown} [p.aDefaut]  l'aspect a-t-il un défaut déterministe (jamais demandé à l'IA)
 * @param {number} [p.enVol]              appels IA en cours
 * @returns {{ aDemander: string[], fini: boolean, attendre: boolean }}
 *   attendre : rien à décider tant que la liste n'est pas la bonne ;
 *   fini     : plus rien à demander, aucun appel en vol.
 */
export function aspectsADemanderIa({ categorie, listeAJour, statut, dejaDemandes, aDefaut = () => false, enVol = 0 }) {
  if (!categorie || !Array.isArray(statut) || !listeAJour) return { aDemander: [], fini: false, attendre: true };
  const manquants = statut.filter((a) => a?.state === "missing" && !aDefaut(a)).map((a) => a.name);
  const aDemander = manquants.filter((n) => !dejaDemandes.has(`${categorie}|${n}`));
  return { aDemander, fini: !aDemander.length && enVol === 0, attendre: false };
}

/**
 * @param {object} p
 * @param {string} p.categorie            la catégorie courante (liste à jour)
 * @param {Record<string,{categorie:string,valeur:string}>} p.autoPoses  ce que le moteur a posé, et pour quelle catégorie
 * @param {Record<string,unknown>} p.aspects   pf.ebayAspects actuel de la copie
 * @param {Array<{name:string,mode?:string,allowedValues?:string[]}>} p.statut  exigés de la catégorie courante
 * @param {(liste:string[], mode?:string)=>boolean} p.listeFermee  la liste fait-elle foi pour l'écran (isEbayClosedList)
 * @param {(s:unknown)=>string} p.norm    forme comparable (normAspectVal)
 * @returns {{ retirer: string[], reetiqueter: string[], oublier: string[] }}
 *   retirer     : valeurs posées pour une autre catégorie, hors de la liste d'ici ;
 *   reetiqueter : valeurs posées ailleurs, valables ici (gardées) ;
 *   oublier     : valeurs retouchées par la personne depuis (plus à nous).
 */
export function valeursAutoAReprendre({ categorie, autoPoses, aspects, statut, listeFermee, norm }) {
  const retirer = []; const reetiqueter = []; const oublier = [];
  for (const [nom, pose] of Object.entries(autoPoses ?? {})) {
    if (!pose || pose.categorie === categorie) continue;
    const actuelle = String(aspects?.[nom] ?? "").trim();
    if (actuelle !== pose.valeur) { oublier.push(nom); continue; }
    const a = (statut ?? []).find((x) => x?.name === nom);
    if (!a) continue; // pas exigé ici : on n'y touche pas
    const liste = Array.isArray(a.allowedValues) ? a.allowedValues : [];
    const valable = !listeFermee(liste, a.mode) || liste.some((v) => norm(v) === norm(actuelle));
    (valable ? reetiqueter : retirer).push(nom);
  }
  return { retirer, reetiqueter, oublier };
}
