# FillSell Cloud — les gestes de Nico, depuis le téléphone (05/10)

Tout le reste tient en UNE commande lancée par Claude, sur ton GO :
`node serveur-cloud/outils/lancer-serveur-test.mjs --go` (serveur, 1 IP, DNS,
déploiement, contrôles, mesure). Avant, Claude lance la même commande SANS `--go` :
elle LIT tout (jetons, prix réels, solde, stock France) et ne crée ni n'achète rien.

## 1. Hetzner — presque fini

| | Écran | Quoi faire | Coût |
|---|---|---|---|
| ✅ | console.hetzner.cloud › projet « fillsell-cloud » › Sécurité › Jetons API | **Fait le 05/10** : jeton Lecture et écriture, posé dans `secrets.env`, vérifié (projet vide) | 0 € |
| ☐ | **accounts.hetzner.com/account/dpa** | « Accord de traitement des données » (AVV / DPA) : remplir les catégories (données clients, identifiants de connexion), cocher **« J'accepte l'accord »**. Obligatoire au RGPD (Hetzner héberge les navigateurs) | 0 € |
| — | Le serveur | **Rien à choisir** : la commande crée **cx43** (8 vCPU, 16 Go, 160 Go) à **Falkenstein (fsn1)**, Ubuntu 24.04, dans le projet « fillsell-cloud » | **15,99 € HT = 19,19 € TTC / mois** (prix lu dans l'API le 05/10), **facturé à l'heure** (0,031 €/h) |
| — | IPv4 du serveur | créée avec lui | **0,50 € HT = 0,60 € TTC / mois** |

Un test d'une semaine ≈ **4,60 € TTC** ; serveur supprimé = plus rien facturé.

## 2. IPRoyal — trois gestes

| | Écran | Quoi faire | Coût |
|---|---|---|---|
| ☐ | **iproyal.com** › Sign up (ou Log in) | compte au nom de FillSell, e-mail support@fillsell.app de préférence | 0 € |
| ☐ | Dashboard › **solde (Balance) › Add funds / Top up** | recharger **10 $** par carte : l'IP de test se paie sur le solde (jamais de carte enregistrée pour un renouvellement automatique) | 10 $ |
| ☐ | Dashboard › **Settings › API** | **générer le jeton** (Generate / Reset token), le copier | 0 € |
| ⛔ | Static Residential / ISP | **NE RIEN ACHETER toi-même** : la commande achète **1 seule IP, France, 30 jours, sans renouvellement automatique**, et refuse au-delà de 8 $. Exception : si le plan dit « minimum N IP » (le catalogue d'IPRoyal l'impose parfois), achète **1** IP *ISP / Static Residential › France › 30 days* dans le tableau de bord et envoie le **numéro de commande** | ≈ 3 à 6 $ l'IP / 30 jours (prix exact lu par le plan) |

Société : **IPRoyal Services FZE LLC** (Émirats arabes unis) ; son accord de traitement
des données (clauses contractuelles types de l'UE) est accepté avec ses conditions à
l'inscription — rien à signer.

## 3. Cloudflare — deux voies, au choix

**A. Recommandée (une commande de bout en bout)** — un jeton limité au DNS de fillsell.app :

| | Écran | Quoi faire |
|---|---|---|
| ☐ | dash.cloudflare.com › icône du profil › **Mon profil › Jetons d'API** › **Créer un jeton** | modèle **« Modifier la zone DNS »** (Edit zone DNS) |
| ☐ | Autorisations | laisser **Zone › DNS › Modifier** (rien d'autre) |
| ☐ | Ressources de zone | **Inclure › Zone spécifique › fillsell.app** |
| ☐ | Durée de vie du jeton (TTL) | date de fin : **dans 7 jours** (il ne sert qu'au test) |
| ☐ | Continuer › Créer le jeton | le copier |

La commande ne touche **que** l'enregistrement A `cloud.fillsell.app` (nuage **gris**),
refuse s'il pointe déjà ailleurs, et ne modifie rien d'autre de la zone. Coût : 0 €.

**B. Sans jeton** : après la création du serveur (Claude te donne son IP),
fillsell.app › **DNS › Enregistrements › Ajouter un enregistrement** : Type **A**,
Nom **cloud**, Adresse IPv4 **l'IP du serveur**, Statut du proxy **DÉSACTIVÉ (nuage
gris, « DNS uniquement »)**, TTL Auto › Enregistrer. En attendant, le test tourne sur
`<ip>.sslip.io` ; l'écran « Me connecter » de l'app, lui, attend `cloud.fillsell.app`.

Pourquoi gris : le serveur prend son propre certificat et l'écran « Me connecter » est
un flux continu (WebSocket) qui ne doit pas passer par le proxy de Cloudflare.

## 4. Ce que tu m'envoies

1. Le **jeton API IPRoyal** (et, voie A, le **jeton Cloudflare**) — par le chat comme
   celui de Hetzner (je l'écris dans `secrets.env` sans jamais le réafficher), ou
   toi-même : `! notepad C:\Users\nicol\fillsell-cloud-proto\secrets.env`, lignes
   `IPROYAL_API_TOKEN=…` et `CLOUDFLARE_API_TOKEN=…`.
2. Le **numéro de commande** IPRoyal, seulement si tu as dû acheter l'IP toi-même.
3. Ton **GO** pour `--go` (création du serveur + achat de l'IP), puis, plus tard,
   ton **GO** pour les deux migrations (test complet, étape 2).

## 5. Ce qui ne bouge pas ce soir

- Apple, Google, Stripe : tes saisies (`fiche-boutiques.md`). Dans Stripe, **ne coche
  PAS** `invoice.payment_failed` ni `invoice.payment_action_required` : je les ajoute
  par l'API à la mise en ligne (`mise-en-ligne.md`, étape 4 bis).
- Coût total du test, tout compris : **≈ 5 € (Hetzner, une semaine) + ≈ 5 $ (une IP)** ;
  Cloudflare 0 €.
