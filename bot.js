const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./Config/config.json');
require('dotenv').config();

const axios = require('axios');
const fs = require('node:fs');
const OS = require('os');
const path = require('node:path');
let enmap;
(async () => {
    enmap = (await import("enmap")).default;
})();
const Cleverbot = require('clevertype').Cleverbot;
const { delay } = require("./Handlers/functions")
const Events = require("events");
const emojis = require("./Config/emojis.json")
const { generateAndPublishTemplate } = require('./Handlers/generateAndPublishTemplate'); // Sjekk stien!

const logging = require("./Helpers/logging")
const TwitchMonitor = require("./Handlers/twitch-monitor");
const YoutubeMonitor = require("./Handlers/youtube-monitor");
const DiscordChannelSync = require("./Handlers/discord-channel-sync");
const LiveEmbed = require('./Handlers/live-embed');
const MiniDb = require('./Config/minidb');
const welcome = require('./Handlers/welcome');
const rules = require('./Handlers/rules');
const verify = require('./Handlers/verify');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds, 
		GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildPresences, 
		GatewayIntentBits.GuildMessageReactions, 
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent
	], 
	partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction] 
});

client.settings = new Map();

// Initialiser guild-innstillinger
function initializeGuildSettings(guild) {
    if (!client.settings.has(guild.id)) {
        client.settings.set(guild.id, { MUSIC: true, embed: ee, language: "en" });
    }
}

client.on("guildCreate", initializeGuildSettings);
client.guilds.cache.forEach(initializeGuildSettings);

welcome(client)
rules(client)
verify(client)



/**********************************************************
 * @param {5} create_the_languages_objects to select via CODE
 *********************************************************/
client.la = {};
const langs = fs.readdirSync("./Languages");
for (const lang of langs.filter((file) => file.endsWith(".json"))) {
  client.la[`${lang.split(".json").join("")}`] = require(`./Languages/${lang}`);
}
Object.freeze(client.la);

/**********************************************************
 * @param {6} Raise_the_Max_Listeners to 0 (default 10)
 *********************************************************/
client.setMaxListeners(0);
Events.defaultMaxListeners = 0;
process.env.UV_THREADPOOL_SIZE = OS.cpus().length;

/**********************************************************
 * @param {8} LOAD_the_BOT_Functions
 *********************************************************/
async function requirehandlers() {
    const handlers = ['slashCommand', 'events', 'loaddb', 'erelahandler', 'autoPublish'];
    const slashCommandResults = [];
    const eventResults = [];

    for (const handler of handlers) {
        try {
            console.log(`Loading handler: ${handler}`);
            const module = await import(`./Handlers/${handler}.js`);
            if (typeof module.default === 'function') {
                await module.default(client);
                if (handler === 'slashCommand') {
                    client.slashCommands.forEach((command) => {
                        console.log("Inspeksjon av kommando:", command); // Debugging
                        if (command && command.data && command.data.name) {
                            slashCommandResults.push({ Name: command.data.name, Status: '✅' });
                        } else {
                            console.warn("Fant en slash-kommando uten navn:", command);
                        }
                    });
                } else if (handler === 'events') {
                    client.events.forEach((event) => {
                        console.log("Inspeksjon av event:", event); // Debugging
                        if (event && event.name) {
                            eventResults.push({ Name: event.name, Status: '✅' });
                        } else {
                            console.warn("Fant et event uten navn:", event);
                        }
                    });
                }
            } else if (typeof module === 'function') {
                await module(client);
            } else {
                console.error(`Error loading handler ${handler}: module.default is not a function`);
            }
        } catch (e) {
            console.error(`Error loading handler ${handler}:`, e);
        }
    }

    // Debugging: Sjekk innholdet i resultatene
    console.log("Debugging slashCommandResults:", slashCommandResults);
    console.log("Debugging eventResults:", eventResults);

    // Vis tabell for slashCommands
    console.log('0========================0');
    console.log('| Slash Commands | Stats |');
    console.log('|================|=======|');
    slashCommandResults.forEach(result => {
        console.log(`| ${result.Name.padEnd(14)} | ${result.Status}     |`);
    });
    console.log('0========================0');

    // Vis tabell for events
    console.log('0===========================0');
    console.log('|      Events       | Stats |');
    console.log('|===================|=======|');
    eventResults.forEach(result => {
        console.log(`| ${result.Name.padEnd(17)} | ${result.Status}     |`);
    });
    console.log('0===========================0');
}
requirehandlers();

   // --- Startup ---------------------------------------------------------------------------------------------------------
   console.log('Testbot is starting.');
   try {
       //code
   } catch (error) {
       //error code for example
       console.log('an error has occurred');
       //if you want no error has occurred log
       console.log('');
       // ^ will not log anything
   }

   // --- Cleverbot init --------------------------------------------------------------------------------------------------
   let cleverbot = null;

   if (config.cleverbot_token) {
       cleverbot = new Cleverbot({
           apiKey: config.cleverbot_token,
           emotion: 0,
           engagement: 0,
           regard: 100
       }, true);
   }

    // --- Discord ---------------------------------------------------------------------------------------------------------
    logging.discord('Connecting to Discord...');

    let targetChannels = [];
    let syncServerList = (logMembership) => {
        targetChannels = DiscordChannelSync.getChannelList(client, config.discord_announce_channel, logMembership);
    };

    client.on('ready', () => {
        logging.discord(`Bot is ready; logged in as ${client.user.tag}.`);

        // Init list of connected servers, and determine which channels we are announcing to
        syncServerList(true);

        // Keep our activity in the user list in sync
        StreamActivity.init(client);

        // Begin Twitch API polling
        TwitchMonitor.start();

        // Activate Youtube integration
        YoutubeMonitor.start(client);
    });

    client.on("guildCreate", guild => {
        logging.discord(`Joined new server: ${guild.name}`);
        syncServerList(false);
    });

    client.on("guildDelete", guild => {
        logging.discord(`Removed from a server: ${guild.name}`);
        syncServerList(false);
    });

    logging.discord('Logging in...');
    client.commands = new Collection();
    client.aliases = new Collection();
    client.slashCommands = new Collection();
    client.prefix = config.prefix;

    module.exports = client;

    (async () => {
        // Liste over maler du vil opprette ved oppstart
        const initialTemplates = [
            { navn: 'twitch-live-varsling', beskrivelse: 'Mal for Twitch live-varslinger' },
            { navn: 'youtube-varsling', beskrivelse: 'Mal for YouTube-varslinger' },
            { navn: 'musikk-bot', beskrivelse: 'Mal for en musikkbot' },
        ];

        for (const template of initialTemplates) {
            console.log(`Oppretter mal ved oppstart: ${template.navn}`);
            // Simulerer et 'interaction'-lignende struktur
            const mockInteraction = {
                reply: async (content) => console.log(`Simulert reply: ${content}`),
                editReply: async (content) => console.log(`Simulert editReply: ${content}`),
                client: client, // Gi tilgang til klienten om nødvendig
                deferReply: async () => {}, // Legg til en tom deferReply-funksjon
            };
            try {
                await generateAndPublishTemplate(mockInteraction, template.navn, template.beskrivelse);
            } catch (error) {
                console.error(`Feil under opprettelse av malen ${template.navn}:`, error);
            }
        }

        console.log('Initial opprettelse av maler fullført (eller forsøkt).');
    })();

    // Start boten
    client.login(config.discord_bot_token);

// Activity updater
class StreamActivity {
    /**
     * Registers a channel that has come online, and updates the user activity.
     */
    static setChannelOnline(stream) {
        this.onlineChannels[stream.user_name] = stream;

        this.updateActivity();
    }

    /**
     * Marks a channel has having gone offline, and updates the user activity if needed.
     */
    static setChannelOffline(stream) {
        delete this.onlineChannels[stream.user_name];

        this.updateActivity();
    }

    /**
     * Fetches the channel that went online most recently, and is still currently online.
     */
    static getMostRecentStreamInfo() {
        let lastChannel = null;
        for (let channelName in this.onlineChannels) {
            if (typeof channelName !== "undefined" && channelName) {
                lastChannel = this.onlineChannels[channelName];
            }
        }
        return lastChannel;
    }

    /**
     * Updates the user activity on Discord.
     * Either clears the activity if no channels are online, or sets it to "watching" if a stream is up.
     */
    static updateActivity() {
        let streamInfo = this.getMostRecentStreamInfo();

        if (streamInfo) {
            this.discordClient.user.setActivity(streamInfo.user_name, {
                "url": `https://twitch.tv/${streamInfo.user_name.toLowerCase()}`,
                "type": "STREAMING"
            });

            logging.stream(`Update current activity: watching ${streamInfo.user_name}.`);
        } else {
            logging.stream('Cleared current activity.');

            this.discordClient.user.setActivity(null);
        }
    }

    static init(discordClient) {
        this.discordClient = discordClient;
        this.onlineChannels = { };

        this.updateActivity();

        // Continue to update current stream activity every 5 minutes or so
        // We need to do this b/c Discord sometimes refuses to update for some reason
        // ...maybe this will help, hopefully
        setInterval(this.updateActivity.bind(this), 5 * 60 * 1000);
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Live events

let liveMessageDb = new MiniDb('live-messages');
let messageHistory = liveMessageDb.get("history") || { };

TwitchMonitor.onChannelLiveUpdate((streamData) => {
    const isLive = streamData.type === "live";

    // Refresh channel list
    try {
        syncServerList(false);
    } catch (e) { }

    // Update activity
    StreamActivity.setChannelOnline(streamData);

    // Generate message
let msgFormatted = config.messages["live_message"];

if (msgFormatted) {
    // Replace placeholders and send the message
    msgFormatted = msgFormatted.replace("{streamer_name}", streamData.user_name);
    msgFormatted = msgFormatted.replace("{stream_url}", `https://www.twitch.tv/${streamData.user_login}`);
} else {
    console.error("Error: 'live_message' not found in config.json");
}

let msgFormattedEnd = config.messages["end_message"]; // Viktig: endre const til let
const msgEmbed = LiveEmbed.createForStream(streamData);

if (msgFormattedEnd) {
    // Replace placeholders and send the message
    msgFormattedEnd = msgFormattedEnd.replace("{streamer_name}", streamData.user_name);
    msgFormattedEnd = msgFormattedEnd.replace("{stream_url}", `https://www.twitch.tv/${streamData.user_login}`); // Legg til denne linjen
} else {
    console.error("Error: 'end_message' not found in config.json");
}

    // Broadcast to all target channels
    let anySent = false;

    for (let i = 0; i < targetChannels.length; i++) {
        const discordChannel = targetChannels[i];
        const liveMsgDiscrim = `${discordChannel.guild.id}_${discordChannel.name}_${streamData.id}`;

        if (discordChannel) {
            try {
                // Either send a new message, or update an old one
                let existingMsgId = messageHistory[liveMsgDiscrim] || null;

                if (existingMsgId) {
                    // Fetch existing message
                    discordChannel.messages.fetch(existingMsgId)
                      .then((existingMsg) => {
                        existingMsg.edit({content: msgFormatted, embeds: [msgEmbed]}).then((message) => {
                          // Clean up entry if no longer live
                          if (!isLive) {
                            existingMsg.edit({content: msgFormattedEnd,embeds:[msgEmbed]})
                            delete messageHistory[liveMsgDiscrim];
                            liveMessageDb.put('history', messageHistory);
                          }
                        });
                      })
                      .catch((e) => {
                        // Unable to retrieve message object for editing
                        if (e.message === "Unknown Message") {
                            // Specific error: the message does not exist, most likely deleted.
                            delete messageHistory[liveMsgDiscrim];
                            liveMessageDb.put('history', messageHistory);
                            // This will cause the message to be posted as new in the next update if needed.
                        }
                      });
                } else {
                    // Sending a new message
                    if (!isLive) {
                        // We do not post "new" notifications for channels going/being offline
                        continue;
                    }

                    // Expand the message with a @mention for "here" or "everyone"
                    // We don't do this in updates because it causes some people to get spammed
                    let mentionMode = (config.discord_mentions && config.discord_mentions[streamData.user_name.toLowerCase()]) || null;

                    if (mentionMode) {
                        mentionMode = mentionMode.toLowerCase();

                        if (mentionMode === "everyone" || mentionMode === "here") {
                            // Reserved @ keywords for discord that can be mentioned directly as text
                            mentionMode = `@${mentionMode}`;
                        } else {
                            // Most likely a role that needs to be translated to <@&id> format
                            let roleData = discordChannel.guild.roles.cache.find((role) => {
                                return (role.name.toLowerCase() === mentionMode);
                            });

                            if (roleData) {
                                mentionMode = `<@&${roleData.id}>`;
                            } else {
                                logging.error('[Discord]',`Cannot mention role: ${mentionMode}`, `(does not exist on server ${discordChannel.guild.name})`);
                                mentionMode = null;
                            }
                        }
                    }

                    let msgToSend = msgFormatted;

                    if (mentionMode) {
                        msgToSend = msgFormatted + ` ${mentionMode}`
                    }

                    discordChannel.send({content: msgToSend,embeds: [msgEmbed]})
                        .then((message) => {
                            logging.discord(`Sent announce msg to #${discordChannel.name} on ${discordChannel.guild.name}`)

                            messageHistory[liveMsgDiscrim] = message.id;
                            liveMessageDb.put('history', messageHistory);
                        })
                        .catch((err) => {
                            logging.error('[Discord]',`Could not send announce msg to #${discordChannel.name} on ${discordChannel.guild.name}:`, err.message);
                        });
                }

                anySent = true;
            } catch (e) {
                logging.error('[Discord]','Message send problem:', e);
            }
        }
    }

    liveMessageDb.put('history', messageHistory);
    return anySent;
});

TwitchMonitor.onChannelOffline((streamData) => {
    // Update activity
    StreamActivity.setChannelOffline(streamData);
});

// --- Common functions ------------------------------------------------------------------------------------------------
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

String.prototype.spacifyCamels = function () {
    let target = this;

    try {
        return target.replace(/([a-z](?=[A-Z]))/g, '$1 ');
    } catch (e) {
        return target;
    }
};

Array.prototype.joinEnglishList = function () {
    let a = this;

    try {
        return [a.slice(0, -1).join(', '), a.slice(-1)[0]].join(a.length < 2 ? '' : ' and ');
    } catch (e) {
        return a.join(', ');
    }
};

String.prototype.lowercaseFirstChar = function () {
    let string = this;
    return string.charAt(0).toUpperCase() + string.slice(1);
};

Array.prototype.hasEqualValues = function (b) {
    let a = this;

    if (a.length !== b.length) {
        return false;
    }

    a.sort();
    b.sort();

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}