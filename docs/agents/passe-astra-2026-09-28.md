# Passe Astra du 28/09 — reprise après incident, 16:58 Paris

## PRIORITÉ AVANT TOUTE REPRISE

**Passe inachevée, déploiements suivants bloqués par le garde-fou de latence.**
Lire `../INCIDENT_ASTRA_2026-09-28_LATENCE.md`. Ne pas déployer main en bloc :
le code local contient des corrections non livrées et le futur minimum .75.
Ne pas activer les ventes automatiques par un balayage à chaque poll.
Le cron `doublons-balayage-2min` est suspendu : la recherche globale avant LIMIT
doit être remplacée par un parcours borné qui conserve sa progression.

## Production relue

- get-pending-jobs **159**, verify_jwt=true, retour au code fba7c15.
- update-job-status **99**, verify_jwt=false, retour au code fba7c15.
- handler-watch **65**, verify_jwt=false. Comportement inchangé par son module partagé.
- check-listing-status **34**, verify_jwt=false, vente atomique.
- generate-listing **108** et lens-analysis **102**, verify_jwt=true : non déployées.
- C (réservation compatible) reste actif. Job Nadège c9fac25e abouti à 15:10:39,
  Vinted 10168328039 ; nouvelle republication du parc à 16:42:29.
- 0.6.75 publiée, build officiel `2026-09-27T20:16:30Z+66a8887`, confirmation
  Nico. Registre source mis à jour ; minimum serveur encore **24/09 14:34:46Z**.
  Promotion à **27/09 20:16:30Z** seulement avec livraison du bandeau app.
- OTA réellement servie : **2.9.30**, bundle/channel relus. package.json et
  lock préparés en **2.9.31**, aucun upload ni numéro consommé par cette passe.
- Extension .76 préparée en source ; aucun ZIP livré, aucune recharge du poste Nico.
- Aucun push : origin/main reste e6c4e0c5d4e738299595e6c8847060ff953ad64f.

## Règles en vigueur

Voir `consignes-2026-09-28.md` (opérationnel) ; l'état du 27/09 est historique.
Identité = identifiant/lien exact, historique des jobs ou décision de la personne.
Jamais titre, prix, photo, ressemblance. Deux annonces sur une plateforme sont
deux exemplaires sans preuve contraire. Vente sûre sur identifiant exact =
enregistrement automatique atomique puis retrait des copies prouvées des AUTRES
plateformes ; aucune copie retirée tant que du stock reste. L'automatisation
générale reste à livrer après l'incident, cette règle métier n'est pas annulée.
Import republiable ; copie suffisante avant retrait. Aucun verdict d'absence
sur relevé vide/incomplet, ni sur une seule lecture. Beebs : aucune modération
interprétée comme disparition. Conserver le verify_jwt réellement servi.

## Points A → I : code et livraison distincts

| Point | État de cette passe | Commits principaux |
|---|---|---|
| A | Preuves, boutiques, questions de remplacement et gardes de retrait en base. Extension non livrée. Balayage suspendu. | 25de3f0, 9a27a2f, 66002d3, 406c57f |
| B | Vente/stock/reçu atomiques et quantité restante en prod. Automatisation générale retirée après incident. | 6f3c0e8, 63942a4, 59a24fc, c94c795, 125599d |
| C | Réservation compatible redéployée et succès réel vérifié. Deux vieux postes partageant un JWT ne se distinguent qu'avec .76. | 8dd35f7, f6dd466 |
| D | Copie, navigation, colis et file par article corrigés en source ; partie serveur dans le code restauré. UI capture incomplète/recréation incertaine reste ouverte. | 078ee88, b64137c |
| E | Gardes SQL relevés complets actives. Extension .76 non livrée, ancien parc encore divergent. | a3e8a17 |
| F | Barrière serveur active sur ancien minimum. Registre .75/bandeau corrigés en source ; nouvelle promotion bloquée. | fba7c15, 45b15a0 |
| G | 38→M supprimé, 86 cm/18 mois conservé, traduction 10 years/10 ans. Source non entièrement livrée. | 39b8ee5 |
| H | Pagination au-delà de 2 000, erreurs sans résultat partiel, tests réussis. App non livrée. | d10f57f |
| I | Consignes actuelles séparées de l'historique ; passation et limites explicites. | 897e87d et passation |

## Cas ajoutés

- **Angel** : aucun retrait à réparer par recréation. Vinted confirme les trois
  ventes exactes ; RPC normal a créé **54005, 54006, 54007**, stock 0. Aucun
  nouveau retrait ni mail lors de ces trois appels. Le dépôt Opla cité par la
  trace était la cible du retrait, pas la preuve de vente. Voir incident Angel.
- **xxewwer / Opla** : nouveaux identifiants hors FillSell non reconnus sans
  preuve ; 84 fusions proviennent de décisions humaines à 10:57–10:58. Réexamen
  autorisé borné : 91 fiches, 74 propositions. Aucune fusion manuelle. Phrase :
  « Les nouvelles annonces te seront proposées à rapprocher quand leur lien
  avec tes fiches ne peut pas être prouvé. »
- **Rémi/Albert** : 212 annonces lues ; 33 étaient déjà vendues dans ses fiches.
  Import Nadège non confirmé retrouvé ; trois anciens retraits réellement
  exécutés depuis ce compte le 11/09, détaillés dans le rapport A. Garde
  d'origine corrigée ; aucune fiche déplacée/supprimée. celineetmarie attendait
  confirmation de boutique. claire972elegante : connecter la boutique réelle,
  relever puis confirmer ; aucun plafond de nombre de boutiques par palier
  trouvé dans confirmerBoutiqueVinted, quotas toujours appliqués. Phrase :
  « J'ai identifié un mélange de boutiques ; tes fiches sont conservées et les
  opérations sur une boutique non confirmée sont désormais retenues. »
- **Albert / relevés LBC-Beebs** : keepalive du worker et lecture bornée codés
  (8b6f539), .76 non livrée ; gel exact du poste non observé directement.
- **Louis / Beebs** : 34058194 et 32750442 identifiées par jobs, mais fiches
  retrouvées vendues. Condition « vérifier non vendues » non satisfaite ; aucune
  recréation, confirmation des deux exemplaires encore disponibles nécessaire.
  Ne pas utiliser la confirmation d'Angel comme une confirmation pour Louis.
- **Louis / LBC** : rayon Divers > Autres posé par défaut ; absence au relevé
  ne prouve pas le refus de modération. Garde renforcée dans 203b4eb, non livrée
  après retour arrière ; article abandonné respecté. Refus exact non établi.
- **Louis / quantité** : tests 3→2→1→0 et rejeu ; copies gardées tant qu'il reste
  du stock. Migration 20260928133204 active.
- **Opla / catégories** : poignée de porte proposait huit branches ; corrigé
  en feuilles finales, app + serveur + extension (9bcd4b7), non livré. Contes
  Piccolia propose onze feuilles, protège-sucette deux : questions légitimes.
  Neutrogena est maintenant publié en BEAUTY_SKINCARE_FACE. Gigoteuse de
  doriane choisie par IA en rayon garçon : cause amont encore à corriger.
- **eBay / champs** : preview lit la catégorie résolue ; garde ne saute plus
  Longueur/Hauteur/Largeur sans valeur (6f85001), app non livrée.
- **Nadège / haut court** : refus de suppression anti-robot, pas perte prouvée.
  Aucune action forcée. Les 1 126 anciennes fiches Vinted ne sont pas toutes
  réexaminées : aucune fusion de rattrapage sans preuve.
- **xxewwer / double retrait eBay** : même identifiant 377494187315 à 02:16 et
  07:12 ; garde contre un retrait déjà terminé corrigée en base, 406c57f.
- **ltouze** : 44 jobs contrôlés revenus pending, attente anti-robot. Source
  f7b59aa évite de qualifier une vérification impossible de boutique étrangère ;
  ce dernier complément n'est plus livré après retour arrière.
- **Malena/Tessy** : preuve de cookie de session Opla et erreur Beebs #input-pictures
  reconnue (8013efe). Texte seul ne répare pas un vieux sélecteur ; .76 requise.
  Complément serveur retiré avec update-job-status 99.
- **Sécurité** : deux vues catégories passées security_invoker=true, droits
  individuels et serveur vérifiés, migration active 20260928142605.
- **Rebond inscription** : latinan.du.38@hotmail.fr, confirmation du 28/09
  09:41, Resend bounced. Code SMTP détaillé non fourni par l'outil ; cause
  précise non établie. Aucun nouvel envoi.
- **Bundle dirty** : build propre contrôlé avant upload par verifier-livraison.mjs.
  Pas d'OTA faite ; deux utilisateurs signalés restent à confronter au bundle
  effectivement téléchargé. Le suffixe dirty web ne prouve pas seul du code inédit.
- **Tessy / coffret Disney eBay** : non résolu ; classification IA amont encore
  à examiner, aucun déploiement generate-listing/lens-analysis autorisé ici.
- **Extension Nico** : Fable l'a rétablie, .75 build
  `2026-09-28T08:05:15Z+e6c4e0c-dirty`, dossier stable
  `C:\Users\nicol\FillSell-Extension-Nico`, contact relu à 16:36. Cause de la
  panne initiale non constatée par Astra. Retrait 10124335822 non forcé ; .76
  contient la correction et le réarmement sur build corrigé, non chargé.

## Migrations et retours arrière

Tous les fichiers appliqués de cette passe ont leur inverse homonyme dans
`supabase/rollbacks/`. Appliquer les inverses dans l'ordre opposé, après lecture
du corps réel ; ne jamais revenir aux retraits sans vente pour réparer une latence.
Liste et preuves : rapports A–H et incidents dans `docs/`.

Appliquées : 085904, 101812, 102522, 103046, 104620, 105655 (A), 111221 (B),
114322/114721 puis annulation 115314/115330 (C historique), 130523 (C actuel),
133204 (B stock), 133555 (E), 135541/135758 (A ventes avant retraits),
140738 (B automatique, fonction désormais sans appel périodique), 142419
(retrait déjà abouti), 142605 (vues), 143457 (B rejeu), 145446 (cron suspendu).
Préfixe commun : **20260928**. **144357 NON APPLIQUÉE**, bloquée après latence.
La migration Italie 20260925190000 reste non suivie et intacte.

## Git, artefacts et reprise

Main local porte les commits de la passe ; aucun push depuis e6c4e0c.
Deux différences initiales vérifiées par SHA256, intactes : cli-latest et
migration Italie. Prototype cloud non touché. Copie de build jetable (aucun
travail utilisateur) : `build/livraison-astra-2.9.31`, actuellement détachée sur
fba7c15 pour le retour serveur. Sa jonction node_modules vise le dépôt principal :
**ne jamais supprimer récursivement cette jonction**. Ne pas livrer cette copie
avant retour au commit choisi, arbre propre et vérification d'empreinte.

Les actions suivantes attendent la résolution de l'incident : push, OTA,
ZIP .76, minimum .75, recharge Nico et tests réels. Aucun mail, aucun geste
Stripe, aucune action chez nicolas.menar ou thomas.vinted590002.

## Reprise après levée du blocage — 18:03 Paris

Nico a levé le blocage après stabilité de la base (26–72 ms) et 38 jobs
aboutis entre 16:39 et 17:35 sur six comptes. La reprise a suivi l'ordre
demandé, avec un contrôle du parc entre chaque étape :

1. **Push unique sur `main`** : `e6c4e0c` → `2c298b4`. Le web sert
   `2026-09-28T15:52:13Z+2c298b4-dirty`. Build, imports épinglés, content
   scripts et tests ciblés verts. Après le push : 69 ms de moyenne, p95
   167 ms ; trois jobs aboutis sur trois des six comptes ayant une extension
   vue et un job en file.
2. **OTA 2.9.31** : `bundle list` confirmait que 2.9.31 était libre ; build
   propre `2026-09-28T15:55:01Z+2c298b4`, puis upload. Le canal public
   `production` sert 2.9.31 sur iOS et Android. Après l'OTA : 60 ms de
   moyenne, p95 118 ms ; un job abouti sur un compte actif.
3. **Extension 0.6.76** : paquet construit depuis `2c298b4`, BUILD_ID
   `2026-09-28T15:56:22Z+2c298b4`, manifest 0.6.76 et contenu vérifiés. Le
   seul zip du dossier est
   `build/CWS-0.6.76-A-TELEVERSER/fillsell-extension-0.6.76-cws.zip`.
   Après fabrication : 64 ms de moyenne, p95 78 ms ; un job abouti.
4. **Minimum serveur 0.6.75** : déployé depuis `45b15a0`, dont le seul diff
   avec le code serveur `fba7c15` est la borne
   `2026-09-27T20:16:30Z`. `get-pending-jobs` est en version 160 avec
   `verify_jwt=true` ; `update-job-status` en version 100 avec
   `verify_jwt=false`, relus après chaque déploiement. Retour arrière prêt
   depuis `fba7c15`. Après un cycle complet : moyenne 56 ms, médiane 45 ms,
   p95 120 ms ; zéro attente de verrou ; deux jobs aboutis sur deux des cinq
   comptes compatibles ayant une file ; trois comptes ont des réservations
   vivantes. Un pic isolé à 692 ms a précédé ce second échantillon stable.

Le cron `doublons-balayage-2min` reste suspendu (`active=false`). L'appel à
`enregistrer_ventes_prouvees` n'est pas présent dans le code serveur livré.
Les deux différences locales préexistantes sont restées intactes ; le
prototype cloud et la jonction `node_modules` n'ont pas été touchés. Aucun
mail n'a été envoyé.

**Reste** : Nico téléverse le zip 0.6.76 et clique « Envoyer pour examen ».
Ne promouvoir ni le minimum 0.6.76 ni les registres de publication avant
acceptation constatée dans le parc. L'enregistrement automatique périodique
des ventes et le balayage des doublons attendent toujours une version légère,
bornée et mesurée avant toute réactivation.
