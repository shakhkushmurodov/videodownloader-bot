const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config();

// --- HTTP SERVER FOR RENDER (FREE TIER) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n');
}).listen(PORT, () => {
    console.log(`Web server botni ushlab turish uchun ${PORT}-portda ishlamoqda.`);
});

const { create } = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const axios = require('axios');

// yt-dlp binary yo'lini topamiz (Render Docker: /usr/local/bin/yt-dlp)
const YTDLP_PATHS = [
    '/usr/local/bin/yt-dlp',      // Docker (Render)
    path.join(__dirname, 'yt-dlp'), // Local project directory
    'yt-dlp'                       // System PATH fallback
];
const YTDLP_BIN = YTDLP_PATHS.find(p => {
    try { return fs.existsSync(p); } catch { return false; }
}) || 'yt-dlp';
console.log(`[yt-dlp] Using binary: ${YTDLP_BIN}`);
const youtubedl = create(YTDLP_BIN);

// --- LOGGING ---
const LOG_FILE = path.join(__dirname, 'bot.log');
function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    console.log(logMsg.trim());
    fs.appendFileSync(LOG_FILE, logMsg);
}

// --- BO'GLIQLIKLARNI YUKLASH (SAFE REQUIRE) ---
let ytSearch = null;
try {
    ytSearch = require('yt-search');
} catch (e) {
    log('⚠️ DIQQAT: "yt-search" kutubxonasi topilmadi. Qidiruv funksiyasi cheklangan.');
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- KESH (CACHE) TIZIMI ---
const CACHE_FILE = path.join(__dirname, 'bot_cache.json');
let fileCache = {};

try {
    if (fs.existsSync(CACHE_FILE)) {
        fileCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
} catch (e) {
    console.error('Cache faylini o\'qishda xatolik:', e.message);
}

const saveCache = () => {
    fs.writeFile(CACHE_FILE, JSON.stringify(fileCache, null, 2), 'utf8', (err) => {
        if (err) console.error('Cache saqlashda xato:', err);
    });
};

// --- SESSION ---
const sessionStore = {}; // { userId: { url: "..." } }

// --- CONSTANTS ---
const MAX_FILE_SIZE_LOCAL_UPLOAD = 50 * 1024 * 1024; // 50MB (Telegram Bot API limiti)
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Downloads papkasini yaratish
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// --- START COMMAND ---
bot.start(async (ctx) => {
    log(`Start command from: ${ctx.from.id} (@${ctx.from.username})`);
    let botUsername = ctx.botInfo.username;
    await ctx.reply(
        `🎵 **Xush kelibsiz!**\n\n` +
        `Ushbu bot orqali istalgan musiqangizni tez va oson topishingiz hamda YouTube, Instagram, va TikTok-dan media yuklab olishingiz mumkin. 🚀\n\n` +
        `📝 **Qanday foydalaniladi?**\n` +
        `• Shunchaki artist yoki musiqa nomini yozing.\n` +
        `• Yoki video havolasini (link) yuboring.\n\n` +
        `⚡️ **Tezkor va sifatli xizmatdan bahra oling!**`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        Markup.button.url('➕ Guruhga qo\'shish', `https://t.me/${botUsername}?startgroup=true`)
                    ],
                    [
                        Markup.button.url('📣 Kanalimiz', `https://t.me/your_channel_here`) // Replace with actual channel if known
                    ]
                ]
            }
        }
    );
});

// --- STATUS COMMAND ---
bot.command('status', async (ctx) => {
    const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage().rss / (1024 * 1024),
        cacheSize: Object.keys(fileCache).length
    };
    await ctx.reply(`🤖 Bot Status:\n✅ Uptime: ${Math.floor(stats.uptime / 60)} min\n🧠 RAM: ${stats.memory.toFixed(1)} MB\n📦 Cache: ${stats.cacheSize} items`);
});

// --- LISTENER ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    log(`Message from ${ctx.from.id}: ${text}`);

    // 1. Havola tekshiruvi (YouTube, Instagram, TikTok, va boshqalar)
    const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|music\.youtube\.com|pin\.it|pinterest\.com|vimeo\.com|facebook\.com)\/.+$/;

    // Agar havola bo'lsa
    if (urlPattern.test(text)) {
        sessionStore[ctx.from.id] = { url: text };
        // Eski sessiyalarni tozalash (xotira uchun)
        setTimeout(() => {
            if (sessionStore[ctx.from.id] && sessionStore[ctx.from.id].url === text) {
                delete sessionStore[ctx.from.id];
            }
        }, 10 * 60 * 1000); // 10 daqiqa

        return sendFormatSelection(ctx);
    }

    // 2. Qidiruv
    if (ytSearch) {
        // Queryni sessionga saqlaymiz
        sessionStore[ctx.from.id] = { searchQuery: text };

        // VKM STYLE: Immediately search for music
        return handleSearch(ctx, text, 'music');
    } else {
        ctx.reply('🔍 Qidiruv tizimida muammo bor. Iltimos, havola yuboring.');
    }
});

async function sendFormatSelection(ctx) {
    const botUsername = ctx.botInfo.username;
    await ctx.reply('🎞 **Formatni tanlang:**', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📹 Video (MP4)', callback_data: 'download_video' },
                    { text: '🎵 Audio (MP3)', callback_data: 'download_music' }
                ],
                [
                    { text: '➕ Guruhga qo\'shish', url: `https://t.me/${botUsername}?startgroup=true` }
                ]
            ]
        }
    });
}

// --- INLINE MODE ---
bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (!query || query.length < 2) return ctx.answerInlineQuery([]);

    try {
        const result = await ytSearch(query);
        if (!result || !result.videos.length) return ctx.answerInlineQuery([]);

        const results = result.videos.slice(0, 20).map(v => ({
            type: 'article',
            id: v.videoId,
            thumb_url: v.thumbnail,
            title: v.title,
            description: `⏱ ${v.timestamp} | 👀 ${v.views} marta ko'rilgan`,
            input_message_content: {
                // Use plain message_text to avoid Markdown parse errors with special chars in titles/URLs
                message_text: `🎞 ${v.title}\n\n🔗 ${v.url}`
            },
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📹 Video (MP4)', callback_data: `yt_v_${v.videoId}` },
                        { text: '🎵 Audio (MP3)', callback_data: `yt_m_${v.videoId}` }
                    ]
                ]
            }
        }));

        await ctx.answerInlineQuery(results, { cache_time: 300 });
    } catch (e) {
        log(`Inline Error: ${e.message}`);
        await ctx.answerInlineQuery([]);
    }
});

// --- SEARCH SELECTION ACTIONS ---
bot.action(/^search_(video|music)$/, async (ctx) => {
    const type = ctx.match[1];
    const userId = ctx.from.id;

    let query = null;
    if (sessionStore[userId] && sessionStore[userId].searchQuery) {
        query = sessionStore[userId].searchQuery;
    }

    if (!query) {
        return ctx.reply('⚠️ Qidiruv sessiyasi eskirgan. Iltimos, so\'zni qaytadan yozing.');
    }

    // Qidiruvni boshlash
    await handleSearch(ctx, query, type);
    await ctx.answerCbQuery();
});


// --- SEARCH HANDLER ---
async function handleSearch(ctx, query, type = 'video') {
    let searchQuery = query;
    if (type === 'music') {
        searchQuery += ' audio';
    }

    const typeIcon = type === 'music' ? '🎵' : '📹';
    const msg = await ctx.reply(`${typeIcon} \`${query}\` qidirilmoqda...`, { parse_mode: 'Markdown' });

    try {
        const result = await ytSearch(searchQuery);

        if (!result || !result.videos.length) {
            return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, '❌ Hech narsa topilmadi. Boshqa so\'z bilan urinib ko\'ring.');
        }

        const videos = result.videos.slice(0, 10);
        const keyboard = videos.map((v, index) => {
            let title = v.title;
            if (title.length > 40) title = title.substring(0, 37) + '...';
            // VKM STYLE: Numbered list
            return [Markup.button.callback(`${index + 1}. ${title} (${v.timestamp})`, `sem_${v.videoId}`)];
        });

        const headerText = `🎶 **Musiqa natijalari:**\n` +
            `🔎 Qidiruv: \`${query}\`\n\n` +
            `👇 Yuklab olish uchun raqamni bosing:`;

        await ctx.deleteMessage(msg.message_id).catch(() => { });
        await ctx.reply(headerText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error('Qidiruv xatosi:', error);
        ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, '⚠️ Qidirishda xatolik yuz berdi.');
    }
}

// --- ACTIONS ---
bot.action(/^sem_(.+)$/, async (ctx) => {
    const videoId = ctx.match[1];
    const url = `https://youtube.com/watch?v=${videoId}`;
    // VKM STYLE: Immediately download MP3
    await downloadMedia(ctx, true, url);
    await ctx.answerCbQuery();
});

bot.action(/^yt_([vm])_(.+)$/, async (ctx) => {
    const type = ctx.match[1]; // 'v' - video, 'm' - music
    const videoId = ctx.match[2];
    const url = `https://youtube.com/watch?v=${videoId}`;
    await downloadMedia(ctx, type === 'm', url);
});

bot.action('download_video', (ctx) => downloadMedia(ctx, false));
bot.action('download_music', (ctx) => downloadMedia(ctx, true));

// --- CORE DOWNLOADER FUNCTION ---
async function downloadMedia(ctx, isAudio, directUrl = null) {
    let url = directUrl;

    if (!url) {
        const userData = sessionStore[ctx.from.id];
        if (userData) url = userData.url;
    }

    if (!url) {
        return ctx.reply('⚠️ Havola topilmadi yoki eskirgan. Iltimos, qaytadan yuboring.');
    }

    const typeKey = isAudio ? 'audio' : 'video';
    const typeName = isAudio ? 'Audio' : 'Video';
    const botUsername = ctx.botInfo.username;

    // 1. CACHE TEKSHIRISH
    if (fileCache[url] && fileCache[url][typeKey]) {
        try {
            const fileId = fileCache[url][typeKey];
            console.log(`⚡️ CACHE HIT: ${url}`);
            if (isAudio) {
                await ctx.replyWithAudio(fileId, {
                    caption: `🎵 @${botUsername} orqali yuklandi\n🚀 Tezkor yuklash (Cache)`
                });
            } else {
                await ctx.replyWithVideo(fileId, {
                    caption: `📹 @${botUsername} orqali yuklandi\n🚀 Tezkor yuklash (Cache)`
                });
            }
            return;
        } catch (e) {
            console.log('Cache invalid, qayta yuklaymiz...');
            delete fileCache[url][typeKey];
        }
    }

    await ctx.answerCbQuery().catch(() => { });
    const statusMsg = await ctx.reply(`⏳ **${typeName}** tayyorlanmoqda...\n\n` +
        `� Server bilan bog'lanilmoqda...`, { parse_mode: 'Markdown' });

    const updateStatus = async (text) => {
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `⏳ **${typeName}** tayyorlanmoqda...\n\n${text}`, { parse_mode: 'Markdown' });
        } catch (e) { }
    };

    let success = false;
    let sentMessage = null;
    let metadata = null;

    // 2. METADATA OLISH
    try {
        await updateStatus('📄 Ma\'lumotlar olinmoqda...');
        metadata = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificate: true
        });
    } catch (e) {
        log(`Metadata error: ${e.message}`);
    }

    // 3. SMART MUSIC REDIRECT (if audio requested)
    if (isAudio && url.includes('youtube.com') && metadata) {
        try {
            let songQuery = (metadata.artist && metadata.track) ? `${metadata.artist} - ${metadata.track}` : metadata.title;
            songQuery = songQuery.replace(/official|video|lyrics|hd|4k/gi, '').trim();

            await updateStatus(`🔎 Eng yaxshi audio qidirilmoqda: \`${songQuery}\``);
            const searchRes = await ytSearch(songQuery + ' audio');
            if (searchRes && searchRes.videos.length > 0) {
                const bestMatch = searchRes.videos[0];
                if (bestMatch.videoId !== metadata.id) {
                    log(`Redirecting to better audio: ${bestMatch.title}`);
                    url = bestMatch.url;
                    // Re-check cache for redirected URL
                    if (fileCache[url] && fileCache[url][typeKey]) {
                        const fileId = fileCache[url][typeKey];
                        await ctx.replyWithAudio(fileId, { caption: `🎵 @${botUsername} (High Quality)` });
                        ctx.deleteMessage(statusMsg.message_id).catch(() => { });
                        return;
                    }
                }
            }
        } catch (e) { log(`Smart Redirect failed: ${e.message}`); }
    }

    // 4. DOWNLOAD
    try {
        const timestamp = Date.now();
        const ext = isAudio ? 'mp3' : 'mp4';
        const tempFilePath = path.join(DOWNLOAD_DIR, `${timestamp}_${ctx.from.id}.${ext}`);

        await updateStatus(`📥 Yuklab olinmoqda... 0%`);

        const options = {
            output: tempFilePath,
            noCheckCertificate: true,
            noWarnings: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
            ffmpegLocation: ffmpegPath
        };

        if (isAudio) {
            options.extractAudio = true;
            options.audioFormat = 'mp3';
            options.audioQuality = 0; // Best
        } else {
            options.format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        }

        await youtubedl(url, options);

        if (!fs.existsSync(tempFilePath)) throw new Error('Fayl yaratilmadi.');

        const stats = fs.statSync(tempFilePath);
        const fileSizeMB = stats.size / (1024 * 1024);

        if (fileSizeMB > 49.9) {
            await ctx.reply(`❌ Fayl juda katta (${fileSizeMB.toFixed(1)}MB). Telegram Bot API limiti 50MB.`);
            fs.unlinkSync(tempFilePath);
            return;
        }

        await updateStatus(`📤 Telegramga yuborilmoqda... (${fileSizeMB.toFixed(1)}MB)`);

        const caption = `✅ **${metadata ? metadata.title : 'Yuklandi'}**\n\n🤖 @${botUsername} orqali yuklandi`;

        if (isAudio) {
            sentMessage = await ctx.replyWithAudio({ source: tempFilePath }, {
                caption,
                parse_mode: 'Markdown',
                title: metadata ? metadata.title : undefined,
                performer: metadata ? (metadata.artist || metadata.uploader) : undefined,
                duration: metadata ? metadata.duration : undefined,
                thumb: metadata ? { url: metadata.thumbnail } : undefined
            });
        } else {
            sentMessage = await ctx.replyWithVideo({ source: tempFilePath }, {
                caption,
                parse_mode: 'Markdown',
                supports_streaming: true,
                width: metadata ? metadata.width : undefined,
                height: metadata ? metadata.height : undefined,
                duration: metadata ? metadata.duration : undefined,
                thumb: metadata ? { url: metadata.thumbnail } : undefined
            });
        }

        fs.unlink(tempFilePath, (err) => { if (err) log(`Delete error: ${err.message}`); });
        success = true;

    } catch (error) {
        log(`Download Error: ${error.message}`);
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
            `❌ **Xatolik yuz berdi!**\n\nIltimos, keyinroq qayta urunib ko'ring yoki boshqa havola yuboring.\n\n` +
            `原因: \`${error.message.substring(0, 100)}\``, { parse_mode: 'Markdown' });
        return;
    }

    // 5. CACHE SAVE
    if (success && sentMessage) {
        let fileId = isAudio ? sentMessage.audio.file_id : sentMessage.video.file_id;
        if (fileId) {
            if (!fileCache[url]) fileCache[url] = {};
            fileCache[url][typeKey] = fileId;
            saveCache();
        }
        ctx.deleteMessage(statusMsg.message_id).catch(() => { });
    }
}

bot.launch({ dropPendingUpdates: true }).then(() => {
    log('🤖 Bot (OPTIMAL VERSION 2.0) ishga tushdi!');
}).catch((err) => {
    log(`Bot launch error: ${err.message}`);
    process.exit(1);
});

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

process.on('uncaughtException', (err) => {
    console.log('UNCAUGHT EXCEPTION:', err);
    process.exit(1); // Auto-restart uchun jarayonni to'xtatamiz
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('UNHANDLED REJECTION:', reason);
    process.exit(1); // Auto-restart uchun jarayonni to'xtatamiz
});
