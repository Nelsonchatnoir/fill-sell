# Lot du 20/11/2026 au soir — 5 blocs (A vitesse des lots, B bugs, C Louis, D essai Cloud, E restes)

Heure de Paris partout. Règles durables : `docs/regles/republication-et-publication.md` (§ 20/11 soir A, C, E),
`docs/regles/plateformes.md` (§ 20/11 soir B3/B4), `docs/regles/extension-et-versions.md` (§ 20/11 soir 0.6.195, D).

## A — Vitesse des lots à texte vendeur
### Mesure (lot réel db6255ae, bertaberry41, Premium essai Cloud, Android ; 396 articles Vinted → Leboncoin)
| Étape | Mesure |
|---|---|
| Lecture d'une page Vinted (copie Cloud) | 1,4 s (330 lectures, 0 refus) |
| Écart entre deux lectures | 8 à 20 s (règle anti-rafale) |
| Demandes posées par le lot | 355 de 16:00 à 16:15 (toutes d'un coup) |
| Lectures, demandes de moins de 15 min (alarme, sans verrou) | 70 par quart d'heure (15:45 → 16:30) |
| Lectures ensuite (poll, sous le verrou des dépôts) | 3 de 17:00 à 18:30 ; 209 en tout de 16:00 à 19:25 (~60/h) |
| Attente d'un article (demande → lue) | 5 395 s en moyenne pour les demandes de 16:00-16:15 |
| Préparation (rédaction + champs, 3 à la fois) | 4 à 5 articles par minute quand ils sont lus — pas le goulot |
| Dépôt Leboncoin | 51 s médian ; file d'attente médiane 83 min (jobs de 16 h) |
| Dépôts pendant les lectures fraîches | 2 de 16:00 à 16:30 (get-pending-jobs retenait la file) au lieu de 13 par quart d'heure |
| Lot 9cdr9rm4rn (extension, Beebs, 72 articles) | 5 lectures seulement → 4 min |

Cause (prouvée) : le lot posait toutes ses demandes ; passé 15 min, le lecteur ne les servait plus que par le poll,
sous le verrou des dépôts ; et pendant les 15 premières minutes, la file des dépôts du compte était gelée.
Corrigé à la racine : fenêtre de 6 lectures (app), plus de gel des dépôts (serveur), poll sans lecture fraîche
(extension 0.6.195), lecture impossible dite tout de suite (app). Détail : règles § A.

### Avant / après
- Avant (réel) : ~60 lectures/h, 51 min d'attente moyenne par article, ~6 h 30 pour le lot, dépôts gelés 30 min.
- Après (projection sur les régimes MESURÉS le même jour) : la fenêtre garde en permanence le régime « demandes
  fraîches » mesuré de 15:45 à 16:30 (70 lectures par quart d'heure, ~4,5/min) : 355 lectures en ~80 min au lieu de
  ~6 h 30 ; la préparation suit (4 à 5/min) ; les dépôts ne sont plus gelés.
- Mesure réelle après : AUCUN essai réel possible ce soir sur les comptes autorisés (Nico : la seule fiche Vinted à lire
  est vendue ; Ornella : le lecteur est son propre ordinateur). Chaque lot laisse désormais `lot_preparation_mesure`
  (durée, articles lus, attente moyenne file et lecture) : la mesure du premier lot réel après l'OTA se lit par
  `select created_at at time zone 'Europe/Paris', metadata from usage_logs where feature='lot_preparation_mesure' order by created_at desc;`
### linda.yoann35 (lot df182520)
Ses 6 lectures d'origine du jour ont TOUTES abouti (16:41-16:42, 18:49) : le lot n'était pas bloqué par la lecture.
Ses trois lots de 18:49-18:51 ont été quittés au bout de 30 à 50 s (« Préparation… 6 sur 90 », rien de prêt) ; le lot
suivant (6cc15a20, 18:53) a fait 16 prêts en 5 min. Ces articles partaient vers Beebs, qui refuse son compte (B4) : c'est
B4 qui la concerne (plateforme grisée avant l'envoi).

## B1 — La description tapée n'était pas gardée (ornellaracano)
Cause (prouvée en base et dans le code) : après un scan Lens suivi en arrière-plan (iOS coupe la requête), `suivreScanLens`
posait le résultat sans l'article : l'écran de publication s'ouvrait SANS article (invId nul) ; rien de ce qu'elle tapait
n'était enregistré, fermer effaçait le brouillon, et « Publier » créait un doublon sans photo (supprimé par elle à
16:54:03) ; la fiche d'origine est partie avec le texte de l'IA. Autres pertes prouvées : saisie transmise seulement à la
sortie du champ ; écriture différée de 1,5 s annulée à la fermeture ; description d'une carte de plateforme jamais
écrite ; aucune trace « description ».
Corrigé : une seule porte pour tout résultat de scan (l'article toujours rattaché, plus de doublon) ; ce qui attend d'être
écrit l'est à la fermeture ; saisie transmise pendant la frappe et au démontage ; toute retouche de titre/description
écrite sur la fiche (`manuel`) ou sur la copie de la plateforme, tracée `publication_correction` ; ses hashtags restent.
Essai réel (WebKit iPhone 15, compte de Nico, fiche TEST « Pull » 1795171900201, build local) : description tapée puis
« Quitter » → inventaire.description = son texte, `description_source` manuel (22:09:41), fiches_annonce mise à jour,
une trace `publication_correction` { champ: description, portée: toutes } ; rouverte : le texte, hashtags compris,
marqué « Ton texte ». Reste à prouver sur un vrai iPhone : le scan Lens suivi en arrière-plan.

## B2 — Taille Vinted présente dans la liste mais non sélectionnée (romainvintedpro70)
Cause : la correspondance n'y est pour rien (octets identiques, « 3-6 mois / 62 cm » trouvée par la vraie fonction) ; le
pré-vol constate un champ Taille VIDE : la taille posée a été vidée (suggestion d'attributs de Vinted tardive) ou le menu
ne s'est pas ouvert, et la pose ne relisait jamais le champ. Une seule tâche concernée en base (7df02d1a).
Corrigé (extension 0.6.195) : jamais recliquer une option déjà choisie ; la taille relue après la pose (un nouvel essai,
puis un diagnostic) ; une dernière passe juste avant le pré-vol si la Taille requise est vide ; relance serveur après
mise à jour (`relance-apres-maj.js`, active au build 0.6.195). La tâche de Romain reste en attente, l'annonce intacte
(étape `captured`, aucune suppression avant le pré-vol).

## B3 — « À reconnecter » pendant un refus passager (bertaberry41)
Cause : la vérification du Cloud ferme Leboncoin (coffre « non connecté ») ; get-pending-jobs lisait ce coffre comme une
déconnexion et écrasait le message neutre ; la carte le montrait déconnecté. Précision : Leboncoin n'est pas reparti
seul, elle a touché « Résoudre » à 18:49. Corrigé : `_shared/pause-plateforme.js` (règles § B3/B4).

## B4 — Plateforme sans compte (linda.yoann35)
Corrigé : deux messages selon la preuve d'une boutique ; la plateforme refusée grisée avant l'envoi (lot et unité) ; plus
de va-et-vient sur ses 194 tâches (handler-watch) ; elles restent en pause, aucune tentative consommée, rien supprimé.

## C — Louis : plusieurs champs en une validation
Essai réel (WebKit iPhone 15, compte de Nico, 6 fiches TEST « Présentoir », build local) : Poids 350 g + Quantité 2 +
Taille « Unique » en UNE validation → récapitulatif « 6 articles, 3 champs, 6 changent chacun », « 6 fiches modifiées
(Quantité, Taille, Poids) », relu en base ; sélection restée (« 6 sélectionnés ») ; second passage sans resélectionner
(Poids 100 g + Quantité 1, valeurs d'origine remises). La taille « Unique » reste sur ces 6 fiches TEST.

## D — Essai Cloud toujours instantané
Préparé, NON appliqué (migration : feu vert explicite de Nico requis). Détail : règles § D.

## E1 — Free à 30 ; E2 — mug en « Assiettes »
E2, essai réel (fiche TEST « Mug » 1795171900202, build local) : rayon Vinted « Maison › Arts de la table › Verres ›
Tasses et tasses à café » (avant : « … › Vaisselle › Assiettes »).
