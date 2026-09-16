import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { UI, Loader, PrimaryButton, SecondaryButton } from "../components/ui";
import useSeo from "../lib/seo";

// ── ATTERRISSAGE D'UN LIEN DE CONFIRMATION D'INSCRIPTION (2026-09-16) ────────
//
// POURQUOI CETTE PAGE EXISTE, ET POURQUOI ELLE N'EST PAS /auth/callback.
// Mesuré le 16/09 sur l'iPhone de Nico, les deux branches :
//   · Safari SANS session → le lien déposait l'utilisateur sur la LANDING
//     MARKETING, déconnecté. Il devait retrouver le formulaire et retaper le
//     mot de passe qu'il venait de choisir (9 personnes sur 10 y arrivent,
//     la 10e est perdue).
//   · Safari AVEC une session d'un AUTRE compte → il se retrouvait connecté
//     SUR CET AUTRE COMPTE, sans un mot. Compte pro + compte perso, téléphone
//     de famille : on croit être sur son nouveau compte, on est sur celui du
//     voisin. C'est le défaut grave, et c'est lui qu'on ferme ici.
//
// MÉCANIQUE DU DÉFAUT. Le lien du mail porte un ?code= PKCE. supabase-js ne
// l'échange QUE si le même navigateur détient le code_verifier
// (auth-js, _isPKCECallback : `!!(params.code && currentStorageContent)`).
// Ouvert ailleurs — et depuis l'app native c'est SYSTÉMATIQUE, il n'y a pas
// d'Universal Link —, le code est ignoré EN SILENCE : pas d'échange, pas
// d'erreur, rien dans les logs. La session déjà en place, elle, reste.
// Sur « / », RedirectIfLoggedIn n'avait alors plus qu'une lecture possible :
// « il y a une session, direction /app ». D'où la connexion au mauvais compte.
//
// LA RÈGLE DE CETTE PAGE : un lien de confirmation n'ouvre JAMAIS une session
// qu'il n'a pas lui-même produite. Quand on ne peut pas prouver à qui le lien
// appartient, on ne devine pas — on montre l'adresse connectée et on laisse
// la personne trancher. Elle, elle sait quel compte elle vient de créer.
//
// ⚠️ /auth/callback (OAuth Google/Apple) n'est PAS touché : 190 comptes Google
// et 110 Apple entrent par là sans incident, et leur flux PKCE est légitime —
// c'est le même navigateur qui initie et qui revient. Deux atterrissages, deux
// règles, volontairement séparés.
export default function AuthConfirm() {
  const navigate = useNavigate();
  // 'travail' = on tranche encore ; les autres états sont des écrans.
  const [etat, setEtat] = useState("travail");
  const [emailSession, setEmailSession] = useState("");
  useSeo({ path: "/auth/confirm", title: "Confirmation — FillSell", robots: "noindex" });

  const fr = (localStorage.getItem("fs_lang") || ((navigator.language || "fr").startsWith("fr") ? "fr" : "en")) !== "en";

  useEffect(() => {
    let annule = false;
    const entrer = () => navigate("/app", { replace: true });

    (async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error")) { navigate("/login", { replace: true }); return; }

      // ── Voie 1 : token_hash (verifyOtp) ────────────────────────────────────
      // C'est la voie qui RÉSOUT le problème au lieu de le rattraper : aucun
      // code_verifier requis, donc le lien marche dans N'IMPORTE QUEL
      // navigateur, et la session rendue est celle du compte du jeton — jamais
      // celle qui traînait dans l'onglet. Inerte tant que le gabarit d'e-mail
      // Supabase envoie {{ .ConfirmationURL }} ; une ligne de tableau de bord
      // l'active ({{ .TokenHash }}), sans rien changer ici.
      const tokenHash = params.get("token_hash");
      if (tokenHash) {
        const type = params.get("type") || "signup";
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (annule) return;
        if (!error && data?.session) { entrer(); return; }
        setEtat("lien_mort");
        return;
      }

      // ── Voie 2 : ?code= PKCE (le lien d'aujourd'hui) ───────────────────────
      const code = params.get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (annule) return;
        // Échange réussi : on sait à qui appartient la session, elle vient
        // d'être produite par CE lien. Seul cas où l'on entre sans rien demander.
        if (!error && data?.session) { entrer(); return; }
      }

      // ── L'échange n'a pas eu lieu (ou pas de code du tout) ─────────────────
      // ⛔ Le réflexe « une session existe → /app » S'ARRÊTE ICI. On ne peut
      // pas savoir si cette session est celle du compte qu'on vient de
      // confirmer (échange déjà consommé par l'init de supabase-js) ou celle
      // d'un tout autre compte resté ouvert dans cet onglet. Les deux se
      // ressemblent à la milliseconde près côté client. On demande.
      const { data: { session } } = await supabase.auth.getSession();
      if (annule) return;
      if (session) { setEmailSession(session.user?.email || ""); setEtat("qui_es_tu"); return; }
      // Aucune session : le compte EST confirmé côté serveur (le 303 de
      // /verify l'a fait avant d'arriver ici), il ne manque que la connexion.
      // On le dit — au lieu de rendre la landing marketing.
      setEtat("confirme_sans_session");
    })();

    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Déconnexion LOCALE uniquement (doctrine 02/09) : un signOut nu est global
  // et tuerait aussi la session propre de l'extension Chrome de ce compte.
  const changerDeCompte = async () => {
    try { await supabase.auth.signOut({ scope: "local" }); } catch { /* déjà partie */ }
    navigate("/login", { replace: true });
  };

  const cadre = (children) => (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: UI.canvas, boxSizing: "border-box", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>{children}</div>
    </div>
  );

  if (etat === "travail") return cadre(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <Loader size={36} thickness={3} />
      <div style={{ fontSize: 15, fontWeight: 600, color: UI.ink }}>{fr ? "Confirmation en cours…" : "Confirming…"}</div>
    </div>
  );

  if (etat === "qui_es_tu") return cadre(
    <>
      <h1 style={{ margin: "0 0 12px", fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, lineHeight: 1.25 }}>
        {fr ? "Un compte est déjà ouvert ici" : "An account is already open here"}
      </h1>
      <p style={{ margin: "0 0 26px", fontSize: 14.5, lineHeight: 1.5, color: UI.mute2 }}>
        {fr
          ? <>Ce navigateur est connecté à <strong style={{ color: UI.ink }}>{emailSession || "un autre compte"}</strong>. Si tu viens de créer un compte avec une autre adresse, déconnecte-toi d'abord : sinon tu travaillerais dans le mauvais.</>
          : <>This browser is signed in as <strong style={{ color: UI.ink }}>{emailSession || "another account"}</strong>. If you just created an account with a different address, sign out first — otherwise you'd be working in the wrong one.</>}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <PrimaryButton onClick={() => navigate("/app", { replace: true })}>
          {fr ? "Continuer sur ce compte" : "Continue with this account"}
        </PrimaryButton>
        <SecondaryButton onClick={changerDeCompte}>
          {fr ? "Ce n'est pas mon compte" : "This isn't my account"}
        </SecondaryButton>
      </div>
    </>
  );

  if (etat === "confirme_sans_session") return cadre(
    <>
      <h1 style={{ margin: "0 0 12px", fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, lineHeight: 1.25 }}>
        {fr ? "Ton compte est confirmé" : "Your account is confirmed"}
      </h1>
      <p style={{ margin: "0 0 26px", fontSize: 14.5, lineHeight: 1.5, color: UI.mute2 }}>
        {fr
          ? "Il ne reste qu'à te connecter avec l'adresse et le mot de passe que tu viens de choisir."
          : "All that's left is to sign in with the address and password you just chose."}
      </p>
      <PrimaryButton onClick={() => navigate("/login", { replace: true })}>
        {fr ? "Me connecter" : "Sign in"}
      </PrimaryButton>
    </>
  );

  // lien_mort : jeton déjà utilisé ou périmé. Le compte peut très bien être
  // confirmé (un premier clic a pu passer) — on n'affirme donc rien là-dessus,
  // on renvoie vers la connexion, qui dira la vérité.
  return cadre(
    <>
      <h1 style={{ margin: "0 0 12px", fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: UI.ink, lineHeight: 1.25 }}>
        {fr ? "Ce lien a expiré" : "This link has expired"}
      </h1>
      <p style={{ margin: "0 0 26px", fontSize: 14.5, lineHeight: 1.5, color: UI.mute2 }}>
        {fr
          ? "Il a peut-être déjà servi. Essaie de te connecter : si ton compte est confirmé, ça passera."
          : "It may already have been used. Try signing in — if your account is confirmed, it will work."}
      </p>
      <PrimaryButton onClick={() => navigate("/login", { replace: true })}>
        {fr ? "Me connecter" : "Sign in"}
      </PrimaryButton>
    </>
  );
}
