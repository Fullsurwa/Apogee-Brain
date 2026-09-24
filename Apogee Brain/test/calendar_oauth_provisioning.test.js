const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    CALENDAR_EVENTS_SCOPE,
    validateProvisioningConfiguration,
    buildAuthorizationUrl,
    saveToken,
    openBrowser,
    exchangeAuthorizationCode
} = require('../scripts/provision_google_calendar_oauth.js');

const vaultPath = path.join(os.tmpdir(), `apogee-oauth-vault-${Date.now()}`);
const externalTokenPath = path.join(os.tmpdir(), `apogee-oauth-token-${Date.now()}.json`);
const baseEnvironment = {
    GOOGLE_CALENDAR_CLIENT_ID: 'test-client-id',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALENDAR_TOKEN_PATH: externalTokenPath,
    APOGEE_VAULT_PATH: vaultPath
};

assert.match(validateProvisioningConfiguration({ ...baseEnvironment, GOOGLE_CALENDAR_CLIENT_ID: '' }, vaultPath).reason, /CLIENT_ID/);
assert.match(validateProvisioningConfiguration({ ...baseEnvironment, GOOGLE_CALENDAR_CLIENT_SECRET: '' }, vaultPath).reason, /CLIENT_SECRET/);
assert.match(validateProvisioningConfiguration({ ...baseEnvironment, GOOGLE_CALENDAR_TOKEN_PATH: '' }, vaultPath).reason, /TOKEN_PATH/);
assert.match(validateProvisioningConfiguration({ ...baseEnvironment, GOOGLE_CALENDAR_TOKEN_PATH: path.join(vaultPath, 'token.json') }, vaultPath).reason, /outside the Apogee vault/);
assert.strictEqual(validateProvisioningConfiguration(baseEnvironment, vaultPath).valid, true);

const authorizationUrl = new URL(buildAuthorizationUrl('test-client-id', 'http://localhost:12345/oauth2callback', 'state', 'challenge'));
assert.strictEqual(authorizationUrl.searchParams.get('scope'), CALENDAR_EVENTS_SCOPE);
assert.strictEqual(authorizationUrl.searchParams.get('access_type'), 'offline');
assert.strictEqual(authorizationUrl.searchParams.get('prompt'), 'consent');
assert.strictEqual(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');

const browserUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&redirect_uri=http%3A%2F%2Flocalhost%3A12345%2Foauth2callback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&state=state-with-%26&code_challenge=challenge-with-%26';
let launcherCall;
openBrowser(browserUrl, 'win32', (command, args) => { launcherCall = { command, args }; });
assert.strictEqual(launcherCall.command, 'rundll32.exe');
assert.strictEqual(launcherCall.args[0], 'url.dll,FileProtocolHandler');
assert.strictEqual(launcherCall.args[1], browserUrl);
assert.match(launcherCall.args[1], /&response_type=code&scope=/);
assert.strictEqual(launcherCall.args.filter((argument) => argument === browserUrl).length, 1);

const exchangeRequestMethods = [];
const diagnosticRequest = (options, requestOptions, callback) => {
    exchangeRequestMethods.push(requestOptions.method);
    const response = new EventEmitter();
    response.statusCode = 400;
    response.setEncoding = () => {};
    const request = new EventEmitter();
    request.setHeader = () => {};
    request.write = () => {};
    request.end = () => {
        callback(response);
        response.emit('data', JSON.stringify({
            error: 'invalid_grant',
            error_description: 'test diagnostic',
            access_token: 'redact-me',
            refresh_token: 'redact-me',
            client_secret: 'redact-me'
        }));
        response.emit('end');
    };
    return request;
};

const emptyResponseRequest = (options, requestOptions, callback) => {
    exchangeRequestMethods.push(requestOptions.method);
    const response = new EventEmitter();
    response.statusCode = 400;
    response.setEncoding = () => {};
    const request = new EventEmitter();
    request.setHeader = () => {};
    request.write = () => {};
    request.end = () => {
        callback(response);
        response.emit('end');
    };
    return request;
};

saveToken(externalTokenPath, { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 });
const saved = JSON.parse(fs.readFileSync(externalTokenPath, 'utf8'));
assert.deepStrictEqual(saved.scopes, [CALENDAR_EVENTS_SCOPE]);
assert.strictEqual(saved.access_token, 'access-token');
assert.strictEqual(saved.refresh_token, 'refresh-token');
assert.ok(saved.expiry_date > Date.now());
assert.ok(!path.resolve(externalTokenPath).startsWith(path.resolve(vaultPath)));
fs.unlinkSync(externalTokenPath);

const diagnosticAssertions = [
    exchangeAuthorizationCode(
        { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
        'authorization-code-must-not-appear',
        'http://localhost:12345/oauth2callback',
        'code-verifier-must-not-appear',
        diagnosticRequest
    ).then(() => {
        assert.fail('Expected synthetic JSON token exchange failure.');
    }).catch((error) => {
        assert.match(error.message, /HTTP 400/);
        assert.match(error.message, /invalid_grant/);
        assert.match(error.message, /test diagnostic/);
        assert.doesNotMatch(error.message, /redact-me|authorization-code-must-not-appear|code-verifier-must-not-appear|client_secret/);
    }),
    exchangeAuthorizationCode(
        { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
        'authorization-code-must-not-appear',
        'http://localhost:12345/oauth2callback',
        'code-verifier-must-not-appear',
        emptyResponseRequest
    ).then(() => {
        assert.fail('Expected synthetic empty token exchange failure.');
    }).catch((error) => {
        assert.match(error.message, /HTTP 400/);
        assert.match(error.message, /response_not_valid_json/);
        assert.match(error.message, /response_body_length":0/);
        assert.doesNotMatch(error.message, /authorization-code-must-not-appear|code-verifier-must-not-appear|client_secret|access_token|refresh_token/);
    })
];

assert.deepStrictEqual(exchangeRequestMethods, ['POST', 'POST']);

Promise.all(diagnosticAssertions).then(() => {
    console.log('Calendar OAuth provisioning boundary scenarios passed.');
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
