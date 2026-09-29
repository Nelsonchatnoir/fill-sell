# Incident Beebs du 29/09 — la nuit (Claude, GO de Nico)

Reprise à 23:15 après l'arrêt d'Astra (23:10). Un seul écrivain : Claude.
Règles tenues : aucun client ne voit rien (question, notification, mail),
aucune annonce retirée ni republiée, rejeu annulé avant chaque écriture,
relecture après, `db push` jamais utilisé.

## Référence mesurée avant le premier geste (22:40–23:40 Paris)

| Fonction | Appels | Moyenne | p95 | 5xx |
|---|---|---|---|---|
| get-pending-jobs v167 (true) | 403 | 1042 ms | 2178 ms | 0 |
| update-job-status v108 (false) | 140 | 497 ms | 652 ms | 0 |
| handler-watch v65 | 17 | 5241 ms | 7704 ms | 0 |
| ebay-api-worker v60 (false) | 27 | 6745 ms | 15220 ms | 0 |
| beebs-lien v11 (false) | 12 | 2183 ms | 3799 ms | 0 |

Crons sur 2 h : beebs-lien 23/24 (1 « job startup timeout » à 22:25),
ebay-api-worker 60/60, handler-watch 40/40, republish-auto-sweep 40/40.
Aucune fonction edge déployée cette nuit : versions et `verify_jwt` inchangés.

## Ce qui est fait

1. **23:45 — les 21 questions de Joséphine mises en sommeil**
   (`20260929234000`). Rejeu : 21 lignes, questions ouvertes du parc
   2222 → 2201 (−21, rien ailleurs). Relu : 0 question ouverte chez elle.
2. **23:52:16 — rétention silencieuse au relevé** (`20260929233500`),
   `rapprocher_releve` md5 af90bb59 → 8dd12b94. Pour un compte qui a un dépôt
   Beebs de l'incident (publié depuis le 29/09 20:22) sans lien ni identifiant,
   une annonce non rattachée par identifiant n'est ni importée ni posée en
   question : `ignoree_le` + trace `rapprochements` motif
   `retenue_silencieuse_beebs`. La dette est **limitée aux dépôts depuis 20:22**
   (décision Nico) : les 48 dépôts de xxewwer (21–28/09) et le dépôt
   d'ornellaracano (24/09) n'ouvrent plus la garde, leur import est rouvert.
   Rejeu (relevé réel de Joséphine du 21:52) : 0 fiche, 0 question, 0 visible,
   0 effet ailleurs, 819 ms, inverse exact. ⚠️ Les 21 annonces du rejeu se
   sont rattachées par identifiant aux jobs de l'import : la branche de
   rétention elle-même n'a pas été exercée (le rejeu qui aurait retiré ces jobs
   a été refusé par le contrôle automatique de session). Premier passage réel
   à surveiller.
3. **23:59:54 — doublons de Joséphine** (`20260929235900`). Les 21 annonces
   relevées sont rattachées à leur fiche d'origine et à leur dépôt, qui reçoit
   son numéro et son lien exacts. Ensuite les 21 jobs « releve-annonces » et
   les 21 fiches en double sont supprimés. 16 paires : liste validée. 3 jeans
   (1 €) et 2 shorts TeX (2 €) : ordre des dépôts (publiés 20:37, 20:46,
   20:47 ; 21:05, 21:09) et des numéros (34076870, 34076941, 34076950 ;
   34077070, 34077101). Aucun retrait : `fillsell.sans_retrait` posé, parce que
   le trigger de suppression de fiche armait le retrait de l'annonce du job
   d'import. La garde `lien_jamais_croise` est restée active (0 refus).
   Rejeu, puis relecture : 21 dépôts numérotés, 21 annonces sur l'origine,
   0 fiche ni job en double, stock 362 → 341, 0 retrait, 0 question, 0 annonce
   à rattacher, 0 photo modifiée.
   ⚠️ Inverse partiel seulement : les 21 fiches et 21 jobs supprimés n'ont pas
   été copiés avant suppression.

## Ce qui n'est pas fait, et pourquoi

4. **Ping-pong recrutementgroupezk704 (geste C) : NON appliqué.** Le contrôle
   automatique de cette session a refusé l'installation d'un nouveau trigger
   en prod. Le mécanisme proposé : trigger Beebs `BEFORE UPDATE OF
   listing_url`. Un lien posé sans identifiant, dans une écriture qui porte un
   nouveau `listing_url_recovery`, sur un dépôt marqué `identifiant_beebs_non_prouve`,
   serait gardé en `candidat_identifiant_beebs` et jamais mis en `listing_url`.
   À reprendre avec Nico. En attendant, la boucle continue : beebs-lien efface
   le lien toutes les 5 min, l'extension 0.6.79 le repose par le titre. Quand
   un relevé tombe pendant que le lien est posé, l'annonce se rattache par ce
   lien, sans question visible, mais sur une identité tirée du titre.
5. **Autres dépôts Beebs sans numéro : aucune preuve exacte cette nuit.**
   Aucun n'a de ligne de relevé portant son `job_id`, de geste de la personne
   ou d'identifiant 0.6.80. Ils restent « publiés », en silence :
   recrutementgroupezk704 39 (il continue de publier), josephinecerni 7,
   noahbessaguetlefort 5, nicolas.svobodny 1 (Robe Camaïeu 8ca50a02, test
   0.6.80 : publiée sans identifiant).

## À savoir

- La fiche 1787440301966007 de Joséphine porte deux annonces Beebs et deux
  dépôts publiés depuis le 20 et le 23/09, dont un rattachement manuel de sa
  part. Cela ne vient pas de cette nuit : non touchée.
- ocbijoux62 : 52 questions ouvertes, posées entre 22:20 et 22:21 par ses
  relevés LBC/eBay. C'est le fonctionnement normal depuis le 27/09 : non
  touchées.
- ebay-api-worker a une moyenne de 12,9 s sur 20 minutes à 00:04. C'est de la
  variance normale : 13,9 et 14,0 s avant tout geste, entre 1,7 et 17,4 s
  toute la soirée.
