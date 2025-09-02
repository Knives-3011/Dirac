const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, PermissionsBitField,ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require("discord.js");
const { token } = require('./config.json');
const fs = require("fs");
const moment = require("moment-timezone");
const path = require("path");
const { createCanvas } = require("canvas");


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
const TRANSACTION_CHANNEL_ID = "1408696241461661796"
function logTransaction(client, msg) {
    const logChannel = client.channels.cache.get(TRANSACTION_CHANNEL_ID);
  if (logChannel) logChannel.send({ embeds: [msg] }).catch(() => {});
}
// warns top level
  const warnsFile = "./warns.json";
  let warns = loadJSON(warnsFile);
  if (!warns.bans) warns.bans = {};       // active bans by key "guildId:userId"
  if (!warns.history) warns.history = {}; // array of ban records per user key
  function saveWarns() { saveJSON(warnsFile, warns); }

  const LORD_BAN_ROLE_NAME = "lordban"; // role name (case-insensitive)
  const BAN_SWEEP_INTERVAL_MS = 60_000; // check every 60s
  const banTimers = new Map();          // optional in-case you want per-ban timers

  function genBanId() {
    return Math.random().toString(36).slice(2, 8) + "-" + Date.now().toString(36);
  }

  function userKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  function getLordbanRole(guild) {
    if (!guild) return null;
    return guild.roles.cache.find(r => r.name.toLowerCase() === LORD_BAN_ROLE_NAME.toLowerCase()) || null;
  }

  async function liftBan(guild, entry, status = "expired") {
    try {
      const role = getLordbanRole(guild);
      if (!role) {
        // Still mark as ended so the system doesn't loop forever
        finalizeBan(entry, status);
        saveWarns();
        logAction(client, `⚠️ Could not remove role for ban **${entry.id}** (role missing). Marked ended.`);
        return;
      }

      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (member && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, `Lordban ended (${status}).`);
      }

      finalizeBan(entry, status);
      saveWarns();
      logAction(client, `✅ Lordban **${entry.id}** ended for <@${entry.userId}> (${status}).`);
    } catch (e) {
      console.error("Failed to lift ban:", e);
    }
  }

  function finalizeBan(entry, status) {
    const key = userKey(entry.guildId, entry.userId);

    // Mark history entry as ended
    if (warns.history[key]) {
      const idx = warns.history[key].findIndex(h => h.id === entry.id);
      if (idx !== -1) {
        warns.history[key][idx].status = status;
        warns.history[key][idx].liftedAt = Date.now();
      }
    }

    // Remove from active list
    delete warns.bans[key];
  }

  async function ensureRoleApplied(guild, entry) {
    const role = getLordbanRole(guild);
    if (!role) return false;

    const member = await guild.members.fetch(entry.userId).catch(() => null);
    if (!member) return false;

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, `Lordban active. Ban ID: ${entry.id}`);
    }
    return true;
  }

  // Periodic sweep to enforce/expire bans (survives restarts)
  async function sweepBans() {
    const now = Date.now();
    for (const key of Object.keys(warns.bans)) {
      const entry = warns.bans[key];
      const guild = client.guilds.cache.get(entry.guildId);
      if (!guild) continue;

      if (now >= entry.endAt) {
        await liftBan(guild, entry, "expired");
      } else {
        // Keep role applied in case the bot restarted or role was removed manually
        await ensureRoleApplied(guild, entry).catch(() => {});
      }
    }
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

  // Start lordban sweeper
  setInterval(sweepBans, BAN_SWEEP_INTERVAL_MS);
  // Run once immediately on boot
  sweepBans();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  // Time Commands

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
  if (message.content.toLowerCase() === "?countdown" || message.content.toLowerCase() === "?farm") {
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
    }, 3600000);

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
        name: `${data.authorName}-<#${channelId}>`,
        value: `Ends <t:${data.endTime}:R> (<t:${data.endTime}:t>)`,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  }
  if (message.content.toLowerCase() === "?endcountdown" || message.content.toLowerCase() === "?end") {
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
    if (!message.member.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
      return message.reply("❌ Only admins can reset the leaderboard.");
    }
  
    for (const userId in hosters) {
      if (hosters[userId].week !== undefined) {
        hosters[userId].week = 0; // reset weekly time
      }
      if (hosters[userId].weekCount !== undefined) {
        hosters[userId].weekCount = 0; // reset weekly count if you track it separately
      }
    }
  
    saveHosters();
    message.reply("✅ Weekly leaderboard has been reset.");
    logAction(client, `🗑️ Weekly leaderboard was reset by **${message.author.username}**.`);
  }
  if (message.content.toLowerCase() === "?leaderboard" || message.content.toLowerCase() === "?lb") {
    const entries = Object.entries(hosters);
  
    if (entries.length === 0) {
      return message.reply("📉 No hosting data yet.");
    }
  
    // Sort by total time DESC, then by count DESC
    const sorted = entries.sort((a, b) => {
      const ta = (a[1].time ?? 0);
      const tb = (b[1].time ?? 0);
      if (tb !== ta) return tb - ta;
      return (b[1].count ?? 0) - (a[1].count ?? 0);
    });
  
    // Split into pages (10 per page = safe for fields)
    const perPage = 10;
    const pages = [];
    for (let i = 0; i < sorted.length; i += perPage) {
      const chunk = sorted.slice(i, i + perPage);
      let rank = i + 1;
  
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🏆 Top Hosts Leaderboard")
        .setDescription("Ranked by total hosted time.")
        .setTimestamp();
  
      for (const [, data] of chunk) {
        const minutes = data.time ?? 0;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const sessions = data.count ?? 0;
  
        embed.addFields({
          name: `#${rank} — ${data.tag}`,
          value: `⏱️ **${hours}h ${mins}m** total\n🎮 **${sessions}** sessions`,
          inline: false,
        });
        rank++;
      }
  
      pages.push(embed);
    }
  
    let pageIndex = 0;
  
    // Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("⬅️ Prev")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("Next ➡️")
        .setStyle(ButtonStyle.Primary)
    );
  
    const reply = await message.reply({
      embeds: [pages[pageIndex]],
      components: pages.length > 1 ? [row] : [],
    });
  
    if (pages.length <= 1) return;
  
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      time: 60_000, // 1 minute timeout
    });
  
    collector.on("collect", async (interaction) => {
      if (interaction.customId === "prev") {
        pageIndex = (pageIndex - 1 + pages.length) % pages.length;
      } else if (interaction.customId === "next") {
        pageIndex = (pageIndex + 1) % pages.length;
      }
      await interaction.update({
        embeds: [pages[pageIndex]],
        components: [row],
      });
    });
  
    collector.on("end", async () => {
      await reply.edit({ components: [] }); // disable buttons after timeout
    });
  }
  if (message.content.toLowerCase() === "?week") {
    const entries = Object.entries(hosters);
  
    if (entries.length === 0) {
      return message.reply("📉 No hosting data yet.");
    }
  
    // Sort by total time DESC, then by count DESC
    const sorted = entries.sort((a, b) => {
      const ta = (a[1].week ?? 0);
      const tb = (b[1].week ?? 0);
      if (tb !== ta) return tb - ta;
      return (b[1].count ?? 0) - (a[1].count ?? 0);
    });
  
    // Split into pages (10 per page = safe for fields)
    const perPage = 10;
    const pages = [];
    for (let i = 0; i < sorted.length; i += perPage) {
      const chunk = sorted.slice(i, i + perPage);
      let rank = i + 1;
  
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("🏆 Top Hosts Leaderboard")
        .setDescription("Ranked by total hosted time.")
        .setTimestamp();
  
      for (const [, data] of chunk) {
        const minutes = data.week ?? 0;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const sessions = data.weekCount ?? 0;
  
        embed.addFields({
          name: `#${rank} — ${data.tag}`,
          value: `⏱️ **${hours}h ${mins}m** total\n🎮 **${sessions}** sessions`,
          inline: false,
        });
        rank++;
      }
  
      pages.push(embed);
    }
  
    let pageIndex = 0;
  
    // Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("⬅️ Prev")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("Next ➡️")
        .setStyle(ButtonStyle.Primary)
    );
  
    const reply = await message.reply({
      embeds: [pages[pageIndex]],
      components: pages.length > 1 ? [row] : [],
    });
  
    if (pages.length <= 1) return;
  
    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      time: 60_000, // 1 minute timeout
    });
  
    collector.on("collect", async (interaction) => {
      if (interaction.customId === "prev") {
        pageIndex = (pageIndex - 1 + pages.length) % pages.length;
      } else if (interaction.customId === "next") {
        pageIndex = (pageIndex + 1) % pages.length;
      }
      await interaction.update({
        embeds: [pages[pageIndex]],
        components: [row],
      });
    });
  
    collector.on("end", async () => {
      await reply.edit({ components: [] }); // disable buttons after timeout
    });
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
    const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("💰 Payment Added" )
    .addFields(
      { name: "User", value: `${user.tag}`, inline: true },
      { name: "Amount", value: `$${amount.toFixed(2)}`, inline: true },
    )
    .setTimestamp();
    logTransaction(client, embed)
  
    message.channel.send(`💰 Added **$${amount.toFixed(2)}** to ${user.username}'s account. New balance: **$${balances[user.id].balance.toFixed(2)}**`);
    await message.delete().catch(() => {});
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
    const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("💰 Payment Deducted" )
    .addFields(
      { name: "User", value: `${user.tag}`, inline: true },
      { name: "Amount", value: `$${amount.toFixed(2)}`, inline: true },
    )
    .setTimestamp();
    logTransaction(client,embed)
  
    message.channel.send(`💸 Subtracted **$${amount.toFixed(2)}** from ${user.username}'s account. New balance: **$${balances[user.id].balance.toFixed(2)}**`);
    await message.delete().catch(() => {});
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
    await message.delete().catch(() => {});
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
      .setDescription("List of all balances stored in the system (sorted by richest first):")
      .setTimestamp();
  
    // 🔽 Sort balances by descending order
    const sortedEntries = Object.entries(balances).sort((a, b) => {
      const balanceA = a[1].balance ?? 0;
      const balanceB = b[1].balance ?? 0;
      return balanceB - balanceA; // bigger balances come first
    });
  
    for (const [userId, data] of sortedEntries) {
      try {
        const user = await message.client.users.fetch(userId); // fetch user by ID
        embed.addFields({
          name: user.tag, // DiscordTag (e.g., MyUser#1234)
          value: `$${(data.balance ?? 0).toFixed(2)}`,
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
    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});
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
  if (message.content.toLowerCase().startsWith("!addtime")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ViewAuditLog) && message.author.id != "1029305942313021520") {
      return message.reply("❌ Only mods/Dirac can add time.");
    }
  
    const args = message.content.split(" ");
    if (args.length < 3) {
      return message.reply("⚠️ Usage: `!addtime @user <minutes>`");
    }
  
    const target = message.mentions.users.first();
    const minutes = parseInt(args[2], 10);
  
    if (!target) {
      return message.reply("⚠️ Please mention a valid user.");
    }
    if (isNaN(minutes) || minutes <= 0) {
      return message.reply("⚠️ Please provide a valid positive number of minutes.");
    }
  
    // Ensure the user exists in hosters
    if (!hosters[target.id]) {
      hosters[target.id] = {
        tag: target.tag,
        count: 0,
        time: 0,
        week: 0,
      };
    }
  
    // Add time to both all-time and weekly
    hosters[target.id].time += minutes;
    hosters[target.id].week += minutes;
  
    saveHosters();
  
    message.reply(
      `✅ Added **${minutes} minutes** to ${target.tag}'s time.\n` +
      `⏱️ New totals → All-time: **${hosters[target.id].time}m**, Weekly: **${hosters[target.id].week}m**`
    );

    
  }
  if (message.content.toLowerCase() === "!slapshadow"){
    message.reply("https://images-ext-1.discordapp.net/external/3vm4CyZKFYQBYn0rHq3venph0yjW57PgehvvSK1sWmM/https/media.tenor.com/Z7GWN6L9GzwAAAPo/powerslap-slap-ko.mp4")
  }

  // Lord Banning
  // ── !lordban @user <days> <reason> ────────────────────────────────────────────
if (message.content.toLowerCase().startsWith("!lordban")) {
  // Permissions: require ManageRoles
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    return message.reply("❌ You need to be a host to use this.");
  }

  // Bot must be able to manage roles
  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    return message.reply("❌ You need to be a host to use this.");
  }

  const role = getLordbanRole(message.guild);
  if (!role) {
    return message.reply(`❌ Role **${LORD_BAN_ROLE_NAME}** not found. Please create it first.`);
  }

  const args = message.content.trim().split(/\s+/).slice(1);
  const target = message.mentions.members.first();
  const daysStr = args[1];
  const reason = args.slice(2).join(" ").trim();

  if (!target) {
    return message.reply("⚠️ Usage: `!lordban @user <days> <reason>`");
  }
  const days = parseFloat(daysStr);
  if (isNaN(days) || days <= 0) {
    return message.reply("⚠️ Please provide a valid number of **days** (e.g., `3` or `2.5`).");
  }
  if (!reason) {
    return message.reply("⚠️ Please provide a **reason**.");
  }

  // Prevent duplicate active bans per user
  const key = userKey(message.guild.id, target.id);
  if (warns.bans[key]) {
    const existing = warns.bans[key];
    const endsInSec = Math.floor(existing.endAt / 1000);
    return message.reply(
      `⚠️ <@${target.id}> already has an active lordban (ID: \`${existing.id}\`). Ends <t:${endsInSec}:R> (<t:${endsInSec}:t>).`
    );
  }

  // Role hierarchy check (bot must be above the role and target)
  const me = message.guild.members.me;
  if (me.roles.highest.position <= role.position) {
    return message.reply("❌ My role must be **higher** than the lordban role to assign it.");
  }
  if (me.roles.highest.position <= (target.roles.highest?.position ?? 0)) {
    return message.reply("❌ I cannot modify this member because their highest role is above mine.");
  }

  // Build ban entry
  const id = genBanId();
  const startAt = Date.now();
  const endAt = startAt + Math.round(days * 24 * 60 * 60 * 1000);

  const entry = {
    id,
    guildId: message.guild.id,
    userId: target.id,
    modId: message.author.id,
    reason,
    days,
    startAt,
    endAt,
    status: "active"
  };

  try {
    // Assign role
    await target.roles.add(role, `Lordban ${days} day(s) by ${message.author.tag}: ${reason}`);

    // Persist active ban and history
    warns.bans[key] = entry;
    if (!warns.history[key]) warns.history[key] = [];
    warns.history[key].push({ ...entry }); // snapshot into history
    saveWarns();

    // Nice confirmation embed
    const endsInSec = Math.floor(endAt / 1000);
    const embed = new EmbedBuilder()
      .setColor(0xff7a00)
      .setTitle("🔨 Lordban Issued")
      .setDescription(
        [
          `**User:** <@${target.id}>`,
          `**Moderator:** <@${message.author.id}>`,
          `**Duration:** ${days} day(s)`,
          `**Ends:** <t:${endsInSec}:R> (<t:${endsInSec}:t>)`,
          `**Reason:** ${reason}`,
          `**Ban ID:** \`${id}\``
        ].join("\n")
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    logAction(client, `🔨 Lordban **${id}** → <@${target.id}> (${days}d) by **${message.author.tag}** — ${reason}`);
  } catch (err) {
    console.error("Failed to assign lordban role:", err);
    return message.reply("❌ I couldn't assign the role. Check my permissions/role position and try again.");
  }
}

if (message.content.toLowerCase().startsWith("!reduceban")) {
  const args = message.content.trim().split(/ +/).slice(1);
  const target = message.mentions.users.first();
  if (!target) {
    return message.reply("⚠️ Please mention a valid user.");
  }

  const daysToReduce = parseFloat(args[1]);
  if (isNaN(daysToReduce) || daysToReduce <= 0) {
    return message.reply("⚠️ Please provide a valid number of days (can be decimal).");
  }

  const guildId = message.guild.id;
  const userId = target.id;
  const key = `${guildId}:${userId}`;
  const ban = warns.bans[key];

  if (!ban || ban.status !== "active") {
    return message.reply("⚠️ That user does not have an active lordban.");
  }

  const now = Date.now();
  const reduceMs = daysToReduce * 24 * 60 * 60 * 1000;
  const remaining = ban.endAt - now;

  if (reduceMs >= remaining) {
    // fully lift the ban
    ban.status = "expired";
    ban.liftedAt = now;

    // ✅ update existing history entry instead of pushing duplicate
    if (!warns.history[key]) warns.history[key] = [];
    const histEntry = warns.history[key].find(b => b.id === ban.id);
    if (histEntry) {
      histEntry.status = "expired";
      histEntry.liftedAt = now;
    } else {
      warns.history[key].push({ ...ban });
    }

    delete warns.bans[key];

    // remove role
    const guild = message.guild;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      const role = guild.roles.cache.find(r => r.name === "lordban");
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "Lordban fully lifted");
      }
    }

    message.reply(`✅ Lordban for **${target.tag}** has been fully lifted.`);
    logAction(client, `Lordban fully lifted early for ${target.tag} by ${message.author.tag}.`);
  } else {
    // just reduce duration
    ban.endAt -= reduceMs;
    const newRemaining = (ban.endAt - now) / (24 * 60 * 60 * 1000);

    message.reply(
      `✅ Reduced lordban for **${target.tag}** by ${daysToReduce} days. Remaining: ${newRemaining.toFixed(2)} days.`
    );

    logAction(client,
      `Lordban reduced for ${target.tag} by ${daysToReduce} days by ${message.author.tag}.`
    );
  }

  fs.writeFileSync(warnsFile, JSON.stringify(warns, null, 2));
}
if (message.content.toLowerCase().startsWith("!history")) {
  const args = message.content.trim().split(/ +/).slice(1);
  const target = message.mentions.users.first();

  let userToCheck;

  if (message.member.permissions.has("ManageNicknames")) {
    // Mods can check anyone, but default to themselves if no mention
    userToCheck = target || message.author;
  } else {
    // Regular members: can only check themselves
    if (target && target.id !== message.author.id) {
      return message.reply("❌ You can only view your own ban history.");
    }
    userToCheck = message.author;
  }

  const key = `${message.guild.id}:${userToCheck.id}`;
  const userHistory = warns.history[key];

  if (!userHistory || userHistory.length === 0) {
    return message.reply(`ℹ️ No ban history found for **${userToCheck.tag}**.`);
  }

  // 🔹 Refresh statuses (mark expired bans properly)
  const now = Date.now();
  for (const ban of userHistory) {
    if (ban.status === "active" && now >= ban.endAt) {
      ban.status = "expired";
      ban.liftedAt = ban.liftedAt || now;
      if (warns.bans[key] && warns.bans[key].id === ban.id) {
        delete warns.bans[key];
      }
    }
  }
  fs.writeFileSync(warnsFile, JSON.stringify(warns, null, 2));

  // Build embed
  const { EmbedBuilder } = require("discord.js");
  const embed = new EmbedBuilder()
    .setTitle(`📜 Ban History for ${userToCheck.tag}`)
    .setColor("Blue")
    .setFooter({ text: "Created by Dirac" });

  for (const ban of userHistory) {
    embed.addFields({
      name: `ID: ${ban.id} | Status: ${ban.status}`,
      value: `**Reason:** ${ban.reason}\n**Moderator:** <@${ban.modId}>\n**Duration:** ${ban.days} day(s)\n**Start:** <t:${Math.floor(
        ban.startAt / 1000
      )}:F>\n**End:** <t:${Math.floor(ban.endAt / 1000)}:F>${
        ban.liftedAt
          ? `\n**Lifted:** <t:${Math.floor(ban.liftedAt / 1000)}:F>`
          : ""
      }`,
      inline: false,
    });
  }

  return message.channel.send({ embeds: [embed] });
}

if (message.content.toLowerCase().startsWith("!scrub")) {
  // Permission check
  if (!message.member.permissions.has("ViewAuditLog")) {
    return message.reply("❌ You don’t have permission to use this command.");
  }

  const args = message.content.trim().split(/ +/).slice(1);
  const banId = args[0];

  if (!banId) {
    return message.reply("⚠️ Usage: `!scrub <banId>`");
  }

  let found = false;
  for (const [key, historyArr] of Object.entries(warns.history)) {
    const index = historyArr.findIndex(b => b.id === banId);
    if (index !== -1) {
      const ban = historyArr[index];

      if (ban.status !== "expired") {
        return message.reply("❌ Only expired bans can be scrubbed.");
      }

      // Remove from history
      historyArr.splice(index, 1);
      fs.writeFileSync(warnsFile, JSON.stringify(warns, null, 2));

      message.reply(`🧹 Ban ID \`${banId}\` has been scrubbed from <@${ban.userId}>'s record.`);
      logAction(client, `🧹 Ban ID ${banId} scrubbed from <@${ban.userId}> by ${message.author.tag}`);
      found = true;
      break;
    }
  }

  if (!found) {
    return message.reply("⚠️ No expired ban found with that ID. The scrub only exists for expired bans. If this is for an active ban, please end that ban first");
  }
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
    hosters[countdown.authorId] = { tag: countdown.authorName, count: 0, time: 0, week: 0, weekCount: 0 };
  }
  hosters[countdown.authorId].count += 1;
  hosters[countdown.authorId].time += elapsedMinutes;
  hosters[countdown.authorId].weekCount += 1;
  hosters[countdown.authorId].week += elapsedMinutes;
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
    replyChannel = client.channels.cache.get(channelId);
    await replyChannel.send(`⏹️ Farm ended. Hosted for ${elapsedMinutes} minutes.`);
  }
}

// Login
client.login(token);
