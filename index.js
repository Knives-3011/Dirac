const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { token } = require('./config.json');
const moment = require("moment-timezone");
const fs = require("fs");

// Create a new client instance
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Track active countdowns (resets when bot restarts)
let countdowns = {
  lf1: null,
  lf2: null,
  lf3: null,
  lf4: null,
  lf5: null,
};
function logAction(client, description) {
    const logChannel = client.channels.cache.get("1408696241461661796");
    if (logChannel) {
      logChannel.send(description).catch(() => {});
    }
  }
// File to store host counts
const HOSTERS_FILE = "./hosters.json";

// Load host data or initialize
let hosters = {};
if (fs.existsSync(HOSTERS_FILE)) {
  hosters = JSON.parse(fs.readFileSync(HOSTERS_FILE, "utf8"));
}

// Save host data
function saveHosters() {
  fs.writeFileSync(HOSTERS_FILE, JSON.stringify(hosters, null, 2));
}

// When bot is ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Respond to messages
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // -------- TIME COMMAND --------
  if (message.content.toLowerCase() === "!time") {
    const times = {
      "🇧🇷 São Paulo": moment().tz("America/Sao_Paulo").format("HH:mm:ss"),
      "🇸🇦 Dammam": moment().tz("Asia/Riyadh").format("HH:mm:ss"),
      "🇵🇱 Warsaw": moment().tz("Europe/Warsaw").format("HH:mm:ss"),
      "🇯🇵 Tokyo": moment().tz("Asia/Tokyo").format("HH:mm:ss"),
      "🇦🇺 Sydney": moment().tz("Australia/Sydney").format("HH:mm:ss"),
      "🇸🇬 Singapore": moment().tz("Asia/Singapore").format("HH:mm:ss"),
      "🇺🇸 Oregon": moment().tz("America/Los_Angeles").format("HH:mm:ss"),
      "🇺🇸 Dallas": moment().tz("America/Chicago").format("HH:mm:ss"),
      "🇺🇸 Virginia": moment().tz("America/New_York").format("HH:mm:ss"),
      "🇩🇪 Frankfurt": moment().tz("Europe/Berlin").format("HH:mm:ss"),
    };

    const embed = new EmbedBuilder()
      .setColor(0x1e90ff)
      .setTitle("🕒 Current World Times")
      .setDescription("Here are the current local times in selected cities:")
      .setTimestamp();

    for (const [city, time] of Object.entries(times)) {
      embed.addFields({ name: city, value: `\`${time}\``, inline: true });
    }

    await message.reply({ embeds: [embed] });
  }

  // -------- COUNTDOWN COMMAND --------
  if (message.content.toLowerCase().startsWith("!countdown")) {
    const channelName = message.channel.name.toLowerCase();

    if (!countdowns.hasOwnProperty(channelName)) {
      return message.reply("⚠️ You can only start countdowns in lf1 - lf5 channels.");
    }

    if (countdowns[channelName]) {
      return message.reply("⚠️ A countdown is already active in this channel.");
    }
    

    const now = Math.floor(Date.now() / 1000);
    const endTime = now + 3600; // 1 hour
    countdowns[channelName] = endTime;

    // Track author name
    let authorName = message.author.tag;
    if (message.author.id === "987401902234951790") {
      authorName = "greener";
    }

    logAction(client, `⏳ Farm started by **${authorName}** in <#${message.channel.id}>.`);

    // -------- INCREMENT HOST COUNT --------
    if (!hosters[message.author.id]) {
      hosters[message.author.id] = { tag: message.author.tag, count: 0 };
    }
    hosters[message.author.id].count += 1;
    saveHosters();

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🕒 Game Countdown")
      .setAuthor({ 
        name: `Started by ${authorName}`, 
        iconURL: message.author.displayAvatarURL() 
      })
      .setDescription(
        [
          `# **Game ends <t:${endTime}:R>**`,
          `# **Exact End Time: <t:${endTime}:f>**`,
          `# **We are full. No more spots available.**`,
          `# **Please go to another channel.**`,
        ].join("\n")
      )
      .setTimestamp();

    const sentMsg = await message.reply({ embeds: [embed] });

    setTimeout(() => {
      logAction(client, `⌛ Countdown in <#${message.channel.id}> expired after 1 hour.`);
      sentMsg.delete().catch(() => {});
      countdowns[channelName] = null;
    }, 3600000);

    message.delete().catch(() => {}); // delete command message
  }
  // SYBAU 
  if (message.content.toLowerCase() === '!sybau') {
    message.reply("https://tenor.com/view/sybau-ts-pmo-gif-2102579015947246168")
  }

  // -------- STATUS COMMAND --------
  if (message.content.toLowerCase() === "!status") {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("📊 Lord Farming Status")
      .setDescription("Here are the active countdowns for each farm channel:")
      .setTimestamp();

    for (const [farm, endTime] of Object.entries(countdowns)) {
      if (endTime) {
        embed.addFields({
          name: farm.toUpperCase(),
          value: `⏳ Ends <t:${endTime}:R>`,
          inline: false,
        });
      } else {
        embed.addFields({
          name: farm.toUpperCase(),
          value: "✅ No active session",
          inline: false,
        });
      }
    }

    await message.reply({ embeds: [embed] });
  }

  // -------- END COMMAND --------
  if (message.content.toLowerCase() === "!end") {
    const channelName = message.channel.name.toLowerCase();

    if (!countdowns.hasOwnProperty(channelName)) {
      return message.reply("⚠️ You can only end countdowns in lf1 - lf5 channels.");
    }

    if (!countdowns[channelName]) {
      return message.reply("⚠️ No active countdown to end in this channel.");
    }
    authorName = message.author.tag
    logAction(client, `🛑 Countdown manually ended by **${message.author.username}** in <#${message.channel.id}>.`);

    countdowns[channelName] = null;
    await message.reply(`🛑 Countdown ended manually in **${channelName.toUpperCase()}**.`);
    message.delete().catch(() => {}); // delete command message
  }

  // -------- DPS COMMAND --------
  if (message.content.toLowerCase() === "!dps") {
    const file = new AttachmentBuilder("dps.png");
    await message.channel.send({ files: [file] });
  }

  // -------- LEADERBOARD COMMAND --------
  if (message.content.toLowerCase() === "!leaderboard") {
    const sorted = Object.entries(hosters)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    if (sorted.length === 0) {
      return message.reply("📉 No one has hosted a countdown yet.");
    }

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🏆 Top Hosters Leaderboard")
      .setDescription("Here are the top countdown starters:")
      .setTimestamp();

    let rank = 1;
    for (const [id, data] of sorted) {
      embed.addFields({
        name: `#${rank} — ${data.tag}`,
        value: `Hosted **${data.count}** times`,
        inline: false,
      });
      rank++;
    }

    await message.reply({ embeds: [embed] });
    }

  if (message.content.toLowerCase() === "!resetleaderboard") {
    // Check if user has admin perms
        if (message.member.permissions.has("Administrator") || message.author.id === 1029305942313021520) {
            hosters = {}; // clear memory
            saveHosters(); // overwrite file with empty object
            logAction(client, `🗑️ Leaderboard was reset by **${message.author.username}**.`);
            return message.reply("✅ Leaderboard has been reset.");
            
        }
        else{
        return message.reply("❌ Come back to this command later, greener");
        }
    }

  // -------- HELP COMMAND --------
  if (message.content.toLowerCase() === "!help") {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle("📖 Bot Commands")
      .setDescription("Here are the available commands and how they work:")
      .addFields(
        {
          name: "🕒 `!time`",
          value: "Shows the current time in various regions.",
        },
        {
          name: "⏳ `!countdown` (Hosts only)",
          value: "Starts a 1-hour countdown in **lf1-lf5**. Only one active countdown per channel.",
        },
        {
          name: "📊 `!status`",
          value: "Lists all active countdowns across lf1-lf5.",
        },
        {
          name: "🛑 `!end`",
          value: "Ends the countdown for the current lord farm channel.",
        },
        {
          name: "🎯 `!dps`",
          value: "Sends the DPS image breakdown.",
        },
        {
          name: "🏆 `!leaderboard`",
          value: "Shows the top hosters who have started farms.",
        },
        {
            name: "🗑️ `!resetleaderboard` (Admins Only)",
            value: "Reset the leaderboard for hosts",
        },
        {
          name: "ℹ️ `!help`",
          value: "Displays this help menu with all available commands.",
        }
      )
      .setFooter({ text: "Use these commands in chat to interact with the bot." });

    await message.reply({ embeds: [helpEmbed] });
  }
});

// Log in to Discord with your client's token
client.login(token);
