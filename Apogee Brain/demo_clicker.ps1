# ====================================================================
# Apogee SKOPE – Stakeholder Live Demo Trigger [SmartMart Brain]
# ====================================================================

# 1. Configuration (Familiar paths and your exact Make URL)
$obsidianVault = Join-Path $env:OneDrive "Desktop\Dan\Apogee SKOPE LLP\Apogee Brain"
$makeWebhookUrl = "https://hook.eu1.make.com/foblrokj4wan9r7g8brci9t3u8as87ca"

Write-Host "🎨 SmartMart Brain MVP Presentation Dashboard" -ForegroundColor Cyan
Write-Host "Select a demographic to simulate an entrance pin pick:"
Write-Host "1) Men"
Write-Host "2) Women"
Write-Host "3) Families"

$choice = Read-Host "Enter number (1, 2, or 3)"

# 2. Assigning the Demographic Tag based on your choice
if ($choice -eq "1") { $demographic = "Men" }
elseif ($choice -eq "2") { $demographic = "Women" }
else { $demographic = "Families" }

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$logMessage = "[$timestamp] SmartMart AoA: 1x Color-coded pin picked up by demographic group: $demographic"

# 3. LOCAL STORAGE: Targeting ONE dedicated node file to avoid duplication
$logFolder = "$obsidianVault\Session Logs"
if (-not (Test-Path $logFolder)) { New-Item -Path $logFolder -ItemType Directory | Out-Null }

# This variable locks the script to a single file name so your vault stays clean
$targetFile = "$logFolder\SmartMart_Live_Traffic.md"

Add-Content -Path $targetFile -Value "`n* $logMessage"
Write-Host "💾 Success: Appended directly into your existing SmartMart log file." -ForegroundColor Green

# 4. PRESENTATION: Shoot the packet to Make.com so the UI updates live on screen
$payload = @{
    EventTime   = $timestamp
    Group       = $demographic
    Status      = "Active Tracking Initialized"
    Market      = "Nairobi, Kenya Groundbreak"
} | ConvertTo-Json

try {
    Write-Host "🚀 Pushing visual data packet to Make.com dashboard..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri $makeWebhookUrl -Method Post -ContentType "application/json" -Body $payload
    Write-Host "🟢 Webhook Accepted! Check your Make.com screen to see the success flash." -ForegroundColor Green
} catch {
    Write-Host "❌ Cloud push skipped, but your local Obsidian file remains safely updated." -ForegroundColor Red
}