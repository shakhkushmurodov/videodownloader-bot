# Node.js LTS (Lightweight) imijidan foydalanamiz
FROM node:18-bullseye-slim

# Tizim paketlarini yangilaymiz va ffmpeg, python (yt-dlp uchun) o'rnatamiz
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp o'rnatish (youtube-dl-exec uchun)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Ishchi katalogni belgilaymiz
WORKDIR /app

# Bog'liqliklarni nusxalaymiz va o'rnatamiz
COPY package*.json ./
RUN npm install --production

# Loyiha fayllarini nusxalaymiz
COPY . .

# Portni ochamiz
EXPOSE 3000

# Botni ishga tushirish
CMD ["node", "runner.js"]

