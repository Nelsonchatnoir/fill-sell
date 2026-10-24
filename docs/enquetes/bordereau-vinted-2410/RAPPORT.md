# Test réel du bordereau Vinted — 24/10 (vente de Nico à Ornella)

Demande de Nico (24/10, après le lot « zéro blocage ») : Ornella a acheté le « Short de bain Quiksilver taille M » de
Nico (compte nicolas.svobodny, fiche 1785871917724004, annonce Vinted 10144115529, commande 23532974658) vers 14:30.
Sur Vinted, aucun bordereau n'avait jamais été récupéré par FillSell : 8 demandes, 0 fichier, motif
« http_200_puis_200 » (Ornella 3 essais ; Louis : étiquette créée, 15 essais de fichier).

## 1. La vente

- **Vue et enregistrée** : vente 274921, écrite le 24/10 à 14:41:10 (vendue à 14:34:35 sur Vinted), après le
  rechargement de l'extension de 14:38 : un rechargement pendant une vente ne l'a pas perdue (la vente vit en base,
  relue au passage suivant).
- **Copies retirées** : Leboncoin 3277214299 (retrait 6f1f3e4e, `deleted`) et Beebs 34110240 (retrait d70d009c,
  `deleted`), armés par `vente_article_serveur` à l'instant de la vente.
- **Reste en ligne** : la copie eBay 800602514096 (8 €) — son retrait 3eb39e5b attend une connexion (« Connecte-toi à
  eBay sur ton ordinateur avec le compte nelsonthecat », `needs_user`). Garde voulue (connexion), mais une double vente
  reste possible sur eBay tant que Nico ne s'y connecte pas.

## 2. Le poste de Nico

- Dossier non empaqueté `C:\Users\nicol\FillSell-Extension-Nico` (lu dans les préférences de Chrome : extension
  `pedhgegmgjkdcbdeinjnhdpemnpafpdp`, chargement « développeur »). 0.6.124 sauvegardée, 0.6.134 copiée à 16:25.
- **Il se recharge seul désormais** (0.6.134, `verifierCopieNonEmpaquetee`) : une copie neuve (version du manifest
  différente) recharge l'extension au premier moment sûr, par le même chemin que la mise à jour du Web Store (jamais
  pendant un job, une recréation, un relevé ; la prise d'une demande de bordereau tient le verrou du passage).
  Prouvé deux fois : 0.6.134 → 0.6.135 (copie 16:52:27, rechargé 16:55:18) et 0.6.135 → 0.6.136 (copie 17:04:06,
  rechargé 17:06:53) — trace `usage_logs` `maj_extension` « rechargement:copie_non_empaquetee », 0 job en vol ;
  `profiles.extension_build` = `2026-10-24T15:03:41Z+c01418a`.

## 3. Le bordereau

- **Cause réelle de « http_200_puis_200 »** : l'extension n'acceptait qu'UNE forme de réponse, `{file:{label}}` (base64
  dans du JSON), lue dans le code du site le 16/10 et jamais vue en réponse réelle. `r.json()` sur un PDF rendait null :
  les deux routes (`pdf_label`, puis `digital_label`) répondaient 200 et rien n'était gardé — 36 passages pour rien.
- **Règle corrigée pour tous les comptes** (extension 0.6.136, `cheminBordereauVinted`) : le fichier se lit EN
  OCTETS — PDF / PNG / JPEG brut pris tel quel ; JSON : base64 (`file.label`, `label`, `file.content`, `file.data`,
  `data.label`) ou lien (`label_url`, `file.url`, `file.label_url`, `url`, `data.label_url`) suivi une fois (la
  session seulement à la même adresse que la page) ; un échec écrit la forme vue (route, http, type, taille, clés —
  jamais une valeur). Selftest `bordereau-fichier-octets` (5 cas) ; faux réseaux réalistes dans `messagerie` et
  `messagerie-generation`.
- **0.6.135 → 0.6.136** : la 0.6.135 gardait une adresse vinted.fr écrite en dur (repli hors navigateur) ; la garde des
  pays (`selftest:vinted-origine`) l'a refusée à la suite complète. Corrigé, re-empaqueté ; 0.6.135 jamais téléversée.
- **Forme RÉELLE, lue sur la commande 23532974658** (Vinted Go, 24/10) : `pdf_label` rend `{code: 0}` (aucun fichier) ;
  `digital_label` rend `{digital_label: {image_url, code, carrier{name, icon_url}, items[{name, image_url}], receiver_name,
  …}, code: 0}` — `image_url` est un lien S3 PRÉSIGNÉ du PDF (`svc-shipping-labels.s3.eu-central-1.amazonaws.com`,
  X-Amz-Expires) que le navigateur ne peut pas lire : S3 n'autorise pas l'origine vinted.fr (CORS ; vérifié dans Chrome,
  aucune CSP en cause) et l'extension n'a, volontairement, aucune permission pour cet hôte.
- **Règle complétée (0.6.137 + fonction `bordereau-fichier`)** : l'extension lit `digital_label.image_url` (chemins
  nommés seulement : jamais la photo de l'article `items[].image_url`, jamais une icône) ; un lien hors de la page que le
  navigateur ne lit pas remonte au background, qui le fait lire par la fonction `bordereau-fichier` (session du
  vendeur, compte bêta, hôte S3 de Vinted en liste fermée, https, aucune redirection suivie, 5 Mo au plus, PDF / PNG /
  JPEG reconnus aux octets) ; la copie se dépose ensuite comme avant. Le lien n'est jamais écrit (motif, trace,
  journal). Selftest `bordereau-fichier-octets` : 9 cas (dont la forme réelle).
- **Preuve sur la vente** : demande « générer » de Nico à 18:01:32 (PDF) ; geste fait à 18:02:39 (envoi 230 : étiquette
  émise) ; essais 1 à 11 : fichier non lu (0.6.136 : forme inconnue ; 0.6.137 : « serveur http_404 », fonction pas
  encore déployée) ; fonction `bordereau-fichier` v1 déployée à 18:37 (`verify_jwt` true) ; **essai 12 à 18:39:09 →
  copie déposée à 18:39:11** (`bordereaux_copies` 3c59a11b, 8 707 octets). **PDF lisible** : PDF 1.5, 1 page A4,
  14 textes et 3 images (QR de dépôt Vinted Go), `%%EOF` présent ; relu par pdfjs, copie locale effacée après lecture.
  Affichage dans l'app de Nico : « Ouvrir le bordereau » sur la commande (à confirmer par Nico).

## 4. Après l'annulation (par Nico)

- Essai à blanc sur le VRAI cas (transaction annulée, rien gardé, 24/10 ~17:07) : la fiche revient au stock, le retrait
  eBay en attente est ARRÊTÉ par la règle du 25/09 (`inventaire_vente_annulee_retraits` : « Retrait annulé : la vente a
  été annulée, l'article est de nouveau disponible. Ton annonce reste en ligne. »), Leboncoin et Beebs partent en remise
  en vente (`remises_en_vente`, dépôts clos) ; l'annonce Vinted, non revue en ligne, serait close « remets-le en vente
  quand tu veux » (règle du 17/10). Une migration écrite pour arrêter les retraits en file s'est révélée inutile
  (la règle existait) : retirée avant tout commit.
- **Réel** : (à compléter après l'annulation)

## 5. Décisions de Nico (24/10 soir) — où en est chacune

1. **Bordereau automatique dès la vente** — code prêt, **migration `20261024235000` écrite, NON appliquée** (feu vert
   nommé de Nico) : déclencheur sur `plateforme_commandes` ; Vinted / Leboncoin / Beebs seulement (jamais eBay ni Depop) ;
   format du compte (PDF par défaut, ou code ; Réglages › Expédition › Bordereau automatique) ; une seule fois par
   commande, jamais l'arriéré, jamais après une demande du vendeur ou un échec ; garde de double vente (deux commandes en
   cours pour la même fiche → rien d'automatique, motif dit) ; vente annulée → copie close tout de suite. Essai à blanc
   11/11. App : « Bordereau en préparation » (court), motif réel à l'échec. **L'app a changé : build à préparer.**
2. **Remise en vente Vinted après annulation** — établi sur la base : Vinted NE remet PAS l'annonce d'origine en ligne
   (30 commandes annulées sur 30 depuis le 16/10 : « vendue » à tous les relevés suivants). **Migration
   `20261024234000` écrite, NON appliquée** : la fiche revenue au stock repart toute seule, hors quota (file
   remises_en_vente et ses gardes) ; revue en ligne → rattachée sans republier. Essai à blanc 9/9 sur la vente du
   short. Preuve réelle : après l'annulation de Nico (à faire APRÈS le feu vert, pour que la règle joue).
3. **Commandes au-delà de 5** — extension 0.6.138 : chaque commande en cours a son tour de détail, une ligne « inconnu »
   n'efface jamais un état connu ; **migration `20261024233000` écrite, NON appliquée** (même règle côté base, toutes
   versions). Essai à blanc 7/7.
4. **Lot « zéro blocage »** — rapport envoyé, feu vert reçu, tout déployé dans l'ordre (état : § « 24/10 soir 18:37 »).

## 6. Les trois cas de la liste (après la surveillance)

- **seghirdeborah711** (veste 571cafdc) : **publiée à 18:41** (au 8e passage). Cause : la fenêtre de travail minimisée,
  onglet inactif resté « loading » — une page que Chrome gèle ou ne charge pas tant qu'elle est cachée ne répond à
  rien ; recharger ou rouvrir dans la même fenêtre minimisée ne pouvait rien (« content script muet, ni après
  rechargement puis onglet neuf », puis traitements figés 16-19 min). Règle (0.6.139) : dernier geste, la fenêtre de
  travail devient visible sans le focus pour ce job, puis se re-minimise ; le relevé dit si l'onglet est gelé
  (`tab_frozen`). Non prouvé sur son poste (pas encore en 0.6.139) : à vérifier au prochain mutisme.
- **vincent.armengol** : 4 republications Vinted en needs_user « Relance depuis l'app » depuis 14:09 — mur passager de
  l'API de suppression lu « Connexion Vinted requise » (le compte publiait 14 annonces Vinted ensuite). Règle (0.6.139) :
  mur arbitré (refus passager ou attente de session), jamais needs_user. **Les 4 relancées à 19:20** (script, sauvegarde,
  inverse, 0 mail ; étape « captured » : rien n'avait été retiré).
- **louis** (insert Zombicide violet Green Horde, job 8d3687d2) : 20/10 photo 1 non téléchargeable (photo importée de
  Beebs) → rapatriée par FillSell le 22/10, dépôt fait (annonce 3293338726, 3 photos sur 4) ; jamais vue en ligne aux
  deux relevés complets du 23/10 → « refusée par la modération de Leboncoin (probable) ». Rien relancé : la raison du
  refus n'est pas lisible depuis FillSell (sonde « Mes annonces » non concluante au-delà de 30 annonces) ; un nouveau
  dépôt identique risque le même refus. Décision de Nico.
