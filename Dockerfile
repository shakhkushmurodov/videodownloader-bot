# Node.js 18 LTS Slim (Debian Bullseye)
FROM node:18-bullseye-slim

# Tizim paketlarini o'rnatamiz: ffmpeg, python3, curl
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp ni yuklab o'rnatamiz va ruxsat beramiz
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# YTDL_HOST env ni o'rnatamiz — youtube-dl-exec yt-dlp ishlatsin
ENV YTDL_HOST=yt-dlp

# Ishchi katalog
WORKDIR /app

# downloads papkasini yaratamiz
RUN mkdir -p /app/downloads

# Faqat package.json ni ko'chirib npm install qilamiz
COPY package.json ./
RUN npm install --production --ignore-scripts && npm cache clean --force


# Barcha fayllarni ko'chiramiz
COPY . .

# Portni ochamiz (Render PORT env o'zgaruvchisini ishlatadi)
EXPOSE 3000

# Botni ishga tushiramiz
CMD ["node", "runner.js"]
