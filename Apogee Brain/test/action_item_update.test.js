const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.APOGEE_TEST_MODE = '1';
const testVault = path.join(os.tmpdir(), `apogee-action-item-test-${Date.now()}`);
const dashboardDir = path.join(testVault, '00_Command_Center');
const dashboardPath = path.join(dashboardDir, 'Master_Dashboard.md');
fs.mkdirSync(dashboardDir, { recursive: true });
const initialDashboard = `# Dashboard\n\n## Active Focus & Action Items\n- [ ] Conduct initial market-friction interviews in target sector #action\n- [x] Review iTax compliance and partnership documentation <!-- [due:: 2026-08-30] #action -->\n\n## Context\nPreserve this unrelated dashboard content.\n`;
fs.writeFileSync(dashboardPath, initialDashboard, 'utf8');
process.env.APOGEE_VAULT_PATH = testVault;

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
const addRequest = 'Add testing Google Calendar integration to my active priorities.';
const completeRequest = 'Mark the market-friction interviews action as complete.';
assert.deepStrictEqual(core.classifyRequestedActions(addRequest).map(({ capability }) => capability), ['ACTION_ITEM_ADD']);
assert.deepStrictEqual(core.classifyRequestedActions(completeRequest).map(({ capability }) => capability), ['ACTION_ITEM_COMPLETE']);
for (const request of [addRequest, completeRequest]) {
    const preflight = core.buildCapabilityPreflight(request);
    assert.deepStrictEqual(preflight.actions.map(({ capability }) => capability), [
        request === addRequest ? 'ACTION_ITEM_ADD' : 'ACTION_ITEM_COMPLETE'
    ]);
    assert.deepStrictEqual(preflight.handoffs, []);
    assert.strictEqual(preflight.answerNowTranscript, '');
}
assert.deepStrictEqual(core.parseActionItemAddRequest(addRequest), { actionText: 'testing Google Calendar integration' });
assert.deepStrictEqual(core.parseActionItemCompleteRequest(completeRequest), { matchText: 'market-friction interviews' });

(async () => {
    const claudeBefore = core.providerCallCounts.claude;
    const ollamaBefore = core.providerCallCounts.ollama;
    const added = await core.runSystemPipeline(addRequest);
    assert.strictEqual(added.actionItem.added, true);
    assert.strictEqual(added.actionItem.verified, true);
    assert.match(added.reply, /added and verified/i);
    const afterAdd = fs.readFileSync(dashboardPath, 'utf8');
    assert.strictEqual((afterAdd.match(/- \[ \] testing Google Calendar integration #action/g) || []).length, 1);
    const duplicate = core.addActionItem('testing Google Calendar integration');
    assert.strictEqual(duplicate.ok, true);
    assert.strictEqual(duplicate.alreadyOpen, true);
    assert.strictEqual((fs.readFileSync(dashboardPath, 'utf8').match(/- \[ \] testing Google Calendar integration #action/g) || []).length, 1);

    const completed = await core.runSystemPipeline(completeRequest);
    assert.strictEqual(completed.actionItem.completed, true);
    assert.strictEqual(completed.actionItem.verified, true);
    assert.match(completed.reply, /marked complete and verified/i);
    let written = fs.readFileSync(dashboardPath, 'utf8');
    assert.match(written, /- \[x\] Conduct initial market-friction interviews in target sector #action/);
    assert.match(written, /Preserve this unrelated dashboard content\./);

    const noMatch = core.completeActionItem('nonexistent matching action');
    assert.strictEqual(noMatch.ok, false);
    assert.match(noMatch.reason, /no matching open action/i);

    const ambiguousPath = path.join(dashboardDir, 'ambiguous.md');
    const ambiguousDashboard = written + '- [ ] Plan market-friction interviews in west region #action\n- [ ] Review market-friction interviews with the team #action\n';
    fs.writeFileSync(dashboardPath, ambiguousDashboard, 'utf8');
    const ambiguous = core.completeActionItem('market-friction interviews');
    assert.strictEqual(ambiguous.ok, false);
    assert.strictEqual(ambiguous.clarificationRequired, true);
    assert.strictEqual(fs.readFileSync(dashboardPath, 'utf8'), ambiguousDashboard);

    const alreadyComplete = core.completeActionItem('iTax compliance and partnership documentation');
    assert.strictEqual(alreadyComplete.ok, true);
    assert.strictEqual(alreadyComplete.alreadyComplete, true);

    fs.renameSync(dashboardPath, ambiguousPath);
    const missing = core.addActionItem('another action item');
    assert.strictEqual(missing.ok, false);
    assert.match(missing.reason, /does not exist/i);
    fs.renameSync(ambiguousPath, dashboardPath);

    assert.strictEqual(core.providerCallCounts.claude - claudeBefore, 0);
    assert.strictEqual(core.providerCallCounts.ollama - ollamaBefore, 0);
    console.log('Action item add/complete scenarios passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
