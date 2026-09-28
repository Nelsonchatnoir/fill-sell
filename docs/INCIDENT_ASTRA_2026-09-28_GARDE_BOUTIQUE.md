# Contrôle demandé par Nico — garde boutique du point A

## Cause et retour arrière ciblé

La fonction `get-pending-jobs` 151/152 exigeait une identité de session
fraîche dans la télémétrie. Les sondes peuvent rendre cette identité vide,
y compris en 0.6.75. Ce manque ne prouve pas un changement de boutique.
Cette exigence a introduit des blocages injustifiés. La migration des imports
de 12:25 ne les a pas écrits : les jobs portent l'auteur de la garde serveur.

- ltouze : 45 `session_inconnue`, le 28/09 entre 12:14:08 et 12:14:10,
  donc avant la migration de 12:25 ; un `origine_inconnue` supplémentaire.
- Nadège : 24 `session_inconnue`, entre 13:09:37 et 13:13:38.
- Le 28/09 à 13:24, les deux profils portaient la 0.6.75 officielle.
  Aucune identité de session conservée dans la sonde courante. Cela ne prouve
  ni un ordinateur partagé ni une connexion au compte d'Albert.
- Version 153 déployée à 13:26:41, JWT true : retour arrière de l'exigence
  serveur de session fraîche. Une origine connue non confirmée, contradictoire
  ou différente de la session connue reste protégée.
- Version 154 déployée à 13:33:06, JWT true : une origine ancienne manquante
  est aussi reconnue par l'historique d'un dépôt FillSell du même identifiant
  et de la même fiche, vérifié par `retrait_job_prouve`. Aucune origine inventée.
- Réarmement automatique des seules gardes introduites ici, dix par poll,
  avec contrôle de la preuve actuelle. Aucun UPDATE manuel de jobs.

Le job ancien de ltouze `775657a7-2dd4-4359-861f-0ad69cb5da8b` vise
Vinted 9991856071. Le dépôt `5c7fc857-ac4f-4346-af57-b126458bf963` a publié
CET identifiant le 13/09, extension 0.6.33 : preuve historique, sans titre.

## Reprise observée

- À 13:33, les 24 gardes de Nadège ont disparu. Une republication est achevée
  à 13:28:47 : job `9021bfc9-76b9-4558-90b3-92e90178449a`, Vinted 10167099160.
  Les 23 autres sont en attente normale. Les 14 autres questions préexistantes
  (Opla, champ à choisir, ancienne interruption) restent distinctes.
- ltouze : dernier contact à 13:20:06 lors de ce contrôle ; reprise automatique
  préparée, pas encore observée. Ne pas annoncer les 46 comme déjà reparties.
- Nico : le retrait a repris puis est revenu en `needs_user/relancer` à 13:28.
  Le défaut de navigation/retrait reste dans D ; aucune réussite prétendue.

## Contrôle des autres changements du matin

Lecture séquentielle de 35 comptes ayant contacté le serveur depuis 10:50,
par index `(user_id,status)`, limite 250 jobs par compte. Aucun compte n'a
atteint cette limite (maximum 46). Les gardes attribuées à cette passe qui
restaient au contrôle concernaient Nadège et ltouze ; celle de Nico avait
déjà été reprise. La garde légitime d'Albert reste distincte et antérieure.

Les journaux `update-job-status` entre 10:45 et 13:30 montrent :

| Fenêtre Europe/Paris | Passages needs_user observés |
|---|---|
| Avant première migration 10:59 | aucun dans les journaux disponibles |
| 10:59 → 12:18 | Angelo : cinq écritures de catégorie ; Malena : six de connexion ; Albert : une de boutique |
| 12:18 → 12:25 | Angelo : une nouvelle écriture de catégorie |
| 12:25 → 12:30 → 12:46 → 12:56 → 13:12 | aucun dans ce journal |
| Après B 13:12 → 13:30 | Nico : une reprise de retrait requalifiée en question |

Les 70 gardes écrites directement par get-pending-jobs ne passent pas par ce
journal : elles ont été comptées séparément sur leur marqueur horodaté.
L'ancienne base n'a ni `updated_at` sur les jobs ni journal universel des
transitions. Cette comparaison ne prétend donc pas reconstituer chaque état
historique SQL. Les erreurs présentes ont aussi été lues par compte : aucune
autre cause nouvelle attribuée aux migrations n'a été établie dans ce périmètre.

Dans les 200 relevés les plus récents, un échec après 12:25 : page eBay
`/oauth2callback`, relevé incomplet. Aucun refus `boutique_a_confirmer` trouvé
dans les erreurs consultées après cette migration.

## Santé et tests

- 25 tests de boutique et de compatibilité, Deno : réussis.
- Après 153 : appels get-pending-jobs HTTP 200, 163–2 838 ms sur huit appels ;
  aucune erreur de fonction dans la fenêtre consultée.
- Balayage après 154 : RPC HTTP 200, 278–666 ms sur huit appels.
- Les timeouts PostgreSQL existaient avant cette passe ; la lecture des logs
  seule ne permet pas d'en attribuer chaque occurrence. Ne pas les confondre
  avec les blocages de boutique, dont la cause est prouvée ci-dessus.
- Sauvegarde 152 : racine CLI `build/astra-retour-get-pending-152/supabase/`.
  Les migrations A et B ne sont pas annulées ; seul le contrôle de distribution
  trop large a été retiré puis corrigé.
- C suspendu pendant le contrôle. Sa migration locale est un brouillon,
  non testée et non appliquée ; elle ne doit pas être déployée par inadvertance.
