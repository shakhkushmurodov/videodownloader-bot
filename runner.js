const { spawn } = require('child_process');
const path = require('path');

const BOT_FILE = path.join(__dirname, 'bot.js');

function startBot() {
    console.log('🚀 Bot ishga tushirmoqda...');

    const bot = spawn('node', [BOT_FILE], {
        stdio: 'inherit',
        shell: true
    });

    bot.on('close', (code) => {
        if (code === 0) {
            console.log('✅ Bot to\'xtatildi (Clean exit).');
            process.exit(0);
        } else {
            console.error(`⚠️ Bot o'chib qoldi! (Exit code: ${code})`);
            console.log('🔄 5 soniyadan keyin qayta yondiriladi...');

            setTimeout(() => {
                startBot();
            }, 5000);
        }
    });

    bot.on('error', (err) => {
        console.error('❌ Botni ishga tushirishda xatolik:', err);
    });
}

startBot();
