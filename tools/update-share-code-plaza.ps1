param(
    [switch]$Preview
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$generatorPath = Join-Path $PSScriptRoot "share-code-plaza.mjs"

if (-not (Test-Path -LiteralPath $generatorPath)) {
    throw "Share code plaza generator not found: $generatorPath"
}

Push-Location $projectRoot
try {
    $arguments = @($generatorPath)
    if ($Preview) {
        $arguments += @("--no-publish", "--no-replies")
    }

    & node @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Share code plaza update failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
