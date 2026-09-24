require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const https = require('https');

const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function isPathInside(parentPath, candidatePath) {
    const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateProvisioningConfiguration(env = process.env, vaultPath = env.APOGEE_VAULT_PATH || process.cwd()) {
    if (!env.GOOGLE_CALENDAR_CLIENT_ID) return { valid: false, reason: 'GOOGLE_CALENDAR_CLIENT_ID is not configured.' };
    if (!env.GOOGLE_CALENDAR_CLIENT_SECRET) return { valid: false, reason: 'GOOGLE_CALENDAR_CLIENT_SECRET is not configured.' };
    if (!env.GOOGLE_CALENDAR_TOKEN_PATH) return { valid: false, reason: 'GOOGLE_CALENDAR_TOKEN_PATH is not configured.' };

    const tokenPath = path.resolve(env.GOOGLE_CALENDAR_TOKEN_PATH);
    if (isPathInside(vaultPath, tokenPath)) {
        return { valid: false, reason: 'GOOGLE_CALENDAR_TOKEN_PATH must point outside the Apogee vault.' };
    }
    return {
        valid: true,
        clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
        clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
        tokenPath
    };
}

function createPkcePair() {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

function buildAuthorizationUrl(clientId, redirectUri, state, codeChallenge) {
    const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: CALENDAR_EVENTS_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });
    return `${GOOGLE_AUTH_URL}?${query}`;
}

function exchangeAuthorizationCode(configuration, code, redirectUri, verifier, requestImplementation = https.request) {
    const body = new URLSearchParams({
        code,
        client_id: configuration.clientId,
        client_secret: configuration.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier
    }).toString();
    return new Promise((resolve, reject) => {
        const request = requestImplementation(new URL(GOOGLE_TOKEN_URL), { method: 'POST' }, (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => {
                let parsed;
                let parseError = null;
                try { parsed = JSON.parse(responseBody); } catch (error) { parseError = error; }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    const diagnostic = parseError
                        ? {
                            response_not_valid_json: true,
                            response_body_length: Buffer.byteLength(responseBody, 'utf8')
                        }
                        : {
                            error: typeof parsed.error === 'string' ? parsed.error : undefined,
                            error_description: typeof parsed.error_description === 'string' ? parsed.error_description : undefined
                        };
                    reject(new Error(`Google OAuth token exchange failed with HTTP ${response.statusCode}: ${JSON.stringify(diagnostic)}.`));
                    return;
                }
                if (!parsed.access_token || !parsed.refresh_token) {
                    reject(new Error('Google OAuth did not return the required access and refresh tokens.'));
                    return;
                }
                resolve(parsed);
            });
        });
        request.on('error', reject);
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        request.setHeader('Content-Length', Buffer.byteLength(body));
        request.write(body);
        request.end();
    });
}

function saveToken(tokenPath, tokenResponse) {
    const token = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expiry_date: Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000),
        token_type: tokenResponse.token_type || 'Bearer',
        scopes: [CALENDAR_EVENTS_SCOPE]
    };
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function openBrowser(url, platform = process.platform, launcher = execFile) {
    const command = platform === 'win32' ? 'rundll32.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
    const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    return launcher(command, args);
}

function authorize(configuration, browserLauncher = openBrowser, requestImplementation = https.request) {
    return new Promise((resolve, reject) => {
        const state = crypto.randomBytes(24).toString('hex');
        const pkce = createPkcePair();
        const server = http.createServer(async (request, response) => {
            const requestUrl = new URL(request.url, 'http://localhost');
            if (requestUrl.pathname !== '/oauth2callback') {
                response.statusCode = 404;
                response.end('Not found.');
                return;
            }
            if (requestUrl.searchParams.get('state') !== state) {
                response.statusCode = 400;
                response.end('Authorization state mismatch.');
                server.close();
                reject(new Error('Google OAuth authorization state mismatch.'));
                return;
            }
            const error = requestUrl.searchParams.get('error');
            if (error) {
                response.statusCode = 400;
                response.end('Authorization was not completed.');
                server.close();
                reject(new Error(`Google OAuth authorization was not completed: ${error}.`));
                return;
            }
            const code = requestUrl.searchParams.get('code');
            if (!code) {
                response.statusCode = 400;
                response.end('Authorization code was not returned.');
                server.close();
                reject(new Error('Google OAuth authorization code was not returned.'));
                return;
            }
            try {
                const tokenResponse = await exchangeAuthorizationCode(configuration, code, redirectUri, pkce.verifier, requestImplementation);
                saveToken(configuration.tokenPath, tokenResponse);
                response.statusCode = 200;
                response.end('Authorization complete. You may close this browser window.');
                server.close();
                resolve({ tokenPath: configuration.tokenPath, scope: CALENDAR_EVENTS_SCOPE });
            } catch (exchangeError) {
                response.statusCode = 500;
                response.end('Authorization could not be completed.');
                server.close();
                reject(exchangeError);
            }
        });
        let redirectUri;
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            redirectUri = `http://localhost:${address.port}/oauth2callback`;
            const authorizationUrl = buildAuthorizationUrl(configuration.clientId, redirectUri, state, pkce.challenge);
            browserLauncher(authorizationUrl);
        });
        server.on('error', reject);
    });
}

async function main() {
    const configuration = validateProvisioningConfiguration();
    if (!configuration.valid) {
        console.error(`Google Calendar OAuth provisioning unavailable: ${configuration.reason}`);
        process.exitCode = 1;
        return;
    }
    console.log('Opening Google authorization in your browser for Calendar event access.');
    console.log('No Calendar event will be created by this provisioning command.');
    try {
        await authorize(configuration);
        console.log(`Google Calendar OAuth token saved outside the vault at: ${configuration.tokenPath}`);
    } catch (error) {
        console.error(`Google Calendar OAuth provisioning failed: ${error.message}`);
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    CALENDAR_EVENTS_SCOPE,
    isPathInside,
    validateProvisioningConfiguration,
    createPkcePair,
    buildAuthorizationUrl,
    exchangeAuthorizationCode,
    saveToken,
    openBrowser,
    authorize
};
