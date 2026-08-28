const ANTHROPIC_API_KEY = "REDACTED";

const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const { Anthropic } = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const DASHBOARD_PATH = "C:\\Users\\kewot\\OneDrive\\Desktop\\Dan\\Apogee SKOPE LLP\\Apogee Brain\\00_Command_Center\\Life_Dashboard.md";
const VAULT_PATH = "C:\\Users\\kewot\\OneDrive\\Desktop\\Dan\\Apogee SKOPE LLP\\Apogee brain";

// Initialize scoped dashboard without unrequested features
if (!fs.existsSync(DASHBOARD_PATH)) {
    fs.writeFileSync(DASHBOARD_PATH, initialDashboard, 'utf-8');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function speakLocally(text, callback) {
    const cleanText = text
        .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|[\u2600-\u26FF])/g, '')
        .replace(/[#*`_\-\[\]()>\u2013\u2014|:]/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    const psScript = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak('${cleanText.replace(/'/g, "''")}');`;
    const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
    
    exec(`powershell -EncodedCommand ${encodedCommand}`, (error) => {
        if (error) console.error("⚠️ Local speech error:", error.message);
        if (callback) callback();
    });
}

function searchVaultForProject(query, dirPath) {
    try {
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                if (file.name === "04_Vault_Archive") continue;
                const found = searchVaultForProject(query, fullPath);
                if (found) return found;
            } else if (file.name.endsWith(".md")) {
                if (file.name.toLowerCase().includes(query.toLowerCase()) || file.name.toLowerCase().replace(/[_ -]/g, "").includes(query.toLowerCase().replace(/[_ -]/g, ""))) {
                    return fs.readFileSync(fullPath, "utf-8");
                }
            }
        }
    } catch (e) {}
    return null;
}

async function reasonWithClaude(transcript) {
    console.log("🧠 [Apogee Brain]: Processing request...");
    let dashboardContent = "";
    try {
        if (fs.existsSync(DASHBOARD_PATH)) {
            dashboardContent = fs.readFileSync(DASHBOARD_PATH, "utf-8");
        }
    } catch (e) {}

    let extraContext = "";
    const lowerTranscript = transcript.toLowerCase();

    try {
        const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 300,
            messages: [{
                role: "user",
                content: `You are Apogee, Daniel's personal Life CEO AI, built to manage his schedule, habits, growth, and ideas inside an existing Obsidian vault.

Vault Root Folders: 00_Command_Center, 01_Apogee_Core, 02_Market_Intelligence, 03_Active_Engine, 05_AI_Ideation, 06_Daily_Rhythms, ObsidianVault, Projects, Session Logs. Do not create any files or folders that already exist. Only create new files when explicitly asked, and only in locations that make sense within the existing structure.

Life Dashboard State:
${dashboardContent}
${extraContext}

User Query: "${transcript}"

Instructions: 
1. Keep responses conversational and concise since responses will be read aloud. Avoid heavy formatting, bullet dumps, or emoji unless Daniel specifically requests them.
2. If Daniel asks about his vault or structure, reference the root folders listed above.
3. If a specific project file is loaded, engage interactively rather than dumping raw markdown back.
4. Stick strictly to confirmed tracking areas: scheduling, habit tracking, Bible and book reading, and AI idea development. Do not introduce unconfirmed features like sleep monitoring.`
            }]
        });
        return response.content[0].text;
    } catch (e) {
        console.error("❌ CLAUDE API ERROR DETAILS:", e);
        return "I encountered an error connecting to my reasoning core, Sir.";
    }
}

function promptUser() {
    rl.question('\n🗣️ [Speak via Win+H or Type command]: ', async (transcript) => {
        if (!transcript.trim()) {
            promptUser();
            return;
        }
        if (transcript.toLowerCase().includes("goodbye")) {
            speakLocally("Goodbye, Daniel.", () => { process.exit(0); });
            return;
        }
        const reply = await reasonWithClaude(transcript);
        console.log(`🤖 [Apogee]:\n${reply}`);
        
        speakLocally(reply, () => {
            promptUser(); 
        });
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🟢 [Apogee Life CEO - Strict Protocol Online]`);
    speakLocally("Apogee online.", () => {
        promptUser();
    });
});

