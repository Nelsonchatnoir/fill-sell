# Reprise — terminal « Problèmes », lot de Nico du 08/11 après-midi et soir (13 points)

> ⏩ Suite (08/11 nuit, points 1-6) : `docs/reprise/terminal-problemes-0811-nuit.md`. La 0.6.182 est PUBLIÉE (32 comptes) ;
> le seul zip à téléverser est désormais `build/CWS-0.6.183-A-TELEVERSER/fillsell-extension-0.6.183-cws.zip`.

Rapport complet : `docs/enquetes/lot-0811-apres-midi/RAPPORT.md`. État de prod : `docs/agents/etat-2026-10-01.md`
(sections « 08/11 après-midi » et « 08/11 soir »). Heures de Paris.

## Ce qui est en service
- get-pending-jobs **v352** (`verify_jwt` true), ebay-api-worker **v119** (false), ebay-account **v35** (true) — 15:55.
  Pause de respiration 50/2 h PAR plateforme ; avancement de la file (`avancement_republication`) ; porte « Leboncoin
  nom/prénom : seul l'éclaireur part ». Retour : redéployer depuis 1bcb193.
- Migration **20261108190000_compte_plateforme_releve** APPLIQUÉE (compte de la plateforme relevé ; deux comptes ne se
  mélangent jamais). Inverse dans `supabase/rollbacks/`.
- Réparation : 491 doublons sans fiche (11 comptes) clos par la règle 20261108143000 (`_backup_0811_lignes_sans_fiche_parc`).
- Copie Cloud sur cloud-2 : **0.6.182-cloud** depuis 20:02 (CRX 0.6.182.44898, depuis origin/main 3e95540) ; avant
  0.6.181-cloud (17:59). Orchestrateur 304369a47935 (terminal Cloud) inchangé.
- Web : main poussé (264d6ac, 0153a71, 08bc9d7, c8e1357, 44d55b6, bc358e9, 19bff63).

## Ce qui attend
- **Chrome Web Store** : Nico téléverse `build/CWS-0.6.182-A-TELEVERSER/fillsell-extension-0.6.182-cws.zip`
  (BUILD_ID 2026-11-08T18:30:10Z+bc358e9). C'est le SEUL zip ; il contient toute la 0.6.181 (jamais téléversée,
  rangée dans `build/anciens-zips/REMPLACEE-PAR-0.6.182-CWS-0.6.181`). Après acceptation : ajouter « 0.6.182 » à
  ALREADY_PUBLISHED (`scripts/package-extension.mjs`). L'effet du point 1 sur les ordinateurs (espacement par
  plateforme) et du point 3 (compte Leboncoin) n'arrive qu'avec elle.
- **OTA** : rien publié. UNE OTA commune (≥ 2.9.168), montée par le terminal Cloud, sur feu vert de Nico ; elle embarque
  mes changements d'app (FileDesJobs, lazySur, StockTab, stepper). Canal production = 2.9.166.
- **Points 9 et 10** : en attente de Nico — NE PAS Y TOUCHER.
- **Point 3, reste** : les ~115 annonces de l'ancien compte Leboncoin d'ayadi007 (d'avant la 0.6.182, compte inconnu)
  restent sous l'heuristique du 08/11 midi ; elles se fermeront par les juges existants quand les relevés du nouveau compte
  seront probants. Rien d'effacé ni de recréé.
- **Point 12** : plugin Capgo 8.53.1 dans le binaire Android vc37 (terminal Cloud, 7c82602) ; à surveiller à l'OTA :
  « native changes » face aux binaires restés en 8.51.2 (le terminal Cloud le dira à Nico).

## À vérifier demain
- Joséphine (josephinecerni) : rythme des republications après la 0.6.182 (plusieurs plateformes par cycle) ; « Ta file »
  affiche l'avancement (web en ligne ; mobile à l'OTA).
- Relevés Leboncoin : `vinted_sync_runs.compte_plateforme` se remplit chez les postes en 0.6.182 ; aucune trace
  `releve_autre_compte` inattendue.
- Rosa Metra : plus aucune publication Leboncoin servie hors éclaireur tant que son mur nom/prénom tient.
- Copie 0.6.182-cloud : voir l'état ci-dessous.

## Copie 0.6.182-cloud — FAITE (08/11 20:02, autorisation nommée de Nico)
Conditions remplies : essai du terminal Cloud fini et nettoyé, 304369a poussé et en service (orchestrateur
304369a47935, non remplacé : `EXTENSION_SEULE=1` ne change que la copie de l'extension et redémarre l'orchestrateur).
Vérifié après : version 0.6.182-cloud, santé OK, Nico (94.194.94.68, coffre 5 plateformes) et Virginie (88.151.56.82,
coffre FillSell) rouverts en ~10 s, extension 0.6.182.44898 vue sur les deux ; wtk8jnmnnf inchangé (poste éteint depuis
19:33, aucune IP, coffre FillSell) ; /connexion et client.js 200 ; aucune ligne d'erreur. Retour arrière :
`archives/fillsell-cloud.crx` + `update.xml` (0.6.181.44885), `extension.ancienne` → `extension`,
`docker compose restart orchestrateur`.
