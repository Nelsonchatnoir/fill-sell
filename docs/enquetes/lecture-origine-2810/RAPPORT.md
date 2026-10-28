# 28/10 — « Publier » bloqué sur la lecture de la description Vinted (Juliette, Petite planète, Cédric)

Demande de Nico (28/10 matin), corrigée en cours de route : **la récupération des descriptions à l'import reste coupée**
(lecture de fond, `coin_config.lecture_fond_mode` absent = pilote seul depuis le 26/10 07:38, décision de Nico) ; seule
la **lecture d'origine juste avant la publication** est réparée. Aucun changement du circuit d'import.

## Ce que la base dit (usage_logs, 25/10 → 28/10 10:40, heure de Paris)

- Chaque lecture demandée par un téléphone a été FAITE par l'ordinateur quand il était allumé et sous Chrome :
  Juliette 20:47:10 → lue 20:47:22 (fiche 1793129908308022, description posée), 22:29:12 → lue 22:29:21. Mais l'écran
  avait été fermé 1 s après son ouverture (`attendu_s` 0 à 16 sur 16 abandons) : il disait « Ferme, et publie dès
  qu'elle est lue » et se fermait d'un appui à côté.
- « vinted_sans_extension » décrit l'APPAREIL qui clique (un téléphone n'a pas d'extension) : la lecture est alors
  confiée à l'ordinateur du compte (`lectures_origine_demandees`). Ce n'est pas la conclusion de la lecture.
- Petite planète (Free, **Microsoft Edge**, deux postes) : 1 094 lectures « onglet_indisponible » (27/10 19:43 → 28/10
  10:40), toutes à 20 s pile = l'injection dans l'onglet Vinted de travail ne répond pas : onglet **en veille** (onglets
  en veille d'Edge : ni « déchargé », ni fermé — le réveil du 15/08 ne voit que `discarded`). Et le serveur rend les
  demandes de la plus ANCIENNE à la plus récente, 3 par cycle : ses 3 fiches ratées passaient devant toutes les autres.
  Même file bloquée chez Ianis (« page sans annonce », 140 essais sur 1 fiche).
- Cédric (Pro) : son lot a lu 24 pages Vinted à 1,1 s d'intervalle (27/10 22:33:33 → 22:33:51) : 15 lues, puis **429
  de Vinted** sur les 9 suivantes → toute lecture du poste coupée 6 h → son clic de 23:42 « vinted_echec ». Même chose
  chez axel terver (01:05) et jumiss44 (15:50). Régression du 26/10 (`89b29f7`, lectures du lot « en parallèle »).
- Juliette sans ordinateur (vu 01:50) à 02:52 → les trois choix ; elle a choisi « La faire rédiger » 13 fois, 9
  publications parties.

## generer_annonce « Le souci vient de nos serveurs » — deux causes, ni l'une ni l'autre OpenAI

- **Juliette** 28/10 02:54 : fiche 1793129900393000 (6 photos, retouche « ia_light » de 5) → generate-listing v124
  « **CPU Time exceeded** » (2 222 / 2 154 / 2 123 ms, HTTP **546**) trois fois. Cause : `Uint8Array.from(atob(b64),
  c => c.charCodeAt(0))` pour chaque image retouchée (~130 ms de calcul par image de 1024 px, mesuré : 661 ms pour 5,
  24 ms en boucle simple). Rien débité : le quota compte la ligne `generate_listing`, écrite seulement au succès.
- **Petite planète** 27/10 16:06 : 401 ×5 — « Session not found » côté auth (sa session avait été fermée ; le jeton
  restait lisible par la base), « Refresh Token Not Found » à 16:07:53, reconnexion par mot de passe à 16:08:13. L'app
  traduisait tout non-2xx en « nos serveurs ».

## Régression ou jamais couvert

| Cause | Depuis | Nature |
|---|---|---|
| Écran qui dit « Ferme » et se ferme d'un appui | 25/10 (`8cfd98c`, OTA 2.9.116) | conception de l'écran ; la trace n'existe que depuis ce jour |
| Onglet Vinted en veille (Edge) | toujours | jamais couvert (le réveil ne voyait que l'onglet déchargé) |
| Demandes ratées qui passent devant | 22/10 (`lectures_origine_en_attente` triée par ancienneté) | jamais couvert |
| Rafale de pages du lot → 429 | 26/10 08:41 (`89b29f7`, web + OTA 2.9.119) | **régression** |
| CPU de generate-listing | dès qu'on retouche 5 photos (décodage inchangé depuis juillet) | jamais couvert |
| 401 dit « nos serveurs » | 01/10 (message unique) | jamais couvert |

La coupure de la lecture de fond (26/10 07:38) a rendu ces chemins fréquents : toute fiche importée sans texte dépend
désormais de la lecture au clic. Elle reste coupée (décision de Nico).

## Ce qui change (règles, pour tous les comptes et tous les navigateurs)

1. **L'attente tient, puis a ses issues** (`attenteLectureRegles.lecteurEnRetard`, stepper et lot) : sur un téléphone,
   « Ton ordinateur (son extension FillSell) lit ta description Vinted, en général en moins de 2 minutes : garde cet
   écran ouvert » ; un appui à côté ne ferme plus une attente ; **passé 3 min sans lecture**, la phrase vraie (« ton
   ordinateur ne l'a pas encore lue (vu pour la dernière fois à HH:MM) ») et les issues du « sans lecteur »
   s'ajoutent — Écrire ma description / La faire rédiger par FillSell / attendre. La relecture continue ; l'écran
   s'ouvre seul si la lecture arrive. Jamais une description sans le geste du vendeur, jamais une attente sans issue.
2. **Pas de rafale de pages Vinted** (`texteDuVendeur.prochainDepartLectureVinted`, un seul créneau pour toute l'app) :
   3 pages d'affilée, puis une toutes les 8 à 20 s (le rythme qui n'a jamais eu un refus) ; la rafale se recharge après
   60 s sans lecture. Un clic isolé n'attend jamais.
3. **Extension 0.6.149** : un onglet de travail gelé (`tab.frozen`) ou muet est réveillé par un vrai chargement de la
   page de l'annonce (le geste des dépôts et du jeton périmé), puis UNE relecture ; la fenêtre de travail se
   re-minimise. Les lectures demandées se font **la plus récente d'abord** ; une fiche ratée se repose 5, 10, 20, 40
   puis 60 min (mémoire du service worker) — elle ne bloque plus les autres et n'est jamais « close » à tort.
4. **generate-listing** : décodage des images retouchées en boucle simple (mêmes octets, ~25 fois moins de calcul).
5. **Rédaction, 401** : session rafraîchie et rédaction relancée UNE fois ; sinon « Ta session a expiré :
   reconnecte-toi. Rien n'a été décompté. » Le code HTTP part avec le signal `generer_annonce`.
6. **Trace** : `lecture_origine_en_attente` porte `lecteur` (« poste » / « ici »), `lecteur_vu_le`, `lecteur_version` ;
   l'abandon porte `ou` et `en_retard`.

Selftests : `lecture-origine-publication` (neuf, 35), `lecture-page-publique` (+8 : réveil, ordre, repos),
`attente-sans-lecteur` (la phrase d'attente suit la règle du 28/10).

## Comptes touchés depuis le 25/10 (fiches « Publier » bloquées sur la lecture)

| Compte | Palier | Fiches | Appareil | Cause | État au 28/10 ~11:00 |
|---|---|---|---|---|---|
| Petite planète (`5e78a731`) | Free | 8 (18 écrans) + génération 401 | Android ; ordinateur **Edge** | onglet en veille, file bloquée ; écran fermé | 5 ont leur texte, 3 encore sans |
| Juliette (`9bcc16d0`) | Premium (27/10 20:42) | 7 (9 écrans) + génération 546 | iOS ; Chrome | écran fermé (lues en 10 s) ; ordinateur éteint la nuit ; CPU | 2 ont leur texte, 4 publiées par « rédiger », 2 sans |
| Sylvain Kielock (`3d157a2b`) | Free | 2 | Android | écran fermé | 2/2 lues et publiées |
| BONCOIN (`3f91c02e`) | Premium | 2 | Android, web | écran fermé | 2/2 lues |
| Ianis Martin (`581767bb`) | Free | 1 (5 écrans, 51 min d'attente) | web | « page sans annonce » 140 fois | encore sans |
| patrick giry (`82e64f14`) | Premium | 1 | Android | ordinateur en 0.6.141 (25/10) | lue, publiée |
| Cédric GRIZSTYLE (`6e3d92b3`) | Pro | 1 | web | 429 Vinted (rafale du lot) | lue 28/10 06:44 |
| axel terver (`06b64aeb`) | Free | 1 | web | 429 Vinted (rafale du lot) | lue, publiée |
| Nico (`f44b5917`) | Pro | 1 (essai iOS) | iOS | écran fermé | sans (compte de test) |

Plus, sans écran bloqué : jumiss44 (`aa957efd`, Free) un 429 le 27/10 15:50.

**Comment chacun retrouve ses publications** : aucun job n'a été créé par ces clics (le blocage précède la création),
rien à relancer côté serveur, aucun quota consommé. Une fiche dont le texte a été lu depuis s'ouvre directement à
« Publier ». Une fiche encore sans texte : l'écran attend l'ordinateur (2 min en général), puis propose d'écrire ou de
faire rédiger. Petite planète : la lecture par son Edge revient avec la 0.6.149 (à téléverser) ; d'ici là, les issues
après 3 min. Juliette : sa fiche 1793129900393000 se rédige dès generate-listing redéployée.
