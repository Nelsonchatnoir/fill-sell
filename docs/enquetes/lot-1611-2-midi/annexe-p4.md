# Point 4 — ayadi007 : « remplacer mon compte Leboncoin » (diagnostic, 16/11/2026)

Compte FillSell : `cfdfda6f-d182-4974-81b2-07050fc95d37` (Business). Heures de Paris. **Lecture seule** : rien écrit en base,
aucun fichier du dépôt modifié, aucun déploiement. Requêtes : `.tmp-terminal/p4/qN.sql` (prod, `--read-only`) ; corps de prod
relus : `.tmp-terminal/p4/def_*.sql` (md5 ci-dessous, à relire le jour de l'écriture).

---------------------------------------------------------------------------------------------------------------------------
## 0. En bref

- **Cause** : depuis le 08/11 (extension 0.6.182) FillSell CONNAÎT le compte Leboncoin de chaque relevé et de chaque annonce
  (`compte_plateforme`), mais ne RETIENT aucun « compte suivi ». La règle du 08/11 se contente d'empêcher qu'un relevé d'un
  compte date disparues les annonces d'un autre compte. Résultat : les annonces de l'ancien compte restent « en ligne »
  pour toujours, occupent la place Leboncoin de leurs fiches (publication refusée « déjà en ligne »), et rien ne permet de
  dire « j'ai changé de compte ». Aucune question n'est posée à la personne (les traces `releve_autre_compte` /
  `releve_compte_change` ne sont lues par personne, ni l'app ni l'ops-digest).
- **Trois endroits mélangent encore deux comptes** (contre la règle du 08/11 « deux comptes ne se mélangent jamais ») :
  1. `get-pending-jobs` (republication, `_shared/republication-cible.js`) : **19 republications d'ayadi closes à tort le
     16/11 à 10:42** (« n'est plus en ligne : deux relevés complets ne l'ont pas vue ») — les deux relevés lisaient l'AUTRE
     compte ;
  2. la garde « mêmes photos » Leboncoin (`_shared/lbc-memes-photos.js`, occupants lus par get-pending-jobs) compte une
     annonce de l'autre compte comme « déjà en ligne sur le compte » (1 publication retenue le 16/11 10:58) ;
  3. le moteur de rapprochement importe les annonces de n'importe quel compte (16/11 10:29 : 50 fiches nées du nouveau
     compte, dont 41 « à vérifier »).
- **L'énoncé de départ est à corriger** : l'ancien compte (bf460991…) a été vu pour la dernière fois le **15/11 à 19:32**
  (108 annonces actives), et un retrait y a encore abouti le **16/11 à 08:36** ; le PC qui le portait est sur la page de
  connexion depuis le **16/11 10:28**. Les « 38-39 annonces non revues » de `releve_compte_change` ne sont PAS l'ancien
  compte : ce sont 38 dépôts FillSell du 11-12/11 sur le NOUVEAU compte (23b59b14…), disparus le 13/11 (figés par
  l'heuristique « compte changé ou vidé »).
- **Proposition** : un registre « compte suivi » par plateforme (Leboncoin d'abord), la question posée dans « À régler »
  quand un relevé lit un autre compte, et une RPC `remplacer_compte_plateforme` qui clôt l'ancien compte SANS vente, SANS
  retrait, SANS toucher aux fiches, puis laisse le moteur existant rattacher le nouveau. **Rien de neuf dans l'extension.**
  Une migration (préparée, essai sur base jetable, feu vert). Verrou `selftest:compte-plateforme-remplace`.

---------------------------------------------------------------------------------------------------------------------------
## 1. Comment FillSell retient « le compte » d'une plateforme

### 1.1 Leboncoin — ce qui existe (08/11 soir, point 3 de Nico)
- **Extension** (`chrome-extension/background.js`) :
  - `:20931-20935` le compte lu = cookie `lbc_user_id` sinon `account_id` du jeton de la page (celui passé à l'API en
    `owner.user_id`, `:20993`) ; `:21106-21116` `compteLeboncoinValide` (forme `^[A-Za-z0-9-]{3,80}$`).
  - `:20527-20537` le compte est écrit sur le relevé (`vinted_sync_runs.compte_plateforme`) AVANT le rapprochement ;
    `:20549` sur chaque annonce vue (`annonces_plateforme.compte_plateforme`, upsert : c'est le compte de la DERNIÈRE vue).
  - `:25207-25217` même chose pour la veille des annonces récentes.
  - Leboncoin seulement (`:20530`). Rien pour Beebs, Depop. Le dépôt (`lbc_depot`) ne note pas le compte.
- **Base** : migration `20261108190000_compte_plateforme_releve.sql` — deux colonnes NULL (`:31-32`), et
  `constater_absences_releve` (prod md5 `5fde069f0af7824eeb5936a06637d288`, lu le 16/11) :
  - `:54` `v_compte` = compte du relevé ; `:56-64` deux relevés de comptes différents ne forment jamais une paire ;
  - `:67-76` annonces vivantes d'un AUTRE compte connu : comptées, **trace `usage_logs.releve_autre_compte`** (une par
    relevé), jamais datées ;
  - `:83-97` heuristique du 08/11 midi (`20261108144000`) : ≥ 5 annonces (compte NULL **ou le même compte**) non revues par
    ce relevé ni le précédent, et aucune continuité (aucune annonce vue par les deux relevés créée avant leur dernière vue)
    → rien daté, **trace `usage_logs.releve_compte_change`**, retour `compte_change_ou_vide` ;
  - `:104` la boucle « Vendue ? » ignore aussi les annonces d'un autre compte connu.
- **Serveur, ailleurs** — le compte est respecté ici :
  - `_shared/introuvable-a-confirmer.js:186-194, 288-291` (un relevé d'un autre compte ne prouve pas une absence) ;
  - `_shared/retraits-en-retard.js:259-262` ;
  - `veille_recentes_ouvrir` (`20261114013000:172-184`) : le compte lu doit être celui du DERNIER relevé « done » (pas un
    compte retenu : il bascule à chaque relevé).
- **… et ignoré là** (preuves § 2.5) :
  - `get-pending-jobs/index.ts:3876-3888` choisit « le dernier relevé probant de la plateforme » sans regarder son compte ;
    `:3891-3893` ne lit pas `compte_plateforme` de la cible ; `_shared/republication-cible.js:46-78`
    (`jugerCibleRepublication`) n'a pas la notion de compte → `:3933-3941` clôt la republication (`messageCibleAbsenteConfirmee`,
    `republication-cible.js:126-130`) et pose `annonce_disparue` (lu ensuite par `republication_annonce_partie`) ;
  - `get-pending-jobs/index.ts:15989-15991` occupants de la garde « mêmes photos » lus sans `compte_plateforme` ;
    `_shared/lbc-memes-photos.js:15-17` (« déjà en ligne sur le compte ») ;
  - `rapprochement_v3_lire` (prod md5 `5ad32d189cbf726b69aa84a38f9ef9df`) et `rapprocher_importer`
    (`83b289b56cd667b6d358e32beeb87ad6`) ne lisent pas `compte_plateforme` ; `moteur.js` non plus (seul `perimee`,
    `moteur.js:77-82`).
- **Doc** : `docs/regles/rapprochement-et-releves.md:529-530` dit encore « FillSell ne connaît qu'UN compte Leboncoin à la
  fois et n'en garde pas le numéro » (vrai pour « un à la fois », dépassé pour le numéro) ; `:534-545`, `:554-555`, `:651`.

### 1.2 Ce que l'app montre : rien
Aucune lecture de `releve_autre_compte` / `releve_compte_change` dans `src/` ni dans `supabase/functions/` (grep). La ligne
« À régler › compte_plateforme » (`src/tabs/StockTab.jsx:10001-10003`, `src/utils/alertesCompte.js`) parle de SESSION
perdue / compte restreint, pas de compte changé. Aucun « Changer de compte Leboncoin » (seul eBay en a un :
`src/components/EbayCompteSection.jsx:178-179, 1152`).

### 1.3 Les autres plateformes : PAS la même règle
| Plateforme | Le compte connu ? | Changement de compte |
|---|---|---|
| Vinted | Oui : boutiques du pin (`profiles.vinted_sync_pin`), fiches `vinted_account_id` | Plusieurs boutiques admises. Boutique inconnue = « Boutique à confirmer » (`src/stock/ConfirmationBoutique.jsx`, `src/utils/vintedSync.js:599-628`), boutique d'un autre compte FillSell refusée ; un poste ouvert sur une autre boutique ne reçoit pas les tâches Vinted (`get-pending-jobs/index.ts:10019-10035`). Pas de « remplacer ». |
| eBay | Oui : compte relié par l'API (`ebay_accounts`) | « Changer de compte eBay » (consentement eBay, `prompt=login`) ; l'ancien compte : politiques remises à zéro, un retrait d'une annonce de l'ancien compte s'arrête avec « retire-la depuis l'ancien compte » (`selftest:ebay-changer-compte`) ; Chrome sur un autre compte → `[hors-compte-ebay]`, rien importé. |
| Leboncoin | Oui depuis 0.6.182 (relevé + annonce), aucun compte RETENU | Rien (ce rapport). |
| Beebs, Depop | Non (l'extension ne lit pas le compte) | Rien ; une règle de compte demanderait une extension neuve (CWS). |

---------------------------------------------------------------------------------------------------------------------------
## 2. État d'ayadi007 (lecture du 16/11 vers 11:30)

### 2.1 Trois comptes Leboncoin, deux ordinateurs (`q1`, `q2`, `q5`, `q37`)
| Compte | Vu | Annonces lues | Preuve |
|---|---|---|---|
| d'origine, compte inconnu (avant 0.6.182) = **bf460991-06f6-4460-a36f-b60393964407** | 05/11 18:55 → 08/11 (bloqué : relevés à 0), revu du **13/11 11:41 au 15/11 19:32** (34 relevés « done ») | 128 le 07/11 ; 107 à 111 du 13 au 15/11 | 104 lignes nées avant le 08/11 portent aujourd'hui le compte bf460991 (`q37`) : mêmes numéros d'annonce |
| **23b59b14-5cde-4fff-8bcb-7c6464608a33** (nouveau) | 08/11 23:14 → 16/11 11:06 (41 relevés) | 8 → 23 → 63 → 62 → 64-66 | 0 ligne née avant le 08/11 ; reçoit les dépôts FillSell depuis le 08/11 (`q14`) |

Postes (`profiles.extension_postes`, `q5`) :
- `410891ce…` Mac (Apple M3 Pro), vu 16/11 11:14 ; a fait les relevés 23b59b14 du 16/11 (dernier : run `9fa76c93`).
- `fc0d3951…` PC Windows (Intel UHD) ; dernier travail Leboncoin le 15/11 12:41 ; **mur Leboncoin le 16/11 10:28** (run
  `415b9f65`, « page de connexion »). Le 15/11, les relevés alternent bf460991 (26) et 23b59b14 (4) à quelques secondes
  d'écart (14:47 → 14:55) : deux postes, deux comptes.
- Le 15/11, FillSell a déposé **15 annonces sur bf460991 et 4 sur 23b59b14** (`q14`) : les tâches partent sur le compte du
  poste qui les prend.
- Le 16/11 à **08:36**, un retrait a abouti sur bf460991 (3309868010, sans « déjà absente », `q36`) : l'ancien compte
  marchait encore. À 10:28, le PC est sur la connexion Leboncoin (blocage ou déconnexion : non prouvé).

### 2.2 Relevés du 16/11 et traces (`q1`, `q4`)
| Heure | Run | Compte | Lues | `releve_autre_compte` | `releve_compte_change` |
|---|---|---|---|---|---|
| 09:46 | 118018fc | 23b59b14 | 64 | 108 | 39 (dernière vue 13/11 10:22) |
| 09:48 | 82600bd4 | 23b59b14 | 64 | 108 | 39 |
| 09:52 | 30b3176c | — | échec (« Mes annonces » sans liste) | | |
| 10:28 | 415b9f65 | — | absente (page de connexion, PC) | | |
| 10:38 | 380e348f | 23b59b14 | 66 | 108 | 39 |
| 11:06 | 9fa76c93 | 23b59b14 | 65 | 108 | 38 |

### 2.3 Les annonces Leboncoin vivantes chez nous (`disparu_le` NULL) (`q7`, `q8`, `q13`, `q16`, `q38`)
| Groupe | Annonces | Sur une fiche | Fiches au stock | dont tâche LBC « published » | Fiches vendues | Origine |
|---|---|---|---|---|---|---|
| **Ancien compte bf460991** (vues 15/11 19:32) | **108** | 95 | **91** | 90 | **4** | 83 mises en ligne le 13/11 hors FillSell, 15 dépôts FillSell du 15/11, 9 du 06/11, 1 du 19/09 |
| Nouveau compte, **figées** (run `8cf91156`, vues 13/11 10:22) | **38** | 38 (17 fiches au stock) | 17 | 17 | 0 | dépôts FillSell du 11-12/11 |
| Nouveau compte, vues aujourd'hui | 67 | 67 | 27 (+41 « à vérifier ») | 27 | 0 | 57 mises en ligne le 13/11 vers 20h hors FillSell, 8 dépôts FillSell du 15-16/11 |

- Les 91 fiches au stock de l'ancien compte (86 aussi sur Vinted) gardent une tâche Leboncoin « published » : leur
  publication sur Leboncoin est refusée `already_published` (`spend_coins_and_publish`, corps de prod
  `def_spend_coins_and_publish.sql:104-140`).
- **Les 38 « figées »** : même compte que les relevés (23b59b14), disparues entre le 13/11 10:22 et 20:38 (le compte a été
  entièrement republié hors FillSell à 20h). Un retrait du 16/11 10:48 sur l'une d'elles (3308066846) a conclu « déjà
  absente » (`q36`) : elles sont mortes. L'heuristique `compte_change_ou_vide` ne les datera JAMAIS : aucune annonce lue
  aujourd'hui n'a été créée avant le 13/11 10:22, la « continuité » ne reviendra pas.

### 2.4 Fiches (`q16`, `q31`, `q32`)
- 189 fiches au stock, **41 « à vérifier »** (hors du stock), 70 vendues.
- Le « Synchroniser » du 16/11 (moteur à 10:29) a fait naître 50 fiches `releve_leboncoin` depuis les annonces du nouveau
  compte : 9 au stock, 41 « à vérifier ». La place Leboncoin de la fiche candidate est occupée par **l'ancien compte dans 8
  cas**, par une **annonce figée dans 7 cas** ; 26 sont des doutes ordinaires (autoradios en série, « titre sans photo »…).

### 2.5 Tâches Leboncoin (`q9`, `q18`, `q20`, `q36`)
- Ouvertes : 3 `needs_user` — 1 « mêmes photos » (16/11 10:58) qui cite **3310090528 (ancien compte, vu 15/11 19:32)** et
  3310626922 (déposée le 16/11 10:09) : la garde retient à partir de deux jumelles, l'annonce de l'autre compte fait la
  deuxième ; 1 refus Leboncoin « même contenu » ; 1 animal (Saillie Ragdoll, 12/11).
- **19 republications créées par lui le 16/11 à 10:42, closes à la même minute** par get-pending-jobs : « Ton annonce
  Leboncoin n° … n'est plus en ligne : deux relevés complets de tes annonces ne l'ont pas vue » — toutes visent des
  annonces **bf460991** (3303358981, 3303457565, … 3308401728) ; les deux relevés étaient des relevés 23b59b14. Faux constat,
  rien retiré ni recréé, mais `annonce_disparue` est posé (la republication suivante de ces annonces sera refusée).
- ⚠ Sécurité (hors règle de compte, à connaître) : **3 objets VENDUS avaient encore une annonce ACTIVE sur l'ancien compte
  au 15/11 19:32** (`q39`) : 3303478608 « Costume garçon 7 ans » (vendu le 08/11 ; son retrait a conclu « déjà absente » le
  08/11 18:53 — l'annonce était désactivée par le blocage — puis elle est revenue active le 13/11), 3308403369 « Lampe
  horticole LED » (vendue 08/11 22:36, aucun retrait), 3308401684 « Dashcam Inefala » (vendue 08/11 11:42, aucun retrait).
  La 4e (Thermomètre, 3308402995) est en achat sur Leboncoin (`pending`). Si l'ancien compte est encore ouvert, ces 3
  annonces peuvent être achetées une seconde fois. Leboncoin n'a pas de « retrait clos puis revu en ligne → réarmé » (Beebs
  l'a : `retraits_beebs_rearmer_revus`).

### 2.6 Le parc (`q28`, `q29`, `q30`)
Depuis le 08/11, **128 comptes FillSell** ont un relevé Leboncoin à compte connu : **122 n'en ont vu qu'un, 6 en ont vu
deux** (02ca0f20 « LES PETITES FIOLES », 13e274de, 25caeedd, a641ba9e, **cfdfda6f**, d813639b « Delphine Knowles ») :
189 annonces vivantes d'un compte autre que celui du dernier relevé, dont 107 sur une fiche (ayadi : 108 / 95).

---------------------------------------------------------------------------------------------------------------------------
## 3. Le chemin proposé : « Remplacer mon compte Leboncoin »

### 3.1 Principe
- FillSell suit **UN compte par plateforme** (Leboncoin aujourd'hui : la règle « un compte à la fois » existe déjà). Ce
  compte est **RETENU** (registre), jamais deviné à chaque relevé.
- Un relevé qui lit un autre compte ne change rien d'office : **la question est posée** (« À régler »). Tant qu'elle est
  ouverte : les annonces de l'autre compte ne sont ni importées ni rattachées, les absences ne se croisent jamais, une
  republication d'une annonce d'un autre compte est retenue (jamais close), la garde « mêmes photos » ne compte que le
  compte de la publication.
- La personne répond :
  - **« Oui, suivre ce compte (65 annonces lues le 16/11 à 11:06) — je n'utilise plus l'ancien »** → la RPC remplace ;
  - **« Non, je reste sur mon compte habituel »** → rien ne change, « Connecte-toi à ton compte Leboncoin habituel sur ton
    ordinateur » ; les annonces lues ne sont jamais importées.
- Remplacer : l'ancien compte n'est plus suivi ; ses annonces vivantes sont **closes « ancien compte, ce n'est pas une
  vente »** (ni vente, ni « Vendue ? », ni retrait, ni fiche supprimée ou modifiée) ; ses tâches publiées se ferment
  (la place Leboncoin des fiches se libère) ; le compte lu devient suivi ; le **moteur EXISTANT** range ses annonces
  (photo + titre, jamais le titre seul, deux annonces = deux exemplaires, le doute = la question). Avant de confirmer,
  l'écran dit combien d'annonces de l'ancien compte FillSell ne surveillera plus, et nomme celles d'objets déjà vendus :
  « si ton ancien compte est encore ouvert, retire-les toi-même ».

### 3.2 Migration (une seule, PRÉPARÉE ; essai base jetable ; feu vert de Nico ; jamais `db push`)
Fichier proposé : `supabase/migrations/2026111x______compte_plateforme_suivi.sql` + `supabase/rollbacks/…_INVERSE.sql`.
Gardes md5 (corps de prod lus le 16/11, à relire le jour J) : `annonce_non_prouvee_vivante` `26953159be182f5444be55e4cc49ee45`,
`constater_absences_releve` `5fde069f0af7824eeb5936a06637d288`, `veille_recentes_ouvrir` `eaa5af6b6c82d7103dfd9b40d4a20d60`.

```sql
-- 1. Le registre (aucune écriture directe : RPC SECURITY DEFINER seulement)
CREATE TABLE IF NOT EXISTS public.comptes_plateforme (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('leboncoin')),          -- élargi quand Beebs/Depop liront leur compte
  compte text NOT NULL CHECK (compte ~ '^[A-Za-z0-9-]{3,80}$'),
  etat text NOT NULL CHECK (etat IN ('suivi', 'quitte')),
  decide_le timestamptz NOT NULL DEFAULT now(),
  decide_par text NOT NULL,                     -- 'amorce_1611' | 'premier_releve' | 'utilisateur'
  quitte_le timestamptz, remplace_par text, bilan jsonb,
  PRIMARY KEY (user_id, platform, compte));
CREATE UNIQUE INDEX IF NOT EXISTS comptes_plateforme_un_suivi ON public.comptes_plateforme (user_id, platform) WHERE etat = 'suivi';
ALTER TABLE public.comptes_plateforme ENABLE ROW LEVEL SECURITY;
CREATE POLICY comptes_plateforme_lire ON public.comptes_plateforme FOR SELECT TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS compte_quitte_le timestamptz;   -- NULL partout

-- 2. Amorce (une fois) : un compte FillSell dont TOUS les relevés « done » à compte connu lisent UN seul compte → suivi.
--    Plusieurs comptes (6 au 16/11) : rien → la question « lequel suivre ? ».
INSERT INTO comptes_plateforme (user_id, platform, compte, etat, decide_par)
SELECT user_id, 'leboncoin', min(compte_plateforme), 'suivi', 'amorce_1611' FROM vinted_sync_runs
 WHERE platform = 'leboncoin' AND kind = 'annonces' AND status = 'done' AND compte_plateforme IS NOT NULL
 GROUP BY user_id HAVING count(DISTINCT compte_plateforme) = 1
ON CONFLICT DO NOTHING;

-- 3. compte_plateforme_suivi(p_user, p_platform) STABLE → text (le compte suivi ou NULL).
-- 4. compte_plateforme_a_juger(p_user, p_platform, p_compte) STABLE → text :
--    NULL si p_compte inconnu, ou = suivi ; 'compte_quitte' si quitté ; 'autre_compte' si un suivi existe et diffère ;
--    'compte_a_confirmer' si aucun suivi ET une annonce vivante d'un autre compte connu existe.
-- 5. annonce_non_prouvee_vivante (corps de prod + une branche, après 'disparue') :
--      v := compte_plateforme_a_juger(a.user_id, a.platform, NULLIF(btrim(a.compte_plateforme), ''));
--      IF a.platform = 'leboncoin' AND v IS NOT NULL THEN RETURN v; END IF;
--    → la seule porte d'import (rapprocher_importer, geste compris) refuse en clair ; rapprochement_v3_lire la lit déjà
--      (`perimee … OR nv.motif IS NOT NULL`) : le moteur ne l'importe ni ne la rattache — AUCUN redéploiement de
--      `rapprochement` (même chemin que la règle du 14/11).
-- 6. constater_absences_releve (corps de prod + bloc ajouté juste après v_compte, relevé probant) :
--      premier compte vu : aucune ligne pour (user, platform) ET aucune annonce vivante d'un autre compte connu
--      → INSERT … 'suivi', 'premier_releve' ON CONFLICT DO NOTHING (aucune ligne inchangée réécrite).
--    Le reste à l'octet (dont releve_autre_compte et l'heuristique — voir décision D6).
-- 7. veille_recentes_ouvrir : 'compte_change' quand p_compte ≠ compte_plateforme_suivi (au lieu du dernier relevé « done »).

-- 8. La question, lue par l'app (STABLE, auth.uid(), bornée) :
CREATE FUNCTION public.compte_plateforme_a_confirmer() RETURNS jsonb STABLE SECURITY DEFINER …
--    Par plateforme : le DERNIER relevé « done » probant (releve_preuve_absence) a un compte connu ≠ suivi
--    (ou aucun suivi et ≥ 2 comptes connus vivants) →
--    { platform, compte_lu, releve_le, annonces_lues, compte_suivi, annonces_suivies_vivantes, fiches_au_stock,
--      fiches_vendues_avec_annonce_vivante [{titre, numero}], republications_engagees, taches_en_cours }

-- 9. Le geste (SECURITY DEFINER, auth.uid(), verrou consultatif par compte et plateforme) :
CREATE FUNCTION public.remplacer_compte_plateforme(p_platform text, p_compte text, p_simuler boolean DEFAULT true)
RETURNS jsonb …
--  Gardes (refus en clair, rien écrit) :
--   · p_platform = 'leboncoin' ; p_compte = compte du DERNIER relevé « done » probant (jamais un texte saisi) ;
--   · aucune tâche Leboncoin « processing » (l'extension y travaille), aucun relevé Leboncoin en cours ;
--   · déjà suivi → { ok, deja: true } sans écrire.
--  « Anciennes » = annonces Leboncoin vivantes du compte FillSell dont compte_plateforme est connu et ≠ p_compte.
--   (Compte NULL : jamais touchées ici — la règle d'avant.)
--  Écritures (p_simuler = false), chacune avec l'état d'avant (pour l'inverse) :
--   a. annonces_plateforme anciennes : disparu_le = COALESCE(disparu_le, now()), compte_quitte_le = now()
--      — jamais retiree_le, jamais statut_plateforme, jamais inventaire_id ;
--   b. cross_post_jobs publish/republish 'published' qui les désignent (listing_designe) → 'cancelled',
--      error « Annonce de ton ancien compte Leboncoin, que FillSell ne suit plus depuis le JJ/MM. Ce n'est pas une
--      vente : rien n'a été retiré. », platform_fields.compte_quitte = {ancien, nouveau, le, statut_avant, erreur_avant} ;
--      jamais 'sold', jamais sale_signal, jamais une ligne vendue ;
--   c. republications pending / needs_user NON engagées (étape absente, a_capturer, captured) sur elles → 'cancelled'
--      même texte ; une republication ENGAGÉE (deleted / recreated) n'est jamais touchée (elle va au bout) ;
--   d. retraits (delete) pending / needs_user / failed sur elles → 'cancelled' « FillSell ne peut plus retirer une
--      annonce de ton ancien compte : si ce compte est encore ouvert, retire-la toi-même » — listés dans le bilan ;
--   e. questions ouvertes qui ne portent QUE sur elles (copie_non_prouvee, « Vendue ? » d'une absence) → caduques ;
--   f. registre : ancien → 'quitte' (quitte_le, remplace_par), p_compte → 'suivi' ('utilisateur') ;
--   g. relance du rangement (le chemin de synchro_relancer_rangement) ; trace usage_logs 'compte_plateforme_remplace'.
--  Jamais : une fiche modifiée, supprimée, vendue ou sortie du stock ; un retrait créé ; un mail ; une vente.
```

### 3.3 Fonctions edge (aucun changement dans l'extension)
- `supabase/functions/_shared/republication-cible.js:46-78` : `jugerCibleRepublication({ …, compteCible, compteReleve })`
  → nouveau verdict `autre_compte` quand les deux sont connus et diffèrent (retenue, **jamais close**, message « Cette
  annonce est sur ton autre compte Leboncoin : FillSell ne la republie pas depuis le compte connecté. ») ;
  compte inconnu d'un côté : règle d'avant.
- `supabase/functions/get-pending-jobs/index.ts:3876-3888` : lire `compte_plateforme` des relevés ; `:3891-3893` celui de
  la cible ; le « dernier relevé probant » d'une cible au compte connu est le dernier relevé probant de **ce** compte.
- `get-pending-jobs/index.ts:15989-15991` + `_shared/lbc-memes-photos.js` : lire `compte_plateforme` ; un occupant
  `en_ligne` d'un compte connu ≠ compte suivi ne compte pas (Leboncoin ne refuse les mêmes photos que sur le MÊME compte).
- (Option, décision D4) routage par poste, sur le modèle Vinted `get-pending-jobs/index.ts:10019-10035` : un poste dont le
  dernier relevé Leboncoin (`extension_postes.<poste>.releve_leboncoin.run` → `compte_plateforme`) lit un compte ≠ suivi
  ne reçoit pas les tâches Leboncoin ; inconnu → comme avant. Lecture serveur seule, rien dans l'extension.
- Déploiement : `get-pending-jobs` (v380, `verify_jwt` true, lus le 16/11) ; `rapprochement` (v43) et `handler-watch` (v209)
  **inchangés**.

### 3.4 App (web au push, mobile à l'OTA)
- `src/utils/changementCompte.js` (neuf, pur) : `questionChangementCompte(lignes, lang)` → titre, texte, choix ; jamais de
  mot technique, d'émoji, de durée ni d'heure prévue (règle du 16/10, `selftest:aucune-estimation`).
- `src/stock/ChangementCompte.jsx` (neuf, sur le modèle de `ConfirmationBoutique.jsx`) : le compte lu (« le compte
  Leboncoin connecté sur ton ordinateur : 65 annonces »), l'ancien (« 108 annonces que FillSell suivait »), la liste des
  objets vendus encore en ligne là-bas ; « Simuler » d'abord (`p_simuler = true`) pour afficher le bilan, puis
  « Remplacer ».
- `src/tabs/StockTab.jsx:9984-10003` : une ligne « À régler » `compte_change` (« Leboncoin : un autre compte est
  connecté ») juste avant `compte_plateforme` ; `:9884` l'ajouter au compte `nbARegler` ; `:13039` l'écran ;
  `src/stock/EcranARegler.jsx:30, 85-90` icône et libellé. Lecture par `demarrerRelecture` (`src/utils/relectureBornee.js`,
  10 min, onglet visible) et à la fin d'un « Synchroniser » ; jamais de `setInterval`.
- (Facultatif) Réglages › Mes plateformes › Leboncoin : « Compte suivi : … · Changer de compte » qui ouvre le même écran
  seulement quand un relevé a lu un autre compte (le compte vient toujours d'un relevé, jamais saisi).

### 3.5 Extension
**Rien de neuf** pour Leboncoin : elle écrit déjà le compte (relevé, annonces, veille) depuis 0.6.182 ; les deux postes
d'ayadi sont en `2026-11-10T14:10:14Z+ba13a51`. Indispensable seulement pour étendre la règle à **Beebs / Depop** (lire leur
compte) : nouvelle version, CWS — décision D8.

### 3.6 Basculer ayadi007
1. Après migration + get-pending-jobs + app : son prochain passage montre la question (amorce : deux comptes → aucun
   suivi → `compte_plateforme_a_confirmer` rend Leboncoin, compte lu 23b59b14, 108 annonces de bf460991).
2. **Il clique** « Simuler » puis « Remplacer » (la RPC, p_compte = 23b59b14, lu sur son dernier relevé). Effet attendu
   (mesure du 16/11) : 108 annonces bf460991 closes (95 sur fiche : 91 au stock + 4 vendues), ~110 tâches « published »
   fermées sans vente, 0 retrait ouvert à fermer (aucun aujourd'hui), les 3 objets vendus encore actifs listés « à retirer
   toi-même si ce compte est ouvert », 91 fiches libérées pour Leboncoin, aucune fiche touchée.
3. Le moteur range ensuite les annonces SANS fiche du nouveau compte. Ses 41 « à vérifier » et 9 fiches nées le 16/11 ont
   déjà une décision automatique : soit il y répond (un « Oui » fusionne désormais, la place étant libre — sauf les 7 dont
   la candidate porte une annonce figée, D6), soit un rejeu en mode réparation de SON compte par un script
   `scripts/reparations/2026111x_compte_plateforme_rejeu.mjs` (`--simuler` puis `--appliquer`, sauvegarde, inverse) —
   décision D7. Aucune modification à la main.
4. Si Nico préfère ne pas attendre son clic : le même appel par un script `scripts/reparations/…_ayadi_compte_lbc.sql`
   (simulation, sauvegarde `_backup_…`, inverse depuis `platform_fields.compte_quitte.statut_avant`) — ⚠ c'est alors
   FillSell qui décide que l'ancien compte est abandonné (il marchait encore à 08:36).

### 3.7 Ce que le chemin ne règle pas (constats liés)
- **Les 38 annonces figées du MÊME compte** (heuristique `compte_change_ou_vide`, `20261108190000:83-97`) : elles restent
  « en ligne » pour toujours et bloquent 17 fiches et 7 questions. Décision D6.
- **Annonce revue en ligne après un retrait clos « déjà absente »** sur une fiche vendue (Costume garçon) : Leboncoin n'a
  pas le réarmement de Beebs. Décision D9.

---------------------------------------------------------------------------------------------------------------------------
## 4. Le verrou : `npm run selftest:compte-plateforme-remplace` (`scripts/compte-plateforme-remplace-selftest.mjs`)
Rouge sur le code et les corps de prod du 16/11 ; vert après. Modèle : `scripts/annonce-prouvee-vivante-selftest.mjs`
(Postgres embarqué jetable dans `.tmp-terminal/`, corps de prod relus dans `scripts/essais/fixtures/prod-1611-compte-plateforme/`,
`VERROU_MIGRATION=<absent>` = la prod seule) et `scripts/compte-plateforme-releve-selftest.mjs` (lecture des sources).

A. Pur, sans base (rouge aujourd'hui) :
1. `jugerCibleRepublication` : relevé du compte NEUF, cible du compte ANCIEN vue avant → `autre_compte`, jamais
   `cible_absente` (aujourd'hui : `cible_absente_du_releve` → close au 2e relevé : le cas des 19 du 16/11). Compte inconnu
   d'un côté ou même compte : verdicts d'avant (non-régression).
2. `jugerMemesPhotosLbc` : un occupant `en_ligne` d'un autre compte connu ne retient pas (le cas 3310090528).
3. get-pending-jobs lit `compte_plateforme` des relevés, des cibles et des occupants (lecture du source).
4. `src/utils/changementCompte.js` : question pour Leboncoin quand compte lu ≠ suivi ; jamais pour Vinted / eBay, jamais
   sur un relevé non probant ou un compte inconnu ; textes sans mot technique, émoji, durée.

B. Banc Postgres jetable, décor synthétique « ayadi » (comptes ANCIEN et NEUF, relevés probants des deux ; annonces ANCIEN
sur des fiches au stock, une fiche vendue, une republication `captured`, une `deleted`, un retrait en attente ; annonces
NEUF sans fiche dont une aux photos d'une fiche ANCIEN) :
1. Corps de prod : `rapprochement_v3_lire` rend l'annonce NEUF non périmée (importable) — le mélange est reproduit.
2. Après : amorce (un seul compte → suivi ; deux → aucun) ; NEUF « compte_a_confirmer » puis « autre_compte » : lue
   périmée, `rapprocher_importer` refuse en clair ; `compte_plateforme_a_confirmer()` rend la ligne attendue.
3. `remplacer_compte_plateforme` : refus (compte ≠ dernier relevé, relevé non probant, tâche processing) sans rien écrire ;
   simulation = 0 ligne changée ; application : annonces ANCIEN `disparu_le` + `compte_quitte_le`, `retiree_le` NULL ;
   tâches publiées → `cancelled` + texte + `compte_quitte.statut_avant` ; republication `captured` close, `deleted`
   intacte ; retrait en attente clos et listé ; **0 vente, 0 tâche `sold` changée, 0 retrait créé, 0 `sale_signal`, 0
   ligne `rapprochements` d'absence, 0 fiche modifiée** (statut, disparu_le, fusionne_dans, a_verifier) ; registre ANCIEN
   quitté / NEUF suivi ; ensuite l'annonce NEUF est lue vivante et rangée par le vrai `moteur.js` (photo + titre) ;
   `spend_coins_and_publish` accepte Leboncoin pour une fiche libérée ; 2e appel = `deja`, aucune écriture.
4. Un relevé ultérieur de l'ANCIEN compte : rien importé, rien daté, la question revient (symétrie) ;
   `veille_recentes_ouvrir` avec l'ANCIEN → `compte_change`.
5. Inverse : corps de prod à l'octet (md5), table et colonne retirées ; script de données inverse ; migration rejouée
   idempotente.
À rejouer avant le commit : ce verrou + `compte-plateforme-releve`, `annonce-prouvee-vivante`, `introuvable-a-confirmer`,
`releve-ancien-jamais-importe`, `veille-annonces-recentes`, `lbc-memes-photos`, `moteur-rattachement`, puis la suite complète.

---------------------------------------------------------------------------------------------------------------------------
## 5. Décisions de Nico
- **D1** Le principe : un compte suivi par plateforme ; « Remplacer » = les annonces de l'ancien compte closes « pas une
  vente », non surveillées (une vente faite là-bas n'est plus vue), avec la liste des objets vendus encore en ligne
  « à retirer toi-même ».
- **D2** L'amorce : 122 comptes adoptés en silence ; les 6 comptes à deux comptes reçoivent la question.
- **D3** Pendant la question : les annonces de l'autre compte ne sont PAS importées (aujourd'hui elles le sont).
- **D4** Router les tâches Leboncoin vers le poste du compte suivi (ayadi : 15 dépôts partis sur l'ancien compte le 15/11).
- **D5** Les corrections « deux comptes se mélangent » (republication, mêmes photos) sont des corrections de la règle du
  08/11 : à livrer avec ou avant le reste ?
- **D6** Les 38 annonces figées du même compte (et le même cas ailleurs) : les dater sans « Vendue ? », ou une seule
  question groupée, ou rien.
- **D7** ayadi : il clique lui-même (recommandé : l'ancien compte marchait encore à 08:36), ou script ; rejeu en mode
  réparation de son compte pour les 41 « à vérifier » / 9 créées, ou il répond lui-même.
- **D8** Beebs / Depop : lire leur compte (extension + CWS) pour étendre la règle.
- **D9** Leboncoin : réarmer un retrait clos « déjà absente » quand l'annonce d'une fiche vendue revient en ligne (3 cas
  chez ayadi, dont 1 retrait « fait »). Prévenir ayadi pour ces 3 annonces (aucun mail sans ordre).
- **D10** Feu vert de la migration après essai sur base jetable.
