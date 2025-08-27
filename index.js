const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const { token } = require('./config.json');
const fs = require("fs");
const moment = require("moment-timezone");
const path = require("path");

// File paths
const countdownsFile = "./countdowns.json";
const hostersFile = "./hosters.json";
const sessionHostersFile = "./sessionHosters.json";

function loadSessionHosters() {
  if (fs.existsSync(sessionHostersFile)) {
    return JSON.parse(fs.readFileSync(sessionHostersFile, "utf8"));
  }
  return {};
}

function saveSessionHosters() {
  fs.writeFileSync(sessionHostersFile, JSON.stringify(sessionHosters, null, 2));
}

let sessionHosters = loadSessionHosters();

const sessionsFile = "./sessions.json";

function loadSessions() {
  if (fs.existsSync(sessionsFile)) {
    return JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
  }
  return {};
}

function saveSessions() {
  fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
}

// sessions keyed by userId
let sessions = loadSessions();



// Allowed farm channels
// Allowed farm channels: lord-farm-1 → lord-farm-10
const isFarmChannel = (ch) => {
  if (!ch || !ch.name) return false;
  const name = ch.name.toLowerCase().replace("⚡┃", "");
  return /^lord-farm-(?:[1-9]|10)$/.test(name);
};

const balancesPath = path.join(__dirname, "balances.json");
let balances = {};

if (fs.existsSync(balancesPath)) {
  balances = JSON.parse(fs.readFileSync(balancesPath, "utf8"));
}

function saveBalances() {
  fs.writeFileSync(balancesPath, JSON.stringify(balances, null, 2));
}

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
let countdownTimers = {}; // store active timers
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
  // Time Commands
  const restrictedRoles = [
    1408951460984782909,    // replace with real ID
    1408951531381723236, // replace with real ID
    1408951564965646447    // replace with real ID
  ];

  // Only apply restriction if the user does NOT have ViewAuditLog permission
  if (!message.member.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
    if (message.mentions.roles.size > 0) {
      const restrictedMention = message.mentions.roles.find(role =>
        role.name === "duelist" || role.name === "strategist" || role.name === "vanguard"
      );
      if (restrictedMention && message.channel.name !== "lf-lord-farm") {
        try {
          await message.delete();
          await message.channel.send(
            `⚠️ ${message.author}, you can only ping **${restrictedMention.name}** in **#lf-lord-farm**.`
          );
        } catch (err) {
          console.error("Failed to delete restricted ping:", err);
        }
        return; // stop here so commands don't trigger
      }
    }
  }
  
  
  if (message.content.toLowerCase() === "?time") {
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
  if (message.content.toLowerCase() === "?countdown") {
    const channelId = message.channel.id;

    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      return message.reply("❌ Do not have the permission to start a farm");
    }
    if (!isFarmChannel(message.channel)) {
      return message.reply("⚠️ You can only start farm countdowns in #lord-farm-1 to #lord-farm-10");
    }

    if (countdowns[channelId]) {
      return message.reply("⚠️ A farm is already active in this channel.");
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

    countdownTimers[channelId] = setTimeout(() => {
      if (countdowns[channelId]) {
        endCountdown(channelId, client, sentMsg);
      }
    }, 10000);

    logAction(client, `⏳ Farm started in <#${channelId}> by **${authorName}**.`);
  }
  if (message.content.toLowerCase() === "?status") {
    if (Object.keys(countdowns).length === 0) {
      return message.reply("✅ No active farms.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle("⏳ Active farms")
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
  if (message.content.toLowerCase() === "?endcountdown") {
    const channelId = message.channel.id;
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      return message.reply("❌ Do not have the permission to end a farm");
    }
    if (!isFarmChannel(message.channel)) {
      return message.reply("⚠️ You can only end countdowns in #lord-farm-1 to #lord-farm-10");
    }
    if (!countdowns[channelId]) {
      return message.reply("⚠️ No active countdown in this channel.");
    }
    await endCountdown(channelId, client, message);
  }

  // Leaderboard Commands/
  if (message.content.toLowerCase() === "?resetleaderboard") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can reset the leaderboard.");
    }
    hosters = {};
    saveHosters();
    message.reply("✅ Leaderboard has been reset.");
    logAction(client, `🗑️ Leaderboard was reset by **${message.author.username}**.`);
  }
  if (message.content.toLowerCase() === "?leaderboard") {
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

  // Money Commands
  // add money (admin only)
  if (message.content.toLowerCase().startsWith("?pay")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You do not have permission to use this command.");
    }
  
    const args = message.content.trim().split(/ +/).slice(1);
    const user = message.mentions.users.first();
    const amount = parseFloat(args[1]);
  
    if (!user || isNaN(amount)) {
      return message.reply("❌ Usage: `!addmoney @user <amount>`");
    }
  
    if (!balances[user.id]) balances[user.id] = { balance: 0 };
    balances[user.id].balance += amount;
    saveBalances();
  
    message.channel.send(`💰 Added **$${amount.toFixed(2)}** to ${user.username}'s account. New balance: **$${balances[user.id].balance.toFixed(2)}**`);
  }
  // Subtract money (admin only)
  if (message.content.toLowerCase().startsWith("?paid")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You do not have permission to use this command.");
    }
  
    const args = message.content.trim().split(/ +/).slice(1);
    const user = message.mentions.users.first();
    const amount = parseFloat(args[1]);
  
    if (!user || isNaN(amount)) {
      return message.reply("❌ Usage: `!pay @user <amount>`");
    }
  
    if (!balances[user.id]) balances[user.id] = { balance: 0 };
    balances[user.id].balance -= amount;
    saveBalances();
  
    message.channel.send(`💸 Subtracted **$${amount.toFixed(2)}** from ${user.username}'s account. New balance: **$${balances[user.id].balance.toFixed(2)}**`);
  }
  // Check balance (admin can check anyone, users can only check their own)
  if (message.content.toLowerCase().startsWith("!balance")) {
    const args = message.content.trim().split(/ +/).slice(1);
    let user = message.mentions.users.first() || message.author;
  
    if (user.id !== message.author.id && !message.member.permissions.has("ADMINISTRATOR")) {
      return message.reply("❌ You can only check your own balance.");
    }
  
    if (!balances[user.id]) balances[user.id] = { balance: 0 };
  
    message.channel.send(`💳 Balance for **${user.username}**: **$${balances[user.id].balance.toFixed(2)}**`);
  }
  if (message.content.toLowerCase() === "?ledger") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ Only admins can view the ledger.");
    }

    if (Object.keys(balances).length === 0) {
      return message.reply("📒 The ledger is empty. No balances found.");
    }

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📒 Full Ledger")
      .setDescription("List of all balances stored in the system:")
      .setTimestamp();

    for (const [userId, data] of Object.entries(balances)) {
      try {
        const user = await message.client.users.fetch(userId); // fetch user by ID
        embed.addFields({
        name: user.tag, // DiscordTag (e.g., MyUser#1234)
        value: `$${(data.balance ?? 0).toFixed(2)}`,
        inline: true
        });
      } catch (err) {
      // Fallback in case user can't be fetched (e.g. left server)
      embed.addFields({
        name: `Unknown User (${userId})`,
        value: `$${(data.balance ?? 0).toFixed(2)}`,
        inline: true
      });
    }
  }

  await message.reply({ embeds: [embed] });
}

  // Session commands
  if (message.content.toLowerCase() === "?session") {
    const userId = message.author.id;
  
    if (sessions[userId]) {
      return message.reply("⚠️ You already have an active session. Use `!endsession` first.");
    }
  
    const start = Math.floor(Date.now() / 1000);
  
    sessions[userId] = {
      startTime: start,
      authorName: message.author.username,
    };
    saveSessions();
  
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🟢 Session Started")
      .setDescription(
        `Session started at <t:${start}:t>\n` +
        `Started by: **${message.author.username}**`
      )
      .setTimestamp();
  
    await message.reply({ embeds: [embed] });
  }

  if (message.content.toLowerCase() === "?endsession") {
    const userId = message.author.id;
  
    if (!sessions[userId]) {
      return message.reply("⚠️ You don't have an active session to end.");
    }
  
    const session = sessions[userId];
    const end = Math.floor(Date.now() / 1000);
    const elapsedSeconds = end - session.startTime;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  
    // Update session leaderboard
    if (!sessionHosters[userId]) {
      sessionHosters[userId] = { tag: session.authorName, count: 0, time: 0 };
    }
    sessionHosters[userId].count += 1;
    sessionHosters[userId].time += elapsedMinutes;
    saveSessionHosters();
  
    delete sessions[userId];
    saveSessions();
  
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔴 Session Ended")
      .setDescription(
        `Started by: **${session.authorName}**\n` +
        `Duration: **${elapsedMinutes} minutes**\n` +
        `Total Time: ${Math.floor(sessionHosters[userId].time / 60)}h ${sessionHosters[userId].time % 60}m`
      )
      .setTimestamp();
  
    await message.reply({ embeds: [embed] });
  }

  if (message.content.toLowerCase() === "?sessionlb") {
    if (Object.keys(sessionHosters).length === 0) {
      return message.reply("📊 No session data found yet.");
    }
  
    // Sort by total time (descending)
    const sorted = Object.entries(sessionHosters)
      .sort(([, a], [, b]) => b.time - a.time)
      .slice(0, 10);
  
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("🏆 Session Leaderboard")
      .setDescription("Top session hosts by total time:")
      .setTimestamp();
  
    sorted.forEach(([userId, data], index) => {
      embed.addFields({
        name: `#${index + 1} ${data.tag}`,
        value: `Sessions: **${data.count}** | Time: **${Math.floor(data.time / 60)}h ${data.time % 60}m**`,
        inline: false,
      });
    });
  
    await message.reply({ embeds: [embed] });
  }
  
  


  //  Non core commands
  // !help command
  if (message.content.toLowerCase() === "?help") {
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
        { name: "🛡️ `!pingtankfarm`", value:"Hosts only: Ping for a standard tank farm"},
        { name: "ℹ️ `!help`", value: "Displays this help menu." }
      )
      .setFooter({ text: "Use these commands in chat to interact with the bot." });

    await message.reply({ embeds: [helpEmbed] });
  }
  if (message.content.toLowerCase() === "?dps") {
    const file = new AttachmentBuilder("dps.png");
    await message.channel.send({ files: [file] });
  }
  if (message.content.toLowerCase()=== "?pingtankfarm") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      return message.reply("❌ Do not have permission to ping for tank farm");
    }
    let farmMessage = `# <@&1345335672852189256> Need all roles for 3-3-6 farm. CANNOT FULLY AFK. <@&1352647499105439754> <@&1352647613962260660> <@&1352647857647259678>`;

    await message.channel.send(farmMessage);
  }
  if (message.content.toLowerCase() === '?sybau') {
    message.reply("https://tenor.com/view/sybau-ts-pmo-gif-2102579015947246168")
  }


});

// Helper: end countdown
async function endCountdown(channelId, client, triggerMsg) {
  const countdown = countdowns[channelId];
  if (!countdown) return;

  if (countdownTimers[channelId]) {
    clearTimeout(countdownTimers[channelId]);
    delete countdownTimers[channelId];
  }
  
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
