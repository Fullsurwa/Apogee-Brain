const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';

const {
    isAuthoritativeInterviewEvidenceRequest,
    retrieveAuthoritativeInterviewEvidence
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const sourcePath = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md');
const framework = fs.readFileSync(sourcePath, 'utf8');
const interviewBlocks = framework.match(/### Customer Interview #\d+[\s\S]*?(?=\n### Customer Interview #|\n## 13\. Validation Criteria)/g) || [];
const interviewTitles = interviewBlocks.map((block) => block.match(/^### Customer Interview #\d+/)?.[0]);
const customer004Answers = [
    '1. **Yes**',
    '2. **A random meet up that required showing up proper after already exhausting the day**',
    '3. **Showered**',
    '4. **Not really big, but its a difficult feeling to shake off knowing you aren\'t at your best**',
    '5. **Yes**',
    '6. **Most definitely, i have to choose what smells I like, its not about the brand or amount, its what I find appeasing.**'
];
const evidenceRequest = 'What have we learned from the customer interviews?';
const questionRequest = 'Do you have a record of the customer interview questions? Show me the questions only.';
const evidence = retrieveAuthoritativeInterviewEvidence(evidenceRequest);

assert.strictEqual(isAuthoritativeInterviewEvidenceRequest(evidenceRequest), true);
assert.strictEqual(isAuthoritativeInterviewEvidenceRequest(questionRequest), false);
assert.ok(evidence);
assert.strictEqual(evidence.operationalMode, 'Deterministic Authoritative Evidence');
assert.match(evidence.reply, new RegExp(`Customer interviews recorded in authoritative source: ${interviewBlocks.length}\\.`));
for (const title of interviewTitles) assert.match(evidence.reply, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(evidence.reply, /Has ever wished they had perfume\/fragrance when they didn't\? \*\*NO\.\*\*/);
assert.match(evidence.reply, /make sure I had deodorant/i);
assert.match(evidence.reply, /always test first/i);
for (const answer of customer004Answers) assert.ok(evidence.reply.includes(answer), `Missing Customer #004 raw answer: ${answer}`);
assert.match(evidence.reply, /7-12\. \*\*Not answered\.\*\*/);
assert.match(evidence.reply, /Derived observations \(source interpretation\)/);
assert.match(evidence.reply, /Validation status recorded in source/);
assert.match(evidence.reply, /Open follow-up questions \(not findings\)/);
assert.doesNotMatch(evidence.reply, /completed two interviews/i);

const rawEvidenceStart = evidence.reply.indexOf('## Observed customer evidence');
const observedEvidenceEnd = evidence.reply.indexOf('Derived observations (source interpretation)');
const validationStatusStart = evidence.reply.indexOf('## Validation status recorded in source');
const followUpSection = evidence.reply.indexOf('Open follow-up questions (not findings)');
assert.ok(rawEvidenceStart > -1 && observedEvidenceEnd > rawEvidenceStart);
assert.ok(validationStatusStart > observedEvidenceEnd && followUpSection > validationStatusStart);
assert.ok(evidence.reply.indexOf('Does the emergency\/fragrance problem recur', observedEvidenceEnd) > -1);

const customer003Raw = evidence.reply.slice(rawEvidenceStart, observedEvidenceEnd);
assert.match(customer003Raw, /Customer Interview #003/);
assert.match(customer003Raw, /always test first/i);
assert.match(customer003Raw, /Good idea\.\.\.\. seems costly to manage/);
assert.match(customer003Raw, /Long lasting top end fragrances\.\.\./);
assert.doesNotMatch(customer003Raw, /## Derived observations|## Validation status|## Open follow-up questions/);
assert.doesNotMatch(evidence.reply.slice(observedEvidenceEnd, validationStatusStart), /Good idea\.\.\.\. seems costly to manage/);
assert.doesNotMatch(evidence.reply.slice(validationStatusStart, followUpSection), /Good idea\.\.\.\. seems costly to manage/);

console.log('Authoritative interview evidence scenarios passed.');
