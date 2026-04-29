# inject-context.ps1 — subagentStart hook
# Injects change context AND instruction file paths into subagents.

$changesDir = "openspec/changes"
$context = ""

if (Test-Path $changesDir) {
    $stateFiles = Get-ChildItem -Path $changesDir -Filter "state.yaml" -Recurse -Depth 1 | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($stateFiles) {
        $content = Get-Content $stateFiles.FullName -Raw
        $status = if ($content -match '(?m)^status:\s*(.+)') { $Matches[1].Trim() } else { "" }
        $change = if ($content -match '(?m)^change:\s*(.+)') { $Matches[1].Trim() } else { "" }
        $complexity = if ($content -match '(?m)^complexity:\s*(.+)') { $Matches[1].Trim() } else { "" }

        if ($status -ne "complete" -and $change) {
            $changeDir = "openspec/changes/$change"
            $artifacts = @()
            if (Test-Path "$changeDir/state.yaml") { $artifacts += "state.yaml" }
            if (Test-Path "$changeDir/specs") { $artifacts += "specs/" }
            if (Test-Path "$changeDir/design.md") { $artifacts += "design.md" }
            if (Test-Path "$changeDir/tasks.md") { $artifacts += "tasks.md" }
            if (Test-Path "$changeDir/apply-report.md") { $artifacts += "apply-report.md" }
            if (Test-Path "$changeDir/verify-report.md") { $artifacts += "verify-report.md" }

            $artifactList = $artifacts -join " "
            $context = "[SDD CONTEXT] change: $change | complexity: $complexity | artifact_base: $changeDir/ | available: $artifactList"
        }
    }
}

# Find instruction files
$instructions = ""
if (Test-Path ".github/instructions") {
    $instrFiles = Get-ChildItem -Path ".github/instructions" -Filter "*.instructions.md" -ErrorAction SilentlyContinue
    if ($instrFiles) {
        $instructions = ($instrFiles | ForEach-Object { $_.FullName -replace [regex]::Escape((Get-Location).Path + "\"), "" }) -join ", "
    }
}
if ($instructions) {
    $context = "$context | [INSTRUCTIONS] Read these before coding: $instructions"
}

if ($context) {
    Write-Output "{`"additionalContext`":`"$context`"}"
} else {
    Write-Output "{}"
}
