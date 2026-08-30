
#!/bin/bash

set -e

echo "📦 Prüfe yt-dlp..."

if ! command -v yt-dlp >/dev/null 2>&1; then
    echo "⬇️ Installiere yt-dlp..."

    curl -L \
      https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /tmp/yt-dlp

    chmod +x /tmp/yt-dlp

    mkdir -p "$HOME/.local/bin"
    cp /tmp/yt-dlp "$HOME/.local/bin/yt-dlp"

    export PATH="$HOME/.local/bin:$PATH"
fi

echo "✅ yt-dlp verfügbar:"
yt-dlp --version

echo "🚀 Starte Discord Bot..."

node index.js

