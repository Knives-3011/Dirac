const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { token } = require('./config.json');
const fs = require("fs");
const moment = require("moment-timezone");

// File paths
const countdownsFile = "./countdowns.json";
const hostersFile = "./hosters.json";

// Allowed farm channels
const FARM_CHANNELS = new Set(["lf1","lf2","lf3","lf4","lf5"]);
const isFarmChannel = (ch) => ch && FARM_CHANNELS.has((ch.name || "").toLowerCase());


// Load JSON safely
function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path, "utf8"));
}
function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// Globals
let countdowns = loadJSON(countdownsFile);
let hosters = loadJSON(hostersFile);

// Save helpers
function saveCountdowns() {
  saveJSON(countdownsFile, countdowns);
}
function saveHosters() {
  saveJSON(hostersFile, hosters);
}

// Logging channel
const LOG_CHANNEL_ID = "1408696241461661796";
function logAction(client, msg) {
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) logChannel.send(msg).catch(() => {});
}

// Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // Reset countdowns on restart
  countdowns = {};
  saveCountdowns();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Time Command
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

  // Countdown Commands
  if (message.content.toLowerCase() === "!countdown") {
    const channelId = message.channel.id;

    if (!isFarmChannel(message.channel)) {
      return message.reply("⚠️ You can only start countdowns in #lf1–#lf5.");
    }

    if (countdowns[channelId]) {
      return message.reply("⚠️ A countdown is already active in this channel.");
    }

    const now = Math.floor(Date.now() / 1000);
    const endTime = now + 3600;
    const authorId = message.author.id;
    const authorName = (authorId === "987401902234951790") ? "greener" : message.author.username;

    countdowns[channelId] = {
      endTime,
      authorId,
      authorName,
      startTime: now
    };
    saveCountdowns();

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🕒 Game Countdown")
      .setDescription(
        [
          `# **Game ends <t:${endTime}:R> (<t:${endTime}:t>)**`,
          `# **Started by: ${authorName}**`,
          `# **We are full. No more spots available.**`,
          `# **Please go to another channel.**`,
        ].join("\n")
      )
      .setTimestamp();

    const sentMsg = await message.reply({ embeds: [embed] });

    // Auto end after 1h
    setTimeout(() => {
      if (countdowns[channelId]) {
        endCountdown(channelId, client, sentMsg);
      }
    }, 3600000);

    logAction(client, `⏳ Farm started in <#${channelId}> by **${authorName}**.`);
  }
  if (message.content.toLowerCase() === "!status") {
    if (Object.keys(countdowns).length === 0) {
      return message.reply("✅ No active countdowns.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle("⏳ Active Countdowns")
      .setTimestamp();

    for (const [channelId, data] of Object.entries(countdowns)) {
      embed.addFields({
        name: `Channel <#${channelId}>`,
        value: `Ends <t:${data.endTime}:R> (<t:${data.endTime}:t>)`,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  }
  if (message.content.toLowerCase() === "!endcountdown") {
    const channelId = message.channel.id;
    if (!isFarmChannel(message.channel)) {
      return message.reply("⚠️ You can only end countdowns in #lf1–#lf5.");
    }
    if (!countdowns[channelId]) {
      return message.reply("⚠️ No active countdown in this channel.");
    }
    await endCountdown(channelId, client, message);
  }

  // Leaderboard Commands
  if (message.content.toLowerCase() === "!resetleaderboard") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can reset the leaderboard.");
    }
    hosters = {};
    saveHosters();
    message.reply("✅ Leaderboard has been reset.");
    logAction(client, `🗑️ Leaderboard was reset by **${message.author.username}**.`);
  }
  if (message.content.toLowerCase() === "!leaderboard") {
  const entries = Object.entries(hosters);

  if (entries.length === 0) {
    return message.reply("📉 No hosting data yet.");
  }

  // Sort by total time DESC, then by count DESC
  const sorted = entries
    .sort((a, b) => {
      const ta = (a[1].time ?? 0);
      const tb = (b[1].time ?? 0);
      if (tb !== ta) return tb - ta;
      return (b[1].count ?? 0) - (a[1].count ?? 0);
    })
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 Top Hosts Leaderboard")
    .setDescription("Ranked by total hosted time.")
    .setTimestamp();

  let rank = 1;
  for (const [, data] of sorted) {
    const minutes = data.time ?? 0;
    const hours = Math.floor(minutes / 60);
    const mins  = minutes % 60;
    const sessions = data.count ?? 0;

    embed.addFields({
      name: `#${rank} — ${data.tag}`,
      value: `⏱️ **${hours}h ${mins}m** total\n🎮 **${sessions}** sessions`,
      inline: false,
    });
    rank++;
  }

  await message.reply({ embeds: [embed] });
  }

  //  Non core commands
  // !help command
  if (message.content.toLowerCase() === "!help") {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle("📖 Bot Commands")
      .setDescription("Here are the available commands and how they work:")
      .addFields(
        { name: "🕒 `!time`", value: "Shows the current time in major cities." },
        { name: "⏳ `!countdown`", value: "Starts a 1-hour countdown for the farm." },
        { name: "📊 `!status`", value: "Shows all active countdowns per farm channel." },
        { name: "🛑 `!endcountdown`", value: "Ends the countdown early in the current channel." },
        { name: "🎯 `!dps`", value: "Breaks down which dps are high, mid, and low." },
        { name: "🗑️ `!resetleaderboard`", value: "Admins only: resets the leaderboard completely." },
        { name: "ℹ️ `!help`", value: "Displays this help menu." }
      )
      .setFooter({ text: "Use these commands in chat to interact with the bot." });

    await message.reply({ embeds: [helpEmbed] });
  }
  if (message.content.toLowerCase() === "!dps") {
    const file = new AttachmentBuilder("dps.png");
    await message.channel.send({ files: [file] });
  }
  if (message.content.toLowerCase()=== "!pingtankfarm") {
    let farmMessage = `# <@&1408954759754285106> Need all roles for 3-3-6 farm. CANNOT FULLY AFK. <@&1408951460984782909> <@&1408951531381723236> <@&1408951564965646447>`;

    await message.channel.send(farmMessage);
  }
  if (message.content.toLowerCase() === '!sybau') {
    message.reply("https://tenor.com/view/sybau-ts-pmo-gif-2102579015947246168")
  }
});

// Helper: end countdown
async function endCountdown(channelId, client, triggerMsg) {
  const countdown = countdowns[channelId];
  if (!countdown) return;

  const elapsedSeconds = Math.floor(Date.now() / 1000) - countdown.startTime;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  // Update leaderboard
  if (!hosters[countdown.authorId]) {
    hosters[countdown.authorId] = { tag: countdown.authorName, count: 0, time: 0 };
  }
  hosters[countdown.authorId].count += 1;
  hosters[countdown.authorId].time += elapsedMinutes;
  saveHosters();

  // Delete countdown
  delete countdowns[channelId];
  saveCountdowns();

  const redFlag = elapsedMinutes < 5 ? " 🚩" : "";
  const embedColor = elapsedMinutes < 5 ? 0xff0000 : 0x00FF00; // red if flagged, orange otherwise

  // Build embed log
  const logEmbed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle("⏹️ Farm ended")
    .setDescription(
      `Channel: <#${channelId}>\n` +
      `Host: **${countdown.authorName}**\n` +
      `Duration: **${elapsedMinutes} minutes**${redFlag}\n` +
      `Total Time: ${Math.floor(hosters[countdown.authorId].time / 60)}h ${hosters[countdown.authorId].time % 60}m`
    )
    .setTimestamp();

  // Send to logging channel
  const logChannel = client.channels.cache.get("1408696241461661796");
  if (logChannel) await logChannel.send({ embeds: [logEmbed] });

  if (triggerMsg.reply) {
    await triggerMsg.reply(`⏹️ Farm ended. Hosted for ${elapsedMinutes} minutes.`);
  }
}

// Login
client.login(token);
