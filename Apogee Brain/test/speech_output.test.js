const assert = require('assert');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

process.env.APOGEE_TEST_MODE = '0';
process.env.ANTHROPIC_API_KEY = 'test-key';

const spawnCalls = [];
const originalSpawn = childProcess.spawn;
childProcess.spawn = (command, args, options) => {
    const speechProcess = new EventEmitter();
    speechProcess.stdin = new EventEmitter();
    speechProcess.stdin.end = (text, encoding) => {
        speechProcess.stdinText = text;
        speechProcess.stdinEncoding = encoding;
    };
    spawnCalls.push({ command, args, options, speechProcess });
    return speechProcess;
};

const { sanitizeForSpeech, speakLocally } = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

function latestCall() {
    return spawnCalls[spawnCalls.length - 1];
}

try {
    const shortResponse = "It's a **short** response.\nNew line.\nUnicode: café — ✅.";
    speakLocally(shortResponse);
    const shortCall = latestCall();
    assert.strictEqual(shortCall.command, 'powershell.exe');
    assert.deepStrictEqual(shortCall.args.slice(0, 2), ['-NoProfile', '-Command']);
    assert.match(shortCall.args[2], /System\.Speech\.Synthesis\.SpeechSynthesizer/);
    assert.match(shortCall.args[2], /Console\]::In\.ReadToEnd/);
    assert.strictEqual(shortCall.args[2].includes(shortResponse), false);
    assert.strictEqual(shortCall.speechProcess.stdinText, sanitizeForSpeech(shortResponse));
    assert.strictEqual(shortCall.speechProcess.stdinEncoding, 'utf8');
    assert.strictEqual(shortCall.args.join(' ').includes(shortCall.speechProcess.stdinText), false);
    shortCall.speechProcess.emit('close', 0);

    const longResponse = (`Customer evidence: ${"x".repeat(30000)} end.`);
    speakLocally(longResponse);
    const longCall = latestCall();
    assert.ok(longCall.speechProcess.stdinText.length > 20000);
    assert.strictEqual(longCall.speechProcess.stdinText, sanitizeForSpeech(longResponse));
    assert.ok(longCall.args.join(' ').length < 1000);
    assert.strictEqual(longCall.args.join(' ').includes(longCall.speechProcess.stdinText), false);
    longCall.speechProcess.emit('close', 0);

    const errorMessages = [];
    const originalLog = console.log;
    console.log = (message) => errorMessages.push(String(message));
    try {
        speakLocally('speech failure test');
        const errorCall = latestCall();
        errorCall.speechProcess.emit('error', new Error('spawn failed'));
    } finally {
        console.log = originalLog;
    }
    assert.ok(errorMessages.some((message) => message.includes('[Speech Error]: spawn failed')));

    console.log('Speech output scenarios passed.');
} finally {
    childProcess.spawn = originalSpawn;
}
