const assert = require('assert');
const { runSystemPipeline, providerCallCounts } = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

(async () => {
    const beforeClaude = providerCallCounts.claude;
    const beforeOllama = providerCallCounts.ollama;

    const result = await runSystemPipeline(
        'I have a case for a company that is employing AI and I need help solving it.'
    );

    assert.strictEqual(result.operationalMode, 'AI Governance Orchestration');
    assert.strictEqual(result.orchestration.domain, 'AI_GOVERNANCE');
    assert.strictEqual(result.orchestration.operation, 'PREPARE_CLIENT_BRIEF');
    assert.strictEqual(result.orchestration.execute, false);
    assert.strictEqual(result.orchestration.clientBrief.stage, 'CLIENT_BRIEF');
    assert.ok(result.orchestration.clientBrief.currentUnderstanding.includes('AI-related case'));
    assert.ok(!result.orchestration.clientBrief.currentUnderstanding.includes('# Now'));
    assert.ok(result.orchestration.clientBrief.unknowns.includes('specific AI system'));
    assert.strictEqual(providerCallCounts.claude, beforeClaude);
    assert.strictEqual(providerCallCounts.ollama, beforeOllama);

    console.log('Runtime orchestration integration contract passed.');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});



