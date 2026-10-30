# (30/10) FillSell Cloud — poste Windows : l'accès SSH de l'orchestrateur, à coller UNE fois par Nico dans une
# PowerShell « Exécuter en tant qu'administrateur » (Bureau à distance, mot de passe donné par Robot).
# Ne contient que la clé PUBLIQUE fillsell-cloud (la clé privée reste sur le PC de Nico) ; aucune plateforme visitée.
$ErrorActionPreference = 'Stop'
$cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
if ($cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service sshd -StartupType Automatic
Start-Service sshd
$fichier = "$env:ProgramData\ssh\administrators_authorized_keys"
Set-Content -Path $fichier -Value 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHqeLEuuIeNWLg3lvjZzY9cBVoogqzE1HqnRR6FkqnMJ fillsell-cloud' -Encoding ascii
icacls $fichier /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
if (-not (Get-NetFirewallRule -Name 'sshd-fillsell' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name 'sshd-fillsell' -DisplayName 'OpenSSH (FillSell)' -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow | Out-Null
}
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null
Write-Host 'Accès SSH FillSell : prêt.'
