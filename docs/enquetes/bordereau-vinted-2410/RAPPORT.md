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
- **Preuve sur la vente** : (à compléter au geste de Nico)

## 4. Après l'annulation (par Nico)

- Essai à blanc sur le VRAI cas (transaction annulée, rien gardé, 24/10 ~17:07) : la fiche revient au stock, le retrait
  eBay en attente est ARRÊTÉ par la règle du 25/09 (`inventaire_vente_annulee_retraits` : « Retrait annulé : la vente a
  été annulée, l'article est de nouveau disponible. Ton annonce reste en ligne. »), Leboncoin et Beebs partent en remise
  en vente (`remises_en_vente`, dépôts clos) ; l'annonce Vinted, non revue en ligne, serait close « remets-le en vente
  quand tu veux » (règle du 17/10). Une migration écrite pour arrêter les retraits en file s'est révélée inutile
  (la règle existait) : retirée avant tout commit.
- **Réel** : (à compléter après l'annulation)
