# auto-pull.ps1 — pull automatique de main pour l'itération extension.
#
# Lance-le UNE fois, laisse-le tourner dans un coin. Dès qu'un commit arrive sur
# origin/main, il fait un FAST-FORWARD local (jamais de merge, jamais de force).
# Il te reste seulement à cliquer « recharger » sur la carte de l'extension dans
# chrome://extensions (surtout si tu as chargé le dossier SOURCE chrome-extension/).
#
# Lancement :
#   • double-clic sur  scripts\auto-pull.bat
#   • ou :  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\auto-pull.ps1
#   • intervalle perso :  ... auto-pull.ps1 -IntervalSeconds 15
# Arrêt : Ctrl+C.
#
# Sûr par construction :
#   • merge --ff-only : si tu as des commits locaux non poussés (divergence), le
#     pull auto se SUSPEND au lieu d'écraser quoi que ce soit — message clair.
#   • ne touche à rien si tu n'es pas sur la branche main.

param([int]$IntervalSeconds = 30)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $repo '.git'))) {
  Write-Host "[auto-pull] Pas un depot git : $repo" -ForegroundColor Red
  exit 1
}

Write-Host "[auto-pull] Surveillance de origin/main toutes les $IntervalSeconds s"
Write-Host "[auto-pull] Depot : $repo"
Write-Host "[auto-pull] Ctrl+C pour arreter. Au 'pull OK', clique 'recharger' dans chrome://extensions."

$lastNote = ''
while ($true) {
  try {
    $branch = (git -C $repo rev-parse --abbrev-ref HEAD 2>$null)
    if ($branch) { $branch = $branch.Trim() }

    if ($branch -ne 'main') {
      if ($lastNote -ne 'branch') {
        Write-Host "[auto-pull] $(Get-Date -Format HH:mm:ss) - branche '$branch' (pas main) : pull en pause tant que tu n'es pas sur main." -ForegroundColor Yellow
        $lastNote = 'branch'
      }
      Start-Sleep -Seconds $IntervalSeconds
      continue
    }

    git -C $repo fetch --quiet origin main 2>$null
    $local  = (git -C $repo rev-parse HEAD 2>$null)
    $remote = (git -C $repo rev-parse origin/main 2>$null)
    if ($local)  { $local  = $local.Trim() }
    if ($remote) { $remote = $remote.Trim() }

    if (-not $remote) {
      if ($lastNote -ne 'noremote') {
        Write-Host "[auto-pull] $(Get-Date -Format HH:mm:ss) - origin/main introuvable (reseau ?) - nouvel essai." -ForegroundColor Yellow
        $lastNote = 'noremote'
      }
    }
    elseif ($local -eq $remote) {
      $lastNote = ''   # a jour : silence
    }
    else {
      # local est-il un ancetre de origin/main ? => fast-forward possible.
      git -C $repo merge-base --is-ancestor HEAD origin/main 2>$null
      if ($LASTEXITCODE -eq 0) {
        $newLog = (git -C $repo log --oneline "$local..origin/main" 2>$null)
        git -C $repo merge --ff-only origin/main 2>$null | Out-Null
        if ($?) {
          Write-Host "[auto-pull] $(Get-Date -Format HH:mm:ss) - PULL OK, nouveau code :" -ForegroundColor Green
          $newLog | ForEach-Object { Write-Host "            $_" -ForegroundColor Green }
          Write-Host "            -> clique 'recharger' sur l'extension dans chrome://extensions." -ForegroundColor Cyan
        }
        $lastNote = ''
      }
      else {
        if ($lastNote -ne 'diverge') {
          Write-Host "[auto-pull] $(Get-Date -Format HH:mm:ss) - DIVERGENCE (commits locaux non pousses ?) : pull auto SUSPENDU pour ne rien ecraser. A regler a la main." -ForegroundColor Yellow
          $lastNote = 'diverge'
        }
      }
    }
  } catch {
    Write-Host "[auto-pull] erreur : $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Seconds $IntervalSeconds
}
