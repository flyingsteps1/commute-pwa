$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Label,
    [string]$Action,
    [string]$StaffId = "",
    [string]$DisplayName = "",
    [string]$Password = "",
    [string]$WorkplaceId = ""
  )

  $callfn = Join-Path $PSScriptRoot "callfn.ps1"
  $args = @(
    "-Action", $Action
  )
  if ($StaffId) { $args += @("-StaffId", $StaffId) }
  if ($DisplayName) { $args += @("-DisplayName", $DisplayName) }
  if ($Password) { $args += @("-Password", $Password) }
  if ($WorkplaceId) { $args += @("-WorkplaceId", $WorkplaceId) }

  try {
    $result = & $callfn @args
    $status = [int]$result.status
    $ok = $status -ge 200 -and $status -lt 300
    if ($ok) {
      Write-Host "[PASS] $Label"
    } else {
      Write-Host "[FAIL] $Label"
    }
    Write-Host ("status={0}" -f $status)
    $bodyJson = $result.body | ConvertTo-Json -Depth 10
    Write-Host ("body={0}" -f $bodyJson)
    return $ok
  } catch {
    Write-Host "[FAIL] $Label"
    Write-Host ("error={0}" -f $_.Exception.Message)
    return $false
  }
}

$workplaceId = $env:WORKPLACE_ID

$allOk = $true
$allOk = $allOk -and (Invoke-Step -Label "ping" -Action "ping")
$allOk = $allOk -and (Invoke-Step -Label "upsert s001" -Action "upsert" -StaffId "s001" -DisplayName "s001" -Password "12345678" -WorkplaceId $workplaceId)
$allOk = $allOk -and (Invoke-Step -Label "debug s001" -Action "debug" -StaffId "s001" -WorkplaceId $workplaceId)
$allOk = $allOk -and (Invoke-Step -Label "soft_delete s001" -Action "soft_delete" -StaffId "s001" -WorkplaceId $workplaceId)
$allOk = $allOk -and (Invoke-Step -Label "upsert s001-2" -Action "upsert" -StaffId "s001" -DisplayName "s001-2" -Password "12345678" -WorkplaceId $workplaceId)

if (-not $allOk) {
  exit 1
}
