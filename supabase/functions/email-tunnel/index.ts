import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import {
  desinscrire,
  envoyerEmail,
  lienDesinscription,
  type ResultatEnvoi,
} from "../_shared/desinscription.ts";
import {
  CWS_URL,
  dateParis,
  langue,
  mailBienvenue,
  mailCommentCaMarche,
  mailLienExtension,
  mailPaiementEchoue,
  mailRelanceJobs,
  mailResiliation,
  type CausePaiement,
  type ContextePaiement,
} from "../_shared/emails-fillsell.ts";
import { paragraphe, renderEmail } from "../_shared/email-template.ts";
import { annoncerVentes, type RapportVentes } from "../_shared/ventes-a-annoncer.ts";

const RESEND_API = "https://api.resend.com/emails";
// Destinataire des alertes internes — même boîte que l'ops-digest.
const TO_OPS = "support@fillsell.app";

// ── Blast de relance août 2026 ────────────────────────────────────────────────
// Type DISTINCT de 'welcome' : la dédup d'email_logs porte sur
// (user_id, email_type) et toutes les cibles ont déjà une ligne 'welcome' —
// réutiliser 'welcome' ferait partir zéro mail.
const BLAST_TYPE = "blast_relaunch_aout";
const BLAST_SUBJECT = "FillSell a beaucoup changé depuis ton inscription";
// Refonte du welcome : commit db3166d, 2026-07-23. Tout 'welcome' antérieur à
// cette date est l'ANCIENNE version (« Vinted, eBay et Depop », zéro extension).
const BLAST_WELCOME_AVANT = "2026-07-23T00:00:00Z";
// Resend : 2 requêtes/seconde par défaut. 2 envois en parallèle puis 1,2 s de
// pause → ~1,7/s, sous la limite avec de la marge.
const BLAST_LOT = 2;
const BLAST_PAUSE_MS = 1200;
// Plafond par invocation : une Edge Function a un budget de temps mural, et
// 326 envois à ce rythme le dépasseraient. Chaque envoi réussi écrit sa ligne
// email_logs, donc relancer reprend exactement là où le run précédent s'est
// arrêté. La réponse renvoie `restant` : tant qu'il est > 0, relancer.
const BLAST_LIMITE_DEFAUT = 150;
// Boîtes internes, forme canonique. La liste d'exclusion d'email_tunnel_candidates
// est NOMINATIVE : elle bloque nicolas.svobodny@gmail.com mais laissait passer
// ses alias nicolas.svobodny+test2@ et +test3@, tous deux dans la cible du blast.
// On compare donc sur l'adresse débarrassée de son alias « +suffixe ».
const BLAST_BASES_INTERNES = [
  "nicolas.svobodny@gmail.com",
  "hoosslocal@gmail.com",
  "sbooby.stan@gmail.com",
  "ornella.berthier@gmail.com",
  "ornellaracano@icloud.com",
  "bensvo91@hotmail.fr",
  "nicotest@mail.fr",
];

// ── Blast « sync du dressing » (2026-08-07) ───────────────────────────────────
// Type one-shot DISTINCT (un envoi par utilisateur, à vie). ⚠️ AUCUN envoi tant
// que la migration 20260807120000 n'est pas appliquée : elle porte À LA FOIS
// l'entrée du type dans l'index email_logs_one_shot_unique (sans quoi la dédup
// lue-puis-écrite peut doublonner en silence, bug welcome du 03/08) ET la RPC
// de cible ordonnée. La branche s'appuie sur ce couplage : RPC absente = index
// pas posé = refus TOTAL (dry_run compris).
// La cible est ORDONNÉE PAR ENGAGEMENT DÉCROISSANT (RPC
// blast_sync_dressing_cibles, rang 1-5, arbitrage Nico 07/08). Le domaine a
// déjà envoyé en volume (blast_relaunch_aout : 323 destinataires le 01/08 en
// une journée, plus blast_founder 104 et founder_plan 295) — pas de montée
// progressive nécessaire ; l'ordre reste : les engagés d'abord, les comptes à
// zéro usage en dernier. Le paramètre limit mange la liste DANS L'ORDRE ; la
// dédup email_logs fait repartir chaque lot là où le précédent s'est arrêté.
const BLAST_SYNC_TYPE = "blast_sync_dressing";
const BLAST_SYNC_SUBJECT = "Tes annonces Vinted dorment ? Republie-les en un clic";

// ── Relance « job en attente, extension absente » (2026-08-01) ────────────────
// Un job publish resté 'pending' avec handler_build NULL = AUCUNE copie de
// l'extension ne l'a jamais réclamé. Ce n'est pas un échec de publication,
// c'est un travail que personne n'est venu chercher. Les deux causes se
// distinguent par profiles.extension_last_seen_at, stampé à chaque poll par
// get-pending-jobs.
const RELANCE_TYPE          = "job_pending_relaunch"; // type STABLE dans email_logs
const RELANCE_AGE_MIN_H     = 4;    // un job plus jeune n'est pas « bloqué »
const RELANCE_AGE_MAX_H     = 720;  // 30 j : au-delà on ne réveille pas un fossile
const RELANCE_EXT_FRAICHE_H = 2;    // extension vue depuis moins de 2 h = CAS 3
// Délai de garde PAR UTILISATEUR, en plus de la réservation par job. Sans lui,
// la dédup par job produit l'effet inverse de celui recherché : plus quelqu'un
// insiste, plus il reçoit de mails identiques (un job relancé ce soir, un
// deuxième mail demain 8 h pour le job créé entre-temps). Ce sont les
// utilisateurs les PLUS motivés qui se feraient harceler.
// 72 h et pas 48 h : le plus grand écart réel entre deux jobs bloqués d'un même
// compte est de 54,5 h (relevé le 2026-08-01) — 48 h le laisserait passer et
// enverrait quand même les deux mails. 72 h laisse aussi un délai réaliste pour
// agir, puisque le cas 1 demande d'aller s'asseoir devant un ORDINATEUR.
const RELANCE_COOLDOWN_H    = 72;
const RELANCE_H_DEBUT       = 8;    // pas d'envoi avant 8h00 Paris
const RELANCE_H_FIN         = 22;   // ni à partir de 22h00 Paris
// CWS_URL, dateParis et les noms de plateformes viennent de _shared : la table
// locale « vinted/leboncoin/ebay/beebs » qui vivait ici imprimait le slug brut
// (`?? p`) dès qu'une plateforme lui manquait, et Opla lui manquait.
// Voir _shared/plateformes.ts — c'est la seule liste, et elle a une garde.

// Heure de Paris via Intl : juste en heure d'été comme d'hiver, sans offset
// codé en dur. hourCycle 'h23' pour que minuit rende "00" et non "24".
//
// ⚠️ formatToParts, PAS format() : en locale fr-FR, format() d'une heure seule
// rend « 20 h » (avec l'unité), donc Number() rendait NaN — et NaN < 8 comme
// NaN >= 22 sont FAUX, si bien que la fenêtre de nuit ne bloquait rien du tout
// et les mails seraient partis à 3 h du matin. Vu au premier dry_run du
// 2026-08-01, avant tout envoi réel. Ne jamais revenir à format() ici.
function heureParis(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
}

// Boîtes internes et alias de test. Remontée au niveau module (elle vivait dans
// la branche blast_relaunch) : la relance automatique doit appliquer EXACTEMENT
// la même liste, sans en maintenir une seconde copie qui divergerait.
function estInterne(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (/@fillsell\.app$/.test(e) || /@example\.(com|org)$/.test(e)) return true;
  const arobase = e.lastIndexOf("@");
  if (arobase < 1) return true; // adresse illisible : on n'écrit pas dedans
  const local = e.slice(0, arobase);
  const domaine = e.slice(arobase + 1);
  if (BLAST_BASES_INTERNES.includes(`${local.split("+")[0]}@${domaine}`)) return true;
  return /\+.*test/.test(local);
}


// ── Blast de relance août 2026 ────────────────────────────────────────────────
// Cible : les inscrits qui ont reçu l'ANCIEN welcome (avant la refonte du
// 2026-07-23, commit db3166d). Cet ancien mail annonçait « Vinted, eBay et
// Depop » et ne mentionnait pas l'extension Chrome : ces comptes ont une image
// fausse du produit. Ce template leur redit ce qu'est FillSell aujourd'hui.
//
// Volontairement HORS du gabarit partagé : c'est un document autonome, validé tel
// quel, avec son propre design system (canvas #EDEAE0, paper #F6F5F1, ink
// #10201B, teal #2F9E90/#1B6E62, amber #E8956D). Tables + styles inline
// uniquement, aucune classe ni balise <style> — compatibilité Gmail/Outlook.
// Ne pas le « ramener » vers le wrapper des mails du tunnel.
//
// Les 4 logos sont les assets de public/email/ (servis
// par fillsell.app) : width/height en attributs HTML, alt renseigné, et
// styles de police posés sur l'<img> pour que le alt reste lisible quand le
// client mail bloque les images.
function blastRelaunchHtml(): string {
  const logo = (fichier: string, nom: string) =>
    `<img src="https://fillsell.app/email/${fichier}" width="54" height="54" alt="${nom}" style="display:block; border:0; outline:none; text-decoration:none; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:12px; font-weight:700; color:#10201B;">`;
  const espaceur = `<td style="width:10px; font-size:1px; line-height:1px;">&nbsp;</td>`;
  const pastille = (contenu: string) =>
    `<td align="center" valign="middle" style="background-color:#F6F5F1; border-radius:12px; padding:10px 12px;">${contenu}</td>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FillSell</title>
<!-- Space Grotesk : DÉCLARÉE dans tous les font-family de ce document depuis
     le 01/08, jamais CHARGÉE — les deux blasts s'affichaient donc en
     Helvetica/Arial chez tout le monde (relevé du 19/09). Le <link> et
     l'@import sont posés ici, comme dans _shared/email-template.ts ; les
     clients qui les ignorent (Gmail, Outlook) retombent sur la même pile de
     repli qu'avant, rien ne bouge pour eux. Le TEXTE n'est pas touché : ces
     deux documents sont historiques. -->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet" type="text/css">
<style type="text/css">@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:#EDEAE0; -webkit-font-smoothing:antialiased;">

<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Publication automatique sur Vinted, Leboncoin, eBay et Beebs. Voilà ce qui a changé.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDEAE0;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#F6F5F1; border-radius:16px; overflow:hidden;">

<!-- Bandeau -->
<tr>
<td style="background-color:#10201B; padding:40px 32px 36px 32px;">
<p style="margin:0 0 14px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#2F9E90;">FillSell</p>
<h1 style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:29px; line-height:1.25; font-weight:700; color:#F6F5F1;">L'app a beaucoup changé depuis ton inscription</h1>
</td>
</tr>

<!-- Intro -->
<tr>
<td style="padding:32px 32px 8px 32px;">
<p style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.65; color:#10201B;">Salut,</p>
<p style="margin:16px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.65; color:#10201B;">Tu t'es inscrit sur FillSell il y a quelque temps. Depuis, l'app n'a plus grand-chose à voir avec celle que tu as découverte. Voilà ce qui a changé.</p>
</td>
</tr>

<!-- Plateformes -->
<tr>
<td style="padding:32px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDEAE0; border-radius:12px;">
<tr>
<td style="padding:24px;">
<p style="margin:0 0 10px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#1B6E62;">Quatre plateformes</p>
<p style="margin:0 0 16px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:19px; line-height:1.4; font-weight:700; color:#10201B;">Une annonce, quatre publications</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
${pastille(logo("logo-vinted.png", "Vinted"))}
${espaceur}
${pastille(logo("logo-leboncoin.png", "Leboncoin"))}
${espaceur}
${pastille(logo("logo-ebay.png", "eBay"))}
${espaceur}
${pastille(logo("logo-beebs.png", "Beebs"))}
</tr>
</table>
<p style="margin:16px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">Tu prépares ton article une fois. Il part sur les quatre.</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Etapes -->
<tr>
<td style="padding:36px 32px 0 32px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td width="40" valign="top" style="font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:13px; font-weight:700; color:#2F9E90; padding-top:2px;">01</td>
<td valign="top">
<p style="margin:0 0 6px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:17px; font-weight:700; line-height:1.4; color:#10201B;">Tu photographies, l'IA écrit</p>
<p style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">Elle identifie la marque, choisit la catégorie, rédige le titre et la description, et propose un prix basé sur ce que l'article vaut vraiment. Une version par plateforme, avec ses règles.</p>
</td>
</tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr>
<td width="40" valign="top" style="font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:13px; font-weight:700; color:#2F9E90; padding-top:2px;">02</td>
<td valign="top">
<p style="margin:0 0 6px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:17px; font-weight:700; line-height:1.4; color:#10201B;">La publication se fait toute seule</p>
<p style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">C'est la grosse nouveauté. Notre extension Chrome remplit les formulaires à ta place : marque, taille, état, photos, description, prix. Sur les quatre plateformes, sans que tu touches à rien.</p>
</td>
</tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr>
<td width="40" valign="top" style="font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:13px; font-weight:700; color:#2F9E90; padding-top:2px;">03</td>
<td valign="top">
<p style="margin:0 0 6px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:17px; font-weight:700; line-height:1.4; color:#10201B;">Vendu quelque part ? Tu retires les autres en un tap</p>
<p style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">Ton article part sur Vinted ? FillSell le détecte et te prévient. Tu confirmes, il retire les annonces des trois autres plateformes. Plus de double vente, plus d'annonces fantômes à nettoyer.</p>
</td>
</tr>
</table>

</td>
</tr>

<!-- Extension -->
<tr>
<td style="padding:36px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#10201B; border-radius:12px;">
<tr>
<td style="padding:26px;">
<p style="margin:0 0 10px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#E8956D;">À savoir avant de démarrer</p>
<p style="margin:0 0 14px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:18px; font-weight:700; line-height:1.4; color:#F6F5F1;">L'extension s'installe sur ordinateur</p>
<p style="margin:0 0 10px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#EDEAE0;">Elle se pose sur Chrome, sur un PC ou un Mac. Une fois installée, tu pilotes tout depuis ton téléphone — il faut juste que l'ordinateur reste allumé.</p>
<p style="margin:0 0 22px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#EDEAE0;">Et tu dois être connecté à tes comptes Vinted, Leboncoin, eBay et Beebs dans ce navigateur.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color:#2F9E90; border-radius:8px;">
<a href="https://fillsell.app" style="display:inline-block; padding:14px 28px; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#10201B; text-decoration:none;">Installer l'extension</a>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>

<!-- Sans extension -->
<tr>
<td style="padding:36px 32px 0 32px;">
<p style="margin:0 0 6px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#1B6E62;">Sans rien installer</p>
<p style="margin:0 0 18px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:19px; font-weight:700; line-height:1.4; color:#10201B;">Depuis ton téléphone, tout de suite</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding:0 0 12px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B; border-bottom:1px solid #EDEAE0;"><strong style="font-weight:700;">Ajoute tes articles à la voix.</strong> Tu parles, ça rentre en stock.</td>
</tr>
<tr>
<td style="padding:12px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B; border-bottom:1px solid #EDEAE0;"><strong style="font-weight:700;">Suis tes bénéfices en temps réel</strong>, article par article.</td>
</tr>
<tr>
<td style="padding:12px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;"><strong style="font-weight:700;">Estime un prix en brocante</strong>, avant même d'acheter.</td>
</tr>
</table>
</td>
</tr>

<!-- CTA final -->
<tr>
<td align="center" style="padding:40px 32px 12px 32px;">
<p style="margin:0 0 20px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.6; color:#10201B;">Ton compte est toujours actif, et ton stock t'attend.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
<tr>
<td style="background-color:#10201B; border-radius:8px;">
<a href="https://fillsell.app" style="display:inline-block; padding:16px 40px; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; font-weight:700; color:#F6F5F1; text-decoration:none;">Ouvrir FillSell</a>
</td>
</tr>
</table>
</td>
</tr>

<!-- Signature -->
<tr>
<td style="padding:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="border-top:1px solid #EDEAE0; padding-top:24px;">
<p style="margin:0 0 4px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">Une question, un bug, une idée ? Réponds à ce mail, je lis tout.</p>
<p style="margin:14px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#10201B;">Nico</p>
<p style="margin:2px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:14px; color:#1B6E62;">Fondateur de FillSell</p>
</td>
</tr>
</table>
</td>
</tr>

</table>

<p style="margin:20px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:#1B6E62; max-width:560px;">Tu reçois ce mail parce que tu as créé un compte sur fillsell.app.</p>

</td>
</tr>
</table>

</body>
</html>`;
}

// ── Blast sync dressing : template (texte de Nico, 07/08) ────────────────────
// Mail VINTED : pas de rangée de logos des 4 plateformes (choix explicite).
// INTERDITS vérifiés à l'écriture, à re-vérifier à toute retouche :
//   · aucune promesse de publication eBay/Leboncoin/Beebs depuis un article
//     importé (type et description NULL → refusé par les 4 plateformes) ;
//   · aucun numéro de version d'extension ;
//   · la republication automatique Pro : UNE mention, jamais un argument
//     central.
function blastSyncDressingHtml(): string {
  // Captures RÉELLES de l'app (fournies par Nico le 07/08), recadrées et
  // hébergées comme les logos : public/email/ → https://fillsell.app/email/.
  // Elles vivent dans la colonne de texte de l'étape (offset 40 px), coins
  // arrondis + liseré, width:100% → se compressent proprement sur mobile.
  // ⚠️ Suffixe -v2 OBLIGATOIRE (07/08) : le premier test est parti avant la
  // fin du déploiement Vercel — le fallback SPA a répondu du text/html sur
  // les URLs .png, et cette réponse est restée coincée dans les caches
  // (Cache-Control immutable 1 an + Cloudflare + proxy images de Gmail).
  // Un changement d'image = TOUJOURS un nouveau nom de fichier, jamais une
  // réécriture sous le même nom ; et vérifier le Content-Type (image/png),
  // pas le code HTTP — le fallback SPA rend 200 sur n'importe quel chemin.
  // (v2 → v3 sur l'image 01 : la sonde elle-même avait re-poisonné l'URL v2
  // en la demandant avant la fin du déploiement. Règle complète : ne JAMAIS
  // requêter l'URL nue avant que le déploiement soit prouvé en ligne —
  // sonder avec un query-string jetable `?probe=N`, qui a sa propre entrée
  // de cache, puis toucher l'URL nue une seule fois, après.)
  const capture = (fichier: string, alt: string) => `
<img src="https://fillsell.app/email/${fichier}" width="456" alt="${alt}"
  style="width:100%; max-width:456px; height:auto; border-radius:12px; border:1px solid #E7E3D8; display:block; margin-top:14px;">`;

  const etape = (num: string, titre: string, corps: string, marge: boolean, image = "") => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${marge ? ` style="margin-top:28px;"` : ""}>
<tr>
<td width="40" valign="top" style="font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:13px; font-weight:700; color:#2F9E90; padding-top:2px;">${num}</td>
<td valign="top">
<p style="margin:0 0 6px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:17px; font-weight:700; line-height:1.4; color:#10201B;">${titre}</p>
<p style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">${corps}</p>${image}
</td>
</tr>
</table>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FillSell</title>
<!-- Space Grotesk : DÉCLARÉE dans tous les font-family de ce document depuis
     le 01/08, jamais CHARGÉE — les deux blasts s'affichaient donc en
     Helvetica/Arial chez tout le monde (relevé du 19/09). Le <link> et
     l'@import sont posés ici, comme dans _shared/email-template.ts ; les
     clients qui les ignorent (Gmail, Outlook) retombent sur la même pile de
     repli qu'avant, rien ne bouge pour eux. Le TEXTE n'est pas touché : ces
     deux documents sont historiques. -->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet" type="text/css">
<style type="text/css">@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap');</style>
</head>
<body style="margin:0; padding:0; background-color:#EDEAE0; -webkit-font-smoothing:antialiased;">

<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Supprimer et remettre en ligne, sans rien ressaisir — FillSell le fait pour toi.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDEAE0;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#F6F5F1; border-radius:16px; overflow:hidden;">

<!-- Bandeau -->
<tr>
<td style="background-color:#10201B; padding:40px 32px 36px 32px;">
<p style="margin:0 0 14px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#2F9E90;">FillSell</p>
<h1 style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:29px; line-height:1.25; font-weight:700; color:#F6F5F1;">Tes annonces Vinted dorment&nbsp;? Republie-les en un clic</h1>
</td>
</tr>

<!-- Intro -->
<tr>
<td style="padding:32px 32px 8px 32px;">
<p style="margin:0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.65; color:#10201B;">Salut,</p>
<p style="margin:16px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.65; color:#10201B;">Sur Vinted, une annonce qui a plus de quelques jours ne se voit presque plus. La seule solution connue&nbsp;: la supprimer et la remettre en ligne. À la main, c'est 5&nbsp;minutes par article — photos à recharger, taille, état, couleurs, tout à ressaisir.</p>
<p style="margin:16px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.65; font-weight:700; color:#10201B;">FillSell le fait pour toi, en un clic, sans rien perdre.</p>
</td>
</tr>

<!-- Comment ça marche -->
<tr>
<td style="padding:36px 32px 0 32px;">
<p style="margin:0 0 18px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#1B6E62;">Comment ça marche</p>
${etape("01", "Tu importes ton dressing Vinted dans FillSell", "Un clic, gratuit. Titres, prix, photos, vues et favoris remontent tout seuls.", false,
  capture("blast-sync-01-dressing-v3.png", "La carte « Tu vends déjà sur Vinted ? » dans FillSell, avec le bouton Actualiser mon dressing"))}
${etape("02", "Sur chaque annonce, un bouton «&nbsp;Republier&nbsp;»", "FillSell sauvegarde la fiche, retire l'ancienne annonce et la remet en ligne à l'identique. Tu peux même baisser le prix au passage.", true,
  capture("blast-sync-02-republier-v2.png", "Une annonce importée dans FillSell, avec son bouton Republier"))}
${etape("03", "Plusieurs articles d'un coup", "Tu sélectionnes, tu republies en lot.", true)}
<!-- Reformulée (07/08 soir) : « C'est gratuit, et automatisable avec
     l'abonnement Pro », placée APRÈS les trois étapes, se lisait comme
     « la republication est gratuite » tout court — les deux utilisateurs
     facturés le soir du blast l'avaient reçue. Le « gratuit » porte sur
     l'IMPORT ; la valeur republication se dit PAR PLAN, sans montant
     (la grille vit dans l'app). Vaut pour tout envoi futur du template. -->
<p style="margin:24px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">L'import de ton dressing est gratuit. La republication est gratuite et illimitée avec Premium, et automatisable avec Pro.</p>
</td>
</tr>

<!-- Ce qu'il te faut -->
<tr>
<td style="padding:36px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#10201B; border-radius:12px;">
<tr>
<td style="padding:26px;">
<p style="margin:0 0 10px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#E8956D;">Ce qu'il te faut</p>
<p style="margin:0 0 14px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:18px; font-weight:700; line-height:1.4; color:#F6F5F1;">L'extension Chrome FillSell</p>
<p style="margin:0 0 22px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#EDEAE0;">À installer une seule fois sur un ordinateur — une minute. Ensuite tout se pilote depuis ton téléphone.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="background-color:#2F9E90; border-radius:8px;">
<a href="${CWS_URL}" style="display:inline-block; padding:14px 28px; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#10201B; text-decoration:none;">Installer l'extension</a>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>

<!-- Signature -->
<tr>
<td style="padding:36px 32px 32px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="border-top:1px solid #EDEAE0; padding-top:24px;">
<p style="margin:0 0 4px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#10201B;">À bientôt,</p>
<p style="margin:14px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#10201B;">Nico</p>
<p style="margin:2px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:14px; color:#1B6E62;">Fondateur de FillSell</p>
</td>
</tr>
</table>
</td>
</tr>

</table>

<p style="margin:20px 0 0 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:#1B6E62; max-width:560px;">Tu reçois ce mail parce que tu as créé un compte sur fillsell.app.</p>

</td>
</tr>
</table>

</body>
</html>`;
}


// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  // ── Désabonnement marketing (2026-08-07) — AVANT le secret cron ───────────
  // Cible des en-têtes List-Unsubscribe / List-Unsubscribe-Post (One-Click,
  // RFC 8058) : Gmail POST ici sans aucun secret quand l'utilisateur clique
  // « Se désabonner ». Le jeton est l'user_id (UUID non devinable). Toujours
  // 200, même sur jeton illisible : un désabonnement ne doit jamais
  // « échouer » côté client mail.
  //
  // ── FUSION DES DEUX REGISTRES (19/09/2026) ────────────────────────────────
  // Avant ce lot, ce point d'entrée n'écrivait QUE la ligne email_logs
  // 'marketing_optout' — que send-relance ne lisait pas. Quelqu'un qui
  // cliquait ici restait destinataire de toute campagne partie par l'autre
  // chemin. Il appelle désormais desinscrire(), qui pose l'état dans le
  // registre canonique (email_destinataires) ET conserve la ligne
  // 'marketing_optout' comme trace d'audit (type inchangé : la dédup
  // historique en dépend, et estDesinscrit() la lit toujours).
  // L'adresse est résolue depuis auth.users : le jeton One-Click ne porte que
  // l'user_id, et le registre canonique est indexé par adresse.
  {
    const unsubToken = new URL(req.url).searchParams.get("unsub");
    if (unsubToken) {
      const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unsubToken);
      if (uuidOk) {
        try {
          const admin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          );
          const { data: compte } = await admin.auth.admin.getUserById(unsubToken);
          const adresse = compte?.user?.email ?? null;
          if (adresse) {
            const r = await desinscrire({
              email: adresse, userId: unsubToken, origine: "one_click",
            });
            if (r.ok) console.log("marketing_optout", unsubToken);
            else console.error("marketing_optout_echec", unsubToken, r.erreur);
          } else {
            // Compte introuvable (supprimé entre-temps) : on garde quand même
            // la trace, elle suffit à bloquer tout envoi à ce compte.
            const { error } = await admin.from("email_logs")
              .insert({ user_id: unsubToken, email_type: "marketing_optout" });
            if (error) console.error("marketing_optout_insert_echec", unsubToken, error.message);
            else console.log("marketing_optout_sans_adresse", unsubToken);
          }
        } catch (e) {
          console.error("marketing_optout_exception", unsubToken, String(e));
        }
      } else {
        console.warn("marketing_optout_jeton_illisible", unsubToken.slice(0, 60));
      }
      // POST = One-Click silencieux ; GET = quelqu'un a ouvert le lien dans
      // un navigateur → page lisible, en français, sans dépendance.
      if (req.method === "GET") {
        return new Response(
          `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>FillSell</title></head>
<body style="margin:0;padding:48px 24px;background:#EDEAE0;font-family:Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;background:#F6F5F1;border-radius:16px;padding:32px;">
<p style="margin:0;font-size:17px;font-weight:700;color:#10201B;">C'est noté.</p>
<p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#10201B;">Tu ne recevras plus ce type d'email de FillSell. Les emails liés à ton compte (confirmations, alertes) continuent normalement.</p>
</div></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const testEmail: string | null = body?.test_email ?? null;

  const sent: string[] = [];
  const errors: string[] = [];

  // Trace des retours Resend. La porte rend le corps de la réponse ; on le
  // garde ici pour la réponse HTTP de diagnostic.
  // Motif historique (2026-08-01) : un mail accepté puis jamais délivré était
  // indiscernable d'un succès, et on n'avait même pas l'id pour aller vérifier
  // chez Resend.
  const resendTrace: Array<Record<string, unknown>> = [];
  // Échecs d'écriture email_logs remontés dans la réponse. La porte les
  // journalise déjà dans email_log_echecs (lu par l'ops-digest de 8h50) ;
  // cette liste ne sert qu'au diagnostic immédiat.
  const logEchecs: string[] = [];

  // ── TOUT passe par la PORTE UNIQUE ────────────────────────────────────────
  // envoyerEmail() (_shared/desinscription.ts) : filtre de désinscription,
  // écriture email_logs, journal des échecs, en-tête List-Unsubscribe. Cette
  // fonction locale n'est qu'une prise de trace autour d'elle — elle ne
  // décide de RIEN, et surtout pas d'écrire email_logs elle-même.
  async function envoyer(o: {
    to: string;
    subject: string;
    html: string;
    type: string;
    userId?: string | null;
    categorie?: "marketing" | "support";
    dedup?: "reservation" | "journal";
  }): Promise<ResultatEnvoi> {
    const r = await envoyerEmail(o);
    const detail = (r.resend && typeof r.resend === "object")
      ? r.resend as Record<string, unknown>
      : { corps: r.resend ?? null };
    resendTrace.push({ to: r.to, type: r.type, http: r.status ?? 0, motif: r.motif ?? null, ...detail });
    if (r.envoye && r.journalise === false) {
      logEchecs.push(`${r.type}:${o.userId ?? r.to}`);
    }
    return r;
  }

  // ── Diagnostic : statut d'un message chez Resend ──────────────────────────
  // {"resend_lookup":"<id>"} → GET /emails/{id}, rendu mot pour mot.
  // C'est la seule façon de distinguer « accepté par l'API » de « délivré » :
  // Resend répond 200 + id même pour une adresse qu'il ne délivrera pas.
  if (typeof body?.resend_lookup === "string" && body.resend_lookup) {
    const r = await fetch(`${RESEND_API}/${encodeURIComponent(body.resend_lookup)}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    const brut = await r.text();
    let corps: unknown = brut;
    try {
      corps = JSON.parse(brut);
    } catch { /* rendu brut */ }
    return new Response(JSON.stringify({ http: r.status, resend: corps }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Alerte de paiement (2026-07-28) ────────────────────────────────────
  // Appelée par les trois webhooks de paiement (Apple, Google, Stripe) à
  // chaque encaissement : « paiement reçu » quand le crédit a créé une
  // nouvelle ligne, « PAIEMENT NON CRÉDITÉ » dès que quelque chose cloche.
  // Motif : l'incident du 28/07 (pack Apple encaissé, notification jetée,
  // découvert uniquement parce que le client a écrit). Sans ce mail, un
  // paiement perdu ne se voit qu'au digest du lendemain — ou jamais.
  //
  // Répond TOUJOURS 200, y compris si Resend échoue : l'appelant est un
  // webhook de store, et son code HTTP doit rester piloté par le crédit,
  // jamais par l'envoi d'un mail (un 500 ici ferait rejouer Apple pour rien).
  if (body?.payment_alert) {
    const a = body.payment_alert as Record<string, unknown>;
    const ok = a.ok === true;
    const lignes: Array<[string, unknown]> = [
      ["Canal", a.canal],
      ["Type", a.type],
      ["Compte", a.user_id ?? "INCONNU"],
      ["Email", a.email ?? "—"],
      ["Produit / plan", a.produit ?? "—"],
      ["Montant store", a.montant ?? "—"],
      // Champ `pepites` : nom hérité du contrat AlertePaiement (posé par les
      // webhooks stores, intouchables — droits acquis). Libellé neutre ici.
      ["Quantité enregistrée (coin_ledger)", a.pepites ?? "—"],
      ["Référence transaction", a.ref ?? "—"],
      ["Retour RPC", a.rpc == null ? "—" : JSON.stringify(a.rpc)],
    ];
    const esc = (v: unknown) =>
      String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 6px;font-size:18px;font-family:sans-serif;color:${ok ? "#111827" : "#B91C1C"};">
      ${ok ? "💰 Paiement reçu" : "🚨 PAIEMENT NON ENREGISTRÉ"}
    </h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      ${esc(new Date().toISOString())}${ok ? "" : " — le client a payé, rien n'est arrivé sur son compte. Enregistrer à la main (coin_ledger, retour RPC ci-dessous)."}
    </p>
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      ${lignes.map(([k, v]) => `<tr>
        <td style="padding:6px 10px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
        <td style="padding:6px 0;color:#111827;word-break:break-all;"><strong>${esc(v)}</strong></td>
      </tr>`).join("")}
    </table>
    ${a.erreur ? `<p style="margin:14px 0 0;padding:10px;background:#FEF2F2;border-radius:8px;font-family:sans-serif;font-size:12.5px;color:#B91C1C;">${esc(a.erreur)}</p>` : ""}
  </div>
</body></html>`;
    const r = await envoyer({
      to: TO_OPS,
      subject: `${ok ? "💰 Paiement reçu" : "🚨 PAIEMENT NON ENREGISTRÉ"} — ${esc(a.canal)} ${esc(a.produit ?? "")}`.trim(),
      html,
      // Alerte interne : 'support' (jamais filtrée), type dédié, journal
      // simple. user_id reste null — le destinataire est notre propre boîte,
      // et c'est la colonne `email` qui dit à qui on a écrit.
      type: "ops_paiement",
      categorie: "support",
      dedup: "journal",
    });
    const envoye = r.envoye;
    return new Response(JSON.stringify({ ok: true, mail_envoye: envoye }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // ── Paiement échoué (2026-08-07) — signalé par stripe-webhook ─────────────
  // TROIS gestes, dans cet ordre :
  //   1. RÉSERVATION par INSERT avant tout envoi : email_type =
  //      'payment_failed:<invoice_id>' — la facture EST l'échec. 23505 =
  //      cette facture a déjà été notifiée (retries Stripe) → on s'arrête.
  //      Type RÉCURRENT par nature (un client peut échouer à des mois
  //      d'écart = autre facture = autre type) → il ne va PAS dans
  //      email_logs_one_shot_unique ; son unicité vit dans l'index partiel
  //      dédié email_logs_payment_failed_unique (migration 20260807190000).
  //   2. Mail CLIENT (cause en clair, sans montant). Resend en échec →
  //      la réservation est SUPPRIMÉE : l'échec reste re-notifiable.
  //   3. Alerte NICO, toujours — même quand le compte est introuvable
  //      (c'est le cas des events de test Stripe : l'alerte qui arrive avec
  //      « compte introuvable » est la preuve de bout en bout du câblage).
  if (body?.payment_failed) {
    const pf = body.payment_failed as {
      user_id?: string | null; email?: string | null; lang?: string | null;
      invoice_id: string; cause?: string; code?: string | null;
      contexte?: string; montant?: string | null; plan?: string | null;
    };
    const cause = pf.cause ?? "autre";
    const contexte = pf.contexte ?? "souscription";
    const typeDedup = `payment_failed:${String(pf.invoice_id ?? "").slice(0, 80)}`;
    let clientEnvoye = false;
    let clientSaute: string | null = null;

    // La réservation, l'envoi, le relâchement en cas d'échec Resend et le
    // journal vivent maintenant DANS la porte (dedup: "reservation"). Cette
    // branche ne fait plus qu'établir les faits et lire le verdict.
    if (pf.user_id && pf.email) {
      const lang = langue(pf.lang);
      const { sujet, html } = mailPaiementEchoue(
        cause as CausePaiement,
        contexte as ContextePaiement,
        lang,
      );
      const r = await envoyer({
        to: pf.email,
        subject: sujet,
        html,
        type: typeDedup,
        userId: pf.user_id,
        // Transactionnel : un client qui a tenté de payer doit être prévenu,
        // opt-out marketing ou pas.
        categorie: "support",
        dedup: "reservation",
      });
      clientEnvoye = r.envoye;
      if (!r.envoye) {
        clientSaute = r.motif === "deja_envoye"
          ? "deja_notifie"
          : r.motif === "reservation_illisible"
          ? "reservation illisible (journalisée)"
          : `${r.motif ?? "echec"} (réservation rendue)`;
      }
    } else {
      // ⚠️ C'EST ICI QUE LE MAIL CLIENT SE PERDAIT (relevé du 19/09 : zéro
      // ligne 'payment_failed:%' depuis le 07/08). Un premier abonnement qui
      // ÉCHOUE n'a jamais écrit profiles.stripe_customer_id — il n'est posé
      // qu'après un paiement abouti ou sur le chemin d'upgrade. Le webhook ne
      // retrouvait donc pas le compte, pf.user_id arrivait à null, et cette
      // branche sautait le mail en silence. stripe-webhook résout désormais le
      // compte par l'ADRESSE quand l'id client ne donne rien.
      clientSaute = `compte ou email introuvable (user_id=${pf.user_id ?? "null"}, email=${pf.email ? "présent" : "absent"})`;
      console.warn("payment_failed_client_non_notifie", JSON.stringify({
        invoice: pf.invoice_id, user_id: pf.user_id ?? null, email: pf.email ? "présent" : "absent",
      }));
    }

    const esc = (v: unknown) =>
      String(v ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lignes: Array<[string, unknown]> = [
      ["Contexte", contexte === "renouvellement" ? "Renouvellement (l'abonnement reste actif pendant le dunning Stripe)" : "Souscription (jamais activée)"],
      ["Cause", `${cause}${pf.code ? ` (${pf.code})` : ""}`],
      ["Plan", pf.plan],
      ["Montant", pf.montant],
      ["Email client", pf.email],
      ["Compte", pf.user_id ?? "INTROUVABLE (event de test Stripe, ou customer sans profil)"],
      ["Mail client", clientEnvoye ? "envoyé" : `non envoyé — ${clientSaute}`],
      ["Facture", pf.invoice_id],
    ];
    const opsHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 6px;font-size:18px;font-family:sans-serif;color:#B45309;">💳 Paiement échoué</h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      ${esc(new Date().toISOString())} — un prospect/abonné vient d'échouer au paiement. Le rattraper vaut de l'or.
    </p>
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      ${lignes.map(([k, v]) => `<tr>
        <td style="padding:6px 10px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td>
        <td style="padding:6px 0;color:#111827;word-break:break-all;"><strong>${esc(v)}</strong></td>
      </tr>`).join("")}
    </table>
    <p style="margin:14px 0 0;font-size:12.5px;font-family:sans-serif;">
      <a href="https://dashboard.stripe.com/invoices/${esc(pf.invoice_id)}" style="color:#0F9488;font-weight:600;">Voir la facture dans Stripe</a>
    </p>
  </div>
</body></html>`;
    const opsOk = (await envoyer({
      to: TO_OPS,
      subject: `💳 Paiement échoué — ${cause}${pf.email ? ` — ${pf.email}` : ""}`,
      html: opsHtml,
      type: "ops_paiement_echoue",
      categorie: "support",
      dedup: "journal",
    })).envoye;

    return new Response(
      JSON.stringify({
        ok: true, client_envoye: clientEnvoye, client_saute: clientSaute,
        alerte_ops: opsOk, dedup: typeDedup, log_echecs: logEchecs,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Immediate welcome (fired from handle_new_user DB trigger) ───────────
  const welcomeNow: boolean = body?.welcome_now === true;
  const welcomeUserId: string | null = body?.user_id ?? null;
  const welcomeUserEmail: string | null = body?.user_email ?? null;

  if (welcomeNow && welcomeUserId && welcomeUserEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("lang")
      .eq("id", welcomeUserId)
      .maybeSingle();
    const lang = langue(profile?.lang);

    // Plus de lecture-puis-écriture (« déjà envoyé ? » puis insert) : la porte
    // RÉSERVE la ligne avant d'envoyer, et l'index email_logs_one_shot_unique
    // rend le doublon impossible même si deux runs se chevauchent. C'est
    // exactement la course qui a produit 37 welcomes en double du 01 au 03/08.
    // Le refus des désinscrits vit lui aussi dans la porte — et il lit
    // désormais LES DEUX registres.
    const { sujet, html } = mailBienvenue(
      lang,
      await lienDesinscription(welcomeUserEmail, welcomeUserId).catch(() => ""),
    );
    const r = await envoyer({
      to: welcomeUserEmail,
      subject: sujet,
      html,
      type: "welcome",
      userId: welcomeUserId,
      categorie: "marketing",
      dedup: "reservation",
    });
    if (r.envoye) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: [`welcome:${welcomeUserEmail}`],
          log_echecs: logEchecs,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (r.motif === "deja_envoye" || r.motif === "desinscrit") {
      return new Response(JSON.stringify({ skipped: true, reason: r.motif }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ success: false, error: `Failed to send to ${welcomeUserEmail}`, motif: r.motif }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Test mode: send the 2 tunnel templates to the specified email ─────────
  // N'écrit PAS email_logs — sert aux previews (welcome + comment ça marche).
  // Avec test_template:"blast_relaunch_aout" ou "blast_sync_dressing", envoie
  // CE SEUL template (preview visuelle avant le blast de masse).
  // Preview du mail de paiement échoué : cause/contexte passables en options
  // pour éprouver chaque variante ({"test_cause":"carte_refusee",
  // "test_contexte":"renouvellement"}). N'écrit PAS email_logs.
  //
  // ⚠️ Les aperçus partent sous le type `preview:<template>`, JAMAIS sous le
  // type réel : un aperçu de welcome envoyé sous le type 'welcome' brûlerait
  // la ligne one-shot de l'adresse de test, qui ne recevrait plus jamais le
  // vrai. Ces lignes `preview:` ne sont lues par aucune dédup.
  // Langue : {"test_lang":"en"} pour voir la version anglaise.
  if (testEmail) {
    const langTest = langue(body?.test_lang);
    const template = typeof body?.test_template === "string" ? body.test_template : "tunnel";

    const apercu = async (nom: string, sujet: string, html: string) => {
      const r = await envoyer({
        to: testEmail, subject: sujet, html,
        type: `preview:${nom}`, categorie: "support", dedup: "journal",
      });
      if (r.envoye) sent.push(`${nom}:${testEmail}`);
      else errors.push(`${nom}:${testEmail}${r.motif ? ` (${r.motif})` : ""}`);
      return r.envoye;
    };

    if (template === "payment_failed") {
      const cause = (typeof body?.test_cause === "string" ? body.test_cause : "3ds") as CausePaiement;
      const contexte = (typeof body?.test_contexte === "string" ? body.test_contexte : "souscription") as ContextePaiement;
      const m = mailPaiementEchoue(cause, contexte, langTest);
      const ok = await apercu("payment_failed", m.sujet, m.html);
      return new Response(
        JSON.stringify({ test: true, template, lang: langTest, cause, contexte, sent, errors, resend: resendTrace }),
        { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (template === "relance_1" || template === "relance_2") {
      // Aperçu des deux relances avec un jeu d'essai — dont un slug INCONNU,
      // pour vérifier de visu que la garde de _shared/plateformes.ts ne le
      // laisse jamais sortir en clair.
      const m = mailRelanceJobs(template === "relance_1" ? 1 : 2, {
        titres: ["Robe Zara verte", "Sac à main cuir"],
        plateformes: ["vinted", "opla", "plateforme_inexistante"],
        depuis: new Date(Date.now() - 26 * 3_600_000).toISOString(),
        extensionVueLe: template === "relance_2"
          ? new Date(Date.now() - 9 * 3_600_000).toISOString()
          : null,
      }, langTest);
      const ok = await apercu(template, m.sujet, m.html);
      return new Response(
        JSON.stringify({ test: true, template, lang: langTest, sent, errors, resend: resendTrace }),
        { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (template === "resiliation_ar") {
      const m = mailResiliation({
        formule: "Premium",
        demandeLe: new Date(),
        finAcces: new Date(Date.now() + 18 * 86_400_000),
      }, langTest);
      const ok = await apercu("resiliation_ar", m.sujet, m.html);
      return new Response(
        JSON.stringify({ test: true, template, lang: langTest, sent, errors, resend: resendTrace }),
        { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (template === "extension_link") {
      const m = mailLienExtension(langTest);
      const ok = await apercu("extension_link", m.sujet, m.html);
      return new Response(
        JSON.stringify({ test: true, template, lang: langTest, sent, errors, resend: resendTrace }),
        { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (template === BLAST_SYNC_TYPE) {
      const ok = await apercu(BLAST_SYNC_TYPE, BLAST_SYNC_SUBJECT, blastSyncDressingHtml());
      return new Response(
        JSON.stringify({ test: true, template: BLAST_SYNC_TYPE, sent, errors, resend: resendTrace }),
        { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (template === BLAST_TYPE) {
      const ok = await apercu(BLAST_TYPE, BLAST_SUBJECT, blastRelaunchHtml());
      return new Response(
        JSON.stringify({ test: true, template: BLAST_TYPE, sent, errors, resend: resendTrace }),
        { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Défaut : les deux mails du tunnel, avec un lien de désinscription RÉEL.
    const lien = await lienDesinscription(testEmail).catch(() => "");
    const b = mailBienvenue(langTest, lien);
    await apercu("welcome", b.sujet, b.html);
    const c = mailCommentCaMarche(langTest, lien);
    await apercu("how_it_works", c.sujet, c.html);
    return new Response(JSON.stringify({ test: true, lang: langTest, sent, errors, resend: resendTrace }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Relance mode: un texte libre, dans le gabarit de marque ───────────────
  // Le corps arrive en texte brut : chaque ligne non vide devient un
  // paragraphe ÉCHAPPÉ par le gabarit. Aucun HTML n'est accepté d'un appelant.
  const relanceEmails: Array<{to: string; subject: string; body_text: string}> = body?.relance_emails ?? [];
  if (relanceEmails.length > 0) {
    for (const item of relanceEmails) {
      const lignes = String(item.body_text ?? "")
        .split(/\n{1,}/).map((l) => l.trim()).filter(Boolean);
      const html = renderEmail({
        titre: "",
        corps: lignes.map((l) => paragraphe(l)),
        preheader: lignes[0]?.slice(0, 85) ?? "",
        formuleFin: "",
        signatureNom: "Nico",
        signatureRole: "FillSell",
        langue: "fr",
      });
      const r = await envoyer({
        to: item.to, subject: item.subject, html,
        type: "relance_manuelle", categorie: "support", dedup: "journal",
      });
      if (r.envoye) sent.push(`relance:${item.to}`);
      else errors.push(`relance:${item.to}${r.motif ? ` (${r.motif})` : ""}`);
    }
    return new Response(JSON.stringify({ relance: true, sent, errors, log_echecs: logEchecs }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Blast de relance août 2026 : envoi ciblé ───────────────────────────────
  // Déclenché À LA MAIN, jamais par le cron :
  //   -H "x-cron-secret: …" -d '{"blast_relaunch":true}'
  // Options : {"dry_run":true} compte la cible sans rien envoyer ;
  //           {"limit":N} borne le run (défaut 150, cf. BLAST_LIMITE_DEFAUT).
  if (body?.blast_relaunch === true) {
    const dryRun = body?.dry_run === true;
    const limite =
      Number.isFinite(body?.limit) && body.limit > 0
        ? Math.floor(body.limit)
        : BLAST_LIMITE_DEFAUT;

    // Les adresses viennent du RPC du tunnel, qui porte déjà la liste
    // d'exclusion interne. On y ajoute une garde de DOMAINE : cette liste nomme
    // 'test@fillsell.app' mais laisserait passer les autres @fillsell.app.
    const { data: tous, error: tousErr } = await supabase.rpc("email_tunnel_candidates");
    if (tousErr || !tous) {
      return new Response(
        JSON.stringify({ error: tousErr?.message ?? "Failed to fetch candidates" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pagination explicite : PostgREST plafonne ses réponses et email_logs
    // dépasse déjà le millier de lignes — un .select() nu tronquerait la cible.
    async function idsParType(type: string, avant?: string): Promise<Set<string>> {
      const ids = new Set<string>();
      const PAGE = 1000;
      for (let debut = 0; ; debut += PAGE) {
        let q = supabase
          .from("email_logs")
          .select("user_id")
          .eq("email_type", type)
          .order("user_id")
          .range(debut, debut + PAGE - 1);
        if (avant) q = q.lt("sent_at", avant);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        for (const l of data ?? []) ids.add((l as any).user_id);
        if (!data || data.length < PAGE) return ids;
      }
    }

    let ancienWelcome: Set<string>;
    let dejaBlaste: Set<string>;
    try {
      ancienWelcome = await idsParType("welcome", BLAST_WELCOME_AVANT);
      dejaBlaste = await idsParType(BLAST_TYPE);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `email_logs: ${(e as Error).message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // La règle d'exclusion vit maintenant au niveau module (estInterne) : la
    // relance automatique des jobs applique la MÊME, sans copie divergente.

    // Dédup par user_id : 143 comptes portent PLUSIEURS lignes 'welcome'
    // (doublons historiques d'email_logs). Sans ce Set, ils recevraient le
    // blast deux fois dans le même run.
    const vus = new Set<string>();
    const cibles: Array<{ user_id: string; user_email: string }> = [];
    for (const u of tous as any[]) {
      if (!u.user_email || estInterne(u.user_email)) continue;
      if (!ancienWelcome.has(u.user_id)) continue;
      if (dejaBlaste.has(u.user_id)) continue;
      if (vus.has(u.user_id)) continue;
      vus.add(u.user_id);
      cibles.push({ user_id: u.user_id, user_email: u.user_email });
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          blast: BLAST_TYPE,
          dry_run: true,
          cibles: cibles.length,
          apercu: cibles.slice(0, 10).map((c) => c.user_email),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const html = blastRelaunchHtml();
    const tranche = cibles.slice(0, limite);
    for (let i = 0; i < tranche.length; i += BLAST_LOT) {
      await Promise.all(
        tranche.slice(i, i + BLAST_LOT).map(async (c) => {
          // Le texte du blast n'est pas touché (document historique, déjà
          // parti le 01/08) — seul son ENVOI passe par la porte, qui écrit la
          // ligne email_logs et refuse les désinscrits des deux registres.
          // Resend en échec = AUCUNE ligne email_logs : la cible reste
          // éligible et repartira au prochain run.
          const r = await envoyer({
            to: c.user_email, subject: BLAST_SUBJECT, html,
            type: BLAST_TYPE, userId: c.user_id,
            categorie: "marketing", dedup: "journal",
          });
          if (!r.envoye) {
            errors.push(`${BLAST_TYPE}:${c.user_email}${r.motif ? ` (${r.motif})` : ""}`);
            return;
          }
          sent.push(`${BLAST_TYPE}:${c.user_email}`);
        })
      );
      if (i + BLAST_LOT < tranche.length) {
        await new Promise((r) => setTimeout(r, BLAST_PAUSE_MS));
      }
    }

    return new Response(
      JSON.stringify({
        blast: BLAST_TYPE,
        cibles: cibles.length,
        envoyes: sent.length,
        echecs: errors.length,
        restant: cibles.length - sent.length,
        sent,
        errors,
        log_echecs: logEchecs,
        // Détail Resend des seuls échecs : borné, et c'est ce qu'on veut lire.
        resend_echecs: resendTrace.filter((t) => (t.http as number) < 200 || (t.http as number) >= 300),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Audit délivrabilité Resend (2026-08-07) ────────────────────────────────
  // Parcourt l'historique d'envois (GET /emails, paginé, borné à 50 pages de
  // 100) et relève les adresses dont un message porte un événement de rejet :
  // hard bounce ou plainte. Conservateur : une adresse qui a bouncé UNE fois
  // est exclue, même si un envoi ultérieur est passé.
  // DÉFENSIF : la forme de l'API de liste n'est pas contractuelle chez nous —
  // toute réponse inattendue rend { ok:false } et c'est l'APPELANT qui décide
  // (le blast refuse alors d'envoyer, cf. sans_audit_resend).
  async function auditResend(): Promise<{
    ok: boolean; erreur?: string; bounces: string[]; plaintes: string[]; examines: number;
  }> {
    const bounces = new Set<string>();
    const plaintes = new Set<string>();
    let examines = 0;
    let after: string | null = null;
    for (let pageN = 0; pageN < 50; pageN++) {
      const url = new URL(RESEND_API);
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      let r: Response;
      try {
        r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${resendKey}` } });
      } catch (e) {
        return { ok: false, erreur: `réseau : ${String(e)}`, bounces: [...bounces], plaintes: [...plaintes], examines };
      }
      if (!r.ok) {
        return { ok: false, erreur: `GET /emails → HTTP ${r.status}`, bounces: [...bounces], plaintes: [...plaintes], examines };
      }
      let corps: unknown;
      try { corps = await r.json(); } catch {
        return { ok: false, erreur: "réponse non-JSON", bounces: [...bounces], plaintes: [...plaintes], examines };
      }
      const lignes = Array.isArray((corps as { data?: unknown })?.data)
        ? (corps as { data: Array<Record<string, unknown>> }).data
        : null;
      if (!lignes) {
        return { ok: false, erreur: "forme inattendue (pas de data[])", bounces: [...bounces], plaintes: [...plaintes], examines };
      }
      for (const m of lignes) {
        examines++;
        const dest = Array.isArray(m?.to) ? m.to as unknown[] : (m?.to ? [m.to] : []);
        const evt = String(m?.last_event ?? "");
        if (evt === "bounced") for (const d of dest) bounces.add(String(d).trim().toLowerCase());
        if (evt === "complained") for (const d of dest) plaintes.add(String(d).trim().toLowerCase());
      }
      if (lignes.length < 100) break;
      const dernierId = lignes[lignes.length - 1]?.id;
      if (!dernierId) break;
      after = String(dernierId);
    }
    return { ok: true, bounces: [...bounces], plaintes: [...plaintes], examines };
  }

  // Mode autonome : {"audit_resend":true} → le relevé, sans toucher à rien.
  // C'est la réponse à « combien de bounces/plaintes historiques ? » avant le
  // premier lot du blast.
  if (body?.audit_resend === true) {
    const a = await auditResend();
    return new Response(JSON.stringify({ audit_resend: a }), {
      status: a.ok ? 200 : 500, headers: { "Content-Type": "application/json" },
    });
  }

  // ── Blast « sync du dressing » (2026-08-07) : envoi ORDONNÉ, par lots ──────
  // Déclenché À LA MAIN, jamais par le cron :
  //   -d '{"blast_sync_dressing":true,"dry_run":true}' — cible + répartition
  //       par rang + audit Resend, ZÉRO envoi (ignore la fenêtre horaire) ;
  //   -d '{"blast_sync_dressing":true,"limit":150}'    — un lot, dans l'ordre.
  // Séquence actée (07/08, révisée le jour même) : dry_run → 150 → le reste,
  // comme le blast du 01/08 (323 en une journée) — pas de montée progressive.
  // L'ordre vient de la RPC (engagement décroissant, tri stable) ; la reprise
  // vient de la dédup email_logs : chaque lot repart où le précédent s'est
  // arrêté, jamais de pioche au hasard.
  if (body?.blast_sync_dressing === true) {
    const dryRun = body?.dry_run === true;
    const limite =
      Number.isFinite(body?.limit) && body.limit > 0
        ? Math.floor(body.limit)
        : BLAST_LIMITE_DEFAUT;

    // Fenêtre 8h-22h Paris — ceinture, échec fermé comme job_relaunch : une
    // heure illisible n'autorise JAMAIS l'envoi. dry_run passe (lecture seule).
    const h = heureParis();
    if (!dryRun && (!Number.isFinite(h) || h < RELANCE_H_DEBUT || h >= RELANCE_H_FIN)) {
      return new Response(
        JSON.stringify({
          blast: BLAST_SYNC_TYPE, envoyes: 0,
          refus: `fenêtre d'envoi ${RELANCE_H_DEBUT}h-${RELANCE_H_FIN}h Paris (heure lue : ${h}h)`,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // RPC absente = migration 20260807120000 PAS appliquée = l'index de dédup
    // n'est pas posé non plus (même fichier de migration) : refus TOTAL,
    // dry_run compris — on ne raisonne jamais sur une cible sans sa dédup.
    const { data: brutes, error: ciblesErr } = await supabase.rpc("blast_sync_dressing_cibles");
    if (ciblesErr || !brutes) {
      return new Response(
        JSON.stringify({
          error: `cible indisponible — migration 20260807120000 appliquée ? (${ciblesErr?.message ?? "réponse vide"})`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Dédup déjà-envoyés + opt-out marketing : pagination explicite, PostgREST
    // tronque à 1000 et email_logs dépasse déjà le millier de lignes (règle
    // CLAUDE.md). 'marketing_optout' = lignes posées par l'endpoint ?unsub=
    // (One-Click Gmail) — un désabonné ne reçoit AUCUN blast futur.
    const dejaEnvoye = new Set<string>();
    const optout = new Set<string>();
    try {
      const PAGE = 1000;
      for (const [type, cible] of [[BLAST_SYNC_TYPE, dejaEnvoye], ["marketing_optout", optout]] as const) {
        for (let debut = 0; ; debut += PAGE) {
          const { data, error } = await supabase
            .from("email_logs")
            .select("user_id")
            .eq("email_type", type)
            .order("user_id")
            .range(debut, debut + PAGE - 1);
          if (error) throw new Error(error.message);
          for (const l of data ?? []) cible.add((l as { user_id: string }).user_id);
          if (!data || data.length < PAGE) break;
        }
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `email_logs: ${(e as Error).message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Audit Resend : hard bounces et plaintes HISTORIQUES exclus de la cible
    // (demande Nico 07/08 — le domaine n'a jamais envoyé en volume, chaque
    // rejet évitable compte). Audit en échec → PAS d'envoi, sauf échappatoire
    // explicite {"sans_audit_resend":true} : protéger la réputation prime.
    const audit = await auditResend();
    if (!audit.ok && !dryRun && body?.sans_audit_resend !== true) {
      return new Response(
        JSON.stringify({
          error: `audit Resend indisponible (${audit.erreur}) — envoi refusé. ` +
            `Vérifier le dashboard Resend à la main, puis forcer avec {"sans_audit_resend":true}.`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const exclusResendSet = new Set([...audit.bounces, ...audit.plaintes]);

    // Filtrage DANS L'ORDRE de la RPC — l'ordre EST le contrat.
    const vus = new Set<string>();
    const cibles: Array<{ user_id: string; user_email: string; rang: number }> = [];
    const parRang: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let exclusInternes = 0;
    let exclusResend = 0;
    for (const c of brutes as Array<{ user_id: string; user_email: string; rang: number }>) {
      if (!c.user_email || estInterne(c.user_email)) { exclusInternes++; continue; }
      if (exclusResendSet.has(c.user_email.trim().toLowerCase())) { exclusResend++; continue; }
      if (optout.has(c.user_id)) continue;
      if (dejaEnvoye.has(c.user_id)) continue;
      if (vus.has(c.user_id)) continue;
      vus.add(c.user_id);
      cibles.push(c);
      parRang[c.rang] = (parRang[c.rang] ?? 0) + 1;
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          blast: BLAST_SYNC_TYPE,
          dry_run: true,
          cibles: cibles.length,
          par_rang: parRang,
          exclus_internes: exclusInternes,
          exclus_resend: exclusResend,
          audit_resend: {
            ok: audit.ok, erreur: audit.erreur ?? null, examines: audit.examines,
            bounces: audit.bounces.length, plaintes: audit.plaintes.length,
          },
          apercu: cibles.slice(0, 10).map((c) => `r${c.rang}:${c.user_email}`),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // En-têtes de désabonnement : posés par la porte sur tout 'marketing'.
    const html = blastSyncDressingHtml();
    const tranche = cibles.slice(0, limite);
    for (let i = 0; i < tranche.length; i += BLAST_LOT) {
      await Promise.all(
        tranche.slice(i, i + BLAST_LOT).map(async (c) => {
          // Texte historique intact ; l'envoi passe par la porte.
          // Resend en échec = AUCUNE ligne email_logs : la cible reste
          // éligible et repartira au prochain lot.
          const r = await envoyer({
            to: c.user_email, subject: BLAST_SYNC_SUBJECT, html,
            type: BLAST_SYNC_TYPE, userId: c.user_id,
            categorie: "marketing", dedup: "journal",
          });
          if (!r.envoye) {
            errors.push(`${BLAST_SYNC_TYPE}:${c.user_email}${r.motif ? ` (${r.motif})` : ""}`);
            return;
          }
          sent.push(`${BLAST_SYNC_TYPE}:${c.user_email}`);
        })
      );
      if (i + BLAST_LOT < tranche.length) {
        await new Promise((r) => setTimeout(r, BLAST_PAUSE_MS));
      }
    }

    return new Response(
      JSON.stringify({
        blast: BLAST_SYNC_TYPE,
        cibles: cibles.length,
        envoyes: sent.length,
        echecs: errors.length,
        restant: cibles.length - sent.length,
        par_rang: parRang,
        exclus_internes: exclusInternes,
        exclus_resend: exclusResend,
        sent,
        errors,
        log_echecs: logEchecs,
        resend_echecs: resendTrace.filter((t) => (t.http as number) < 200 || (t.http as number) >= 300),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Relance des jobs jamais pris en charge par l'extension (2026-08-01) ───
  // Cron horaire 'email-tunnel-job-relaunch-hourly'. Options manuelles :
  //   {"job_relaunch":true,"dry_run":true} → montre la cible sans rien envoyer
  //                                          et IGNORE la fenêtre de nuit.
  // ── Récapitulatif des ventes (25/09/2026) — cf. _shared/ventes-a-annoncer.ts
  // Manuel : {"ventes_du_jour":true,"dry_run":true} montre qui recevrait quoi,
  // sans rien envoyer. En production il tourne dans l'appel HORAIRE ci-dessous
  // (job_relaunch), sans cron supplémentaire.
  if (body?.ventes_du_jour === true) {
    const dryRun = body?.dry_run === true;
    const h = heureParis();
    if (!dryRun && (!Number.isFinite(h) || h < RELANCE_H_DEBUT || h >= RELANCE_H_FIN)) {
      return new Response(JSON.stringify({ ventes: "reporte_fenetre_nuit", heure_paris: h }),
        { headers: { "Content-Type": "application/json" } });
    }
    try {
      const rapport = await annoncerVentes(supabase, envoyer, { dryRun });
      return new Response(JSON.stringify({ ventes: rapport, dry_run: dryRun, heure_paris: h, log_echecs: logEchecs }),
        { headers: { "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: `ventes_du_jour: ${e instanceof Error ? e.message : String(e)}` }),
        { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  if (body?.job_relaunch === true) {
    const dryRun = body?.dry_run === true;
    const h = heureParis();
    // Échec fermé : une heure illisible ne doit JAMAIS autoriser l'envoi —
    // mieux vaut un créneau manqué qu'un mail à 3 h du matin.
    if (!dryRun && (!Number.isFinite(h) || h < RELANCE_H_DEBUT || h >= RELANCE_H_FIN)) {
      // Rien n'est perdu : aucune réservation n'est prise, les jobs restent
      // éligibles et repartiront au premier créneau de jour.
      return new Response(JSON.stringify({
        relance: RELANCE_TYPE, reporte: "fenetre_nuit", heure_paris: h,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ── Récapitulatif des ventes, AVANT la relance des jobs (25/09) ─────────
    // Même fenêtre de jour. Isolé : une panne ici n'empêche JAMAIS la relance
    // des jobs de tourner (elle est rendue dans la réponse, rien de plus).
    let ventes: RapportVentes | { erreur: string } | null = null;
    try {
      ventes = await annoncerVentes(supabase, envoyer, { dryRun });
    } catch (e) {
      const erreur = e instanceof Error ? e.message : String(e);
      ventes = { erreur };
      console.error("ventes_du_jour_echec", erreur);
    }

    const t = Date.now();
    // ── UN JOB RETENU PAR NOTRE PROPRE RÉGULATION N'EST PAS UN JOB OUBLIÉ ────
    // (2026-09-07) Le passage de 10:00 a classé claeys59450 en
    // « cas3_bug_extension » avec 37 jobs et l'extension vue à 10:00 — pendant
    // que ses republications passaient normalement (16 réussies, la dernière à
    // 10:19). Il n'y avait aucun bug : ces 37 jobs étaient RETENUS EXPRÈS par
    // get-pending-jobs, qui sert les republications article par article
    // (capture → retrait → recréation, 1 job par étape et par cycle) et
    // applique un plafond quotidien par palier. Ils restent donc 'pending' avec
    // handler_build NULL pendant des heures, par construction.
    // Deux exclusions, toutes deux mesurables sur le job lui-même :
    //   · action 'republish' — c'est la file régulée ; elle ne s'oublie pas,
    //     elle s'écoule. (action NULL = publication d'avant le champ.)
    //   · next_action_after dans le futur — reprise espacée ou attente
    //     programmée : le job a un rendez-vous, il n'attend pas un humain.
    const { data: jobs, error: jobsErr } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, title, created_at, platform_fields")
      .eq("status", "pending")
      .is("handler_build", null)
      .or("action.is.null,action.eq.publish")
      .lte("created_at", new Date(t - RELANCE_AGE_MIN_H * 3_600_000).toISOString())
      .gte("created_at", new Date(t - RELANCE_AGE_MAX_H * 3_600_000).toISOString())
      .order("created_at", { ascending: true });
    if (jobsErr) {
      return new Response(JSON.stringify({ error: `cross_post_jobs: ${jobsErr.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Un seul mail par utilisateur, qui mentionne TOUS ses jobs en attente.
    const parUser = new Map<string, any[]>();
    for (const j of (jobs ?? []) as any[]) {
      // Rendez-vous dans le futur (reprise espacée, attente de boutique,
      // espacement anti-robot) : ce job n'attend personne.
      const rdv = Date.parse(String(j.platform_fields?.next_action_after ?? ""));
      if (Number.isFinite(rdv) && rdv > t) continue;
      // (2026-09-25) En pause anti-robot du compte Vinted : ce job attend la
      // vérification de Vinted, pas un humain ni un correctif — ni relance,
      // ni « cas 3 » (faux « bug de notre côté »).
      if (j.platform_fields?.attente_antirobot_compte) continue;
      if (!parUser.has(j.user_id)) parUser.set(j.user_id, []);
      parUser.get(j.user_id)!.push(j);
    }

    const { data: profils } = parUser.size > 0
      ? await supabase.from("profiles")
          .select("id, email, lang, extension_last_seen_at")
          .in("id", [...parUser.keys()])
      : { data: [] as any[] };
    const profilParId = new Map<string, any>((profils ?? []).map((p: any) => [p.id, p]));

    // Dernière relance envoyée par utilisateur — une seule requête pour tout le
    // lot, pas une par compte. Alimente le délai de garde ci-dessous.
    const { data: dejaRelances } = parUser.size > 0
      ? await supabase.from("job_relaunch_log")
          .select("user_id, created_at")
          .eq("statut", "sent")
          .in("user_id", [...parUser.keys()])
      : { data: [] as any[] };
    const dernierMailPar = new Map<string, number>();
    for (const r of (dejaRelances ?? []) as any[]) {
      const ts = new Date(r.created_at).getTime();
      if (ts > (dernierMailPar.get(r.user_id) ?? 0)) dernierMailPar.set(r.user_id, ts);
    }

    const apercu: any[] = [];
    const cas3: any[] = [];
    const fileEnCours: any[] = [];
    const enAttente: any[] = [];
    const seuilFrais = t - RELANCE_EXT_FRAICHE_H * 3_600_000;
    const seuilCooldown = t - RELANCE_COOLDOWN_H * 3_600_000;

    // ── PREUVE DE TRAVAIL RÉCENT (2026-09-07) ───────────────────────────────
    // « L'extension a été vue » ne dit pas qu'elle est en panne sur CES jobs :
    // elle peut être en train d'écouler une file régulée. La preuve qu'elle
    // travaille, c'est une publication ABOUTIE dans les deux dernières heures.
    // Sans elle, « cas 3 = bug de notre côté » se déclenchait sur des comptes
    // qui publiaient très bien (claeys59450, 07/09 à 10:00 : 16 republications
    // réussies dont une à 10:19).
    const travailRecentPar = new Set<string>();
    if (parUser.size > 0) {
      const { data: recents } = await supabase
        .from("cross_post_jobs")
        .select("user_id")
        .in("user_id", [...parUser.keys()])
        .eq("status", "published")
        .gte("published_at", new Date(t - 2 * 3_600_000).toISOString());
      for (const r of (recents ?? []) as any[]) travailRecentPar.add(r.user_id as string);
    }

    for (const [userId, jobsUser] of parUser) {
      const prof = profilParId.get(userId);
      if (!prof?.email || estInterne(prof.email)) continue;

      const vue = prof.extension_last_seen_at
        ? new Date(prof.extension_last_seen_at).getTime() : null;

      // CAS 3 — l'extension tourne EN CE MOMENT et le job dort quand même.
      // Ce n'est pas un oubli de l'utilisateur mais un bug de notre côté : lui
      // écrire « allumez votre ordinateur » serait faux et le ferait passer
      // pour un idiot. On journalise (une ligne par job, jamais dupliquée) et
      // on ne réserve RIEN, pour que le job reparte normalement en cas 2 si
      // l'extension redevient muette.
      // L'extension a publié dans les 2 h : la file s'écoule, ce n'est ni un
      // oubli de l'utilisateur ni un bug de notre côté. On le NOTE (pour la
      // lecture du digest) et on ne réserve rien — le job repartira en cas 2
      // si l'extension redevient muette, ou s'écoulera tout seul.
      if (travailRecentPar.has(userId)) {
        fileEnCours.push({
          email: prof.email, jobs: jobsUser.length,
          extension_vue: prof.extension_last_seen_at ? dateParis(prof.extension_last_seen_at) : null,
          job_le_plus_vieux: dateParis(jobsUser[0].created_at),
        });
        continue;
      }

      if (vue !== null && vue >= seuilFrais) {
        if (!dryRun) {
          await supabase.from("job_relaunch_log").upsert(
            jobsUser.map((j) => ({
              job_id: j.id, user_id: userId, statut: "skipped_extension_active", cas: 3,
            })),
            { onConflict: "job_id,statut", ignoreDuplicates: true },
          );
        }
        console.warn("relance_cas3_extension_active", JSON.stringify({
          email: prof.email, jobs: jobsUser.length,
          extension_vue: dateParis(prof.extension_last_seen_at),
          job_le_plus_vieux: dateParis(jobsUser[0].created_at),
        }));
        cas3.push({
          email: prof.email, jobs: jobsUser.length,
          extension_vue: dateParis(prof.extension_last_seen_at),
        });
        continue;
      }

      // DÉLAI DE GARDE PAR UTILISATEUR. Placé APRÈS le cas 3 : un bug de notre
      // côté continue d'être journalisé même pendant la période de silence.
      // Les jobs ne sont PAS réservés ici — ils repartiront dans la relance
      // suivante, une fois le délai passé, et seront alors annoncés ensemble.
      const dernier = dernierMailPar.get(userId);
      if (dernier !== undefined && dernier > seuilCooldown) {
        enAttente.push({
          email: prof.email, jobs: jobsUser.length,
          derniere_relance: dateParis(new Date(dernier).toISOString()),
          rendez_vous: dateParis(
            new Date(dernier + RELANCE_COOLDOWN_H * 3_600_000).toISOString()),
        });
        continue;
      }

      const cas: 1 | 2 = vue === null ? 1 : 2;
      if (dryRun) {
        apercu.push({
          email: prof.email, cas, jobs: jobsUser.length,
          plateformes: [...new Set(jobsUser.map((j) => j.platform))].join(", "),
          plus_vieux: dateParis(jobsUser[0].created_at),
          extension_vue: prof.extension_last_seen_at
            ? dateParis(prof.extension_last_seen_at) : null,
          lang: prof.lang ?? "fr",
        });
        continue;
      }

      // RÉSERVATION AVANT ENVOI. ignoreDuplicates → ON CONFLICT DO NOTHING, et
      // .select() ne rend QUE les lignes réellement insérées : deux runs qui se
      // chevauchent ne peuvent pas réserver le même job, donc pas de double
      // mail. email_logs n'a aucune contrainte d'unicité, une dédup lue-puis-
      // écrite ne suffirait pas ici.
      const { data: claimes, error: claimErr } = await supabase
        .from("job_relaunch_log")
        .upsert(
          jobsUser.map((j) => ({ job_id: j.id, user_id: userId, statut: "sent", cas })),
          { onConflict: "job_id,statut", ignoreDuplicates: true },
        )
        .select("job_id");
      if (claimErr) {
        errors.push(`relance_claim:${prof.email}:${claimErr.message}`);
        continue;
      }

      const idsClaimes = (claimes ?? []).map((c: any) => c.job_id);
      const setClaimes = new Set(idsClaimes);
      const aAnnoncer = jobsUser.filter((j) => setClaimes.has(j.id));
      if (aAnnoncer.length === 0) continue; // tout était déjà relancé

      const lang = langue(prof.lang);
      const { sujet, html } = mailRelanceJobs(cas, {
        titres: [...new Set(aAnnoncer.map((j: any) => String(j.title ?? "").trim()).filter(Boolean))],
        plateformes: aAnnoncer.map((j: any) => j.platform),
        depuis: aAnnoncer[0].created_at,
        extensionVueLe: prof.extension_last_seen_at ?? null,
      }, lang);
      // 'support' : c'est une alerte sur le travail de la personne, pas une
      // campagne. La page d'opt-out le dit — « les emails liés à ton compte
      // (confirmations, alertes) continuent normalement ».
      // dedup 'journal' : la vraie réservation vit dans job_relaunch_log,
      // par JOB, et elle est déjà posée ci-dessus.
      const r = await envoyer({
        to: prof.email, subject: sujet, html,
        type: RELANCE_TYPE, userId, categorie: "support", dedup: "journal",
      });
      if (r.envoye) {
        sent.push(`${RELANCE_TYPE}:cas${cas}:${prof.email}`);
      } else {
        // Resend a refusé : on RELÂCHE la réservation pour retenter dans 1 h.
        await supabase.from("job_relaunch_log").delete()
          .eq("statut", "sent").in("job_id", idsClaimes);
        errors.push(`${RELANCE_TYPE}:${prof.email}`);
      }
    }

    return new Response(JSON.stringify({
      relance: RELANCE_TYPE, dry_run: dryRun, heure_paris: h,
      ventes,
      jobs_eligibles: jobs?.length ?? 0, utilisateurs: parUser.size,
      envoyes: sent.length, echecs: errors.length,
      cas3_bug_extension: cas3,
      // File qui s'écoule normalement (publication aboutie dans les 2 h) :
      // surtout PAS un bug. Séparé de cas3 depuis le 07/09.
      file_en_cours: fileEnCours,
      en_attente_cooldown: enAttente,
      apercu: dryRun ? apercu : undefined,
      sent, errors,
      log_echecs: logEchecs,
      resend_echecs: resendTrace.filter(
        (r) => (r.http as number) < 200 || (r.http as number) >= 300),
    }), { headers: { "Content-Type": "application/json" } });
  }

  // ── Load candidates ────────────────────────────────────────────────────────
  const { data: candidates, error: candidatesErr } = await supabase.rpc(
    "email_tunnel_candidates"
  );
  if (candidatesErr || !candidates) {
    return new Response(
      JSON.stringify({ error: candidatesErr?.message ?? "Failed to fetch candidates" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Date windows (UTC) ────────────────────────────────────────────────────
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const dayMinus1 = new Date(todayUTC.getTime() - 1 * 86_400_000);

  function registeredOn(createdAt: string, targetDay: Date): boolean {
    const d = new Date(createdAt);
    const dayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return dayUTC.getTime() === targetDay.getTime();
  }

  // Seuls les inscrits d'HIER (fenêtre UTC) sont concernés par les deux
  // triggers J+1 : filtrer AVANT de lire email_logs, pour que la dédup ne
  // porte que sur une poignée de comptes au lieu de toute la base.
  const ciblesJ1 = (candidates as any[]).filter((u) =>
    registeredOn(u.created_at, dayMinus1)
  );

  // ── Load existing logs to prevent duplicates ───────────────────────────────
  // Bug du 03/08 (37 welcomes en double du 01 au 03/08) : ce bloc lisait les
  // lignes de TOUS les candidats, sans pagination ni ORDER BY — or PostgREST
  // plafonne à 1000 lignes et la table en avait 1488. Les lignes 'welcome' de
  // la veille (les plus récentes) tombaient dans la tranche tronquée, le Set
  // les ignorait, et le cron RE-envoyait le welcome à tous les inscrits de la
  // veille. La branche blast_relaunch paginait déjà pour cette raison exacte.
  // Pagination conservée malgré la cible réduite : c'est elle, la garantie.
  const sentSet = new Set<string>();
  const idsCibles: string[] = [...new Set(ciblesJ1.map((c: any) => c.user_id as string))];
  if (idsCibles.length > 0) {
    const PAGE = 1000;
    for (let debut = 0; ; debut += PAGE) {
      const { data: page, error: pageErr } = await supabase
        .from("email_logs")
        .select("user_id, email_type")
        .in("user_id", idsCibles)
        .order("id")
        .range(debut, debut + PAGE - 1);
      // Échec fermé : une dédup illisible ne doit JAMAIS autoriser l'envoi.
      // L'ancien code ignorait l'erreur → Set vide → doublons pour tous.
      if (pageErr) {
        return new Response(
          JSON.stringify({ error: `email_logs: ${pageErr.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      for (const l of page ?? []) sentSet.add(`${(l as any).user_id}:${(l as any).email_type}`);
      if (!page || page.length < PAGE) break;
    }
  }
  const alreadySent = (uid: string, type: string) => sentSet.has(`${uid}:${type}`);

  // ── Trigger 1: J+1 welcome ────────────────────────────────────────────────
  // sentSet contient TOUTES les lignes email_logs des cibles, marketing_optout
  // compris : un désinscrit (One-Click sur un mail précédent) est sauté — la
  // promesse de l'en-tête List-Unsubscribe vaut aussi pour le tunnel.
  for (const user of ciblesJ1) {
    if (alreadySent(user.user_id, "welcome")) continue;
    if (alreadySent(user.user_id, "marketing_optout")) continue;
    const lang = langue(user.lang);
    const { sujet, html } = mailBienvenue(
      lang,
      await lienDesinscription(user.user_email, user.user_id).catch(() => ""),
    );
    const r = await envoyer({
      to: user.user_email, subject: sujet, html,
      type: "welcome", userId: user.user_id,
      categorie: "marketing", dedup: "reservation",
    });
    if (r.envoye) sent.push(`welcome:${user.user_email}`);
    else if (r.motif !== "deja_envoye" && r.motif !== "desinscrit") {
      errors.push(`welcome:${user.user_email}${r.motif ? ` (${r.motif})` : ""}`);
    }
  }

  // ── Trigger 2: J+1 « comment ça marche » (tous, même fenêtre que le welcome) ─
  // Dédup type 'how_it_works', distinct de 'welcome' : les deux coexistent le
  // même jour sans conflit. Aucune condition premium/non-premium.
  for (const user of ciblesJ1) {
    if (alreadySent(user.user_id, "how_it_works")) continue;
    if (alreadySent(user.user_id, "marketing_optout")) continue;
    const lang = langue(user.lang);
    const { sujet, html } = mailCommentCaMarche(
      lang,
      await lienDesinscription(user.user_email, user.user_id).catch(() => ""),
    );
    const r = await envoyer({
      to: user.user_email, subject: sujet, html,
      type: "how_it_works", userId: user.user_id,
      categorie: "marketing", dedup: "reservation",
    });
    if (r.envoye) sent.push(`how_it_works:${user.user_email}`);
    else if (r.motif !== "deja_envoye" && r.motif !== "desinscrit") {
      errors.push(`how_it_works:${user.user_email}${r.motif ? ` (${r.motif})` : ""}`);
    }
  }

  return new Response(JSON.stringify({ success: true, sent, errors, log_echecs: logEchecs }), {
    headers: { "Content-Type": "application/json" },
  });
});
