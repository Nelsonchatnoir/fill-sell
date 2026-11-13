# Étape 4 — Bloc 2 : support des comptes hors France — PLAN (12/11/2026, lecture seule ; copié du brouillon de session le 13/11)

Lectures : code du dépôt (HEAD 9ad5320), prod en --read-only, audit bloc2-3cd.md § 2. Rien écrit.

## 1. État des lieux
### 1.1 Déjà par site
- Site brut du compte : ebay_accounts.ebay_site (GetUser <Site>), écrit à la liaison (ebay-oauth-callback:80-89), relu
  paresseusement (_shared/ebay-site.ts:52-71, une tentative / 24 h), servi à l'app (ebay-oauth.ts:265-267, etatPublic).
- Aiguillages prévus non branchés : appelEbay(…, { marketplace }) (ebay-oauth.ts:321-345, mais Accept/Content-Language
  figés fr-FR 331-332) ; lireServicesMetadata(env, siteId) (ebay-shipping.ts:88, table MARCHE_PAR_SITE = 71 seul, l.65) ;
  fetch-ebay-aspects marketplace_id (l.244) ; ebay_item_aspects stocke marketplace_id mais clé primaire = category_id seul.
- États par IDENTIFIANT de condition eBay (1000…7000, ebay-publication.ts:275-366).
- Ventes : devise lue (ebay-ventes-sync:134) ; ventes.devise (EUR 89 422, nulle 6 822, GBP 455, USD 196, AUD 23, CAD 12).
- Depop : région de grille GB/US/AU (depop.js:248-293) ; Vinted : domaines zone euro (vinted-origine.js:32-38), sonde
  pays/langue (background.js:15029-15034), interrupteurs <plateforme>_pays_<cc> (plateformes-pays.js:72).
### 1.2 Figé sur EBAY_FR (fichier:ligne)
- ebay-publication.ts : MARKETPLACE/ARBRE 71 (30-31, 313, 422, 439-464, 924) ; Département FR (480-483, 736-741) ; aspects
  par nom FR (595-600, 763-780) ; « Ne s'applique pas » (558) ; emplacement code postal ^\d{5}$ (970), country FR (987) ;
  urlAnnonce ebay.fr (1041-1043). ebay-aspects-ia.ts:82 (taille FR). ebay-oauth.ts:331-333. ebay-shipping.ts:50-65, 93.
- ebay-account : EBAY_FR (98, 112, 717, 737, 821, 868, 961), EUR (274, 301, 367, 383), écritures refusées aux comptes
  étrangers (618-629). ebay-api-worker : offre EBAY_FR + EUR (844-848), Browse EBAY_FR (2746, 2957, 3027, 3412, 3705,
  3917, 3981), clôtures hors France (195, 338-359, 4247-4255). RPC spend_coins_and_publish : ne lit jamais le site eBay.
- App : ebayCategories.js (arbre FR), regles.js:411 (aspects FR), LPS 5525-5527 (grisage), 5821-5825, 8217, 11252,
  11267 ; App.jsx 2428-2466 (relecture sur visibilitychange seulement). Extension : depop.js:251, 782-785 (attente sans
  fin), 855 (EUR) ; vinted-origine.js (pas de .co.uk/.com).
- ⛔ Piège actif : fetch-ebay-aspects appelé avec un autre marketplace ÉCRASERAIT le cache FR (onConflict category_id).
### 1.3 Parc (12/11)
ebay_accounts actifs : France 140, nul 54 (tous API, renouvellement valide), US 8, UK 5, DE 2, IT 2, BE 2, AT 1.
eBay 30 j : API 1 589 jobs / 61 comptes ; extension 227 / 33 comptes. c7c382b7 : EBAY UK, aucune politique,
aucun emplacement, objet en France, app en anglais, prix en euros.

## 2. Modèle : le site de chaque compte de plateforme
- Table public.comptes_plateformes (M1) : user_id, plateforme (ebay|vinted|depop|leboncoin|beebs), compte, site
  (EBAY_GB, VINTED_FR, DEPOP_GB, LEBONCOIN_FR, BEEBS_FR), pays ISO, langue BCP 47, devise ISO, source, brut jsonb, lu_le,
  pilote ; PK (user_id, plateforme, compte) ; RLS lecture propriétaire, écriture serveur ; inconnu = pas de ligne ; jamais
  une ligne inchangée réécrite ; remplissage initial par script (sauvegarde, inverse).
- Module pur _shared/sites-plateformes.js : GetUser Site → EBAY_xx / langue / devise / domaine ; pays sans marketplace
  Inventory → EBAY_US en anglais ; jamais EBAY_FR pour un compte étranger ; arbre de catégories LU (jamais en dur).
- Écrivent : callback eBay, siteDuCompteEbay, lecture des 54, get-pending-jobs (Vinted), sonde Depop. Lisent : app,
  worker, get-pending-jobs, RPC (si D4 = refus), extension (site_compte dans le job).
- M2 (L2) : ebay_item_aspects_sites (PK marketplace, category) ; ebay_rayons_par_site.

## 3. Livraisons
- L0 (S, ½ j) : lecture unique des 54 (action existante ebay-api-worker { action: "site_compte" } : Trading GetUser
  avec le jeton du vendeur ; effets : ebay_site, jeton renouvelé, révocation constatée) + mesures Taxonomy/Metadata/Browse
  sur EBAY_GB, US, BE, DE, AT, IT (lecture). ⛔ Les 54 lus, le filet actuel fermera les tâches eBay en attente de ceux
  hors France (D9).
- L1 (M, 1-1,5 j) : M1 + module + rédacteurs ; etatPublic + site_compte. Verrous sites-plateformes, une-ecriture.
- L2 (L, 2 j) : ContexteSite résolu une fois par job (marketplace, arbre, langue, devise, domaine, pays) partout ;
  M2 ; sites FERMÉS. Verrou ebay-site-fr-a-l-octet (rejeu FR identique) + cache par site.
- L3 (M, 1 j) : destination-ebay (ouvert / pilote / fermé) ; relevés, ventes, retraits jamais fermés ; D4, D6.
- L4 (L+, 3-4 j) : eBay UK de bout en bout serveur : rayon par site, aspects en anglais par concept, langue (D2), prix
  en devise du site obligatoire (prix_site, sinon question, rien envoyé), lieu FR, politiques EBAY_GB sur clic.
- L5 (L, 2-3 j + OTA) : app (relecture de l'état eBay, plus de grisage pour un site ouvert, prix en £, Réglages).
- L6 : pilote c7c382b7 → 4 autres UK → BE → US → DE/AT → IT (mesure, dictionnaire, preuve réelle, interrupteur).
- L7 (M, 2 j + CWS) : Depop hors zone euro. L8 (L, 3 j+ + CWS) : Vinted UK/US.
Estimation : eBay UK + BE + US ≈ 11 à 14 jours ; tout ≈ 18 à 22 jours.

## 4. Risques
Argent (euros publiés en livres → prix_site obligatoire, une seule fonction prixPourSite) ; frais eBay et TVA jamais
affirmés ; expédition internationale (services lus) ; faux « annonce disparue » si Browse en EBAY_FR ; tailles FR fausses
en UK ; langue ; cache d'aspects écrasé ; anciennes apps ; comptes eBay par l'extension (33).
Écritures chez eBay (liste fermée) : opt_in SELLING_POLICY_MANAGEMENT (clic), politiques paiement/retour/livraison du site
(clic), inventory location (1re publication), inventory_item, offer + publish, withdraw/EndItem, modification, abonnement
ORDER_CONFIRMATION (existant).

## 5. Décisions pour Nico
D1 prix en devise du site (saisi / taux BCE proposé / même nombre) ; D2 traduction IA ou non ; D3 tailles FR→UK (table ou
question) ; D4 pendant la construction : clôture actuelle / refus RPC / attente ; D5 pilote et preuve ; D6 rouvrir les 30
publications closes de c7c382b7 ; D7 lire ses politiques EBAY_GB avec son jeton ; D8 ordre des sites ; D9 lancer L0 maintenant ;
D10 comptes eBay par l'extension (33) et clients Cloud sans API (3) ; D11 Depop/Vinted hors euro maintenant ou au premier
cas ; D12 statistiques multi-devises.
