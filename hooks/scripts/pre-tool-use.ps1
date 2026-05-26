# Conductor preToolUse guard — blocks git/gh/curl/wget/destructive ops + web fetch.
# PowerShell 7+ (pwsh). Reads tool call JSON on stdin, writes single-line JSON decision on stdout.
# Designed to be AMSI-clean: no script blocks (& {}), no base64, no reflection, no Invoke-Expression.

$ErrorActionPreference = 'Stop'

# Read full stdin.
$body = [Console]::In.ReadToEnd()

function Write-Allow {
    Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
    exit 0
}

function Write-Deny([string]$Reason) {
    $obj = @{
        hookSpecificOutput = @{
            hookEventName            = 'PreToolUse'
            permissionDecision       = 'deny'
            permissionDecisionReason = $Reason
        }
    }
    Write-Output ($obj | ConvertTo-Json -Compress -Depth 4)
    exit 0
}

# Block web fetching tools.
if ($body -match '"tool_name"\s*:\s*"(web_fetch|WebFetch|fetch_url)"') {
    Write-Deny 'BLOCKED: web fetching not allowed by Conductor policy.'
}

# For shell-class tools, block dangerous commands.
if ($body -match '"tool_name"\s*:\s*"(bash|shell|powershell|execute|run_command)"') {
    if ($body -match '(^|[^A-Za-z])(git|gh)([^A-Za-z]|$)') {
        Write-Deny 'BLOCKED: git/gh operations forbidden. The user manages git, never the agent.'
    }
    if ($body -match 'curl|wget|Invoke-WebRequest|Invoke-RestMethod') {
        Write-Deny 'BLOCKED: network calls (curl/wget) not allowed.'
    }
    if ($body -match 'rm\s+-rf|rmdir|del\s+/s|Remove-Item.*Recurse') {
        Write-Deny 'BLOCKED: destructive deletion not allowed.'
    }
}

Write-Allow
