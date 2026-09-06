function Get-ContentScoutDocuments {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VaultPath
    )

    if (-not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
        throw "Content Scout vault path does not exist: $VaultPath"
    }

    $files = Get-ChildItem -LiteralPath $VaultPath -Recurse -File |
        Where-Object {
            $_.FullName -notmatch '[\\/]\.obsidian([\\/]|$)' -and
            $_.Extension.ToLowerInvariant() -in @('.md', '.markdown', '.txt', '.json')
        }

    foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($VaultPath.TrimEnd('\', '/').Length).TrimStart('\', '/')
            [PSCustomObject]@{
                Source = $relativePath
                Content = Get-Content -LiteralPath $file.FullName -Raw
            }
    }
}

function ConvertTo-ContentScoutPrompt {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Documents,
        [int]$MaxDocumentCharacters = 120000
    )

    $documentParts = @()
    $documentCharacters = 0
    foreach ($document in $Documents) {
        if ($documentCharacters -ge $MaxDocumentCharacters) {
            break
        }

        $sourceHeader = "--- SOURCE: $($document.Source) ---`n"
        $remainingCharacters = $MaxDocumentCharacters - $documentCharacters
        if ($sourceHeader.Length -ge $remainingCharacters) {
            break
        }

        $contentBudget = $remainingCharacters - $sourceHeader.Length
        $content = [string]$document.Content
        if ($content.Length -gt $contentBudget) {
            $content = $content.Substring(0, $contentBudget)
        }

        $documentParts += $sourceHeader + $content
        $documentCharacters += $sourceHeader.Length + $content.Length
    }
    $documentText = $documentParts -join "`n`n"

    @"
Review the vault documents as Apogee's read-only Content Scout. Your sole task is to
select exactly three potential Building-in-Public story candidates from the supplied
material. Output JSON only: no introduction, explanation, reasoning, markdown fences,
or conversational response.

Every candidate must describe something actually present in the vault. Do not invent
outcomes, traction, customer validation, significance, dates, or claims. Do not infer
that a plan was executed. If evidence is incomplete, state that conservatively and
use low confidence. Do not write a LinkedIn post, recommend publishing, expose private
information, or modify any files.

Return exactly three ranked candidates in this JSON shape:
{
  "stories": [
    {
      "rank": 1,
      "title": "concise story title",
      "whatActuallyHappened": "only the documented action, decision, experiment, constraint, or current state",
      "supportingEvidence": [{"source": "exact relative source path", "evidence": "directly supported detail"}],
      "whyInteresting": "why this may be interesting to a Building-in-Public audience, stated as a possibility rather than an unsupported outcome",
      "confidence": "high|medium|low"
    }
  ]
}

Use only exact source paths supplied below, and include at least one supporting source
for every candidate. Prefer distinct, concrete progress, decisions, experiments,
constraints, lessons, or current product work. Rank by evidence strength and potential
interest, not by speculation. The JSON must begin with { and end with }.

VAULT DOCUMENTS:
$documentText
"@
}

function ConvertTo-ContentScoutUtf8Bytes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $normalized = New-Object System.Text.StringBuilder
    for ($index = 0; $index -lt $Text.Length; $index++) {
        $character = $Text[$index]
        if ([char]::IsHighSurrogate($character)) {
            if ($index + 1 -lt $Text.Length -and [char]::IsLowSurrogate($Text[$index + 1])) {
                [void]$normalized.Append($character)
                $index++
                [void]$normalized.Append($Text[$index])
            } else {
                [void]$normalized.Append([char]0xFFFD)
            }
        } elseif ([char]::IsLowSurrogate($character)) {
            [void]$normalized.Append([char]0xFFFD)
        } else {
            [void]$normalized.Append($character)
        }
    }

    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $utf8.GetBytes($normalized.ToString())
}

function Get-ContentScoutAnthropicEndpoint {
    "https://api.anthropic.com/v1/messages"
}

function Invoke-ContentScoutAnthropicRequest {
    param(
        [Parameter(Mandatory = $true)]
        [byte[]]$Body,
        [Parameter(Mandatory = $true)]
        [string]$ClaudeApiKey
    )

    $endpoint = Get-ContentScoutAnthropicEndpoint
    $request = [System.Net.HttpWebRequest]::Create($endpoint)
    $request.Method = "POST"
    $request.ContentType = "application/json; charset=utf-8"
    $request.ContentLength = $Body.Length
    $request.Headers.Add("x-api-key", $ClaudeApiKey)
    $request.Headers.Add("anthropic-version", "2023-06-01")

    $headerNames = @("x-api-key", "anthropic-version")
    $proxyState = if ($null -eq $request.Proxy) { "null" } else { $request.Proxy.GetType().FullName }
    $explicitHost = if ($request.Headers["Host"]) { "<configured>" } else { "<none>" }
    Write-Host "Content Scout HTTP request: RequestUri=$($request.RequestUri.AbsoluteUri); Method=$($request.Method); ContentType=$($request.ContentType); ContentLength=$($request.ContentLength); HeaderNames=$($headerNames -join ','); ExplicitHost=$explicitHost; Proxy=$proxyState; AllowAutoRedirect=$($request.AllowAutoRedirect)"

    $requestStream = $request.GetRequestStream()
    try {
        $requestStream.Write($Body, 0, $Body.Length)
    } finally {
        $requestStream.Dispose()
    }

    try {
        $response = $request.GetResponse()
    } catch [System.Net.WebException] {
        $httpResponse = $_.Exception.Response
        if ($null -ne $httpResponse) {
            $statusCode = [int]$httpResponse.StatusCode
            $statusDescription = $httpResponse.StatusDescription
            $reader = New-Object -TypeName System.IO.StreamReader -ArgumentList $httpResponse.GetResponseStream()
            try {
                $responseBody = $reader.ReadToEnd()
            } finally {
                $reader.Dispose()
                $httpResponse.Dispose()
            }

            throw "Anthropic request failed with HTTP $statusCode $statusDescription`: $responseBody"
        }

        throw
    }

    $responseStream = $response.GetResponseStream()
    try {
        $responseText = (New-Object -TypeName System.IO.StreamReader -ArgumentList $responseStream).ReadToEnd()
    } finally {
        $responseStream.Dispose()
        $response.Dispose()
    }

    $responseText | ConvertFrom-Json
}

function Invoke-ContentScout {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VaultPath,
        [Parameter(Mandatory = $true)]
        [string]$ClaudeApiKey
    )

    if ([string]::IsNullOrWhiteSpace($ClaudeApiKey)) {
        $ClaudeApiKey = $env:ANTHROPIC_API_KEY
    }

    if ([string]::IsNullOrWhiteSpace($ClaudeApiKey)) {
        throw "ANTHROPIC_API_KEY is not configured."
    }

    $documents = @(Get-ContentScoutDocuments -VaultPath $VaultPath)
    if ($documents.Count -eq 0) {
        throw "No Markdown, text, or JSON files were found in the vault."
    }

    $requestBody = @{
        model = "claude-sonnet-5"
        max_tokens = 3000
        system = "You are a strict JSON-producing Content Scout. Follow the user's schema exactly. Never answer conversationally."
        messages = @(
            @{
                role = "user"
                content = ConvertTo-ContentScoutPrompt -Documents $documents
            }
        )
    } | ConvertTo-Json -Depth 10
    $requestBodyBytes = ConvertTo-ContentScoutUtf8Bytes -Text $requestBody

    try {
        $response = Invoke-ContentScoutAnthropicRequest -Body $requestBodyBytes -ClaudeApiKey $ClaudeApiKey
    } catch {
        $httpResponse = $_.Exception.Response
        if ($null -ne $httpResponse) {
            $reader = New-Object -TypeName System.IO.StreamReader -ArgumentList $httpResponse.GetResponseStream()
            $responseBody = $reader.ReadToEnd()
            $reader.Dispose()
            throw "Anthropic request failed with HTTP $([int]$httpResponse.StatusCode) $($httpResponse.StatusDescription): $responseBody"
        }

        throw
    }

    $modelText = ($response.content | Where-Object { $_.type -eq "text" } | Select-Object -ExpandProperty text) -join "`n"
    if ([string]::IsNullOrWhiteSpace($modelText)) {
        throw "Claude returned an empty Content Scout response."
    }

    $jsonText = $modelText.Trim()
    if ($jsonText -match '(?s)^```(?:json)?\s*(.*?)\s*```$') {
        $jsonText = $Matches[1]
    }
    if ($jsonText -match '(?s)(\{.*\})') {
        $jsonText = $Matches[1]
    }

    try {
        $result = $jsonText | ConvertFrom-Json
    } catch {
        throw "Claude returned invalid Content Scout JSON: $($_.Exception.Message)"
    }

    $sourcePaths = @($documents | ForEach-Object { $_.Source })
    $stories = @($result.stories)
    if ($null -eq $result.stories -or $stories.Count -ne 3) {
        throw "Claude returned an invalid Content Scout result; exactly three stories are required."
    }

    for ($index = 0; $index -lt $stories.Count; $index++) {
        $story = $stories[$index]
        if ($story.rank -ne ($index + 1) -or
            [string]::IsNullOrWhiteSpace($story.title) -or
            [string]::IsNullOrWhiteSpace($story.whatActuallyHappened) -or
            [string]::IsNullOrWhiteSpace($story.whyInteresting) -or
            [string]::IsNullOrWhiteSpace($story.confidence) -or
            @($story.supportingEvidence).Count -eq 0) {
            throw "Claude returned an incomplete Content Scout candidate at rank $($index + 1)."
        }

        foreach ($evidence in @($story.supportingEvidence)) {
            if ($sourcePaths -notcontains $evidence.source -or
                [string]::IsNullOrWhiteSpace($evidence.evidence)) {
                throw "Claude returned unsupported or incomplete evidence for rank $($index + 1)."
            }
        }
    }

    Format-ContentScoutResponse -Stories $stories
}

function Format-ContentScoutResponse {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Stories
    )

    $lines = @("Content Scout - three story candidates (read-only):")
    foreach ($story in ($Stories | Sort-Object rank)) {
        $evidence = @($story.supportingEvidence | ForEach-Object {
            "- $($_.source): $($_.evidence)"
        }) -join "`n"
        $lines += @(
            "",
            "$($story.rank). $($story.title)",
            "What actually happened: $($story.whatActuallyHappened)",
            "Supporting evidence:",
            $evidence,
            "Why interesting: $($story.whyInteresting)",
            "Confidence: $($story.confidence)"
        )
    }

    $lines -join "`n"
}
