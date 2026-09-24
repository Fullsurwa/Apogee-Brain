const originalLog = console.log;
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

const { runSystemPipeline } = require('./apogee_core');

async function main() {
    const transcript = process.argv.slice(2).join(' ').trim();

    if (!transcript) {
        process.stderr.write('No transcript supplied.\n');
        process.exit(1);
    }

    try {
        const result = await runSystemPipeline(transcript);
        process.stdout.write(JSON.stringify(result));
    } catch (error) {
        process.stderr.write(error && error.stack ? error.stack + '\n' : String(error) + '\n');
        process.exit(1);
    }
}

main();
