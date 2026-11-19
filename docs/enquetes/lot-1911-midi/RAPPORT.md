# Lot du 19/11 midi — terminal PROBLÈMES (points 1 à 6 de Nico, et l'urgence Cloud 8fd44622)

> Heure de Paris. Comptes par leur id8. Suite de `docs/enquetes/lot-1911-t2bis/RAPPORT.md`.

## 1. eBay : relevé par l'extension cassé depuis le 17/11 (8 comptes)
- Cause prouvée sur la vraie page (Chrome de Nico, lecture seule) : un compte sans Hub vendeur activé est renvoyé de
  `/sh/lst/active` vers `/sh/landing` depuis le 17/11 04:03 (27 échecs « le Hub vendeur n'a pas rendu son compteur »).
  Même cause pour le retrait eBay par l'extension. Les comptes à Hub ouvert (7153db13, ee6173b8, 25caeedd) marchent.
- Correctif : extension 0.6.194 — le Hub d'abord, sinon « Mon eBay › En cours » (`/mys/active`), complet seulement si
  les lignes lues = « Tout (N) ». Règle : `docs/regles/plateformes.md` (19/11 midi). Verrou `selftest:ebay-releve-hub`
  (36 cas rouges avant, 42 verts après).
- Preuve sur la vraie page (19/11, compte de Nico) : `/sh/lst/active` → `/sh/landing` ; le lecteur de la 0.6.194 lit
  `/mys/active` : « Tout (6) », 6 lignes, 0 illisible, numéros, titres et prix lus → complet. Le relevé complet de bout
  en bout se prouve quand la 0.6.194 tourne (Web Store, ou copie Cloud pour les comptes Cloud).
- Retrait par « Mon eBay » : préparé sans clic (la confirmation de « Terminer la vente » n'a jamais été vue).
- Ventes manquées (lecture seule, pages eBay réelles) : 5 annonces eBay en ligne pour un article vendu ailleurs —
  d5531b8e 920146900802, e383895d 206661274508 (cette panne), ee6173b8 146078532793, de63ca45 377444213901,
  82e64f14 237116023942 (hors panne) ; 90ace0e4 rattrapé seul. Question : 36b3c8c0, deux annonces eBay de la même clé.
  Rien touché : décision de Nico attendue.

## 2. Retraits eBay après une déconnexion
- `rearmementEbayPermis` (`_shared/ebay-voie.ts`) : un retrait repart dès la reconnexion, sans les trois règles de vente ;
  les publications attendent toujours le compte prêt. Verrou `selftest:ebay-retrait-sans-politiques` (rouge 15 → vert 21).
- Annonces en ligne à cause de cette règle le 19/11 : aucune (4 retraits ouverts, bloqués pour d'autres raisons).

## 3. 8ac5bbda : valeurs fausses (a) et annonces eBay non modifiables (b)
- a) 22 articles des 17-18/11 comparés plateforme par plateforme : ce qui est parti = ce que nous avons envoyé (relevés
  identiques), ses corrections sont venues ensuite. Fautes de notre règle, corrigées : couleur LBC (nuance de la fiche
  remplacée par le mot de base du titre), taille LBC homme sautée en silence, caractéristiques eBay lues dans des mots
  ordinaires, couleur Beebs hors palette. Règle : `docs/regles/plateformes.md` (19/11 midi). Verrou
  `selftest:lot-1911-champs-faux` (36 rouges → 49 verts). Rejeu 30 jours (lecture seule) : 14 couleurs LBC changent,
  74 valeurs eBay fausses retirées (dont « Personnage » ×68), 153 couleurs Beebs écrites dans la palette ; ~120
  questions « Taille (Leboncoin) » par mois au lieu d'annonces sans taille. Ses annonces en ligne : non touchées.
- Ouvert, écran du lot (Opus-1) : taille de la fiche contraire au FR/W du titre ; format LBC « Petit » posé « manuel ».
- Choix laissés à Nico : Depop « Turquoise = aucune couleur », catégories de l'IA, matière « Laine » d'un mélange,
  marques « Autre ».
- b) Règle d'eBay : une annonce créée par l'API Inventory ne se modifie pas dans Seller Hub, seulement par l'outil qui
  l'a créée (même constat que le 04/11). Recommandation : garder, le dire au client. Rien codé.

## 4. Genre eBay tapé à la main
- Ordre : choix de la personne (tapé compris) > étagère Vinted > déduction. Trace `genre_choisi_main` posée par le geste
  dans la carte eBay, lue dans l'app et au serveur. Verrou `selftest:ebay-genre-choix-main` (8/28 → 29/29). OTA requise.

## 5. Série eBay : rien codé.

## 6. Mails de vente : la plateforme dans l'objet et le texte
- `objetMailVente` : « Vente <Plateforme(s)> — N article(s) vendu(s) 🎉 », phrase d'ouverture « … sur <Plateforme(s)> »,
  sur les trois formes ; rien d'autre ne change. Règle : `docs/regles/ventes-et-retraits.md` (19/11 midi). Verrou
  `selftest:mail-vente-plateforme-objet` (46 échecs sur 47 → 28/28).

## Urgence 8fd44622 (Cloud, connexion Vinted)
- 6 tentatives 10:05 → 10:24, toutes par « Se connecter avec Google ». Google a accepté le navigateur Cloud et
  l'adresse, puis a refusé le mot de passe (« Mot de passe incorrect », lu sur la page à 10:19-10:20, « Afficher le mot de
  passe » coché). Aucun défaut chez nous (pas de page blanche, de captcha ni d'erreur serveur). Rien touché, rien envoyé.
- Refus « Mets à jour FillSell » 09:55-09:56 : la garde et le journal de paiement lisent la même version du binaire, lue au
  démarrage de l'app ; le refus exige < 2.9.205, et la même valeur dit 2.9.209 à 09:59:37 → l'app a redémarré avec un
  binaire plus récent entre-temps. La garde ne s'est pas trompée ; sa trace ne note pas le binaire (proposition).
