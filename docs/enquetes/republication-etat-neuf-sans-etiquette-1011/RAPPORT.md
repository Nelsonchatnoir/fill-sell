# 10/11/2026 — Point 6 de Nico : recréation Vinted refusée « État obligatoire » (Neuf sans étiquette)

Heures de Paris.

## La cause (essai réel sur le compte Vinted de Nico, feu vert de Nico, 10/11 ~15:00 — rien publié)
Depuis le 09/11, choisir « Neuf sans étiquette » sur le formulaire Vinted ouvre, sur une partie des formulaires, une
fenêtre de confirmation `data-testid="new-without-tags-education-modal"` : « L'article ne doit jamais avoir été
utilisé » — boutons « Conserver « Neuf sans étiquette » » et « Passer à « Très bon état » ». Un clic à côté ne la
ferme pas. L'extension (≤ 0.6.185) ne la connaissait pas : l'état n'était jamais confirmé, et le POST
`/api/v2/item_upload/items` partait SANS état → 400 `{"field":"condition","value":"Le champ État doit être
renseigné"}` — APRÈS le retrait de l'annonce d'origine (republication) : annonce perdue, question « État » posée à la
personne alors que la capture le portait.
Corps relevé une fois la fenêtre confirmée (rayon 2942 « Sacs seau ») :
`"item_attributes":[{"code":"material","ids":[300]},{"code":"condition","ids":[1]}]` — l'état est accepté (seules la
marque et la couleur, laissées vides pour l'essai, étaient refusées ; aucune annonce créée, rien à supprimer).
Pourquoi seulement « Neuf sans étiquette » et pas tous les comptes : la fenêtre n'existe que pour cet état, et Vinted
ne l'affiche pas sur tous les formulaires. Belkacem (« Neuf avec étiquette ») et van.nessa (« Très bon état ») sont
passés en choisissant un AUTRE état — sans fenêtre.
Également établi : capture saine (item_attributes condition [1]) ; config Vinted de l'état rangée sous un groupe
(`{id:1, type:"group", options:[{id:6},{id:1},{id:2},…]}`) ; correspondance et clic de l'extension sains.

## Le correctif
- Extension **0.6.186** (BUILD_ID `2026-11-10T14:10:14Z+ba13a51`) : `confirmerEtatVinted` — après la pose de l'état
  (libellé, réponse de la personne, identifiant), si la fenêtre s'ouvre, clic sur le bouton « Conserver » qui NOMME
  l'état posé ; jamais « Passer à … », jamais un autre état ; sans fenêtre, rien ne change. Vérifié sur le vrai
  formulaire (fenêtre fermée, champ « Neuf sans étiquette »). Livrable : `build/CWS-0.6.186-A-TELEVERSER/`.
- Copie Cloud 0.6.186-cloud (même code) sur cloud-2.
- Serveur (sans attendre le CWS) : `_shared/correctifs-extension.js` `vinted_etat_a_confirmer` — un job (republication
  ou publication Vinted) arrêté sur ce refus repart UNE fois, servi seulement à un poste ≥ 0.6.186, avec l'état de sa
  capture (ou de sa fiche) ; jamais par-dessus une réponse différente de la personne, jamais sans état connu, jamais
  une annonce publiée ou annulée.
- Selftest `vinted-confirmation-etat` (21 contrôles, fonctions de l'extension exécutées).

## Comptes et annonces touchés depuis le 09/11
| Compte | Job | Rayon | État réel |
|---|---|---|---|
| belkacemchristophe2 | 71393701, ed439bd3, 0c8fcdba, f038b128 | 4510, 1847, 3849, 3667 | PUBLIÉES le 09/11 avec « Neuf avec étiquette » (sa réponse ; capture : sans étiquette) — non touchées |
| van.nessa.calvo (Cloud) | e30c7c77 | 1845 | PUBLIÉE le 10/11 à 14:36 avec « Très bon état » (sa réponse ; capture : sans étiquette) — non touchée |
| stefcarpro | 3fba26fa | 4015 | retirée, non recréée — repart seule dès que son poste a la 0.6.186 |
| meminiandmove | 641fb37e | 2942 | retirée, non recréée — repart seule dès que son poste a la 0.6.186 |
| victorine.boutique.contact | 888c5152 | 1672 | retirée, non recréée (relance de Nico échouée ×3) — repart seule dès que son poste a la 0.6.186 |
