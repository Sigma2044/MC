```js
const {
    Client,
    GatewayIntentBits,
    ChannelType
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    NoSubscriberBehavior,
    entersState
} = require("@discordjs/voice");

const path = require("node:path");
const fs = require("node:fs");

// =====================================================
// EINSTELLUNGEN
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

// Lautstärke: 0.0 = lautlos | 1.0 = volle Lautstärke
const VOLUME = Number(process.env.VOLUME || "0.35");

const AUDIO_FILE = path.join(
    __dirname,
    "audio",
    "audio.mp3"
);

// =====================================================
// KONFIGURATION PRÜFEN
// =====================================================

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN fehlt!");
    process.exit(1);
}

if (!GUILD_ID) {
    console.error("❌ GUILD_ID fehlt!");
    process.exit(1);
}

if (!VOICE_CHANNEL_ID) {
    console.error("❌ VOICE_CHANNEL_ID fehlt!");
    process.exit(1);
}

if (!fs.existsSync(AUDIO_FILE)) {
    console.error("❌ audio/audio.mp3 wurde nicht gefunden!");
    process.exit(1);
}

if (VOLUME < 0 || VOLUME > 1) {
    console.error("❌ VOLUME muss zwischen 0 und 1 liegen!");
    process.exit(1);
}

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// =====================================================
// AUDIO PLAYER
// =====================================================

const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
    }
});

let connection = null;
let reconnecting = false;

// =====================================================
// AUDIO RESOURCE
// =====================================================

function createMusicResource() {
    const resource = createAudioResource(AUDIO_FILE, {
        inlineVolume: true
    });

    resource.volume.setVolume(VOLUME);

    return resource;
}

// =====================================================
// AUDIO STARTEN
// =====================================================

function playMusic() {
    try {
        console.log("🎵 Starte Minecraft Chill Radio...");

        const resource = createMusicResource();

        player.play(resource);

    } catch (error) {
        console.error("❌ Fehler beim Starten der Musik:", error);

        setTimeout(playMusic, 5000);
    }
}

// =====================================================
// VOICE CHANNEL BETRETEN
// =====================================================

async function connectToVoice() {

    if (reconnecting) return;

    reconnecting = true;

    try {

        const guild = await client.guilds.fetch(GUILD_ID);

        const channel = await guild.channels.fetch(
            VOICE_CHANNEL_ID
        );

        if (!channel) {
            throw new Error("Voice-Channel nicht gefunden.");
        }

        if (channel.type !== ChannelType.GuildVoice) {
            throw new Error(
                "VOICE_CHANNEL_ID ist kein normaler Voice-Channel."
            );
        }

        console.log(
            `🔊 Verbinde mit Voice-Channel: ${channel.name}`
        );

        // Alte Verbindung entfernen
        if (connection) {
            try {
                connection.destroy();
            } catch {}
        }

        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,

            // Bot hört nicht selbst mit
            selfDeaf: true,

            // Bot sendet Audio
            selfMute: false
        });

        connection.subscribe(player);

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            30000
        );

        console.log("✅ Erfolgreich mit Discord Voice verbunden!");

        reconnecting = false;

        // Musik starten
        playMusic();

    } catch (error) {

        reconnecting = false;

        console.error(
            "❌ Voice-Verbindung fehlgeschlagen:",
            error.message
        );

        console.log(
            "🔄 Neuer Versuch in 10 Sekunden..."
        );

        setTimeout(connectToVoice, 10000);
    }
}

// =====================================================
// MUSIK ENDE → AUTOMATISCH NEU STARTEN
// =====================================================

player.on(
    AudioPlayerStatus.Idle,
    () => {

        console.log(
            "🔁 Audio beendet – starte wieder von vorne."
        );

        setTimeout(() => {

            if (
                player.state.status ===
                AudioPlayerStatus.Idle
            ) {
                playMusic();
            }

        }, 1000);
    }
);

// =====================================================
// AUDIO FEHLER
// =====================================================

player.on(
    "error",
    error => {

        console.error(
            "❌ Audio-Fehler:",
            error.message
        );

        setTimeout(() => {
            playMusic();
        }, 3000);
    }
);

// =====================================================
// VOICE CONNECTION EVENTS
// =====================================================

function setupConnectionEvents() {

    if (!connection) return;

    connection.on(
        VoiceConnectionStatus.Ready,
        () => {

            console.log(
                "🟢 Discord Voice ist bereit."
            );
        }
    );

    connection.on(
        VoiceConnectionStatus.Disconnected,
        async () => {

            console.log(
                "⚠️ Discord Voice wurde getrennt."
            );

            try {

                // Prüfen, ob Discord die Verbindung
                // automatisch wiederherstellen kann.

                await Promise.race([

                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5000
                    ),

                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5000
                    )

                ]);

                console.log(
                    "🔄 Discord versucht die Verbindung wiederherzustellen."
                );

            } catch {

                console.log(
                    "❌ Verbindung verloren."
                );

                try {
                    connection.destroy();
                } catch {}

                connection = null;

                setTimeout(
                    connectToVoice,
                    5000
                );
            }
        }
    );
}

// =====================================================
// BOT ONLINE
// =====================================================

client.once(
    "ready",
    async () => {

        console.log("");
        console.log("======================================");
        console.log("       MINECRAFT CHILL RADIO");
        console.log("======================================");

        console.log(
            `🤖 Bot: ${client.user.tag}`
        );

        console.log(
            `🔊 Voice Channel: ${VOICE_CHANNEL_ID}`
        );

        console.log(
            `🔉 Lautstärke: ${Math.round(VOLUME * 100)}%`
        );

        console.log(
            `🎵 Datei: ${AUDIO_FILE}`
        );

        console.log("======================================");
        console.log("");

        await connectToVoice();

        setupConnectionEvents();
    }
);

// =====================================================
// SAUBER HERUNTERFAHREN
// =====================================================

function shutdown() {

    console.log(
        "🛑 Bot wird heruntergefahren..."
    );

    try {
        player.stop();
    } catch {}

    try {
        if (connection) {
            connection.destroy();
        }
    } catch {}

    try {
        client.destroy();
    } catch {}

    process.exit(0);
}

process.on(
    "SIGTERM",
    shutdown
);

process.on(
    "SIGINT",
    shutdown
);

// =====================================================
// DISCORD LOGIN
// =====================================================

client.login(TOKEN);
```
