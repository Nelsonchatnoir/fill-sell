# Lot D — derniers correctifs puis FillSell Cloud (30/10, à partir de 09:51, heures de Paris lues en base)

Consigne de Nico (30/10 matin) : partie 1 (trois correctifs), partie 2 (FillSell Cloud posé et implémenté), compte de
Nico seul pour les tests. Audits en lecture seule d'abord (4 en parallèle), puis correctifs, essais à blanc, feux
verts nommés pour les migrations, déploiements relus avant / après.

## Partie 1 — Correctifs

### 1.1 La lecture de la description d'origine en boucle — CLOS
- **Cause (audit)** : la demande (`lectures_origine_demandees`) était resservie 7 JOURS par `lectures_origine_en_attente`
  sans regarder ni les échecs ni le choix fait sur la fiche ; « Faire rédiger » posait le choix sans fermer la demande ;
  les freins de l'extension (repos, trace 1/h) vivent en mémoire du service worker, perdue à chaque redémarrage ; la
  0.6.157 n'écrit rien sur la demande. L'annonce de lauran (10581764660) est **MASQUÉE** chez Vinted (vinted_status
  hidden) — ni supprimée (ce serait 404), ni vendue.
- **Règle (base, toutes versions de l'extension)** : migration `20261030120000_lecture_origine_plafond` (feu vert de
  Nico 10:26, appliquée 10:27, repair fait ; inverse dans `supabase/rollbacks/`, essai à blanc 10 groupes verts) — voir
  `docs/regles/republication-et-publication.md` § 30/10 point 1. get-pending-jobs v303 ne retient plus la file pour une
  demande morte et plafonne les relevés « lecture d'origine » hors Vinted (3 terminés en 24 h). L'app dit « masquée »
  / « illisible » avec Écrire, Faire rédiger, Réessayer (OTA).
- **Preuve (usage_logs)** : lauran 47 relectures ratées de 09:16 à 10:16 → **0** de 10:27 à 10:58 (parc entier : 0).
- Garde-fou tenu : aucune lecture en masse, rien à l'import ; l'extension n'est pas touchée (aucun zip neuf).

### 1.2 L'abonnement Google périmé (BONCOIN) — CLOS
- **Fait rectifié** : le lot C se trompait (« elle paie deux fois ») — Google REVOKED + EXPIRED + remboursé le 29/10 à
  10:04 ; au paiement Stripe de 18:14 il était gratuit. Le profil gardait jeton, produit et fin Google (26/11).
- **Règle** : un canal qui s'arrête ne retire que SON droit (`_shared/droits-canaux.js`) — google-play-webhook v32,
  validate-google-purchase v12, stripe-webhook v61 ; la garde « jamais deux abonnements » relit l'abonnement chez
  Google (create-checkout-session v61) — `docs/regles/mails-paiements-comptabilite.md` § 30/10.
- **BONCOIN nettoyé** (10:33, `scripts/reparations/20261030_boncoin_canal_google_mort.sql`, sauvegarde
  `_backup_3010_canal_google_mort`, inverse prêt) : canal Google effacé, Premium Stripe intact.
- **API Google relue (lecture seule)** : patrick giry = Premium Google **ACTIF** jusqu'au 25/11 13:37 — légitime. Les 6
  autres jetons sont morts (EXPIRED ou 410), drapeaux déjà à 0, non touchés.
- **MRR** (actifs seuls, par canal, `abonnements-stores-audit` v2) : Stripe 33 · 837,67 € ; Apple 13 · 236,87 € ;
  Google 1 · 12,99 € → **47 abonnés · 1 087,53 € TTC / mois**.

### 1.3 Les republications Vinted d'Ornella — CLOS (règle du « dire »)
- **Cause** : la garde « une boutique Vinted à la fois » (légitime) — les 4 articles sont sur @ornella-vend (472079),
  Chrome est ouvert sur @luciatrendyshop ; @ornella-vend n'a pas été ouverte dans Chrome depuis le 13/10 (un passage
  le 26/10 a publié l'une d'elles). Aucun autre compte dans ce cas.
- **Trou corrigé** : une republication retenue ne le disait nulle part (error NULL). Désormais le job porte le message
  et la date d'attente (get-pending-jobs v303) ; la file dit « (en attente depuis le 24 oct.) ». Prouvé à 10:58 sur
  ses 4 jobs. Rien n'a été forcé.

## Partie 2 — FillSell Cloud

### 2.0 L'état des lieux (audit du 30/10 matin, avant tout geste)
| Point | Avant le lot D |
|---|---|
| Serveur Hetzner `fillsell-cloud-1` (cx43, 178.105.24.16, cloud.fillsell.app) | en marche, **figé au 05/10** (34c915e, extension 0.6.98-cloud), aucun navigateur |
| Prise atomique `prendre_job` (lot C) | en base, **aucun appelant** |
| Coffre AES-256-GCM à trousseau | code du 29/10, **non déployé** ; 0 ligne en base |
| Sel `cloud_empreinte_sel` | **absent** du vault (préparation d'essai refusée) |
| IP | modèle « dédiée par compte » ; 1 IP (94.194.94.233, fin 04/11) **plus attribuable à un essai** depuis le 25/10 → pool vide, 785 alertes « pool vide » (aucun mail) |
| Rotation / module fournisseur / alerte de solde | **absents** ; API résidentielle IPRoyal **non activée** ; solde 10,60 $ |
| Écrans (présentation, activation, Me connecter, mur, résiliation) | **existent** (Nico témoin écrit en dur) ; manquaient : conditions, état de l'exécutant, « à reconnecter », Depop |
| Paiement | Stripe : `STRIPE_PRICE_CLOUD` **absent** (paiement indisponible) ; Apple `app.fillsell.cloud.sub`, Google `cloud-monthly` / `cloud-trial-3d` (7 j) prêts côté code ; **aucun mode test Stripe** |
| Textes légaux | sections de /legal (CGV art. 7, confidentialité 4.8) cachées ; « Vinted et Leboncoin » seulement, « IP toujours la même » |
