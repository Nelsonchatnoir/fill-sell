#!/usr/bin/env bash
# Sonde « qui est bloqué ? » : code HTTP de /, /robots.txt et /sitemap.xml pour une liste
# large de jetons d'agents (robots IA, moteurs, aperçus de liens).
# Usage : bash docs/seo/mesures/outils/sonde-agents.sh [origine] > sortie.tsv
# ⚠️ Les requêtes partent de NOTRE IP : un 200 ici ne prouve pas que le vrai robot (depuis ses
# IP vérifiées) passe ; un 403 prouve en revanche un blocage sur la seule chaîne d'agent.
set -u
ORIGINE="${1:-https://fillsell.app}"
printf "agent\t/\t/robots.txt\t/sitemap.xml\tcorps_403\n"
for ua in "GPTBot/1.3" "OAI-SearchBot/1.3" "ChatGPT-User/1.0" "ChatGPT-User/2.0" \
  "ClaudeBot/1.0" "Claude-SearchBot/1.0" "Claude-User/1.0" "anthropic-ai" "Claude-Web/1.0" \
  "PerplexityBot/1.0" "Perplexity-User/1.0" "CCBot/2.0" "Bytespider" "Amazonbot/0.1" \
  "meta-externalagent/1.1" "Meta-ExternalFetcher/1.1" "FacebookBot" "facebookexternalhit/1.1" \
  "Google-Extended" "GoogleOther" "Google-CloudVertexBot" "cohere-ai" "Diffbot/0.1" \
  "MistralAI-User/1.0" "DuckAssistBot/1.2" "YouBot" "PetalBot" "Applebot/0.1" "Applebot-Extended/0.1" \
  "Timpibot" "ImagesiftBot" "omgili" "AI2Bot" "Twitterbot/1.0" "LinkedInBot/1.0" \
  "Slackbot-LinkExpanding 1.0" "Discordbot/2.0" "WhatsApp/2.23" "TelegramBot" \
  "Googlebot/2.1" "bingbot/2.0" "DuckDuckBot/1.1" "YandexBot/3.0" "Qwantbot" \
  "SemrushBot" "AhrefsBot" "Chrome-Lighthouse"; do
  a=$(curl -s -o /dev/null -A "$ua" -w '%{http_code}' "$ORIGINE/")
  b=$(curl -s -o /dev/null -A "$ua" -w '%{http_code}' "$ORIGINE/robots.txt")
  c=$(curl -s -o /dev/null -A "$ua" -w '%{http_code}' "$ORIGINE/sitemap.xml")
  corps=""; [ "$a" = 403 ] && corps=$(curl -s -A "$ua" "$ORIGINE/" | head -c 60 | tr '\n\t' '  ')
  printf "%s\t%s\t%s\t%s\t%s\n" "$ua" "$a" "$b" "$c" "$corps"
done
