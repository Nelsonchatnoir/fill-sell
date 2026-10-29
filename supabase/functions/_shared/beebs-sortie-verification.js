// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT BEEBS SORTI DE LA VÉRIFICATION SANS ÊTRE MIS EN LIGNE (25/10, XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// XEWER (de63ca45), depuis le 01/10 : 74 dépôts Beebs, 8 vus en ligne. Les dépôts
// sont réels — le numéro est lu en tête de « En cours de vérification » juste
// après le clic (preuve_identifiant_beebs) — puis l'annonce SORT de cet onglet en
// 0,2 à 22 min sans paraître « en ligne » (34229929 déposé le 25/10 à 05:58,
// absent des deux onglets à 06:01). L'extension conclut « publié » dès qu'elle lit
// le numéro en vérification ; aucun onglet des refus n'existe ; la fonction SQL
// trancher_publications_sans_lien saute Beebs sans lien (11 jobs de XEWER
// « publiés » sans lien, 13 chez Sébastien) et n'en juge un avec lien que s'il
// n'a JAMAIS été vu par un relevé. 6a38d0b6 (republication) : ancienne retirée,
// nouvelle sortie de la vérification le 09/10, job resté « publié ».
//
// ⚠️ MESURÉ LE 25/10 (31 jours, 1 452 dépôts lus) : SORTIR de « en vérification »
// sans paraître en ligne n'est PAS un refus à coup sûr. 18 dépôts sortis ainsi
// sont devenus EN LIGNE ensuite, après 48 à 126 h d'invisibilité (DeadRoz : 16
// annonces du 14/10 en ligne les 17 et 19/10 ; bd380fbf, compte de 24 annonces :
// 34113827, 12 €, absente de deux relevés complets à 2 h et 26 h, en ligne le
// 08/10 ; 34109673, 999 €, en ligne 48 h après). Une règle « 30 min » en aurait
// déclaré 17 refusées à tort — annonce en ligne, job « refusé », article non
// suivi : double vente possible. D'où DEUX temps :
//   1. SORTIE CONSTATÉE (le jour même) : vue en vérification, puis une lecture
//      « Mes annonces » (même compte Beebs, « en vérification » lue en entier) ne
//      la porte plus, et jamais vue en ligne → le job dit la vérité sans
//      conclure : marqueur pas_encore_visible (l'app : « Beebs vérifie ton
//      annonce avant de la mettre en ligne », logo désaturé ; effacé dès qu'un
//      relevé ou la veille la voit en ligne) ;
//   2. REFUS PROUVÉ (7 jours après la dernière vue — au-delà du plus long délai
//      mesuré, 126 h) : toujours jamais vue en ligne, et une lecture qui voit TOUT
//      « en ligne » (onglet « en ligne » lu en entier, ou relevé dont la PAGE a
//      montré toutes les annonces — l'index public, en retard sur les annonces
//      neuves, ne suffit pas) 7 jours après sans elle → refusée par Beebs : le job
//      le dit (motif inconnu, rien en ligne, rien vendu), publication rendue,
//      jamais une relance à l'identique.
// Toujours : moins de 500 € (Beebs examine les annonces chères dans un état
// invisible, jusqu'à deux jours et plus — jamais jugées ici), job « publié »,
// dépôt de moins de 30 jours, pas déjà tranché. Vue en ligne par une lecture, un
// relevé (ligne écrite par un relevé — run_id ; celle qu'une republication pose à
// son propre dépôt n'est pas une vue) ou la veille : jamais rien.
// Pur, sans import réseau (Deno + Node).

import { releveComplet } from "./retrait-introuvable.js";
// (29/10, lot B 4.5/4.9) Les constats « page 404 » de l'extension : la seconde preuve d'un refus (même règle que la
// fonction SQL trancher_publications_sans_lien, migration 20261029200000 — un seul juge Beebs).
import { constats404Beebs, BEEBS_404_ECART_MIN_MS } from "./beebs-preuve-retrait.js";
import { empreinteContenuDuJob } from "../../../src/utils/empreinteContenu.js";

export const PRIX_EXAMEN_INVISIBLE_BEEBS = 500;
export const SORTIE_VERIFICATION_REFUS_MS = 7 * 86_400_000;
export const SORTIE_VERIFICATION_FENETRE_MS = 30 * 86_400_000;
export const REGLE_SORTIE_VERIFICATION = "sortie_de_verification_sans_mise_en_ligne";

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const iso = (t) => new Date(t).toISOString();

/**
 * Les lectures « Mes annonces » portées par les dépôts Beebs d'un compte (preuve_identifiant_beebs, avant et après).
 * @param {Array<{ id?: string, platform_fields?: any, preuve?: any }>} jobs  (`preuve` : la preuve seule, si lue à part)
 * @returns {Array<{ le: string, job_id: string|null, moment: string, verif: Set<string>|null, enLigne: Set<string>|null, enLigneComplete: boolean }>}
 */
export function lecturesDesDepotsBeebs(jobs) {
  const out = [];
  for (const j of Array.isArray(jobs) ? jobs : []) {
    const p = (j?.preuve && typeof j.preuve === "object") ? j.preuve : j?.platform_fields?.preuve_identifiant_beebs;
    if (!p || typeof p !== "object") continue;
    for (const moment of ["avant", "apres"]) {
      const l = p[moment];
      if (!l || typeof l !== "object" || !Number.isFinite(ms(l.lu_le)) || !Array.isArray(l.pages)) continue;
      const pv = l.pages.find((x) => x?.page === "en_verification");
      const pl = l.pages.find((x) => x?.page === "en_ligne");
      const idsL = pl?.ok === true && Array.isArray(pl.ids) ? pl.ids.map(String) : null;
      out.push({
        le: iso(ms(l.lu_le)), job_id: j?.id != null ? String(j.id) : null, moment,
        verif: pv?.ok === true && Array.isArray(pv.ids) ? new Set(pv.ids.map(String)) : null,
        enLigne: idsL ? new Set(idsL) : null,
        enLigneComplete: !!idsL && (pl.annoncees == null || idsL.length >= Number(pl.annoncees)),
      });
    }
  }
  return out.sort((a, b) => ms(a.le) - ms(b.le));
}

/**
 * Un relevé Beebs dont la PAGE « en ligne » a montré toutes les annonces du compte (pas seulement l'index public,
 * en retard sur les annonces neuves) : « page : N annonce(s) affichée(s) … index public Beebs : T annonce(s) en
 * ligne » avec N ≥ T, ou « [flux] en ligne X/Y » avec X ≥ Y. Complet par ailleurs (releveComplet).
 */
export function releveVoitToutEnLigne(r) {
  if (!releveComplet(r) || !Number.isFinite(ms(r?.finished_at))) return false;
  const e = String(r?.erreur ?? "");
  const flux = e.match(/\[flux\] en ligne (\d+)\/(\d+)/);
  if (flux) return Number(flux[1]) >= Number(flux[2]) && Number(flux[2]) > 0;
  const page = e.match(/page : (\d+) annonce\(s\) affichée\(s\)/);
  const index = e.match(/index public Beebs : (\d+) annonce\(s\) en ligne/);
  return !!page && !!index && Number(page[1]) >= Number(index[1]);
}

/**
 * Le verdict pour UN dépôt Beebs « publié » : null, { verdict: 'sortie', … } (sortie constatée, rien de conclu) ou
 * { verdict: 'refus', … } (refus prouvé).
 * @param {any} job  cross_post_jobs (publish|republish, status published)
 * @param {{ lectures?: any[], releves?: any[], lignes?: any[], maintenant?: number }} [ctx]
 *   lectures : lecturesDesDepotsBeebs(dépôts Beebs du compte) ;
 *   releves  : vinted_sync_runs Beebs (kind annonces) du compte — status, started_at, finished_at, items_vus, total_entries, erreur ;
 *   lignes   : annonces_plateforme Beebs du compte pour ce numéro — listing_id, statut_plateforme, vu_le, run_id ;
 *   constats404 : (29/10, lot B 4.5) les constats « page 404 » (beebs_404_constats) des RETRAITS de ce numéro, même
 *              compte — ceux du dépôt lui-même sont lus sur ses champs.
 */
export function jugerSortieVerificationBeebs(job, { lectures = [], releves = [], lignes = [], constats404 = [], maintenant = Date.now() } = {}) {
  if (!job || job.platform !== "beebs" || !["publish", "republish"].includes(String(job.action)) || job.status !== "published") return null;
  if (job.vu_en_ligne_le) return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const numero = String(job.platform_listing_id ?? "").trim();
  // (29/10, lot A point 8 — XEWER 99571727) Un refus vaut pour SON numéro : après une relance, le nouveau dépôt
  // (autre numéro) se juge à neuf ; un marqueur périmé ne le protège plus à vie.
  if (pf.refus_verification_beebs && String(pf.refus_verification_beebs.numero ?? "").trim() === numero) return null;
  if (!/^\d{6,}$/.test(numero)) return null;
  if (!(Number(job.price) > 0) || Number(job.price) >= PRIX_EXAMEN_INVISIBLE_BEEBS) return null;
  const depose = ms(job.published_at ?? job.created_at);
  if (!Number.isFinite(depose) || maintenant - depose > SORTIE_VERIFICATION_FENETRE_MS) return null;

  // Ce qu'un RELEVÉ a vu de ce numéro (run_id) : en ligne ou vendue = jamais rien.
  const vuesReleve = (Array.isArray(lignes) ? lignes : []).filter((l) => String(l?.listing_id ?? "").trim() === numero && l?.run_id != null);
  if (vuesReleve.some((l) => ["en_ligne", "vendue"].includes(String(l.statut_plateforme ?? "")))) return null;

  const ls = (Array.isArray(lectures) ? lectures : []).filter((l) => Number.isFinite(ms(l?.le)));
  if (ls.some((l) => l.enLigne?.has(numero))) return null;
  const vuesVerif = ls.filter((l) => l.verif?.has(numero)).map((l) => ms(l.le));
  const vueEnVerification = vuesVerif.length > 0 || vuesReleve.some((l) => l.statut_plateforme === "en_verification");
  if (!vueEnVerification) return null;
  const derniereVue = Math.max(...vuesVerif, ...vuesReleve.map((l) => ms(l.vu_le)).filter(Number.isFinite));
  if (!Number.isFinite(derniereVue)) return null;

  // Même compte Beebs que le dépôt : une lecture partage au moins une autre annonce avec la lecture d'après dépôt
  // (si celle-ci en portait d'autres). Jamais une absence lue sur un autre compte connecté.
  const propre = ls.find((l) => l.job_id === String(job.id ?? "") && l.moment === "apres") ?? null;
  const autresDuDepot = propre ? new Set([...(propre.verif ?? []), ...(propre.enLigne ?? [])].filter((x) => x !== numero)) : new Set();
  const memeCompte = (l) => !autresDuDepot.size || [...(l.verif ?? []), ...(l.enLigne ?? [])].some((x) => autresDuDepot.has(x));

  // 1. LA SORTIE : « en vérification » lue en entier après la dernière vue, sans lui (ni « en ligne » : vu plus haut).
  const sorties = ls.filter((l) => ms(l.le) > derniereVue && l.verif && !l.verif.has(numero) && memeCompte(l));
  // (29/10, lot B 4.5/4.9) La seconde preuve, la même que la fonction SQL (un seul juge Beebs) : deux constats « page
  // 404 » de l'extension sur le numéro EXACT (fiche absente, « en vérification » lue en entier), après la dernière vue.
  // Sans lecture « Mes annonces » qui l'ait vue sortir, l'heure de sortie reste inconnue (null) : jamais devinée.
  const p404 = preuve404RefusBeebs([...constats404Beebs(pf), ...constats404Beebs({ beebs_404_constats: constats404 })], derniereVue);
  if (!sorties.length && !p404) return null;
  const constat = {
    numero, vu_en_verification_le: iso(Math.min(...(vuesVerif.length ? vuesVerif : [derniereVue]))),
    derniere_vue: iso(derniereVue), sortie_constatee_le: sorties.length ? sorties[0].le : null,
  };

  // 2. LE REFUS : 7 jours après la dernière vue, une lecture qui voit TOUT « en ligne », sans lui.
  const toutEnLigne = [
    ...sorties.filter((l) => l.enLigneComplete).map((l) => ({ le: l.le, source: "mes_annonces" })),
    ...ls.filter((l) => ms(l.le) > derniereVue && l.enLigneComplete && !l.verif && memeCompte(l)).map((l) => ({ le: l.le, source: "mes_annonces" })),
    ...(Array.isArray(releves) ? releves : []).filter((r) => releveVoitToutEnLigne(r) && ms(r.started_at) > derniereVue)
      .map((r) => ({ le: iso(ms(r.started_at)), source: "releve" })),
    ...(p404 ? [{ le: p404.le, source: "constats_404", premier: p404.premier }] : []),
  ].sort((a, b) => ms(a.le) - ms(b.le));
  const tardive = toutEnLigne.find((a) => ms(a.le) - derniereVue >= SORTIE_VERIFICATION_REFUS_MS) ?? null;
  if (!tardive) return { verdict: "sortie", ...constat, lectures_sans_elle: toutEnLigne.length };
  return { verdict: "refus", ...constat, confirmee_le: tardive.le, confirmee_par: tardive.source,
    ...(tardive.premier ? { confirmee_depuis: tardive.premier } : {}), absences: toutEnLigne.slice(-6) };
}

/**
 * (29/10, lot B 4.5/4.9) Deux constats « page 404 » valides (constats404Beebs : 404, sans fiche, « en vérification »
 * lue en entier) postérieurs à la dernière vue en vérification, à 6 h d'écart au moins, le plus récent 7 jours au moins
 * après elle (au-delà des 126 h d'invisibilité mesurées) → { le, premier, n } ; sinon null. Miroir JS de la preuve
 * « constats_404 » de beebs_preuve_jamais_en_ligne (SQL).
 */
export function preuve404RefusBeebs(constats, derniereVue) {
  const t = (Array.isArray(constats) ? constats : []).map((c) => ms(c?.le)).filter((x) => Number.isFinite(x) && x > derniereVue).sort((a, b) => a - b);
  if (t.length < 2) return null;
  const dernier = t[t.length - 1];
  if (dernier - t[0] < BEEBS_404_ECART_MIN_MS || dernier - derniereVue < SORTIE_VERIFICATION_REFUS_MS) return null;
  return { le: iso(dernier), premier: iso(t[0]), n: t.length };
}

const jourFr = (t) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
const heureFr = (t) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", "h");

// « 18h09 le 19/10 » (heure de Paris) : un FAIT daté, jamais une durée (règle du 16/10, selftest aucune-estimation).
const aLe = (t) => `${heureFr(t)} le ${jourFr(t)}`;

/**
 * (29/10, lot B 4.5) Ce qui prouve que l'annonce n'a jamais été en ligne, en une phrase datée (heure de Paris).
 * Miroir exact : beebs_message_jamais_en_ligne (SQL). Aucune heure promise.
 */
export function phrasePreuveRefusBeebs(verdict) {
  const le = ms(verdict?.confirmee_le);
  if (!Number.isFinite(le)) return "";
  const fin = " : Beebs n'a jamais mis cette annonce en ligne.";
  if (verdict.confirmee_par === "releve") return `Le relevé fait à ${aLe(le)}, qui a lu toutes tes annonces en ligne, ne la montre pas${fin}`;
  if (verdict.confirmee_par === "mes_annonces") return `Tes annonces en ligne, lues en entier à ${aLe(le)}, ne la montrent pas${fin}`;
  if (verdict.confirmee_par === "constats_404") {
    const premier = ms(verdict.confirmee_depuis);
    return `Sa page est introuvable (404) à ${aLe(Number.isFinite(premier) ? premier : le)} et encore à ${aLe(le)}, et elle n'est plus dans tes annonces en vérification${fin}`;
  }
  return "";
}

/**
 * Le message vrai du job refusé (publication, ou republication dont l'ancienne annonce a été retirée).
 * (29/10, lot B 4.5, Nico) « Beebs a reçu ton annonce (n° …, en vérification à HHhMM le JJ/MM), puis l'a retirée de sa
 * vérification sans la mettre en ligne (elle n'y était plus à HHhMM le JJ/MM) ; Beebs ne dit pas pourquoi. » — ce qui
 * est constaté, avec ses DEUX heures (jamais une durée : règle du 16/10, selftest aucune-estimation) ; plus « refusée à
 * sa vérification » (une déduction) ni « serait refusé de même » (Beebs ne dit rien). Même texte que la fonction SQL
 * (beebs_message_jamais_en_ligne) : un seul juge, un seul message.
 */
export function messageRefusVerificationBeebs(job, verdict) {
  const numero = String(verdict?.numero ?? job?.platform_listing_id ?? "").trim();
  const vu = ms(verdict?.vu_en_verification_le);
  const sortie = ms(verdict?.sortie_constatee_le);
  const sortieDite = Number.isFinite(sortie) && (!Number.isFinite(vu) || sortie >= vu);
  const tete = `Beebs a reçu ${job?.action === "republish" ? "ta nouvelle annonce" : "ton annonce"} (n° ${numero}`
    + `${Number.isFinite(vu) ? `, en vérification à ${aLe(vu)}` : ""}), puis l'a retirée de sa vérification sans la mettre en ligne`
    + `${sortieDite ? ` (elle n'y était plus à ${aLe(sortie)})` : ""} ; Beebs ne dit pas pourquoi.`;
  const preuve = phrasePreuveRefusBeebs(verdict);
  const fin = " Pour la reproposer, change d'abord ce que Beebs a pu refuser (photos, titre, description, rayon).";
  if (job?.action === "republish") {
    return `${tete}${preuve ? ` ${preuve}` : ""} L'ancienne annonce avait été retirée : ton article n'est plus en ligne sur Beebs. `
      + "Rien n'est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites." + fin;
  }
  return `${tete}${preuve ? ` ${preuve}` : ""} `
    + "Rien n'est en ligne, rien n'est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites." + fin;
}

/** Le platform_fields d'une SORTIE constatée : le marqueur « pas encore visible » (rien de conclu), daté. */
export function pfApresSortieVerification(job, verdict, { maintenant = Date.now() } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  const avant = (pf.pas_encore_visible && typeof pf.pas_encore_visible === "object") ? pf.pas_encore_visible : null;
  pf.pas_encore_visible = {
    ...(avant ?? {}), depuis: avant?.depuis ?? verdict.sortie_constatee_le, derniere: iso(maintenant),
    regle: "sortie_de_verification_2510", sortie_constatee_le: verdict.sortie_constatee_le, numero: verdict.numero,
  };
  return pf;
}

/** Le platform_fields du job refusé : la preuve, les signaux de vente retirés, rien d'autre. */
export function pfApresRefusVerification(job, verdict, { par = "handler-watch", refund = null, maintenant = Date.now() } = {}) {
  const pf = { ...((job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {}) };
  for (const k of ["sale_signal", "unavailable_since", "unavailable_pending_since", "pas_encore_visible", "next_action_after", "processing_since"]) delete pf[k];
  // (29/10, lot B 4.6 — XEWER) L'EMPREINTE du contenu refusé (titre, description, photos, rayon beebsCategoryPath —
  // src/utils/empreinteContenu.js, la même fonction que l'app et get-pending-jobs) : relancer un refus prouvé, c'est
  // changer le contenu d'abord. Job lu sans son texte ou ses photos : pas d'empreinte (rien ne serait comparé à faux).
  const empreinte = empreinteContenuDuJob(job);
  pf.refus_verification_beebs = {
    le: iso(maintenant), regle: REGLE_SORTIE_VERIFICATION, par, numero: verdict.numero,
    vu_en_verification_le: verdict.vu_en_verification_le, derniere_vue: verdict.derniere_vue,
    sortie_constatee_le: verdict.sortie_constatee_le, confirmee_le: verdict.confirmee_le, confirmee_par: verdict.confirmee_par,
    absences: verdict.absences, ...(refund != null ? { refund } : {}), ...(empreinte ? { empreinte_contenu: empreinte } : {}),
  };
  return pf;
}
