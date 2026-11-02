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
// ⚠️ ÉLARGIE LE 01/10 À 09:55 — LA CAUSE EST CONNUE. Le formulaire de dépôt
// Leboncoin interroge son service d'adresses avec `use_precise_address=true`
// sur certains comptes (relevé sur celui de Nico, cat 41) : les COMMUNES y
// sont exclues, seules les adresses avec rue sont proposées. Mesuré :
// « Chantemerle-lès-Grignan 26230 » → [] en mode précis, la commune sinon ;
// « 4 Rue Du Hameau 26230 Chantemerle-lès-Grignan » → la rue dans les DEUX
// modes. Le mode varie d'un compte à l'autre (déploiement Leboncoin) : on ne
// peut pas le lire avant le dépôt. La rue des Réglages de la même commune est
// donc servie TOUJOURS (plus seulement après un refus) : 0 échec d'adresse sur
// 841 publications des 7 comptes concernés, qui tapent déjà cette chaîne.
// Le refus connu ne sert plus qu'à RETENIR une republication sans rue de repli.
export function decisionAdresseRepublicationLbc(job, reglagesLbc, refusConnu, { rueInconnue = false } = {}) {
  if (job?.platform !== "leboncoin" || String(job?.action ?? "") !== "republish") return { action: "tel_quel" };
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const lo = (pf.localisation_origine && typeof pf.localisation_origine === "object") ? pf.localisation_origine : null;
  if (!lo || propre(lo.voie) || !propre(lo.ville)) return { action: "tel_quel" };
  const rue = rueDesReglagesMemeCommune(lo, reglagesLbc);
  // (31/10, lot J 4, plus bas) Leboncoin ne connaît pas cette rue (une publication du compte est passée par la
  // commune) ou elle a déjà été retirée de ce job : la commune, comme la publication — la commune y est prouvée.
  if (lo.voie_des_reglages_retiree || (rueInconnue && rue)) return { action: "tel_quel" };
  if (!rue && !refusConnu) return { action: "tel_quel" };
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
              motif: "rue des Réglages, même commune (Leboncoin exige une rue en mode précis)",
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

// ═══════════════════════════════════════════════════════════════════════════
// (31/10, lot J 4) UNE RUE DES RÉGLAGES QUE LEBONCOIN NE CONNAÎT PAS N'EST JAMAIS SERVIE
// ═══════════════════════════════════════════════════════════════════════════
// doriane-henri (Viviez 12110) : ses 22 publications Leboncoin du 31/10 sont TOUTES passées par le repli commune
// de fillAddress (warning « adresse_barreau3_repli_commune » : « Leboncoin ne connaît pas « 2 rue arsene soulages
// 12110 viviez » — annonce localisée à la commune »). Sa republication de 21:48 recevait cette rue (règle du 01/10
// ci-dessus) ; le contrôle avant retrait de l'extension (verifierAdresseLbcAvantRetrait) la cherche en mode précis
// → aucune proposition → pause « Vérifie tes Réglages », alors que la même adresse venait de passer (21:49).
// Une publication PASSÉE par la commune avec l'adresse des Réglages prouve deux choses : Leboncoin ne connaît pas
// cette rue, et le formulaire de ce compte accepte la commune. Alors la rue n'est pas servie, et une rue déjà servie
// que le job a gardée (voie_des_reglages) est retirée : la republication tape la commune, comme la publication et
// comme l'annonce d'origine. Une rue lue sur l'annonce d'origine (sans voie_des_reglages) n'est jamais touchée.

export const CODE_REPLI_COMMUNE = "adresse_barreau3_repli_commune";
const RE_REPLI_COMMUNE = /Leboncoin ne conna[iî]t pas « ([^»]+) » — annonce localisée à la commune \(« ([^»]+) »/;
// Le message du contrôle avant retrait de l'extension (0.6.82 et suivantes), l'adresse tapée en tête.
const RE_PREVOL_ADRESSE = /Republication Leboncoin mise en pause AVANT tout retrait : Leboncoin ne propose aucune adresse pour « ([^»]+) »/;
export const PUBLICATION_PREUVE_JOURS = 14;

// Une adresse comparable : ses mots (lettres et chiffres), sans accents ni casse, dans l'ordre alphabétique —
// « 12110 viviez » = « Viviez 12110 », « 3bis » = « 3 bis ».
export function adresseComparableLbc(v) {
  const mots = propre(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/(\d)(bis|ter|quater)\b/g, "$1 $2").split(/[^a-z0-9]+/).filter(Boolean);
  return mots.sort().join(" ");
}

/** Les warnings d'une publication PASSÉE prouvent-ils que Leboncoin ne connaît pas l'adresse des Réglages ?
 * @returns {{ adresse: string, commune: string } | null} */
export function repliCommuneDesReglages(warnings, reglagesLbc) {
  const cible = adresseComparableLbc(reglagesLbc?.adresse);
  if (!cible) return null;
  for (const w of Array.isArray(warnings) ? warnings : []) {
    if (!w || typeof w !== "object" || w.code !== CODE_REPLI_COMMUNE) continue;
    const m = String(w.message ?? "").match(RE_REPLI_COMMUNE);
    if (m && adresseComparableLbc(m[1]) === cible) return { adresse: m[1], commune: m[2] };
  }
  return null;
}

/** L'adresse que le contrôle avant retrait n'a pas trouvée chez Leboncoin (message de l'extension), ou null. */
export function adresseRefuseeAvantRetrait(texte) {
  return String(texte ?? "").match(RE_PREVOL_ADRESSE)?.[1] ?? null;
}

/** Leboncoin a-t-il ACCEPTÉ cette adresse dans une publication ? `publications` : [{ id, adresse, warnings }] des
 * publications Leboncoin PASSÉES du compte (14 jours). (02/11, labrunettedu44) Seule l'adresse acceptée compte
 * (adressesAccepteesParPublication) : la ville choisie quand elle a primé, la commune du repli — jamais la rue refusée. */
export function publicationAvecLaMemeAdresse(adresse, publications) {
  const cible = adresseComparableLbc(adresse);
  if (!cible) return null;
  for (const p of Array.isArray(publications) ? publications : []) {
    if (adressesAccepteesParPublication(p).some((a) => adresseComparableLbc(a) === cible)) return p;
  }
  return null;
}

/** Le message quand la même adresse vient de passer en publication : c'est chez nous, jamais « tes Réglages ». */
export function messageAdresseChezNous(reprisesEpuisees = false) {
  return "Republication Leboncoin en pause AVANT tout retrait : Leboncoin a accepté cette même adresse pour tes "
    + "publications, le blocage vient donc de chez nous. Ton annonce est TOUJOURS en ligne, rien n'a été touché. "
    + (reprisesEpuisees ? "Appuie sur « Relancer » pour un nouvel essai." : "Rien à faire : nouvel essai automatique.");
}

/** Décision pour une republication Leboncoin dont la commune est prouvée par une publication (rueInconnue) :
 *   { action: "tel_quel" } | { action: "commune", job } (la rue des Réglages servie avant est retirée). */
export function decisionRueInconnueLbc(job, reglagesLbc, rueInconnue) {
  if (job?.platform !== "leboncoin" || String(job?.action ?? "") !== "republish") return { action: "tel_quel" };
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const lo = (pf.localisation_origine && typeof pf.localisation_origine === "object") ? pf.localisation_origine : null;
  if (!lo || !lo.voie_des_reglages || !propre(lo.voie)) return { action: "tel_quel" };
  const rue = rueDesReglagesMemeCommune(lo, reglagesLbc);
  const retiree = Boolean(lo.voie_des_reglages_retiree);
  // La rue servie est celle des Réglages (même commune) et Leboncoin ne la connaît pas — ou elle a déjà été retirée.
  if (!retiree && !(rueInconnue && rue && communeComparable(rue) === communeComparable(lo.voie))) return { action: "tel_quel" };
  const { voie: _v, voie_des_reglages: _d, ...reste } = lo;
  return {
    action: "commune",
    job: {
      ...job,
      platform_fields: {
        ...pf,
        localisation_origine: {
          ...reste,
          voie_des_reglages_retiree: lo.voie_des_reglages_retiree ?? {
            motif: "rue des Réglages inconnue de Leboncoin : une publication du compte est passée par la commune",
            rue: propre(lo.voie), pose_par: "get-pending-jobs (lbc-voie-des-reglages, 31/10 lot J)",
          },
        },
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// (02/11, labrunettedu44) UNE RUE INTROUVABLE N'EST JAMAIS RETAPÉE À L'IDENTIQUE
// ═══════════════════════════════════════════════════════════════════════════
// Ses 28 republications Leboncoin bouclaient sur le contrôle avant retrait : la rue des Réglages servie (règle du
// 01/10), « 25bis Rue de la Fontaine aux Bretons 44210 Pornic », sans AUCUNE proposition de Leboncoin (mode précis et
// simple vides) — retapée à l'identique à chaque reprise. Et le message disait « Leboncoin a accepté cette même
// adresse, le blocage vient de chez nous » : faux, sa publication de 13:27 avait tapé la VILLE CHOISIE pour l'annonce
// (« Pornic 44210 » → « Pornic (44210) »), pas la rue ; publicationAvecLaMemeAdresse comparait platform_fields.adresse
// (l'adresse des Réglages), pas l'adresse que Leboncoin avait acceptée.
// LA RÈGLE, pour tous :
//   · une rue introuvable est retapée autrement, une forme à la fois, chacune contrôlée AVANT tout retrait :
//     le numéro détaché (« 25bis » → « 25 bis »), puis la rue sans numéro ;
//   · en dernier recours, la commune de l'annonce — seulement quand une publication du compte a fait accepter CETTE
//     commune à Leboncoin (ville choisie, ou repli sur la commune) : c'est la preuve que son formulaire la prend ;
//   · sinon la pause reste, avec le vrai message (la rue, sous toutes ses formes, est inconnue de Leboncoin) ;
//   · « Leboncoin a accepté cette même adresse » ne se dit que d'une adresse que Leboncoin a ACCEPTÉE : celle tapée
//     sans repli, la ville choisie, ou la commune du repli — jamais la rue qu'il a refusée.

const RE_VILLE_CHOISIE = /^adresse: ville choisie pour l'annonce \(« ([^»]+) »\)/;
const texteWarning = (w) => (typeof w === "string" ? w : String(w?.message ?? ""));

/** Les adresses qu'une publication PASSÉE a fait accepter par Leboncoin : la ville choisie si elle a primé, la commune
 * si la rue a été refusée (repli), sinon l'adresse tapée. */
export function adressesAccepteesParPublication(p) {
  let tapee = propre(p?.adresse);
  let communeDuRepli = null;
  for (const w of Array.isArray(p?.warnings) ? p.warnings : []) {
    const m = texteWarning(w);
    const vc = m.match(RE_VILLE_CHOISIE);
    if (vc) tapee = propre(vc[1]);
    if (w && typeof w === "object" && w.code === CODE_REPLI_COMMUNE) {
      const r = m.match(RE_REPLI_COMMUNE);
      if (r) communeDuRepli = propre(r[2]);
    }
  }
  if (communeDuRepli) return [communeDuRepli];
  return tapee ? [tapee] : [];
}

/** Les autres écritures d'une rue, dans l'ordre d'essai : le numéro détaché (« 25bis » → « 25 bis »), puis sans numéro. */
export function variantesRueLbc(voie) {
  const v = propre(voie);
  if (!v) return [];
  const out = [];
  const detachee = propre(v.replace(/^(\d+)\s*,?\s*(bis|ter|quater)\b\s*,?/i, "$1 $2 ").replace(/^(\d+)\s*,\s*/, "$1 "));
  if (detachee !== v) out.push(detachee);
  const sansNumero = propre(v.replace(/^\d+\s*(?:(?:bis|ter|quater)\b|[a-z](?=[\s,]))?\s*,?/i, ""));
  if (sansNumero && sansNumero !== v && /[a-zà-ÿ]{3,}/i.test(sansNumero)) out.push(sansNumero);
  return [...new Set(out)];
}

/**
 * Le contrôle avant retrait n'a trouvé aucune proposition pour `adresseRefusee` : quelle adresse essayer ensuite ?
 * `lo` : platform_fields.localisation_origine du job. `communeAcceptee` : une publication du compte a fait accepter
 * cette commune (adressesAccepteesParPublication).
 * @returns {{ action: "variante", voie: string, lo: object } | { action: "commune", commune: string, lo: object } | { action: "aucune", essais: string[] }}
 */
export function prochaineAdresseLbc(lo, adresseRefusee, { communeAcceptee = false } = {}) {
  const voie = propre(lo?.voie), ville = propre(lo?.ville), cp = propre(lo?.code_postal);
  const precedentes = Array.isArray(lo?.voies_essayees) ? lo.voies_essayees.map(propre).filter(Boolean) : [];
  if (!voie || !ville || !/^\d{5}$/.test(cp)) return { action: "aucune", essais: precedentes };
  // L'adresse refusée est bien celle que cette voie fait taper (« voie code_postal ville », extension).
  if (adresseComparableLbc(`${voie} ${cp} ${ville}`) !== adresseComparableLbc(adresseRefusee)) return { action: "aucune", essais: precedentes };
  const essais = [...precedentes, voie];
  const dejaTapees = new Set(essais.map((e) => e.toLowerCase()));
  const origine = precedentes[0] ?? voie;
  const suivante = [...variantesRueLbc(origine), ...variantesRueLbc(voie)].find((x) => !dejaTapees.has(x.toLowerCase()));
  if (suivante) return { action: "variante", voie: suivante, lo: { ...lo, voie: suivante, voies_essayees: essais } };
  if (!communeAcceptee) return { action: "aucune", essais };
  const { voie: _v, voie_des_reglages: _d, ...reste } = lo;
  return {
    action: "commune",
    commune: `${ville} ${cp}`,
    lo: {
      ...reste,
      voies_essayees: essais,
      voie_des_reglages_retiree: lo.voie_des_reglages_retiree ?? {
        motif: "aucune écriture de la rue n'est connue de Leboncoin ; une publication du compte a fait accepter la commune",
        rue: origine, pose_par: "update-job-status (lbc-voie-des-reglages, 02/11)",
      },
    },
  };
}

/** Le message d'un nouvel essai avec une autre écriture de l'adresse (jamais « tes Réglages », rien à faire). */
export function messageAutreAdresseLbc(adresseRefusee, suivante, parCommune = false) {
  return `Republication Leboncoin en pause AVANT tout retrait : Leboncoin ne trouve pas « ${propre(adresseRefusee)} ». `
    + (parCommune
      ? `Nouvel essai automatique avec ta commune, « ${propre(suivante)} », que Leboncoin a acceptée pour tes publications. `
      : `Nouvel essai automatique en l'écrivant « ${propre(suivante)} ». `)
    + "Ton annonce est TOUJOURS en ligne, rien n'a été touché. Rien à faire.";
}

/** Le message quand aucune écriture de la rue n'est connue et que rien ne prouve la commune : la vraie cause. */
export function messageRueIntrouvableLbc(adresseRefusee, essais = []) {
  const autres = (Array.isArray(essais) ? essais : []).map(propre).filter(Boolean);
  return `Republication Leboncoin mise en pause AVANT tout retrait : Leboncoin ne propose aucune adresse pour « ${propre(adresseRefusee)} »`
    + (autres.length > 1 ? `, ni pour ${autres.slice(0, -1).map((e) => `« ${e} »`).join(", ")}` : "")
    + ". Ton annonce est TOUJOURS en ligne, rien n'a été touché. Vérifie l'« Adresse de remise Leboncoin » dans tes Réglages (numéro, rue, code postal, ville), puis relance la republication.";
}
