const YTDlpWrap = require('youtube-dl-exec');
const fs = require('fs');

async function test() {
    console.log('Testing youtube-dl-exec...');
    try {
        const output = await YTDlpWrap('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true
        });
        console.log('Title:', output.title);
        console.log('Success!');
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
