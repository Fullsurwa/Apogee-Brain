# ====================================================================
# Apogee SKOPE LLP - Unified Voice Agent (Continuous, Cost-Optimized)
# ====================================================================

# --- CONFIGURATION ---
$claudeApiKey     = $env:ANTHROPIC_API_KEY    # Reads directly from your Windows environment variable

# Auto-detect OneDrive vault path
$obsidianVault    = Join-Path $env:OneDrive "Desktop\Dan\Apogee SKOPE LLP\Apogee Brain"
$contentScoutPath = Join-Path $PSScriptRoot "ContentScout.ps1"
$canonicalBridgePath = Join-Path $obsidianVault "03_Active_Engine\Brains\core-engine\apogee_voice_bridge.js"
. $contentScoutPath
$handoffsPath     = if ($env:APOGEE_HANDOFFS_PATH) { $env:APOGEE_HANDOFFS_PATH } else { Join-Path $obsidianVault "Session Logs\handoffs.json" }

function Read-ApogeeHandoffs {
    if (-not (Test-Path $handoffsPath)) { return @() }
    try {
        $records = Get-Content $handoffsPath -Raw | ConvertFrom-Json
        if ($records -is [array]) { return @($records) }
        return @($records)
    } catch { return @() }
}

function Write-ApogeeHandoffs {
    param([object[]]$Records)
    $folder = Split-Path $handoffsPath -Parent
    if (-not (Test-Path $folder)) { New-Item -Path $folder -ItemType Directory | Out-Null }
    $json = ConvertTo-Json -InputObject @($Records) -Depth 10
    [System.IO.File]::WriteAllText($handoffsPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function New-ApogeeHandoff {
    param([string]$ActionType, [string]$OriginalRequest, [string]$Prompt)
    $records = Read-ApogeeHandoffs
    $record = [pscustomobject]@{
        id = "HO-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$([guid]::NewGuid().ToString('N').Substring(0, 6))"
        actionType = $ActionType
        originalRequest = $OriginalRequest
        handoffPrompt = $Prompt
        status = "PENDING"
        createdTimestamp = [DateTime]::UtcNow.ToString('o')
        completedTimestamp = $null
        resultEvidence = $null
    }
    Write-ApogeeHandoffs (@($records) + $record)
    return $record
}

function Invoke-ApogeeHandoffCommand {
    param([string]$Query)
    if ($Query -match '(?i)^handoff\s+result\s*:\s*([A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$') {
        $id = $Matches[1]
        $result = $Matches[2].Trim()
        $records = Read-ApogeeHandoffs
        $record = $records | Where-Object { $_.id -eq $id } | Select-Object -First 1
        if (-not $record) { return "No handoff found with ID $id." }
        $record.resultEvidence = $result
        $record.status = if ($result -match '^(?i:failed|failure|status\s*:\s*failed)\b') { "FAILED" } else { "COMPLETED" }
        $record.completedTimestamp = [DateTime]::UtcNow.ToString('o')
        Write-ApogeeHandoffs $records
        return "Recorded handoff $id for $($record.actionType).`nExecutor-reported result: $result`nStatus: $($record.status). Apogee has recorded the supplied evidence; it has not independently validated the underlying result."
    }
    if ($Query -match '(?i)^what handoffs are pending\??$') {
        $pending = @(Read-ApogeeHandoffs | Where-Object { $_.status -eq "PENDING" })
        if (-not $pending.Count) { return "No pending handoffs." }
        return "Pending handoffs:`n" + (($pending | ForEach-Object { "- $($_.id) | $($_.actionType) | $($_.originalRequest.Substring(0, [Math]::Min(100, $_.originalRequest.Length))) | $($_.status)" }) -join "`n")
    }
    return $null
}

function Get-ApogeeCapabilityHandoff {
    param([string]$Query)

    $capability = $null
    if ($Query -match "(?i)\b(edit|remove|delete|add|update|change|mark)\b.*\b(dashboard|vault|note|file|master dashboard)\b") { $capability = "VAULT_EDIT" }
    elseif ($Query -match "(?i)\b(implement|change the code|fix the code|add a feature|modify the runtime|write code)\b") { $capability = "CODE_CHANGE" }
    elseif ($Query -match "(?i)\b(research|investigate|look up|find out|competitor|competitors|web search)\b") { $capability = "EXTERNAL_RESEARCH" }
    elseif ($Query -match "(?i)\b(come back|when you are finished|in the background|later|async)\b") { $capability = "BACKGROUND_TASK" }
    if (-not $capability) { return $null }

    if ($capability -eq "VAULT_EDIT") { $prompt = "Builder-agent handoff (VAULT_EDIT):`nPlease apply this vault change directly and report the exact file and resulting line: $Query"; $reply = "The vault change has NOT been made. Apogee cannot directly modify the vault." }
    elseif ($capability -eq "CODE_CHANGE") { $prompt = "Builder-agent handoff (CODE_CHANGE):`nPlease implement this request in the Apogee repository, run focused validation, and report exact files changed and test results: $Query"; $reply = "The implementation has NOT been performed. Apogee cannot directly change the code." }
    elseif ($capability -eq "EXTERNAL_RESEARCH") { $prompt = "External-research handoff (EXTERNAL_RESEARCH):`nPlease research this using current external sources, cite the sources, and summarize the evidence: $Query"; $reply = "The research has NOT been performed. Apogee does not have external research capability in this runtime." }
    else { $prompt = "Background execution is unavailable (BACKGROUND_TASK):`n$Query"; $reply = "The requested background task has NOT been started. Apogee has no background executor." }
    return [pscustomobject]@{ Capability = $capability; Prompt = $prompt; Reply = "$reply`n`nHandoff required:`n$prompt`n`nAwaiting result: No executor has accepted this handoff yet." }
}

if ($env:APOGEE_TEST_MODE -eq "1") {
    $trackingResponse = Invoke-ApogeeHandoffCommand $env:APOGEE_TEST_QUERY
    if ($trackingResponse) { $trackingResponse; exit 0 }
    $testHandoff = Get-ApogeeCapabilityHandoff $env:APOGEE_TEST_QUERY
    if ($testHandoff) {
        $testRecord = New-ApogeeHandoff $testHandoff.Capability $env:APOGEE_TEST_QUERY $testHandoff.Prompt
        "$($testHandoff.Reply)`n`nHandoff ID: $($testRecord.id)"
    }
    exit 0
}

Write-Host "System Active. Listening for Hello Apogee..."

while ($true) {
    $input = Read-Host "Say something"
    
    if ($input -like "Hello Apogee*") {
        # Clean the input query by removing the wake word
        $userQuery = $input.Substring(12).TrimStart(" ", ",", ":", "-", "`t").Trim()
        $isContentScoutQuery = $userQuery -match "(?i)^\s*what should I post about\s*\??\s*$"

        # --- STEP 1: Read Recent Notes for Context ---
        $notesPath = "$obsidianVault\Session Logs"
        if (-not $isContentScoutQuery -and -not (Test-Path $notesPath)) {
            New-Item -Path $notesPath -ItemType Directory | Out-Null
        }
        $recentNotes = if (-not $isContentScoutQuery -and (Test-Path $notesPath)) {
            Get-ChildItem -Path $notesPath -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5
        } else {
            @()
        }
        $notesContext = ""
        if ($recentNotes) {
            $notesContext = foreach ($note in $recentNotes) { Get-Content $note.FullName -Raw }
            $notesContext = $notesContext -join "`n"
        }

        # --- STEP 2: Handle Query (Claude API vs Free Tier Fallback) ---
        $replyText = ""

        if ($isContentScoutQuery) {
            # Content Scout remains isolated from the canonical Apogee pipeline.
            try {
                $replyText = Invoke-ContentScout `
                    -VaultPath $obsidianVault `
                    -ClaudeApiKey $claudeApiKey
            } catch {
                $replyText = "Content Scout failed: $($_.Exception.Message)"
            }
        } else {
            # Normal voice requests use the canonical Apogee engine.
            Write-Host "Routing request through canonical Apogee engine..." -ForegroundColor Yellow

            try {
                if (-not (Test-Path $canonicalBridgePath)) {
                    throw "Canonical Apogee bridge not found: $canonicalBridgePath"
                }

                $bridgeJson = & node $canonicalBridgePath $userQuery 2>$null

                if ($LASTEXITCODE -ne 0 -or -not $bridgeJson) {
                    throw "Canonical Apogee bridge failed."
                }

                $bridgeResult = $bridgeJson | ConvertFrom-Json
                $replyText = [string]$bridgeResult.reply

                if ([string]::IsNullOrWhiteSpace($replyText)) {
                    throw "Canonical Apogee returned an empty reply."
                }
            } catch {
                $replyText = "Canonical Apogee engine error: $($_.Exception.Message)"
                Write-Host $replyText -ForegroundColor Red
            }
        }
        # --- STEP 3: Save to Vault ---
        if (-not $isContentScoutQuery) {
            $summaryFile = "$obsidianVault\Daily Summary.md"
            $timestamp   = Get-Date -Format "yyyy-MM-dd HH:mm"
            Add-Content -Path $summaryFile -Value "`n### Entry for $timestamp`n$replyText`n"
            Write-Host "Log successfully appended to Obsidian." -ForegroundColor Green
        }

        Write-Host "Apogee Says: $replyText`n" -ForegroundColor Green
    }
}

