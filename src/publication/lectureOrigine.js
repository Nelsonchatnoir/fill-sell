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
import { useEffect, useRef, useState } from "react";
import { demarrerRelecture } from "../utils/relectureBornee";
import { lectureOrigineEnAttente, plateformeOrigine, messageLectureOrigine } from "../../supabase/functions/_shared/contenu-fiche.js";
import { completerTexteDuVendeur, RYTHME_LECTURE_VINTED_MS } from "./texteDuVendeur";

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
    supabase.from("lectures_origine_demandees").select("faite_le")
      .eq("inventaire_id", inventaireId).eq("user_id", userId).maybeSingle(),
  ]);
  if (annonces.error) return null;   // illisible : le serveur retient au départ, rien n'est perdu
  return lectureOrigineEnAttente(f, (annonces.data ?? []).map(versLigneOrigine), {
    descriptionLueLe: f?.attributs?.description_source?.at ?? null,
    origineLueLe: demande?.data?.faite_le ?? null,
  });
}

/** Demande la lecture de l'annonce d'origine (sans attendre). */
export async function demanderLectureOrigine(supabase, inventaireId) {
  try {
    const { data } = await supabase.rpc("demander_lecture_origine", { p_fiche: Number(inventaireId) });
    return data ?? null;
  } catch {
    return null;
  }
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
