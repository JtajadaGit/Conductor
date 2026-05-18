# guard-tools.ps1 — preToolUse hook
# BLOCKS: git operations, destructive commands, network calls.
# ENFORCES: per-step scope via CONDUCTOR_STEP_SCOPE env var.

$rawInput = $Input | Out-String

$toolName = if ($rawInput -match '"tool_name"\s*:\s*"([^"]*)"') { $Matches[1] }
  elseif ($rawInput -match '"toolName"\s*:\s*"([^"]*)"') { $Matches[1] }
  else { "" }

function Deny($reason) {
    Write-Output "{`"hookSpecificOutput`":{`"hookEventName`":`"PreToolUse`",`"permissionDecision`":`"deny`",`"permissionDecisionReason`":`"$reason`"}}"
    exit 0
}

# Block web_fetch
if ($toolName -eq "web_fetch" -or $toolName -eq "WebFetch") {
    Deny "BLOCKED: web fetching not allowed."
}

# Check shell commands
if ($toolName -eq "bash" -or $toolName -eq "shell" -or $toolName -eq "powershell" -or $toolName -eq "execute") {

    # Block ANY git command anywhere in the input
    if ($rawInput -match '\bgit\b') {
        Deny "BLOCKED: ALL git operations forbidden. The user manages git, never the agent."
    }

    # Block destructive
    if ($rawInput -match '(rm\s+-rf|rmdir|del\s+/s|Remove-Item.*-Recurse)') {
        Deny "BLOCKED: destructive operations not allowed."
    }

    # Block network
    if ($rawInput -match '(curl|wget|Invoke-WebRequest|Invoke-RestMethod)') {
        Deny "BLOCKED: network calls not allowed."
    }
}

# Per-step scope enforcement
# If CONDUCTOR_STEP_SCOPE is set, restrict file writes to those paths
$scope = $env:CONDUCTOR_STEP_SCOPE
if ($scope -and ($toolName -eq "edit" -or $toolName -eq "write" -or $toolName -eq "create")) {
    $filePath = if ($rawInput -match '"(?:file_?[Pp]ath|path)"\s*:\s*"([^"]*)"') { $Matches[1] } else { "" }
    if ($filePath) {
        $allowedPaths = $scope -split ";"
        $allowed = $false
        foreach ($p in $allowedPaths) {
            if ($filePath -like "*$p*") { $allowed = $true; break }
        }
        if (-not $allowed) {
            Deny "BLOCKED: File '$filePath' is outside step scope: $scope"
        }
    }
}

Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
