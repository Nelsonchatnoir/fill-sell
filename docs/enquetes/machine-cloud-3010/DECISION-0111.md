# Cloud — la décision, sur une page (01/11/2026, mise à jour de 16:10)

## 0. 16:10 — l'essai « steel-browser chez nous » PASSE (rapport § 17)
- Serveur : Hetzner Cloud cpx42 neuf, steel-browser publié, avec écran, injection d'empreinte coupée, aucun résolveur,
  3D logicielle comme Steel loué (choix de Nico), IP 81.181.239.136.
- Résultat : **Leboncoin FORMULAIRE, Beebs GLISSIÈRE**, comme Steel loué. Coût réel 0,13 € TTC ; serveur supprimé.
- La voie « chez nous » est ouverte : ≈ 6,62 € par abonné sur le cx43 existant, ≈ 7,41 € à 50 abonnés avec un AX42.
  - Prochain pas : l'**endurance de 48 h** sur ton compte (feu vert séparé).
  - Plan de serveurs du 1er au 50e abonné : rapport § 17.2.
- L'ancien serveur (cx43, 19,79 € TTC/mois, modèle en rupture) est gardé. Réinstallation à neuf proposée (§ 17.1).
- Les sections 1 à 5 ci-dessous datent de 15:40, avant l'essai.

Base : rapport Cloud (`RAPPORT.md`, § 12 à 16) et rapport Mac mini (`docs/enquetes/mac-mini-3110/RAPPORT.md`). Rien n'est
acheté.
- **Ce que Nico touche vraiment par abonné Cloud** : 14,40 € par Stripe, 10,50 € par Apple (frais et URSSAF déduits).
  Les marges se calculent sur ces montants, plus sur 20 €.
- Coûts TTC par utilisateur et par mois, sans récupération de TVA ; IP dédiée comprise (4,64 €).

## 1. Décisions de Nico (01/11)
- Même rythme que l'extension : veille des commandes toutes les 10 min, ventes détectées 24 h/24.
- Steel loué à la minute ne sert qu'à tester : ≈ 15,5 € par utilisateur, donc à perte.
- Son poste reste sur ARRÊT jusqu'à la fin des essais Cloud : il compte comme muet.

## 2. Ce que les essais ont prouvé
- Windows sur vraie carte graphique passe (PC de Nico, Shadow), avec glissière.
- Steel loué (Linux, sans carte) passe le 01/11 : Leboncoin formulaire, Beebs glissière.
- Notre Chrome Linux chez Hetzner était bloqué le 30/10, même sur machine neuve et IP neuve.
- Deux raisons possibles au passage de Steel, que l'essai ne sépare pas :
  - notre environnement s'est fait repérer à force de 403 (brûleurs, essais répétés) ;
  - la « furtivité avancée » non documentée de Steel loué.

## 3. Toutes les pistes, sur les montants nets
| Piste | € TTC / util. | Marge Stripe | Marge Apple | Coût fixe / mois | Prouvé ? | Licence |
|---|---|---|---|---|---|---|
| **steel-browser chez nous** (logiciel libre), cx43 plein (10 util.) | **6,62** | **+ 7,78** | **+ 3,88** | 19,79 (cx43 en rupture) | **non** (bloqué le 30/10 sur l'ancien serveur et les IP usées ; jamais essayé sur machine neuve et IP qui passe) | Apache 2.0 : aucune |
| idem sur AX42 plein (32 util.) | 8,35 | + 6,05 | + 2,15 | 118,80 + 58,80 une fois | non | aucune |
| Steel loué, ronde de 10 min | 15,53 | − 1,13 | − 5,03 | 0 | oui, 1 essai | données aux États-Unis ; furtivité non documentée |
| Windows + carte, AX42 + Windows Server | 9,72 (20,64 avec RDS) | + 4,68 (perte) | + 0,78 (perte) | 152,28 | même famille, non essayée | RDS à trancher par écrit |
| Windows + carte, Hetzner 3093130 | 13,15 (24,07 avec RDS) | + 1,25 (perte) | − 2,65 | 340,44 | même famille, non essayée | idem ; Windows sur ce serveur non acquis |
| Azure spot / centron | 15,23 / 15,63 | perte | perte | 254 / 572 | non | RDS |
| Mac mini (Green Mini / Scaleway) | 14,72 / 16,58 | perte | perte | 101 / 239 | non | **bloquante** (macOS) |
| Shadow + Always On | 29,86 | perte | perte | 252 | oui | écarté |

Seules deux voies laissent une marge aux deux canaux de paiement : **steel-browser chez nous**, et Windows sur AX42
**sans** RDS (+ 0,78 € seulement côté Apple). La première est de loin la meilleure, mais elle n'est pas prouvée.

## 4. steel-browser chez nous : coût par nombre d'utilisateurs (serveur + IP, TTC)
| Serveur | Stock (15:30) | n = 5 | n = 10 | n = 20 | n = 30 | Rentable dès (Stripe / Apple) |
|---|---|---|---|---|---|---|
| Cloud cx43 (8 vCPU, 16 Go), 19,79 €/mois | rupture | 8,60 | 6,62 | — | — | 3 / 4 abonnés |
| Cloud cx53 (16 vCPU, 32 Go), 35,99 € | rupture | 11,84 | 8,24 | 6,44 | — | 4 / 7 |
| Cloud cpx42 (8 vCPU, 16 Go), 83,99 € | disponible | 21,44 | 13,04 | — | — | 9 / au-delà de sa capacité |
| Robot enchère i7-7700 64 Go, 90,84 € | disponible | 22,81 | 13,72 | 9,18 | 7,67 | 10 / 16 |
| Robot AX42 64 Go, 118,80 € + 58,80 une fois | commandable | — | 16,52 | 10,58 | 8,60 | 13 / 21 |

- Le premier poste de coût est l'IP dédiée (4,64 € par utilisateur).
- Capacité estimée à 10–13 utilisateurs pour 16 Go ; à mesurer.

## 5. Le prochain essai (un seul, sur ton feu vert écrit)
- **Quoi** : steel-browser tel que publié, avec écran, injection d'empreinte coupée, aucun résolveur, ni langue ni
  fuseau réglés. Image `ghcr.io/steel-dev/steel-browser` épinglée par son empreinte.
- **Où** : un **Hetzner Cloud cpx42 neuf** (8 vCPU, 16 Go, Nuremberg), à l'heure, supprimé juste après.
- **Comment** :
  - sortie par l'IP 81.181.239.136 (la même que l'essai Steel loué), profil neuf ;
  - « Me connecter » de production, extension 0.6.164 ;
  - vérification et essai à blanc sur proxy mort, puis une ouverture Leboncoin, puis une ouverture Beebs.
  - Si c'est bloqué, on s'arrête.
- **Durée** : ≈ 1 h 30, 3 h au plus.
- **Coût** : 0,27 € TTC (2 h), **0,40 € TTC au plus** (3 h). IP déjà payée, logiciel gratuit, aucun abonnement.
- **Ensuite** :
  - si ça passe : endurance de 48 h au rythme de l'extension sur ton compte (≈ 6,46 € TTC de cpx42), sur feu vert ;
  - si c'est bloqué : la voie « chez nous » est fermée. Steel loué reste à perte et porte un doute de maquillage.
    → **Cloud en pause**, sauf réponse écrite de Hetzner sur la RDS pour la voie Windows AX42.
