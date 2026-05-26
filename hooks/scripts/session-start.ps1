# Conductor sessionStart — inject [SDD ACTIVE] context if there is an in-progress change.
# AMSI-clean: no script blocks, no reflection, no Invoke-Expression.

$ErrorActionPreference = 'SilentlyContinue'

$out = '{}'

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
            $ctx = "[SDD ACTIVE] change: $change | status: $status | phase: $phase | artifacts: openspec/changes/$change/"
            $obj = @{ additionalContext = $ctx }
            $out = $obj | ConvertTo-Json -Compress
        }
    }
}

Write-Output $out
