# Marine, 05/10 — ce qu'elle a vécu, et pourquoi ses relevés ont raté

Compte supprimé (user_id `6b2057a9-ee51-4070-8732-9759d30fd521`). Tout a été
effacé en cascade à 19:14 : il ne reste que les journaux Supabase, extraits
dans ce dossier (`edge_logs.tsv`, `function_logs.tsv`, …, cf. `README.md`),
plus `postgres_logs` (lu en direct) et 50 lignes de `inventaire_journal`.
Heures de Paris. **Fait** = lu dans un journal ; **déduit** = ce que le code
servi fait de ces faits ; **non établi** = ce qu'aucune trace ne permet de dire.

## 1. La session, minute par minute

| Heure | Fait (source) |
|---|---|
| 18:28:16 | Inscription depuis un PC Windows, Chrome 152 (`auth_logs`). |
| 18:28:32 | E-mail confirmé depuis son téléphone (Chrome Android) ; écran d'accueil de l'app web. |
| 18:28:55 → 18:30:16 | eBay relié par OAuth (compte relié, ORDER_CONFIRMATION abonné) — `function_logs`. |
| 18:31:07 / 18:31:32 | Connexion sur le PC (Chrome 152) puis dans l'app Android (Samsung, WebView). |
| 18:40:06 | **Relevé eBay automatique** (cron `ebay-releve-api`) : 5 annonces lues ; 5 fiches créées à 18:42 (journal `releve_ebay`). Aucun geste de sa part. |
| 18:47:13 → 18:47:27 | Lien envoyé vers l'ordinateur, connexion dans **Chrome 154** sur PC — c'est là qu'est installée l'extension 0.6.98. |
| 18:48:40 | Premier contact de l'extension. |
| 18:48:42 | Le serveur pose **seul** deux premiers relevés (trigger `profiles_premiers_releves_trg`) : Vinted `c7c61d49` et Beebs `bc7912db`. L'extension **prend les deux dans la même seconde**. |
| 18:48:42 → 18:56:30 | Le relevé Beebs tourne 8 min (liste, index public Beebs, captures de fiches, rattachement à 18:56:28). Il est clos « done » à 18:56:30 et le trigger `releve_incomplet_reprise` **pose seul une reprise** (`postgres_logs` : « run bc7912db (beebs done) → reprise 1/2 »). |
| 18:48:42 → 18:54:01 | Le relevé Vinted, pris, **attend derrière Beebs** (verrou de flux de l'extension) : 0 article, aucune écriture. À 18:54:01 `handler-watch` l'arrête et écrit : « … Chrome tournait bien de ton côté (ton extension nous a encore parlé il y a 5 min) : c'est la lecture qui s'est arrêtée toute seule. Le défaut est chez nous, pas chez toi. … » — **faux** : la lecture n'avait jamais commencé. |
| 18:51 → 18:58 | Dans l'app Android : annonce IA sur le blouson Pierre Cardin importé d'eBay (`generate-listing` 18:52:32), demande d'autorisation Opla (18:52:47), publication sur 3 plateformes (`spend_coins_and_publish` 18:53:02). |
| 18:56:41 → 18:57:03 | Le verrou libéré, l'extension ne trouve plus de relevé Vinted « en cours » (expiré) et en **crée un neuf** sous le déclencheur `bouton_distant`, écrit en dur dans le code. **Ce n'est pas un clic de Marine** : aucune demande de synchronisation de son app ni de son web dans les journaux. |
| 18:58:19 → 18:59:07 | Sur le web (PC) : 4 écritures `usage_logs` + `quotas_etat`. Les noms d'événements (`premium_cta_click`, `offers_modal_abandon`) **ne sont pas vérifiables** : lignes effacées avec le compte, corps des requêtes non journalisé. |
| 18:58:55 → 19:01:32 | Lecture Vinted : 75 annonces annoncées sur **une page** ; écriture par lots de 8 ; 8 lots, `items_vus` = 64. Connexion très lente côté Marine (5 à 20 s entre deux requêtes successives). Le 7ᵉ lot n'a écrit aucune fiche (pas d'écriture `inventaire` dans les journaux) : **moins de 64 fiches Vinted** ont réellement été créées (nombre exact non établi). |
| 19:01:32 | Début du 9ᵉ lot (deux lectures), puis **plus rien, sans erreur**. L'extension, elle, vit encore (relance par son alarme à 19:02:38). → le service worker a été tué ~30 s après son dernier appel d'API Chrome (le relevé du dressing ne le gardait pas éveillé). |
| 19:02:41 → 19:04:15 | L'extension sert l'autorisation Opla, puis la **reprise automatique Beebs** (finie à 19:04:15, 2 fiches de plus complétées). |
| 19:04:41 → 19:05:13 | Le job de publication Opla échoue (erreur technique requalifiée, `update-job-status`). |
| 19:05:46 / 19:05:51 | Deux « Je ne vends pas sur … » touchés **dans le popup de l'extension** (`plateforme_ecarter`). Lesquelles : non établi (corps non journalisé). |
| 19:09:01 | `handler-watch` arrête le 2ᵉ relevé Vinted : « aucune progression depuis 7 min (page 1, 64 articles lus). Chrome tournait bien… Le défaut est chez nous, pas chez toi. » |
| 19:09:07 → 19:09:59 | Relevé automatique des ventes Vinted et Leboncoin (extension). |
| 19:11:40 | Elle recharge l'app web (Stock), regarde des photos de fiches (19:12). |
| 19:12:40 | L'extension arme seule une « [reprise-auto] tentative 1/3 prévue 19:15 » sur le relevé Vinted. |
| 19:13:42 | Réglages › Mon compte › « Supprimer définitivement » : `supprimer_mon_stock_sans_retrait` → **500** (`statement timeout` à 8 s), puis `DELETE profiles` (19:13:50) et `delete-account` (19:13:51 → 19:14:00 : 34 fichiers effacés, utilisateur supprimé). |
| 19:15:44 | La reprise automatique part… sur un compte qui n'existe plus. |

## 2. Ce qu'elle voyait au moment de supprimer son compte

**Faits** (état des données à 19:13) : dans son stock, les 5 fiches eBay
(18:42), les fiches Vinted écrites entre 18:59 et 19:01 (moins de 64), 4 fiches
Beebs, le blouson Pierre Cardin avec ses publications (Opla en échec). Aucun
relevé Vinted n'avait abouti ; le dernier portait « [reprise-auto] tentative 1/3
prévue 19:15 ».

**Déduit du code servi** (web 2.9.57, `sync_multi_ouverte = 1` → bloc de
synchronisation du Stock) :
- la pastille **Vinted disait « — » (jamais synchronisé)** alors que des dizaines
  de fiches Vinted étaient dans son stock : le bloc ne lit que les relevés
  Vinted *réussis*, et la ligne Vinted qui porte les échecs est montée mais
  cachée (`display:none`). Aucun mot sur les deux arrêts, ni sur la reprise
  armée ;
- le texte « le défaut est chez nous » **n'apparaissait nulle part** dans le
  bloc (caché pour Vinted ; et même dans la carte Vinted il était coupé à 200
  caractères, avant cette phrase) ;
- les fiches Vinted importées portaient « Prix d'achat à compléter » ;
- le titre du bloc venait des seuls relevés eBay/Beebs réussis.

**Non établi** : l'écran exact (aucune capture), l'onglet ouvert juste avant
« Réglages », et la raison de son départ — **aucune raison n'est demandée ni
enregistrée** à la suppression du compte.

## 3. Conclusion

Faits : en 45 minutes, Marine n'a vu **aucun relevé Vinted aboutir** ; elle
n'en a lancé **aucun** elle-même — trois relevés sont partis seuls (eBay,
Vinted, Beebs) et deux reprises aussi ; le premier relevé Vinted a été arrêté
avant même de commencer, le second s'est figé à 64 sur 75 ; son stock s'est
rempli à moitié, sans que l'écran dise ni ce qui avait marché, ni ce qui avait
raté, ni quoi faire ; sa publication Opla a échoué ; elle a écarté deux
plateformes, puis supprimé son compte. Que le relevé raté soit LA raison de son
départ n'est pas établi (aucune raison recueillie) ; c'est la seule chose qui
ne marchait pas dans tout ce qu'elle a essayé.

Corrections au constat de départ :
- « 18:57 : elle relance elle-même le relevé » — **non** : la ligne a été créée
  par l'extension en reprenant le relevé posé par le serveur.
- « Beebs resté en running » — **non** : clos « done » à 18:56:30 (postgres_logs),
  puis repris automatiquement et fini à 19:04:15.
- « 18:48 Vinted pas connectée (401) » — la sonde de 18:48 a disparu avec le
  compte ; le code lit un 401 de sa sonde comme « indéterminé » (jeton de page
  parfois périmé). À 18:58 la lecture du compte Vinted a réussi. Qu'elle n'ait
  pas été connectée à 18:48 n'est **pas établi**.
- `supprimer_mon_stock_sans_retrait` a répondu 500 (délai de 8 s dépassé) :
  la suppression a continué et a abouti, mais cette RPC est trop lente pour
  un stock de ~75 fiches (reste ouvert).

## 4. Les relevés du parc, 7 jours (au 05/10 ~20:00)

2 221 relevés d'import (`dressing` + `annonces`), toutes plateformes.

| Origine | Relevés | Réussis | Pas connecté | Jamais pris (Chrome fermé) | Figés (chien de garde) | Autres |
|---|---|---|---|---|---|---|
| Automatiques coupés le 05/10 (premier relevé, reprises) | 350 | 151 | 129 | 33 | 16 | 21 |
| Geste de la personne | 806 | 517 | 225 | 47 | 11 | 6 |
| Veille gardée (cron, veilleur, retraits, eBay API) | 1 065 | 741 | 250 | 40 | 9 | 25 |

Par plateforme (réussis / total ; durée d'un relevé réussi, médiane / p90 ;
attente avant prise, médiane) : Vinted 373/500 (31 s / 180 s ; 76 s),
Leboncoin 344/510 (9 s / 106 s ; 118 s), Beebs 246/333 (73 s / 268 s ; 120 s),
eBay 258/453 (15 s / 218 s ; 195 s), Opla 188/424 (93 s / 206 s ; 144 s).
Le chien de garde a touché **60 relevés** en 7 jours : **35** « page 1, 0
article » — pris puis jamais commencés (prise avant le verrou de flux, cas de
Marine à 18:48) ; **6** arrêtés en pleine lecture (worker tué, cas de Marine à
19:01) ; **19** arrêtés après la lecture de la liste, pendant les captures ou le
rattachement, et clos « done [incomplet] » (comptés dans « réussis » au tableau,
ils ne l'étaient pas vraiment).

Corrections et preuves : `docs/agents/etat-2026-10-01.md`, section « 05/10
soir — relevés sur geste (Marine) ».
