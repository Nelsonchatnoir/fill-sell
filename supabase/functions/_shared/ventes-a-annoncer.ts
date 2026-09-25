// ============================================================================
// LE RÉCAPITULATIF DES VENTES — au plus UN mail par personne et par 24 h.
// (25/09/2026, rafale des Petites Fioles)
//
// AVANT : chaque vente confirmée (bandeau « Vendue ? » → check-listing-status →
// orchestrateSale) partait aussitôt en mail « Vendu sur X 🎉 », type
// email_logs « relance_manuelle ». Mesuré en base le 25/09 :
//   · famouus-x3@live.fr : 14 mails entre 11:34 et 11:36 (14 ventes confirmées
//     d'affilée au bandeau) ;
//   · marion.routier60000 : 25 mails entre 11:31 et 11:44 le 24/09 ;
//   · 180 mails de ce type en six jours, pour 27 personnes.
//
// MAINTENANT :
//   1. orchestrateSale NOTE la vente (usage_logs, feature « vente_a_annoncer »,
//      une ligne par vente) et n'envoie plus rien ;
//   2. ce balayage, appelé chaque heure par le cron
//      « email-tunnel-job-relaunch-hourly » (même appel que la relance des
//      jobs, AUCUN nouveau cron), envoie UN mail par personne qui liste TOUTES
//      ses ventes notées et pas encore annoncées ;
//   3. l'annonce est journalisée par une ligne usage_logs « ventes_annoncees »
//      qui nomme les notes couvertes. On n'écrit jamais sur le job vendu :
//      usage_logs ne reçoit que des AJOUTS, rien à écraser, rien à perdre.
//
// QUAND UN MAIL PART, ET QUAND IL ATTEND (dans cet ordre) :
//   · fenêtre de jour 8h–22h Paris (la même que la relance des jobs) ;
//   · la rafale est finie : la dernière vente notée a au moins 10 minutes —
//     quatorze confirmations en deux minutes font UN mail, pas deux ;
//   · aucun récapitulatif (ni ancien mail « Vendu ! ») dans les 24 h
//     glissantes : au plus un mail de ce type par personne et par jour ;
//   · la personne a reçu MOINS DE 2 mails en 24 h, tous types confondus —
//     « deux mails par jour » se juge depuis SA boîte de réception (même
//     doctrine que le plafond d'envoi-ponctuel). Le compte se fait par adresse
//     ET par user_id : les anciens mails « Vendu ! » n'avaient pas de user_id.
// Une vente qui attend n'est pas perdue : elle reste notée et part avec le
// récapitulatif suivant. Au-delà de 7 jours, une note n'est plus annoncée
// (un « vendu ! » d'il y a une semaine n'apprend plus rien à personne).
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { type ResultatEnvoi, TYPE_OPTOUT } from "./desinscription.ts";
import { langue, mailVentes, type VenteAnnoncee } from "./emails-fillsell.ts";
import { FEATURE_VENTE_A_ANNONCER } from "./sale-orchestration.ts";

export const TYPE_VENTES = "ventes_du_jour";
/** Ancien type du mail « Vendu sur X 🎉 » (un par vente) — compte dans le « un par jour ». */
export const TYPE_VENTE_ANCIEN = "relance_manuelle";
export const FEATURE_VENTES_ANNONCEES = "ventes_annoncees";

const FENETRE_NOTES_J = 7;
const CALME_MIN = 10;
const UN_PAR_H = 24;
const PLAFOND_24H = 2;

type Envoyer = (o: {
  to: string;
  subject: string;
  html: string;
  type: string;
  userId?: string | null;
  categorie?: "marketing" | "support";
  dedup?: "reservation" | "journal";
}) => Promise<ResultatEnvoi>;

interface Note {
  id: string;
  user_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface RapportVentes {
  notes_en_attente: number;
  personnes: number;
  envoyes: Array<{ user_id: string; ventes: number }>;
  attendent: Array<{ user_id: string; ventes: number; motif: string; deja?: number }>;
  echecs: Array<{ user_id: string; motif: string }>;
}

/** Lecture paginée (PostgREST tronque à 1000 lignes sans prévenir). */
async function lireLogs(db: SupabaseClient, feature: string, depuis: string): Promise<Note[]> {
  const out: Note[] = [];
  const PAGE = 1000;
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await db.from("usage_logs")
      .select("id, user_id, created_at, metadata")
      .eq("feature", feature)
      .gte("created_at", depuis)
      .order("created_at", { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (error) throw new Error(`usage_logs(${feature}): ${error.message}`);
    out.push(...((data ?? []) as Note[]));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Mails reçus par la personne depuis `depuis` : par ADRESSE, plus les lignes
 * portant son user_id sans cette adresse — jamais une ligne comptée deux fois.
 */
async function mailsRecus(
  db: SupabaseClient, userId: string, adresse: string, depuis: string, types?: string[],
): Promise<number> {
  let parAdresse = db.from("email_logs").select("id", { count: "exact", head: true })
    .eq("email", adresse).gte("sent_at", depuis);
  let parCompte = db.from("email_logs").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("sent_at", depuis).or(`email.is.null,email.neq."${adresse.replace(/"/g, "")}"`);
  if (types?.length) {
    parAdresse = parAdresse.in("email_type", types);
    parCompte = parCompte.in("email_type", types);
  } else {
    // La trace de désinscription n'est pas un mail reçu : elle ne compte pas.
    parAdresse = parAdresse.neq("email_type", TYPE_OPTOUT);
    parCompte = parCompte.neq("email_type", TYPE_OPTOUT);
  }
  const [a, b] = await Promise.all([parAdresse, parCompte]);
  if (a.error) throw new Error(`email_logs: ${a.error.message}`);
  if (b.error) throw new Error(`email_logs: ${b.error.message}`);
  return (a.count ?? 0) + (b.count ?? 0);
}

export async function annoncerVentes(
  db: SupabaseClient,
  envoyer: Envoyer,
  opts: { dryRun: boolean; maintenant?: number },
): Promise<RapportVentes> {
  const t = opts.maintenant ?? Date.now();
  const rapport: RapportVentes = { notes_en_attente: 0, personnes: 0, envoyes: [], attendent: [], echecs: [] };

  const notes = await lireLogs(db, FEATURE_VENTE_A_ANNONCER, new Date(t - FENETRE_NOTES_J * 86_400_000).toISOString());
  if (!notes.length) return rapport;
  // Les annonces couvrent des notes de 7 j au plus : 8 j de recul suffisent.
  const annonces = await lireLogs(db, FEATURE_VENTES_ANNONCEES, new Date(t - (FENETRE_NOTES_J + 1) * 86_400_000).toISOString());
  const dejaAnnoncees = new Set<string>();
  for (const a of annonces) {
    for (const id of (Array.isArray(a.metadata?.notes) ? a.metadata!.notes as unknown[] : [])) dejaAnnoncees.add(String(id));
  }

  const parUser = new Map<string, Note[]>();
  for (const n of notes) {
    if (!n.user_id || dejaAnnoncees.has(n.id)) continue;
    if (!parUser.has(n.user_id)) parUser.set(n.user_id, []);
    parUser.get(n.user_id)!.push(n);
  }
  rapport.notes_en_attente = [...parUser.values()].reduce((s, l) => s + l.length, 0);
  rapport.personnes = parUser.size;
  if (!parUser.size) return rapport;

  const { data: profils, error: profErr } = await db.from("profiles")
    .select("id, email, lang").in("id", [...parUser.keys()]);
  if (profErr) throw new Error(`profiles: ${profErr.message}`);
  const profilParId = new Map<string, { email: string | null; lang: string | null }>(
    (profils ?? []).map((p: any) => [p.id, { email: p.email ?? null, lang: p.lang ?? null }]),
  );

  const depuis24h = new Date(t - UN_PAR_H * 3_600_000).toISOString();
  for (const [userId, liste] of parUser) {
    const derniere = Math.max(...liste.map((n) => Date.parse(n.created_at) || 0));
    if (t - derniere < CALME_MIN * 60_000) {
      rapport.attendent.push({ user_id: userId, ventes: liste.length, motif: "rafale_en_cours" });
      continue;
    }
    const prof = profilParId.get(userId);
    const adresse = String(prof?.email ?? "").trim().toLowerCase();
    if (!adresse) {
      rapport.echecs.push({ user_id: userId, motif: "sans_adresse" });
      continue;
    }
    try {
      const memeType = await mailsRecus(db, userId, adresse, depuis24h, [TYPE_VENTES, TYPE_VENTE_ANCIEN]);
      if (memeType > 0) {
        rapport.attendent.push({ user_id: userId, ventes: liste.length, motif: "deja_annonce_24h", deja: memeType });
        continue;
      }
      const total = await mailsRecus(db, userId, adresse, depuis24h);
      if (total >= PLAFOND_24H) {
        rapport.attendent.push({ user_id: userId, ventes: liste.length, motif: "plafond_24h", deja: total });
        continue;
      }
    } catch (e) {
      // Plafond illisible : on N'ENVOIE PAS — ici le plafond EST la règle
      // demandée, pas une politesse. La vente reste notée, l'heure suivante
      // réessaiera.
      rapport.echecs.push({ user_id: userId, motif: `plafond_illisible: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    const ventes: VenteAnnoncee[] = liste.map((n) => {
      const m = n.metadata ?? {};
      const b = m.benefice;
      return {
        titre: m.titre == null ? null : String(m.titre),
        plateforme: String(m.plateforme ?? ""),
        prixVente: Number(m.prix_vente) || 0,
        benefice: b === null || b === undefined || !Number.isFinite(Number(b)) ? null : Number(b),
      };
    });
    const retraitsACliquer = liste.reduce((s, n) => s + (Number(n.metadata?.retraits_a_cliquer) || 0), 0);
    const retraitsBeebsAuto = liste.reduce((s, n) => s + (Number(n.metadata?.retrait_beebs_auto) || 0), 0);
    const { sujet, html } = mailVentes({ ventes, retraitsACliquer, retraitsBeebsAuto }, langue(prof?.lang));

    if (opts.dryRun) {
      rapport.envoyes.push({ user_id: userId, ventes: liste.length });
      continue;
    }
    // 'support' : c'est le compte-rendu de l'activité de la personne sur son
    // propre compte, pas une campagne (la page d'opt-out le dit : « les emails
    // liés à ton compte — confirmations, alertes — continuent normalement »).
    // C'était déjà la catégorie du mail « Vendu ! » qu'il remplace.
    const r = await envoyer({
      to: adresse, subject: sujet, html,
      type: TYPE_VENTES, userId, categorie: "support", dedup: "journal",
    });
    if (!r.envoye) {
      rapport.echecs.push({ user_id: userId, motif: r.motif ?? "envoi_refuse" });
      continue;
    }
    const { error: annErr } = await db.from("usage_logs").insert({
      user_id: userId,
      feature: FEATURE_VENTES_ANNONCEES,
      metadata: {
        notes: liste.map((n) => n.id),
        jobs: liste.map((n) => n.metadata?.job_id ?? null),
        email_type: TYPE_VENTES,
        n: liste.length,
      },
    });
    if (annErr) {
      // Le mail est parti mais l'annonce n'est pas journalisée : ces ventes
      // seraient réannoncées au prochain récapitulatif (24 h plus tard au plus
      // tôt, le plafond « un par jour » tient toujours). On le dit fort.
      console.error("ventes_annoncees_non_journalisees", userId, annErr.message);
      rapport.echecs.push({ user_id: userId, motif: `envoye_mais_non_journalise: ${annErr.message}` });
    }
    rapport.envoyes.push({ user_id: userId, ventes: liste.length });
  }
  return rapport;
}
