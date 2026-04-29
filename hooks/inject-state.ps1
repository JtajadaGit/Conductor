# inject-state.ps1 — sessionStart hook
# Reads active change state and injects it as context at session start.

$changesDir = "openspec/changes"
$context = ""

if (Test-Path $changesDir) {
    $stateFiles = Get-ChildItem -Path $changesDir -Filter "state.yaml" -Recurse -Depth 1 | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($stateFiles) {
        $content = Get-Content $stateFiles.FullName -Raw
        $status = if ($content -match '(?m)^status:\s*(.+)') { $Matches[1].Trim() } else { "" }
        $change = if ($content -match '(?m)^change:\s*(.+)') { $Matches[1].Trim() } else { "" }
        $phase = if ($content -match '(?m)^current_phase:\s*(.+)') { $Matches[1].Trim() } else { "" }
        $complexity = if ($content -match '(?m)^complexity:\s*(.+)') { $Matches[1].Trim() } else { "" }
        $auto = if ($content -match '(?m)^auto_mode:\s*(.+)') { $Matches[1].Trim() } else { "" }

        if ($status -ne "complete" -and $change) {
            $context = "[SDD ACTIVE] change: $change | status: $status | phase: $phase | complexity: $complexity | auto: $auto | artifacts: openspec/changes/$change/"
        }
    }
}

if (Test-Path "openspec/config.yaml") {
    $cfg = Get-Content "openspec/config.yaml" -Raw
    $tdd = if ($cfg -match '(?m)strict_tdd:\s*(.+)') { $Matches[1].Trim() } else { "false" }
    $maxCycles = if ($cfg -match '(?m)max_review_cycles:\s*(.+)') { $Matches[1].Trim() } else { "3" }
    $context = "$context [SDD CONFIG] tdd: $tdd | max_review_cycles: $maxCycles"
}

if ($context) {
    Write-Output "{`"additionalContext`":`"$context`"}"
} else {
    Write-Output "{}"
}
