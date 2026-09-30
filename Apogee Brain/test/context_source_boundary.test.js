const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const Module = require('module');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
const testVault = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-context-boundary-'));
process.env.APOGEE_VAULT_PATH = testVault;
process.env.GOOGLE_CALENDAR_TOKEN_PATH = path.join(os.tmpdir(), `apogee-context-boundary-token-${Date.now()}.json`);
fs.writeFileSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, JSON.stringify({
    access_token: 'test-access-token',
    scopes: ['https://www.googleapis.com/auth/calendar.events']
}), 'utf8');

function writeVaultFile(relativePath, content) {
    const filePath = path.join(testVault, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

writeVaultFile('00_Command_Center/Now.md', '# Now\n## Current focus\n- CURRENT_FOCUS_MARKER: testing state boundaries\n\n## Next actions\n- review evidence\n\n## Working notes\n- temporary\n');
writeVaultFile('00_Command_Center/Life_Dashboard.md', '# Life\n## Primary Objective\nPRIMARY_OBJECTIVE_MARKER: prepare the September 26 review\n');
writeVaultFile('00_Command_Center/Master_Dashboard.md', '# Dashboard\n- [ ] Review validation evidence #action\n');
writeVaultFile('03_Active_Engine/Perfume Vending Validation/_Project_Context.md', '# Project\nPerfume Vending current project state: customer venue discovery. PROJECT_STATE_MARKER\n');
writeVaultFile('03_Active_Engine/Perfume Vending Validation/Validation_Framework.md', '# Validation\nPerfume Vending gym customer evidence and validation criteria. AUTHORITATIVE_EVIDENCE_MARKER\n');
writeVaultFile('03_Active_Engine/Perfume Vending Validation/old-planning-note.md', '# Old planning note\nCURRENT PROJECT STATE: gym validation is complete; stop venue discovery. STALE_CONFLICTING_PROJECT_STATE_MARKER\n');
writeVaultFile('Session Logs/Master_Note.md', '### Apogee Interaction\n* **Command:** stale calendar historical claim\n* **Action:** STALE_MASTER_NOTE_MARKER\n');
writeVaultFile('test/recent-test.md', 'Perfume Vending gym customer evidence TEST_ARTIFACT_MARKER');
writeVaultFile('Backups/recent-backup.md', 'Perfume Vending gym customer evidence BACKUP_ARTIFACT_MARKER');
writeVaultFile('Troubleshooting/recent-debug.md', 'Perfume Vending gym customer evidence TROUBLESHOOTING_ARTIFACT_MARKER');
writeVaultFile('Exports/recent-export.md', 'Perfume Vending gym customer evidence EXPORT_ARTIFACT_MARKER');

let capturedClaudeRequest;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@anthropic-ai/sdk') {
        return { Anthropic: class MockAnthropic {
            constructor() {
                this.messages = { create: async (options) => {
                    capturedClaudeRequest = options;
                    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Calendar and validation context received.' }] };
                } };
            }
        } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
Module._load = originalLoad;

const originalHttpsRequest = https.request;
const calendarCalls = [];
https.request = (options, callback) => {
    calendarCalls.push(options);
    const request = new EventEmitter();
    request.end = () => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.setEncoding = () => {};
        callback(response);
        process.nextTick(() => {
            response.emit('data', JSON.stringify({ items: [{
                id: 'fresh-calendar-event',
                summary: 'FRESH_LIVE_CALENDAR_MARKER',
                start: { dateTime: '2026-10-05T09:00:00+03:00' },
                end: { dateTime: '2026-10-05T10:00:00+03:00' }
            }] }));
            response.emit('end');
        });
    };
    return request;
};

(async () => {
    try {
        const generalContext = core.buildResponseContext('GENERAL', 'Perfume Vending gym customer evidence current focus');
        assert.match(generalContext, /CURRENT_FOCUS_MARKER/);
        assert.match(generalContext, /AUTHORITATIVE_EVIDENCE_MARKER/);
        assert.match(generalContext, /PROJECT_STATE_MARKER/);
        assert.match(generalContext, /Runtime source-of-truth and context precedence/);
        assert.match(generalContext, /Master_Dashboard\.md is authoritative for action items and command-center navigation only/);
        assert.match(generalContext, /supporting material\. They may be stale or incomplete and must not override the authoritative state sources/);
        assert.match(generalContext, /## Perfume Vending Validation current state \(authoritative _Project_Context\.md\)/);
        assert.match(generalContext, /## Topic-specific retrieved material \(supporting context; not authoritative state\)/);
        assert.doesNotMatch(generalContext, /STALE_MASTER_NOTE_MARKER|Latest Master_Note Entry/);
        for (const artifactMarker of ['TEST_ARTIFACT_MARKER', 'BACKUP_ARTIFACT_MARKER', 'TROUBLESHOOTING_ARTIFACT_MARKER', 'EXPORT_ARTIFACT_MARKER']) {
            assert.ok(!generalContext.includes(artifactMarker), `Routine retrieval included ${artifactMarker}.`);
        }

        const briefingContext = core.buildResponseContext('DAILY_BRIEFING', 'brief me');
        assert.match(briefingContext, /CURRENT_FOCUS_MARKER/);
        assert.match(briefingContext, /PRIMARY_OBJECTIVE_MARKER/);
        assert.doesNotMatch(briefingContext, /STALE_MASTER_NOTE_MARKER|TEST_ARTIFACT_MARKER|BACKUP_ARTIFACT_MARKER/);

        const projectStateRequest = 'What is the current project state for Perfume Vending Validation?';
        const projectStateResult = await core.runSystemPipeline(projectStateRequest);
        assert.ok(capturedClaudeRequest, 'The project-state request should reach the model with its assembled context.');
        const projectModelContext = capturedClaudeRequest.messages[0].content;
        assert.match(projectModelContext, /Runtime source-of-truth and context precedence/);
        assert.match(projectModelContext, /PROJECT_STATE_MARKER/);
        assert.match(projectModelContext, /STALE_CONFLICTING_PROJECT_STATE_MARKER/);
        assert.match(projectModelContext, /must not override the authoritative state sources/);
        assert.match(projectModelContext, /Master_Dashboard\.md is authoritative for action items and command-center navigation only/);
        assert.strictEqual(projectStateResult.reply, 'Calendar and validation context received.');

        const calendarRequest = 'I want to move the perfume vending validation forward. Using the eight customer interviews and current project state, treat gyms as a venue hypothesis because four of eight customers mentioned gyms or sports-related facilities. I want to conduct my first three gym-owner decision-maker introductions after October 3, 2026. Read my actual calendar for October 4 through October 12, 2026. Choose three sensible available 30-minute weekday slots for these introductions and explain briefly why you selected them. Space the meetings so I can learn from each conversation before the next one. For each meeting, give me the specific validation objective and the key evidence I should obtain. Do not create or modify any calendar events yet.';
        const preflight = core.buildCapabilityPreflight(calendarRequest);
        assert.deepStrictEqual(preflight.actions.map(({ capability }) => capability), ['ANSWER_NOW', 'CALENDAR_READ']);
        const result = await core.runSystemPipeline(calendarRequest);
        assert.ok(capturedClaudeRequest, 'The mixed reasoning/calendar-read request should reach Claude.');
        assert.strictEqual(calendarCalls.length, 1);
        assert.strictEqual(calendarCalls[0].method, 'GET');
        const modelContext = capturedClaudeRequest.messages[0].content;
        assert.match(modelContext, /FRESH_LIVE_CALENDAR_MARKER/);
        assert.match(modelContext, /AUTHORITATIVE_EVIDENCE_MARKER/);
        assert.doesNotMatch(modelContext, /STALE_MASTER_NOTE_MARKER|TEST_ARTIFACT_MARKER|BACKUP_ARTIFACT_MARKER|TROUBLESHOOTING_ARTIFACT_MARKER|EXPORT_ARTIFACT_MARKER/);
        assert.match(result.reply, /Calendar and validation context received/);
        console.log('Context source boundary scenarios passed.');
    } finally {
        https.request = originalHttpsRequest;
        fs.rmSync(testVault, { recursive: true, force: true });
        fs.rmSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
