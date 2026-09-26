// ============================================================================
// ENVOI PONCTUEL — LA FONCTION QU'ON NE REDÉPLOIE PLUS (2026-09-23)
// ============================================================================
// POURQUOI ELLE EXISTE. Jusqu'à aujourd'hui, chaque mail de support ou de
// campagne se soldait par une NOUVELLE fonction edge : destinataire en dur,
// `verify_jwt = false`, jeton maison, jamais commitée, jamais supprimée. Les
// portes d'envoi sont passées de 19 à 35 en trois jours. Trente et une ont été
// supprimées le 23/09 ; celle-ci existe pour qu'il n'y en ait plus jamais une
// trente-deuxième.
//
// ⛔ ELLE NE COMPOSE AUCUN TEXTE. L'appelant fournit le sujet et le HTML : les
//    gabarits de marque vivent dans _shared/emails-fillsell.ts et n'ont rien à
//    faire ici. Cette fonction est une PORTE, pas un rédacteur.
//
// CE QU'ELLE GARANTIT, ET QUE LES TRENTE ET UNE NE GARANTISSAIENT PAS :
//   · elle n'est appelable QUE par la clé de service — pas de jeton en dur,
//     donc rien à fuiter dans le dépôt, et aucun appel possible depuis un
//     navigateur, même authentifié ;
//   · elle passe par la PORTE UNIQUE envoyerEmail() (_shared/desinscription.ts)
//     — désinscription respectée, ligne email_logs écrite, échecs consignés
//     dans email_log_echecs, en-tête List-Unsubscribe One-Click sur tout
//     marketing ;
//   · `type` et `categorie` sont OBLIGATOIRES, sans défaut : un envoi qui ne
//     sait pas dire ce qu'il est ne part pas ;
//   · plafond de 2 mails par personne et par 24 h sur ce qui part de NOTRE
//     initiative. Une réponse de support n'est jamais plafonnée.
//
// ── LE PLAFOND, ET CE QU'IL COMPTE EXACTEMENT ──────────────────────────────
// Il compte TOUTES les lignes email_logs de la personne sur 24 h glissantes,
// quel que soit le type. C'est un choix, et il est assumé : `email_logs` ne
// porte pas la catégorie, et surtout « deux mails par jour » se juge depuis la
// BOÎTE DE RÉCEPTION de quelqu'un, pas depuis nos catégories internes. Une
// réponse de support compte donc dans ce qu'on lui a envoyé aujourd'hui, mais
// ne peut jamais être BLOQUÉE par le plafond — c'est la seule asymétrie, et
// elle va dans le bon sens : on préfère retenir une campagne que retenir une
// réponse à quelqu'un qui attend.
//
// ── PIÈCES JOINTES (2026-09-26) — OPTIONNELLES, PAR DESTINATAIRE ────────────
// Première demande : l'export PDF des ventes de Joséphine. La clé
// `pieces_jointes` vit DANS chaque destinataire, jamais au niveau de l'appel :
// un export est personnel, il ne peut partir qu'à la personne qu'il concerne —
// impossible de joindre par mégarde le fichier de quelqu'un à toute une liste.
//   { "email": "…", "pieces_jointes": [{ "nom": "ventes.pdf", "base64": "…" }] }
// La porte SQL envoyer_mail_ponctuel transmet les destinataires tels quels :
// rien à changer côté base.
// ⛔ Sans la clé, RIEN ne change : même corps posté à Resend, même réponse.
// ⛔ Une pièce jointe illisible (nom, type, base64, taille) REFUSE l'envoi de
//    ce mail — jamais un mail qui annonce une pièce jointe et part sans elle.
// ⛔ 'support' seulement : une campagne n'a pas de pièce jointe à porter.
// ⛔ La simulation valide les pièces jointes et rend leur nom et leur poids.
// ============================================================================

// Version épinglée : cf. le bandeau de _shared/desinscription.ts (le `@2`
// flottant a rendu tout déploiement impossible le 23/09).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { type CategorieEmail, envoyerEmail } from "../_shared/desinscription.ts";

const PLAFOND_24H = 2;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Comparaison à temps constant. Un `===` sur un secret fuit sa longueur et son
 * préfixe par le temps de réponse ; sur une fonction appelable depuis
 * l'extérieur, ça se mesure.
 */
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Le rôle porté par un JWT Supabase, sans vérifier la signature (la
 *  plateforme l'a déjà fait : verify_jwt = true). Rend "" si illisible. */
function roleDuJeton(jwt: string): string {
  try {
    const p = jwt.split(".")[1];
    if (!p) return "";
    const json = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
    return String(JSON.parse(json)?.role ?? "");
  } catch {
    return "";
  }
}

interface Destinataire {
  email: string;
  user_id?: string | null;
  /** Remplacements {{cle}} appliqués au sujet et au HTML, pour cette personne. */
  variables?: Record<string, string>;
  /** Pièces jointes de CETTE personne, telles que reçues (validées plus bas). */
  pieces_jointes?: unknown;
}

interface PieceJointe {
  nom: string;
  base64: string;
  type: string;
  octets: number;
}

const PJ_MAX_NOMBRE = 3;
const PJ_MAX_OCTETS = 5 * 1024 * 1024; // par destinataire, toutes pièces confondues
const PJ_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * Valide les pièces jointes d'un destinataire. Absentes → liste vide (le cas de
 * tous les appels historiques). Le moindre défaut → un motif, et le mail ne
 * part pas : on ne devine pas, on ne répare pas.
 */
function lirePiecesJointes(brut: unknown): { pieces: PieceJointe[] } | { motif: string } {
  if (brut == null) return { pieces: [] };
  if (!Array.isArray(brut)) return { motif: "pieces_jointes_pas_une_liste" };
  if (brut.length > PJ_MAX_NOMBRE) return { motif: "pieces_jointes_trop_nombreuses" };
  const pieces: PieceJointe[] = [];
  let total = 0;
  for (const p of brut) {
    if (!p || typeof p !== "object") return { motif: "piece_jointe_illisible" };
    const o = p as Record<string, unknown>;
    const nom = String(o.nom ?? "").trim();
    // Un nom de fichier, pas un chemin : lettres, chiffres, espace, . _ - ( ).
    if (!/^[\p{L}\p{N} ._()-]{1,120}$/u.test(nom) || nom.startsWith(".")) {
      return { motif: "piece_jointe_nom_invalide" };
    }
    const ext = (nom.split(".").pop() ?? "").toLowerCase();
    const type = PJ_TYPES[ext];
    if (!type || !nom.includes(".")) return { motif: "piece_jointe_type_refuse" };
    const base64 = String(o.base64 ?? "").replace(/\s+/g, "");
    if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return { motif: "piece_jointe_base64_invalide" };
    }
    let contenu: string;
    try {
      contenu = atob(base64);
    } catch {
      return { motif: "piece_jointe_base64_invalide" };
    }
    if (ext === "pdf" && !contenu.startsWith("%PDF-")) return { motif: "piece_jointe_pas_un_pdf" };
    total += contenu.length;
    if (total > PJ_MAX_OCTETS) return { motif: "pieces_jointes_trop_lourdes" };
    pieces.push({ nom, base64, type, octets: contenu.length });
  }
  return { pieces };
}

/**
 * Partie texte brut du mail, tirée du HTML final (2026-09-26).
 * Resend en génère une d'office, mais elle ignore les `alt` : le blast de
 * rentrée, rendu en images pour tenir en mode sombre sur Gmail iOS, serait
 * parti avec une partie texte presque vide — mauvais signal pour les filtres,
 * et rien à lire pour qui bloque les images. Ici : textes alternatifs des
 * images, liens écrits en clair, pré-en-tête caché retiré.
 */
function htmlVersTexte(html: string): string {
  const entites: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  let t = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, (_m, alt: string) => (alt ? `\n${alt}\n` : ""))
    .replace(/<a[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, dedans: string) => {
      const libelle = dedans.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!libelle) return ` ${href} `;
      if (libelle === href.replace(/^https?:\/\//, "").replace(/\/$/, "")) return libelle;
      return `${libelle} : ${href}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) =>
      e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : (entites[e.toLowerCase()] ?? m));
  t = t.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function appliquerVariables(texte: string, vars?: Record<string, string>): string {
  if (!vars) return texte;
  let out = texte;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ""));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  // ── LA GARDE : LA CLÉ DE SERVICE, ET RIEN D'AUTRE ─────────────────────────
  // `verify_jwt = true` fait déjà rejeter par la plateforme tout jeton qui
  // n'est pas signé par ce projet. Mais un JWT d'utilisateur ORDINAIRE est
  // signé par ce projet : sans la garde ci-dessous, n'importe quel compte
  // connecté pourrait poster des mails à n'importe quelle adresse. On exige
  // donc la clé de service elle-même (ou, si les clés changent de forme un
  // jour, un jeton dont le rôle EST service_role).
  const brut = req.headers.get("Authorization") ?? "";
  const jeton = brut.replace(/^Bearer\s+/i, "").trim();
  const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const autorise = !!jeton && !!cleService &&
    (memeSecret(jeton, cleService) || roleDuJeton(jeton) === "service_role");
  if (!autorise) {
    console.error("envoi_ponctuel_refus_auth");
    return json({ ok: false, reason: "service_key_required" }, 401);
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ ok: false, reason: "json_illisible" }, 400);
  }

  const sujet = String(corps.sujet ?? corps.subject ?? "").trim();
  const html = String(corps.html ?? "").trim();
  const type = String(corps.type ?? "").trim();
  const categorie = String(corps.categorie ?? "") as CategorieEmail;
  const dedup = String(corps.dedup ?? "journal") === "reservation" ? "reservation" : "journal";
  const simulation = corps.simulation === true;

  if (!sujet) return json({ ok: false, reason: "sujet_manquant" }, 400);
  if (!html) return json({ ok: false, reason: "html_manquant" }, 400);
  // ⛔ Pas de défaut sur `type` : une ligne email_logs sans type ne vaut rien,
  //    et c'est exactement le trou que la porte unique a bouché le 19/09.
  if (!type) return json({ ok: false, reason: "type_manquant" }, 400);
  // ⛔ Pas de défaut sur `categorie` non plus. La porte unique en a un
  //    ('marketing', volontairement filtrant) ; ici on EXIGE le mot, parce
  //    qu'un envoi ponctuel est écrit à la main et qu'il faut avoir tranché
  //    « est-ce une réponse à cette personne, ou une campagne ? ».
  if (categorie !== "marketing" && categorie !== "support") {
    return json({ ok: false, reason: "categorie_requise", attendu: ["marketing", "support"] }, 400);
  }

  // Un destinataire, ou une liste. Même chemin, même garde, même journal.
  const bruts = Array.isArray(corps.destinataires)
    ? corps.destinataires
    : (corps.to ? [corps.to] : []);
  const destinataires: Destinataire[] = [];
  for (const d of bruts) {
    if (typeof d === "string") destinataires.push({ email: d });
    else if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      destinataires.push({
        email: String(o.email ?? o.to ?? ""),
        user_id: (o.user_id ?? o.userId ?? null) as string | null,
        variables: (o.variables ?? null) as Record<string, string> | undefined,
        pieces_jointes: o.pieces_jointes ?? null,
      });
    }
  }
  const valides = destinataires.filter((d) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()));
  if (!valides.length) return json({ ok: false, reason: "aucun_destinataire" }, 400);
  if (valides.length > 500) return json({ ok: false, reason: "liste_trop_longue", max: 500 }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resultats: Array<Record<string, unknown>> = [];
  let envoyes = 0, plafonnes = 0, refuses = 0;

  for (const d of valides) {
    const email = d.email.trim().toLowerCase();

    // ── PIÈCES JOINTES — validées AVANT tout, simulation comprise ─────────
    const pj = lirePiecesJointes(d.pieces_jointes);
    if ("motif" in pj || (pj.pieces.length > 0 && categorie !== "support")) {
      refuses++;
      resultats.push({
        email, envoye: false,
        motif: "motif" in pj ? pj.motif : "pieces_jointes_support_seulement",
      });
      continue;
    }
    const pieces = pj.pieces;
    const resumePieces = pieces.length
      ? { pieces_jointes: pieces.map((p) => ({ nom: p.nom, type: p.type, octets: p.octets })) }
      : {};

    // ── PLAFOND 2 / 24 h — marketing SEULEMENT ────────────────────────────
    // Lecture par user_id quand on l'a (fiable), sinon par adresse. Une
    // lecture impossible ne bloque PAS : le plafond est une politesse, pas un
    // garde-fou de sécurité — et la désinscription, elle, est vérifiée par la
    // porte unique et n'est jamais contournable.
    if (categorie === "marketing") {
      try {
        const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        let q = admin.from("email_logs").select("id", { count: "exact", head: true }).gte("sent_at", depuis);
        q = d.user_id ? q.eq("user_id", d.user_id) : q.eq("email", email);
        const { count } = await q;
        if ((count ?? 0) >= PLAFOND_24H) {
          plafonnes++;
          resultats.push({ email, envoye: false, motif: "plafond_24h", deja: count });
          continue;
        }
      } catch (_e) { /* plafond illisible : on laisse passer, la porte garde le reste */ }
    }

    const sujetFinal = appliquerVariables(sujet, d.variables);
    const htmlFinal = appliquerVariables(html, d.variables);

    if (simulation) {
      resultats.push({ email, envoye: false, motif: "simulation", sujet: sujetFinal, ...resumePieces });
      continue;
    }

    const r = await envoyerEmail({
      to: email,
      subject: sujetFinal,
      html: htmlFinal,
      text: htmlVersTexte(htmlFinal),
      type,
      userId: d.user_id ?? null,
      categorie,
      dedup,
      ...(pieces.length
        ? { attachments: pieces.map((p) => ({ filename: p.nom, content: p.base64, content_type: p.type })) }
        : {}),
    });
    if (r.envoye) envoyes++; else refuses++;
    resultats.push({ email, envoye: r.envoye, motif: r.motif ?? null, journalise: r.journalise ?? null, ...resumePieces });
  }

  console.log("envoi_ponctuel", JSON.stringify({
    type, categorie, demandes: valides.length, envoyes, plafonnes, refuses, simulation,
  }));

  return json({
    ok: true,
    type,
    categorie,
    demandes: valides.length,
    envoyes,
    plafonnes,
    refuses,
    simulation,
    resultats,
  }, 200);
});
