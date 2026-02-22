const ytSearch = require('yt-search');

async function testSearch() {
    console.log("Searching 'Imagine Dragons'...");
    const r1 = await ytSearch('Imagine Dragons');
    console.log("--- Default Search Results (Top 3) ---");
    r1.videos.slice(0, 3).forEach(v => console.log(`[${v.type}] ${v.title} (${v.duration.timestamp})`));

    console.log("\nSearching 'Imagine Dragons audio'...");
    const r2 = await ytSearch('Imagine Dragons audio');
    console.log("--- Audio Search Results (Top 3) ---");
    r2.videos.slice(0, 3).forEach(v => console.log(`[${v.type}] ${v.title} (${v.duration.timestamp})`));
}

testSearch();
