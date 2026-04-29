# guard-tools.ps1 — preToolUse hook
# Security guard for Conductor pipeline.
# Blocks: git operations, destructive commands, network calls.

$input = $Input | Out-String
$toolName = if ($input -match '"toolName":"([^"]*)"') { $Matches[1] } else { "" }
$command = if ($input -match '"command":"([^"]*)"') { $Matches[1] } else { "" }

# Block web_fetch tool directly
if ($toolName -eq "web_fetch") {
    Write-Output '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: web fetching not allowed during pipeline."}'
    exit 0
}

if ($toolName -eq "bash" -or $toolName -eq "shell" -or $toolName -eq "powershell") {
    # Git — ALL operations blocked
    if ($command -match "^git\s") {
        Write-Output '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: git operations are managed by the user, never by the agent."}'
        exit 0
    }

    # Destructive
    if ($command -match "^(rm -rf|rmdir|del /|Remove-Item.*-Recurse)") {
        Write-Output '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: destructive operations not allowed."}'
        exit 0
    }

    # Network — curl, wget, invoke-webrequest
    if ($command -match "(curl|wget|Invoke-WebRequest|Invoke-RestMethod|curl\.exe)") {
        Write-Output '{"permissionDecision":"deny","permissionDecisionReason":"BLOCKED: network calls not allowed during pipeline."}'
        exit 0
    }
}

Write-Output '{"permissionDecision":"allow"}'
