// Discord bot that mirrors a slice of HackerConsole commands into your
// Discord server / DMs. Lives in the Electron main process because
// discord.js needs Node APIs the renderer doesn't have.
//
// State sync: the renderer pushes a snapshot of the live app state
// (current user, current instance, online friends, instance players,
// recent videos) into this module via the bot:syncState IPC. Read-only
// commands answer from that snapshot — no extra VRChat API traffic per
// command.
//
// Actions: when the user triggers /wear, /status, /say, etc., the bot
// emits bot:executeAction over IPC to the renderer; the renderer
// performs the action through its existing api/OSC layer and reports
// back with bot:actionResult. Keeps all auth and OSC plumbing in one
// place (the renderer).

import {
  Client, GatewayIntentBits, Partials, SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction, type Interaction,
} from 'discord.js';
import type { BrowserWindow } from 'electron';

// ── Public-facing snapshot shape (whatever the renderer chooses to push) ──

export interface BotSnapshotUser {
  id: string;
  displayName: string;
  status?: string;
  statusDescription?: string;
  currentAvatar?: string;
  currentAvatarThumbnailImageUrl?: string;
  bio?: string;
  trustRank?: string;
}

export interface BotSnapshotInstance {
  worldId: string;
  worldName: string;
  worldImage?: string;
  instanceId: string;
  instanceType: string;
  joinedAt: number;
}

export interface BotSnapshotFriend {
  id: string;
  displayName: string;
  status: string;
  statusDescription?: string;
  location?: string;
}

export interface BotSnapshotPlayer {
  playerName: string;
  avatarId?: string;
  avatarName?: string;
  rank?: 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Very Poor';
  stats?: Record<string, number>;
}

export interface BotSnapshotVideo {
  url: string;
  label?: string;
  timestamp: number;
}

export interface BotSnapshot {
  user?: BotSnapshotUser;
  instance?: BotSnapshotInstance | null;
  onlineFriends?: BotSnapshotFriend[];
  instancePlayers?: BotSnapshotPlayer[];
  recentVideos?: BotSnapshotVideo[];
}

// ── Internal state ──

let client: Client | null = null;
let snapshot: BotSnapshot = {};
let mainWindow: BrowserWindow | null = null;
const actionResolvers = new Map<string, (result: { ok: boolean; error?: string; data?: any }) => void>();
let lastError: string | null = null;
let lastConnectedAt: number | null = null;

export interface BotStatus {
  connected: boolean;
  botTag: string | null;
  guildCount: number;
  ping: number | null;
  lastError: string | null;
  connectedAt: number | null;
}

export function setMainWindow(w: BrowserWindow | null) { mainWindow = w; }

export function getStatus(): BotStatus {
  return {
    connected: !!client?.isReady(),
    botTag: client?.user?.tag ?? null,
    guildCount: client?.guilds.cache.size ?? 0,
    ping: client?.ws.ping ?? null,
    lastError,
    connectedAt: lastConnectedAt,
  };
}

export function updateSnapshot(partial: Partial<BotSnapshot>) {
  snapshot = { ...snapshot, ...partial };
}

export async function startBot(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!token || token.length < 30) {
    return { ok: false, error: 'Bot token looks invalid (too short).' };
  }
  if (client) {
    await stopBot();
  }
  lastError = null;

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  });

  client.on('error', (err) => { lastError = err?.message ?? String(err); });
  client.on('interactionCreate', (i) => handleInteraction(i).catch(err => {
    console.error('[Bot] interaction handler error:', err);
  }));

  return new Promise((resolve) => {
    client!.once('ready', async () => {
      lastConnectedAt = Date.now();
      try {
        await registerCommands();
      } catch (err: any) {
        lastError = `Failed to register slash commands: ${err?.message ?? err}`;
      }
      resolve({ ok: true });
    });
    client!.login(token).catch((err) => {
      lastError = err?.message ?? String(err);
      client?.destroy().catch(() => {});
      client = null;
      resolve({ ok: false, error: lastError ?? 'Login failed' });
    });
  });
}

export async function stopBot(): Promise<void> {
  if (!client) return;
  try { await client.destroy(); } catch {}
  client = null;
  lastConnectedAt = null;
  actionResolvers.clear();
}

// Renderer calls this in response to a bot:executeAction event.
export function resolveAction(id: string, result: { ok: boolean; error?: string; data?: any }) {
  const fn = actionResolvers.get(id);
  if (fn) {
    actionResolvers.delete(id);
    fn(result);
  }
}

// ── Slash commands ──

async function registerCommands() {
  if (!client?.application) return;

  const commands = [
    new SlashCommandBuilder()
      .setName('whoami')
      .setDescription('Show your current VRChat profile')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('world')
      .setDescription('Show your current world / instance')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('players')
      .setDescription('List players in your current instance')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('friends')
      .setDescription('Show online friends')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('videos')
      .setDescription('Last few videos played in VRChat')
      .toJSON(),

    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Change your VRChat status')
      .addStringOption(o => o
        .setName('state')
        .setDescription('Online status')
        .setRequired(true)
        .addChoices(
          { name: 'Online',         value: 'active' },
          { name: 'Join Me',        value: 'join me' },
          { name: 'Ask Me',         value: 'ask me' },
          { name: 'Do Not Disturb', value: 'busy' },
        ))
      .addStringOption(o => o
        .setName('message')
        .setDescription('Status message')
        .setRequired(false))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('wear')
      .setDescription('Switch to a VRChat avatar by ID')
      .addStringOption(o => o
        .setName('id')
        .setDescription('Avatar ID (starts with avtr_)')
        .setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Send a message to your VRChat chatbox via OSC')
      .addStringOption(o => o
        .setName('text')
        .setDescription('Message (max 144 characters)')
        .setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Show details of a VRChat avatar by ID')
      .addStringOption(o => o
        .setName('id')
        .setDescription('Avatar ID (starts with avtr_)')
        .setRequired(true))
      .toJSON(),
  ];

  await client.application.commands.set(commands);
}

async function handleInteraction(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction as ChatInputCommandInteraction;

  // Reply quickly so Discord doesn't time out.
  await cmd.deferReply({ ephemeral: false });

  try {
    const result = await runCommand(cmd);
    if (typeof result === 'string') {
      await cmd.editReply(result);
    } else {
      await cmd.editReply({ embeds: [result] });
    }
  } catch (err: any) {
    await cmd.editReply(`❌ Error: ${err?.message ?? String(err)}`);
  }
}

async function runCommand(i: ChatInputCommandInteraction): Promise<string | EmbedBuilder> {
  switch (i.commandName) {
    case 'whoami':   return cmdWhoami();
    case 'world':    return cmdWorld();
    case 'players':  return cmdPlayers();
    case 'friends':  return cmdFriends();
    case 'videos':   return cmdVideos();
    case 'status':   return cmdStatus(i);
    case 'wear':     return cmdWear(i);
    case 'say':      return cmdSay(i);
    case 'avatar':   return cmdAvatar(i);
    default:         return `Unknown command: ${i.commandName}`;
  }
}

// ── Command implementations (read from snapshot or call back to renderer) ──

function cmdWhoami(): EmbedBuilder | string {
  const u = snapshot.user;
  if (!u) return 'Not signed in to VRChat yet.';
  const embed = new EmbedBuilder()
    .setTitle(u.displayName)
    .setColor(0x60a5fa)
    .setURL(`https://vrchat.com/home/user/${u.id}`)
    .addFields(
      { name: 'Status', value: `${u.status ?? 'unknown'}${u.statusDescription ? ` — ${u.statusDescription}` : ''}`, inline: true },
      { name: 'Trust',  value: u.trustRank ?? '—', inline: true },
      { name: 'ID',     value: `\`${u.id}\``, inline: false },
    );
  if (u.bio) embed.addFields({ name: 'Bio', value: u.bio.slice(0, 1024) });
  if (u.currentAvatarThumbnailImageUrl) embed.setThumbnail(u.currentAvatarThumbnailImageUrl);
  return embed;
}

function cmdWorld(): EmbedBuilder | string {
  const inst = snapshot.instance;
  if (!inst) return 'You aren\'t in a world right now (or instance tracking is offline).';
  const minsIn = Math.floor((Date.now() - inst.joinedAt) / 60_000);
  const embed = new EmbedBuilder()
    .setTitle(inst.worldName)
    .setURL(`https://vrchat.com/home/launch?worldId=${inst.worldId}&instanceId=${inst.instanceId}`)
    .setColor(0xa78bfa)
    .addFields(
      { name: 'Type',       value: inst.instanceType, inline: true },
      { name: 'Instance',   value: `\`${inst.instanceId}\``, inline: true },
      { name: 'In session', value: `${minsIn}m`, inline: true },
      { name: 'World ID',   value: `\`${inst.worldId}\`` },
    );
  if (inst.worldImage) embed.setThumbnail(inst.worldImage);
  return embed;
}

function cmdPlayers(): EmbedBuilder | string {
  const players = snapshot.instancePlayers ?? [];
  if (players.length === 0) return 'No players tracked in the current instance.';

  const rankIcons: Record<string, string> = {
    Excellent: '🟢', Good: '🟢', Medium: '🟡', Poor: '🟠', 'Very Poor': '🔴',
  };
  const rows = players.slice(0, 30).map(p => {
    const icon = p.rank ? (rankIcons[p.rank] ?? '⚪') : '⚪';
    const stats = p.stats?.triangles ? ` · ${p.stats.triangles.toLocaleString()} tris` : '';
    return `${icon} **${p.playerName}**${p.avatarName ? `  *${p.avatarName}*` : ''}${stats}`;
  });
  const more = players.length > 30 ? `\n*…and ${players.length - 30} more*` : '';

  return new EmbedBuilder()
    .setTitle(`Players in instance (${players.length})`)
    .setColor(0x60a5fa)
    .setDescription(rows.join('\n') + more);
}

function cmdFriends(): EmbedBuilder | string {
  const friends = snapshot.onlineFriends ?? [];
  if (friends.length === 0) return 'No friends online (or friend tracking is offline).';
  const rows = friends.slice(0, 25).map(f =>
    `\`${f.status[0].toUpperCase()}\` **${f.displayName}**${f.statusDescription ? `  *${f.statusDescription}*` : ''}`,
  );
  const more = friends.length > 25 ? `\n*…and ${friends.length - 25} more*` : '';
  return new EmbedBuilder()
    .setTitle(`Online friends (${friends.length})`)
    .setColor(0x34d399)
    .setDescription(rows.join('\n') + more);
}

function cmdVideos(): EmbedBuilder | string {
  const vids = snapshot.recentVideos ?? [];
  if (vids.length === 0) return 'No videos played yet.';
  const rows = vids.slice(0, 10).map(v => {
    const time = new Date(v.timestamp).toLocaleTimeString();
    return `\`${time}\`  ${v.label ?? v.url}`;
  });
  return new EmbedBuilder()
    .setTitle('Recent videos')
    .setColor(0xc084fc)
    .setDescription(rows.join('\n'));
}

async function cmdStatus(i: ChatInputCommandInteraction): Promise<string> {
  const state = i.options.getString('state', true);
  const message = i.options.getString('message') ?? '';
  const res = await requestAction('updateStatus', { status: state, message });
  if (!res.ok) return `❌ Failed: ${res.error}`;
  return `✅ VRChat status set to **${state}**${message ? ` — *${message}*` : ''}.`;
}

async function cmdWear(i: ChatInputCommandInteraction): Promise<string> {
  const id = i.options.getString('id', true).trim();
  if (!id.startsWith('avtr_')) return '❌ Avatar ID must start with `avtr_`.';
  const res = await requestAction('selectAvatar', { avatarId: id });
  if (!res.ok) return `❌ Failed: ${res.error}`;
  return `✅ Wearing \`${id}\` now.`;
}

async function cmdSay(i: ChatInputCommandInteraction): Promise<string> {
  const text = i.options.getString('text', true);
  if (text.length > 144) return `❌ Too long (${text.length} > 144 chars).`;
  const res = await requestAction('oscChatbox', { text });
  if (!res.ok) return `❌ Failed: ${res.error}  (OSC running?)`;
  return `📨 **Said:** ${text}`;
}

async function cmdAvatar(i: ChatInputCommandInteraction): Promise<EmbedBuilder | string> {
  const id = i.options.getString('id', true).trim();
  if (!id.startsWith('avtr_')) return '❌ Avatar ID must start with `avtr_`.';
  const res = await requestAction('getAvatar', { avatarId: id });
  if (!res.ok || !res.data) return `❌ Couldn't look up that avatar: ${res.error ?? 'no match'}`;
  const a = res.data as { name: string; authorName: string; description?: string; thumbnailImageUrl?: string };
  const embed = new EmbedBuilder()
    .setTitle(a.name)
    .setColor(0xfbbf24)
    .addFields(
      { name: 'Author', value: a.authorName, inline: true },
      { name: 'ID',     value: `\`${id}\``,  inline: true },
    );
  if (a.description) embed.setDescription(a.description.slice(0, 2000));
  if (a.thumbnailImageUrl) embed.setImage(a.thumbnailImageUrl);
  return embed;
}

// ── Action bridge ──

function requestAction(action: string, payload: any): Promise<{ ok: boolean; error?: string; data?: any }> {
  return new Promise((resolve) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    actionResolvers.set(id, resolve);

    if (!mainWindow) {
      actionResolvers.delete(id);
      resolve({ ok: false, error: 'no renderer window available' });
      return;
    }

    mainWindow.webContents.send('bot:executeAction', { id, action, payload });

    // Safety timeout — renderer may not respond if logged out or busy.
    setTimeout(() => {
      if (actionResolvers.has(id)) {
        actionResolvers.delete(id);
        resolve({ ok: false, error: 'action timed out' });
      }
    }, 12_000);
  });
}
