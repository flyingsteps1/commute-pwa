param(
  [ValidateSet("ping","upsert","debug","soft_delete","hard_delete","ensure_profile")]
  [string]$Action = "ping",

  [string]$StaffId = "",
  [string]$DisplayName = "",
  [string]$Password = "",
  [string]$WorkplaceId = $env:WORKPLACE_ID,

  [switch]$VerboseOutput
)

$ErrorActionPreference = "Stop"

# Load .env.local if needed (do not override existing env vars)
function Import-EnvLocal {
  param(
    [string]$Path,
    [string[]]$Keys
  )
  if (-not (Test-Path $Path)) { return @() }
  $loaded = @()
  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1)
    if ($Keys -contains $key) {
      $current = [Environment]::GetEnvironmentVariable($key)
      if ([string]::IsNullOrWhiteSpace($current)) {
        [Environment]::SetEnvironmentVariable($key, $value)
        $loaded += $key
      }
    }
  }
  return $loaded
}

# Try .env.local for missing values
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvLocalPath = Join-Path $RepoRoot ".env.local"
$NeededKeys = @("SUPABASE_URL", "SUPABASE_ANON_KEY", "WORKPLACE_ID")
$loadedKeys = Import-EnvLocal -Path $EnvLocalPath -Keys $NeededKeys
if ($loadedKeys.Count -gt 0) {
  Write-Host ("Loaded from .env.local: " + ($loadedKeys -join ", "))
}

# Env:
#   SUPABASE_URL
#   SUPABASE_ANON_KEY
#   ADMIN_EMAIL
#   ADMIN_PASSWORD
$SupabaseUrl    = $Env:SUPABASE_URL
$SupabaseAnonKey= $Env:SUPABASE_ANON_KEY
$AdminEmail     = $Env:ADMIN_EMAIL
$AdminPassword  = $Env:ADMIN_PASSWORD

if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($SupabaseAnonKey)) {
  throw "SUPABASE_URL and SUPABASE_ANON_KEY must be set in the environment."
}
if ([string]::IsNullOrWhiteSpace($AdminEmail) -or [string]::IsNullOrWhiteSpace($AdminPassword)) {
  throw "ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment."
}
if ([string]::IsNullOrWhiteSpace($WorkplaceId) -and $Action -ne "ping") {
  throw "WorkplaceId is required for actions other than ping."
}

$tokenCache = @{
  access_token = $null
  expires_at   = 0
}

function Get-AccessToken {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  if ($tokenCache.access_token -and $tokenCache.expires_at -gt ($now + 60)) {
    return $tokenCache.access_token
  }

  $authEndpoint = "$SupabaseUrl/auth/v1/token?grant_type=password"
  $payload = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json

  $resp = Invoke-RestMethod -Method Post -Uri $authEndpoint -Headers @{
    "apikey"       = $SupabaseAnonKey
    "Content-Type" = "application/json"
  } -Body $payload

  $tokenCache.access_token = $resp.access_token
  # expires_in is seconds
  $tokenCache.expires_at   = $now + [int64]$resp.expires_in
  return $tokenCache.access_token
}

function Invoke-AdminCreateStaff {
  param(
    [string]$Action,
    [string]$StaffId,
    [string]$DisplayName,
    [string]$Password,
    [string]$WorkplaceId
  )

  # Build body properly
  $body = @{}
  $body["action"] = $Action
  if ($StaffId)     { $body["staffId"]     = $StaffId }
  if ($DisplayName) { $body["displayName"] = $DisplayName }
  if ($Password)    { $body["password"]    = $Password }
  if ($WorkplaceId) { $body["workplaceId"] = $WorkplaceId }

  $bodyJson = $body | ConvertTo-Json -Depth 10
  $fnUrl = "$SupabaseUrl/functions/v1/admin-create-staff"

  $headers = @{
    "apikey"       = $SupabaseAnonKey
    "Content-Type" = "application/json"
  }

  $attempt = 0
  $maxAttempts = 2
  while ($attempt -lt $maxAttempts) {
    $attempt++
    $accessToken = Get-AccessToken
    $headers["Authorization"] = "Bearer $accessToken"

    try {
      if ($VerboseOutput) { Write-Host "[callfn] POST $fnUrl (attempt=$attempt)" }
      $res = Invoke-RestMethod -Method Post -Uri $fnUrl -Headers $headers -Body $bodyJson
      $statusCode = 200
      return @{ status = $statusCode; body = $res }
    } catch {
      $statusCode = 0
      $respBody = $null
      if ($_.Exception.Response) {
        $resp = $_.Exception.Response
        try {
          $statusCode = [int]$resp.StatusCode
        } catch {
          $statusCode = 0
        }
        try {
          $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
          $respBody = $reader.ReadToEnd()
        } catch {
          $respBody = $null
        }
      }

      if ($statusCode -eq 401 -and $attempt -lt $maxAttempts) {
        if ($VerboseOutput) { Write-Host "[callfn] 401 received, refreshing token..." }
        $tokenCache.access_token = $null
        $tokenCache.expires_at = 0
        continue
      }

      if (($statusCode -eq 429 -or $statusCode -ge 500) -and $attempt -lt $maxAttempts) {
        $sleepSeconds = [int][Math]::Pow(2, ($attempt - 1))
        if ($VerboseOutput) { Write-Host "[callfn] retrying after $sleepSeconds sec (status=$statusCode)" }
        Start-Sleep -Seconds $sleepSeconds
        continue
      }

      if ($statusCode -ne 0) {
        return @{ status = $statusCode; body = $respBody }
      }
      throw
    }
  }
}

$result = Invoke-AdminCreateStaff -Action $Action -StaffId $StaffId -DisplayName $DisplayName -Password $Password -WorkplaceId $WorkplaceId
$result | ConvertTo-Json -Depth 10
