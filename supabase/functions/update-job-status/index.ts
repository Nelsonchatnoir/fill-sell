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
      patch.error = typeof body.error === "string" ? body.error.slice(0, 2000) : "Erreur inconnue";
    } else if (statutEffectif === "pending") {
      // Ré-armement (ex: needsUser, l'utilisateur doit compléter une info) :
      // on garde l'error explicative si fournie, sinon on nettoie.
      patch.error = typeof body.error === "string" && body.error ? body.error.slice(0, 2000) : null;
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

    console.log(`[update-job-status] userId=${user.id} job=${jobId} → ${statutEffectif}${statutEffectif !== status ? ` (requalifié depuis ${status} : capture incomplète)` : ""}`);

    return json({ success: true, job: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[update-job-status] Erreur inattendue:", msg);
    return json({ error: msg }, 500);
  }
});
