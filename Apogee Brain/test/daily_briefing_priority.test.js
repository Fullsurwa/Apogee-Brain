const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
const testVault = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-briefing-priority-'));
process.env.APOGEE_VAULT_PATH = testVault;
process.env.GOOGLE_CALENDAR_TOKEN_PATH = path.join(os.tmpdir(), `apogee-briefing-token-${Date.now()}.json`);
fs.writeFileSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, JSON.stringify({
    access_token: 'test-access-token',
    scopes: ['https://www.googleapis.com/auth/calendar.events']
}), 'utf8');

function writeVaultFile(relativePath, content) {
    const filePath = path.join(testVault, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

writeVaultFile('00_Command_Center/Now.md', '# Now\n## Current focus\nCURRENT_FOCUS_MARKER: testing persistent state\n\n## Next actions\n- verify state boundaries\n');
writeVaultFile('00_Command_Center/Life_Dashboard.md', '# Life\n## Primary Objective\nPRIMARY_OBJECTIVE_MARKER: prepare the October implementation review\n');
writeVaultFile('00_Command_Center/Master_Dashboard.md', '# Dashboard\n## Active Focus & Action Items\n- [ ] OPEN_ACTION_MARKER: conduct initial market-friction interviews\n- [x] COMPLETED_ACTION_MARKER: verify the Action Item capability\n');
writeVaultFile('06_Daily_Rhythms/Calendar.md', '# Calendar\nNo calendar read was performed for October 4–12.\n');
writeVaultFile('Session Logs/apogee_memory.json', JSON.stringify({
    facts: [{ claim: 'Current runtime fact marker.' }],
    hypotheses: [{ claim: 'OLD_BLOCKED_CALENDAR_THREAD_MARKER: gym-owner scheduling October 4–12 is blocked.' }],
    lessons: [],
    experiences: [],
    project_validations: [{
        project: 'Gym-owner scheduling',
        status: 'TESTING',
        reason: 'A calendar read has not confirmed available slots.',
        evidence: [{ detail: 'OLD_BLOCKED_CALENDAR_THREAD_MARKER: no authoritative read; no events were created.' }]
    }]
}, null, 2));
writeVaultFile('Session Logs/interaction_history.json', JSON.stringify([{
    query: 'Earlier request about gym-owner scheduling for October 4–12',
    timestamp: '2026-09-29T10:12:49.115Z',
    reply: 'HISTORICAL_BLOCKER_REPLY_MARKER: no authoritative October 4–12 calendar read exists, availability is unknown, and nothing was scheduled.'
}], null, 2));

let capturedClaudeRequest;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@anthropic-ai/sdk') {
        return { Anthropic: class MockAnthropic {
            constructor() {
                this.messages = { create: async (options) => {
                    capturedClaudeRequest = options;
                    const reply = options.messages[0].content.includes('CURRENT_BLOCKER_DEPENDENCY_MARKER')
                        ? 'The current focus depends on an actual October 4–12 calendar read, so that blocker remains relevant.'
                        : 'Briefing based on current focus and open actions; no calendar availability was verified.';
                    return { stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] };
                } };
            }
        } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
Module._load = originalLoad;

(async () => {
    try {
        const genericRequest = 'Hi Apogee. Give me a status update on how it is. We are going to do the pending work that needs to be done. And just give me a brief report on you.';
        const genericResult = await core.runSystemPipeline(genericRequest);
        assert.strictEqual(genericResult.operationalMode, 'Local Mode');
        assert.ok(capturedClaudeRequest, 'The generic status briefing should use the normal response path.');

        const genericContext = capturedClaudeRequest.messages[0].content;
        assert.match(genericContext, /CURRENT_FOCUS_MARKER/);
        assert.match(genericContext, /PRIMARY_OBJECTIVE_MARKER/);
        assert.match(genericContext, /OPEN_ACTION_MARKER/);
        assert.doesNotMatch(genericContext, /OLD_BLOCKED_CALENDAR_THREAD_MARKER|COMPLETED_ACTION_MARKER/);
        assert.match(capturedClaudeRequest.system, /An unresolved item in structured memory or conversation history is not automatically current work/);
        assert.match(capturedClaudeRequest.system, /Never claim that an action was completed/);
        assert.match(genericContext, /A fresh actual Google Calendar API read is authoritative/);

        writeVaultFile('00_Command_Center/Now.md', '# Now\n## Current focus\nCURRENT_BLOCKER_DEPENDENCY_MARKER: obtain an actual October 4–12 calendar read before scheduling gym-owner introductions\n\n## Next actions\n- Review the returned availability\n');
        const dependentContext = core.buildResponseContext('DAILY_BRIEFING', 'brief me');
        assert.match(dependentContext, /CURRENT_BLOCKER_DEPENDENCY_MARKER/,
            'A blocker named in authoritative Current Focus remains visible to the briefing.');
        const dependentBriefing = await core.runSystemPipeline('Give me a status update.');
        assert.match(dependentBriefing.reply, /current focus depends on an actual October 4–12 calendar read/,
            'The reasoning path can surface the blocker when authoritative Current Focus makes it a dependency.');

        const explicitHistoryContext = core.buildResponseContext('GENERAL', 'What happened with gym-owner scheduling?');
        assert.match(explicitHistoryContext, /Requested conversation history/);
        assert.match(explicitHistoryContext, /HISTORICAL_BLOCKER_REPLY_MARKER/);
        assert.match(explicitHistoryContext, /availability is unknown/);
        assert.match(explicitHistoryContext, /nothing was scheduled/);

        console.log('Daily briefing priority scenarios passed.');
    } finally {
        fs.rmSync(testVault, { recursive: true, force: true });
        fs.rmSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
