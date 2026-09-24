const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APOGEE_VAULT_PATH = path.join(os.tmpdir(), `apogee-capability-handoff-test-${Date.now()}`);

const {
    classifyRequestedActions,
    buildCapabilityPreflight,
    buildCapabilityHandoffResponse,
    runSystemPipeline,
    providerCallCounts,
    readHandoffs
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const dashboardRequest = 'Remove the due date from the market-friction interviews in the Master Dashboard';
const dashboardEdit = classifyRequestedActions(dashboardRequest);
assert.deepStrictEqual(dashboardEdit.map(({ capability }) => capability), ['VAULT_EDIT']);
const dashboardResponse = buildCapabilityHandoffResponse(dashboardRequest);
assert.doesNotMatch(dashboardResponse, /already done|done|completed/i);
assert.match(dashboardResponse, /not (?:been|was) made/i);
assert.match(dashboardResponse, /cannot directly modify the vault/i);
assert.match(dashboardResponse, /Builder-agent handoff/i);
assert.match(buildCapabilityPreflight(dashboardRequest).handoffs[0], /Builder-agent handoff/);

assert.deepStrictEqual(
    classifyRequestedActions('Research the perfume vending competitors.').map(({ capability }) => capability),
    ['EXTERNAL_RESEARCH']
);
assert.match(buildCapabilityPreflight('Research the perfume vending competitors.').handoffs[0], /External-research handoff/);

assert.deepStrictEqual(
    classifyRequestedActions('Is M-Pesa reconciliation actually a viable problem to solve?').map(({ capability }) => capability),
    ['ANSWER_NOW']
);

const mixed = classifyRequestedActions('Remove the market-research interview due date from the Master Dashboard and is M-Pesa reconciliation actually a viable problem to solve?');
assert.deepStrictEqual(mixed.map(({ capability }) => capability), ['VAULT_EDIT', 'ANSWER_NOW']);
const mixedPreflight = buildCapabilityPreflight('Remove the market-research interview due date from the Master Dashboard and is M-Pesa reconciliation actually a viable problem to solve?');
assert.strictEqual(mixedPreflight.answerNowTranscript, 'is M-Pesa reconciliation actually a viable problem to solve?');
assert.match(mixedPreflight.handoffs[0], /Builder-agent handoff/);

const deferred = buildCapabilityPreflight('Research this and come back when you are finished.');
assert.deepStrictEqual(deferred.actions.map(({ capability }) => capability), ['EXTERNAL_RESEARCH', 'BACKGROUND_TASK']);
assert.match(deferred.handoffs.join('\n'), /External-research handoff/);
assert.match(deferred.handoffs.join('\n'), /no background executor/i);

(async () => {
    const claudeCallsBefore = providerCallCounts.claude;
    const ollamaCallsBefore = providerCallCounts.ollama;
    const productionResult = await runSystemPipeline(dashboardRequest);
    assert.strictEqual(providerCallCounts.claude - claudeCallsBefore, 0);
    assert.strictEqual(providerCallCounts.ollama - ollamaCallsBefore, 0);
    assert.match(productionResult.reply, /(?:was not made|has not been made)/i);
    assert.match(productionResult.reply, /Handoff created:/i);
    assert.match(productionResult.reply, /Handoff created:/i);
    assert.strictEqual(productionResult.operationalMode, 'Handoff Required');
    const vaultHandoff = readHandoffs().find((handoff) => handoff.originalRequest === dashboardRequest);
    assert.ok(vaultHandoff);
    assert.match(vaultHandoff.id, /^HO-/);
    assert.strictEqual(vaultHandoff.actionType, 'VAULT_EDIT');
    assert.strictEqual(vaultHandoff.status, 'PENDING');
    assert.strictEqual(vaultHandoff.completedTimestamp, null);
    assert.ok(vaultHandoff.createdTimestamp);
    assert.ok(vaultHandoff.handoffPrompt);
    assert.strictEqual(vaultHandoff.resultEvidence, null);

    const researchRequest = 'Research the perfume vending competitors.';
    await runSystemPipeline(researchRequest);
    const researchHandoff = readHandoffs().find((handoff) => handoff.originalRequest === researchRequest);
    assert.ok(researchHandoff);
    assert.notStrictEqual(vaultHandoff.id, researchHandoff.id);
    assert.strictEqual(researchHandoff.actionType, 'EXTERNAL_RESEARCH');

    const completedResult = await runSystemPipeline(`Handoff result: ${vaultHandoff.id}: Builder removed the due date in the specified line.`);
    assert.match(completedResult.reply, new RegExp(vaultHandoff.id));
    assert.match(completedResult.reply, /Builder removed the due date/);
    assert.match(completedResult.reply, /not independently validated/i);
    const completedVaultHandoff = readHandoffs().find((handoff) => handoff.id === vaultHandoff.id);
    assert.strictEqual(completedVaultHandoff.status, 'COMPLETED');
    assert.strictEqual(completedVaultHandoff.resultEvidence, 'Builder removed the due date in the specified line.');
    assert.ok(completedVaultHandoff.completedTimestamp);

    const failedResult = await runSystemPipeline(`Handoff result: ${researchHandoff.id}: FAILED - external sources were unavailable.`);
    assert.match(failedResult.reply, /FAILED/);
    assert.strictEqual(readHandoffs().find((handoff) => handoff.id === researchHandoff.id).status, 'FAILED');

    const pendingResult = await runSystemPipeline('What handoffs are pending?');
    assert.match(pendingResult.reply, /No pending handoffs\./);
    const missingResult = await runSystemPipeline('Handoff result: HO-missing: nothing was returned.');
    assert.match(missingResult.reply, /No handoff found with ID HO-missing/);

    const answerNowResult = await runSystemPipeline('calculate 2 + 2');
    assert.match(answerNowResult.reply, /Calculation: 4/);

    const wrapperPath = path.resolve(__dirname, '..', 'apogee_agent_summary.ps1');
    const wrapperHandoffsPath = path.join(os.tmpdir(), `apogee-wrapper-handoffs-${Date.now()}.json`);
    const wrapperResponse = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath], {
        env: { ...process.env, APOGEE_TEST_MODE: '1', APOGEE_TEST_QUERY: dashboardRequest, APOGEE_HANDOFFS_PATH: wrapperHandoffsPath },
        encoding: 'utf8'
    });
    assert.match(wrapperResponse, /not (?:been|was) made/i);
    assert.match(wrapperResponse, /cannot directly modify the vault/i);
    assert.match(wrapperResponse, /Builder-agent handoff \(VAULT_EDIT\)/i);
    assert.doesNotMatch(wrapperResponse, /already done|done|completed/i);
    const wrapperHandoffId = wrapperResponse.match(/Handoff ID:\s*(HO-[A-Za-z0-9-]+)/i)?.[1];
    assert.ok(wrapperHandoffId);
    const wrapperRecords = JSON.parse(fs.readFileSync(wrapperHandoffsPath, 'utf8'));
    assert.strictEqual(wrapperRecords.find((handoff) => handoff.id === wrapperHandoffId).status, 'PENDING');
    const wrapperResult = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapperPath], {
        env: { ...process.env, APOGEE_TEST_MODE: '1', APOGEE_TEST_QUERY: `Handoff result: ${wrapperHandoffId}: Builder confirms the requested line was updated.`, APOGEE_HANDOFFS_PATH: wrapperHandoffsPath },
        encoding: 'utf8'
    });
    assert.match(wrapperResult, /Status: COMPLETED/i);
    assert.match(wrapperResult, /not independently validated/i);
    console.log('Capability handoff scenarios passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



