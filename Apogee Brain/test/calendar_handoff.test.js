const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const Module = require('module');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APOGEE_VAULT_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-calendar-handoff-'));
process.env.GOOGLE_CALENDAR_TOKEN_PATH = path.join(os.tmpdir(), `apogee-calendar-handoff-token-${Date.now()}.json`);
process.env.GOOGLE_CALENDAR_TIMEZONE = 'Africa/Nairobi';
fs.writeFileSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, JSON.stringify({
    access_token: 'test-access-token',
    scopes: ['https://www.googleapis.com/auth/calendar.events']
}), 'utf8');

let mockedClaudeReply = '';
let mockedClaudeCalls = 0;
let lastClaudePrompt = '';
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@anthropic-ai/sdk') {
        return { Anthropic: class MockAnthropic {
            constructor() {
                this.messages = { create: async ({ messages }) => {
                    mockedClaudeCalls++;
                    lastClaudePrompt = messages?.[0]?.content || '';
                    return { stop_reason: 'end_turn', content: [{ type: 'text', text: mockedClaudeReply }] };
                } };
            }
        } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const {
    parseCalendarProposalSlot,
    getPendingCalendarPlan,
    isAffirmativeCalendarPlanExecution,
    classifyRequestedActions,
    buildCapabilityPreflight,
    runSystemPipeline,
    providerCallCounts
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
Module._load = originalLoad;

const calls = [];
const originalRequest = https.request;
function mockCalendarApi(failIndexes = []) {
    calls.length = 0;
    https.request = (options, callback) => {
        const call = { options, body: '' };
        calls.push(call);
        const request = new EventEmitter();
        request.write = (chunk) => { call.body += chunk; };
        request.end = () => {
            const response = new EventEmitter();
            response.statusCode = failIndexes.includes(calls.length - 1) ? 500 : 200;
            response.setEncoding = () => {};
            callback(response);
            process.nextTick(() => {
                const posted = JSON.parse(call.body || '{}');
                response.emit('data', JSON.stringify(response.statusCode === 200
                    ? { id: `event-${calls.length}`, summary: posted.summary, start: posted.start, end: posted.end, reminders: posted.reminders }
                    : { error: { message: 'mock event failure' } }));
                response.emit('end');
            });
        };
        return request;
    };
}

(async () => {
    try {
        const planningRequest = 'I want to move the perfume vending validation forward. Using the eight customer interviews and current project state, treat gyms as a venue hypothesis because four of eight customers mentioned gyms or sports-related facilities. I want to conduct my first three gym-owner decision-maker introductions after October 3, 2026. Read my actual calendar for October 4â€“12, 2026. Choose three sensible available 30-minute weekday slots for these introductions and explain briefly why you selected them. Space the meetings so I can learn from each conversation before the next one. For each meeting, give me the specific validation objective and the key evidence I should obtain. Do not create or modify any calendar events yet. Do not modify any project files. Do not invent gym names or pretend any owner has confirmed a meeting.';
        const proposedReply = [
            'Proposed three gym-owner introduction slots:',
            '- Monday Oct 5, 10:00â€“10:45',
            '- Wednesday Oct 7, 14:00â€“14:45',
            '- Friday Oct 9, 10:00â€“10:45',
            'Nothing is booked. Say the word and I will create these.'
        ].join('\n');
        for (const [line, expectedDate] of [['Monday Oct 5, 10:00â€“10:45', '2026-10-05'], ['Wednesday Oct 7, 14:00â€“14:45', '2026-10-07'], ['Friday Oct 9, 10:00â€“10:45', '2026-10-09']]) {
            assert.strictEqual(parseCalendarProposalSlot(line, 2026).date, expectedDate);
        }
        assert.strictEqual(parseCalendarProposalSlot('Monday Oct 5 at 10:00 AM'), null, 'a year must not be guessed when no request year is supplied');
        assert.deepStrictEqual(classifyRequestedActions(planningRequest).map(({ capability }) => capability), ['CALENDAR_READ']);
        assert.deepStrictEqual(buildCapabilityPreflight(planningRequest).actions.map(({ capability }) => capability), ['ANSWER_NOW', 'CALENDAR_READ']);
        assert.strictEqual(isAffirmativeCalendarPlanExecution(planningRequest), false, 'negative create instructions must not trigger plan execution');
        mockedClaudeReply = proposedReply;
        mockCalendarApi();
        const beforeProposal = calls.length;
        const claudeCallsBeforeProposal = mockedClaudeCalls;
        const proposalResult = await runSystemPipeline(planningRequest);
        assert.strictEqual(mockedClaudeCalls, claudeCallsBeforeProposal + 1, 'the normal reasoning path must produce the proposal');
        assert.strictEqual(providerCallCounts.claude, 1);
        assert.strictEqual(calls.length, beforeProposal + 1, 'the proposal must perform one read-only calendar API call');
        assert.strictEqual(calls[0].options.method, 'GET', 'the proposal calendar call must be read-only');
        assert.ok(calls.every((call) => call.options.method !== 'POST'), 'proposal phase must not create calendar events');
        assert.match(lastClaudePrompt, /## Actual Google Calendar Read/);
        assert.match(lastClaudePrompt, /No events were returned for this date range/);
        const plan = getPendingCalendarPlan();
        assert.ok(plan, 'the production pipeline must store the proposed schedule');
        assert.strictEqual(plan.status, 'PENDING');
        assert.deepStrictEqual(plan.events.map(({ date, startTime, durationMinutes }) => ({ date, startTime, durationMinutes })), [
            { date: '2026-10-05', startTime: '10:00', durationMinutes: 45 },
            { date: '2026-10-07', startTime: '14:00', durationMinutes: 45 },
            { date: '2026-10-09', startTime: '10:00', durationMinutes: 45 }
        ]);
        assert.ok(plan.events.every((event) => event.title.includes('Gym-Owner Introduction')));
        assert.ok(plan.events.every((event) => !event.location && !event.description));
        assert.match(proposalResult.reply, /Nothing is booked/);
        mockCalendarApi();
        const providerCallsBefore = { ...providerCallCounts };
        const followup = 'Yes. Go ahead and schedule the three proposed gym-owner introduction meetings you just selected. Make each meeting exactly 30 minutes.';
        assert.strictEqual(isAffirmativeCalendarPlanExecution(followup), true);
        const batchResult = await runSystemPipeline(followup);
        assert.strictEqual(calls.length, 3, 'each proposed event must be attempted independently');
        const posted = calls.map((call) => JSON.parse(call.body));
        assert.deepStrictEqual(posted.map((event) => event.start.dateTime), [
            '2026-10-05T10:00:00', '2026-10-07T14:00:00', '2026-10-09T10:00:00'
        ]);
        assert.ok(posted.every((event) => event.end.dateTime.endsWith('10:30:00') || event.end.dateTime.endsWith('14:30:00')));
        assert.match(batchResult.reply, /Created 3 of 3 calendar events/);
        assert.match(batchResult.reply, /ID: event-1/);
        assert.match(batchResult.reply, /ID: event-2/);
        assert.match(batchResult.reply, /ID: event-3/);
        assert.match(batchResult.reply, /Perfume Vending Validation - Gym-Owner Introduction #1 at 2026-10-05T10:00:00/);
        assert.strictEqual(getPendingCalendarPlan(), null, 'the plan must be consumed after all attempts');
        assert.deepStrictEqual(providerCallCounts, providerCallsBefore, 'deterministic plan execution must not call Claude or Ollama');

        mockCalendarApi();
        const callsBeforeMissingPlan = calls.length;
        const providersBeforeMissingPlan = { ...providerCallCounts };
        const missingPlan = await runSystemPipeline('Yes. Schedule the three proposed meetings, and add an unrelated appointment on October 3, 2026 at 8:00 AM.');
        assert.match(missingPlan.reply, /do not have a pending proposed calendar schedule/i);
        assert.strictEqual(missingPlan.operationalMode, 'No Pending Calendar Plan');
        assert.strictEqual(calls.length, callsBeforeMissingPlan, 'missing plans must not reach Google Calendar or single-event creation');
        assert.deepStrictEqual(providerCallCounts, providersBeforeMissingPlan, 'the missing-plan response must be deterministic');

        const octoberThirdRequest = 'Schedule Wake-up reminder - take my wife to Karen for the invited walk on October 3, 2026 at 6:30 AM and schedule Suit measurements with JJ at Sir George\'s Suites on October 3, 2026 at 8:00 AM';
        const octoberThirdActions = classifyRequestedActions(octoberThirdRequest);
        assert.deepStrictEqual(octoberThirdActions.map(({ capability }) => capability), ['CALENDAR_CREATE', 'CALENDAR_CREATE']);
        mockCalendarApi();
        const octoberThirdResult = await runSystemPipeline(octoberThirdRequest);
        assert.strictEqual(calls.length, 2);
        const octoberThirdEvents = calls.map((call) => JSON.parse(call.body));
        assert.strictEqual(octoberThirdEvents[0].summary, 'Wake-up reminder - take my wife to Karen for the invited walk');
        assert.strictEqual(octoberThirdEvents[0].start.dateTime, '2026-10-03T06:30:00');
        assert.match(octoberThirdEvents[1].summary, /Suit measurements with JJ at Sir George's Suites/);
        assert.strictEqual(octoberThirdEvents[1].location, "Sir George's Suites");
        assert.strictEqual(octoberThirdEvents[1].start.dateTime, '2026-10-03T08:00:00');
        assert.ok(octoberThirdEvents.every((event) => !event.attendees));
        assert.match(octoberThirdResult.reply, /Created 2 of 2 calendar events/);

        console.log('Calendar handoff scenarios passed.');
    } finally {
        https.request = originalRequest;
        fs.rmSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, { force: true });
        fs.rmSync(process.env.APOGEE_VAULT_PATH, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


