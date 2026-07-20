# Step 2 helper — validate one sit-reach video
# Usage:
#   .\validate_one_clip.ps1 -Video "..\validation\videos\sit_reach\sr-p01.webm" -ExpectedReachCm 12.5

param(
    [Parameter(Mandatory = $true)]
    [string]$Video,

    [Parameter(Mandatory = $true)]
    [double]$ExpectedReachCm,

    [double]$HeightCm = 170,
    [string]$Validity = "valid_movement",
    [string]$Scenario = "full_reach",
    [string]$CameraAngle = "side",
    [double]$ToleranceCm = 3.0
)

$ErrorActionPreference = "Stop"
$ToolsDir = $PSScriptRoot
$CvRoot = Split-Path $ToolsDir -Parent

if ([System.IO.Path]::IsPathRooted($Video)) {
    $VideoFull = $Video
} else {
    $VideoFull = Join-Path $ToolsDir $Video
}
$VideoFull = [System.IO.Path]::GetFullPath($VideoFull)

$OutDir = Join-Path $CvRoot "validation\output"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Stem = [System.IO.Path]::GetFileNameWithoutExtension($VideoFull)
$ResultJson = Join-Path $OutDir "${Stem}_result.json"
$DebugCsv = Join-Path $OutDir "${Stem}_debug.csv"

Write-Host "Video:           $VideoFull"
Write-Host "Expected reach:  $ExpectedReachCm cm (tolerance +/- $ToleranceCm)"
Write-Host "Height:          $HeightCm cm"
Write-Host "Output:          $ResultJson"
Write-Host ""

if (-not (Test-Path $VideoFull)) {
    Write-Host "Video file not found. For Step 1, save your clip to:" -ForegroundColor Yellow
    Write-Host "  cv-service\validation\videos\sit_reach\" -ForegroundColor Yellow
    exit 1
}

Push-Location $ToolsDir
try {
    python validate_sit_reach_video.py `
        --video $VideoFull `
        --expected-reach-cm $ExpectedReachCm `
        --expected-validity $Validity `
        --scenario $Scenario `
        --camera-angle $CameraAngle `
        --user-height-cm $HeightCm `
        --reach-tolerance-cm $ToleranceCm `
        --output-json $ResultJson `
        --debug-csv $DebugCsv
    $exit = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($exit -eq 0) {
    Write-Host ""
    Write-Host "PASSED - open $ResultJson for details" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "FAILED (exit $exit) - check $ResultJson and $DebugCsv" -ForegroundColor Yellow
}
exit $exit
