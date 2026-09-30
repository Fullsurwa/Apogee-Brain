const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
const testVault = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-interview-analysis-'));
process.env.APOGEE_VAULT_PATH = testVault;

const sourceFramework = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md');
const fixtureFramework = path.join(testVault, '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md');
fs.mkdirSync(path.dirname(fixtureFramework), { recursive: true });
fs.copyFileSync(sourceFramework, fixtureFramework);

let capturedClaudeRequest;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@anthropic-ai/sdk') {
        return {
            Anthropic: class MockAnthropic {
                constructor() {
                    this.messages = {
                        create: async (requestOptions) => {
                            capturedClaudeRequest = requestOptions;
                            return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'The evidence-grounded analysis is ready.' }] };
                        }
                    };
                }
            }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
Module._load = originalLoad;

const request = 'Based on the eight customer interviews and the current perfume vending validation project state, I want to move the validation forward. Treat gyms as a hypothesis, not a conclusion. Create a practical validation plan for interviewing gym decision makers. How many gyms should I approach? What should I ask them? What evidence am I trying to obtain? And what would make us continue, change direction or stop? Do not modify any files yet.';
const preflight = core.buildCapabilityPreflight(request);
assert.deepStrictEqual(preflight.actions, [{ action: request, capability: 'ANSWER_NOW' }]);
assert.strictEqual(preflight.answerNowTranscript, request);
assert.deepStrictEqual(preflight.handoffs, []);
assert.strictEqual(core.isAuthoritativeInterviewEvidenceRequest(request), true);
assert.strictEqual(core.isAuthoritativeInterviewAnalysisRequest(request), true);

const pureExtractionRequest = 'Show me the customer interview evidence you have recorded for the perfume vending validation project.';
assert.strictEqual(core.isAuthoritativeInterviewEvidenceRequest(pureExtractionRequest), true);
assert.strictEqual(core.isAuthoritativeInterviewAnalysisRequest(pureExtractionRequest), false);
assert.ok(core.retrieveAuthoritativeInterviewEvidence(pureExtractionRequest, fixtureFramework));

(async () => {
    const ollamaBefore = core.providerCallCounts.ollama;
    const result = await core.runSystemPipeline(request);

    assert.strictEqual(core.providerCallCounts.ollama, ollamaBefore);
    assert.ok(capturedClaudeRequest);
    const capturedContext = capturedClaudeRequest.messages[0].content;
    const injectedEvidence = capturedContext.slice(capturedContext.indexOf('## Authoritative Customer Interview Evidence'));
    assert.match(capturedContext, /## Authoritative Customer Interview Evidence/);
    assert.match(capturedClaudeRequest.system, /reconcile each item against interview IDs and the authoritative source; do not estimate from memory/);
    assert.match(capturedClaudeRequest.system, /Label customer evidence separately from source interpretation and hypotheses/);
    assert.match(injectedEvidence, /Q6 applies to all interview records: Have you ever wanted to try a fragrance before buying the whole bottle\?/);
    const observedContext = injectedEvidence.match(/## Observed customer evidence\s+([\s\S]*?)(?=\n## Derived observations)/)?.[1];
    assert.ok(observedContext);
    const contextInterviewBlocks = observedContext.split(/(?=^### Customer Interview #\d+)/m).filter((block) => /^### Customer Interview #\d+/m.test(block));
    const sourceFrameworkText = fs.readFileSync(sourceFramework, 'utf8');
    const sourceInterviewBlocks = sourceFrameworkText.match(/### Customer Interview #\d+[\s\S]*?(?=\n### Customer Interview #|\n## 13\. Validation Criteria)/g) || [];
    assert.strictEqual(contextInterviewBlocks.length, 8);
    for (const sourceBlock of sourceInterviewBlocks) {
        const title = sourceBlock.match(/^### Customer Interview #\d+/)?.[0];
        const q6Response = sourceBlock.match(/^6\.\s+(.+)$/m)?.[1]?.trim();
        const contextBlock = contextInterviewBlocks.find((block) => block.includes(title));
        assert.ok(contextBlock, `Missing ${title} from Claude context.`);
        assert.ok(q6Response && contextBlock.includes(q6Response), `Missing Q6 response for ${title} from Claude context.`);
    }
    assert.match(injectedEvidence, /## Evidence status summary from authoritative source\s+## Evidence status/);
    assert.match(injectedEvidence, /Price observations currently include KSh 50, KSh 100, KSh 100\u2013200, and KSh 250/);
    for (const priceObservation of ['250kshs for a spray', 'Splash at 100 KShs', 'Kshs 100 - Kshs (Kenya shillings) 200', '50 kshs']) {
        assert.ok(injectedEvidence.includes(priceObservation), `Missing price observation from Claude context: ${priceObservation}`);
    }
    assert.strictEqual(preflight.handoffs.some((handoff) => /EXTERNAL_RESEARCH/.test(handoff)), false);
    assert.doesNotMatch(result.reply, /EXTERNAL_RESEARCH|External-research handoff|Handoff required/i);
    assert.strictEqual(result.reply, 'The evidence-grounded analysis is ready.');

    const claudeAfterAnalysis = core.providerCallCounts.claude;
    const extractionResult = await core.runSystemPipeline(pureExtractionRequest);
    assert.strictEqual(extractionResult.operationalMode, 'Deterministic Authoritative Evidence');
    assert.strictEqual(core.providerCallCounts.claude, claudeAfterAnalysis);

    fs.rmSync(testVault, { recursive: true, force: true });
    console.log('Authoritative interview analysis pipeline scenarios passed.');
})().catch((error) => {
    fs.rmSync(testVault, { recursive: true, force: true });
    console.error(error);
    process.exitCode = 1;
});
