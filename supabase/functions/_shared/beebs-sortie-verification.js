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
 *   lignes   : annonces_plateforme Beebs du compte pour ce numéro — listing_id, statut_plateforme, vu_le, run_id.
 */
export function jugerSortieVerificationBeebs(job, { lectures = [], releves = [], lignes = [], maintenant = Date.now() } = {}) {
  if (!job || job.platform !== "beebs" || !["publish", "republish"].includes(String(job.action)) || job.status !== "published") return null;
  if (job.vu_en_ligne_le) return null;
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (pf.refus_verification_beebs) return null;
  const numero = String(job.platform_listing_id ?? "").trim();
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
  if (!sorties.length) return null;
  const constat = {
    numero, vu_en_verification_le: iso(Math.min(...(vuesVerif.length ? vuesVerif : [derniereVue]))),
    derniere_vue: iso(derniereVue), sortie_constatee_le: sorties[0].le,
  };

  // 2. LE REFUS : 7 jours après la dernière vue, une lecture qui voit TOUT « en ligne », sans lui.
  const toutEnLigne = [
    ...sorties.filter((l) => l.enLigneComplete).map((l) => ({ le: l.le, source: "mes_annonces" })),
    ...ls.filter((l) => ms(l.le) > derniereVue && l.enLigneComplete && !l.verif && memeCompte(l)).map((l) => ({ le: l.le, source: "mes_annonces" })),
    ...(Array.isArray(releves) ? releves : []).filter((r) => releveVoitToutEnLigne(r) && ms(r.started_at) > derniereVue)
      .map((r) => ({ le: iso(ms(r.started_at)), source: "releve" })),
  ].sort((a, b) => ms(a.le) - ms(b.le));
  const tardive = toutEnLigne.find((a) => ms(a.le) - derniereVue >= SORTIE_VERIFICATION_REFUS_MS) ?? null;
  if (!tardive) return { verdict: "sortie", ...constat, lectures_sans_elle: toutEnLigne.length };
  return { verdict: "refus", ...constat, confirmee_le: tardive.le, confirmee_par: tardive.source, absences: toutEnLigne.slice(-6) };
}

const jourFr = (t) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });
const heureFr = (t) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", "h");

/** Le message vrai du job refusé (publication, ou republication dont l'ancienne annonce a été retirée). */
export function messageRefusVerificationBeebs(job, verdict) {
  const depose = ms(job?.published_at ?? job?.created_at);
  const sortie = ms(verdict?.sortie_constatee_le);
  const quand = Number.isFinite(sortie) ? ` le ${jourFr(sortie)} à ${heureFr(sortie)}` : "";
  const depot = Number.isFinite(depose) ? `déposée le ${jourFr(depose)} à ${heureFr(depose)}, ` : "";
  const fin = " La reproposer à l'identique serait refusé de même : change d'abord ce que Beebs a pu refuser (photos, titre, description, rayon).";
  const constat = `elle n'était plus « en cours de vérification »${quand} et, sept jours plus tard, n'était toujours pas en ligne.`;
  if (job?.action === "republish") {
    return `Beebs a refusé la nouvelle annonce à sa vérification (Beebs ne dit pas pourquoi) : ${depot}${constat} `
      + "L'ancienne annonce avait été retirée : ton article n'est plus en ligne sur Beebs. "
      + "Rien n'est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites." + fin;
  }
  return `Beebs a refusé cette annonce à sa vérification (Beebs ne dit pas pourquoi) : ${depot}${constat} `
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
  pf.refus_verification_beebs = {
    le: iso(maintenant), regle: REGLE_SORTIE_VERIFICATION, par, numero: verdict.numero,
    vu_en_verification_le: verdict.vu_en_verification_le, derniere_vue: verdict.derniere_vue,
    sortie_constatee_le: verdict.sortie_constatee_le, confirmee_le: verdict.confirmee_le, confirmee_par: verdict.confirmee_par,
    absences: verdict.absences, ...(refund != null ? { refund } : {}),
  };
  return pf;
}
