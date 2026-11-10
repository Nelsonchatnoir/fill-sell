# 10/11/2026 — Point 6 de Nico : recréation Vinted refusée « État obligatoire » (Neuf sans étiquette) — ENQUÊTE EN COURS

Heures de Paris. Rien n'a été modifié ni relancé pour ce point (aucun job, aucune annonce, aucun code).

## Ce qui est prouvé
- Refus de Vinted au POST de recréation `/api/v2/item_upload/items` : `400 validation_error`,
  `errors:[{field:"condition", value:"Le champ État doit être renseigné"}]` (last_diagnostic des jobs) ; le formulaire
  reste sur /items/new ; l'annonce d'origine est déjà retirée (étape `deleted`) → needs_user `champ_a_choisir`.
- La CAPTURE est saine pour tous : `payload.natif.item_attributes = [{code:"condition", ids:[1]}]`, libellé
  « Neuf sans étiquette », `republish_snapshot.status_id = 1` — identique pour les échecs ET les réussites.
- Ce n'est PAS une version : du 09/11 au 10/11, des « Neuf sans étiquette » passent en 0.6.184, 0.6.185, 0.6.176 et
  en copie Cloud 0.6.183.44921 ; d'autres échouent en 0.6.184 et en Cloud. Diff 0.6.182 → 0.6.183 → 0.6.184 : rien
  sur Vinted.
- C'est CONSTANT par annonce : stefcarpro 3fba26fa (3 envois, 3 refus), victorine 888c5152 (7 envois, 7 refus).
- Ce n'est PAS le libellé : victorine 888c5152, relancé par Nico avec `vintedAspects.condition = « Neuf sans
  étiquette »`, a de nouveau échoué le 10/11 à 11:48, 11:54 et 11:58 (même 400). Le job est toujours needs_user.
  À l'inverse, belkacem (réponse « Neuf avec étiquette ») est passé : la même voie de pose passe pour l'id 6, pas
  pour l'id 1, sur ces annonces.
- Ce n'est PAS la correspondance ni le clic, sur le vrai formulaire (compte de Nico, 10/11 ~14:20, rayon « Jeans
  slim », rien publié ni enregistré) : les options sont `condition-6/1/2/3/4` (titre + description depuis le 09/11 ?),
  la cascade de l'extension trouve `condition-1--title` en « exact », le clic coche `condition-radio-1` et le champ
  relit « Neuf sans étiquette ».
- Ni le rayon, ni le format de colis, ni la marque, ni la couleur ne séparent les échecs des réussites.
- Les injections de l'extension dans le corps du POST (ISBN, langue, colis, marque, attributs d'origine / connus)
  ne retirent jamais une entrée présente.

## Comptes et annonces touchés depuis le 09/11 (mur « État » à la recréation)
| Compte | Job | Créé | Rayon | Statut |
|---|---|---|---|---|
| belkacemchristophe2 | 71393701, ed439bd3, 0c8fcdba, f038b128 | 09/11 14:12 | 4510, 1847, 3849, 3667 | PUBLIÉS avec « Neuf avec étiquette » (réponse de l'utilisateur ; capture : sans étiquette) — non touchés |
| stefcarpro | 3fba26fa | 09/11 18:57 | 4015 | needs_user, annonce retirée, non recréée |
| meminiandmove | 641fb37e | 09/11 21:06 | 2942 | needs_user, annonce retirée, non recréée |
| victorine.boutique.contact | 888c5152 | 09/11 22:57 | 1672 | needs_user (relance de Nico échouée ×3), non recréée |
| van.nessa.calvo (Cloud) | e30c7c77 | 10/11 12:34 | 1845 | needs_user, annonce retirée, non recréée — même champ (`vintedAspects.condition`) |

## Ce qui reste à faire (prochaine étape proposée)
1. Mesurer le corps RÉEL du POST de recréation d'une annonce « Neuf sans étiquette » qui échoue (comment l'état y
   est sérialisé : `status_id` racine ou `item_attributes.condition`) — un essai réel sur le compte de Nico (annonce de
   test ≥ 999 €, rayon d'un échec : 1672 ou 1845), traces de l'extension ouvertes.
2. Corriger à la règle : si le POST part sans état alors que la capture le porte, le poser DANS LE CORPS depuis
   l'identifiant de la capture (même mécanisme éprouvé que l'ISBN et la langue : seulement si la page l'a laissé vide,
   jamais par-dessus, jamais deviné) — extension + copie Cloud.
3. Recréer par la voie normale les 4 annonces retirées (stefcarpro, meminiandmove, victorine, van.nessa) avec l'état
   de leur capture, une fois le correctif servi. Belkacem : rien sans l'accord de Nico.
