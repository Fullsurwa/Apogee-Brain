const path = require('path');
const { transcribeAudio } = require('./whisper_stt');
const { runSystemPipeline } = require('../03_Active_Engine/Brains/core-engine/apogee_core');

const audioPath = process.argv[2];

if (!audioPath) {
    console.error('Usage: node scripts/run_audio_pipeline.js <audio-file>');
    process.exit(1);
}

const absoluteAudioPath = path.resolve(audioPath);

console.log(`[Voice] Transcribing: ${absoluteAudioPath}`);

transcribeAudio(absoluteAudioPath)
    .then(async (transcript) => {
        console.log('\n[Voice] Transcript:');
        console.log(transcript);
        console.log('\n[Voice] Sending transcript to Apogee Brain...\n');

        await runSystemPipeline(transcript);
    })
    .catch((error) => {
        console.error('[Voice] Pipeline failed:', error);
        process.exit(1);
    });
