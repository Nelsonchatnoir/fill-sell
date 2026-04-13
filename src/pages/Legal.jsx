import { useNavigate } from "react-router-dom";
import { useState } from "react";

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#0F172A", sub: "#475569", label: "#94A3B8", border: "rgba(0,0,0,0.06)" };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #F1F5F9; }
  .legal-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04);
    padding: 32px 36px;
    margin-bottom: 16px;
  }
  .legal-h2 {
    font-size: 15px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.3px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .legal-p {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.75;
    margin-bottom: 10px;
  }
  .legal-p:last-child { margin-bottom: 0; }
  .legal-ul {
    list-style: none;
    padding: 0;
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .legal-ul li {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.6;
    padding-left: 14px;
    position: relative;
  }
  .legal-ul li::before {
    content: "–";
    position: absolute;
    left: 0;
    color: #94A3B8;
  }
  .legal-strong { font-weight: 700; color: #0F172A; }
  a.legal-link { color: #3EACA0; text-decoration: none; font-weight: 600; }
  a.legal-link:hover { text-decoration: underline; }
  @media(max-width: 640px) {
    .legal-card { padding: 22px 18px; }
  }
`;

const Section = ({ icon, title, children }) => (
  <div className="legal-card">
    <div className="legal-h2">
      <span>{icon}</span>
      {title}
    </div>
    {children}
  </div>
);

const privacyTexts = {
  fr: {
    title: "🔐 Politique de confidentialité (App Store)",
    intro: "Fill & Sell collecte et traite les données utilisateur pour fournir ses fonctionnalités principales.",
    collectedTitle: "Données collectées :",
    collected: [
      "Adresse email (création de compte et authentification)",
      "Contenu utilisateur (inventaire, ventes, descriptions)",
      "Statut d'abonnement (accès premium)",
      "Données techniques (logs de sécurité)",
    ],
    usageTitle: "Ces données sont :",
    usage: [
      "Utilisées exclusivement pour faire fonctionner le service",
      "Jamais vendues à des tiers",
      "Jamais utilisées pour du tracking publicitaire",
    ],
    storage: "Les données sont stockées de manière sécurisée via Supabase (infrastructure EU) et protégées par des mesures de sécurité standard.",
    rights: "Les utilisateurs peuvent demander l'accès, la modification ou la suppression de leurs données en contactant :",
    noTrack: "Fill & Sell ne contient aucun SDK de tracking ou de publicité.",
    compliance: "This app complies with Apple App Store privacy requirements.",
  },
  en: {
    title: "🔐 Privacy Policy (App Store)",
    intro: "Fill & Sell collects and processes user data to provide its core features.",
    collectedTitle: "Data collected:",
    collected: [
      "Email address (account creation and authentication)",
      "User content (inventory, sales, descriptions)",
      "Subscription status (premium access)",
      "Technical data (security logs)",
    ],
    usageTitle: "This data is:",
    usage: [
      "Used exclusively to operate the service",
      "Never sold to third parties",
      "Never used for advertising tracking",
    ],
    storage: "Data is stored securely via Supabase (EU infrastructure) and protected by standard security measures.",
    rights: "Users may request access, modification, or deletion of their data by contacting:",
    noTrack: "Fill & Sell contains no tracking or advertising SDKs.",
    compliance: "This app complies with Apple App Store privacy requirements.",
  },
};

export default function Legal() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem('fs_lang') || 'fr');
  const p = privacyTexts[lang] || privacyTexts.fr;

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#3EACA0ee 0%,#E8956Ddd 100%)", boxShadow: "0 6px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 68, gap: 14 }}>
          <button onClick={() => nav(-1)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.32)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          >← Retour</button>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>Mentions légales & CGU</div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Intro */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Documents légaux</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: "-0.8px", marginBottom: 8 }}>Mentions légales & CGU</h1>
          <p style={{ fontSize: 13, color: C.label }}>Dernière mise à jour : avril 2026</p>
        </div>

        {/* 1. Éditeur */}
        <Section icon="🏢" title="1. Éditeur du site">
          <p className="legal-p">Le site <span className="legal-strong">Fill & Sell</span> (accessible à l'adresse <span className="legal-strong">fillsell.app</span>) est édité par :</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Statut :</span> Auto-entrepreneur</li>
            <li><span className="legal-strong">Nom commercial :</span> Fill & Sell</li>
            <li><span className="legal-strong">Responsable de publication :</span> Le gérant de Fill & Sell</li>
            <li><span className="legal-strong">Contact :</span> <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a></li>
          </ul>
        </Section>

        {/* 2. Hébergeur */}
        <Section icon="🌐" title="2. Hébergement">
          <p className="legal-p">Le site est hébergé par :</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Société :</span> Vercel Inc.</li>
            <li><span className="legal-strong">Adresse :</span> 340 Pine Street, Suite 701, San Francisco, CA 94104, États-Unis</li>
            <li><span className="legal-strong">Site web :</span> <a href="https://vercel.com" className="legal-link" target="_blank" rel="noreferrer">vercel.com</a></li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>Les données sont stockées via <span className="legal-strong">Supabase</span> (Supabase Inc., infrastructure AWS eu-west-1 — Europe).</p>
        </Section>

        {/* 3. CGU */}
        <Section icon="📋" title="3. Conditions générales d'utilisation (CGU)">
          <p className="legal-p"><span className="legal-strong">3.1 Objet</span><br />Fill & Sell est un outil SaaS de suivi d'achat-revente permettant aux utilisateurs de gérer leur inventaire, calculer leurs marges et analyser leurs profits. L'accès au service implique l'acceptation pleine et entière des présentes CGU.</p>

          <p className="legal-p"><span className="legal-strong">3.2 Inscription</span><br />L'inscription est gratuite. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants. Tout compte peut être résilié par l'utilisateur à tout moment.</p>

          <p className="legal-p"><span className="legal-strong">3.3 Plan gratuit</span><br />Le plan gratuit permet de gérer jusqu'à <span className="legal-strong">20 articles</span> en stock. L'accès au dashboard, au calcul des marges et à l'historique des ventes est inclus sans limite de durée.</p>

          {lang === 'en' ? (
            <p className="legal-p"><span className="legal-strong">3.4 Premium Subscription</span><br />
              The Premium plan is offered at <span className="legal-strong">4.99€ per month</span>, no commitment required. It gives access to unlimited items and advanced analytics.<br /><br />
              <span className="legal-strong">On web:</span> payment is securely processed by <span className="legal-strong">Stripe</span>.<br /><br />
              <span className="legal-strong">On iOS:</span> payment is managed via the Apple App Store (In-App Purchase). The subscription automatically renews unless cancelled at least 24 hours before the end of the current period. You can manage or cancel your subscription in your Apple account settings.
            </p>
          ) : (
            <p className="legal-p"><span className="legal-strong">3.4 Abonnement Premium</span><br />
              Le plan Premium est proposé au tarif de <span className="legal-strong">4,99 € TTC par mois</span>, sans engagement de durée. Il donne accès à des articles illimités et aux statistiques avancées.<br /><br />
              <span className="legal-strong">Sur le web :</span> le paiement est traité de manière sécurisée par <span className="legal-strong">Stripe</span>.<br /><br />
              <span className="legal-strong">Sur iOS :</span> le paiement est géré via l'App Store Apple (In-App Purchase). L'abonnement se renouvelle automatiquement sauf résiliation au moins 24h avant la fin de la période en cours. Vous pouvez gérer ou annuler votre abonnement dans les réglages de votre compte Apple.
            </p>
          )}

          <p className="legal-p"><span className="legal-strong">3.5 Résiliation</span><br />L'utilisateur peut résilier son abonnement à tout moment depuis son espace client. La résiliation prend effet à la fin de la période de facturation en cours. Aucun remboursement au prorata n'est effectué pour les jours restants.</p>

          <p className="legal-p"><span className="legal-strong">3.6 Remboursement</span><br />Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation de 14 jours ne s'applique pas aux services numériques dont l'exécution a commencé avec l'accord exprès de l'utilisateur. Toutefois, en cas d'erreur manifeste ou de défaut du service, une demande de remboursement peut être adressée à <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a> dans un délai de 7 jours suivant le débit.</p>

          <p className="legal-p"><span className="legal-strong">3.7 Disponibilité du service</span><br />Fill & Sell s'efforce d'assurer la disponibilité du service 24h/24 et 7j/7. Des interruptions temporaires peuvent survenir pour maintenance. Fill & Sell ne saurait être tenu responsable en cas d'indisponibilité temporaire.</p>

          <p className="legal-p"><span className="legal-strong">3.8 Propriété intellectuelle</span><br />L'ensemble des éléments du site (logo, design, code, contenus) sont la propriété exclusive de Fill & Sell. Toute reproduction, même partielle, sans autorisation écrite préalable est interdite.</p>
        </Section>

        {/* 4. RGPD */}
        <Section icon="🔒" title="4. Protection des données personnelles (RGPD)">
          <p className="legal-p"><span className="legal-strong">4.1 Responsable du traitement</span><br />Fill & Sell est responsable du traitement des données personnelles collectées via le service, conformément au Règlement Général sur la Protection des Données (RGPD — UE 2016/679).</p>

          <p className="legal-p"><span className="legal-strong">4.2 Données collectées</span></p>
          <ul className="legal-ul">
            <li>Adresse email (création de compte et authentification)</li>
            <li>Données de ventes et d'inventaire saisies par l'utilisateur</li>
            <li>Données de paiement (gérées exclusivement par Stripe — non stockées sur nos serveurs)</li>
            <li>Données de navigation (logs techniques, adresse IP)</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">4.3 Finalités du traitement</span></p>
          <ul className="legal-ul">
            <li>Fourniture et amélioration du service</li>
            <li>Gestion des abonnements et de la facturation</li>
            <li>Support utilisateur</li>
            <li>Sécurité et prévention des fraudes</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">4.4 Vos droits</span><br />Conformément au RGPD, vous disposez des droits suivants sur vos données :</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Droit d'accès :</span> obtenir une copie de vos données personnelles</li>
            <li><span className="legal-strong">Droit de rectification :</span> corriger des données inexactes</li>
            <li><span className="legal-strong">Droit à l'effacement :</span> supprimer vos données (« droit à l'oubli »)</li>
            <li><span className="legal-strong">Droit à la portabilité :</span> recevoir vos données dans un format structuré</li>
            <li><span className="legal-strong">Droit d'opposition :</span> vous opposer à certains traitements</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>Pour exercer ces droits, contactez-nous à : <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. Nous répondrons dans un délai maximum de 30 jours.</p>
          <p className="legal-p">Vous pouvez également introduire une réclamation auprès de la <span className="legal-strong">CNIL</span> (<a href="https://www.cnil.fr" className="legal-link" target="_blank" rel="noreferrer">cnil.fr</a>).</p>

          <p className="legal-p"><span className="legal-strong">4.5 Conservation des données</span><br />Les données sont conservées pendant toute la durée de l'abonnement, puis supprimées dans un délai de 90 jours suivant la clôture du compte, sauf obligation légale contraire.</p>

          <p className="legal-p"><span className="legal-strong">4.6 Sous-traitants</span><br />Fill & Sell fait appel aux sous-traitants suivants, tous conformes au RGPD :</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Supabase</span> — stockage des données (infrastructure EU)</li>
            <li><span className="legal-strong">Vercel</span> — hébergement de l'application</li>
            <li><span className="legal-strong">Stripe</span> — traitement des paiements (certifié PCI-DSS)</li>
          </ul>
        </Section>

        {/* 5. Cookies */}
        <Section icon="🍪" title="5. Politique de cookies">
          <p className="legal-p">Fill & Sell utilise un nombre minimal de cookies, strictement nécessaires au fonctionnement du service :</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Cookie de session :</span> maintien de la connexion utilisateur (Supabase Auth)</li>
            <li><span className="legal-strong">Préférences locales :</span> onglet actif, paramètres d'affichage (localStorage — non transmis à des tiers)</li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>Fill & Sell n'utilise <span className="legal-strong">aucun cookie publicitaire</span> ni tracker tiers à des fins de ciblage. Aucun consentement explicite n'est requis pour les cookies strictement nécessaires, conformément à la directive ePrivacy.</p>
        </Section>

        {/* 6. Droit applicable */}
        <Section icon="⚖️" title="6. Droit applicable et litiges">
          <p className="legal-p">Les présentes CGU et mentions légales sont régies par le <span className="legal-strong">droit français</span>. En cas de litige, une solution amiable sera recherchée en priorité. À défaut, les tribunaux compétents seront ceux du ressort du siège de Fill & Sell.</p>
          <p className="legal-p">Conformément à l'article L.612-1 du Code de la consommation, l'utilisateur peut recourir gratuitement à un médiateur de la consommation. Pour tout litige lié à un paiement en ligne, la plateforme de règlement en ligne des litiges de la Commission européenne est accessible à : <a href="https://ec.europa.eu/consumers/odr" className="legal-link" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.</p>
        </Section>

        {/* 7. App Store Privacy */}
        <Section icon="🔐" title={p.title}>
          <p className="legal-p">{p.intro}</p>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{p.collectedTitle}</span></p>
          <ul className="legal-ul">
            {p.collected.map((item, i) => <li key={i}>{item}</li>)}
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{p.usageTitle}</span></p>
          <ul className="legal-ul">
            {p.usage.map((item, i) => <li key={i}>{item}</li>)}
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>{p.storage}</p>
          <p className="legal-p">{p.rights} <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a></p>
          <p className="legal-p">{p.noTrack}</p>
          <p className="legal-p" style={{ fontStyle: "italic", color: "#94A3B8", fontSize: 12.5 }}>{p.compliance}</p>
        </Section>

        {/* Contact */}
        <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
          <p style={{ fontSize: 13, color: C.label }}>Des questions ? Contactez-nous à <a href="mailto:support@fillsell.app" style={{ color: C.teal, fontWeight: 600, textDecoration: "none" }}>support@fillsell.app</a></p>
        </div>

      </div>
    </div>
  );
}
