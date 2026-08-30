
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
    StreamType,
    entersState
} = require("@discordjs/voice");

const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

const YOUTUBE_URL =
    process.env.YOUTUBE_URL ||
    "https://www.youtube.com/watch?v=8v7-7g0LhAU";

const VOLUME =
    Number(process.env.VOLUME || "0.35");

// =====================================================
// CHECK
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

console.log("=================================");
console.log("     MINECRAFT CHILL RADIO");
console.log("=================================");
console.log(`🎵 URL: ${YOUTUBE_URL}`);
console.log(`🔊 Lautstärke: ${VOLUME * 100}%`);
console.log("=================================");

// =====================================================
// DISCORD
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
    }
});

let connection = null;
let ytProcess = null;
let ffmpegProcess = null;
let restarting = false;

// =====================================================
// START STREAM
// =====================================================

function startStream() {

    if (restarting) return;

    restarting = true;

    console.log("🎵 Starte YouTube Audio Stream...");

    // Alte Prozesse beenden
    if (ytProcess) {
        try {
            ytProcess.kill("SIGKILL");
        } catch {}
    }

    if (ffmpegProcess) {
        try {
            ffmpegProcess.kill("SIGKILL");
        } catch {}
    }

    // =================================================
    // YT-DLP
    // =================================================

    ytProcess = spawn(
        "yt-dlp",
        [
            "--no-playlist",
            "--quiet",
            "--no-warnings",
            "-f",
            "bestaudio",
            "-o",
            "-",
            YOUTUBE_URL
        ],
        {
            stdio: [
                "ignore",
                "pipe",
                "pipe"
            ]
        }
    );

    ytProcess.stderr.on(
        "data",
        data => {

            const text =
                data.toString().trim();

            if (text) {
                console.log(
                    `yt-dlp: ${text}`
                );
            }
        }
    );

    ytProcess.on(
        "error",
        error => {

            console.error(
                "❌ yt-dlp Fehler:",
                error.message
            );

            restartStream();
        }
    );

    ytProcess.on(
        "close",
        code => {

            console.log(
                `yt-dlp beendet (Code ${code})`
            );

            if (!restarting) {
                restartStream();
            }
        }
    );

    // =================================================
    // FFMPEG
    // =================================================

    ffmpegProcess = spawn(
        ffmpegPath,
        [
            "-hide_banner",
            "-loglevel",
            "error",

            "-i",
            "pipe:0",

            "-f",
            "s16le",
            "-ar",
            "48000",
            "-ac",
            "2",

            "pipe:1"
        ],
        {
            stdio: [
                "pipe",
                "pipe",
                "pipe"
            ]
        }
    );

    // yt-dlp → FFmpeg
    ytProcess.stdout.pipe(
        ffmpegProcess.stdin
    );

    ffmpegProcess.stderr.on(
        "data",
        data => {

            const text =
                data.toString().trim();

            if (text) {
                console.error(
                    `FFmpeg: ${text}`
                );
            }
        }
    );

    ffmpegProcess.on(
        "error",
        error => {

            console.error(
                "❌ FFmpeg Fehler:",
                error.message
            );

            restartStream();
        }
    );

    // =================================================
    // DISCORD AUDIO RESOURCE
    // =================================================

    const resource =
        createAudioResource(
            ffmpegProcess.stdout,
            {
                inputType:
                    StreamType.Raw,
                inlineVolume: true
            }
        );

    resource.volume.setVolume(
        VOLUME
    );

    player.play(resource);

    restarting = false;

    console.log(
        "▶️ YouTube Audio läuft!"
    );
}

// =====================================================
// RESTART STREAM
// =====================================================

function restartStream() {

    if (restarting) return;

    restarting = true;

    console.log(
        "🔄 Stream wird neu gestartet..."
    );

    try {
        if (ytProcess) {
            ytProcess.kill("SIGKILL");
        }
    } catch {}

    try {
        if (ffmpegProcess) {
            ffmpegProcess.kill("SIGKILL");
        }
    } catch {}

    setTimeout(() => {

        restarting = false;

        startStream();

    }, 5000);
}

// =====================================================
// AUDIO ENDE
// =====================================================

player.on(
    AudioPlayerStatus.Idle,
    () => {

        console.log(
            "🔁 Audio beendet – starte erneut."
        );

        restartStream();
    }
);

// =====================================================
// AUDIO ERROR
// =====================================================

player.on(
    "error",
    error => {

        console.error(
            "❌ Discord Audio Fehler:",
            error.message
        );

        restartStream();
    }
);

// =====================================================
// VOICE CONNECTION
// =====================================================

async function connectVoice() {

    try {

        const guild =
            await client.guilds.fetch(
                GUILD_ID
            );

        const channel =
            await guild.channels.fetch(
                VOICE_CHANNEL_ID
            );

        if (!channel) {
            throw new Error(
                "Voice-Channel nicht gefunden."
            );
        }

        if (
            channel.type !==
            ChannelType.GuildVoice
        ) {
            throw new Error(
                "Der Channel ist kein Voice-Channel."
            );
        }

        console.log(
            `🔊 Verbinde mit ${channel.name}...`
        );

        connection =
            joinVoiceChannel({

                channelId:
                    channel.id,

                guildId:
                    guild.id,

                adapterCreator:
                    guild.voiceAdapterCreator,

                selfDeaf: true,
                selfMute: false
            });

        connection.subscribe(
            player
        );

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            30000
        );

        console.log(
            "✅ Voice verbunden!"
        );

        startStream();

        // =================================================
        // DISCONNECT HANDLING
        // =================================================

        connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {

                console.log(
                    "⚠️ Voice getrennt!"
                );

                try {

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
                        "🔄 Verbindung wird wiederhergestellt..."
                    );

                } catch {

                    console.log(
                        "❌ Reconnect notwendig."
                    );

                    try {
                        connection.destroy();
                    } catch {}

                    connection = null;

                    setTimeout(
                        connectVoice,
                        5000
                    );
                }
            }
        );

    } catch (error) {

        console.error(
            "❌ Voice Fehler:",
            error.message
        );

        setTimeout(
            connectVoice,
            10000
        );
    }
}

// =====================================================
// READY
// =====================================================

client.once(
    "ready",
    async () => {

        console.log(
            `🤖 Eingeloggt als ${client.user.tag}`
        );

        await connectVoice();
    }
);

// =====================================================
// SHUTDOWN
// =====================================================

function shutdown() {

    console.log(
        "🛑 Bot wird beendet..."
    );

    try {
        if (ytProcess) {
            ytProcess.kill("SIGKILL");
        }
    } catch {}

    try {
        if (ffmpegProcess) {
            ffmpegProcess.kill("SIGKILL");
        }
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
    "SIGINT",
    shutdown
);

process.on(
    "SIGTERM",
    shutdown
);

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);

