# Louis — ventes remailées, ventes invisibles dans l'app (11/10)

Compte : Louis Thonet (Business, `faf5021a`). Articles fabriqués, fiches à
~9 997 exemplaires. Une annonce Vinted = un exemplaire.

## 1. Constat (lu en prod le 11/10)

- 85 notes `push_ventes` sur 30 jours. AUCUN téléphone enregistré (0 ligne
  `appareils_push` pour lui… et pour tout le parc, cf. § 4) : toutes les notes
  annoncées sont `sans_appareil`, le mail seul part.
- **Ventes déjà traitées puis remailées** (reçu `ventes_operations` du 06/10
  17:02, puis note « vendue » + mail) :
  - 10248443064 « Rangement Gris » → remailée le 09/10 20:12 (3 j 3 h après) ;
  - 10251765273 « 12 adaptateurs Rouge » → remailée le 10/10 20:41 (4 j) ;
  - 10254091481 « Rangement Gris et Bleu Ciel » → remailée le 11/10 08:46 (4 j 16 h) ;
  - et 4 notes du 06/10 17:03 (10238384500, 10194251645, 10184114204,
    10152002902 : ventes du 30/09 au 05/10) — mails partis avant la garde
    « vente_ancienne » du 06/10 soir.
- **Ventes jamais traitées, mailées deux fois** : 10276053804 (Noir et Blanc),
  10276047846 (Gris et Rouge), 10269303712 (Gris et Violet) — mail le 08/10
  00:03, puis le 11/10 08:46.
- **Deux autres ventes mailées jamais traitées** (non listées au départ) :
  10289147239 (12 adaptateurs, mail 09/10 20:12) et 10289137208 (Rangement
  Blanc, mail 10/10 20:41). Relevé Vinted : vendues.
- **Deux mails du 08/10 20:12 sur des annonces toujours EN LIGNE** :
  10289157745 et 10289168362 (dressing « active » le 11/10). Faux signal
  d'avant la règle du 09/10 (« le mail après la vente »).

## 2. Cause réelle des remails

`push_ventes_a_envoyer` décidait « même vente déjà annoncée » ainsi :

```
o.cree_le > now() - interval '3 days' and o.cles && v_cles
```

1. **Fenêtre de 3 jours** : passé 3 jours, une note sur la même annonce
   n'était plus un doublon.
2. **Le reçu de la vente n'était jamais lu** (`ventes_operations`) : seules les
   notes comptaient.
3. **Pourquoi l'annonce revient** : une fiche à quantité garde son
   `vinted_item_id` sur une ANCIENNE annonce (la remise en vente crée une autre
   annonce, la fiche reste pointée sur l'ancienne). Quand le relevé du dressing
   voit cette ancienne annonce passer « sold », le déclencheur
   `inventaire_push_vinted_vendu` note une vente neuve.
4. **Pourquoi les autres gardes ne l'ont pas arrêtée** :
   - `push_vinted_vendue_avant` (annonce vue « sold » un jour PRÉCÉDENT) : chez
     Vinted, 10254091481 était encore « active » du 05 au 10/10 et « sold » le
     11/10 — première photo « sold » le jour même. La déclaration du 06/10 était
     donc anticipée (la vente réelle a eu lieu le 10 ou le 11) ; elle reste la
     seule vente comptée.
   - « vente_ancienne » (push-ventes) : la fiche avait été vue en ligne la veille
     (`preuve_recente = releve:…`) → vente « récente ».
   - les notes `ignoree` / `signal_dementi` du 08/10 20:12 ne comptent pas comme
     « annoncées » (elles ne sont jamais parties) : c'est voulu et inchangé.
5. **Les 3 « jamais traitées »** : le mail du 08/10 00:03 venait d'un signal
   de la veille sur des annonces encore EN LIGNE (dressing « active » les 08, 09
   et 10/10) ; la vraie vente est vue le 11/10 → 2e mail, 3 j 8 h après le
   premier : hors fenêtre.

## 3. Pourquoi rien dans l'app

- Les notes d'origine `vinted` (déclencheur de la fiche) partent sans attendre
  de vente (seules les notes de JOB attendent leur vente depuis le 09/10).
  Aucune vente n'est donc enregistrée ; aucune remise en vente.
- Les jobs de ces annonces sont `published` SANS `sale_signal` (signal démenti
  par la synchro du dressing le 08/10 20:12, jamais reposé : le relevé du
  dressing « sold » ne le repose pas) → aucun bandeau « Vendue ? ».
- La vente automatique (`ventes_prouvees_tick`) exige `sale_signal = 'sold'`
  sur le job → rien.
- La notification push n'ouvre que la fiche (ou les Ventes) : il n'existait
  AUCUN écran « remettre en vente ou non », push ou pas.

**08/10 10:34, par quel écran Louis a déclaré 2 ventes** (10248430500,
10269317193) : le bandeau « 🎉 Vendue sur Vinted ! » de la zone des bandeaux
(`confirmSaleFromBanner` → `check-listing-status`), journal `usage_logs`
`vente_a_annoncer` à 10:34:45 et 10:34:56. Ces deux jobs portaient encore
`sale_signal = 'sold'` (veille du 07/10 22:03) ; les trois autres l'avaient
perdu (annonces revues en ligne au dressing).

## 4. Pourquoi Louis n'a aucun appareil enregistré

Personne n'en a : **0 ligne `appareils_push` dans tout le parc**. Le module
natif `@capacitor/push-notifications` n'existe qu'à partir du binaire 2.9.62,
qui n'a jamais été fabriqué : pas de `android/app/google-services.json`, aucun
secret `APNS_*` ni `FCM_SERVICE_ACCOUNT` posé (`supabase secrets list`, 11/10).
Aucun binaire publié ne contient le module : `pushDisponible()` y répond faux,
l'app ne demande jamais la permission, aucun jeton n'est créé — ni refus de
Louis, ni panne de son côté. Rien n'a été forcé.

## 5. Ce qui a changé (migration 20261011100000)

**Règle 1 — une annonce vendue ne se signale qu'une fois**
(`push_vente_deja_signalee`), à la naissance de la note (`push_noter` : née
`doublon`, aucun appel push-ventes) ET avant tout envoi
(`push_ventes_a_envoyer`), sans limite de temps :
- (a) reçu `ventes_operations` de l'annonce posé AVANT le signal →
  `vente_deja_enregistree` (une note de job qui attend SA vente la voit arriver
  après elle : elle part, règle du 09/10 intacte) ;
- (b) même commande déjà annoncée (push ou mail) ou déclarée →
  `vente_deja_annoncee` ;
- (c) même annonce déjà annoncée ou déclarée → `vente_deja_annoncee`.
- **eBay** : jamais l'annonce, la commande seule (une annonce en quantité se
  vend plusieurs fois). **Leboncoin** : deux commandes lues différentes sur une
  annonce = deux ventes (annonces pro à plusieurs unités).
- Le rapprochement par job ou par fiche (pièce unique) garde sa fenêtre de
  3 jours. Toutes les autres règles (`ignoree`, `trop_tard`, `signal_dementi`,
  `vente_non_enregistree`, rattrapage de masse, `vente_ancienne`) : inchangées.

**Règle 2 — la décision ne dépend plus de la notification**
- `ventes_a_decider()` : les ventes détectées ET annoncées (push ou mail), non
  enregistrées, avec ou sans téléphone. Jamais une vente traitée (reçu, vente
  déclarée, job vendu, fiche vendue), jamais une annonce que la plateforme
  montre de nouveau en ligne, jamais ce que le bandeau « Vendue ? » d'un job
  porte déjà ; mêmes conditions que l'enregistrement (annonce non remplacée,
  exemplaire prouvé). 100 lignes, 5 s au plus.
- App : liste « Ventes à confirmer » en tête de la zone des bandeaux (Stock
  compris), `src/components/VentesADecider.jsx`, lue avec le reste
  (`fetchAll`, jamais en boucle). Deux boutons quand il reste du stock :
  « Remettre en vente sur Vinted » / « Ne pas remettre » (un seul,
  « Enregistrer la vente », au dernier exemplaire). Prix modifiable.
- Même chemin que la déclaration : `check-listing-status` →
  `enregistrer_vente_declaree` → `enregistrer_vente_atomique` (reçu, quantité,
  `remises_en_vente`). « Ne pas remettre » = `p_remettre_en_vente = false` : la
  ligne `remises_en_vente` naît `abandonnee`, motif `choix_personne`.
- Mail « Vendu » : bouton vers `https://fillsell.app/app?ventes=a-decider`
  (Stock, liste) ; une vente non enregistrée est dite « repérée », « Confirme-la
  dans FillSell ». Mesure : `usage_logs.feature = 'ventes_a_confirmer'`
  (`lien_mail`, `decidee`, `refusee`).

## 6. Preuves

- `node scripts/preuves/preuve-vente-signalee-une-fois.mjs` (transaction
  annulée, aucun mail ni push) : 34/34 — vraies notes de Louis (doublons
  reconnus, liste = 5 ventes, « ne pas remettre » / « remettre » joués et
  annulés, revue « vendue » après décision → doublon sans appel), eBay deux
  commandes = deux ventes, Leboncoin, compte AVEC téléphone (push + mail), vente
  à l'unité (une seule note, après la vente).
- `npm run selftest:vente-signalee-une-fois` (41 contrôles).
- Non-régression : `preuve-mail-apres-vente` 16/16 ; `preuve:push-ventes` 28/31
  et `preuve-mails-ventes` en panne À L'IDENTIQUE avant et après la migration
  (périmées depuis la règle du 09/10, pas touchées ici).

## 7. En prod (11/10)

- Migration **20261011100000 appliquée** (feu vert nommé) et inscrite ; droits
  relus (`ventes_a_decider` : comptes connectés ; le reste : service seulement).
- `push-ventes` **v10**, `check-listing-status` **v37**, `verify_jwt` false lu
  avant et après ; diagnostic push-ventes : 200.
- **Rattrapage par la règle** (`scripts/reparations/20261011_ventes_deja_traitees_doublon.sql`) :
  simulation sur tout le parc = 10 notes, TOUTES chez Louis ; sauvegarde
  `_backup_1110_push_ventes_doublon` ; 311-314, 1107, 1214, 1236 →
  `doublon` (`rattrapage_1110:vente_deja_enregistree`), 1233-1235 → `doublon`
  (`rattrapage_1110:vente_deja_annoncee`). `mail_statut` et `part_le` gardés :
  le journal dit toujours que le mail est parti.
- **Liste de Louis lue en prod** (en son nom, lecture seule) : 10289137208,
  10289147239, 10269303712, 10276047846, 10276053804 — ni les ventes déjà
  traitées, ni 10289157745 / 10289168362 (annonces revues en ligne).

## 8. Ce qui reste

- **Vente automatique** : ces 5 ventes ne sont pas enregistrées seules, parce
  que le relevé du dressing « sold » ne repose pas `sale_signal` sur le job
  (démenti le 08/10 20:12) et `ventes_prouvees_tick` l'exige. Louis les
  confirme dans la liste. Faut-il que le dressing « sold » arme la vente
  automatique ? À trancher : ce n'est pas fait.
- **Fiches à quantité pointées sur une ancienne annonce** : la fiche garde
  l'ancien `vinted_item_id` après une remise en vente. La règle empêche le
  remail, mais la fiche reste « vinted_status = sold ». Non touché.
- **Notifications push** : rien ne peut partir tant que le binaire 2.9.62
  (google-services.json, clés APNs et FCM) n'est pas fabriqué
  (`docs/push/CLES-NICO.md`).
- **Fiches à l'unité** passées « vendu » par le dressing sans vente en compta
  (35 annonces mailées sur 14 comptes, aucune ligne `ventes` liée pour 22 d’entre elles) : constat
  en passant, hors sujet, non touché.
- `preuve:push-ventes` (B4, E0) et `preuve-mails-ventes` sont périmées depuis
  la règle du 09/10. Elles ne sont pas réécrites ici.
