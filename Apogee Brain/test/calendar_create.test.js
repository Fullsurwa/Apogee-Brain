const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APOGEE_VAULT_PATH = path.join(os.tmpdir(), `apogee-calendar-test-${Date.now()}`);
const externalTokenPath = path.join(os.tmpdir(), `apogee-google-calendar-token-${Date.now()}.json`);
process.env.GOOGLE_CALENDAR_TOKEN_PATH = externalTokenPath;
delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

const {
    classifyRequestedActions,
    parseCalendarCreateRequest,
    createGoogleCalendarEvent,
    validateGoogleCalendarConfiguration,
    runSystemPipeline,
    providerCallCounts,
    readHandoffs
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const completeResponse = (statusCode, body) => {
    const response = new EventEmitter();
    response.statusCode = statusCode;
    response.setEncoding = () => {};
    process.nextTick(() => {
        response.emit('data', JSON.stringify(body));
        response.emit('end');
    });
    return response;
};

const mockRequest = (calls, body) => (options, callback) => {
    calls.push({ options, body: '' });
    const request = new EventEmitter();
    request.write = (chunk) => { calls[calls.length - 1].body += chunk; };
    request.end = () => callback(completeResponse(200, body));
    return request;
};

const calendarScope = 'https://www.googleapis.com/auth/calendar.events';
const writeToken = (tokenPath, token) => fs.writeFileSync(tokenPath, JSON.stringify(token), 'utf8');
const validToken = { access_token: 'test-access-token', scopes: [calendarScope] };

assert.match(validateGoogleCalendarConfiguration(null).reason, /not configured/i);
assert.match(validateGoogleCalendarConfiguration().reason, /token file is missing/i);
assert.match(validateGoogleCalendarConfiguration(path.join(process.env.APOGEE_VAULT_PATH, 'token.json')).reason, /outside the Obsidian vault/i);
const legacyPath = path.join(os.tmpdir(), `legacy-calendar-token-${Date.now()}.json`);
writeToken(legacyPath, { token: 'legacy-token', expiry: '2030-01-01T00:00:00Z', scopes: [calendarScope] });
assert.match(validateGoogleCalendarConfiguration(legacyPath).reason, /legacy|OAuth JSON format/i);
const missingScopePath = path.join(os.tmpdir(), `missing-scope-calendar-token-${Date.now()}.json`);
writeToken(missingScopePath, { access_token: 'test-access-token', scopes: ['https://www.googleapis.com/auth/calendar.readonly'] });
assert.match(validateGoogleCalendarConfiguration(missingScopePath).reason, /missing the required calendar.events scope/i);
writeToken(externalTokenPath, validToken);
assert.strictEqual(validateGoogleCalendarConfiguration().valid, true);

assert.deepStrictEqual(
    classifyRequestedActions('Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM').map(({ capability }) => capability),
    ['CALENDAR_CREATE']
);
const parsed = parseCalendarCreateRequest('Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM');
assert.deepStrictEqual(parsed, {
    title: 'Family Meeting',
    date: '2026-09-06',
    startTime: '15:00',
    durationMinutes: 60,
    location: null,
    description: null
});

const parsedWithDuration = parseCalendarCreateRequest('Schedule Apogee Calendar Integration Test for Sunday, 6 September 2026 at 3:00 PM for 30 minutes');
assert.deepStrictEqual(parsedWithDuration, {
    title: 'Apogee Calendar Integration Test',
    date: '2026-09-06',
    startTime: '15:00',
    durationMinutes: 30,
    location: null,
    description: null
});

(async () => {
    const calls = [];
    const created = await createGoogleCalendarEvent('Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM', mockRequest(calls, { id: 'event-123' }));
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.eventId, 'event-123');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].options.path, '/calendar/v3/calendars/primary/events');
    const eventBody = JSON.parse(calls[0].body);
    assert.strictEqual(eventBody.summary, 'Family Meeting');
    assert.strictEqual(eventBody.start.dateTime, '2026-09-06T15:00:00');
    fs.unlinkSync(externalTokenPath);

    const missingBefore = { ...providerCallCounts };
    const missing = await runSystemPipeline('Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM');
    assert.match(missing.reply, /calendar event was not created/i);
    assert.match(missing.reply, /calendar event was not created/i);
    assert.deepStrictEqual(providerCallCounts, missingBefore);
    assert.ok(readHandoffs().some((handoff) => handoff.actionType === 'CALENDAR_CREATE' && handoff.status === 'PENDING'));
    const failedExecutions = JSON.parse(fs.readFileSync(path.join(process.env.APOGEE_VAULT_PATH, 'Session Logs', 'apogee_memory.json'), 'utf8')).calendar_executions;
    assert.strictEqual(failedExecutions[0].originalRequest, 'Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM');
    assert.strictEqual(failedExecutions[0].title, 'Family Meeting');
    assert.strictEqual(failedExecutions[0].date, '2026-09-06');
    assert.strictEqual(failedExecutions[0].startTime, '15:00');
    assert.strictEqual(failedExecutions[0].endTime, '2026-09-06T16:00:00');
    assert.strictEqual(failedExecutions[0].timezone, 'Africa/Nairobi');
    assert.strictEqual(failedExecutions[0].status, 'FAILED');
    assert.match(failedExecutions[0].reason, /not configured|authenticated|token file is missing/i);

    const ambiguousBefore = { ...providerCallCounts };
    const ambiguous = await runSystemPipeline('Schedule a family meeting Sunday at 3 PM');
    assert.match(ambiguous.reply, /unambiguous calendar date/i);
    assert.deepStrictEqual(providerCallCounts, ambiguousBefore);

    console.log('Calendar creation scenarios passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
