# OpenAgentsPocket installer for Windows PowerShell:  irm <base>/install.ps1 | iex
#
# Native Windows has no Pairing Code (the plugin is macOS and Linux only), so this checks what
# the app needs to connect, prints the next step for anything missing, and says how to add the
# Host by hand. It never installs system software. Pass -DryRun to only print.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

# Kept in sync with docs/guides/windows-setup.md.
$MinHerdrVersion = [version]'0.9.3'
$HerdrDocsUrl = 'https://herdr.dev/docs/install/'

function Step($text) { Write-Host "`n==> $text" }
function Stop-Install($text, $next) { Write-Host "`nStopped: $text"; Write-Host "  $next"; exit 1 }

if ($DryRun) { Write-Host 'Dry run: read-only checks run, nothing is changed.' }

Step "Checking herdr (version $MinHerdrVersion or newer)"
$herdr = Get-Command herdr -ErrorAction SilentlyContinue
if (-not $herdr) { Stop-Install 'herdr is not installed (or not on PATH).' "Install it: $HerdrDocsUrl, then run this installer again." }
$found = [regex]::Match((& herdr --version 2>&1 | Out-String), '\d+\.\d+\.\d+').Value
if (-not $found -or [version]$found -lt $MinHerdrVersion) {
  Stop-Install "herdr $found is older than $MinHerdrVersion." 'Update it: herdr update'
}
Write-Host "herdr $found"

Step 'Checking OpenSSH Server (the app connects over SSH)'
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $sshd) { Stop-Install 'OpenSSH Server is not installed.' 'Settings > System > Optional features > add OpenSSH Server, then run this installer again.' }
if ($sshd.Status -ne 'Running') {
  Stop-Install 'The sshd service is not running.' 'In an administrator PowerShell: Start-Service sshd; Set-Service sshd -StartupType Automatic'
}
Write-Host 'sshd is running'

Step 'Next'
Write-Host 'Windows Hosts are added by hand: in the app tap Add Host > Add Manually and enter this'
Write-Host 'machine''s address, port and Windows account. Guide: docs/guides/windows-setup.md'
