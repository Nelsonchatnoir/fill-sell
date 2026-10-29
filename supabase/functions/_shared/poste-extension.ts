// ═══════════════════════════════════════════════════════════════════════════
// LE POSTE — UN COMPTE, PLUSIEURS CHROME (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Louis (Business), 13 kits Opla bloqués une nuit entière.
// Les logs edge montrent UNE adresse IP, UN Chrome, mais DEUX sessions
// Supabase qui pollent en parallèle (deux profils Chrome, extension installée
// dans chacun, connectés au même compte). Le profil A a l'autorisation Opla,
// le profil B ne l'a pas. B prend un job Opla, le parque « Opla attend ton
// autorisation » ; A le relance au réveil de son service worker ; B le
// reprend… 131 parcages en une nuit, et Louis lit « Autorise Opla » alors
// qu'il l'a fait.
//
// Le serveur ne voyait qu'UN compte. Il doit voir des POSTES. L'identité d'un
// poste, c'est la SESSION du JWT (claim `session_id`) : stable tant que
// l'extension reste connectée, différente d'un profil Chrome à l'autre.
// `profiles.extension_postes` porte, par session : l'accès Opla (true /
// false / inconnu), la dernière fois qu'on l'a vu poller, son build.
//
// ⛔ Un poste SANS accès Opla ne reçoit plus AUCUN job Opla (get-pending-jobs).
// ⛔ Un parcage « Autoriser Opla » posé par un poste SANS accès, alors qu'un
//    AUTRE poste du compte a l'accès, est RELÂCHÉ en pending pour l'autre
//    (update-job-status) — jamais un « à toi » pour un geste déjà fait.
// ⛔ Les entrées vivent 48 h : un profil supprimé disparaît tout seul.

export type Poste = {
  opla_acces?: boolean | null;   // true = permission d'hôte opla.co présente ; false = absente ; absent = inconnu
  le?: string;                    // dernière fois vu (poll ou statut de job)
  build?: string;
  rearme_le?: string;             // dernière relance des jobs parqués faite pour ce poste
  opla_acces_le?: string;         // (24/09) quand opla_acces a été appris/prouvé — borne les preuves plus anciennes
  opla_acces_preuve?: string;     // (24/09) la preuve lue en base qui a rendu l'accès (cf. _shared/preuve-opla.ts)
  preuve_opla_cherchee_le?: string; // (24/09) dernière recherche de preuve pour ce poste (au plus 1 / 10 min)
  navigateur?: string | null;     // (09/10, Marta) navigateur du poste, lu sur le User-Agent (_shared/navigateur-poste.js)
  pays?: string | null;           // (09/10) pays du réseau du poste (cf-ipcountry)
  // (11/10) Depop, comme Opla : la permission d'hôte www.depop.com de CE poste,
  // déclarée à chaque poll (« depop_acces » / « sans_depop », extension ≥ 0.6.105).
  depop_acces?: boolean | null;
  depop_acces_le?: string;
  rearme_depop_le?: string;       // dernière relance des jobs « Autoriser Depop » faite pour ce poste
  // (18/10, lot 6 — Louis : Vinted Pro sur le PC, Vinted perso sur une VM) La
  // boutique Vinted ouverte SUR CE POSTE : apprise d'une preuve venue de lui
  // (users/current relu après un dépôt, garde de boutique d'une opération) ou
  // dite par lui au poll (« vinted_identite », extension ≥ 0.6.126).
  vinted_user_id?: string;
  vinted_le?: string;
  vinted_source?: string;         // « depot » · « garde » · « poll »
  // (18/10) Ce que la sonde de CE poste voit connecté (« sessions_poste », ≥ 0.6.126).
  sessions?: Record<string, boolean | null | string>;
  // (29/10, point 5 — Johan) LA PRÉSENCE PENDANT UN LONG TRAVAIL : battement_extension (RPC, toutes les 5 min tant
  // qu'un flux tient le verrou de l'extension) pose `le`, `battement_le` et `travail` (le flux, le job en cours, son
  // heure). `vivant_depuis` : posé par le poll quand le poste revient après plus de 10 min de silence — l'alerte
  // « hors ligne sans recréation » laisse 30 min au poste revenu (_shared/alerte-orpheline.js).
  battement_le?: string;
  travail?: { flux?: string; job?: string; plateforme?: string; depuis?: string; le?: string } | null;
  vivant_depuis?: string;
};

export const POSTE_TTL_MS = 48 * 3600_000;
/** « Vu récemment » : un poste qui polle est vu toutes les ~1-2 min. */
export const POSTE_FRAIS_MS = 30 * 60_000;
export const POSTES_MAX = 12;

/** Le claim `session_id` du JWT porté par la requête (sans vérification : la
 *  plateforme ou auth.getUser() l'a déjà faite en amont). null si illisible. */
export function sessionIdDuJwt(authHeader: string | null | undefined): string | null {
  try {
    const token = String(authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(atob(b64));
    const sid = String(payload?.session_id ?? "").trim();
    return sid || null;
  } catch {
    return null;
  }
}

/** Les postes encore vivants (≤ 48 h), les plus récents d'abord, 12 au plus. */
export function postesVivants(brut: unknown, maintenant = Date.now()): Record<string, Poste> {
  const out: Record<string, Poste> = {};
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return out;
  const entrees = Object.entries(brut as Record<string, unknown>)
    .map(([sid, p]) => [sid, (p && typeof p === "object" ? p : {}) as Poste] as const)
    .filter(([, p]) => {
      const le = Date.parse(String(p.le ?? ""));
      return Number.isFinite(le) && maintenant - le <= POSTE_TTL_MS;
    })
    .sort((a, b) => Date.parse(String(b[1].le)) - Date.parse(String(a[1].le)))
    .slice(0, POSTES_MAX);
  for (const [sid, p] of entrees) out[sid] = { ...p };
  return out;
}

type Options = { saufSession?: string | null; depuisMs?: number; maintenant?: number };

function chercher(postes: Record<string, Poste>, acces: boolean, o: Options, cle: "opla_acces" | "depop_acces" = "opla_acces"): { session: string; le: string } | null {
  const maintenant = o.maintenant ?? Date.now();
  const depuis = o.depuisMs ?? POSTE_FRAIS_MS;
  let meilleur: { session: string; le: string } | null = null;
  for (const [sid, p] of Object.entries(postes)) {
    if (o.saufSession && sid === o.saufSession) continue;
    if (p[cle] !== acces) continue;
    const le = Date.parse(String(p.le ?? ""));
    if (!Number.isFinite(le) || maintenant - le > depuis) continue;
    if (!meilleur || le > Date.parse(meilleur.le)) meilleur = { session: sid, le: String(p.le) };
  }
  return meilleur;
}

/** Un poste (autre que `saufSession`) dont l'accès Opla est PROUVÉ et vu depuis `depuisMs`. */
export function posteAvecAccesOpla(postes: Record<string, Poste>, o: Options = {}) {
  return chercher(postes, true, o);
}

/** Un poste dont l'ABSENCE d'accès Opla est connue et vu depuis `depuisMs`. */
export function posteSansAccesOpla(postes: Record<string, Poste>, o: Options = {}) {
  return chercher(postes, false, o);
}

/** (11/10) Un poste (autre que `saufSession`) dont l'accès DEPOP est prouvé et vu depuis `depuisMs`. */
export function posteAvecAccesDepop(postes: Record<string, Poste>, o: Options = {}) {
  return chercher(postes, true, o, "depop_acces");
}

/** (11/10) Un poste dont l'ABSENCE d'accès Depop est connue (« sans_depop ») et vu depuis `depuisMs`. */
export function posteSansAccesDepop(postes: Record<string, Poste>, o: Options = {}) {
  return chercher(postes, false, o, "depop_acces");
}

// ═══════════════════════════════════════════════════════════════════════════
// (18/10, lot 6) DEUX POSTES, DEUX BOUTIQUES VINTED, UN COMPTE FILLSELL
// ═══════════════════════════════════════════════════════════════════════════
// Louis veut son Vinted Pro sur son PC et son Vinted perso sur une VM. Le
// serveur ne connaissait la boutique ouverte que PAR COMPTE (extension_sessions,
// réécrite par la sonde de chaque poste) : un job d'@evat servi à la VM y
// attendait en boucle, et un article sans boutique partait sur la boutique
// sondée en dernier. RÈGLE : chaque poste a SA boutique connue ; avec au moins
// deux postes vivants ET deux boutiques confirmées, un job Vinted dont la
// boutique est connue n'est pas servi au poste qui en a une AUTRE quand un
// autre poste vivant est connu sur la bonne. Un poste inconnu, un compte à un
// seul poste vivant ou à une seule boutique : rien ne change (gardes d'avant).
// La réservation par poste (reserver_jobs_extension) reste la règle du
// « jamais deux fois ».

/** « Vivant » pour le routage : vu au poll il y a moins de 15 min. */
export const POSTE_VIVANT_ROUTAGE_MS = 15 * 60_000;
/** Une identité Vinted de poste vaut 30 min (une boutique peut changer dans le même navigateur). */
export const IDENTITE_POSTE_FRAICHE_MS = 30 * 60_000;
/** (18/10, point 3) Le mur d'un poste tient tant qu'un autre poste vivant a réussi sur la plateforme depuis 7 jours. */
export const MUR_AUTRE_POSTE_OK_MS = 7 * 24 * 3600_000;

const ms = (v: unknown) => Date.parse(String(v ?? ""));

/** Le numéro de la boutique Vinted ouverte sur ce poste, s'il est connu et frais ; sinon null. */
export function identiteVintedDuPoste(p: Poste | undefined | null, maintenant = Date.now(), fraisMs = IDENTITE_POSTE_FRAICHE_MS): string | null {
  if (!p) return null;
  const id = String(p.vinted_user_id ?? "").trim();
  const le = ms(p.vinted_le);
  if (!/^\d{2,15}$/.test(id) || !Number.isFinite(le) || le > maintenant + 60_000 || maintenant - le > fraisMs) return null;
  return id;
}

/** Les postes vus il y a moins de 15 min. */
export function postesVivantsRoutage(postes: Record<string, Poste>, maintenant = Date.now()): Array<[string, Poste]> {
  return Object.entries(postes ?? {}).filter(([, p]) => {
    const le = ms(p?.le);
    return Number.isFinite(le) && maintenant - le < POSTE_VIVANT_ROUTAGE_MS;
  });
}

/** Le routage par boutique s'applique-t-il ? Deux postes vivants et deux boutiques confirmées, sinon jamais. */
export function routageBoutiquesActif(postes: Record<string, Poste>, nbBoutiquesConfirmees: number, maintenant = Date.now()): boolean {
  return Number(nbBoutiquesConfirmees) >= 2 && postesVivantsRoutage(postes, maintenant).length >= 2;
}

/**
 * Ce poste doit-il LAISSER ce job Vinted à un autre poste ? Oui seulement si :
 * la boutique du job est connue, celle de CE poste est connue (fraîche) et
 * différente, et un AUTRE poste vivant est connu (frais) sur la bonne. Rend
 * { laisser, autre } (autre = session du poste qui la porte).
 */
export function posteLaisseJobVinted(o: {
  postes: Record<string, Poste>; session: string | null | undefined; identiteMoi: string | null | undefined;
  boutiqueJob: unknown; maintenant?: number;
}): { laisser: boolean; autre: string | null } {
  const maintenant = o.maintenant ?? Date.now();
  const boutique = String(o.boutiqueJob ?? "").trim();
  const moi = String(o.identiteMoi ?? "").trim();
  if (!o.session || !boutique || !moi || moi === boutique) return { laisser: false, autre: null };
  for (const [sid, p] of postesVivantsRoutage(o.postes, maintenant)) {
    if (sid === o.session) continue;
    if (identiteVintedDuPoste(p, maintenant) === boutique) return { laisser: true, autre: sid };
  }
  return { laisser: false, autre: null };
}

/**
 * (18/10) La boutique « auto » d'une publication sans boutique, posée par un
 * AUTRE poste encore vivant et toujours sur elle : on ne la recalcule pas
 * (sinon elle basculerait d'une boutique à l'autre à chaque poll des deux
 * machines). `auto` = platform_fields.vinted_boutique_auto.
 */
export function boutiqueAutoTenueParAutrePoste(o: {
  postes: Record<string, Poste>; session: string | null | undefined; auto: unknown; boutiqueJob: unknown; maintenant?: number;
}): boolean {
  const maintenant = o.maintenant ?? Date.now();
  const auto = (o.auto && typeof o.auto === "object") ? o.auto as Record<string, unknown> : null;
  const boutique = String(o.boutiqueJob ?? "").trim();
  if (!auto || auto.source !== "session" || !boutique) return false;
  const poste = String(auto.poste ?? "");
  if (!poste || poste === posteCourt(o.session)) return false;
  return postesVivantsRoutage(o.postes, maintenant)
    .some(([sid, p]) => sid !== o.session && posteCourt(sid) === poste && identiteVintedDuPoste(p, maintenant) === boutique);
}

/**
 * (27/09 + 18/10, point 3) Le MUR d'un poste sur une plateforme tient-il ?
 * Posé par update-job-status (page de connexion vue), levé par une
 * publication réussie de CE poste (ok_<pf> plus récent), ou par sa propre
 * sonde qui voit la plateforme connectée après le mur (sessions, ≥ 0.6.126).
 * Il tient 2 h ; au-delà, il TIENT ENCORE tant qu'un autre poste vivant a
 * réussi sur cette plateforme depuis 7 jours (la VM sans Leboncoin ne re-bute
 * plus toutes les 2 h) — sinon il tombe, comme avant.
 */
export function murDuPosteTient(o: {
  moi: Poste | Record<string, unknown> | undefined | null; pf: string; postes: Record<string, Poste>;
  session: string | null | undefined; maintenant?: number;
}): boolean {
  const maintenant = o.maintenant ?? Date.now();
  const p = (o.moi ?? null) as Record<string, unknown> | null;
  if (!p) return false;
  const mur = ms(p[`mur_${o.pf}`]);
  if (!Number.isFinite(mur)) return false;
  const ok = ms(p[`ok_${o.pf}`]);
  if (Number.isFinite(ok) && ok > mur) return false;
  const s = (p.sessions && typeof p.sessions === "object") ? p.sessions as Record<string, unknown> : null;
  if (s && s[o.pf] === true && ms(s.lu_le) > mur) return false;
  if (maintenant - mur <= 2 * 3600_000) return true;
  return postesVivantsRoutage(o.postes, maintenant).some(([sid, q]) => {
    if (sid === o.session) return false;
    const okAutre = ms((q as Record<string, unknown>)[`ok_${o.pf}`]);
    return Number.isFinite(okAutre) && maintenant - okAutre <= MUR_AUTRE_POSTE_OK_MS;
  });
}

/**
 * (18/10) La boutique Vinted connectée lue par les GARDES de l'extension dans
 * SON onglet (platform_fields.gardes) : garde_boutique.boutique_connectee
 * (retrait, republication) ou garde_boutique_depot.boutique_lue (publication),
 * de moins de 15 min. La plus récente ; null si rien de lisible.
 */
export function identiteVintedDesGardes(gardes: unknown, maintenant = Date.now()): { user_id: string; le: string } | null {
  const g = (gardes && typeof gardes === "object" && !Array.isArray(gardes)) ? gardes as Record<string, unknown> : null;
  if (!g) return null;
  const candidats: Array<{ user_id: string; t: number }> = [];
  const lire = (cle: string, champ: string) => {
    const x = (g[cle] && typeof g[cle] === "object") ? g[cle] as Record<string, unknown> : null;
    if (!x) return;
    const id = String(x[champ] ?? "").trim();
    const t = ms(x.at);
    if (/^\d{2,15}$/.test(id) && Number.isFinite(t) && t <= maintenant + 60_000 && maintenant - t <= 15 * 60_000) candidats.push({ user_id: id, t });
  };
  lire("garde_boutique", "boutique_connectee");
  lire("garde_boutique_depot", "boutique_lue");
  if (!candidats.length) return null;
  candidats.sort((a, b) => b.t - a.t);
  return { user_id: candidats[0].user_id, le: new Date(candidats[0].t).toISOString() };
}

/** (18/10) La sonde de CE poste (≥ 0.6.126) dit la plateforme DÉCONNECTÉE, il y a moins de 15 min. */
export function posteSeDitDeconnecte(moi: Poste | Record<string, unknown> | undefined | null, pf: string, maintenant = Date.now()): boolean {
  const s = (moi && typeof moi === "object" && (moi as Record<string, unknown>).sessions && typeof (moi as Record<string, unknown>).sessions === "object")
    ? (moi as Record<string, unknown>).sessions as Record<string, unknown> : null;
  if (!s || s[pf] !== false) return false;
  const t = ms(s.lu_le);
  return Number.isFinite(t) && maintenant - t < POSTE_VIVANT_ROUTAGE_MS;
}

/**
 * (18/10) Ce qu'un poste ≥ 0.6.126 dit de lui au poll, relu et borné.
 *   body.vinted_identite = { user_id: "<numéro Vinted>", lu_le: "<ISO>" } — la boutique
 *     ouverte lue par la sonde de CE poste (≤ 15 min) ;
 *   body.sessions_poste  = { vinted, leboncoin, beebs, depop, ebay: true | false | null, lu_le: "<ISO>" }.
 * Rend le morceau de patch du poste (vide si rien de lisible).
 */
export function patchPosteDuPoll(body: unknown, maintenant = Date.now()): Partial<Poste> {
  const out: Partial<Poste> = {};
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const frais = (v: unknown) => { const t = ms(v); return Number.isFinite(t) && t <= maintenant + 60_000 && maintenant - t <= 15 * 60_000 ? t : NaN; };
  const vi = (b.vinted_identite && typeof b.vinted_identite === "object") ? b.vinted_identite as Record<string, unknown> : null;
  if (vi) {
    const id = String(vi.user_id ?? "").trim();
    const t = frais(vi.lu_le);
    if (/^\d{2,15}$/.test(id) && Number.isFinite(t)) {
      out.vinted_user_id = id; out.vinted_le = new Date(t).toISOString(); out.vinted_source = "poll";
    }
  }
  const sp = (b.sessions_poste && typeof b.sessions_poste === "object") ? b.sessions_poste as Record<string, unknown> : null;
  if (sp) {
    const t = frais(sp.lu_le);
    if (Number.isFinite(t)) {
      const sessions: Record<string, boolean | null | string> = { lu_le: new Date(t).toISOString() };
      for (const pf of ["vinted", "leboncoin", "beebs", "depop", "ebay"]) {
        const v = sp[pf];
        sessions[pf] = v === true ? true : v === false ? false : null;
      }
      out.sessions = sessions;
    }
  }
  return out;
}

/** Pour les journaux : les 8 premiers caractères, jamais la session entière. */
export function posteCourt(sid: string | null | undefined): string {
  return String(sid ?? "").slice(0, 8) || "?";
}

/** Ancien parc : session existante. Nouveau : distingue aussi deux extensions
 * partageant le même JWT, sans imposer ce nouveau champ aux clients installés. */
export function identifiantPosteExtension(authHeader: string, instance: unknown): string | null {
  const session = sessionIdDuJwt(authHeader);
  if (!session) return null;
  return typeof instance === "string" && /^[a-f0-9-]{36}$/i.test(instance)
    ? `${session}/${instance}` : session;
}
