# Page de dépôt Vinted muette chez gjehly, Leboncoin bloqué derrière (01/11/2026 soir)

Compte : gjehly@gmail.com (`229c7b07-51f8-4ca6-835e-6b658f819427`), Pro (Apple) à 21:07, Brave, extension 0.6.164
(build `2026-11-01T12:23:35Z+dc2fb08`). Heures de Paris.

## Ce qu'on voyait
- Depuis 21:10, ses publications Vinted échouent en boucle : « onglet de travail vinted : le content script ne répond
  pas, ni après rechargement puis onglet neuf, ni fenêtre de travail visible » (jobs `eed435a3`, `64d51931` ; 79 autres
  derrière).
- Ses 13 Leboncoin (créés à 21:29) n'ont jamais démarré. eBay (API) publie.

## Ce que disent les traces (relues en base et dans les journaux des fonctions)
1. **Une seule page est muette, par intermittence : `vinted.fr/items/new`.** Six essais de suite (21:13, 21:22,
   21:30, 21:36, 21:39, 21:44), toujours la même fenêtre de travail `1287218969`, onglet resté « loading », aucune
   étape de remplissage. Entre ces essais, le relevé du dressing Vinted (21:18 et 21:45, 190 annonces,
   `vinted_sync_runs`) passe par le MÊME onglet de travail Vinted (racine `vinted.fr/`), dans la MÊME fenêtre, et son
   script répond ; le relevé des annonces Leboncoin (21:45) aussi. Au 7e essai (`64d51931`, 21:50 – 21:52), la page de
   dépôt s'est chargée et le remplissage est allé jusqu'à la catégorie (`fill_step` « vinted:Catégorie ») : arrêt sur une
   vraie question (« Vinted demande le format du colis pour ce rayon et n'en coche aucun », needs_user
   `champ_a_choisir`). À 22:00, son premier Leboncoin a été **publié** dans cette même fenêtre réduite, onglet caché.
   Ni Brave, ni la fenêtre, ni la session Vinted ne sont en cause en permanence : la page de dépôt Vinted, dans un onglet
   caché, ne finit pas toujours de se charger — même famille que vint.go.levraix (Chrome, Leboncoin
   `/deposer-une-annonce` resté « loading » dans une fenêtre neuve, passé au 5e essai).
2. **Pourquoi le script ne répond pas.** Chrome n'injecte nos scripts (manifeste, `document_idle`) qu'une fois le
   document chargé. Un onglet resté « loading » plus de 45 s, rechargement puis onglet neuf compris, n'a jamais reçu
   nos scripts. Le message de l'extension ne distinguait pas « jamais injecté », « page bloquée » et « page figée ».
   Hypothèse la plus probable, à confirmer par la sonde de la 0.6.165 : la page de dépôt est envoyée en flux (Next.js)
   et, dans un onglet caché, ce flux (ou un script tiers qui bloque son analyse) ne se termine pas toujours.
3. **Pourquoi « la fenêtre de travail visible » n'a rien changé.** La fenêtre de travail naît sur son porte-page
   `about:blank`, et chaque onglet de plateforme y est créé INACTIF. Le geste du 24/10 (`restaurerFenetrePourOngletMuet`)
   rendait la fenêtre visible… sur le porte-page : l'onglet Vinted restait caché derrière (relevé : `window_state`
   « normal », `tab_active` false). Dans tout le parc, sur 10 jours, ce geste n'a été joué que sur ces deux jobs : il
   n'a jamais rendu une page visible.
4. **Pourquoi Leboncoin attendait derrière Vinted.** Sa **publication programmée** est allumée (créneau du soir
   19 h – 22 h, plafond 8 par jour, une à la fois, espacement ≈ 22 min). Les places vont aux programmées dans l'ordre de
   la file : 79 Vinted (21:10 – 21:29) passaient avant 13 Leboncoin (21:29). Les deux places servies (21:10, 21:34) sont
   allées à des Vinted muets, qui repassent seuls en boucle (« canal coupé » → reprise, jamais une question) ; la
   suivante (≈ 21:57) serait allée à un troisième Vinted. À 8 par jour, les Leboncoin n'auraient démarré qu'après
   ~10 jours de Vinted muets. Une plateforme bloquée bloquait les autres.

## Ce qui est corrigé (pour tout le parc)
- **Serveur, `get-pending-jobs` v319 (21:58)** — `_shared/publication-programmee.js` : une plateforme dont une
  programmée DÉJÀ SERVIE est en reprise technique (pending/processing avec `pas_de_rouge_reprises` ≥ 1, ou needs_user
  en boucle technique) ne reçoit plus de nouvelle place ; la place va à la première programmée d'une autre plateforme.
  Toutes bloquées : rien de servi (jamais le même mur une fois de plus). Créneau, plafond, une à la fois et espacement
  inchangés : seule la tâche qui prend la place change. Une question sur l'article (needs_user sans boucle) ne bloque
  pas sa plateforme. Vérifié en prod : 21:58:36 « en reprise technique, sans nouvelle place : vinted », 1 servie →
  Leboncoin `0d39b70c` publié à 22:00.
- **Extension 0.6.165 (à téléverser)** — `background.js` :
  - le geste « fenêtre visible » rend l'onglet muet ACTIF dans la fenêtre dédiée (jamais dans une fenêtre de
    l'utilisateur, jamais le focus), y compris quand la fenêtre est déjà visible ; l'onglet neuf de la relance qui suit
    est montré lui aussi ;
  - **sonde de l'onglet muet** (`sonderOngletMuet`) après la relance et après la fenêtre visible : deux lectures
    immédiates (`injectImmediately`), bornées à 4 s — monde isolé (nos scripts ont-ils tourné ?) et monde de la page
    (readyState, statut HTTP, DOMContentLoaded, derniers hôtes de scripts, cadres, anti-robot, champs, formulaire hydraté
    par React). Verdict dans `work_window_state.at_end.events` (type `sonde_onglet_muet`), jamais dans le message
    d'erreur (classement inchangé : reprise technique) ;
  - **remède sur preuve seulement** (`remedeOngletMuet`) : document chargé qui n'a jamais reçu nos scripts →
    injection des fichiers du manifeste (Chrome l'a manquée) ; document encore « loading » dont le formulaire est déjà
    hydraté → injection immédiate (la page est vivante, seul son flux ne se termine pas). Formulaire mort, fil de la
    page bloqué, scripts déjà présents : rien. Un second passage de Chrome sur ces fichiers est rejeté d'emblée
    (redéclaration des `const` de premier niveau, dans les cinq fichiers) — jamais deux écouteurs.

## Ce qui n'est PAS fait, et pourquoi
- Aucune relance à la main : `eed435a3` repasse seul (reprise espacée, 45 min puis 3 h, 6 h) ; `64d51931` attend SA
  réponse au format du colis (question vraie, Magazines). Une fois la 0.6.165 sur son poste, le passage suivant la prend,
  et la sonde dira la cause exacte quand la page reste muette.
- Ses Vinted « Magazines » poseront sans doute la même question du colis (règle du 05/10 : jamais choisi à sa place).
- Aucune entrée dans `RELANCES_APRES_MAJ` : un « canal coupé » ne finit jamais en « relancer », la règle ne viserait
  rien (handler-watch non redéployé).
- Aucun mail au client. Rien touché du terminal Cloud.

## À regarder après la 0.6.165
```sql
select id, created_at at time zone 'Europe/Paris', status,
  jsonb_path_query_array(platform_fields->'work_window_state', '$.**.events[*] ? (@.type == "sonde_onglet_muet" || @.type == "scripts_injectes_onglet_muet")')
from cross_post_jobs where user_id = '229c7b07-51f8-4ca6-835e-6b658f819427' and platform = 'vinted'
  and handler_build like '%v0.6.165%' order by created_at desc limit 10;
```
- `ready_state` « loading » + `formulaire_hydrate` vrai + `scripts_injectes_onglet_muet` → le flux sans fin était la
  cause, et c'est soigné.
- `fil_bloque` → la page sature son fil (protection anti-robot, script tiers) : `derniers_scripts`, `anti_robot` le
  nomment.
- `ready_state` « loading », formulaire non hydraté → un script bloque l'analyse de la page : le dernier hôte de
  `derniers_scripts` est le suspect.

## Côté client, à noter (rien fait)
- Ses 12 autres Leboncoin partent dans ses créneaux du soir (plafond 8 par jour, ses réglages : 8 le 02/11, 4 le
  03/11), devant ses Vinted tant que Vinted reste en reprise technique.
- Ses programmées eBay (voie API) sont publiées hors du créneau et du plafond (24 publiées 21:10 – 21:28, sans
  `programmee_servie_le`) : à trancher par Nico (cadence).
- Le texte affiché sur ses Vinted (« interrompue sur ton ordinateur — onglet fermé, mise en veille ou coupure réseau »)
  est faux dans ce cas : la page de dépôt Vinted ne se charge pas.
