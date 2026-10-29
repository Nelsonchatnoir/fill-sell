// ═══════════════════════════════════════════════════════════════════════════
// L'ANNONCE D'ORIGINE D'ABORD (22/10 soir, point 8 — Louis, « Insert / Rangement Zombicide »)
// ═══════════════════════════════════════════════════════════════════════════
// Une fiche importée (Vinted, Leboncoin, Beebs, Depop) dont l'annonce d'origine n'est pas encore LUE ne s'ouvre
// ni au stepper ni au lot : le moteur y verrait des cases vides et les remplirait (texte rédigé, « Très bon état »
// par défaut, une seule photo) — c'est ce qui est parti sur Leboncoin pour Louis le 20/10. Ici :
//   · `attenteLectureOrigine` relit en base ce qu'il faut et applique LA règle (_shared/contenu-fiche.js,
//     lectureOrigineEnAttente — la même que get-pending-jobs, qui retient aussi au départ) ;
//   · `demanderLectureOrigine` demande la lecture (relevé de veille, ou détail Vinted par l'extension) ;
//   · `useLecturesOrigine` relit, borné, ce qui attend une lecture (pour le dire dans le Stock) et, sur un
//     ordinateur dont l'extension sait lire un détail Vinted, fait ces lectures UNE à la fois, au rythme des
//     dépôts (8 à 20 s) — le même geste que « Publier » (texteDuVendeur.js), jamais une rafale.
// Pendant l'attente, la personne lit « En cours de lecture de ton annonce d'origine » — jamais une erreur.
// (26/10 nuit, point 9 — patrick giry) … SEULEMENT s'il existe un lecteur maintenant (attenteLectureRegles.js,
// lecteurDisponible) : `lireLecteurVinted` le lit au clic ; sans lecteur, la personne choisit — sa description écrite
// (`ecrireDescriptionSansLecteur`) ou rédigée par FillSell (`noterChoixSansLecteur`), portées par la fiche
// (_shared/contenu-fiche.js, choixSansLecture), ou l'attente de son ordinateur — et chaque choix est tracé
// (`tracerChoixSansLecteur`, usage_logs « lecture_origine_sans_lecteur »).
import { useEffect, useRef, useState } from "react";
import { demarrerRelecture } from "../utils/relectureBornee";
import { lectureOrigineEnAttente, plateformeOrigine, messageLectureOrigine, texteSuffisant } from "../../supabase/functions/_shared/contenu-fiche.js";
import { completerTexteDuVendeur, RYTHME_LECTURE_VINTED_MS } from "./texteDuVendeur";
import {
  lecteurDisponible, versionAuMoins, LECTEUR_VERSION_MIN, patchDescriptionEcrite, patchChoixRedigee, travailDuPoste,
} from "./attenteLectureRegles.js";

export { messageLectureOrigine };

/**
 * Une ligne annonces_plateforme lue par l'app → la forme que lit la règle (la même que fiches_contenu_vendeur côté
 * serveur) : `detail_le` (eBay : le détail lu par l'API) et `photos_origine` (combien de photos l'annonce porte).
 */
export function versLigneOrigine(a) {
  const n = (x) => (Array.isArray(x) ? x.length : null);
  const nCap = n(a?.photos_capture);
  const nIdx = a?.platform === "ebay" ? n(a?.photos_index) : null;
  return {
    platform: a?.platform ?? null,
    capture_le: a?.capture_le ?? null,
    disparu_le: a?.disparu_le ?? null,
    detail_le: a?.platform === "ebay" ? (a?.donnees_index_le ?? null) : null,
    photos_origine: nCap == null && nIdx == null ? null : Math.max(nCap ?? 0, nIdx ?? 0),
  };
}

/** La fiche attend-elle la lecture de son annonce d'origine ? Relu en base. null = rien à attendre (ou illisible). */
export async function attenteLectureOrigine(supabase, userId, inventaireId) {
  if (!supabase || !userId || inventaireId == null) return null;
  const { data: f, error } = await supabase.from("inventaire")
    .select("id, origine, description, photos, attributs, disparu_le")
    .eq("id", inventaireId).eq("user_id", userId).maybeSingle();
  if (error || !f || !plateformeOrigine(f)) return null;
  const [annonces, demande] = await Promise.all([
    // (23/10) eBay : le DÉTAIL lu par l'API (donnees_index_le) vaut lecture ; et combien de photos l'annonce porte.
    supabase.from("annonces_plateforme")
      .select("platform, capture_le, disparu_le, donnees_index_le, photos_capture:capture->photos, photos_index:donnees_index->photos")
      .eq("inventaire_id", inventaireId).eq("user_id", userId).limit(20),
    lireDemandeLecture(supabase, userId, inventaireId),
  ]);
  if (annonces.error) return null;   // illisible : le serveur retient au départ, rien n'est perdu
  const regle = lectureOrigineEnAttente(f, (annonces.data ?? []).map(versLigneOrigine), {
    descriptionLueLe: f?.attributs?.description_source?.at ?? null,
    origineLueLe: demande?.faite_le ?? null,
    // (26/10 nuit, point 9) Un choix fait faute de lecteur (« rédiger ») vaut pour la publication d'alors, côté
    // serveur ; ici, à chaque « Publier », la question se repose : avec un lecteur on attend le vrai texte, sans lui
    // la personne rechoisit. Rien ne change pour un compte dont le lecteur est là.
    ignorerChoix: true,
  });
  if (regle) return { ...regle, demande };
  // (29/10, lot C 1) Lue SANS texte, ou annonce disparue : jamais un stepper qui rédige en silence — l'écran le dit et
  // propose d'écrire ou de faire rédiger (conclusion). Une fiche qui a déjà sa description n'est jamais retenue ici.
  const pf = plateformeOrigine(f);
  if (!texteSuffisant(f?.description)) {
    const motif = String(demande?.motif ?? "");
    if (demande?.faite_le && (motif === "introuvable" || motif === "sans_texte")) return { plateforme: pf, manque: ["description"], demande, conclusion: motif };
    if (pf === "vinted" && f?.disparu_le) return { plateforme: pf, manque: ["description"], demande, conclusion: "introuvable" };
  }
  return null;
}

/**
 * (29/10, lot C 1) La demande de lecture telle que l'extension la tient à jour (prise, échec et son motif, conclusion).
 * Avant la migration 20261030090000 (colonnes absentes) : la date de fin seule, comme avant. null : aucune demande.
 */
export async function lireDemandeLecture(supabase, userId, inventaireId) {
  if (!supabase || !userId || inventaireId == null) return null;
  try {
    const plein = await supabase.from("lectures_origine_demandees").select("demandee_le, prise_le, essai_le, motif, faite_le")
      .eq("inventaire_id", inventaireId).eq("user_id", userId).maybeSingle();
    if (!plein.error) return plein.data ?? null;
    const seul = await supabase.from("lectures_origine_demandees").select("faite_le")
      .eq("inventaire_id", inventaireId).eq("user_id", userId).maybeSingle();
    return seul.error ? null : (seul.data ?? null);
  } catch {
    return null;
  }
}

/** Demande la lecture de l'annonce d'origine (sans attendre). (29/10) `relancer` : « Réessayer », même dans les 15 min. */
export async function demanderLectureOrigine(supabase, inventaireId, { relancer = false } = {}) {
  try {
    const { data } = await supabase.rpc("demander_lecture_origine", relancer
      ? { p_fiche: Number(inventaireId), p_relancer: true } : { p_fiche: Number(inventaireId) });
    return data ?? null;
  } catch {
    return null;
  }
}

// ── (26/10 nuit, point 9) LE LECTEUR, ET LES CHOIX QUAND IL N'Y EN A PAS ─────────────────────────────────────────

/**
 * Un lecteur de la description Vinted existe-t-il maintenant ? Une lecture du profil, au clic (jamais en boucle).
 * L'extension de CET appareil en ≥ 0.6.144 suffit (rien à lire). Profil illisible → null : on ne conclut rien
 * (l'attente d'avant) — jamais un « pas de lecteur » sur une panne.
 */
export async function lireLecteurVinted(supabase, userId, { versionIci = null, maintenant = Date.now() } = {}) {
  if (versionAuMoins(versionIci, LECTEUR_VERSION_MIN)) return lecteurDisponible({ versionIci, maintenant });
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase.from("profiles")
      .select("extension_version, extension_last_seen_at, extension_postes")
      .eq("id", userId).maybeSingle();
    if (error || !data) return null;
    // (29/10, lot C 1) Et ce que l'ordinateur fait en ce moment (battement d'un travail sous verrou) : l'écran le dit.
    return {
      ...lecteurDisponible({
        versionIci,
        compte: { version: data.extension_version ?? null, vuLe: data.extension_last_seen_at ?? null, postes: data.extension_postes ?? null },
        maintenant,
      }),
      travail: travailDuPoste(data.extension_postes ?? null, maintenant),
    };
  } catch {
    return null;
  }
}

/**
 * « Écrire ma description » : la description de la personne, sur la fiche (marquée « manuel », choix daté).
 * @returns {Promise<{ok:true, description:string} | {ok:false, motif:string}>} — jamais d'exception.
 */
export async function ecrireDescriptionSansLecteur(supabase, userId, ficheId, texte) {
  const patch = patchDescriptionEcrite(texte);
  if (!patch) return { ok: false, motif: "texte_trop_court" };
  if (!supabase || !userId || ficheId == null) return { ok: false, motif: "sans_session" };
  try {
    const { data, error } = await supabase.from("inventaire").update(patch)
      .eq("id", ficheId).eq("user_id", userId).select("id");
    if (error) return { ok: false, motif: String(error.message ?? "ecriture_refusee").slice(0, 120) };
    if (!Array.isArray(data) || !data.length) return { ok: false, motif: "fiche_introuvable" };
    // La description est là : la demande de lecture n'a plus d'objet (même règle qu'une lecture faite ici,
    // texteDuVendeur.js) — sans quoi elle se comptait 7 jours dans le Stock et retenait la file du compte jusqu'à
    // 15 min pour rien. L'extension n'écrit de toute façon que sur une fiche vide.
    try { await supabase.rpc("lecture_origine_faite", { p_fiche: Number(ficheId) }); } catch { /* best-effort */ }
    return { ok: true, description: patch.description };
  } catch (e) {
    return { ok: false, motif: String(e?.message ?? "ecriture_impossible").slice(0, 120) };
  }
}

/**
 * « La faire rédiger par FillSell » : le choix seul, sur la fiche — jamais un texte (la copie le porte, relue).
 * Sans ce choix écrit, get-pending-jobs retiendrait la publication jusqu'à une lecture qui n'arrivera pas : un échec
 * se dit (ok:false), on n'ouvre rien.
 * @returns {Promise<{ok:boolean, motif?:string}>}
 */
export async function noterChoixSansLecteur(supabase, userId, ficheId) {
  if (!supabase || !userId || ficheId == null) return { ok: false, motif: "sans_session" };
  try {
    const { data, error } = await supabase.from("inventaire").update(patchChoixRedigee())
      .eq("id", ficheId).eq("user_id", userId).select("id");
    if (error) return { ok: false, motif: String(error.message ?? "ecriture_refusee").slice(0, 120) };
    if (!Array.isArray(data) || !data.length) return { ok: false, motif: "fiche_introuvable" };
    return { ok: true };
  } catch (e) {
    return { ok: false, motif: String(e?.message ?? "ecriture_impossible").slice(0, 120) };
  }
}

/**
 * (29/10, lot C 1) LA MESURE DURABLE : une ligne par écran de récupération, à sa fin (usage_logs
 * « recuperation_description ») — issue (lue | ecrite | redigee | abandon), dernier motif d'échec vu, lecteur (ici |
 * poste | aucun), plateforme, durée jusqu'à l'issue, étapes vues. Au prochain check : combien réussissent, combien
 * échouent, par motif (docs/sql/recuperation-description.sql). Jamais bloquant, jamais le texte de l'annonce.
 */
export function tracerRecuperation(supabase, userId, metadata = {}) {
  if (!supabase || !userId) return;
  try {
    supabase.from("usage_logs").insert({ user_id: userId, feature: "recuperation_description", metadata })
      .then(({ error }) => { if (error) console.warn("[récupération] trace non écrite :", error.message); }, () => {});
  } catch { /* une trace ratée n'en crée pas d'autre */ }
}

/** La trace d'un cas sans lecteur (usage_logs « lecture_origine_sans_lecteur ») : proposé, puis le choix. Jamais bloquant. */
export function tracerChoixSansLecteur(supabase, userId, { evenement = "choix", choix = null, fiche = null, lot = null, lecteur = null, details = null } = {}) {
  if (!supabase || !userId) return;
  try {
    supabase.from("usage_logs").insert({
      user_id: userId, feature: "lecture_origine_sans_lecteur",
      metadata: {
        evenement, choix, fiche, lot,
        raison: lecteur?.raison ?? null, version: lecteur?.version ?? null, vu_le: lecteur?.vuLe ?? null,
        ...(details && typeof details === "object" ? details : {}),
      },
    }).then(({ error }) => { if (error) console.warn("[lecture d'origine] trace non écrite :", error.message); }, () => {});
  } catch { /* une trace ratée n'en crée pas d'autre */ }
}

/**
 * Ce qui attend la lecture de son annonce d'origine (relecture bornée, 60 s), et — sur un ordinateur dont
 * l'extension sait lire un détail Vinted — les lectures Vinted faites ici, une à la fois.
 * @returns {Array<{inventaire_id:number, plateforme:string, vinted_item_id:string|null, depuis:string}>}
 */
export function useLecturesOrigine({ supabase, userId, actif = true, extensionVinted = false }) {
  const [liste, setListe] = useState([]);
  const enCours = useRef(false);
  const derniere = useRef(0);
  const faites = useRef(0);
  useEffect(() => {
    if (!actif || !supabase || !userId) return undefined;
    const r = demarrerRelecture(async () => {
      const { data, error } = await supabase.rpc("lectures_origine_en_attente");
      if (error) return false;
      setListe(Array.isArray(data) ? data : []);
      return true;
    }, { intervalleMs: 60_000, maxMs: 15 * 60_000 });
    return () => r.arreter();
  }, [actif, supabase, userId]);

  useEffect(() => {
    if (!actif || !extensionVinted || enCours.current || faites.current >= 20) return;
    const l = liste.find((x) => x?.plateforme === "vinted" && /^\d+$/.test(String(x?.vinted_item_id ?? "")));
    if (!l) return;
    enCours.current = true;
    (async () => {
      try {
        const [min, max] = RYTHME_LECTURE_VINTED_MS;
        const reste = derniere.current + min + Math.random() * (max - min) - Date.now();
        if (derniere.current && reste > 0) await new Promise((ok) => setTimeout(ok, reste));
        const { data: f } = await supabase.from("inventaire")
          .select("id, description, origine, vinted_item_id, vinted_catalog_id, titre, prix_vente, marque")
          .eq("id", l.inventaire_id).eq("user_id", userId).maybeSingle();
        if (!f) return;
        faites.current += 1;
        derniere.current = Date.now();
        const res = await completerTexteDuVendeur(
          { id: f.id, description: f.description, origine: f.origine, vinted_item_id: f.vinted_item_id,
            vinted_catalog_id: f.vinted_catalog_id, title: f.titre, sell: f.prix_vente, marque: f.marque },
          { supabase, userId, extensionVinted: true });
        derniere.current = Date.now();
        if (res?.source) await supabase.rpc("lecture_origine_faite", { p_fiche: Number(f.id) }).then(() => {}, () => {});
      } catch { /* une lecture ratée se refait au tour suivant */ }
      finally {
        enCours.current = false;
        setListe((prev) => prev.filter((x) => x?.inventaire_id !== l.inventaire_id));
      }
    })();
  }, [actif, extensionVinted, liste, supabase, userId]);

  return liste;
}

/** La ligne du Stock (pure, testée). */
export function phraseLecturesOrigine(liste, lang = "fr") {
  const n = Array.isArray(liste) ? liste.length : 0;
  if (!n) return null;
  const en = lang === "en";
  return {
    titre: en
      ? (n === 1 ? "1 item: reading its original listing" : `${n} items: reading their original listing`)
      : (n === 1 ? "1 article : lecture de son annonce d'origine" : `${n} articles : lecture de leur annonce d'origine`),
    // (25/10) Jamais « ils partiront » : une lecture demandée par le stepper ou le lot n'a pas de job derrière elle —
    // l'article est PRÊT à publier avec ton contenu, il ne part pas tout seul (audit du 25/10).
    texte: en
      ? "FillSell is reading their original listing on its own (on its own for eBay, through the extension on your computer for the others): they'll be ready to publish with YOUR text, ALL YOUR photos and YOUR condition. Nothing to do."
      : "FillSell lit leur annonce d'origine tout seul (seul pour eBay, par l'extension de ton ordinateur pour les autres) : ils seront prêts à publier avec TON texte, TOUTES TES photos et TON état. Rien à faire.",
  };
}
