# Étude — délai de détection d'une vente (demande de Louis, 05/10)

ÉTUDE SEULEMENT : rien n'est codé avant le feu vert de Nico. Lecture seule,
mesures du 05/10 matin (30 derniers jours).

## 0. Corrections aux constats
- `ebay-ventes-sync` (cron 15, `40 4 * * *`) : pg_cron tourne en GMT → 06:40
  Paris. Elle ne fait que la comptabilité (getOrders).
- La vente eBay est vue par `ebay-api-worker` (*/2) : chaque annonce relue par
  l'API Browse toutes les 6 h ; la vente s'enregistre seule depuis le 01/10.
- `ebay-releve-api` (cron 27, */10) : UN relevé par jour et par compte relié actif.
- Vinted, Leboncoin, Beebs, Opla : le relevé complet passe une fois par 24 h
  (alarmes de l'extension), mais ce n'est PAS lui qui voit la vente : c'est la
  vérification annonce par annonce (`checkPublishedListings`) — au poll de
  2 min, 8 annonces au plus par cycle, chacune au plus toutes les 2 h, et
  seulement si Chrome est ouvert.

## 1. Délai réel (30 jours)
Heure de vente plateforme : `ventes.vendu_le` (date de commande lue au relevé des
ventes) ; eBay : `platform_fields.vente_ebay.fin`.

| Plateforme | Mesure | n | Médiane | p90 |
|---|---|---|---|---|
| Vinted (14 comptes) | vente → drapeau « vue » | 42 | 8,3 h | 91 h |
| Vinted | vente → vente enregistrée | 42 | 23,3 h | 197 h |
| eBay (depuis 01/10) | fin d'annonce → vente enregistrée | 7 | 2,5 h | max 8,4 h |
| eBay (30 j) | idem | 17 | 8,4 h | 65 h |
| Vinted (comptabilité) | `ventes.created_at − vendu_le` | 79 | 160 h | (« completed » = après livraison) |
| Leboncoin (comptabilité) | idem | 6 | 168 h | |
| Beebs / Opla | heure de vente non stockée | | âge de la dernière vérification (extension vue dans l'heure) : Beebs 2,8 h, LBC 6,6 h, Opla 6,9 h, Vinted 8,1 h (p90 12,9 h) | |

Sans extension vivante : 2 à 17 jours. Drapeau → clic de la personne (tous
comptes, hors eBay) : n = 1 053, médiane 10 min, p90 42 h.

**Louis** : 16 ventes, toutes Vinted ; ses 539 annonces revérifiées toutes les
1,4 à 2,6 h (max 3,3 h) quand Chrome est ouvert ; 8 drapeaux sur 16 entre 08:08
et 09:13 (ventes de la nuit vues au démarrage de Chrome) ; drapeau → clic :
médiane 9,9 h. Ses « ~24 h » = Chrome fermé la nuit + rotation de 2-3 h + vente
et retraits qui attendent son clic.

## 2. Ce qui fixe le délai
- Extension (Chrome ouvert, session valide) : poll de 2 min → vérification des
  annonces publiées (2 h minimum par annonce, 8 par cycle, pause 2,5–6 s) ;
  relevé complet Vinted 24 h ; relevés LBC/Beebs/eBay/Opla 24 h puis relevé des
  ventes Vinted/LBC/Opla (20 h) ; veilleur (annonce qui paraît hors ligne) ;
  bouton (15 min minimum).
- Serveur : `profiles_premiers_releves_trg_fn` ne pose que les PREMIERS relevés ;
  handler-watch arrête les figés et reprend les absents.
- Règle du 12/07 : la vérification ne fait que POSER un drapeau
  (`sale_signal` / `unavailable_since`) ; la vente et les retraits n'existent
  qu'au clic « Oui, enregistrer » (exception : eBay depuis le 01/10).

## 3. Descendre à ~5 min
- **Relevé COMPLET toutes les 5 min : à exclure.** `rapprocher_releve` ≈ 850 ms
  par appel ; ~276 relevés/jour aujourd'hui → ~39 000/jour (54 comptes × 2,5
  plateformes × 288) ≈ ×140 ; base aujourd'hui ≈ 0,17 cœur, CPU Small médiane
  4,2 %, p95 8,2 % → ×3,6 : le scénario du 04/10. Anti-robot : impossible.
- **Source légère : la liste des commandes** (appels déjà prouvés dans le
  code) : Vinted `/api/v2/my_orders?type=sold` (status=in_progress accepté),
  Leboncoin `…/pages/transactions?user_kind=seller`, Opla liste des commandes.
  Une vente y figure dès l'achat (aujourd'hui `ventes_statut_classe` range
  in_progress/accepted en « en_cours »/« inconnu » et la jette).
  - Coût : 1 appel par plateforme toutes les 4 à 7 min (aléa), depuis l'onglet
    de travail, greffé sur le poll ; numéros déjà vus en mémoire locale → 0
    écriture s'il n'y a rien. ⚠️ `refsVentesConnues` relit jusqu'à 12 000 lignes
    par passage : à exclure de ce chemin.
  - Par vente : 1 lecture du détail + 1 RPC (~0,3 s). Estimation < 150 s de base
    par jour pour tout le parc (< 1 %). ~170–290 requêtes/jour/plateforme/compte
    (à comparer aux ~4 800 lectures de pages/jour que les vérifications font déjà
    pour Louis).
  - DataDome : risque modéré (outils tiers à 4–6 min) ; aléa, arrêt au premier
    403 avec la reprise existante, jamais depuis le service worker.
  - Leboncoin : les ventes en main propre n'y figurent pas → la vérification des
    annonces reste nécessaire.
  - Beebs : aucune liste de commandes connue (à observer) ; en attendant, index
    Algolia relu par le serveur (1 requête par compte) et vérification ciblée
    par l'extension sur une absence (jamais un verdict).
- **eBay** : notification `ORDER_CONFIRMATION` (Notification API ; scope
  sell.fulfillment déjà détenu), webhook signé comme `ebay-account-deletion`,
  délai de quelques secondes, 0 sondage ; la veille 6 h et getOrders restent le
  filet. Repli : getOrders toutes les 5 min pour 41 comptes ≈ 11 800 appels/jour
  (quota Fulfillment 100 000/jour). ⚠️ La veille Browse fait déjà ~8 600
  appels/jour (2 274 annonces / 6 h) pour un quota Browse par défaut de 5 000 :
  à vérifier dans le tableau de bord eBay.

## 4. Comment la personne est prévenue aujourd'hui
- Bandeau « Vendue sur X 🎉 » dans l'app si elle est ouverte (sentinelle 45 s).
- Mail `ventes_du_jour` : 1 par 24 h au plus (8–22 h), seulement pour les ventes
  déjà enregistrées (après le clic) — 101 mails en 7 jours, 3 pour Louis en 30 j.
- Aucun push (`profiles.push_token` jamais rempli), aucune notification Chrome
  (pas de permission `notifications` dans le manifest).
- Manque : être averti au moment du drapeau, et la vente qui part seule.

## 5. Recommandation (chiffrée)
| Plateforme | Moyen | Délai visé | Coût |
|---|---|---|---|
| Vinted, Leboncoin, Opla | veille de la liste des commandes, aléa 4–7 min, Chrome ouvert | ≤ 7 min (au démarrage de Chrome si le poste dort) | ~200–290 req/jour/plateforme ; base < 1 % ; risque modéré (Vinted) |
| eBay | `ORDER_CONFIRMATION` + veille gardée | < 1 min | nul |
| Beebs | index + vérification ciblée, puis liste des commandes après observation | 15–30 min | 1 req/compte |

- Vente prouvée par la commande sur le numéro exact : l'enregistrer seule (prix
  PAYÉ lu sur la commande), comme eBay — c'est ce qui pèse le plus chez Louis
  (drapeau → clic médiane 9,9 h). **Décision de Nico** (renverse la règle du 12/07).
- Prévenir : notification Chrome (permission `notifications` → nouvelle version
  et nouvel examen CWS) et/ou push mobile (FCM/APNs, à construire), dès le drapeau.
- Prérequis (règle du 04/10) : passage réel mesuré (CPU, pg_stat_statements)
  avant la prod.
- Limite : sans Chrome allumé, seuls eBay (serveur) et l'index Beebs marchent ;
  la nuit, seule voie = navigateur hébergé (piste Cloud).

Fichiers : `chrome-extension/background.js` (~930-1000 alarmes, 9571-9595
cadence de vérification, 15690-16160 relevé des ventes, 18240+ vérifications) ;
`supabase/functions/ebay-api-worker/index.ts` (2145+) ;
`supabase/functions/_shared/ventes-a-annoncer.ts`.
