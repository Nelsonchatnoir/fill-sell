# Louis (Business) — Leboncoin « accès temporairement restreint » — 30/10/2026 (heure de Paris)

Deux comptes FillSell sur la même box, un seul compte Leboncoin : **Amiral** `louis@ttfamily.fr`
(`faf5021a-479a-4bb3-b3ec-c296770739b7`, Brave sur son PC) et **louis-seller** `louis-seller@ttfamily.fr`
(`447d920c-976a-4d8f-aff4-a2998050358c`, navigateur dans une machine virtuelle de son NAS ; il y gère le Vinted
personnel de sa femme). Les deux publient sur le MÊME compte Leboncoin, volontairement (correction de Nico, 30/10 soir :
la consigne « le compte 2 ne touche jamais Leboncoin » était fausse).

## 1. Pause (fait le 30/10 à 19:37)

`scripts/reparations/20261030_louis_pause_leboncoin.sql` (+ `_INVERSE.sql`) : `platform_settings.leboncoin.blocage_acces`
posé sur les deux comptes (`_shared/blocage-leboncoin.js`), premier essai prudent permis le **31/10 à 19:37**
(`essai_apres` 2026-10-31T18:37:09Z). Relu à 22:29 : **aucune action Leboncoin** sur les deux comptes depuis la pause ;
3 tâches Leboncoin d'Amiral retenues (rien perdu), 0 pour louis-seller.

## 2. La règle du parc (déployée)

Premier signe Leboncoin « accès temporairement restreint » / « un robot est sur le même réseau » / HTTP 403 /
vérification anti-robot (DataDome), lu au dépôt (update-job-status), aux relevés et à la veille des commandes
(handler-watch, `usage_logs` et runs de relevé, fenêtre 10 min) → `blocage_acces` posé sur le compte :
- **toutes** les actions et lectures Leboncoin du compte s'arrêtent (get-pending-jobs ne sert plus rien de Leboncoin ;
  l'extension 0.6.161 coupe ses propres lectures — veille des commandes, relevé des ventes, liens manquants) ;
- la personne lit un message clair qui **nomme son navigateur** (« dans Brave ») et dit que la détection des ventes
  Leboncoin est en pause ;
- **un seul essai par jour** (24 h après le blocage, ou à la demande « Leboncoin remarche ») : un essai refusé re-pose
  la pause, jamais de boucle ; un essai réussi = reprise prudente (6 h, tâches espacées de 10 min) ;
- « Republier avec toutes tes photos » est refusé pendant un blocage (`leboncoin_restreint`).
Selftest `urgence-louis-3010` (82 vérifications).

## 3. L'hypothèse « machine virtuelle »

**Non prouvée, ni infirmée.** Faits : premier 403 d'Amiral le 28/10 à 21:31, de louis-seller le 29/10 à 05:35, Amiral
de nouveau le 30/10 à 02:27 ; même box. L'équipe Cloud a constaté le 30/10 que Leboncoin et Beebs bloquent un
navigateur à rendu graphique virtuel (serveurs sans vraie carte), et qu'un vrai PC Windows passe. L'extension 0.6.161
envoie désormais le moteur de rendu du poste (`rendu_graphique`) : un poste dont le pilote graphique nomme une
machine virtuelle (VMware, VirtualBox, QXL, virgl, Hyper-V…) ne fait **jamais** Leboncoin (`_shared/poste-virtuel.js`,
tâches gardées pour un vrai poste du compte). Les deux postes de Louis tournent en 0.6.159 (29/10 22:28) : la preuve
viendra quand la 0.6.161 sera installée chez lui (lecture de `extension_postes[…].rendu`).

## 4. Détection des ventes depuis le 22/10

- louis-seller : ventes vues (Vinted 30 du 22 au 28/10, boutique 371531 ; Leboncoin 7).
- Amiral : veille Vinted (247512093) sans nouvelle commande ; **son relevé des ventes Vinted échoue en silence**
  (`onglet_figé`, `http_401`) — trouvé, **pas corrigé dans ce lot**.
- Parc, 29/10 : relevés des ventes en échec Leboncoin 27 / 72, Vinted 16 / 71.

## 5. La solution pour garder les deux comptes (à prouver avant de la proposer)

Piste : toutes les actions Leboncoin des deux comptes depuis UN vrai navigateur du PC — un **second profil Brave**
sur le PC, extension connectée à louis-seller et à Leboncoin ; la machine virtuelle garde le Vinted de sa femme sans
jamais toucher Leboncoin (règle du §3 : ses tâches Leboncoin attendent le profil Brave). **Pas encore prouvée** :
l'essai demande deux comptes FillSell dans deux profils d'un même PC, connectés à un même Leboncoin (comptes de Nico et
d'Ornella) — aucune connexion à fillsell.app n'est faite en automatisation ; à faire avec Nico. Rien n'a été proposé
à Louis.

## 6. Après le déblocage

Les ventes manquées remontent par le chemin normal (relevé des ventes à la reprise) ; les copies se retirent par
l'app (retrait vendu), jamais à la main. « Republier avec toutes tes photos » : une à la fois, cadence ordinaire,
jamais pendant un blocage.

## 7. Synchronisation automatique du stock (étude, aucun code)

Non traitée dans ce lot.
