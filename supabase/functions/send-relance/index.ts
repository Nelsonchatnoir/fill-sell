import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  boutonPrincipal,
  boutonSecondaire,
  brut,
  encadre,
  gras,
  listePuces,
  paragraphe,
  paragrapheHtml,
  renderEmail,
  separateur,
  statut,
} from "../_shared/email-template.ts";
import { type CategorieEmail, envoyerEmail, lienDesinscription } from "../_shared/desinscription.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── LE JETON NE VIT PLUS DANS LE CODE (2026-09-20) ───────────────────────
// Il y etait en clair, dans un fichier que .gitignore excluait : personne ne
// pouvait le relire, le faire tourner, ni meme savoir qu il existait. Et la
// fonction est en verify_jwt: false — ce jeton EST sa seule porte.
// Absent ou vide ⇒ 401 pour tout le monde, y compris nous. Echec FERME : une
// variable oubliee rend la fonction muette, jamais ouverte.
const SECRET = (Deno.env.get("RELANCE_SECRET") ?? "").trim();

/** Heure de Paris, ou NaN si elle est illisible (on n'envoie alors JAMAIS). */
function heureParis(): number {
  try {
    return Number(
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
  } catch {
    return NaN;
  }
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

interface Envoi {
  to: string;
  subject: string;
  /** HTML figé. Exclusif de buildHtml. */
  html?: string;
  /** HTML construit à l'envoi, quand il doit porter le lien de désinscription. */
  buildHtml?: (lienDesinscription: string) => string;
  /** Marqueur de catégorie. Absent = 'marketing' (donc filtré). */
  categorie?: CategorieEmail;
}

// Habillage de marque : _shared/email-template.ts (maquette FillSell).
//
// p() et wrap() gardent la signature d'avant (concatenation de chaines) pour
// que les corps deja ecrits plus bas ne bougent pas. Ces corps sont des
// litteraux de confiance, ecrits a la main dans ce fichier : paragrapheHtml
// laisse donc passer leurs <strong> et <br />. Pour un corps contenant une
// valeur venant de la base ou d'un utilisateur, utiliser paragraphe() du
// module, qui echappe.
function p(text: string) {
  return paragrapheHtml(text).__html;
}

// Pas de titre : ces mails commencent directement par « Bonjour, », comme
// avant. Un nouveau mail passera plutot par renderEmail() en direct, avec
// titre, surtitre et blocs.
function wrap(body: string) {
  return renderEmail({ titre: "", corps: [brut(body)] });
}

const ARCH = (v: string) => wrap(p("Mail archive - " + v) + p("Nico"));

const BLOQUE403_BODY = wrap(
  p("Bonjour,") +
  p("On a vu que ta synchronisation Vinted n'a jamais abouti. Dans la grande majorité des cas, c'est que <strong>Chrome n'est pas connecté à ton compte Vinted</strong>.") +
  p("1. Ouvre <strong>vinted.fr</strong> dans un onglet du même Chrome que l'extension<br />2. Connecte-toi à ton compte<br />3. Reviens dans FillSell et relance la synchronisation") +
  p("Le principe vaut pour toutes les plateformes : connecte-toi une fois dans ce navigateur à chacune de celles que tu veux utiliser (Vinted, Leboncoin, eBay, Beebs).") +
  p("Si tu es déjà connecté et que ça bloque encore, réponds à ce mail.") +
  p("Nico")
);
const SUJET_403 = "Ta synchronisation Vinted ne passe pas - la solution";

const BABAA_BIENVENUE_BODY = ARCH("v105");
const NADEGE_LIVRES_BODY = ARCH("v105");
const CATHY_EBAY_REAUTH_BODY = ARCH("v106");
const ROMAIN_MODIFS_BODY = ARCH("v105");
const ROMAIN_RECTIF_BODY = ARCH("v106");
const NADEGE_RESTRICTION_BODY = ARCH("v107");
const NADEGE_SUIVI_BODY = ARCH("v108");
const MERCURY_MAJ_BODY = ARCH("v109");
const HUGO_EBAY_BODY = ARCH("v110");
const RAFFALEPIC_EBAY_BODY = ARCH("v111");
const JOCAILLE_LBC_BODY = ARCH("v112");
const MICHALAK_LENS_BODY = ARCH("v114");
const JOSEPHINE_REPARE_BODY = ARCH("v115");
const JOSEPHINE_ISBN_BODY = ARCH("v116");
const GWADADAM_EBAY_BODY = ARCH("v117");
const CLAIRE_EBAY_BODY = ARCH("v118");
const PIRES_REPARE_BODY = ARCH("v119");
const NADEGE_RECONNEXION_BODY = ARCH("v120");
const JOSEPHINE_HATCHIMALS_BODY = ARCH("v121");
const ROMAIN_PHOTOS_BODY = ARCH("v122 - ATTENTION : affirmait a tort que les photos etaient en cause, rectifie par v123");
const ROMAIN_RECTIF_PHOTOS_BODY = ARCH("v123");
const EBAY_REAUTH_NOUVEAUX_BODY = ARCH("v124");
const SUJET_EBAY_REAUTH = "Ta publication eBay est en attente - comment la débloquer";
const CLEM_SESSIONS_BODY = ARCH("v125");
const SUJET_CLEM_SESSIONS = "Ta synchronisation Vinted - la connexion à faire dans ton navigateur";
const LIVRES_DEBLOQUES_BODY = ARCH("v127");
const SUJET_LIVRES = "Tes republications de livres repartent";
const QUESTION_BODY_V128 = ARCH("v128 - lot question du 04/09");
const REACTIVATION_BODY_V128 = ARCH("v128 - lot reactivation du 04/09");
const PHILIPPE_EBAY_BODY = ARCH("v129 - connexion eBay, 04/09");
const SUJET_PHILIPPE_EBAY = "Ta publication eBay est en attente";
const LAURIANE_COMPTES_BODY = ARCH("v130 - pas d'identifiants a saisir, 04/09");
const LAURIANE_ADRESSE_BODY = ARCH("v131 - adresse de remise deja renseignee, 04/09");
const SUJET_LAURIANE_COMPTES = "Re: merci";
const SUJET_LAURIANE_ADRESSE = "Re: merci";
const MARIE_VINTED_BODY = ARCH("v132 - connexion Vinted, 04/09");
const SUJET_MARIE_VINTED = "Ton annonce est prête à partir";
const MERCURY_MERCI_BODY = ARCH("v133 - merci + annonce cuillere, 05/09");
const SUJET_MERCURY_MERCI = "Merci - et une petite manip pour ton annonce";
const GERONIMO_PAIEMENT_BODY = ARCH("v134 - paiement 3DS echoue, 05/09");
const SUJET_GERONIMO_PAIEMENT = "Ton abonnement FillSell - le paiement n'est pas passé";

const GERONIMO_LBC_BODY = ARCH("v135 - ATTENTION : disait a tort qu'il n'etait pas connecte a Leboncoin. La sonde HTTP leboncoin est a 403 pour tout le parc. Vraie cause : bug de code, corrige dans 0.6.20");
const SUJET_GERONIMO_LBC = "Re: Ton abonnement FillSell - le paiement n'est pas passé";

const RETOUR_BODY = ARCH("v113 - campagne RETOUR du 31/08");
const SUJET_RETOUR = "Ce qui a changé sur FillSell depuis ton dernier passage";

const CIBLE_RETOUR: string[] = []; // campagne RETOUR du 31/08 — adresses retirees le 20/09 (le fichier entre dans git). Campagne CLOSE ; le registre des envois vit dans email_logs.

const LOT_403_0409: string[] = []; // lot 403 du 04/09 — adresses retirees le 20/09 (le fichier entre dans git). Campagne CLOSE ; le registre des envois vit dans email_logs.
const LOT_LIVRES_0409: string[] = []; // lot livres du 04/09 — adresses retirees le 20/09 (le fichier entre dans git). Campagne CLOSE ; le registre des envois vit dans email_logs.
const LOT_QUESTION_0409: string[] = []; // lot question du 04/09 — adresses retirees le 20/09 (le fichier entre dans git). Campagne CLOSE ; le registre des envois vit dans email_logs.
const SUJET_QUESTION = "Une question rapide sur ton expérience FillSell";
const LOT_REACTIVATION_0409: string[] = []; // lot reactivation du 04/09 — adresses retirees le 20/09 (le fichier entre dans git). Campagne CLOSE ; le registre des envois vit dans email_logs.
const SUJET_REACTIVATION = "Tes articles sont dans FillSell - et maintenant ?";

const DEPOP_API_BODY = ARCH("v136 - business@depop.com, 05/09");
const SUJET_DEPOP_API = "Selling API access request - FillSell, French cross-listing app";
const DEPOP_DEV_BODY = ARCH("v137 - developers@depop.com, 05/09");
const SUJET_DEPOP_DEV = "Selling API access - FillSell (cross-listing, France)";
const OPLA_API_BODY = ARCH("v136 - contact@opla.co, 05/09");
const SUJET_OPLA_API = "Intégration FillSell - publier sur Opla depuis notre application";

const GERONIMO_CARTE_BODY = ARCH("v138 - 2e echec de paiement, 05/09");
const SUJET_GERONIMO_CARTE = "Re: Ton abonnement FillSell - le paiement n'est pas passé";

const LILY_EBAY_BODY = ARCH("v139 - page identifiant eBay, 05/09");
const SUJET_LILY_EBAY = "Re: Ton lien pour installer l'extension FillSell";

const LILY_LBC_BODY = ARCH("v141 - nom/prenom Leboncoin, 06/09");
const SUJET_LILY_LBC = "Tes annonces Leboncoin sont en attente";

const ROMAIN_UPLOAD_BODY = ARCH("v143 - upload photos Mac, 06/09");
const SUJET_ROMAIN_UPLOAD = "Re: Je suis bloqué ici";

const GERONIMO_ATTENTE_BODY = ARCH("v144 - Beebs en attente + LBC corrige, 06/09");
const SUJET_GERONIMO_ATTENTE = "Tes publications en attente";

const CLAEYS_MULTICOMPTES_BODY = ARCH("v145 - multi-comptes Vinted, 06/09");
const SUJET_CLAEYS_MULTICOMPTES = "Re: Bienvenue sur FillSell";

const CLAEYS_BOUTIQUES_BODY = ARCH("v146 - filtre de boutiques, 06/09, 2e mail du jour");
const SUJET_CLAEYS_BOUTIQUES = "Re: Bienvenue sur FillSell";

const JOSEPHINE_TAILLE_BODY = ARCH("v145 - double taille Beebs, 06/09, 1er mail du jour");
const SUJET_JOSEPHINE_TAILLE = "Re: Votre publication repartira dès que Chrome sera ouvert";

const JOSEPHINE_MERCI_BODY = ARCH("v147 - merci + remise a zero du compteur d'annonces, 06/09 23h, 2e mail du jour");
const SUJET_JOSEPHINE_MERCI = "Re: Vos retours - merci";

const ADAAM_IA_BODY = ARCH("v148 - non, l'IA ne repond pas aux acheteurs. Envoye le 06/09 a 23h20");
const SUJET_ADAAM_IA = "Re: Question";

const AKIYA_PRORATA_BODY = ARCH("v149 - prorata a l'upgrade + grille 12,99/29,99/59,99. Envoye le 07/09 a 07:14. 1er mail du jour");
const SUJET_AKIYA_PRORATA = "Re: Bienvenue sur FillSell";

const AKIYA_MULTI_BODY = ARCH("v150 - multi-comptes Vinted existe deja + Opla/Depop en chantier. Envoye le 07/09 a 08:15. 2e mail du jour");
const SUJET_AKIYA_MULTI = "Re: Bienvenue sur FillSell";

const CLAEYS_PARAMETRES_BODY = ARCH("v151 - pas de compte LBC a associer + pas de messages auto aux favoris. ENVOYE le 07/09 a 10:19. 1er mail du jour");
const SUJET_CLAEYS_PARAMETRES = "Re: Paramétrage de mon compte";

const CLAEYS_REGLAGES_BODY = ARCH("v152 - JAMAIS ENVOYE, devenu hors sujet apres son annulation de 10:27");
const SUJET_CLAEYS_REGLAGES = "Re: Paramétrage de mon compte";

const CLAEYS_ANNULATION_BODY = ARCH("v153 - annulation confirmee + question sur la raison du depart. ENVOYE le 07/09 a 12:21");
const SUJET_CLAEYS_ANNULATION = "Re: annulation de mon abonnement";

const CLAEYS_REMBOURSEMENT_BODY = ARCH("v154 - remboursement 29,99 EUR confirme. ENVOYE le 07/09 a 12:43");
const SUJET_CLAEYS_REMBOURSEMENT = "Re: annulation de mon abonnement";

const AKIYA_BANS_BODY = ARCH("v155 - risque de ban : session du navigateur, aucun identifiant stocke, republication prudente, cadence espacee. ENVOYE le 07/09");
const SUJET_AKIYA_BANS = "Re: Bienvenue sur FillSell";

const ROMAIN_QUOTA_BODY = ARCH("v156 - fin des Pepites + passage aux quotas + compteur remis a zero. ENVOYE le 07/09 vers 19h50");
const SUJET_ROMAIN_QUOTA = "Re: Je suis bloqué ici";

const JOSEPHINE_RETOURS_0809_BODY = ARCH("v158 - merci + republications reparties + suggestions prises. ENVOYE le 08/09 vers 08:55. 1er mail du jour");
const SUJET_JOSEPHINE_RETOURS_0809 = "Re: Tes retours - c'est réglé de notre côté";

const ROMAIN_COUPON_BODY = ARCH("v159 - quota decompte a la GENERATION + code MERCIROMAIN (coupon RZfhkdCk, 100 %, once, 1 usage). ENVOYE le 08/09 vers 12:01. 1er mail du jour");
const SUJET_ROMAIN_COUPON = "Re: Ton premier mois est offert";

const SAMIRA_PAIEMENT_BODY = ARCH("v160 - paiement Link refuse (rien debite) + invitation a essayer gratuitement. ENVOYE le 08/09 a 12:52. 1er mail du jour");
const SUJET_SAMIRA_PAIEMENT = "Ton paiement n'est pas passé - et tu peux commencer gratuitement";

const SAMIRA_SYNC_BODY = ARCH("v161 - sync passee, 201 articles + redirection du support vers le mail. ENVOYE le 08/09 a 13:20. 2e mail du jour");
const SUJET_SAMIRA_SYNC = "Ta synchronisation est passée - 201 articles importés";

// ATTENTION : le v162 disait a tort qu'un BROUILLON Leboncoin bloquait le depot.
// C'ETAIT FAUX. Rectifie par le v163 ci-dessous.
const SAMIRA_LBC_BEEBS_BODY = ARCH("v162 - ERRONE : demandait de supprimer un brouillon Leboncoin qui n'existe pas. Rectifie par v163. ENVOYE le 08/09 a 13:40. 3e mail du jour");
const SUJET_SAMIRA_LBC_BEEBS = "Tes annonces Leboncoin et Beebs - deux choses à faire";

// v163 - 08/09 14h10. 4E MAIL DU JOUR a une utilisatrice.
// EXCEPTION AU PLAFOND, decidee par Nico : le v162 lui donnait une consigne
// FAUSSE (supprimer un brouillon inexistant), il fallait rectifier vite.
//
// LA VRAIE CAUSE, verifiee par Claude directement en base sur les 6 jobs :
// platform_fields->>'last_diagnostic' est IDENTIQUE sur les six et contient
// la liste des boutons reellement presents sur la page au moment de l'echec :
//   ["Refuser","Accepter"] x7 + ["Voir nos partenaires"]
// Aucun bouton du wizard de depot, aucun "Quitter". C'est la fenetre de
// consentement Didomi de Leboncoin : la page de depot n'a JAMAIS ete atteinte.
// Il n'y a pas de brouillon et il n'y en a jamais eu.
//
// POURQUOI ELLE SEULE : le consentement Didomi est stocke PAR NAVIGATEUR.
// Tous les autres comptes l'ont franchi il y a longtemps. Elle s'est abonnee
// a 13h11 aujourd'hui, son Chrome n'avait jamais vu Leboncoin.
// Le code entrait dans la branche "brouillon bloquant", ne trouvait pas de
// bouton "Quitter" (normal, pas de wizard) et concluait a tort au brouillon.
//
// Correctif extension a venir (detecter Didomi avant de conclure) - non code
// a ce stade, et de toute facon soumis a la review CWS.
// Beebs volontairement NON mentionne ici : une seule consigne, une seule action.
const SAMIRA_COOKIES_BODY = wrap(
  p("Bonjour,") +
  p("Rectification, et c'est plus simple que ce que je t'ai écrit tout à l'heure : <strong>il n'y a aucun brouillon à supprimer</strong>. Oublie ce message.") +
  p("Ce qui bloque, c'est la fenêtre de cookies de Leboncoin. Ton navigateur n'y a jamais répondu, donc la page reste bloquée dessus et nos publications ne peuvent pas aller plus loin.") +
  p("Une seule chose à faire, une seule fois :<br /><strong>Ouvre leboncoin.fr dans ton Chrome et réponds à la fenêtre qui s'affiche sur les cookies.</strong> Accepter ou refuser, comme tu veux.") +
  p("C'est tout. Tes six annonces Leboncoin repartiront ensuite toutes seules.") +
  p("Nico")
);
const SUJET_SAMIRA_COOKIES = "Tes annonces Leboncoin - la vraie raison, et c'est simple";

// ── Mail de validation du nouveau template (13/09/2026) ─────────────────────
// Destinataire UNIQUE : Nico, pour voir le rendu réel dans une vraie boîte.
// Exerce d'un coup tous les blocs de la bibliothèque. Le texte est une
// démonstration neutre : aucun chiffre sur son compte, aucune adresse, aucune
// raison sociale — rien qui ne soit vérifiable.
const DEMO_TEMPLATE_SUJET = "Aperçu du nouveau modèle d'email FillSell";
const DEMO_TEMPLATE_HTML = (lienDesinscription: string) => renderEmail({
  titre: "Voici le nouveau modèle d'email",
  surtitre: "Aperçu interne",
  preheader: "Tous les blocs du modèle, dans un seul message.",
  ligneService: "Aperçu du 13 septembre 2026",
  corps: [
    paragraphe([
      "Ce message n'a qu'un but : montrer le rendu réel du modèle dans une vraie boîte mail. ",
      gras("Aucune action n'est attendue"),
      ".",
    ]),
    paragraphe(
      "Chaque bloc ci-dessous est un élément réutilisable. On compose un mail en les empilant, sans jamais retoucher le HTML.",
    ),
    listePuces([
      "Une liste à puces, pour énumérer sans surcharger le texte.",
      "Les couleurs et la typographie viennent de l'app, pas d'un modèle générique.",
      "Tout est en CSS inline : le rendu tient dans Gmail comme dans Outlook.",
    ]),
    encadre(
      "Bon à savoir",
      "Ce bloc encadré sert à mettre en valeur une information utile sans en faire une alerte.",
    ),
    statut(
      "Bloc de statut",
      "La pastille a trois niveaux, et le statut est toujours écrit en toutes lettres : la couleur ne porte jamais l'information seule.",
      "ok",
    ),
    boutonPrincipal("Bouton principal", "https://fillsell.app/app"),
    separateur(),
    boutonSecondaire("Bouton secondaire", "https://fillsell.app/legal"),
  ],
  signatureNom: "Nico",
  signatureRole: "FillSell",
  // Le lien réel, fonctionnel : c'est aussi ce qu'on teste ici.
  lienDesinscription,
});

// ── Eric (un utilisateur), 13/09 — connexion Leboncoin et Beebs ────────
// Inscrit le 13/09 à 14:19, extension 0.6.33 : 4 publications Leboncoin et
// 2 Beebs attendent sa connexion aux deux sites dans Chrome. Le message
// « brouillon Leboncoin » qu'il a vu était FAUX (mur de connexion pris pour un
// brouillon par leboncoin.js, corrigé le 13/09). Texte de Nico, verbatim.
// Catégorie 'support' : réponse à sa situation, jamais filtrée, sans lien de
// désinscription. UN destinataire, UN envoi (only_to <adresse>__connexion_1309).
const SUJET_ERIC_CONNEXION_1309 = "Tes annonces sont prêtes à partir";
const ERIC_CONNEXION_1309_HTML = renderEmail({
  titre: "",
  corps: [
    paragraphe("Salut Eric,"),
    paragraphe("Tes 64 articles sont bien arrivés dans ton stock, et 6 publications t'attendent sur Leboncoin et Beebs."),
    paragraphe("Il manque juste une chose : connecte-toi à Leboncoin et à Beebs sur ton ordinateur. Dès que ce sera fait, les publications partiront toutes seules, tu n'auras rien d'autre à faire."),
    paragraphe("Le message que tu as vu tout à l'heure était trompeur — il venait de chez nous, on l'a corrigé."),
    paragraphe("Si quelque chose coince, écris-nous, on regarde ton compte nous-mêmes."),
    paragraphe("Nico"),
  ],
});

// ── Louis, 19/09/2026 — bouton « Ajouter un article » grisé ─────────────────
// Il écrit à 19:41 : « Le bouton ajouter un article reste toujours
// indisponible », capture à l'appui, et demande une doc. Cause établie sur
// pièces : le bouton est désactivé par `!iTitle || !iBuy || (iAlreadySold &&
// !iSell)` (StockTab.jsx:7598) — le champ « Prix d'achat » est obligatoire et
// se trouve hors écran, plus haut dans le formulaire. Rien ne nomme le champ
// manquant : les deux phrases d'aide sont conditionnées à `items.length === 0`
// et il a 78 articles. Ni plafond, ni quota : il est Business.
const SUJET_LOUIS_AJOUT_1909 = "Re: Ajouter un article";
const LOUIS_AJOUT_1909_HTML = renderEmail({
  titre: "",
  corps: [
    paragraphe("Salut Louis,"),
    paragraphe("Le bouton reste grisé parce que le champ « Prix d'achat » est obligatoire, et il se trouve plus haut dans le formulaire — tu ne l'as probablement pas vu."),
    paragraphe("Pour tes articles imprimés, mets 0 : ça débloque l'ajout. On corrige les deux choses de notre côté : le bouton dira ce qui manque, et on ajoute une option pour les articles sans prix d'achat. Pour la doc, tu as raison, il n'y en a pas encore."),
    paragraphe("Sur tes republications : celles qui se sont arrêtées sur un message de catégorie, c'est le même défaut que ce matin. Une annonce déjà en ligne ne devrait rien avoir à redemander. C'est en cours de correction."),
    paragraphe("Et pour la suite : on est là. Au moindre blocage, écris-nous — on regarde tout de suite et on te répond dans l'heure."),
    paragraphe("Nico"),
  ],
});

// ── Louis, 19/09/2026 soir — description 500, relevé LBC, photos ───────────
// Trois réponses dans un même mail. ⚠️ Le paragraphe Leboncoin a été RÉÉCRIT
// après vérification en base : le brouillon disait « ton dernier relevé date
// de 18h31 » et « la mise à jour est arrivée à 18h41, dix minutes trop tard ».
// Les deux étaient faux — son dernier relevé est de 20:50, son extension
// (0.6.46, build 12:23:44Z) était chez lui depuis 14h23, et son relevé de
// 20:23 a déjà ramené 103 annonces. On ne lui demande donc pas de refaire un
// geste qui a marché.
const SUJET_LOUIS_SOIR_1909 = "Re: Petit soucis avec le boncoin";
const LOUIS_SOIR_1909_HTML = renderEmail({
  titre: "",
  corps: [
    paragraphe("Salut Louis,"),
    paragraphe("Le champ description est passé de 200 à 500 caractères, c'est actif. Recharge l'app et tu l'auras."),
    paragraphe("Pour tes annonces Leboncoin : le relevé ne remontait qu'une partie de ton catalogue, c'est corrigé — et c'est déjà arrivé chez toi. Ton relevé de 20h23 a bien ramené tes 103 annonces. Tu n'as rien à refaire."),
    paragraphe("Pour ajouter des photos sur un article créé à la main : aujourd'hui ce n'est pas possible, il faut passer par Lens. On va l'ajouter, à la création comme à la modification d'un article."),
    paragraphe("Nico"),
  ],
});

// ── Campagne de réactivation du 14/09/2026 — QUATRE segments ────────────────
//
// Cible : comptes SANS la moindre action depuis plus de 10 jours (sonde
// d'extension, job, sync, scan, vente, article, clic dans l'app). Le snapshot
// gelé vit dans public.campagne_reactivation_1409, une ligne par compte, une
// SEULE colonne segment : les quatre listes sont disjointes par construction.
//
// EXCLUS du snapshot, jamais servis par la branche de lot ci-dessous :
//   · les comptes payants inactifs (décision Nico du 14/09 : aucun mail) ;
//   · les comptes internes et de test ;
//   · les comptes qui ont demandé l'arrêt du marketing (email_logs
//     'marketing_optout'), en plus du filtre porté par envoyerEmail().
//
// Les quatre corps portent le lien de désinscription : ils sont 'marketing',
// donc filtrés par le socle si la personne s'est désinscrite entre-temps.
const REACTIV_CTA_EXTENSION = "https://fillsell.app/extension";
const REACTIV_CTA_APP = "https://fillsell.app/app";

// Segment A — inscrits, extension jamais installée. Un seul appel à l'action.
// Aucune nouveauté annoncée : ils n'ont jamais vu l'app tourner, ils n'ont
// aucun point de comparaison.
const REACTIV_A_SUJET = "Il manque l'extension à ton compte FillSell";
const REACTIV_A_HTML = (lienDesinscription: string) => renderEmail({
  surtitre: "Ton compte FillSell",
  titre: "Il manque l'extension",
  preheader: "C'est elle qui dépose tes annonces sur les sites de vente.",
  corps: [
    paragraphe("Bonjour,"),
    paragraphe("Tu as un compte FillSell, mais l'extension Chrome n'a pas encore été installée de ton côté."),
    paragraphe("C'est elle qui relie ton compte aux sites de vente : tu prépares ton annonce une fois, elle la dépose sur Vinted, Leboncoin, eBay et Beebs."),
    boutonPrincipal("Installer l'extension", REACTIV_CTA_EXTENSION),
    paragraphe("Si tu as déjà essayé et que quelque chose t'a arrêté en chemin, réponds à ce mail — on regardera ton compte nous-mêmes."),
  ],
  // PAS de « ça marche mieux maintenant » ici, délibérément : ce segment n'a
  // jamais vu l'app tourner. Sans point de comparaison, la phrase ne veut
  // rien dire pour lui, et elle sous-entend un passé bancal qu'il n'a pas
  // connu. (Arbitrage Nico du 14/09 : pas de nouveautés pour le segment A.)
  signatureNom: "Nico",
  signatureRole: "FillSell",
  lienDesinscription,
});

// Segment B — extension installée, aucune annonce jamais partie. La cause la
// plus fréquente relevée en base est une synchronisation qui n'a pas abouti,
// mais une partie d'entre eux n'en a jamais lancé : la phrase reste
// CONDITIONNELLE, on ne réveille aucun problème que la personne n'a pas vu.
const REACTIV_B_SUJET = "Où est-ce que ça s'est arrêté ?";
const REACTIV_B_HTML = (lienDesinscription: string) => renderEmail({
  surtitre: "On regarde avec toi",
  titre: "Où est-ce que ça s'est arrêté ?",
  preheader: "L'extension est installée, et aucune annonce n'est encore partie.",
  corps: [
    paragraphe("Bonjour,"),
    paragraphe("L'extension FillSell est bien installée chez toi, et pourtant aucune annonce n'est encore partie."),
    encadre(
      "Depuis ton dernier passage",
      "Beaucoup de mises à jour sont sorties ces dernières semaines. L'import du dressing et le dépôt des annonces sont bien plus solides aujourd'hui : ce qui t'a arrêté a de bonnes chances d'être déjà réglé.",
    ),
    // « Si c'est… » reste CONDITIONNEL : une partie de ce segment n'a jamais
    // lancé d'import et n'a donc jamais rien vu échouer. On ne réveille pas
    // un problème que la personne n'a pas connu.
    paragraphe("Si c'est l'import de ton dressing qui n'a pas abouti, dis-le-nous : on voit ce qui s'est passé de notre côté, et on te répond avec la suite."),
    boutonPrincipal("Reprendre où j'en étais", REACTIV_CTA_APP),
    paragraphe("Tu peux aussi répondre à ce mail, même en une ligne. Notre équipe le lit."),
  ],
  signatureNom: "Nico",
  signatureRole: "FillSell",
  lienDesinscription,
});

// Segment C — ont publié une à quatre fois, puis plus rien. Ils ont vu l'app
// marcher : on ne leur réexplique pas le produit, on demande.
const REACTIV_C_SUJET = "Ton compte FillSell t'attend";
const REACTIV_C_HTML = (lienDesinscription: string) => renderEmail({
  surtitre: "Ton stock est intact",
  titre: "Tu as publié, et puis plus rien",
  preheader: "Beaucoup a changé depuis tes premières annonces.",
  corps: [
    paragraphe("Bonjour,"),
    paragraphe("Tes premières publications sont bien parties avec FillSell, et depuis, on ne t'a plus vu."),
    encadre(
      "Ce qui a changé depuis",
      "L'app a reçu beaucoup de mises à jour. Les annonces partent plus vite, sur plus de sites, et plusieurs points qui accrochaient à l'époque ont été repris.",
    ),
    paragraphe("On préfère demander plutôt que deviner : est-ce que quelque chose t'a arrêté en route, ou est-ce que le moment n'était pas le bon ?"),
    paragraphe("Ton stock et tes réglages sont toujours là, tu reprends quand tu veux."),
    boutonPrincipal("Reprendre mes publications", REACTIV_CTA_APP),
    paragraphe("Et si tu as deux mots à nous dire sur ce qui n'allait pas, réponds à ce mail : c'est ce qui nous fait avancer."),
  ],
  signatureNom: "Nico",
  signatureRole: "FillSell",
  lienDesinscription,
});

// Segment D — de vrais utilisateurs, partis. On veut une RÉPONSE, pas un clic :
// pas de bouton, une seule question ouverte.
const REACTIV_D_SUJET = "Qu'est-ce qui t'a fait arrêter ?";
const REACTIV_D_HTML = (lienDesinscription: string) => renderEmail({
  surtitre: "Une question, une seule",
  titre: "Qu'est-ce qui t'a fait arrêter ?",
  preheader: "On veut ta réponse, pas un clic.",
  corps: [
    paragraphe("Bonjour,"),
    paragraphe("Tu as vraiment utilisé FillSell : tes annonces sont parties, tu connais l'outil. Et puis tu as arrêté."),
    paragraphe("On aimerait savoir pourquoi. Pas pour te faire revenir — pour comprendre ce qui n'a pas tenu."),
    paragraphe("Un truc qui n'a pas marché ? Trop de temps à y passer ? Le prix ? Ou tu as simplement arrêté de vendre ? Une phrase nous suffit, et c'est notre équipe qui la lira."),
    // La mention des mises à jour vient APRÈS la question et la désamorce
    // aussitôt : sur ce segment on veut une réponse, pas un clic, et une
    // annonce produit placée plus haut transformerait le mail en relance.
    encadre(
      "Au passage",
      "L'app a beaucoup changé depuis ton départ, et plusieurs choses que tu as pu croiser ont été reprises. Mais ce n'est pas l'objet de ce message — ta réponse nous intéresse davantage.",
    ),
  ],
  formuleFin: "Merci d'avance,",
  signatureNom: "Nico",
  signatureRole: "FillSell",
  // Aucun bouton, volontairement : la seule action attendue est « répondre ».
  lienDesinscription,
});

interface SegmentCampagne {
  sujet: string;
  buildHtml: (lienDesinscription: string) => string;
  /** Type one-shot d'email_logs — DOIT être dans email_logs_one_shot_unique. */
  type: string;
}

const REACTIV_SEGMENTS: Record<string, SegmentCampagne> = {
  A: { sujet: REACTIV_A_SUJET, buildHtml: REACTIV_A_HTML, type: "reactiv_1409_a" },
  B: { sujet: REACTIV_B_SUJET, buildHtml: REACTIV_B_HTML, type: "reactiv_1409_b" },
  C: { sujet: REACTIV_C_SUJET, buildHtml: REACTIV_C_HTML, type: "reactiv_1409_c" },
  D: { sujet: REACTIV_D_SUJET, buildHtml: REACTIV_D_HTML, type: "reactiv_1409_d" },
};

// ── LE REGISTRE NOMINATIF EST SORTI DU CODE (2026-09-20) ─────────────────
// Il portait ~110 adresses reelles et le detail de ce qui avait ete ecrit a
// chacune, du 31/08 au 19/09. C est la seule raison pour laquelle ce fichier
// etait exclu de git — donc la seule raison pour laquelle son jeton vivait en
// clair sans relecture possible.
//
// Ces campagnes sont TOUTES parties. Le registre durable de qui a recu quoi,
// c est `email_logs` en base (user_id + email_type), pas une constante dans
// une fonction. Les corps de mails restent au-dessus : ils disent ce qui a
// ete dit, sans dire a qui.
//
// Ce qui reste VIVANT et ne depend d aucune adresse ecrite ici : la campagne
// `reactivation_1409`, qui lit sa cible dans la vue campagne_reactivation_1409
// et se dedoublonne par reservation dans email_logs.
// ⛔ Reposer une adresse ici, c est re-sortir le fichier de git. On ne le fait
//    pas : un envoi nominatif se pilote par `only_to` et une ligne de base.
const ALL_EMAILS: Envoi[] = [];

serve(async (req) => {
  const url = new URL(req.url);
  if (!SECRET || url.searchParams.get("token") !== SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // ── Campagne de réactivation du 14/09 : envoi PAR LOT, verrouillé ─────────
  //
  //   ?token=…&campagne=reactivation_1409&segment=A
  //       → COMPTAGE SEC. Rend la cible restante, n'envoie RIEN.
  //   ?token=…&campagne=reactivation_1409&segment=A&go=oui&limit=150
  //       → envoie UN lot de 150, dans l'ordre (les plus récemment actifs
  //         d'abord : ce sont les plus rattrapables).
  //
  // CINQ VERROUS, tous fail-safe (le défaut ne poste rien) :
  //   1. `go=oui` absent → comptage sec. Un appel distrait n'envoie pas.
  //   2. La cible vient de campagne_reactivation_1409 WHERE motif_exclusion
  //      IS NULL : les payants inactifs, les comptes internes et ceux qui ont
  //      demandé l'arrêt du marketing n'y sont PAS. Le segment est une seule
  //      colonne : un compte ne peut pas appartenir à deux lots.
  //   3. Dédup email_logs par RÉSERVATION : la ligne est posée AVANT l'envoi.
  //      Un 23505 signifie « déjà servi », on passe au suivant. Jamais de
  //      lecture-puis-écriture. Si l'envoi échoue, la réservation est retirée
  //      pour que la personne reste renvoyable.
  //   4. Fenêtre 8h-22h Paris, échec fermé : heure illisible = aucun envoi.
  //   5. Le refus des désinscrits vit dans envoyerEmail(), pas ici : aucun
  //      appelant ne peut le lever.
  if (url.searchParams.get("campagne") === "reactivation_1409") {
    const seg = String(url.searchParams.get("segment") ?? "").toUpperCase();
    const modele = REACTIV_SEGMENTS[seg];
    if (!modele) {
      return new Response(JSON.stringify({ error: "segment inconnu", attendu: ["A", "B", "C", "D"] }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    const envoyer = url.searchParams.get("go") === "oui";
    const limite = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 0) || 50, 1), 400);
    const db = admin();

    // Lecture PAGINÉE : PostgREST tronque à 1000 lignes sans prévenir, et le
    // segment A en compte davantage. Un .limit(2000) ne suffit pas — c'est le
    // plafond du serveur qui coupe, pas le nôtre (relevé le 14/09 : la cible
    // A rendait exactement 1000 au lieu de 1756).
    const cibles: Array<{ user_id: string; email: string; jours_inactif: number }> = [];
    for (let page = 0; page < 20; page++) {
      const { data, error: errCibles } = await db
        .from("campagne_reactivation_1409")
        .select("user_id, email, jours_inactif")
        .eq("segment", seg)
        .is("motif_exclusion", null)
        .order("jours_inactif", { ascending: true })
        .order("email", { ascending: true })
        .range(page * 500, page * 500 + 499);
      if (errCibles) {
        return new Response(JSON.stringify({ error: "cible illisible", detail: errCibles.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      cibles.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) break;
    }

    // Déjà servis : lecture PAGINÉE (PostgREST tronque à 1000 sans prévenir).
    const servis = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const { data, error } = await db
        .from("email_logs")
        .select("user_id")
        .eq("email_type", modele.type)
        .order("id", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) {
        return new Response(JSON.stringify({ error: "email_logs illisible", detail: error.message }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      for (const l of data ?? []) servis.add(String(l.user_id));
      if ((data?.length ?? 0) < 1000) break;
    }

    const restants = cibles.filter((c) => !servis.has(String(c.user_id)));

    if (!envoyer) {
      return new Response(JSON.stringify({
        campagne: "reactivation_1409", segment: seg, type: modele.type,
        sujet: modele.sujet, mode: "comptage sec (ajouter &go=oui pour envoyer)",
        cible_totale: cibles.length, deja_servis: servis.size,
        restants: restants.length,
        prochain_lot: restants.slice(0, limite).map((c) => c.email),
      }), { headers: { "Content-Type": "application/json" } });
    }

    const h = heureParis();
    if (!Number.isFinite(h) || h < 8 || h >= 22) {
      return new Response(JSON.stringify({
        campagne: "reactivation_1409", segment: seg, envoyes: 0,
        refus: `fenêtre d'envoi 8h-22h Paris (heure lue : ${h})`,
      }), { headers: { "Content-Type": "application/json" } });
    }

    const lot = restants.slice(0, limite);
    let envoyes = 0, deja = 0, refuses = 0;
    const echecs: Array<{ email: string; motif: string }> = [];

    for (const c of lot) {
      // Réservation, envoi, relâchement en cas d'échec et journal : TOUT vit
      // dans la porte depuis le 19/09 (dedup: "reservation"). La séquence en
      // trois gestes qui était écrite ici en doublonnait désormais l'écriture
      // email_logs — la porte aurait lu son propre 23505 et conclu « déjà
      // envoyé » sans jamais poster. Les quatre types reactiv_1409_* sont bien
      // dans l'index one-shot en prod : la réservation protège vraiment.
      let r: Awaited<ReturnType<typeof envoyerEmail>>;
      try {
        r = await envoyerEmail({
          to: c.email,
          subject: modele.sujet,
          html: modele.buildHtml(await lienDesinscription(c.email, c.user_id)),
          type: modele.type,
          userId: c.user_id,
          categorie: "marketing",
          dedup: "reservation",
        });
      } catch (e) {
        r = { to: c.email, type: modele.type, categorie: "marketing", envoye: false, motif: String(e) };
      }
      if (r.envoye) { envoyes++; continue; }
      if (r.motif === "deja_envoye") { deja++; continue; }
      // Un refus 'desinscrit' est définitif, on ne la recompte pas en échec.
      if (r.motif === "desinscrit") { refuses++; continue; }
      echecs.push({ email: c.email, motif: r.motif ?? `http ${r.status}` });
    }

    return new Response(JSON.stringify({
      campagne: "reactivation_1409", segment: seg, type: modele.type,
      lot_demande: limite, envoyes, deja_servis_dans_le_lot: deja,
      refuses_desinscrits: refuses, echecs,
      restants_apres: restants.length - envoyes - deja - refuses - echecs.length,
    }), { headers: { "Content-Type": "application/json" } });
  }

  const onlyTo = url.searchParams.get("only_to");
  const batch = url.searchParams.get("batch");

  if (batch === "retour" || batch === "403_0409" || batch === "livres_0409" || batch === "question_0409" || batch === "reactiv_0409") {
    return new Response(JSON.stringify({ error: "lot deja envoye - rejeu desactive", batch }), { status: 409, headers: { "Content-Type": "application/json" } });
  }

  if (!onlyTo) {
    return new Response(JSON.stringify({
      error: "only_to requis",
      destinataires: ALL_EMAILS.map(e => ({ to: e.to, subject: e.subject })),
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const emails = ALL_EMAILS.filter(e => e.to === onlyTo);
  if (emails.length === 0) {
    return new Response(JSON.stringify({ error: "destinataire inconnu", only_to: onlyTo }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  const results = [];
  for (const email of emails) {
    const realTo = email.to.split("__")[0];
    // GARDE-FOU : le filtre de désinscription vit DANS envoyerEmail(), pas
    // ici. Aucun appelant ne peut le lever, et un envoi dont la catégorie
    // n'est pas déclarée est traité comme 'marketing', donc filtré.
    // Le lien de désinscription n'est fabriqué que pour les mails qui en
    // portent un : le construire crée le jeton de l'adresse.
    const html = email.buildHtml
      ? email.buildHtml(await lienDesinscription(realTo))
      : (email.html ?? "");
    // ── CES ENVOIS LAISSENT ENFIN UNE TRACE (19/09/2026) ────────────────────
    // Relevé de Phase 0 : ~45 mails nominatifs partis depuis le 31/08 sans une
    // seule ligne en base — ni qui, ni quand, ni quoi. Le suffixe « __xxx » du
    // destinataire nomme déjà chaque envoi : il devient le type.
    // Type RÉCURRENT (plusieurs mails à la même personne, c'est le principe
    // même de ce fichier) → JAMAIS dans l'index one-shot, et dedup 'journal'.
    const suffixe = email.to.includes("__") ? email.to.split("__").slice(1).join("__") : "nominatif";
    const r = await envoyerEmail({
      to: realTo,
      subject: email.subject,
      html,
      type: `relance_manuelle:${suffixe}`.slice(0, 120),
      categorie: email.categorie ?? "marketing",
      dedup: "journal",
    });
    results.push({
      to: r.to,
      type: r.type,
      categorie: r.categorie,
      ok: r.envoye,
      status: r.status ?? null,
      motif: r.motif ?? null,
      journalise: r.journalise ?? null,
    });
  }
  return new Response(JSON.stringify({ sent: results }), { headers: { "Content-Type": "application/json" } });
});
