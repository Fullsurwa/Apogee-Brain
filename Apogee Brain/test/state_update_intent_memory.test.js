const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
const testVault = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-state-intent-'));
const dashboardPath = path.join(testVault, '00_Command_Center', 'Life_Dashboard.md');
const projectPath = path.join(testVault, '03_Active_Engine', 'Perfume Vending Validation', '_Project_Context.md');
fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
fs.mkdirSync(path.dirname(projectPath), { recursive: true });
fs.writeFileSync(dashboardPath, '# Life Dashboard\n\n## Focus\n- **Primary Objective:** Old objective\n\n## Other state\nPreserve this content.\n', 'utf8');
fs.writeFileSync(projectPath, '# Project\n- Name: Perfume Vending Machine\n\n## Current state\n- Old project state.\n\n## Next actions\n- Preserve this action.\n', 'utf8');
process.env.APOGEE_VAULT_PATH = testVault;

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

(async () => {
    try {
        const primaryUpdate = 'Change my primary objective to prepare for the October 1 Apogee review';
        assert.deepStrictEqual(core.classifyRequestedActions(primaryUpdate).map(({ capability }) => capability), ['PRIMARY_OBJECTIVE_UPDATE']);
        const primaryResult = await core.runSystemPipeline(primaryUpdate);
        assert.strictEqual(primaryResult.primaryObjectiveUpdate.verified, true);
        const primaryAfterUpdate = fs.readFileSync(dashboardPath, 'utf8');
        assert.match(primaryAfterUpdate, /\*\*Primary Objective:\*\* prepare for the October 1 Apogee review/);
        assert.match(primaryAfterUpdate, /Preserve this content\./);

        const primaryQuestion = 'Should I change my primary objective to prepare for the October 1 Apogee review?';
        assert.strictEqual(core.parsePrimaryObjectiveUpdateRequest(primaryQuestion), null);
        assert.deepStrictEqual(core.classifyRequestedActions(primaryQuestion).map(({ capability }) => capability), ['CLARIFICATION_REQUIRED']);
        const primaryBeforeQuestion = fs.readFileSync(dashboardPath, 'utf8');
        const providersBeforePrimaryQuestion = { ...core.providerCallCounts };
        const primaryQuestionResult = await core.runSystemPipeline(primaryQuestion);
        assert.strictEqual(fs.readFileSync(dashboardPath, 'utf8'), primaryBeforeQuestion);
        assert.deepStrictEqual(core.providerCallCounts, providersBeforePrimaryQuestion);
        assert.strictEqual(primaryQuestionResult.operationalMode, 'State Update Clarification');
        assert.match(primaryQuestionResult.reply, /have not changed/i);

        for (const modal of ['Can', 'Could', 'May']) {
            const question = `${modal} I change my primary objective to prepare for the October 1 Apogee review?`;
            assert.strictEqual(core.parsePrimaryObjectiveUpdateRequest(question), null);
            assert.deepStrictEqual(core.classifyRequestedActions(question).map(({ capability }) => capability), ['CLARIFICATION_REQUIRED']);
            const before = fs.readFileSync(dashboardPath, 'utf8');
            const providersBefore = { ...core.providerCallCounts };
            const result = await core.runSystemPipeline(question);
            assert.strictEqual(fs.readFileSync(dashboardPath, 'utf8'), before);
            assert.deepStrictEqual(core.providerCallCounts, providersBefore);
            assert.strictEqual(result.operationalMode, 'State Update Clarification');
            assert.match(result.reply, /have not changed/i);
            assert.strictEqual(result.primaryObjectiveUpdate, undefined);
        }

        const projectUpdate = 'Update the current state for Perfume Vending Machine to Gym decision-maker discovery is underway.';
        assert.deepStrictEqual(core.classifyRequestedActions(projectUpdate).map(({ capability }) => capability), ['PROJECT_STATE_UPDATE']);
        const projectResult = await core.runSystemPipeline(projectUpdate);
        assert.strictEqual(projectResult.projectStateUpdate.verified, true);
        const projectAfterUpdate = fs.readFileSync(projectPath, 'utf8');
        assert.match(projectAfterUpdate, /- Gym decision-maker discovery is underway\./);
        assert.match(projectAfterUpdate, /Preserve this action\./);
        let memory = core.readMemoryStore();
        assert.deepStrictEqual(memory.hypotheses, []);
        assert.deepStrictEqual(memory.project_validations, []);

        const projectQuestion = 'Should I update the current state for Perfume Vending Machine to Gym decision-maker discovery is underway?';
        assert.deepStrictEqual(core.classifyRequestedActions(projectQuestion).map(({ capability }) => capability), ['CLARIFICATION_REQUIRED']);
        const projectBeforeQuestion = fs.readFileSync(projectPath, 'utf8');
        const providersBeforeProjectQuestion = { ...core.providerCallCounts };
        const projectQuestionResult = await core.runSystemPipeline(projectQuestion);
        assert.strictEqual(fs.readFileSync(projectPath, 'utf8'), projectBeforeQuestion);
        assert.deepStrictEqual(core.providerCallCounts, providersBeforeProjectQuestion);
        assert.strictEqual(projectQuestionResult.operationalMode, 'State Update Clarification');
        assert.match(projectQuestionResult.reply, /have not changed/i);
        memory = core.readMemoryStore();
        assert.deepStrictEqual(memory.hypotheses, []);
        assert.deepStrictEqual(memory.project_validations, []);

        for (const modal of ['Can', 'Could', 'May']) {
            const question = `${modal} I update the current state for Perfume Vending Machine to Gym decision-maker discovery is underway?`;
            assert.deepStrictEqual(core.classifyRequestedActions(question).map(({ capability }) => capability), ['CLARIFICATION_REQUIRED']);
            const before = fs.readFileSync(projectPath, 'utf8');
            const providersBefore = { ...core.providerCallCounts };
            const result = await core.runSystemPipeline(question);
            assert.strictEqual(fs.readFileSync(projectPath, 'utf8'), before);
            assert.deepStrictEqual(core.providerCallCounts, providersBefore);
            assert.strictEqual(result.operationalMode, 'State Update Clarification');
            assert.match(result.reply, /have not changed/i);
            assert.strictEqual(result.projectStateUpdate, undefined);
        }

        console.log('State update intent and structured-memory scenarios passed.');
    } finally {
        fs.rmSync(testVault, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
