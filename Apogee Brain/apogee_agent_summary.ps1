# ====================================================================
# Apogee SKOPE LLP – Unified Voice Agent (Continuous, Cost-Optimized)
# ====================================================================

# --- CONFIGURATION ---
$claudeApiKey     = $env:CLAUDE_API_KEY       # Reads directly from your Windows environment variable
$elevenLabsApiKey = "sk_90bdc3f1fbfbf75f40b3a87cab84db952f9ad8b1b6a2f1c3"
$elevenVoiceId    = "dtSEyYGNJqjrtBArPCVZ"    # Titan Voice (Deep & Bold)

# Auto-detect OneDrive vault path
$obsidianVault    = Join-Path $env:OneDrive "Desktop\Dan\Apogee SKOPE LLP\Apogee Brain"
$contentScoutPath = Join-Path $PSScriptRoot "ContentScout.ps1"
. $contentScoutPath

Write-Host "🔊 System Active. Listening for 'Hello Apogee'..."
Write-Host "💡 Tip: Add '--voice' to the end of your sentence to generate ElevenLabs speech." -ForegroundColor Cyan

while ($true) {
    $input = Read-Host "🎤 Say something"
    
    if ($input -like "Hello Apogee*") {
        # Check if the user explicitly requested voice output to save free tier characters
        $enableVoice = $input -like "*--voice*"
        
        # Clean the input query (remove wake word and voice flag)
        $userQuery = $input.Substring(12).Replace("--voice", "").Trim()
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
            # Content Scout is deliberately read-only and isolated from the existing pipeline.
            try {
                $replyText = Invoke-ContentScout -VaultPath $obsidianVault -ClaudeApiKey $claudeApiKey
            } catch {
                $replyText = "Content Scout failed: $($_.Exception.Message)"
            }
        } elseif ($claudeApiKey) {
            Write-Host "🧠 Sending context to Claude API..." -ForegroundColor Yellow
            
            # Structuring payload for Claude API (Sonnet 5)
            $claudeUrl = "https://api.anthropic.com/v1/messages"
            $headers = @{
                "x-api-key"         = $claudeApiKey
                "anthropic-version" = "2023-06-01"
                "Content-Type"      = "application/json"
            }
            
            # Efficient system context to keep tokens lean
            $systemPrompt = "You are Apogee, an executive strategist for Daniel. Analyze his local vault context and provide ultra-concise, punchy responses. Avoid fluff to save tokens."
            
            $body = @{
                model       = "claude-sonnet-5" # Upgraded to Sonnet 5 for efficient execution
                max_tokens  = 400
                system      = $systemPrompt
                messages    = @(
                    @{ role = "user"; content = "Context from local files:\n$notesContext\n\nUser Query: $userQuery" }
                )
            } | ConvertTo-Json -Depth 10

            try {
                $response = Invoke-RestMethod -Uri $claudeUrl -Method Post -Headers $headers -Body $body
                $replyText = $response.content[0].text
            } catch {
                $replyText = "Claude API error detected. Falling back to local routing."
                Write-Host "⚠️ Claude API Call Failed: $_" -ForegroundColor Red
            }
        } else {
            # Free Tier / No Key Active Fallback Logic
            if ($userQuery -match "summary") {
                if (-not $recentNotes) {
                    $replyText = "No recent session notes found in your Obsidian log directory to summarize today."
                } else {
                    $replyText = "Local file bridge operational. Found $($recentNotes.Count) recent logs. Connect your Claude API Key variable to run the live summarizer."
                }
            } else {
                $replyText = "With love from Apogee: You asked: '$userQuery'. Bypassing Claude API and processing locally."
            }
        }

        # --- STEP 3: Save to Vault ---
        if (-not $isContentScoutQuery) {
            $summaryFile = "$obsidianVault\Daily Summary.md"
            $timestamp   = Get-Date -Format "yyyy-MM-dd HH:mm"
            Add-Content -Path $summaryFile -Value "`n### Entry for $timestamp`n$replyText`n"
            Write-Host "💾 Log successfully appended to Obsidian." -ForegroundColor Green
        }

        # --- STEP 4: Conditional ElevenLabs Voice Output ---
        if ($enableVoice) {
            Write-Host "🔊 Generating ElevenLabs Voice Audio (Using Character Balance)..." -ForegroundColor Yellow
            $elevenUrl = "https://api.elevenlabs.io/v1/text-to-speech/$elevenVoiceId"
            $headers   = @{ "xi-api-key" = $elevenLabsApiKey; "Content-Type" = "application/json" }
            $body      = @{ text = $replyText } | ConvertTo-Json

            try {
                Invoke-RestMethod -Uri $elevenUrl -Method Post -Headers $headers -Body $body -OutFile "$env:TEMP\apogee_reply.mp3"
                
                # Play Audio securely via PresentationCore
                Add-Type -AssemblyName presentationCore
                $player = New-Object System.Windows.Media.MediaPlayer
                $player.Open("$env:TEMP\apogee_reply.mp3")
                $player.Play()
                Start-Sleep -Seconds 2 # Allow stream initializing time
            } catch {
                Write-Host "⚠️ ElevenLabs allocation limit hit or connection failed." -ForegroundColor Red
            }
        } else {
            Write-Host "🔇 Voice skipped (Saved Free Tier characters). Clear text response below:" -ForegroundColor Gray
        }

        Write-Host "🎙️ Apogee Says: $replyText`n" -ForegroundColor Green
    }
}