# Uploads the Android release-signing key from ~/.vega to the repo's GitHub Actions secrets (run once, in PowerShell).
# Usage: powershell -File scripts/set-android-secrets.ps1
$ErrorActionPreference = 'Stop'
$repo = 'DhruvHarani1/vega'
$dir = Join-Path $HOME '.vega'
$props = @{}
Get-Content (Join-Path $dir 'keystore.properties') | ForEach-Object {
  $i = $_.IndexOf('=')
  if ($i -gt 0) { $props[$_.Substring(0, $i).Trim()] = $_.Substring($i + 1).Trim() }
}
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $dir 'vega-release.jks')))
gh secret set VEGA_KEYSTORE_B64 --repo $repo --body $b64
gh secret set VEGA_KEYSTORE_PASSWORD --repo $repo --body $props['storePassword']
gh secret set VEGA_KEY_PASSWORD --repo $repo --body $props['keyPassword']
gh secret set VEGA_KEY_ALIAS --repo $repo --body $props['keyAlias']
gh secret list --repo $repo
