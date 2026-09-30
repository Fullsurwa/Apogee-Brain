const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.APOGEE_TEST_MODE = '1';
const testVault = path.join(os.tmpdir(), `apogee-primary-objective-test-${Date.now()}`);
const dashboardDir = path.join(testVault, '00_Command_Center');
const dashboardPath = path.join(dashboardDir, 'Life_Dashboard.md');
fs.mkdirSync(dashboardDir, { recursive: true });
fs.writeFileSync(dashboardPath, '# Life Dashboard\n\n## Focus\n- **Primary Objective:** Old objective\n\n## Other state\nKeep this readable rundown.\n', 'utf8');
process.env.APOGEE_VAULT_PATH = testVault;

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
const request = 'Change my primary objective to prepare for the September 26 Apogee functional review';
assert.deepStrictEqual(core.parsePrimaryObjectiveUpdateRequest(request), {
    newObjective: 'prepare for the September 26 Apogee functional review'
});
assert.deepStrictEqual(core.classifyRequestedActions(request).map(({ capability }) => capability), ['PRIMARY_OBJECTIVE_UPDATE']);
const preflight = core.buildCapabilityPreflight(request);
assert.deepStrictEqual(preflight.actions.map(({ capability }) => capability), ['PRIMARY_OBJECTIVE_UPDATE']);
assert.deepStrictEqual(preflight.handoffs, []);
assert.strictEqual(preflight.answerNowTranscript, '');
assert.strictEqual(core.parsePrimaryObjectiveUpdateRequest('Change my primary objective to first line\nsecond line'), null);

(async () => {
    const claudeBefore = core.providerCallCounts.claude;
    const ollamaBefore = core.providerCallCounts.ollama;
    const result = await core.runSystemPipeline(request);
    assert.strictEqual(result.operationalMode, 'Deterministic Primary Objective Update');
    assert.strictEqual(result.primaryObjectiveUpdate.verified, true);
    assert.match(result.reply, /updated and verified/i);
    assert.strictEqual(core.providerCallCounts.claude - claudeBefore, 0);
    assert.strictEqual(core.providerCallCounts.ollama - ollamaBefore, 0);
    const written = fs.readFileSync(dashboardPath, 'utf8');
    assert.match(written, /\*\*Primary Objective:\*\* prepare for the September 26 Apogee functional review/);
    assert.match(written, /## Other state\nKeep this readable rundown\./);
    console.log('Primary objective update scenarios passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
