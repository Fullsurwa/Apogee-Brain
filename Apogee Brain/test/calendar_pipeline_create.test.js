const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APOGEE_VAULT_PATH = path.join(os.tmpdir(), `apogee-calendar-pipeline-test-${Date.now()}`);
process.env.GOOGLE_CALENDAR_TOKEN_PATH = path.join(os.tmpdir(), `apogee-calendar-pipeline-token-${Date.now()}.json`);
process.env.GOOGLE_CALENDAR_TIMEZONE = 'Africa/Nairobi';
fs.writeFileSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, JSON.stringify({
    access_token: 'test-access-token',
    scopes: ['https://www.googleapis.com/auth/calendar.events']
}), 'utf8');

const { runSystemPipeline } = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const calls = [];
const originalRequest = https.request;
https.request = (options, callback) => {
    const call = { options, body: '' };
    calls.push(call);
    const response = new EventEmitter();
    response.statusCode = 200;
    response.setEncoding = () => {};
    const request = new EventEmitter();
    request.write = (chunk) => { call.body += chunk; };
    request.end = () => {
        callback(response);
        response.emit('data', JSON.stringify({ id: 'pipeline-event-123' }));
        response.emit('end');
    };
    return request;
};

(async () => {
    try {
        const result = await runSystemPipeline('Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].options.method, 'POST');
        assert.strictEqual(calls[0].options.path, '/calendar/v3/calendars/primary/events');
        const event = JSON.parse(calls[0].body);
        assert.strictEqual(event.summary, 'Family Meeting');
        assert.strictEqual(event.start.dateTime, '2026-09-06T15:00:00');
        assert.strictEqual(event.start.timeZone, 'Africa/Nairobi');
        assert.strictEqual(event.end.dateTime, '2026-09-06T16:00:00');
        assert.strictEqual(event.end.timeZone, 'Africa/Nairobi');
        assert.match(result.reply, /pipeline-event-123/);
        const executions = JSON.parse(fs.readFileSync(path.join(process.env.APOGEE_VAULT_PATH, 'Session Logs', 'apogee_memory.json'), 'utf8')).calendar_executions;
        assert.strictEqual(executions[0].originalRequest, 'Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM');
        assert.strictEqual(executions[0].title, 'Family Meeting');
        assert.strictEqual(executions[0].date, '2026-09-06');
        assert.strictEqual(executions[0].startTime, '15:00');
        assert.strictEqual(executions[0].endTime, '2026-09-06T16:00:00');
        assert.strictEqual(executions[0].timezone, 'Africa/Nairobi');
        assert.strictEqual(executions[0].status, 'CREATED');
        assert.strictEqual(executions[0].eventId, 'pipeline-event-123');
        console.log('Calendar pipeline creation scenario passed.');
    } finally {
        https.request = originalRequest;
        fs.rmSync(process.env.GOOGLE_CALENDAR_TOKEN_PATH, { force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
