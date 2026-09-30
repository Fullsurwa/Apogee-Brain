const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.APOGEE_TEST_MODE = '1';
const testVault = path.join(os.tmpdir(), `apogee-current-focus-test-${Date.now()}`);
const commandCenter = path.join(testVault, '00_Command_Center');
const nowPath = path.join(commandCenter, 'Now.md');
fs.mkdirSync(commandCenter, { recursive: true });
const originalNow = `# Now\n\n## Current focus\n- Old focus one\n- Old focus two\n\n## Next actions\n- Preserve this next action.\n\n## Working notes\n- Preserve this working note.\n`;
fs.writeFileSync(nowPath, originalNow, 'utf8');
process.env.APOGEE_VAULT_PATH = testVault;

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
const request = 'Update the current focus to prepare the functional review';
assert.deepStrictEqual(core.classifyRequestedActions(request).map(({ capability }) => capability), ['CURRENT_FOCUS_UPDATE']);
assert.deepStrictEqual(core.parseCurrentFocusUpdateRequest(request), { focus: 'prepare the functional review' });
const preflight = core.buildCapabilityPreflight(request);
assert.deepStrictEqual(preflight.actions.map(({ capability }) => capability), ['CURRENT_FOCUS_UPDATE']);
assert.deepStrictEqual(preflight.handoffs, []);
assert.strictEqual(preflight.answerNowTranscript, '');
assert.strictEqual(core.parseCurrentFocusUpdateRequest('set the current focus to '), null);
assert.strictEqual(core.parseCurrentFocusUpdateRequest('set the current focus to first line\nsecond line'), null);
assert.strictEqual(core.updateCurrentFocus('').ok, false);
assert.strictEqual(core.updateCurrentFocus('first line\nsecond line').ok, false);

(async () => {
    const claudeBefore = core.providerCallCounts.claude;
    const ollamaBefore = core.providerCallCounts.ollama;
    const result = await core.runSystemPipeline(request);
    assert.strictEqual(result.operationalMode, 'Deterministic Current Focus Update');
    assert.strictEqual(result.currentFocusUpdate.verified, true);
    assert.match(result.reply, /current focus updated and verified/i);
    const written = fs.readFileSync(nowPath, 'utf8');
    assert.match(written, /## Current focus\n- prepare the functional review\n/);
    assert.strictEqual(written.slice(written.indexOf('## Next actions')), originalNow.slice(originalNow.indexOf('## Next actions')));
    assert.strictEqual(core.providerCallCounts.claude - claudeBefore, 0);
    assert.strictEqual(core.providerCallCounts.ollama - ollamaBefore, 0);

    const malformedNow = written.replace('## Working notes', '## Notes');
    fs.writeFileSync(nowPath, malformedNow, 'utf8');
    const malformed = core.updateCurrentFocus('A different focus');
    assert.strictEqual(malformed.ok, false);
    assert.strictEqual(fs.readFileSync(nowPath, 'utf8'), malformedNow);
    fs.writeFileSync(nowPath, written, 'utf8');

    const missingPath = nowPath + '.missing';
    fs.renameSync(nowPath, missingPath);
    const missing = core.updateCurrentFocus('A different focus');
    assert.strictEqual(missing.ok, false);
    assert.match(missing.reason, /does not exist/i);
    fs.renameSync(missingPath, nowPath);

    const staleContent = fs.readFileSync(nowPath, 'utf8');
    const originalReadFileSync = fs.readFileSync;
    let nowReads = 0;
    fs.readFileSync = function (filePath, ...args) {
        if (path.resolve(String(filePath)) === path.resolve(nowPath)) {
            nowReads += 1;
            if (nowReads === 2) return staleContent;
        }
        return originalReadFileSync.call(this, filePath, ...args);
    };
    let unverified;
    try {
        unverified = await core.runSystemPipeline('Change the current focus to an unverified test value');
    } finally {
        fs.readFileSync = originalReadFileSync;
    }
    assert.strictEqual(nowReads, 2);
    assert.strictEqual(unverified.currentFocusUpdate.ok, false);
    assert.match(unverified.reply, /update failed/i);
    assert.doesNotMatch(unverified.reply, /updated and verified/i);
    assert.strictEqual(core.providerCallCounts.claude - claudeBefore, 0);
    assert.strictEqual(core.providerCallCounts.ollama - ollamaBefore, 0);

    const memoryPath = path.join(testVault, 'Session Logs', 'apogee_memory.json');
    if (fs.existsSync(memoryPath)) assert.doesNotMatch(fs.readFileSync(memoryPath, 'utf8'), /current_focus/i);
    console.log('Current focus update scenarios passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
