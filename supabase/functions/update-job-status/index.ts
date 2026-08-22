import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Appelée par l'extension Chrome après chaque tentative de publication.
// Auth : JWT utilisateur (Bearer). L'update passe par un client scoped user
// → RLS garantit qu'un utilisateur ne peut modifier que ses propres jobs.
//
// Body : { job_id: uuid, status: string, error?: string, listing_url?: string }
//
// Transitions gérées ici (cycle de publication) :
//   pending → processing → published / failed / cancelled / dry_run_completed
// 'dry_run_completed' est un statut TERMINAL : un dry-run réussi n'est PLUS
// ré-armé en pending (sinon get-pending-jobs le rejouait à chaque cron de
// 30 min → réouverture d'onglets en boucle → suspension DataDome, incident
// vécu). Pour re-tester, régénérer le job depuis l'app (nouveau pending).
// Le cycle post-publication (vente + inventaire + annulation des frères) vit
// EXCLUSIVEMENT dans check-listing-status, et n'est déclenché QUE par le clic de
// confirmation de l'utilisateur dans l'app. Ne jamais le rebrancher ici.
//
// Déploiement : supabase functions deploy update-job-status
// verify_jwt reste à true (défaut) : la fonction reçoit toujours un JWT
// utilisateur, contrairement aux webhooks/cron listés dans CLAUDE.md.
// auth.getUser() ci-dessous n'est pas redondant : il fournit l'identité
// (user.id) et alimente le client scoped user pour la RLS.

// ⚠️ 'sold' RETIRÉ le 2026-07-12 (décision produit) — et le statut n'est plus
// acceptable ici du tout. Cette fonction pouvait orchestrer une vente (créer la
// ligne dans `ventes`, passer l'inventaire en vendu, annuler les frères) sur un
// simple appel status='sold'. Plus personne ne l'appelait ainsi, mais un chemin
// d'écriture automatique qui dort n'est pas une garantie : c'est un risque
// latent. Il est supprimé.
// DÉSORMAIS, DANS TOUT LE CODE, UNE VENTE NE PEUT ÊTRE ÉCRITE QUE PAR UN CLIC :
// le bandeau de l'app → check-listing-status { job_id, price } → orchestrateSale.
// Raison : aucune plateforme n'expose le prix NÉGOCIÉ ; écrire une vente sans
// confirmation humaine, c'est écrire une marge potentiellement fausse que
// personne ne reviendra corriger.
// Le job passe en 'sold' via l'orchestration elle-même, jamais par ce patch.
//
// 'deleted' (2026-07-11) : terminal d'un job action='delete' exécuté en LIVE.
//
// 'needs_user' (2026-07-19, socle « à trancher par l'utilisateur ») : un champ
// OBLIGATOIRE précis bloque la publication et seul l'utilisateur peut trancher.
// Posé par l'extension (détail structuré dans platform_fields.needsUserField,
// envoyé fusionné comme le reste de platform_fields). Le job N'EST PAS repris
// par le poll (get-pending-jobs ne distribue que 'pending') : il attend que
// l'app (mini-éditeur du Stock) écrive la valeur choisie dans platform_fields
// et le repasse en 'pending' — l'app fait cet update en direct via la RLS,
// pas par cette fonction. Les erreurs transitoires, elles, restent sur le
// chemin ré-armement borné → 'failed'.
const ALLOWED_STATUSES = ["pending", "processing", "published", "failed", "cancelled", "dry_run_completed", "deleted", "needs_user"];

// ── platform_listing_id : dérivé ICI, au point de passage unique (2026-08-03) ─
// La colonne existait depuis le 28/06 sans AUCUN écrivain : chaque publication
// laissait platform_listing_id NULL, l'id d'annonce ne vivant que dans
// listing_url. Conséquence prouvée (run 04184057) : la sync dressing Vinted ne
// pouvait pas rapprocher un article importé de son jumeau publié via FillSell
// → 32 doublons. Dériver côté serveur couvre TOUS les appelants, y compris
// les extensions déjà installées.
// beebs ajouté le 2026-08-13 : son format d'URL produit, longtemps « jamais
// observé », est désormais RELEVÉ EN BASE sur les 20 listing_url Beebs
// existants — tous en https://www.beebs.app/fr/p/<id numérique>-<slug>.
// L'ancrage /p/ borne l'extraction au segment produit : aucun autre nombre de
// l'URL (id de compte, tracking) ne peut être pris pour l'id d'annonce.
// Le backfill des lignes déjà publiées vit dans la migration
// 20260813200000_backfill_beebs_platform_listing_id.sql (même motif).
const LISTING_ID_PATTERNS: Record<string, RegExp> = {
  vinted: /\/items\/(\d+)/,
  leboncoin: /\/ad\/[^/]+\/(\d+)/,
  ebay: /\/itm\/[^?#]*?(\d{9,})/,
  beebs: /\/p\/(\d+)/,
};

// ══════════════════════════════════════════════════════════════════════════
// COUPE-CIRCUIT LIVRES / ISBN — republication Vinted (2026-08-22)
// ══════════════════════════════════════════════════════════════════════════
// 8 annonces DÉTRUITES du 15 au 22/08 : suppression Vinted actée, recréation
// refusée par « Merci d'entrer un numéro ISBN valide » (bug de pose ISBN,
// chantier séparé côté extension). Les 8 snapshots portaient catalog_id : le
// serveur SAVAIT que c'était un livre AVANT la suppression.
//
// POURQUOI ICI : l'extension écrit le snapshot de republication par CETTE
// fonction (status='processing' + platform_fields.republish_snapshot,
// background.js ~9260) et ATTEND la réponse ; sur une réponse non-2xx, elle
// renonce AVANT toute suppression (son catch écrit un failed de repli —
// intercepté plus bas). C'est le seul point de passage serveur entre
// « je sais que c'est un livre » et « je supprime » : le coupe-circuit y est
// donc 100 % serveur, sans release CWS.
//
// CRITÈRE (large exprès, faux positif accepté DANS la famille Livres/médias,
// jamais au-delà — peluches 1764, figurines 3312, vêtements : intouchés) :
//   · catalog_id observé de la famille (ids relevés en base sur les snapshots
//     réels — l'arbre docs/ ne porte pas les ids, on ne devine JAMAIS un id) ;
//   · OU clé isbn non vide dans le snapshot ;
//   · OU categoryPath de la famille — racine « Livres et médias » /
//     « Books & Media » (compte de dew en ANGLAIS : le test du seul libellé
//     français rate ces comptes), ou un segment exactement « Livres »/« Books »
//     (ancien arbre « Divertissement > Livres »). Comparaison sans accents.
//
// RÉVERSIBLE :
//   · kill switch : coin_config key 'republish_livres_garde' — garde ACTIVE
//     par défaut (clé absente = active) ; poser value=0 pour la désarmer ;
//   · jobs bloqués : marqueur platform_fields.needs_user_source =
//     'livres_isbn_garde' → remise en pending EN UNE REQUÊTE quand le fix
//     ISBN sera livré (l'étape reste 'captured', l'extension re-capture et
//     repart toute seule).
//
// PÉPITE (consigne du 22/08) : rendue IMMÉDIATEMENT, une seule fois — ordre
// « needs_user d'abord (CAS sur le statut = mutex), refund ensuite, marqueur
// pepite_remboursee en dernier » : un crash au pire double-rembourse 1 Pépite,
// jamais l'inverse (marqueur posé sans refund = utilisateur jamais remboursé,
// même au terminal — inacceptable). Le trigger republish_refund_on_terminal
// lit le même marqueur : aucun double crédit au solde éventuel.
const LIVRES_CATALOG_IDS = new Set([
  2319, // Livres > Fiction
  2320, // Livres > Non-fiction
  2321, // relevé par Nico le 22/08 (famille Livres)
  2363, // Livres > Enfants et jeunes adultes > Jeunes adultes
  2364, // Livres > Enfants et jeunes adultes > Enfants
  5424, // Magazines
  5425, // Livres > Bandes dessinées, mangas et romans graphiques
  5426, // Livres > Manuels scolaires et ressources pédagogiques
  5427, // Livres > Livres de coloriage et d'activités et revues de jeux
  3039, // Musique > CD (même famille « Livres et médias »)
  3045, // Vidéo > DVD (même famille)
]);
const sansAccents = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
function snapshotEstLivresMedias(snap: Record<string, unknown>): boolean {
  const cid = Number(snap.catalog_id);
  if (Number.isFinite(cid) && LIVRES_CATALOG_IDS.has(cid)) return true;
  if (typeof snap.isbn === "string" && snap.isbn.trim()) return true;
  const path = Array.isArray(snap.categoryPath) ? snap.categoryPath : [];
  if (path.length && ["livres et medias", "books & media"].includes(sansAccents(path[0]))) return true;
  return path.some((e) => /^(livres?|books?)$/.test(sansAccents(e)));
}
// Message utilisateur — formulation validée par Nico le 22/08, tel quel.
const MSG_GARDE_LIVRES =
  "Republication mise en pause AVANT toute suppression — ton annonce est intacte sur Vinted. " +
  "Motif : blocage connu sur la catégorie Livres (numéro ISBN exigé par Vinted). " +
  "On te préviendra dès que c'est réglé.";

// ⚠️ http://localhost:5173 (Vite dev) : sans lui, tout appel depuis le développement
// casse dès le PRÉFLIGHT CORS (« header has a value 'https://fillsell.app' that is not
// equal to the supplied origin »). Vécu le 2026-07-13 sur check-listing-status — le
// chemin « Oui, enregistrer la vente » était cassé depuis toujours en local. Passe
// généralisée aux 15 fonctions restantes. La PROD n'a jamais été affectée.
const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://");
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsOrigin = isAllowedOrigin(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Token invalide ou expiré" }, 401);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ok */ }

    const jobId = body.job_id as string | undefined;
    const status = body.status as string | undefined;

    // ══════════════════════════════════════════════════════════════════════
    // SONDE DE MODÉRATION LEBONCOIN — remboursement ANTICIPÉ (2026-08-11)
    // ══════════════════════════════════════════════════════════════════════
    // Leboncoin interdit la vente des cosmétiques : l'annonce est déposée, puis
    // refusée par leur modération quelques minutes plus tard. Le job reste
    // 'published' sans listing_url et le cron de nuit ne le rattrape qu'à 48 h
    // (mesuré : ~3 jours de délai réel pour le parfum du 11/08).
    //
    // ⚠️ BRANCHE SÉPARÉE, ET C'EST INDISPENSABLE. Elle rend la main avant le
    // patch générique plus bas, qui fait `if (status === "published")
    // patch.published_at = now()`. Repasser par là re-estamperait published_at,
    // donc DÉCALERAIT le repère des 48 h du cron à chaque sonde : le filet
    // ultime reculerait indéfiniment. Le statut du job n'est pas touché ici.
    //
    // ⚠️ POURQUOI PAS UN APPEL DIRECT DEPUIS L'EXTENSION : refund_publish_
    // unconfirmed est SECURITY DEFINER et n'est exécutable que par
    // service_role — vérifié en prod (proacl : postgres, service_role). La
    // grantée à `authenticated` serait un trou : la fonction prend un job_id et
    // ne contrôle AUCUNE appartenance, n'importe qui pourrait rembourser le job
    // d'un autre. On garde donc le schéma habituel : appartenance vérifiée par
    // le client USER (RLS), action privilégiée par le client service.
    //
    // ⚠️ AUCUN SEUIL N'EST CRU SUR PAROLE. L'extension décide quand appeler,
    // mais les conditions sont TOUTES revérifiées ici, sur l'horloge du
    // serveur : plateforme, action, statut, absence de lien, réservation, et
    // les 2 h écoulées. Une extension modifiée ne peut pas déclencher un
    // remboursement anticipé.
    if (body.refund_unconfirmed === true) {
      if (!jobId) return json({ error: "job_id requis" }, 400);

      const { data: j } = await userClient
        .from("cross_post_jobs")
        .select("id, platform, action, status, listing_url, published_at, created_at, reservation_id, platform_fields")
        .eq("id", jobId)
        .maybeSingle();
      if (!j) return json({ error: "Job introuvable" }, 404);

      // Refus NON fatals : la sonde a pu partir sur un état déjà périmé (URL
      // rattachée entre-temps, job annulé). On répond 200 avec le motif —
      // l'extension log et passe, elle n'a rien à réparer.
      const refuse = (raison: string) => json({ success: true, rembourse: 0, raison });
      // Périmètre STRICT (consigne du 11/08) : Leboncoin seulement. Beebs a une
      // vraie file de modération — une annonce absente de « Mes annonces » y est
      // normale — et eBay/Vinted ne passent pas par cette sonde du tout.
      if (j.platform !== "leboncoin") return refuse("plateforme_hors_perimetre");
      if (j.action !== "publish") return refuse("action_hors_perimetre");
      if (j.status !== "published") return refuse(`statut_${j.status}`);
      if (j.listing_url) return refuse("lien_deja_capture");
      if (!j.reservation_id) return refuse("sans_reservation");

      // Même repère que fail_publish_without_listing_url : COALESCE(published_at,
      // created_at). Un job créé le matin et publié le soir ne doit pas consommer
      // sa fenêtre avant d'exister en ligne.
      const repere = Date.parse(j.published_at ?? j.created_at ?? "");
      if (!Number.isFinite(repere)) return refuse("repere_illisible");
      const DELAI_MIN_MS = 2 * 60 * 60 * 1000;
      if (Date.now() - repere < DELAI_MIN_MS) return refuse("moins_de_2h");

      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) {
        console.error("[update-job-status] SUPABASE_SERVICE_ROLE_KEY absent — remboursement anticipé impossible");
        return json({ error: "Configuration serveur incomplète" }, 500);
      }
      const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

      // Idempotent par construction : refund_publish_unconfirmed refuse si un
      // coin_ledger porte déjà ref='refund_publish_unconfirmed:<job_id>'
      // (+ index unique coin_ledger_ref_unique). Le cron de 48 h appelle la
      // MÊME fonction : s'il repasse sur ce job, il rendra 0.
      const { data: refund, error: refundErr } = await serviceClient
        .rpc("refund_publish_unconfirmed", { p_job: jobId });
      if (refundErr) {
        console.error(`[update-job-status] refund_publish_unconfirmed job=${jobId}:`, refundErr.message);
        return json({ error: refundErr.message }, 500);
      }

      // Marqueur qui pilote l'affichage côté app. Le job RESTE 'published' :
      // c'est ce qui le maintient dans le périmètre de recoverMissingListingUrls
      // (`status=eq.published&listing_url=is.null`), donc sous surveillance
      // jusqu'à l'échéance 48 h habituelle. Le passer en 'failed' l'en sortirait
      // et casserait tout le principe : rembourser tôt SANS cesser de chercher.
      const pf = (j.platform_fields ?? {}) as Record<string, unknown>;
      const { error: pfErr } = await userClient
        .from("cross_post_jobs")
        .update({
          platform_fields: {
            ...pf,
            refund_unconfirmed: {
              at: new Date().toISOString(),
              repere: new Date(repere).toISOString(),
              refund,
              source: "moderation_probe_lbc",
            },
          },
        })
        .eq("id", jobId);
      if (pfErr) return json({ error: pfErr.message }, 500);

      console.log(`[update-job-status] userId=${user.id} job=${jobId} remboursement anticipé LBC : ${JSON.stringify(refund)}`);
      return json({ success: true, rembourse: (refund as Record<string, unknown>)?.rembourse ?? 0, refund });
    }

    if (!jobId || !status) return json({ error: "job_id et status requis" }, 400);
    if (!ALLOWED_STATUSES.includes(status)) {
      return json({ error: `status invalide, valeurs acceptées : ${ALLOWED_STATUSES.join(", ")}` }, 400);
    }

    // ── 'deleted' : réservé aux jobs action='delete' (suppression LIVE) ──────
    if (status === "deleted") {
      const { data: cur } = await userClient
        .from("cross_post_jobs")
        .select("id, action")
        .eq("id", jobId)
        .maybeSingle();
      if (!cur) return json({ error: "Job introuvable" }, 404);
      if (cur.action !== "delete") {
        return json({ error: "'deleted' est réservé aux jobs action='delete'" }, 400);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // COUPE-CIRCUIT LIVRES / ISBN (2026-08-22) — voir le bloc de tête.
    // ══════════════════════════════════════════════════════════════════════
    // Point d'interception EXACT : l'écriture du snapshot de republication —
    // status='processing' + republish_snapshot + republish_step='captured'
    // (background.js ~9260, SEULE écriture processing d'un republish à cette
    // étape, vérifié le 22/08 : le claim générique ~1539 ne concerne pas les
    // republish, aiguillés avant vers processRepublishJob).
    // ⚠️ JAMAIS sur l'étape 'deleted' (annonce déjà hors ligne : bloquer la
    // recréation aggraverait — d'où les gardes step='captured' ET !deleted_at).
    const pfIn = (body.platform_fields && typeof body.platform_fields === "object"
      ? body.platform_fields : null) as Record<string, unknown> | null;
    const snapIn = pfIn?.republish_snapshot as Record<string, unknown> | undefined;
    if (
      status === "processing" && snapIn && typeof snapIn === "object" &&
      pfIn?.republish_step === "captured" && !pfIn?.deleted_at &&
      snapshotEstLivresMedias(snapIn)
    ) {
      const { data: jLivre } = await userClient
        .from("cross_post_jobs")
        .select("id, action, platform, status, platform_fields")
        .eq("id", jobId)
        .maybeSingle();
      if (jLivre?.action === "republish" && jLivre.platform === "vinted") {
        // Kill switch : coin_config 'republish_livres_garde' — clé ABSENTE ou
        // illisible = garde ACTIVE (fail-closed sur les livres) ; value=0 = off.
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        let gardeActive = true;
        let serviceClient: ReturnType<typeof createClient> | null = null;
        if (serviceKey) {
          serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
          try {
            const { data: cfg } = await serviceClient
              .from("coin_config").select("value").eq("key", "republish_livres_garde").maybeSingle();
            if (cfg && Number((cfg as Record<string, unknown>).value) === 0) gardeActive = false;
          } catch { /* défaut : active */ }
        }
        if (gardeActive) {
          const pfGarde: Record<string, unknown> = {
            ...pfIn,
            needs_user_source: "livres_isbn_garde",
            republish_livres_bloque_le: new Date().toISOString(),
          };
          delete pfGarde.processing_since; // le job n'est PAS en traitement
          // CAS sur le statut = mutex : une seule écriture gagnante par blocage
          // (deux instances d'extension → la seconde matche 0 ligne, pas de
          // double refund). Le snapshot RESTE dans platform_fields : c'est lui
          // qui rend la relance auto possible au dé-blocage.
          const { data: bloque } = await userClient
            .from("cross_post_jobs")
            .update({ status: "needs_user", error: MSG_GARDE_LIVRES, platform_fields: pfGarde })
            .eq("id", jobId)
            .in("status", ["pending", "processing"])
            .select("id")
            .maybeSingle();
          if (bloque) {
            // Pépite rendue tout de suite (consigne 22/08), une seule fois :
            // marqueur pepite_remboursee posé APRÈS le refund réussi (un crash
            // entre les deux double-rembourse au pire 1 Pépite ; l'ordre
            // inverse pouvait laisser un utilisateur jamais remboursé). Le
            // trigger republish_refund_on_terminal lit le même marqueur.
            const pfCur = (jLivre.platform_fields ?? {}) as Record<string, unknown>;
            const montant = Number(pfCur.pepites_debitees ?? pfIn?.pepites_debitees ?? 0) || 0;
            const dejaRendue = String(pfCur.pepite_remboursee ?? pfIn?.pepite_remboursee ?? "") === "true";
            if (montant > 0 && !dejaRendue && serviceClient) {
              const { error: rErr } = await serviceClient.rpc("refund_coins", {
                p_user_id: user.id,
                p_amount: montant,
                p_metadata: { source: "republish_livres_garde", job_id: jobId },
                p_kind: "refund_republish",
              });
              if (rErr) {
                console.error(`[update-job-status] garde Livres job=${jobId} : refund_coins EN ÉCHEC (${rErr.message}) — Pépite NON rendue, à réparer à la main`);
              } else {
                await userClient
                  .from("cross_post_jobs")
                  .update({ platform_fields: { ...pfGarde, pepite_remboursee: true } })
                  .eq("id", jobId)
                  .eq("status", "needs_user");
              }
            }
          }
          console.log(`[update-job-status] userId=${user.id} job=${jobId} — garde Livres/ISBN : écriture processing REFUSÉE, job en needs_user, annonce intacte (catalog_id=${snapIn.catalog_id ?? "?"})`);
          // Réponse non-2xx OBLIGATOIRE : c'est elle qui fait renoncer
          // l'extension avant toute suppression (catch de background.js ~9261).
          return json({
            error: "Garde Livres : republication bloquée AVANT toute suppression (blocage ISBN connu) — job mis en pause, annonce intacte.",
          }, 409);
        }
      }
    }

    // Le catch de l'extension (background.js ~9261-9266) répond au 409
    // ci-dessus par un failed de repli « impossible de sécuriser les données ».
    // Le laisser passer écraserait le needs_user (et son platform_fields SANS
    // le marqueur ferait re-tirer le trigger de refund → double crédit). On
    // l'ignore, UNIQUEMENT quand le job porte bien notre garde.
    if (
      status === "failed" && typeof body.error === "string" &&
      body.error.startsWith("Republication annulée : impossible de sécuriser")
    ) {
      const { data: jf } = await userClient
        .from("cross_post_jobs")
        .select("status, platform_fields")
        .eq("id", jobId)
        .maybeSingle();
      const pfj = (jf?.platform_fields ?? {}) as Record<string, unknown>;
      if (jf?.status === "needs_user" && pfj.needs_user_source === "livres_isbn_garde") {
        console.log(`[update-job-status] userId=${user.id} job=${jobId} — garde Livres/ISBN : failed de repli IGNORÉ, needs_user conservé`);
        return json({ error: "Garde Livres : job maintenu en needs_user (failed de repli ignoré)." }, 409);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // PALLIATIF « capture incomplète » REPUBLISH (2026-08-21) — SERVEUR SEUL
    // ══════════════════════════════════════════════════════════════════════
    // L'extension déployée pose encore 'failed' (terminal — l'utilisateur n'a
    // AUCUN moyen de reprendre le job) quand la capture de republication est
    // incomplète, ou quand le pré-vol nomme un champ que l'annonce d'origine
    // ne porte pas. Tant que le correctif extension (needs_user natif) n'est
    // pas adopté par le parc, ce point de passage unique requalifie CES
    // failed-là en needs_user actionnable : l'utilisateur complète son annonce
    // SUR VINTED puis relance depuis l'app — la relance rejoue la capture, qui
    // relit Vinted (l'étape reste 'a_capturer' : rien d'autre à faire).
    // Périmètre STRICT : action='republish' seulement, motifs de capture
    // seulement. JAMAIS les échecs techniques photo (re-hébergement Bad
    // Request : rien que l'utilisateur puisse faire) ni les vrais terminaux
    // (annonce 404/vendue), qui ne portent pas ces motifs.
    // ⚠️ Pépite : needs_user n'est pas terminal → pas de remboursement ici.
    // Le balayage 72 h (handler-watch) soldera en failed si l'utilisateur ne
    // relance pas, et le trigger republish_refund_on_terminal rendra la
    // Pépite à CE moment-là — le message l'annonce.
    // Devient un no-op naturel le jour où l'extension pose needs_user
    // elle-même : plus aucun failed ne portera ces motifs.
    let statutEffectif = status;
    let messageEffectif: string | null = null;
    let champsACompleter: string[] | null = null;
    let pfDuJob: Record<string, unknown> | null = null;
    let raisonRequalif: string | null = null;
    if (status === "failed" && typeof body.error === "string") {
      const mCapture = body.error.match(/^Capture incomplète \((.+?)\) — republication/s);
      const mPrevol = body.error.match(/^Republication annulée AVANT toute suppression : Vinted exige « (.+?) »/s);
      if (mCapture || mPrevol) {
        const { data: jrow } = await userClient
          .from("cross_post_jobs")
          .select("action, platform_fields")
          .eq("id", jobId)
          .maybeSingle();
        if (jrow?.action === "republish") {
          pfDuJob = (jrow.platform_fields ?? {}) as Record<string, unknown>;
          // Clés = premiers mots des motifs de champs_manquants (posés par
          // capturerAnnonceVinted, forme "taille (size_id=… → libellé)").
          const LIBELLES: Record<string, string> = {
            taille: "Taille", marque: "Marque", colis: "Format de colis",
            categorie: "Catégorie", etat: "État", couleur: "Couleur",
            isbn: "ISBN", description: "Description",
          };
          const PEPITE_72H =
            "Ta Pépite reste réservée : elle te sera rendue automatiquement sous 72 h si la republication ne repart pas.";
          if (mCapture) {
            const motifs = mCapture[1].split(" ; ").map((m) => m.trim()).filter(Boolean);
            // photo* = échec technique (re-hébergement, URLs illisibles) : pas
            // un champ à compléter, le job reste failed si rien d'autre.
            const actionnables = motifs.filter((m) => !/^photo/i.test(m));
            if (actionnables.length) {
              const cles = [...new Set(
                actionnables
                  .map((m) => (m.split(/[\s(]/)[0] || "").toLowerCase())
                  .filter((c) => c in LIBELLES),
              )];
              statutEffectif = "needs_user";
              champsACompleter = cles;
              // Colis hors table = défaut de NOTRE table de formats, corrigé
              // dans le paquet extension suivant : rien à corriger sur Vinted,
              // le message ne doit pas envoyer l'utilisateur chercher un champ.
              messageEffectif = cles.length && cles.every((c) => c === "colis")
                ? "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. " +
                  "Le blocage vient d'un défaut de l'extension (format de colis non reconnu), corrigé dans la prochaine mise à jour : " +
                  "rien à corriger de ton côté, relance la republication depuis l'app d'ici quelques jours. " + PEPITE_72H
                : "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. " +
                  `Il manque : ${cles.length ? cles.map((c) => LIBELLES[c]).join(", ") : "des informations"} — ` +
                  "complète ton annonce sur Vinted, puis relance la republication depuis l'app. " + PEPITE_72H;
            }
          } else if (mPrevol) {
            const champ = mPrevol[1].slice(0, 120);
            statutEffectif = "needs_user";
            champsACompleter = [champ];
            messageEffectif =
              "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. " +
              `Vinted exige « ${champ} » et ton annonce ne porte pas cette information : ajoute-la sur ton annonce Vinted, ` +
              "puis relance la republication depuis l'app. " + PEPITE_72H;
          }
        }
      }
      if (statutEffectif !== status) raisonRequalif = "capture incomplète";
    }

    // ══════════════════════════════════════════════════════════════════════
    // PALLIATIF « back/forward cache » (2026-08-21) — SERVEUR SEUL
    // ══════════════════════════════════════════════════════════════════════
    // Chrome peut suspendre la page qui tient le canal de l'extension (bfcache :
    // navigation arrière/avant, onglet gelé) : le canal est coupé avec le
    // message « The page keeping the extension port is moved into back/forward
    // cache, so the message channel is closed. » — la page n'est pas cassée,
    // elle est SUSPENDUE : échec transitoire, pas un verdict sur le job.
    // Côté extension, TRANSIENT_JOB_ERROR_RE (background.js) ré-arme bien les
    // canaux coupés… mais matche « message channel closed » SANS le « is » de
    // cette formulation-là : elle passe au travers et arrive ici en failed sec
    // (4 jobs eBay du parc 0.6.6, 20-21/08 — zéro cas en 0.6.4, la fenêtre
    // post-clic tenue par le canal étant passée de ~8 s à ~40 s avec le re-clic
    // gouverné par la preuve réseau). Correctif extension dans un paquet
    // ultérieur ; en attendant, CE point de passage unique requalifie en
    // 'pending' → le job repart au poll suivant.
    // Signature PROPRE À CHROME, pas à une plateforme : appliquée quelle que
    // soit la plateforme ou l'action. Les autres signatures d'échec (REAUTH
    // VENTE, clic sans effet…) ne matchent pas et ne sont PAS touchées.
    // ⚠️ Pépite : requalifier AVANT l'écriture évite le passage par 'failed',
    // donc le trigger cross_post_jobs_settle_reservation ne relâche rien — la
    // réservation reste posée et la reprise ne re-débite JAMAIS (le débit est
    // porté par la réservation créée à la création du job, pas par tentative).
    // Borné : au-delà de MAX_BFCACHE_REARMS reprises, failed avec un message
    // clair (et là seulement, le trigger rend la Pépite — une fois).
    const BFCACHE_RE = /back\/forward cache/i;
    const MAX_BFCACHE_REARMS = 3;
    let bfcacheRearms: number | null = null;
    if (statutEffectif === "failed" && typeof body.error === "string" && BFCACHE_RE.test(body.error)) {
      const { data: jrow } = await userClient
        .from("cross_post_jobs")
        .select("platform_fields")
        .eq("id", jobId)
        .maybeSingle();
      pfDuJob = (jrow?.platform_fields ?? {}) as Record<string, unknown>;
      const pfBody = (body.platform_fields && typeof body.platform_fields === "object"
        ? body.platform_fields : {}) as Record<string, unknown>;
      // max(base, body) : le body de l'extension vient de la lecture du poll,
      // qui peut être antérieure au dernier incrément écrit ici.
      const deja = Math.max(Number(pfDuJob.bfcache_rearms ?? 0) || 0, Number(pfBody.bfcache_rearms ?? 0) || 0);
      if (deja < MAX_BFCACHE_REARMS) {
        bfcacheRearms = deja + 1;
        statutEffectif = "pending";
        raisonRequalif = `bfcache, reprise ${bfcacheRearms}/${MAX_BFCACHE_REARMS}`;
        messageEffectif =
          "Onglet suspendu par Chrome (back/forward cache) pendant l'opération — " +
          `reprise automatique au prochain passage de l'extension (tentative ${bfcacheRearms}/${MAX_BFCACHE_REARMS}).`;
      } else {
        // Limite atteinte : failed assumé, mais avec un message clair — le brut
        // de Chrome ne dit rien d'actionnable. « back/forward cache » reste
        // dans le texte, cherchable en base.
        messageEffectif =
          "Publication interrompue par Chrome (onglet suspendu en back/forward cache) à chaque tentative — " +
          `${MAX_BFCACHE_REARMS} reprises automatiques épuisées. Relance depuis l'app.`;
      }
    }

    const patch: Record<string, unknown> = { status: statutEffectif };

    // platform_fields optionnel : l'extension envoie l'objet DÉJÀ fusionné
    // (ex: compteur needsUserAttempts pour borner les ré-armements). On écrase
    // tel quel — pas de merge côté serveur, l'appelant a la version complète.
    if (body.platform_fields && typeof body.platform_fields === "object") {
      patch.platform_fields = body.platform_fields;
    }

    // Détail structuré du palliatif : l'app lit champs_a_completer pour
    // afficher quoi compléter, sans re-parser le message humain.
    if (champsACompleter) {
      patch.platform_fields = {
        ...((patch.platform_fields ?? pfDuJob ?? {}) as Record<string, unknown>),
        champs_a_completer: champsACompleter,
        needs_user_source: "capture_incomplete",
      };
    }

    // Compteur de reprises bfcache : porté par platform_fields, donc relu par
    // le poll suivant et renvoyé par l'extension — la borne tient sans colonne.
    if (bfcacheRearms != null) {
      patch.platform_fields = {
        ...((patch.platform_fields ?? pfDuJob ?? {}) as Record<string, unknown>),
        bfcache_rearms: bfcacheRearms,
      };
    }

    // Estampille de version du build extension (handler-watch, 2026-07-16) :
    // colonne dédiée, purement diagnostique, jamais bloquante.
    if (typeof body.handler_build === "string" && body.handler_build) {
      patch.handler_build = body.handler_build.slice(0, 120);
    }

    if (statutEffectif === "published") {
      patch.published_at = new Date().toISOString();
      patch.error = null;
      if (typeof body.listing_url === "string" && body.listing_url) {
        patch.listing_url = body.listing_url;
        // L'id d'annonce accompagne TOUJOURS l'URL dont il est extrait — les
        // deux colonnes ne peuvent pas diverger. Lecture du platform du job :
        // le motif d'extraction en dépend, et le body n'est pas de confiance.
        const { data: jobRow } = await userClient
          .from("cross_post_jobs")
          .select("platform")
          .eq("id", jobId)
          .maybeSingle();
        const re = LISTING_ID_PATTERNS[jobRow?.platform ?? ""];
        const m = re ? body.listing_url.match(re) : null;
        if (m) patch.platform_listing_id = m[1];
      }
    } else if (statutEffectif === "failed") {
      // messageEffectif (bfcache, reprises épuisées) prime sur le brut Chrome,
      // qui ne dit rien d'actionnable à l'utilisateur.
      patch.error = messageEffectif
        ?? (typeof body.error === "string" ? body.error.slice(0, 2000) : "Erreur inconnue");
    } else if (statutEffectif === "pending") {
      // Ré-armement (ex: needsUser, l'utilisateur doit compléter une info) :
      // on garde l'error explicative si fournie, sinon on nettoie.
      // messageEffectif (requalification bfcache) prime sur le brut Chrome.
      patch.error = messageEffectif
        ?? (typeof body.error === "string" && body.error ? body.error.slice(0, 2000) : null);
    } else if (statutEffectif === "needs_user") {
      // Champ précis à trancher côté app : error porte le message humain
      // (affiché au survol/tap du badge « À compléter »), le détail structuré
      // vit dans platform_fields.needsUserField (déjà dans le patch ci-dessus).
      // messageEffectif (palliatif capture incomplète) prime sur body.error,
      // qui porte encore l'ancien message failed « la Pépite est rendue » —
      // faux en needs_user.
      patch.error = messageEffectif
        ?? (typeof body.error === "string" && body.error ? body.error.slice(0, 2000) : null);
    } else if (statutEffectif === "dry_run_completed") {
      // Terminal : dry-run réussi, ne repart pas dans la queue. L'éventuel
      // détail (champs manquants, trace du dry-run delete) vit dans
      // platform_fields, pas dans error.
      patch.error = null;
    } else if (statutEffectif === "deleted") {
      // Terminal : annonce réellement supprimée de la plateforme.
      patch.error = null;
    }

    const { data: updated, error: updateErr } = await userClient
      .from("cross_post_jobs")
      .update(patch)
      .eq("id", jobId)
      .select("id, status")
      .maybeSingle();

    if (updateErr) return json({ error: updateErr.message }, 500);
    if (!updated) return json({ error: "Job introuvable" }, 404);

    console.log(`[update-job-status] userId=${user.id} job=${jobId} → ${statutEffectif}${raisonRequalif ? ` (requalifié depuis ${status} : ${raisonRequalif})` : ""}`);

    return json({ success: true, job: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-job-status] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
