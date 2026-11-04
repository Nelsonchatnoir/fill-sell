#!/bin/sh
# (30/10, lot D) L'EXTENSION CLOUD SIGNÉE pour l'installation par stratégie d'entreprise : appelé par deployer.sh
#   docker run --rm --entrypoint /empaqueter-extension.sh -e VERSION_CRX=<n> \
#     -v <extension>:/ext-src:ro -v <clé pem>:/cle.pem:ro -v <sortie>:/out fillsell-chrome:<sha>
# Chrome emballe le dossier (CRX3) avec la clé de la copie Cloud (identifiant dnankhhfellobiobloopcjgkdioblpjd) ; la
# version reçoit un 4e nombre (VERSION_CRX) pour que Chrome prenne chaque déploiement comme une mise à jour.
# (04/11 soir, mesuré sur cloud-2) …à condition que le MANIFESTE porte update_url : l'adresse de la stratégie ne sert qu'à
# la première installation ; sans update_url, Chrome cherche les mises à jour sur le Chrome Web Store (« no_update ») et
# garde l'ancienne copie pour toujours.
set -e
rm -rf /tmp/ext /tmp/ext.crx && cp -r /ext-src /tmp/ext
VERSION=$(node -e '
  const f = "/tmp/ext/manifest.json"; const fs = require("fs"); const m = JSON.parse(fs.readFileSync(f, "utf8"));
  m.version = m.version.split(".").slice(0, 3).join(".") + "." + process.env.VERSION_CRX;
  delete m.key; m.update_url = "http://127.0.0.1:3129/update.xml";
  fs.writeFileSync(f, JSON.stringify(m, null, 2)); process.stdout.write(m.version);')
google-chrome --no-sandbox --headless=new --pack-extension=/tmp/ext --pack-extension-key=/cle.pem >/dev/null 2>&1 || true
[ -s /tmp/ext.crx ] || { echo "empaquetage refusé par Chrome" >&2; exit 1; }
cp /tmp/ext.crx /out/fillsell-cloud.crx
cat > /out/update.xml <<XML
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='dnankhhfellobiobloopcjgkdioblpjd'>
    <updatecheck codebase='http://127.0.0.1:3129/fillsell-cloud.crx' version='$VERSION' />
  </app>
</gupdate>
XML
chmod 644 /out/fillsell-cloud.crx /out/update.xml
echo "extension signée : $VERSION"
