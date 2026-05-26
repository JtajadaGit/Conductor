# Conductor subagentStart — inject [SDD CONTEXT] for the active change + instruction file paths.
# AMSI-clean.

$ErrorActionPreference = 'SilentlyContinue'

$out = '{}'
$ctx = ''

if (Test-Path 'openspec/changes') {
    $state = Get-ChildItem 'openspec/changes' -Filter state.yaml -Recurse -Depth 1 |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1

    if ($state) {
        $content = Get-Content $state.FullName -Raw
        $change  = if ($content -match '(?m)^change:\s*(.+)')        { $Matches[1].Trim() } else { '' }
        $status  = if ($content -match '(?m)^status:\s*(.+)')        { $Matches[1].Trim() } else { '' }
        $phase   = if ($content -match '(?m)^current_phase:\s*(.+)') { $Matches[1].Trim() } else { '' }

        if ($status -ne 'complete' -and $status -ne 'archived' -and $change) {
            $cd = "openspec/changes/$change"
            $avail = @()
            if (Test-Path "$cd/state.yaml")       { $avail += 'state.yaml' }
            if (Test-Path "$cd/proposal.md")      { $avail += 'proposal.md' }
            if (Test-Path "$cd/specs")            { $avail += 'specs/' }
            if (Test-Path "$cd/design.md")        { $avail += 'design.md' }
            if (Test-Path "$cd/tasks.md")         { $avail += 'tasks.md' }
            if (Test-Path "$cd/apply-report.md")  { $avail += 'apply-report.md' }
            if (Test-Path "$cd/verify-report.md") { $avail += 'verify-report.md' }
            $availStr = $avail -join ' '
            $ctx = "[SDD CONTEXT] change: $change | phase: $phase | artifact_base: $cd/ | available: $availStr"
        }
    }
}

if (Test-Path '.github/instructions') {
    $files = Get-ChildItem '.github/instructions' -Filter '*.instructions.md'
    if ($files) {
        $base = (Get-Location).Path + [System.IO.Path]::DirectorySeparatorChar
        $rel = @()
        foreach ($f in $files) {
            $r = ($f.FullName -replace [regex]::Escape($base), '') -replace '\\', '/'
            $rel += $r
        }
        $relStr = $rel -join ', '
        $ctx = "$ctx | [INSTRUCTIONS] Read before coding: $relStr"
    }
}

if ($ctx) {
    $obj = @{ additionalContext = $ctx }
    $out = $obj | ConvertTo-Json -Compress
}

Write-Output $out
