// ============================================================================
// Habillage de marque FillSell pour les emails sortants.
//
// Source : maquette « FillSell Email Template » (Claude Design, 13/09/2026).
// Le CSS reste INLINE : c'est un email, pas une page web. Rien n'est extrait
// dans une feuille de styles ; seules les regles qui ne peuvent pas etre
// inlinees (media queries, keyframes) vivent dans le <style> du <head>, et
// l'email reste complet si un client les supprime.
//
// Le contenu de remplissage de la maquette (signataire invente, societe et
// adresse postale inventees, recapitulatif hebdomadaire d'exemple) a ete
// retire : il ne reste que la mise en forme, pilotee par les options.
//
// Regle d'echappement : tout texte passe en `string` est echappe. Pour
// injecter du HTML volontairement, passer par `brut()` ou les helpers inline
// (`gras`, `lien`, `sautLigne`).
// ============================================================================

import { BASE_LOGOS, PLATEFORMES, SLUGS_PLATEFORMES } from "./plateformes.ts";

/** Fragment de HTML deja construit et sur : insere tel quel, jamais echappe. */
export interface Html {
  readonly __html: string;
}

/** Texte (echappe) ou fragment sur, seul ou en liste. */
export type Contenu = string | Html | Array<string | Html>;

// ---------------------------------------------------------------------------
// Constantes de marque
// ---------------------------------------------------------------------------

/** Icone FillSell hebergee (public/icon-192x192.png, servie a la racine). */
export const LOGO_URL = "https://fillsell.app/icon-192x192.png";

/** Adresse d'envoi et de reponse reellement relevee (cf. /legal#mentions). */
export const EMAIL_SUPPORT = "support@fillsell.app";

/** Ancres reelles de la page /legal. */
export const LIEN_MENTIONS = "https://fillsell.app/legal#mentions";
export const LIEN_CONFIDENTIALITE = "https://fillsell.app/legal#confidentialite";

/** Pastilles du bloc statut. La couleur ne porte jamais l'information seule. */
export const COULEURS_STATUT = {
  ok: "#1D9E75",
  attention: "#E8956D",
  bloque: "#E53E3E",
} as const;

export type NiveauStatut = keyof typeof COULEURS_STATUT;

const POLICE = "-apple-system,'Segoe UI',Arial,sans-serif";
const POLICE_MARQUE = "'Space Grotesk',-apple-system,'Segoe UI',Arial,sans-serif";

// ---------------------------------------------------------------------------
// Echappement
// ---------------------------------------------------------------------------

/** Echappe un texte destine au corps HTML ou a une valeur d'attribut. */
export function echapper(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Marque un fragment comme deja sur. A n'utiliser que sur du HTML litteral. */
export function brut(html: string): Html {
  return { __html: html };
}

function estHtml(v: unknown): v is Html {
  return typeof v === "object" && v !== null &&
    typeof (v as Html).__html === "string";
}

/** Rend un Contenu : les chaines sont echappees, les fragments passent tels quels. */
function rendre(contenu: Contenu): string {
  if (Array.isArray(contenu)) return contenu.map((m) => rendre(m)).join("");
  if (estHtml(contenu)) return contenu.__html;
  return echapper(contenu);
}

/**
 * N'autorise que http(s) et mailto dans un href. Toute autre valeur
 * (javascript:, data:, chaine vide) rend une chaine vide : le lien n'est
 * alors pas pose du tout.
 */
export function urlSure(url: unknown): string {
  const v = String(url ?? "").trim();
  if (!v) return "";
  if (!/^(https?:\/\/|mailto:)/i.test(v)) return "";
  return echapper(v);
}

// ---------------------------------------------------------------------------
// Helpers inline (dans un paragraphe, une puce, un encadre)
// ---------------------------------------------------------------------------

/** Met un texte en gras. Le texte est echappe. */
export function gras(texte: string): Html {
  return brut(
    `<strong style="font-weight:700; color:#0D0D0D;">${echapper(texte)}</strong>`,
  );
}

/** Lien inline. Le libelle est echappe, l'URL filtree par urlSure(). */
export function lien(texte: string, url: string): Html {
  const href = urlSure(url);
  if (!href) return brut(echapper(texte));
  return brut(
    `<a href="${href}" target="_blank" style="color:#17835F; text-decoration:underline;">${echapper(texte)}</a>`,
  );
}

/** Retour a la ligne dans un paragraphe. */
export function sautLigne(): Html {
  return brut("<br>");
}

// ---------------------------------------------------------------------------
// Blocs de corps — chaque helper rend une <tr> autonome de la carte 600px
// ---------------------------------------------------------------------------

/** Paragraphe de corps de texte. Le contenu est echappe. */
export function paragraphe(contenu: Contenu): Html {
  return brut(
    `<tr><td align="left" class="fs-pad fs-body" style="padding:18px 34px 0 34px; background-color:#FFFFFF; font-family:${POLICE}; font-size:16px; line-height:28px; mso-line-height-rule:exactly; color:#3A3A38;">` +
      `<p style="margin:0;">${rendre(contenu)}</p>` +
      `</td></tr>`,
  );
}

/**
 * Paragraphe dont le HTML est fourni tel quel (litteraux de confiance
 * uniquement). Ne JAMAIS y passer une valeur venant d'un utilisateur ou de
 * la base : utiliser paragraphe(), qui echappe.
 */
export function paragrapheHtml(html: string): Html {
  return paragraphe(brut(html));
}

/**
 * Titre de section dans le corps. Pas un <h1> (il n'y en a qu'un, en zone de
 * titre) : un <h2> discret qui decoupe un mail long sans le hacher.
 */
export function sousTitre(texte: string): Html {
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:32px 34px 0 34px; background-color:#FFFFFF;">` +
      `<h2 style="margin:0; font-family:${POLICE}; font-size:19px; line-height:26px; mso-line-height-rule:exactly; font-weight:700; letter-spacing:-0.015em; color:#0D0D0D;">${echapper(texte)}</h2>` +
      `</td></tr>`,
  );
}

/** Liste a puces vertes. Chaque item est echappe. */
export function listePuces(items: Contenu[]): Html {
  if (!items.length) return brut("");
  const lignes = items
    .map((item, i) => {
      const bas = i === items.length - 1 ? "0" : "14px";
      return `<tr>` +
        `<td width="20" valign="top" style="width:20px; padding:8px 0 ${bas} 0;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="6" height="6" bgcolor="#1D9E75" style="width:6px; height:6px; background-color:#1D9E75; border-radius:3px; font-size:0; line-height:0;">&nbsp;</td></tr></table>` +
        `</td>` +
        `<td valign="top" style="padding:0 0 ${bas} 0; font-family:${POLICE}; font-size:16px; line-height:26px; mso-line-height-rule:exactly; color:#3A3A38;">${rendre(item)}</td>` +
        `</tr>`;
    })
    .join("");
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:30px 34px 0 34px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">${lignes}</table>` +
      `</td></tr>`,
  );
}

/** Encadre de mise en valeur (vert tres pale) avec micro-label en capitales. */
export function encadre(label: string, contenu: Contenu): Html {
  const entete = label
    ? `<div style="font-family:${POLICE}; font-size:11px; font-weight:700; letter-spacing:1.3px; text-transform:uppercase; color:#17835F; padding-bottom:9px;">${echapper(label)}</div>`
    : "";
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:30px 34px 0 34px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#F4F9F7; border:1px solid #D9EAE3; border-radius:14px;">` +
      `<tr><td align="left" style="padding:22px 24px 22px 24px; background-color:#F4F9F7; border-radius:14px;">` +
      entete +
      `<div style="font-family:${POLICE}; font-size:16px; line-height:26px; mso-line-height-rule:exactly; color:#3A3A38;">${rendre(contenu)}</div>` +
      `</td></tr></table>` +
      `</td></tr>`,
  );
}

/**
 * Bloc statut avec pastille de couleur.
 * Le titre dit toujours le statut en toutes lettres : la couleur ne porte
 * jamais l'information seule (daltonisme, rendu degrade).
 */
export function statut(
  titre: string,
  detail: Contenu = "",
  niveau: NiveauStatut = "attention",
): Html {
  const couleur = COULEURS_STATUT[niveau] ?? COULEURS_STATUT.attention;
  const renduDetail = rendre(detail);
  const ligneDetail = renduDetail
    ? `<br><span style="color:#6B7280; font-size:15px; line-height:23px;">${renduDetail}</span>`
    : "";
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:26px 34px 0 34px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border:1px solid #EAE7E1; border-radius:14px;">` +
      `<tr>` +
      `<td width="16" valign="top" style="width:16px; padding:20px 0 18px 20px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="10" height="10" bgcolor="${couleur}" style="width:10px; height:10px; background-color:${couleur}; border-radius:5px; font-size:0; line-height:0;">&nbsp;</td></tr></table>` +
      `</td>` +
      `<td align="left" style="padding:16px 20px 18px 13px; background-color:#FFFFFF; font-family:${POLICE}; font-size:16px; line-height:24px; mso-line-height-rule:exactly; color:#3A3A38;">` +
      `<span style="font-weight:700; color:#0D0D0D;">${echapper(titre)}</span>${ligneDetail}` +
      `</td>` +
      `</tr></table>` +
      `</td></tr>`,
  );
}

/**
 * Bouton d'action principal (plein, vert). URL invalide = bloc absent.
 *
 * LIBELLÉ BLANC, VERROUILLÉ — bug relevé le 14/09/2026 (iPhone, Gmail en
 * thème sombre) : le texte du bouton ressortait SOMBRE sur le vert, donc à
 * peine lisible, alors qu'il est écrit en #FFFFFF en inline. Le client
 * réécrit la couleur des liens en mode sombre, et une couleur inline sans
 * `!important` ne lui résiste pas.
 * Trois ceintures, parce qu'aucune ne couvre tous les clients :
 *   1. `color:#FFFFFF !important` sur le <a> ;
 *   2. la même couleur re-posée sur un <span> intérieur — certains clients
 *      ne réécrivent que le <a> et laissent ses descendants tranquilles ;
 *   3. les règles [data-ogsc] / prefers-color-scheme du <style> (Outlook.com
 *      et les clients qui suivent la media query).
 * Le fond, lui, est porté par `bgcolor` ET `background-color` : un fond
 * d'élément n'est pas inversé, contrairement au texte.
 *
 * Cible tactile : 56 px de haut au doigt (18 px de marge + 20 px de ligne),
 * au-dessus des 44 px recommandés par Apple et des 48 px de Material.
 */
export function boutonPrincipal(texte: string, url: string): Html {
  const href = urlSure(url);
  if (!href) return brut("");
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:30px 34px 4px 34px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="fs-btn" style="border-radius:14px;">` +
      `<tr><td align="center" bgcolor="#1D9E75" style="background-color:#1D9E75; background-image:linear-gradient(135deg,#25B083 0%,#17835F 100%); border-radius:14px; box-shadow:0 10px 24px rgba(29,158,117,0.32);">` +
      `<a href="${href}" target="_blank" class="fs-btn-txt" style="display:block; padding:18px 36px; font-family:${POLICE}; font-size:17px; font-weight:700; letter-spacing:-0.01em; color:#FFFFFF !important; text-decoration:none; line-height:20px; mso-line-height-rule:exactly;">` +
      `<span style="color:#FFFFFF !important; text-decoration:none;">${echapper(texte)}` +
      `<span style="display:inline-block; width:12px;">&nbsp;</span>&#8594;</span>` +
      `</a>` +
      `</td></tr></table>` +
      `</td></tr>`,
  );
}

/** Bouton secondaire (contour, vert sur blanc). URL invalide = bloc absent. */
export function boutonSecondaire(texte: string, url: string): Html {
  const href = urlSure(url);
  if (!href) return brut("");
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:26px 34px 0 34px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="fs-btn" style="border-radius:12px;">` +
      `<tr><td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF; border:1px solid #C9DED6; border-radius:12px;">` +
      `<a href="${href}" target="_blank" style="display:block; padding:14px 26px; font-family:${POLICE}; font-size:15px; font-weight:700; color:#17835F; text-decoration:none; line-height:20px; mso-line-height-rule:exactly;">${echapper(texte)}</a>` +
      `</td></tr></table>` +
      `</td></tr>`,
  );
}

/**
 * Rangee des logos de plateformes, sur bandeau vert pale.
 *
 * La liste vient de _shared/plateformes.ts — JAMAIS d'une table locale : le
 * mail welcome et le mail de relance ont divergé exactement comme ça, et Opla
 * a manqué dans les deux pendant quatre jours.
 *
 * Chaque <img> porte width/height en ATTRIBUTS (Outlook ignore le CSS de
 * dimension) et un alt renseigne : quand le client mail bloque les images —
 * cas par defaut d'Outlook et de Gmail hors contacts — la rangee reste lisible
 * en toutes lettres.
 */
export function logosPlateformes(): Html {
  const cellules = SLUGS_PLATEFORMES.map((slug, i) => {
    const p = PLATEFORMES[slug];
    const gauche = i === 0 ? 0 : 7;
    return `<td valign="middle" style="padding:0 7px 0 ${gauche}px;">` +
      `<img src="${BASE_LOGOS}/${p.logo}" width="52" height="52" alt="${echapper(p.label)}" ` +
      `style="display:block; width:52px; height:52px; border:0; border-radius:12px; outline:none; text-decoration:none; ` +
      `font-family:${POLICE}; font-size:11px; font-weight:700; color:#3A3A38;">` +
      `</td>`;
  }).join("");
  return brut(
    `<tr><td align="left" class="fs-pad" style="padding:26px 34px 0 34px; background-color:#FFFFFF;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:#F4F9F7; border:1px solid #D9EAE3; border-radius:14px;">` +
      `<tr><td align="center" style="padding:18px 12px 18px 12px; background-color:#F4F9F7; border-radius:14px;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cellules}</tr></table>` +
      `</td></tr></table>` +
      `</td></tr>`,
  );
}

/** Filet de separation horizontal. */
export function separateur(): Html {
  return brut(
    `<tr><td class="fs-pad" style="padding:30px 34px 0 34px; background-color:#FFFFFF; font-size:0; line-height:0;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">` +
      `<tr><td height="1" bgcolor="#EAE7E1" style="height:1px; background-color:#EAE7E1; font-size:0; line-height:0;">&nbsp;</td></tr></table>` +
      `</td></tr>`,
  );
}

// ---------------------------------------------------------------------------
// Rendu de l'email complet
// ---------------------------------------------------------------------------

export interface OptionsEmail {
  /**
   * Titre principal, rendu en h1 et repris dans le <title> du document.
   * Chaine vide = pas de zone de titre du tout (le corps commence directement
   * sous l'en-tete de marque).
   */
  titre: string;
  /** Blocs du corps, dans l'ordre, construits avec les helpers ci-dessus. */
  corps: Html[];
  /** Texte d'apercu affiche a cote de l'objet (~85 car., invisible dans le mail). */
  preheader?: string;
  /** Ligne de contexte grise au-dessus de la carte. Vide = ligne absente. */
  ligneService?: string;
  /** Micro-label en capitales au-dessus du titre. Vide = absent. */
  surtitre?: string;
  /** Nom du signataire. Vide (avec signatureRole vide) = bloc signature absent. */
  signatureNom?: string;
  /** Fonction du signataire, affichee sous le nom. */
  signatureRole?: string;
  /** Formule de politesse au-dessus de la signature. */
  formuleFin?: string;
  /** URL https de l'icone d'en-tete. Vide = seul le wordmark texte s'affiche. */
  logoUrl?: string;
  /** Adresse de contact du pied de page. Vide = phrase de contact absente. */
  emailContact?: string;
  /**
   * Promet une reponse humaine (« ou reponds a ce mail »). A ne laisser a true
   * que si l'expediteur (ou le reply-to) est une boite reellement relevee.
   */
  reponseAuMail?: boolean;
  /** Phrase expliquant pourquoi l'utilisateur recoit le message. */
  raisonEnvoi?: string;
  /** URL de gestion des notifications. Vide = lien absent (aucune route a ce jour). */
  lienPreferences?: string;
  /** URL de desinscription. Vide = lien absent. Obligatoire en envoi marketing. */
  lienDesinscription?: string;
  /**
   * Ligne de mentions legales du pied de page (raison sociale, adresse postale).
   * VIDE PAR DEFAUT : aucune societe ni adresse postale n'est publiee a ce jour
   * (cf. /legal#mentions : auto-entrepreneur, pas d'adresse affichee).
   */
  mentionsLegales?: string;
  /** URL des mentions legales. */
  lienMentions?: string;
  /** URL de la politique de confidentialite. */
  lienConfidentialite?: string;
  /** URL de la version navigateur de l'email. Vide = les deux liens sont absents. */
  lienWeb?: string;
  /** Langue du document (attribut lang). */
  langue?: string;
}

/** Rend l'email complet : document HTML autonome, CSS inline. */
export function renderEmail(opts: OptionsEmail): string {
  const {
    titre,
    corps,
    preheader = "",
    ligneService = "",
    surtitre = "",
    signatureNom = "",
    signatureRole = "",
    formuleFin = "À bientôt,",
    logoUrl = LOGO_URL,
    emailContact = EMAIL_SUPPORT,
    reponseAuMail = true,
    raisonEnvoi = "Tu reçois ce message parce que tu as un compte FillSell.",
    lienPreferences = "",
    lienDesinscription = "",
    mentionsLegales = "",
    lienMentions = LIEN_MENTIONS,
    lienConfidentialite = LIEN_CONFIDENTIALITE,
    lienWeb = "",
    langue = "fr",
  } = opts;

  // Pied de carte : les plateformes, lues sur la MÊME source que la rangée de
  // logos. Écrites en dur, elles avaient oublié Opla (relevé du 19/09).
  const ligneMarquePlateformes = SLUGS_PLATEFORMES
    .map((s) => echapper(PLATEFORMES[s].label))
    .join(" &middot; ");

  const hrefWeb = urlSure(lienWeb);
  const hrefPreferences = urlSure(lienPreferences);
  const hrefDesinscription = urlSure(lienDesinscription);
  const hrefMentions = urlSure(lienMentions);
  const hrefConfidentialite = urlSure(lienConfidentialite);
  const hrefContact = emailContact ? urlSure(`mailto:${emailContact}`) : "";

  // --- Preheader (invisible, affiche a cote de l'objet) ---
  const blocPreheader = preheader
    ? `<div style="display:none; font-size:1px; color:#EFEDE8; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">${echapper(preheader)}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;</div>`
    : "";

  // --- Ligne de service au-dessus de la carte ---
  const blocLigneService = ligneService || hrefWeb
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="fs-card" style="width:600px; max-width:600px;"><tr>` +
      `<td align="left" class="fs-pad" style="padding:0 8px 10px 8px; font-family:${POLICE}; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:#9A9A94; letter-spacing:0.2px;">${echapper(ligneService)}</td>` +
      (hrefWeb
        ? `<td align="right" class="fs-pad fs-hide-sm" style="padding:0 8px 10px 8px; font-family:${POLICE}; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:#9A9A94;"><a href="${hrefWeb}" style="color:#9A9A94; text-decoration:underline;">Voir dans le navigateur</a></td>`
        : "") +
      `</tr></table>`
    : "";

  // --- En-tete de marque ---
  // Le wordmark « FillSell » est du VRAI TEXTE : c'est lui le repli quand les
  // images sont bloquees. L'icone porte alt="" pour ne pas doubler le nom.
  const hrefLogo = urlSure(logoUrl);
  const celluleIcone = hrefLogo
    ? `<td width="32" valign="middle" style="width:32px; padding:0;"><img src="${hrefLogo}" width="32" height="32" alt="" style="display:block; width:32px; height:32px; border:0; border-radius:8px; outline:none; text-decoration:none;"></td>` +
      `<td width="10" style="width:10px;">&nbsp;</td>`
    : "";

  // --- Zone de titre ---
  const blocSurtitre = surtitre
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="padding-bottom:14px;"><tr>` +
      `<td width="18" valign="middle" style="width:18px; font-size:0; line-height:0; padding:0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="18" style="width:18px;"><tr><td height="2" bgcolor="#1D9E75" style="height:2px; background-color:#1D9E75; font-size:0; line-height:0;">&nbsp;</td></tr></table></td>` +
      `<td width="9" style="width:9px;">&nbsp;</td>` +
      `<td valign="middle" style="font-family:${POLICE}; font-size:11px; font-weight:700; letter-spacing:1.3px; text-transform:uppercase; color:#17835F; line-height:14px; mso-line-height-rule:exactly;">${echapper(surtitre)}</td>` +
      `</tr></table>`
    : "";

  // Zone de titre complete, ou simple respiration si ni titre ni surtitre :
  // on retombe alors sur les 38px de blanc qu'aurait donnes la zone de titre.
  const blocTitre = titre || surtitre
    ? `<tr>
          <td align="left" class="fs-pad" style="padding:38px 34px 0 34px; background-color:#FFFFFF;">
            ${blocSurtitre}${
      titre
        ? `
            <h1 class="fs-h1" style="margin:12px 0 0 0; font-family:${POLICE}; font-size:30px; line-height:38px; mso-line-height-rule:exactly; font-weight:700; letter-spacing:-0.028em; color:#0D0D0D;">${
          echapper(titre)
        }</h1>`
        : ""
    }
          </td>
        </tr>`
    : `<tr><td class="fs-pad" style="padding:20px 34px 0 34px; background-color:#FFFFFF; font-size:0; line-height:0;">&nbsp;</td></tr>`;

  // --- Signature (ou simple respiration avant le pied de carte) ---
  const blocSignature = signatureNom || signatureRole
    ? `<tr><td align="left" class="fs-pad" style="padding:32px 34px 36px 34px; background-color:#FFFFFF; font-family:${POLICE}; font-size:16px; line-height:26px; mso-line-height-rule:exactly; color:#3A3A38;">` +
      (formuleFin ? `${echapper(formuleFin)}<br>` : "") +
      (signatureNom
        ? `<span style="font-weight:700; color:#0D0D0D;">${echapper(signatureNom)}</span>${signatureRole ? "<br>" : ""}`
        : "") +
      (signatureRole
        ? `<span style="color:#6B7280; font-size:15px;">${echapper(signatureRole)}</span>`
        : "") +
      `</td></tr>`
    : `<tr><td class="fs-pad" style="padding:0 34px 36px 34px; background-color:#FFFFFF; font-size:0; line-height:0;">&nbsp;</td></tr>`;

  // --- Pied de page : contact ---
  let phraseContact = "";
  if (hrefContact && reponseAuMail) {
    phraseContact =
      `Une question&nbsp;? Écris-nous à <a href="${hrefContact}" style="color:#17835F; text-decoration:underline;">${echapper(emailContact)}</a> ou réponds à ce mail.`;
  } else if (hrefContact) {
    phraseContact =
      `Une question&nbsp;? Écris-nous à <a href="${hrefContact}" style="color:#17835F; text-decoration:underline;">${echapper(emailContact)}</a>.`;
  } else if (reponseAuMail) {
    phraseContact = `Une question&nbsp;? Réponds directement à ce mail.`;
  }
  const ligneContact = phraseContact
    ? `<tr><td align="center" class="fs-pad" style="padding:26px 34px 10px 34px; background-color:#EFEDE8; font-family:${POLICE}; font-size:14px; line-height:23px; mso-line-height-rule:exactly; color:#6B7280;">${phraseContact}</td></tr>`
    : "";

  // --- Pied de page : raison de l'envoi + preferences ---
  const liensPreferences = [
    hrefPreferences
      ? `<a href="${hrefPreferences}" style="color:#6B7280; text-decoration:underline;">Gérer mes notifications</a>`
      : "",
    hrefDesinscription
      ? `<a href="${hrefDesinscription}" style="color:#6B7280; text-decoration:underline;">Me désinscrire</a>`
      : "",
  ].filter(Boolean).join("&nbsp;&middot;&nbsp;");
  const ligneRaison = raisonEnvoi || liensPreferences
    ? `<tr><td align="center" class="fs-pad" style="padding:0 34px 12px 34px; background-color:#EFEDE8; font-family:${POLICE}; font-size:13px; line-height:22px; mso-line-height-rule:exactly; color:#9A9A94;">` +
      (raisonEnvoi ? echapper(raisonEnvoi) + (liensPreferences ? "<br>" : "") : "") +
      liensPreferences +
      `</td></tr>`
    : "";

  // --- Pied de page : mentions legales ---
  const liensLegaux = [
    hrefMentions
      ? `<a href="${hrefMentions}" style="color:#9A9A94; text-decoration:underline;">Mentions légales</a>`
      : "",
    hrefConfidentialite
      ? `<a href="${hrefConfidentialite}" style="color:#9A9A94; text-decoration:underline;">Confidentialité</a>`
      : "",
    hrefWeb
      ? `<a href="${hrefWeb}" style="color:#9A9A94; text-decoration:underline;">Voir dans le navigateur</a>`
      : "",
  ].filter(Boolean).join("&nbsp;&middot;&nbsp;");
  const ligneMentions = mentionsLegales || liensLegaux
    ? `<tr><td align="center" class="fs-pad" style="padding:0 34px 4px 34px; background-color:#EFEDE8; font-family:${POLICE}; font-size:12px; line-height:20px; mso-line-height-rule:exactly; color:#9A9A94;">` +
      (mentionsLegales ? echapper(mentionsLegales) + (liensLegaux ? "<br>" : "") : "") +
      liensLegaux +
      `</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="${echapper(langue)}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${echapper(titre || "FillSell")}</title>

<!-- ============================================================
     PALETTE FILLSELL — tout se change ici
     (les couleurs sont inlinées : un rechercher/remplacer du code
     hex suffit à ré-habiller l'email entier)

     STRUCTURE
     #EFEDE8   Fond de l'email, hors carte (crème)
     #FFFFFF   Fond de la carte et des blocs
     #E6E3DD   Bordure de la carte
     #EAE7E1   Séparateurs internes

     EN-TÊTE
     #FCFBF9   Fond de repli de l'en-tête (blanc translucide par-dessus)
     #4A5A52   Wordmark « FillSell » (identique à l'app)

     MARQUE
     #17835F   Vert profond — wordmark, filet, liens
     #1D9E75   Vert FillSell — bouton principal, puces, chiffres
     #35B79A   Vert médian du dégradé d'en-tête
     #4ECDC4   Teal clair — fin du dégradé d'en-tête
     #E8956D   Pêche — accent secondaire, statut « attention »

     TEXTE
     #0D0D0D   Titres
     #3A3A38   Texte courant
     #6B7280   Texte secondaire
     #9A9A94   Micro-labels, mentions légales

     BLOCS
     #F4F9F7   Fond du bloc encadré (vert très pâle)
     #D9EAE3   Bordure du bloc encadré
     #E53E3E   Statut « bloqué / erreur »
     ============================================================ -->

<!-- Police de marque : Space Grotesk, comme la landing et l'app.
     Chargée uniquement pour le wordmark de l'en-tête ; Gmail et Outlook
     l'ignorent et retombent sur la police système (même graisse, même
     italique). Tout le reste de l'email est en polices système. -->
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" type="text/css">
<style type="text/css">
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap');
  /* Uniquement ce qui ne peut pas être inliné. Plusieurs clients
     suppriment ce bloc : l'email reste complet sans lui. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; }
  a { color:#17835F; }

  /* Animations facultatives — Apple Mail, iOS Mail, Samsung.
     Gmail et Outlook les ignorent : l'en-tête reste fixe et net. */
  .fs-bar { background-size:132% 132% !important; animation:fsDrift 14s ease-in-out infinite; }
  @keyframes fsDrift {
    0%   { background-position:28% 50%; }
    50%  { background-position:72% 50%; }
    100% { background-position:28% 50%; }
  }
  .fs-live { animation:fsPulse 2.6s ease-in-out infinite; }
  @keyframes fsPulse {
    0%   { opacity:1; }
    50%  { opacity:0.28; }
    100% { opacity:1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fs-bar, .fs-live { animation:none !important; }
  }

  /* ── WORDMARK : lisible en clair ET en sombre ────────────────────────────
     Bug du 13/09/2026 (iPhone, Gmail en thème sombre) : le corps du mail
     basculait en sombre mais le fond de l'en-tête restait CLAIR, pendant que
     le client éclaircissait la couleur du texte → gris clair sur fond clair,
     marque illisible.
     CAUSE : l'en-tête portait un dégradé BLANC en background-image
     (rgba(255,255,255,…)). Une image de fond n'est pas inversée par les
     clients sombres : elle épinglait le fond en clair alors que le texte,
     lui, était éclairci. Ce dégradé — invisible en clair, puisque du blanc
     translucide sur #FCFBF9 — a été retiré : le fond suit désormais le même
     sort que le reste du mail.
     COULEURS lues dans l'app, pas inventées :
       #2F9E90  --teal de l'app, et theme-color du site — le wordmark
       #10201B  encre de l'app — fond d'en-tête en mode sombre

     UNE SEULE COULEUR DE TEXTE, DANS LES DEUX MODES. C'est délibéré.
     Gmail n'applique PAS prefers-color-scheme : il assombrit le fond
     lui-même et conserve la couleur inline. Une couleur de texte qui
     changerait avec la media query pourrait donc se retrouver appliquée
     sur le MAUVAIS fond dès qu'un client suit une règle sans l'autre.
     #2F9E90 est un teal moyen : il tient sur les deux fonds, donc aucun
     dépareillage n'est possible, quel que soit le client. Mesuré :
       #2F9E90 sur #FCFBF9 (clair)  = 3,17:1 — seuil « texte large » 3:1
                                              atteint (19 px, graisse 700)
       #2F9E90 sur #10201B (sombre) = 5,15:1
     Le --teal-deep #1B6E62 donnait 5,88:1 en clair mais 2,77:1 sur fond
     sombre : il rejouait le bug chez Gmail, précisément le client où il a
     été constaté. La media query ne touche donc QUE le fond. */
  @media (prefers-color-scheme: dark) {
    .fs-entete { background-color:#10201B !important; }
  }
  /* Outlook.com marque le mode sombre par cet attribut plutôt que par la
     media query. */
  [data-ogsc] .fs-entete { background-color:#10201B !important; }

  /* ── LIBELLÉ DE BOUTON : BLANC, QUOI QU'IL ARRIVE ───────────────────────
     Bug du 14/09/2026 (iPhone, Gmail sombre) : le texte du bouton d'action
     ressortait sombre sur le vert. En mode sombre, plusieurs clients
     réécrivent la couleur des LIENS sans toucher au fond de l'élément — le
     bouton gardait donc son vert et perdait son texte blanc.
     Le fond reste #1D9E75 dans les deux modes : le contraste du blanc
     dessus est de 3,6:1, au-dessus du seuil « texte large » (17 px, 700). */
  .fs-btn-txt, .fs-btn-txt span { color:#FFFFFF !important; }
  [data-ogsc] .fs-btn-txt, [data-ogsc] .fs-btn-txt span,
  [data-ogsb] .fs-btn-txt, [data-ogsb] .fs-btn-txt span { color:#FFFFFF !important; }
  @media (prefers-color-scheme: dark) {
    .fs-btn-txt, .fs-btn-txt span { color:#FFFFFF !important; }
  }

  @media only screen and (max-width:620px) {
    .fs-card { width:100% !important; }
    .fs-pad { padding-left:22px !important; padding-right:22px !important; }
    .fs-h1 { font-size:25px !important; line-height:32px !important; }
    .fs-body { font-size:16px !important; line-height:27px !important; }
    .fs-btn, .fs-btn a { width:100% !important; display:block !important; text-align:center !important; }
    .fs-hide-sm { display:none !important; }
  }
</style>
</head>

<body style="margin:0; padding:0; background-color:#EFEDE8; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
${blocPreheader}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#EFEDE8;">
  <tr>
    <td align="center" style="padding:22px 12px 40px 12px; background-color:#EFEDE8;">
${blocLigneService}
      <!-- ============ CARTE PRINCIPALE 600px ============ -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="fs-card" style="width:600px; max-width:600px; background-color:#FFFFFF; border:1px solid #E6E3DD; border-radius:18px; box-shadow:0 1px 3px rgba(23,60,49,0.05), 0 18px 44px rgba(23,60,49,0.07);">

        <!-- 1. EN-TÊTE DE MARQUE — topbar de l'app (dégradé vert → teal) -->
        <tr>
          <td class="fs-pad fs-entete" align="left" bgcolor="#FCFBF9" style="padding:18px 34px 17px 34px; background-color:#FCFBF9; border-radius:18px 18px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td align="left" valign="middle" style="padding:0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      ${celluleIcone}
                      <td valign="middle" style="padding:0;">
                        <div class="fs-wordmark" style="font-family:${POLICE_MARQUE}; font-size:19px; font-style:italic; font-weight:700; letter-spacing:-0.02em; color:#2F9E90; line-height:24px; mso-line-height-rule:exactly;">FillSell</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Filet de marque sous l'en-tête : dégradé de l'app (vert → teal) -->
        <tr>
          <td class="fs-bar" height="3" bgcolor="#1D9E75" style="height:3px; background-color:#1D9E75; background-image:linear-gradient(90deg,#17835F 0%,#1D9E75 34%,#35B79A 66%,#4ECDC4 100%); font-size:0; line-height:0; padding:0;">&nbsp;</td>
        </tr>

        <!-- 2. ZONE DE TITRE -->
        ${blocTitre}

        <!-- 3. CORPS — blocs composés par l'appelant -->
${corps.map((b) => b.__html).join("\n")}
${blocSignature}
        <!-- Pied de carte : rappel de marque -->
        <tr>
          <td align="left" class="fs-pad" bgcolor="#FAF9F6" style="padding:18px 34px 18px 34px; background-color:#FAF9F6; border-top:1px solid #EAE7E1; border-radius:0 0 18px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
              <tr>
                <td align="left" valign="middle" style="font-family:${POLICE_MARQUE}; font-size:14px; font-style:italic; font-weight:700; color:#4A5A52; line-height:20px; mso-line-height-rule:exactly;">FillSell</td>
                <td align="right" valign="middle" class="fs-hide-sm" style="font-family:${POLICE}; font-size:12px; color:#9A9A94; line-height:20px; mso-line-height-rule:exactly;">${ligneMarquePlateformes}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <!-- ============ FIN CARTE PRINCIPALE ============ -->

      <!-- PIED DE PAGE -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="fs-card" style="width:600px; max-width:600px; background-color:#EFEDE8;">
${ligneContact}
${ligneRaison}
${ligneMentions}
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
