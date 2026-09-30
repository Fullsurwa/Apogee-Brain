const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
const testVault = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-calendar-read-'));
process.env.APOGEE_VAULT_PATH = testVault;
process.env.GOOGLE_CALENDAR_TOKEN_PATH = path.join(os.tmpdir(), `apogee-calendar-read-token-${Date.now()}.json`);
fs.writeFileSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, JSON.stringify({
    access_token: 'test-access-token',
    scopes: ['https://www.googleapis.com/auth/calendar.events']
}), 'utf8');

const {
    buildCapabilityPreflight,
    classifyRequestedActions,
    findCalendarExecution,
    parseCalendarReadRequest,
    providerCallCounts,
    runSystemPipeline
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const exactRequest = 'Check my actual Google Calendar for October 4–12, 2026. This is a read-only request. Tell me the actual events already scheduled during that period and identify genuinely open windows suitable for three 30-minute gym-owner introduction meetings. Do not create, modify, or delete any calendar events.';

const originalRequest = https.request;
const calls = [];
const responseBody = {
    items: [
        {
            id: 'busy-monday',
            summary: 'Busy Monday meeting',
            start: { dateTime: '2026-10-05T09:00:00+03:00' },
            end: { dateTime: '2026-10-05T10:00:00+03:00' }
        },
        {
            id: 'busy-tuesday',
            summary: 'Busy Tuesday block',
            start: { dateTime: '2026-10-06T09:00:00+03:00' },
            end: { dateTime: '2026-10-06T16:45:00+03:00' }
        }
    ]
};

https.request = (options, callback) => {
    calls.push({ options, body: '' });
    const request = new EventEmitter();
    request.write = (chunk) => { calls[calls.length - 1].body += chunk; };
    request.end = () => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.setEncoding = () => {};
        callback(response);
        process.nextTick(() => {
            response.emit('data', JSON.stringify(responseBody));
            response.emit('end');
        });
    };
    return request;
};

(async () => {
    try {
        assert.deepStrictEqual(parseCalendarReadRequest(exactRequest), {
            startDate: '2026-10-04',
            endDate: '2026-10-12',
            durationMinutes: 30,
            availabilityRequested: true
        });
        assert.deepStrictEqual(parseCalendarReadRequest('Check my actual Google Calendar for October 4-12, 2026. This is a read-only request.'), {
            startDate: '2026-10-04',
            endDate: '2026-10-12',
            durationMinutes: null,
            availabilityRequested: false
        });
        assert.deepStrictEqual(classifyRequestedActions(exactRequest).map(({ capability }) => capability), ['CALENDAR_READ']);
        assert.deepStrictEqual(buildCapabilityPreflight(exactRequest).actions.map(({ capability }) => capability), ['CALENDAR_READ']);
        assert.deepStrictEqual(
            classifyRequestedActions('Check my schedule for October 4 through October 12, 2026').map(({ capability }) => capability),
            ['CALENDAR_READ']
        );
        assert.match(
            parseCalendarReadRequest('Check my calendar from January 1 through March 1, 2026').error,
            /limited to a 31-day range/i
        );

        const memoryPath = path.join(testVault, 'Session Logs', 'apogee_memory.json');
        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        memory.calendar_executions.push({
            originalRequest: 'Schedule Apogee review for September 26 2026 at 2 PM',
            title: 'Apogee review',
            date: '2026-09-26',
            startTime: '14:00',
            timezone: 'Africa/Nairobi',
            status: 'CREATED',
            eventId: 'unrelated-old-event'
        });
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
        assert.strictEqual(findCalendarExecution(exactRequest), null);
        const verifiedPriorEvent = findCalendarExecution('Did Apogee review get created?');
        assert.strictEqual(verifiedPriorEvent.status, 'CREATED');
        assert.strictEqual(verifiedPriorEvent.entry.eventId, 'unrelated-old-event');

        const claudeBefore = providerCallCounts.claude;
        const result = await runSystemPipeline(exactRequest);
        assert.strictEqual(result.operationalMode, 'Google Calendar Read');
        assert.strictEqual(result.calendarRead.ok, true);
        assert.strictEqual(result.calendarRead.events.length, 2);
        assert.match(result.reply, /Busy Monday meeting/);
        assert.match(result.reply, /Busy Tuesday block/);
        assert.match(result.reply, /Africa\/Nairobi/);
        assert.match(result.reply, /Monday-Friday, 09:00-17:00 Africa\/Nairobi/);
        assert.doesNotMatch(result.reply, /Apogee review|unrelated-old-event|event was created/i);

        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].options.method, 'GET');
        assert.strictEqual(calls[0].options.hostname, 'www.googleapis.com');
        const query = new URLSearchParams(calls[0].options.path.split('?')[1]);
        assert.strictEqual(query.get('timeMin'), '2026-10-04T00:00:00+03:00');
        assert.strictEqual(query.get('timeMax'), '2026-10-13T00:00:00+03:00');
        assert.strictEqual(query.get('timeZone'), 'Africa/Nairobi');
        assert.strictEqual(calls[0].body, '');

        assert.ok(result.calendarRead.windows.some((window) => window.date === '2026-10-05' && window.start === '10:00' && window.end === '17:00'));
        assert.strictEqual(result.calendarRead.windows.some((window) => window.date === '2026-10-05' && window.start === '09:00'), false);
        assert.strictEqual(result.calendarRead.windows.some((window) => window.date === '2026-10-06'), false);

        fs.mkdirSync(path.join(testVault, '06_Daily_Rhythms'), { recursive: true });
        fs.writeFileSync(path.join(testVault, '06_Daily_Rhythms', 'Calendar.md'), `# Agenda\n\n## Today\n- Cached today event\n\n## Tomorrow\n- Cached tomorrow event\n`, 'utf8');
        const callsAfterRead = calls.length;
        const todayResult = await runSystemPipeline('Show my calendar today');
        assert.match(todayResult.reply, /Cached today event/);
        const tomorrowResult = await runSystemPipeline('Show my calendar tomorrow');
        assert.match(tomorrowResult.reply, /Cached tomorrow event/);
        assert.strictEqual(calls.length, callsAfterRead);
        assert.strictEqual(providerCallCounts.claude, claudeBefore);
        console.log('Calendar read scenarios passed.');
    } finally {
        https.request = originalRequest;
        fs.rmSync(testVault, { recursive: true, force: true });
        fs.rmSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
