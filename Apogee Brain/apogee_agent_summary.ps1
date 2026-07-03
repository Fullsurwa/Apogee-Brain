# ================================
# Apogee SKOPE LLP – Unified Voice Agent (Continuous + Flexible)
# ================================

# --- CONFIGURATION ---
$claudeApiKey     = $env:CLAUDE_API_KEY       # set once you upgrade Claude
$elevenLabsApiKey = "sk_90bdc3f1fbfbf75f40b3a87cab84db952f9ad8b1b6a2f1c3"
$elevenVoiceId    = "dtSEyYGNJqjrtBArPCVZ"

# Auto-detect OneDrive vault path
$obsidianVault    = Join-Path $env:OneDrive "Desktop\Dan\Apogee SKOPE LLP\Apogee Brain"

# --- LOOP: Continuous Wake-Word Listener ---
Write-Host "🔊 Listening for 'Hello Apogee'... (Press Ctrl+C to stop)"

while ($true) {
    $input = Read-Host "🎤 Say something"
    
    if ($input -like "Hello Apogee*") {
        $userQuery = $input.Substring(12).Trim()  # everything after wake-word

        # --- STEP 1: Read Notes ---
        $notesPath = "$obsidianVault\Session Logs"
        if (-not (Test-Path $notesPath)) {
            New-Item -Path $notesPath -ItemType Directory | Out-Null
        }
        $recentNotes = Get-ChildItem -Path $notesPath -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5
        $notesText   = foreach ($note in $recentNotes) { Get-Content $note.FullName -Raw }

        # --- STEP 2: Handle Query ---
        if ($userQuery -match "summary") {
            # Daily summary logic
            if (-not $recentNotes) {
                $replyText = "No session notes found today. ElevenLabs will speak this placeholder summary."
            } else {
                $replyText = "Claude API is not active yet. ElevenLabs will still speak this placeholder daily summary."
            }
        } else {
            # General query fallback
            $replyText = "You asked: $userQuery. Claude API is not active yet, so ElevenLabs will speak this placeholder response."
        }

        # --- STEP 3: Save to Vault ---
        $summaryFile = "$obsidianVault\Daily Summary.md"
        $timestamp   = Get-Date -Format "yyyy-MM-dd HH:mm"
        Add-Content -Path $summaryFile -Value "`n### Entry for $timestamp`n$replyText`n"

        # --- STEP 4: ElevenLabs Voice Output ---
        $elevenUrl = "https://api.elevenlabs.io/v1/text-to-speech/$elevenVoiceId"
        $headers   = @{ "xi-api-key" = $elevenLabsApiKey; "Content-Type" = "application/json" }
        $body      = @{ text = $replyText } | ConvertTo-Json

        try {
            Invoke-RestMethod -Uri $elevenUrl -Method Post -Headers $headers -Body $body -OutFile "$env:TEMP\apogee_reply.mp3"
            Write-Host "🎧 ElevenLabs audio generated successfully."
        } catch {
            Write-Host "⚠️ ElevenLabs call failed. Check your API key or voice ID."
        }

        # --- STEP 5: Play Audio ---
        Add-Type -AssemblyName presentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $player.Open("$env:TEMP\apogee_reply.mp3")
        $player.Play()

        Write-Host "🎙️ Agent spoke: $replyText"
    }
}
