import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";
const FROM = "FillSell <support@fillsell.app>";
// Destinataire des alertes internes — même boîte que l'ops-digest.
const TO_OPS = "support@fillsell.app";
const LOGO_URL = "https://fillsell.app/logo.png";

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
const CWS_URL = "https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm";

const PLATEFORME_LABEL: Record<string, string> = {
  vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs",
};
const labelPlateforme = (p: string) => PLATEFORME_LABEL[p] ?? p;

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
function dateParis(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
function listeNaturelle(xs: string[], lang: string): string {
  const et = lang === "en" ? "and" : "et";
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${et} ${xs[xs.length - 1]}`;
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

// ── HTML Templates ─────────────────────────────────────────────────────────────

function emailHeader(): string {
  return `
  <div style="text-align:center;padding:32px 0 24px;">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <img src="${LOGO_URL}" width="40" height="40" alt="FillSell"
               style="display:block;border-radius:10px;">
        </td>
        <td style="vertical-align:middle;">
          <span class="brand-name"
                style="font-family:'Plus Jakarta Sans',sans-serif;font-style:italic;
                  font-weight:800;font-size:22px;color:#3EACA0;
                  background:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
                  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                  background-clip:text;">FillSell</span>
        </td>
      </tr>
    </table>
  </div>`;
}

function emailWrapper(content: string, lang: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@1,800&display=swap');
body{margin:0;padding:0;background:#F2F2EE;}
.brand-name{
  background:linear-gradient(135deg,#3EACA0 0%,#E8956D 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
a.cta:hover{background:#26b8a6!important;}
</style>
</head>
<body>
<div style="background:#F2F2EE;padding:16px 0 48px;">
  <div style="max-width:560px;margin:0 auto;padding:0 16px;">
    ${emailHeader()}
    <div style="background:#fff;border-radius:16px;padding:32px;
      box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      ${content}
    </div>
    <div style="text-align:center;padding:24px 0 0;
      font-size:12px;color:#9CA3AF;font-family:sans-serif;line-height:1.6;">
      FillSell ·
      <a href="https://fillsell.app" style="color:#9CA3AF;text-decoration:none;">
        fillsell.app
      </a>
    </div>
  </div>
</div>
</body>
</html>`;
}

function ctaButton(label: string): string {
  return `
  <a href="https://fillsell.app" class="cta"
     style="display:block;text-align:center;background:#2DD4BF;
       color:#fff;font-weight:800;font-size:15px;padding:14px 24px;
       border-radius:12px;text-decoration:none;font-family:sans-serif;
       margin-top:4px;">
    ${label}
  </a>`;
}

function welcomeHtml(lang: string): string {
  const isFr = lang !== "en";
  // ── Refonte 2026-08-07 (texte Nico, mot pour mot) ──────────────────────────
  // L'ancien mail promettait « publie automatiquement […] en quelques
  // secondes » et « Gagnez et dépensez des Pépites à chaque action » — périmé
  // et faux. Le nouveau parle sync du dressing, republication, et du contrat
  // Pépites réel (coût affiché avant validation). AUCUN montant en dur (ni
  // prix d'abonnement, ni coût d'action) — la grille vit dans l'app, comme
  // dans les CGV. Seule exception, assumée par Nico : « 50 Pépites
  // offertes » (grille 2026-08-08), le grant d'inscription, affiché aussi
  // sur la landing.
  // Gabarit inchangé : blocs verts, rangée de logos, encart ambre
  // « ordinateur », visuel Pépites, CTA — le design n'est pas refait.
  const logosRow = `
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation"
        style="background:#F0FDF9;border-radius:12px;margin:0 0 18px;">
        <tr><td align="center" style="padding:16px 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-vinted.png" width="54" height="54" alt="Vinted" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-leboncoin.png" width="54" height="54" alt="Leboncoin" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-ebay.png" width="54" height="54" alt="eBay" style="display:block;"></td>
            <td style="padding:0 7px;"><img src="https://fillsell.app/email/logo-beebs.png" width="54" height="54" alt="Beebs" style="display:block;"></td>
          </tr></table>
        </td></tr>
      </table>`;
  const bloc = (titre: string, corps: string, marge = "0 0 16px") => `
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:${marge};">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">${titre}</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">${corps}</p>
    </div>`;
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Bienvenue sur FillSell&nbsp;! 🎉
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">Salut,</p>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      FillSell te fait gagner du temps sur la revente&nbsp;: tu ajoutes un article une
      fois, et il part sur Vinted, Leboncoin, eBay et Beebs sans que tu remplisses
      quatre formulaires.
    </p>
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Trois choses à connaître pour démarrer</p>
    ${bloc("1. Récupère ton dressing Vinted en un clic",
      "Si tu vends déjà sur Vinted, FillSell importe toutes tes annonces — titres, prix, photos, vues et favoris. C'est gratuit et ça ne coûte aucune Pépite. Tu retrouves tout ton stock au même endroit, sans ressaisie.")}
    ${bloc("2. Republie les annonces qui dorment",
      "Sur Vinted, une annonce ancienne ne se voit presque plus. D'un clic, FillSell sauvegarde la fiche, retire l'annonce et la remet en ligne à l'identique — tu peux même baisser le prix au passage. 1 Pépite par annonce, et automatisable avec Pro.")}
    ${bloc("3. Publie partout d'un seul geste",
      "Ajoute un article à la voix ou par photo, FillSell rédige le titre, la description et suggère un prix, puis publie sur les plateformes que tu choisis.", "0 0 24px")}
    <div style="border:1px solid #CFF0EA;border-radius:12px;padding:22px;margin:0 0 24px;background:#FBFFFE;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:800;letter-spacing:-0.01em;
        color:#111827;font-family:sans-serif;">
        🧩 Ce qu'il te faut&nbsp;: l'extension Chrome
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.65;margin:0 0 18px;
        font-family:sans-serif;">
        Elle s'installe une seule fois sur un ordinateur, en une minute. C'est elle qui
        publie à ta place, en utilisant les sessions de tes comptes déjà connectés dans
        ton navigateur — elle ne se connecte jamais à ta place, tu gardes la main. Une
        fois installée, tu pilotes tout depuis ton téléphone.
      </p>
      ${logosRow}
      <div style="background:#FEF3C7;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
        <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;font-family:sans-serif;">
          ⚠️ L'extension s'installe sur ordinateur (pas sur mobile). Si tu lis cet email
          sur ton téléphone, garde-le de côté et reviens-y depuis ton ordinateur.
        </p>
      </div>
      <a href="https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm" class="cta"
         style="display:block;text-align:center;background:#2DD4BF;color:#fff;
           font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;
           text-decoration:none;font-family:sans-serif;margin:0 0 14px;">
        Installer l'extension
      </a>
      <p style="margin:0;font-style:italic;font-size:12px;color:#9CA3AF;line-height:1.6;
        font-family:sans-serif;">
        Disponible sur le Chrome Web Store&nbsp;: un clic pour l'installer, et elle se met à
        jour automatiquement à chaque nouvelle version.
      </p>
    </div>
    <!-- Bascule quotas (02/09) : plus de Pépites — le mail dit ce que le
         forfait gratuit PERMET, en gestes réels (mêmes mots que l'app). -->
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">
        🎁 Ce qui est inclus pour démarrer
      </p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        Chaque mois, tu peux créer des annonces avec l'IA et les publier sur les
        4 plateformes, lancer des analyses Lens, et tu démarres avec des
        republications Vinted offertes. Les compteurs sont visibles dans
        l'app&nbsp;— rien ne se consomme sans que tu le voies.
      </p>
    </div>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">
      Des questions&nbsp;? Réponds directement à ce mail, je lis tout.
    </p>
    <p style="color:#111827;font-size:15px;line-height:1.5;margin:0 0 24px;
      font-family:sans-serif;font-weight:700;">
      Nico<br><span style="font-weight:500;color:#6B7280;font-size:13px;">FillSell</span>
    </p>
    ${ctaButton("Ouvrir FillSell")}` : `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Welcome to FillSell! 🎉
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">Hi,</p>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      FillSell saves you time on reselling: you add an item once, and it goes to Vinted,
      Leboncoin, eBay and Beebs without you filling out four forms.
    </p>
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;
      letter-spacing:0.07em;color:#9CA3AF;font-family:sans-serif;">Three things to know to get started</p>
    ${bloc("1. Bring in your Vinted closet in one click",
      "If you already sell on Vinted, FillSell imports all your listings — titles, prices, photos, views and favourites. It's free and costs no Nuggets. Your whole stock in one place, nothing to retype.")}
    ${bloc("2. Repost the listings that sleep",
      "On Vinted, an old listing barely gets seen. In one click, FillSell saves the listing, removes it and puts it back online identically — you can even lower the price along the way. 1 Nugget per listing, and automatable with Pro.")}
    ${bloc("3. List everywhere in a single move",
      "Add an item by voice or photo, FillSell writes the title and description and suggests a price, then lists on the platforms you choose.", "0 0 24px")}
    <div style="border:1px solid #CFF0EA;border-radius:12px;padding:22px;margin:0 0 24px;background:#FBFFFE;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:800;letter-spacing:-0.01em;
        color:#111827;font-family:sans-serif;">
        🧩 What you need: the Chrome extension
      </h2>
      <p style="color:#6B7280;font-size:14px;line-height:1.65;margin:0 0 18px;
        font-family:sans-serif;">
        It installs once on a computer, in a minute. It does the listing for you, using
        the sessions of your accounts already signed in in your browser — it never signs
        in on your behalf, you stay in control. Once installed, you drive everything
        from your phone.
      </p>
      ${logosRow}
      <div style="background:#FEF3C7;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
        <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;font-family:sans-serif;">
          ⚠️ The extension installs on a computer (not on mobile). If you're reading this
          email on your phone, set it aside and come back from your computer.
        </p>
      </div>
      <a href="https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm" class="cta"
         style="display:block;text-align:center;background:#2DD4BF;color:#fff;
           font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;
           text-decoration:none;font-family:sans-serif;margin:0 0 14px;">
        Install the extension
      </a>
      <p style="margin:0;font-style:italic;font-size:12px;color:#9CA3AF;line-height:1.6;
        font-family:sans-serif;">
        Available on the Chrome Web Store: one click to install, and it updates itself
        with every new version.
      </p>
    </div>
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">
        <img src="https://fillsell.app/email/pepite.png" width="16" height="16" alt="Nuggets" style="display:inline-block;vertical-align:-3px;"> Your Nuggets
      </p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">
        You start with 50 free Nuggets, and you receive more every month. They power the
        actions where the AI works for you: photo retouching, listing writing,
        publishing. The app always shows you the cost before you confirm — nothing is
        charged without you seeing it.
      </p>
    </div>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">
      Questions? Reply directly to this email, I read everything.
    </p>
    <p style="color:#111827;font-size:15px;line-height:1.5;margin:0 0 24px;
      font-family:sans-serif;font-weight:700;">
      Nico<br><span style="font-weight:500;color:#6B7280;font-size:13px;">FillSell</span>
    </p>
    ${ctaButton("Open FillSell")}`;
  return emailWrapper(content, lang);
}

function howItWorksHtml(lang: string): string {
  const isFr = lang !== "en";
  // ── Refonte 2026-08-07 (texte Nico, valeurs VÉRIFIÉES dans le code) ────────
  // poll 2 min (config.js POLL_INTERVAL_MINUTES) ; vérification de vente
  // toutes les 2 h par annonce (SALE_CHECK_MIN_INTERVAL_MS, 8 annonces max
  // par cycle) ; délai de grâce 2 h uniforme (PUBLISH_GRACE_MS) ; sync cron
  // 1×/24 h (SYNC_DRESSING_ALARM) ; republication : pauses volontaires
  // 2-5 min et une republication aboutie par article et par 24 h. Le texte
  // n'affiche AUCUN chiffre technique — « régulièrement », « une fois par
  // jour », « quelques minutes » : tous vrais au relevé du 07/08.
  const bloc = (titre: string, corps: string, marge = "0 0 16px") => `
    <div style="background:#F0FDF9;border-radius:12px;padding:20px;margin:${marge};">
      <p style="margin:0 0 8px;font-weight:800;font-size:15px;color:#111827;font-family:sans-serif;">${titre}</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.65;font-family:sans-serif;">${corps}</p>
    </div>`;
  const content = isFr ? `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      Comment FillSell travaille pour toi 🔍
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">Salut,</p>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Voilà ce que FillSell fait en arrière-plan, sans que tu aies à y penser.
    </p>
    ${bloc("⏱️ Il publie pour toi",
      "Quand tu demandes une publication, l'extension s'en charge dans une fenêtre discrète, sans jamais te voler le focus. Elle espace volontairement ses gestes de quelques secondes à quelques minutes : on travaille au rythme d'un humain, jamais à celui d'un robot. Une publication prend donc quelques minutes par plateforme, c'est normal.")}
    ${bloc("🔄 Il surveille tes ventes",
      "FillSell repasse régulièrement sur tes annonces pour voir si elles sont toujours en ligne. Quand un article se vend quelque part, il te le signale et retire les annonces correspondantes sur les autres plateformes — pour que tu ne vendes jamais deux fois le même objet. Aucune vente n'est enregistrée sans que tu la confirmes.")}
    ${bloc("🧥 Il garde ton dressing Vinted à jour",
      "Une fois ta première synchronisation lancée, FillSell rafraîchit ton dressing une fois par jour : nouvelles annonces, prix, vues, favoris. Tu peux aussi la relancer à la main quand tu veux, depuis ton téléphone.")}
    ${bloc("🔁 Et il republie",
      "Les annonces qui dorment peuvent repartir en ligne d'un clic, avec les mêmes photos et la même fiche. Là aussi, FillSell prend son temps entre chaque geste — c'est ce qui protège ton compte.", "0 0 24px")}
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">
      Une question&nbsp;? Réponds à ce mail.
    </p>
    <p style="color:#111827;font-size:15px;line-height:1.5;margin:0 0 24px;
      font-family:sans-serif;font-weight:700;">
      Nico<br><span style="font-weight:500;color:#6B7280;font-size:13px;">FillSell</span>
    </p>
    ${ctaButton("Voir mon stock")}` : `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      How FillSell works for you 🔍
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">Hi,</p>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      Here's what FillSell does in the background, without you having to think about it.
    </p>
    ${bloc("⏱️ It lists for you",
      "When you request a listing, the extension handles it in a discreet window, without ever stealing your focus. It deliberately spaces its actions from a few seconds to a few minutes: we work at a human's pace, never a robot's. A listing therefore takes a few minutes per platform — that's normal.")}
    ${bloc("🔄 It watches your sales",
      "FillSell regularly revisits your listings to see whether they're still online. When an item sells somewhere, it lets you know and removes the matching listings on the other platforms — so you never sell the same object twice. No sale is recorded without your confirmation.")}
    ${bloc("🧥 It keeps your Vinted closet up to date",
      "Once your first sync has run, FillSell refreshes your closet once a day: new listings, prices, views, favourites. You can also run it manually whenever you want, from your phone.")}
    ${bloc("🔁 And it reposts",
      "Listings that sleep can go back online in one click, with the same photos and the same details. There too, FillSell takes its time between each action — that's what protects your account.", "0 0 24px")}
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">
      A question? Reply to this email.
    </p>
    <p style="color:#111827;font-size:15px;line-height:1.5;margin:0 0 24px;
      font-family:sans-serif;font-weight:700;">
      Nico<br><span style="font-weight:500;color:#6B7280;font-size:13px;">FillSell</span>
    </p>
    ${ctaButton("View my stock")}`;
  return emailWrapper(content, lang);
}

// ── Relance d'un job jamais pris en charge par l'extension ───────────────────
// Deux messages, deux causes distinctes, JAMAIS interchangeables :
//   cas 1 — extension_last_seen_at NULL : elle n'a jamais tourné sur ce compte.
//   cas 2 — vue, mais pas depuis > 2 h : installée, simplement à l'arrêt.
// Le cas 3 (extension active ET job dormant) ne produit AUCUN mail : c'est un
// bug de notre côté, cf. la branche job_relaunch.
//
// Promesse « vous n'avez rien à refaire » — VÉRIFIÉE dans le code le
// 2026-08-01, pas supposée : get-pending-jobs ne filtre les jobs QUE sur
// status et platform_health.paused (aucun filtre d'âge), et
// pollAndProcessJobsUnlocked traite la totalité de ce qu'il reçoit, sans
// plafond. Un job de 5 jours repart donc au premier poll qui suit la
// connexion de l'extension. Ne pas écrire cette promesse ailleurs sans
// revérifier ces deux fichiers.
function relanceHtml(
  cas: 1 | 2,
  jobs: Array<{ platform: string; title: string | null; created_at: string }>,
  extensionVueLe: string | null,
  lang: string,
): { sujet: string; html: string } {
  const isFr = lang !== "en";
  const esc = (v: unknown) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const plateformes = listeNaturelle(
    [...new Set(jobs.map((j) => labelPlateforme(j.platform)))], lang,
  );
  const titres = [...new Set(jobs.map((j) => (j.title ?? "").trim()).filter(Boolean))];
  const troisTitres = titres.slice(0, 3).map((t) => `«&nbsp;${esc(t)}&nbsp;»`);
  const reste = titres.length - troisTitres.length;
  const articles = titres.length === 0
    ? (isFr ? "votre annonce" : "your listing")
    : listeNaturelle(
        reste > 0
          ? [...troisTitres, isFr ? `${reste} autre${reste > 1 ? "s" : ""}` : `${reste} more`]
          : troisTitres,
        lang,
      );
  const multi = titres.length > 1;
  const depuis = dateParis(jobs[0].created_at);

  const p = "color:#374151;font-size:15px;line-height:1.7;margin:0 0 18px;font-family:sans-serif;";
  const h1 = "margin:0 0 14px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#111827;font-family:sans-serif;";
  const encadre = "background:#F0FDF9;border-radius:12px;padding:20px;margin:0 0 20px;";
  const titreEncadre = "margin:0 0 10px;font-weight:700;font-size:14px;color:#065F46;font-family:sans-serif;";
  const liste = "margin:0;padding:0 0 0 20px;color:#374151;font-size:14px;line-height:1.8;font-family:sans-serif;";
  const signature = `
    <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #E5E7EB;color:#6B7280;
      font-size:14px;line-height:1.6;font-family:sans-serif;">
      ${isFr
        ? "Un blocage, une question ? Répondez à ce mail, je lis tout."
        : "Stuck, or a question? Just reply to this email, I read everything."}
      <br><strong style="color:#111827;">Nico</strong>
    </p>`;

  if (cas === 1) {
    const content = isFr ? `
    <h1 style="${h1}">Votre publication est en attente</h1>
    <p style="${p}">
      Vous avez préparé ${articles} pour ${plateformes} le ${depuis}.
      ${multi ? "Vos annonces sont prêtes" : "L'annonce est prête"}, avec
      ${multi ? "leurs" : "ses"} photos, ${multi ? "leurs titres" : "son titre"} et
      ${multi ? "leurs prix" : "son prix"}. Mais
      ${multi ? "elles ne sont encore parties" : "elle n'est encore partie"} nulle part.
    </p>
    <p style="${p}">
      La raison est simple : sur FillSell, ce n'est pas le site qui publie, c'est l'extension
      Chrome. Elle remplit les formulaires à votre place sur chaque plateforme. Or elle n'a
      jamais été lancée sur votre compte — donc personne n'est venu chercher
      ${multi ? "vos annonces" : "votre annonce"}.
    </p>
    <div style="${encadre}">
      <p style="${titreEncadre}">L'installer prend deux minutes :</p>
      <ol style="${liste}">
        <li>Depuis un ordinateur, ajoutez l'extension en un clic depuis le
          <a href="${CWS_URL}" style="color:#0F9488;font-weight:600;text-decoration:none;">Chrome Web Store</a>.</li>
        <li>Cliquez sur l'icône FillSell, puis «&nbsp;Se connecter&nbsp;» : elle récupère votre
          session fillsell.app toute seule.</li>
        <li>Vérifiez que vous êtes connecté à vos comptes ${plateformes} dans CE navigateur.
          L'extension s'appuie sur ces sessions pour publier en votre nom — elle ne se connecte
          jamais à votre place, vous gardez la main.</li>
      </ol>
    </div>
    <div style="background:#FEF3C7;border-radius:12px;padding:14px 16px;margin:0 0 22px;">
      <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;font-family:sans-serif;">
        ⚠️ L'extension fonctionne sur ordinateur uniquement, pas sur mobile. Si vous lisez ce
        mail sur votre téléphone, gardez-le de côté pour votre prochain passage devant un
        ordinateur.
      </p>
    </div>
    <a href="${CWS_URL}" class="cta"
       style="display:block;text-align:center;background:#2DD4BF;color:#fff;font-weight:800;
         font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;
         font-family:sans-serif;margin:0 0 20px;">
      Installer l'extension
    </a>
    <p style="${p}">
      ${multi ? "Vos annonces ne sont pas perdues" : "Votre annonce n'est pas perdue"} et vous
      n'avez rien à refaire : dès que l'extension est installée et connectée,
      ${multi ? "elles partent" : "elle part"} automatiquement.
    </p>${signature}` : `
    <h1 style="${h1}">Your listing is on hold</h1>
    <p style="${p}">
      You prepared ${articles} for ${plateformes} on ${depuis}.
      ${multi ? "The listings are ready" : "The listing is ready"}, with photos, title and
      price. But ${multi ? "they haven't" : "it hasn't"} gone anywhere yet.
    </p>
    <p style="${p}">
      Here's why: on FillSell, the website doesn't do the listing — the Chrome extension does.
      It fills in the forms for you on each platform. And it has never run on your account, so
      nobody came to pick up your work.
    </p>
    <div style="${encadre}">
      <p style="${titreEncadre}">Installing it takes two minutes:</p>
      <ol style="${liste}">
        <li>From a computer, add the extension in one click from the
          <a href="${CWS_URL}" style="color:#0F9488;font-weight:600;text-decoration:none;">Chrome Web Store</a>.</li>
        <li>Click the FillSell icon, then «&nbsp;Sign in&nbsp;»: it picks up your fillsell.app
          session on its own.</li>
        <li>Make sure you're logged in to your ${plateformes} accounts in THAT browser. The
          extension relies on those sessions to list on your behalf — it never logs in for you,
          you stay in control.</li>
      </ol>
    </div>
    <div style="background:#FEF3C7;border-radius:12px;padding:14px 16px;margin:0 0 22px;">
      <p style="margin:0;color:#92400E;font-size:13px;line-height:1.6;font-family:sans-serif;">
        ⚠️ The extension only works on a computer, not on mobile. If you're reading this on your
        phone, keep it aside for your next time at a computer.
      </p>
    </div>
    <a href="${CWS_URL}" class="cta"
       style="display:block;text-align:center;background:#2DD4BF;color:#fff;font-weight:800;
         font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;
         font-family:sans-serif;margin:0 0 20px;">
      Install the extension
    </a>
    <p style="${p}">
      Nothing is lost and there's nothing to redo: as soon as the extension is installed and
      signed in, ${multi ? "they go" : "it goes"} out automatically.
    </p>${signature}`;
    return {
      sujet: isFr
        ? "Votre annonce est prête — il ne manque que l'extension"
        : "Your listing is ready — the extension is all that's missing",
      html: emailWrapper(content, lang),
    };
  }

  const vue = extensionVueLe ? dateParis(extensionVueLe) : null;
  const content = isFr ? `
    <h1 style="${h1}">Votre publication est en pause</h1>
    <p style="${p}">
      ${articles} ${multi ? "attendent" : "attend"} de partir sur ${plateformes} depuis
      le ${depuis}.
    </p>
    <p style="${p}">
      Bonne nouvelle : il n'y a rien à réinstaller. Votre extension FillSell est bien en
      place${vue ? `, je l'ai vue pour la dernière fois le ${vue}` : ""}. Elle ne tourne
      simplement pas en ce moment — et comme c'est elle qui publie à votre place,
      ${multi ? "vos annonces patientent" : "votre annonce patiente"}.
    </p>
    <div style="${encadre}">
      <p style="${titreEncadre}">Pour qu'elle reparte :</p>
      <ul style="${liste}">
        <li>L'ordinateur sur lequel l'extension est installée doit être allumé.</li>
        <li>Chrome doit être ouvert (une seule fenêtre suffit, même réduite).</li>
        <li>Vous devez rester connecté à vos comptes ${plateformes} dans ce navigateur.</li>
      </ul>
    </div>
    <p style="${p}">
      C'est tout. La publication reprend toute seule, en arrière-plan, sans que vous ayez à
      recliquer sur «&nbsp;Publier&nbsp;» ni à retoucher
      ${multi ? "vos annonces" : "votre annonce"}.
    </p>
    ${ctaButton("Ouvrir FillSell")}
    <p style="margin:20px 0 0;color:#6B7280;font-size:14px;line-height:1.65;font-family:sans-serif;">
      Si votre ordinateur est bien allumé avec Chrome ouvert et que rien ne bouge dans l'heure,
      répondez à ce mail : c'est alors de mon côté qu'il y a quelque chose à corriger.
    </p>${signature}` : `
    <h1 style="${h1}">Your listing is paused</h1>
    <p style="${p}">
      ${articles} ${multi ? "have been waiting" : "has been waiting"} to go out on
      ${plateformes} since ${depuis}.
    </p>
    <p style="${p}">
      Good news: there's nothing to reinstall. Your FillSell extension is in
      place${vue ? `, I last saw it on ${vue}` : ""}. It simply isn't running right now — and
      since it's the one doing the listing for you, your work is waiting.
    </p>
    <div style="${encadre}">
      <p style="${titreEncadre}">To get it going again:</p>
      <ul style="${liste}">
        <li>The computer where the extension is installed must be switched on.</li>
        <li>Chrome must be open (a single window is enough, even minimised).</li>
        <li>You must stay logged in to your ${plateformes} accounts in that browser.</li>
      </ul>
    </div>
    <p style="${p}">
      That's all. Listing resumes on its own, in the background, without you clicking
      «&nbsp;Publish&nbsp;» again or touching anything.
    </p>
    ${ctaButton("Open FillSell")}
    <p style="margin:20px 0 0;color:#6B7280;font-size:14px;line-height:1.65;font-family:sans-serif;">
      If your computer is on with Chrome open and nothing moves within the hour, reply to this
      email: that would mean something is broken on my side.
    </p>${signature}`;
  return {
    sujet: isFr
      ? "Votre publication repartira dès que Chrome sera ouvert"
      : "Your listing will resume as soon as Chrome is open",
    html: emailWrapper(content, lang),
  };
}

// ── Blast de relance août 2026 ────────────────────────────────────────────────
// Cible : les inscrits qui ont reçu l'ANCIEN welcome (avant la refonte du
// 2026-07-23, commit db3166d). Cet ancien mail annonçait « Vinted, eBay et
// Depop » et ne mentionnait pas l'extension Chrome : ces comptes ont une image
// fausse du produit. Ce template leur redit ce qu'est FillSell aujourd'hui.
//
// Volontairement HORS emailWrapper() : c'est un document autonome, validé tel
// quel, avec son propre design system (canvas #EDEAE0, paper #F6F5F1, ink
// #10201B, teal #2F9E90/#1B6E62, amber #E8956D). Tables + styles inline
// uniquement, aucune classe ni balise <style> — compatibilité Gmail/Outlook.
// Ne pas le « ramener » vers le wrapper des mails du tunnel.
//
// Les 4 logos sont les MÊMES assets que welcomeHtml (public/email/*.png servis
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
<p style="margin:0 0 20px 0; font-family:'Space Grotesk',Helvetica,Arial,sans-serif; font-size:16px; line-height:1.6; color:#10201B;">Ton compte est toujours actif, et tes pépites t'attendent.</p>
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
${etape("01", "Tu importes ton dressing Vinted dans FillSell", "Un clic, gratuit, aucune Pépite. Titres, prix, photos, vues et favoris remontent tout seuls.", false,
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

// ── Paiement échoué : template client (2026-08-07) ───────────────────────────
// AUCUN montant (règle CGV : la grille vit dans l'app), la CAUSE en clair —
// « 3D Secure non validé » n'est pas « carte refusée », et pour le client ça
// change tout. Le contexte pilote la gravité : une souscription échouée n'a
// rien débité ni rien activé ; un renouvellement échoué laisse l'abonnement
// ACTIF pendant que Stripe retente (dunning) — le mail le dit pour ne pas
// affoler, et donne le geste utile. Transactionnel pur : pas d'en-tête
// List-Unsubscribe, pas d'exclusion marketing_optout — un client qui a tenté
// de payer doit être prévenu, opt-out marketing ou pas.
function paymentFailedHtml(lang: string, cause: string, contexte: string): string {
  const isFr = lang !== "en";
  const causesFr: Record<string, string> = {
    "3ds": "Ta banque attendait une validation 3D Secure (l'écran de confirmation de ta banque) qui n'est pas arrivée au bout. Rien n'a été débité.",
    carte_refusee: "Ta banque a refusé le paiement. Rien n'a été débité — vérifie le plafond ou le solde de ta carte, ou essaie avec une autre carte.",
    carte_expiree: "La carte enregistrée est expirée. Rien n'a été débité.",
    autre: "Le paiement n'a pas pu aboutir. Rien n'a été débité.",
  };
  const causesEn: Record<string, string> = {
    "3ds": "Your bank was waiting for a 3D Secure confirmation (your bank's approval screen) that never completed. Nothing was charged.",
    carte_refusee: "Your bank declined the payment. Nothing was charged — check your card's limit or balance, or try another card.",
    carte_expiree: "The card on file has expired. Nothing was charged.",
    autre: "The payment couldn't be completed. Nothing was charged.",
  };
  const corpsCause = (isFr ? causesFr : causesEn)[cause] ?? (isFr ? causesFr.autre : causesEn.autre);
  const corpsContexte = contexte === "renouvellement"
    ? (isFr
      ? "Ton abonnement reste actif pour l'instant : le paiement va être retenté automatiquement dans les prochains jours. Pour ne pas le voir s'interrompre, mets à jour ton moyen de paiement — ou réponds simplement à ce mail et on règle ça ensemble."
      : "Your subscription stays active for now: the payment will be retried automatically over the next few days. To avoid an interruption, update your payment method — or simply reply to this email and we'll sort it out together.")
    : (isFr
      ? "Ton abonnement n'a pas démarré — tu peux réessayer quand tu veux depuis l'app, ça prend une minute. Si ça bloque encore, réponds à ce mail et on regarde ensemble."
      : "Your subscription didn't start — you can try again anytime from the app, it takes a minute. If it still fails, reply to this email and we'll look into it together.");
  const content = `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:-0.02em;
      color:#111827;font-family:sans-serif;">
      ${isFr ? "Ton paiement n'a pas abouti" : "Your payment didn't go through"}
    </h1>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 6px;
      font-family:sans-serif;">${isFr ? "Salut," : "Hi,"}</p>
    <p style="color:#6B7280;font-size:15px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">
      ${isFr ? "Tu as tenté de t'abonner à FillSell et le paiement s'est arrêté en route. Voilà ce qui s'est passé, et comment le refaire." : "You tried to subscribe to FillSell and the payment stopped along the way. Here's what happened, and how to redo it."}
    </p>
    <div style="background:#FEF3C7;border-radius:12px;padding:16px 18px;margin:0 0 16px;">
      <p style="margin:0;color:#92400E;font-size:14px;line-height:1.65;font-family:sans-serif;">${corpsCause}</p>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.65;margin:0 0 24px;
      font-family:sans-serif;">${corpsContexte}</p>
    ${ctaButton(isFr ? "Réessayer depuis FillSell" : "Try again from FillSell")}
    <p style="color:#111827;font-size:15px;line-height:1.5;margin:24px 0 0;
      font-family:sans-serif;font-weight:700;">
      Nico<br><span style="font-weight:500;color:#6B7280;font-size:13px;">FillSell</span>
    </p>`;
  return emailWrapper(content, lang);
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }

  // ── Désabonnement marketing (2026-08-07) — AVANT le secret cron ───────────
  // Cible des en-têtes List-Unsubscribe / List-Unsubscribe-Post (One-Click,
  // RFC 8058) posés sur les blasts : Gmail POST ici sans aucun secret quand
  // l'utilisateur clique « Se désabonner ». Le jeton est l'user_id (UUID non
  // devinable) ; l'opt-out est journalisé dans email_logs sous le type
  // RÉCURRENT 'marketing_optout' (plusieurs clics = plusieurs lignes,
  // légitime → SURTOUT PAS dans l'index one-shot, cf. règle CLAUDE.md).
  // Toute FUTURE branche de blast doit exclure ces user_id de sa cible —
  // blast_sync_dressing le fait. Toujours 200, même sur jeton illisible :
  // un désabonnement ne doit jamais « échouer » côté client mail.
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
          const { error } = await admin.from("email_logs")
            .insert({ user_id: unsubToken, email_type: "marketing_optout" });
          if (error) console.error("marketing_optout_insert_echec", unsubToken, error.message);
          else console.log("marketing_optout", unsubToken);
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

  // Trace des retours Resend. sendEmail ne rendait que `res.ok` et jetait le
  // corps : un mail accepté puis jamais délivré était indiscernable d'un
  // succès, et on n'avait même pas l'id pour aller vérifier chez Resend.
  // Diagnostic du 2026-08-01 : la fonction répondait « sent », le mail
  // n'arrivait pas, et ni la réponse ni les logs ne disaient pourquoi.
  const resendTrace: Array<Record<string, unknown>> = [];

  async function sendEmail(to: string, subject: string, html: string, mailHeaders?: Record<string, string>): Promise<boolean> {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: FROM, to: [to], subject, html,
          ...(mailHeaders ? { headers: mailHeaders } : {}),
        }),
      });
      const brut = await res.text();
      let corps: unknown = brut;
      try {
        corps = JSON.parse(brut);
      } catch {
        /* Resend a répondu autre chose que du JSON : on garde le texte brut */
      }
      const detail = corps && typeof corps === "object" ? corps as Record<string, unknown> : { corps };
      resendTrace.push({ to, http: res.status, ...detail });
      if (!res.ok) console.error("resend_echec", JSON.stringify({ to, http: res.status, ...detail }));
      return res.ok;
    } catch (e) {
      resendTrace.push({ to, http: 0, erreur: String(e) });
      console.error("resend_exception", to, String(e));
      return false;
    }
  }

  // ── Écriture email_logs : jamais bloquante, jamais silencieuse ────────────
  // Un insert raté ne doit JAMAIS faire échouer l'envoi ni le run : le mail
  // est déjà parti, re-jeter ici provoquerait un renvoi. Mais il ne doit plus
  // être muet non plus — c'est ce silence qui a laissé 180 doublons 'welcome'
  // s'accumuler sans alerte (corrigé le 03/08), et qui masquerait un type
  // one-shot oublié dans l'index email_logs_one_shot_unique (une violation
  // 23505 ici = un doublon d'envoi vient d'être tenté : c'est PRÉCISÉMENT
  // l'alarme qu'on veut lire). Chaque échec part en console.error (logs de la
  // fonction), dans log_echecs (réponse de chaque branche) ET dans le journal
  // email_log_echecs — le SEUL canal avec un lecteur : la réponse HTTP part
  // vers pg_net qui la jette, les logs ne sont consultés qu'a posteriori,
  // mais l'ops-digest de 8h50 interroge le journal chaque matin sur 24 h.
  const logEchecs: string[] = [];
  async function logEmail(userId: string, emailType: string): Promise<void> {
    const { error } = await supabase
      .from("email_logs")
      .insert({ user_id: userId, email_type: emailType });
    if (error) {
      console.error("email_logs_insert_echec", JSON.stringify({
        user_id: userId, email_type: emailType, erreur: error.message,
      }));
      logEchecs.push(`${emailType}:${userId}:${error.message}`);
      const { error: journalErr } = await supabase.from("email_log_echecs").insert({
        user_id: userId,
        email_type: emailType,
        code: (error as { code?: string }).code ?? null,
        erreur: error.message,
      });
      // Échec du journal lui-même : console.error seulement — jamais de
      // throw, un échec de log ne doit ni casser le run ni renvoyer un mail.
      if (journalErr) console.error("email_log_echecs_insert_echec", journalErr.message);
    }
  }

  // ── En-têtes de désabonnement (RFC 8058, One-Click) — PARTAGÉS ────────────
  // Hissés au niveau du handler (2026-08-07 soir) : posés d'abord sur le
  // blast sync, ils accompagnent désormais AUSSI le tunnel (welcome + comment
  // ça marche), consigne Nico. L'URL porte le user_id du destinataire ;
  // l'endpoint ?unsub= (plus haut, avant le secret cron) journalise l'opt-out
  // en email_logs type récurrent 'marketing_optout' — que le tunnel comme les
  // blasts EXCLUENT de leurs envois.
  const unsubHeaders = (userId: string): Record<string, string> => ({
    "List-Unsubscribe":
      `<${Deno.env.get("SUPABASE_URL")}/functions/v1/email-tunnel?unsub=${userId}>, ` +
      `<mailto:support@fillsell.app?subject=STOP>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });

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
      ["Pépites créditées", a.pepites ?? "—"],
      ["Référence transaction", a.ref ?? "—"],
      ["Retour RPC", a.rpc == null ? "—" : JSON.stringify(a.rpc)],
    ];
    const esc = (v: unknown) =>
      String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 6px;font-size:18px;font-family:sans-serif;color:${ok ? "#111827" : "#B91C1C"};">
      ${ok ? "💰 Paiement reçu" : "🚨 PAIEMENT NON CRÉDITÉ"}
    </h1>
    <p style="margin:0 0 14px;font-size:12px;font-family:sans-serif;color:#9CA3AF;">
      ${esc(new Date().toISOString())}${ok ? "" : " — le client a payé, la Pépite n'est pas arrivée. Créditer à la main."}
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
    const envoye = await sendEmail(
      TO_OPS,
      `${ok ? "💰 Paiement reçu" : "🚨 PAIEMENT NON CRÉDITÉ"} — ${esc(a.canal)} ${esc(a.produit ?? "")}`.trim(),
      html,
    );
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

    if (pf.user_id && pf.email) {
      const { error: resaErr } = await supabase
        .from("email_logs")
        .insert({ user_id: pf.user_id, email_type: typeDedup });
      if (resaErr && (resaErr as { code?: string }).code === "23505") {
        clientSaute = "deja_notifie";
      } else if (resaErr) {
        // Réservation illisible : on n'envoie PAS le mail client (impossible
        // d'arbitrer un doublon) mais on le JOURNALISE — même canal que les
        // échecs de dédup du tunnel, relu par l'ops-digest de 8h50.
        clientSaute = `reservation: ${resaErr.message}`;
        logEchecs.push(`${typeDedup}:${pf.user_id}:${resaErr.message}`);
        await supabase.from("email_log_echecs").insert({
          user_id: pf.user_id, email_type: typeDedup,
          code: (resaErr as { code?: string }).code ?? null, erreur: resaErr.message,
        }).then(({ error: jErr }) => { if (jErr) console.error("email_log_echecs_insert_echec", jErr.message); });
      } else {
        const lang = pf.lang === "en" ? "en" : "fr";
        const subject = lang === "en" ? "Your payment didn't go through" : "Ton paiement n'a pas abouti";
        clientEnvoye = await sendEmail(pf.email, subject, paymentFailedHtml(lang, cause, contexte));
        if (!clientEnvoye) {
          await supabase.from("email_logs").delete()
            .eq("user_id", pf.user_id).eq("email_type", typeDedup);
          clientSaute = "resend_echec (réservation rendue)";
        }
      }
    } else {
      clientSaute = "compte ou email introuvable";
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
    const opsOk = await sendEmail(
      TO_OPS,
      `💳 Paiement échoué — ${cause}${pf.email ? ` — ${pf.email}` : ""}`,
      opsHtml,
    );

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
    // .limit(1) obligatoire : sur un compte portant PLUSIEURS lignes 'welcome'
    // (doublons historiques), maybeSingle() seul rend une ERREUR — donc
    // existing null — donc renvoi. Avec limit(1), une ligne suffit à bloquer.
    const { data: existing } = await supabase
      .from("email_logs")
      .select("id")
      .eq("user_id", welcomeUserId)
      .eq("email_type", "welcome")
      .limit(1)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("lang")
      .eq("id", welcomeUserId)
      .maybeSingle();
    const lang = profile?.lang ?? "fr";

    // Opt-out marketing respecté ici aussi (cohérence avec l'en-tête
    // List-Unsubscribe posé sur ce mail : « tu ne recevras plus ce type
    // d'email » doit être vrai dès le welcome).
    const { data: optedOut } = await supabase
      .from("email_logs")
      .select("id")
      .eq("user_id", welcomeUserId)
      .eq("email_type", "marketing_optout")
      .limit(1)
      .maybeSingle();
    if (optedOut) {
      return new Response(JSON.stringify({ skipped: true, reason: "marketing_optout" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = lang === "en" ? "Welcome to FillSell 🎉" : "Bienvenue sur FillSell 🎉";
    const ok = await sendEmail(welcomeUserEmail, subject, welcomeHtml(lang), unsubHeaders(welcomeUserId));
    if (ok) {
      await logEmail(welcomeUserId, "welcome");
      return new Response(
        JSON.stringify({
          success: true,
          sent: [`welcome:${welcomeUserEmail}`],
          log_echecs: logEchecs,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: `Failed to send to ${welcomeUserEmail}` }),
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
  if (testEmail && body?.test_template === "payment_failed") {
    const cause = typeof body?.test_cause === "string" ? body.test_cause : "3ds";
    const contexte = typeof body?.test_contexte === "string" ? body.test_contexte : "souscription";
    const ok = await sendEmail(testEmail, "Ton paiement n'a pas abouti", paymentFailedHtml("fr", cause, contexte));
    if (ok) sent.push(`payment_failed:${testEmail}`);
    else errors.push(`payment_failed:${testEmail}`);
    return new Response(
      JSON.stringify({ test: true, template: "payment_failed", cause, contexte, sent, errors, resend: resendTrace }),
      { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
    );
  }
  if (testEmail && body?.test_template === BLAST_SYNC_TYPE) {
    const ok = await sendEmail(testEmail, BLAST_SYNC_SUBJECT, blastSyncDressingHtml());
    if (ok) sent.push(`${BLAST_SYNC_TYPE}:${testEmail}`);
    else errors.push(`${BLAST_SYNC_TYPE}:${testEmail}`);
    return new Response(
      JSON.stringify({ test: true, template: BLAST_SYNC_TYPE, sent, errors, resend: resendTrace }),
      { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
    );
  }
  if (testEmail && body?.test_template === BLAST_TYPE) {
    const ok = await sendEmail(testEmail, BLAST_SUBJECT, blastRelaunchHtml());
    if (ok) sent.push(`${BLAST_TYPE}:${testEmail}`);
    else errors.push(`${BLAST_TYPE}:${testEmail}`);
    return new Response(
      JSON.stringify({ test: true, template: BLAST_TYPE, sent, errors, resend: resendTrace }),
      { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (testEmail) {
    const r1 = await sendEmail(testEmail, "Bienvenue sur FillSell 🎉", welcomeHtml("fr"));
    if (r1) sent.push(`welcome:${testEmail}`); else errors.push(`welcome:${testEmail}`);
    const r2 = await sendEmail(testEmail, "Comment FillSell travaille pour toi 🔍", howItWorksHtml("fr"));
    if (r2) sent.push(`how_it_works:${testEmail}`); else errors.push(`how_it_works:${testEmail}`);
    return new Response(JSON.stringify({ test: true, sent, errors }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Relance mode: send custom one-off emails using standard wrapper ────────
  const relanceEmails: Array<{to: string; subject: string; body_text: string}> = body?.relance_emails ?? [];
  if (relanceEmails.length > 0) {
    for (const item of relanceEmails) {
      const html = emailWrapper(`
        <p style="color:#6B7280;font-size:15px;line-height:1.75;margin:0 0 28px;
          font-family:sans-serif;white-space:pre-line;">${item.body_text.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
        <a href="https://fillsell.app"
           style="display:block;text-align:center;background:#2DD4BF;
             color:#fff;font-weight:800;font-size:15px;padding:14px 24px;
             border-radius:12px;text-decoration:none;font-family:sans-serif;">
          Ouvrir FillSell
        </a>`, "fr");
      const ok = await sendEmail(item.to, item.subject, html);
      if (ok) sent.push(`relance:${item.to}`); else errors.push(`relance:${item.to}`);
    }
    return new Response(JSON.stringify({ relance: true, sent, errors }), {
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
          const ok = await sendEmail(c.user_email, BLAST_SUBJECT, html);
          // Resend en échec = AUCUNE ligne email_logs : la cible reste
          // éligible et repartira au prochain run.
          if (!ok) {
            errors.push(`${BLAST_TYPE}:${c.user_email}`);
            return;
          }
          await logEmail(c.user_id, BLAST_TYPE);
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

    // En-têtes de désabonnement : helper partagé du handler (unsubHeaders).
    const html = blastSyncDressingHtml();
    const tranche = cibles.slice(0, limite);
    for (let i = 0; i < tranche.length; i += BLAST_LOT) {
      await Promise.all(
        tranche.slice(i, i + BLAST_LOT).map(async (c) => {
          const ok = await sendEmail(c.user_email, BLAST_SYNC_SUBJECT, html, unsubHeaders(c.user_id));
          // Resend en échec = AUCUNE ligne email_logs : la cible reste
          // éligible et repartira au prochain lot.
          if (!ok) {
            errors.push(`${BLAST_SYNC_TYPE}:${c.user_email}`);
            return;
          }
          await logEmail(c.user_id, BLAST_SYNC_TYPE);
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

    const t = Date.now();
    const { data: jobs, error: jobsErr } = await supabase
      .from("cross_post_jobs")
      .select("id, user_id, platform, title, created_at")
      .eq("status", "pending")
      .is("handler_build", null)
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
    const enAttente: any[] = [];
    const seuilFrais = t - RELANCE_EXT_FRAICHE_H * 3_600_000;
    const seuilCooldown = t - RELANCE_COOLDOWN_H * 3_600_000;

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

      const lang = prof.lang ?? "fr";
      const { sujet, html } = relanceHtml(cas, aAnnoncer, prof.extension_last_seen_at, lang);
      const ok = await sendEmail(prof.email, sujet, html);
      if (ok) {
        await logEmail(userId, RELANCE_TYPE);
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
      jobs_eligibles: jobs?.length ?? 0, utilisateurs: parUser.size,
      envoyes: sent.length, echecs: errors.length,
      cas3_bug_extension: cas3,
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
    const subject =
      user.lang === "en" ? "Welcome to FillSell 🎉" : "Bienvenue sur FillSell 🎉";
    const ok = await sendEmail(user.user_email, subject, welcomeHtml(user.lang), unsubHeaders(user.user_id));
    if (ok) {
      await logEmail(user.user_id, "welcome");
      sent.push(`welcome:${user.user_email}`);
    } else {
      errors.push(`welcome:${user.user_email}`);
    }
  }

  // ── Trigger 2: J+1 « comment ça marche » (tous, même fenêtre que le welcome) ─
  // Dédup type 'how_it_works', distinct de 'welcome' : les deux coexistent le
  // même jour sans conflit. Aucune condition premium/non-premium.
  for (const user of ciblesJ1) {
    if (alreadySent(user.user_id, "how_it_works")) continue;
    if (alreadySent(user.user_id, "marketing_optout")) continue;
    const subject =
      user.lang === "en"
        ? "How FillSell works for you 🔍"
        : "Comment FillSell travaille pour toi 🔍";
    const ok = await sendEmail(user.user_email, subject, howItWorksHtml(user.lang), unsubHeaders(user.user_id));
    if (ok) {
      await logEmail(user.user_id, "how_it_works");
      sent.push(`how_it_works:${user.user_email}`);
    } else {
      errors.push(`how_it_works:${user.user_email}`);
    }
  }

  return new Response(JSON.stringify({ success: true, sent, errors, log_echecs: logEchecs }), {
    headers: { "Content-Type": "application/json" },
  });
});
