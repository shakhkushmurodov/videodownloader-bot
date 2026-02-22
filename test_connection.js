const https = require('https');

console.log('Testing connection to api.telegram.org...');

const req = https.get('https://api.telegram.org', (res) => {
    console.log('Response Status:', res.statusCode);
    res.on('data', () => { });
    res.on('end', () => {
        console.log('Connection successful!');
    });
});

req.on('error', (e) => {
    console.error('Connection failed:', e.code, e.message);
});

req.setTimeout(10000, () => {
    console.log('Connection timed out');
    req.destroy();
});
