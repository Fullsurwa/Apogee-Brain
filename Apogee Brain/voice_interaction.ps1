# Apogee Wake‑Word Script (Verified Anthropic API)
# Save as voice_interaction.ps1

# === CONFIGURATION ===
$apiKey = $env:ANTHROPIC_API_KEY
$outputPath = "C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\ApogeeBrainData"
$wakeWord = "Hello Apogee"
$exitWord = "quit"

# === STARTUP CHECK ===
Write-Host "Checking API key and internet connection..."
if ([string]::IsNullOrEmpty($apiKey)) {
    Write-Host "❌ API key not found. Run: setx ANTHROPIC_API_KEY 'your_key_here'"
    exit
}
try {
    $test = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/models" `
        -Headers @{ 
            "x-api-key" = $apiKey
            "anthropic-version" = "2023-06-01"
        }
    Write-Host "✅ Connection OK. Models available:" ($test | ConvertTo-Json -Depth 3)
}
catch {
    Write-Host "❌ Connection test failed: $($_.Exception.Message)"
    Write-Host "Check your API key or internet connection."
    exit
}

# === INITIALIZATION ===
Write-Host "Apogee Voice system ready. Type '$wakeWord' to begin or '$exitWord' to stop."

# === LOOP ===
while ($true) {
    $input = Read-Host "Speak or type command"

    if ($input -eq $exitWord) {
        Write-Host "Exiting Apogee Voice system..."
        break
    }

    if ($input -eq $wakeWord) {
        Write-Host "Wake‑word detected. Launching Claude session..."

        # === SESSION FILE ===
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $sessionFile = Join-Path $outputPath "Session_$timestamp.txt"
        $prompt = "Start new Apogee session for Daniel. Connect to Obsidian vault."

        # === CALL CLAUDE API ===
        $body = @{
            model = "claude-3-opus-20240229"
            max_tokens = 500
            messages = @(
                @{
                    role = "user"
                    content = @(
                        @{
                            type = "text"
                            text = $prompt
                        }
                    )
                }
            )
        } | ConvertTo-Json -Depth 10

        try {
            $headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
            $headers.Add("x-api-key", $apiKey)
            $headers.Add("anthropic-version", "2023-06-01")
            $headers.Add("content-type", "application/json")

            $response = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" `
                -Headers $headers -Method Post -Body $body -TimeoutSec 60

            if ($null -ne $response -and $response.content.Count -gt 0) {
                $responseText = $response.content[0].text
                $responseText | Out-File -FilePath $sessionFile -Encoding UTF8

                Write-Host "✅ Session saved to ApogeeBrainData: $sessionFile"
                Write-Host "Claude response:"
                Write-Host $responseText
            }
            else {
                Write-Host "⚠️ Claude API returned no usable content. Raw response:"
                Write-Host ($response | ConvertTo-Json -Depth 10)
            }
        }
        catch {
            Write-Host "❌ Error: $($_.Exception.Message)"
            Write-Host "Check your API key or internet connection."
        }
    }
}
