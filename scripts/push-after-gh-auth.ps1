# Push cursor/chartdesk-desktop after one-time gh auth login.
# Usage (interactive desktop session):
#   1) C:\Users\mjs21\AppData\Local\GitHubCLI\bin\gh.exe auth login --web
#   2) powershell -ExecutionPolicy Bypass -File scripts\push-after-gh-auth.ps1

$ErrorActionPreference = "Stop"
$gh = "C:\Users\mjs21\AppData\Local\GitHubCLI\bin\gh.exe"
if (-not (Test-Path $gh)) {
  Write-Error "gh.exe not found at $gh — install GitHub CLI or re-download portable build."
}

& $gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Error "Not logged in. Run: & '$gh' auth login --hostname github.com --git-protocol https --web"
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:PATH = "$(Split-Path $gh);$env:PATH"
git -c "credential.helper=" -c "credential.helper=!$gh auth git-credential" push -u origin cursor/chartdesk-desktop

$existing = & $gh pr list --head cursor/chartdesk-desktop --json number,url,isDraft --jq ".[0].url" 2>$null
if ($existing) {
  Write-Output "PR already exists: $existing"
} else {
  & $gh pr create --draft --base main --head cursor/chartdesk-desktop `
    --title "feat(market): delayed Yahoo real quotes" `
    --body "Default MARKET_DATA_MODE=delayed via Yahoo Finance chart API (no key). Mock only for unmapped symbols / failures. Shared Yahoo poll for chart + watchlist."
}

git rev-parse --short HEAD
Write-Output "Push complete."
