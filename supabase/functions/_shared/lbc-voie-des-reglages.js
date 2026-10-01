// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — UNE COMMUNE DÉJÀ REFUSÉE SE RETAPE AVEC LA RUE DES RÉGLAGES
// (2026-10-01)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication Leboncoin retape la localisation de l'annonce d'origine.
// Sans rue (cas de presque toutes les annonces relevées), l'extension tape la
// commune seule, « Ville 12345 » — 152 republications réussies ainsi en 20
// jours. Deux communes ont été refusées par le formulaire de dépôt, APRÈS le
// retrait de l'annonce :
//   · josephinecerni, « Chantemerle-lès-Grignan 26230 » (BD Lucky Luke,
//     30/09 19:48) : « sans suggestion », annonce restée hors ligne ;
//   · nicolas.menar, « Roost-Warendin 59286 » (deux doudous, 30/09 23:24) :
//     le formulaire n'a montré que « Rue de Roost Warendin, Douai (59500) ».
// Le service d'adresses de Leboncoin rend pourtant bien ces deux communes
// (relu le 01/10). La cause exacte côté formulaire n'est pas établie. Ces deux
// comptes publient en revanche sans faute avec l'adresse complète de leurs
// Réglages (131/132 pour Joséphine, avec « 4 Rue Du Hameau 26230
// Chantemerle-lès-Grignan »), et la republication de Joséphine du 29/09 est
// passée quand l'annonce portait sa rue.
//
// LA RÈGLE, ÉTROITE EXPRÈS (aucune republication qui passe aujourd'hui ne
// change) :
//   · seulement une republication Leboncoin dont l'annonce d'origine n'a pas
//     de rue ;
//   · seulement si Leboncoin a DÉJÀ refusé cette commune pour ce compte (ce
//     job, ou un autre job Leboncoin du compte) ;
//   · alors, si les Réglages ont une rue dans la MÊME commune (même code
//     postal, même ville aux accents, tirets et majuscules près), la rue des
//     Réglages est servie comme rue de l'annonce : l'annonce reste dans sa
//     commune, avec l'adresse que la personne a déclarée ;
//   · sinon, une republication qui n'a pas encore retiré l'annonce n'est pas
//     servie : on ne retire jamais une annonce pour une adresse qu'on sait
//     refusée.
// ES module SANS import (Deno + Node).

const propre = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// Forme comparable d'un nom de commune : accents, tirets, apostrophes,
// espaces et casse gommés. « Roost-warendin » = « Roost-Warendin » ;
// « Chantemerle-lès-Grignan » = « Chantemerle les Grignan ».
export function communeComparable(v) {
  return propre(v).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[-'’\s]+/g, " ").trim();
}

// Les deux messages de refus d'adresse de l'extension (leboncoin.js,
// fillAddress), tous builds.
const RE_REFUS = /sans suggestion dans l'autocomplete Leboncoin|aucune suggestion Leboncoin ne la couvre/i;

// Le texte porte-t-il un refus d'adresse POUR CETTE commune ? Seule compte
// l'adresse TAPÉE, que les deux messages citent en tête (« Adresse "…" ») :
// les propositions affichées citent d'autres communes (« Douai (59500) »
// dans le refus de Roost-Warendin).
export function texteRefuseCommune(texte, ville) {
  const t = String(texte ?? "");
  if (!RE_REFUS.test(t)) return false;
  const tapee = t.match(/Adresse "([^"]+)"/)?.[1] ?? "";
  const c = communeComparable(ville);
  return Boolean(c && tapee) && communeComparable(tapee).includes(c);
}

// Tous les textes d'erreur qu'un job garde (erreur courante, archivées,
// erreur technique).
export function textesErreurJob(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const textes = [job?.error];
  const ea = Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees : [];
  for (const e of ea) textes.push(e?.erreur);
  if (pf.error_technique && typeof pf.error_technique === "object") textes.push(pf.error_technique.brut);
  return textes.filter((t) => typeof t === "string" && t);
}

// La rue des Réglages, si elle est dans la même commune que l'annonce.
export function rueDesReglagesMemeCommune(locOrigine, reglagesLbc) {
  const rue = propre(reglagesLbc?.rue);
  const cpR = propre(reglagesLbc?.code_postal);
  const villeR = propre(reglagesLbc?.ville);
  const cpO = propre(locOrigine?.code_postal);
  const villeO = propre(locOrigine?.ville);
  if (!rue || !/^\d{5}$/.test(cpO) || cpR !== cpO || !villeO) return null;
  if (communeComparable(villeR) !== communeComparable(villeO)) return null;
  return rue;
}

// Décision pour UN job servi. `refusConnu` : un refus de cette commune existe
// déjà pour ce compte (ce job ou un autre). Rend :
//   { action: "tel_quel" } | { action: "rue", job } | { action: "retenir" }
export function decisionAdresseRepublicationLbc(job, reglagesLbc, refusConnu) {
  if (job?.platform !== "leboncoin" || String(job?.action ?? "") !== "republish") return { action: "tel_quel" };
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const lo = (pf.localisation_origine && typeof pf.localisation_origine === "object") ? pf.localisation_origine : null;
  if (!lo || propre(lo.voie) || !propre(lo.ville)) return { action: "tel_quel" };
  if (!refusConnu) return { action: "tel_quel" };
  const rue = rueDesReglagesMemeCommune(lo, reglagesLbc);
  if (rue) {
    return {
      action: "rue",
      job: {
        ...job,
        platform_fields: {
          ...pf,
          localisation_origine: {
            ...lo,
            voie: rue,
            voie_des_reglages: {
              motif: "commune seule déjà refusée par Leboncoin — rue des Réglages, même commune",
              pose_par: "get-pending-jobs (lbc-voie-des-reglages)",
            },
          },
        },
      },
    };
  }
  // Pas de rue de repli : une republication qui n'a pas encore retiré
  // l'annonce attend ; celle qui l'a déjà retirée continue (la retenir ne
  // remettrait rien en ligne).
  const dejaRetiree = Boolean(pf.deleted_at || pf.deleted_at_serveur || pf.deleted_at_client);
  return dejaRetiree ? { action: "tel_quel" } : { action: "retenir" };
}
