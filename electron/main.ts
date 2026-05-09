import {
  app, BrowserWindow, ipcMain, shell, Tray, Menu,
  nativeImage, Notification, nativeTheme, desktopCapturer,
} from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let discordRPC: any = null;
let rpcConnected = false;
let minimizeToTray = true;
let isQuitting = false;

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (e) => {
    if (!isQuitting && minimizeToTray && tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('VRC Studio');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VRC Studio',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        disconnectDiscordRPC();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── Discord RPC ─────────────────────────────────────────────────────────────

type DiscordActivityPayload = {
  details?: string;
  state?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  startTimestamp?: number;
  instance?: boolean;
};

let pendingActivity: DiscordActivityPayload | null = null;

async function initDiscordRPC(clientId: string) {
  // Require a non-empty, plausible clientId (Discord app IDs are 17-19 digits)
  if (!clientId || clientId.length < 10) {
    console.warn('[Discord RPC] No valid clientId provided — skipping init');
    return;
  }
  // Disconnect any existing session first
  disconnectDiscordRPC();
  try {
    const { Client } = await import('discord-rpc');
    discordRPC = new Client({ transport: 'ipc' });

    discordRPC.on('ready', () => {
      rpcConnected = true;
      console.log('[Discord RPC] Connected as', (discordRPC as any).user?.username);
      // Flush any activity that was set while we were still connecting
      if (pendingActivity) {
        const a = pendingActivity;
        pendingActivity = null;
        applyActivity(a);
      }
    });

    discordRPC.on('disconnected', () => {
      rpcConnected = false;
      console.log('[Discord RPC] Disconnected');
    });

    await discordRPC.login({ clientId });
    console.log('[Discord RPC] login() resolved, awaiting ready event…');
  } catch (err: any) {
    console.warn('[Discord RPC] Failed to connect:', err?.message ?? err);
    discordRPC = null;
    rpcConnected = false;
  }
}

function disconnectDiscordRPC() {
  if (discordRPC) {
    try { discordRPC.destroy(); } catch {}
    discordRPC = null;
    rpcConnected = false;
    pendingActivity = null;
  }
}

function applyActivity(activity: DiscordActivityPayload) {
  if (!discordRPC) return;
  // discord-rpc setActivity returns a Promise — we MUST catch its rejection
  // or failures are swallowed silently and the activity never appears.
  const payload = {
    details: activity.details,
    state: activity.state,
    largeImageKey: activity.largeImageKey,
    largeImageText: activity.largeImageText,
    smallImageKey: activity.smallImageKey,
    smallImageText: activity.smallImageText,
    startTimestamp: activity.startTimestamp,
    instance: activity.instance ?? false,
  };
  console.log('[Discord RPC] setActivity', JSON.stringify({
    details: payload.details,
    state: payload.state,
    largeImageKey: payload.largeImageKey ? `${payload.largeImageKey.slice(0, 60)}…` : undefined,
    startTimestamp: payload.startTimestamp,
  }));
  Promise.resolve(discordRPC.setActivity(payload)).catch((err: any) => {
    console.warn('[Discord RPC] setActivity rejected:', err?.message ?? err);
  });
}

function setDiscordActivity(activity: DiscordActivityPayload) {
  // If not yet connected, hold the most recent activity and push when ready.
  if (!rpcConnected || !discordRPC) {
    pendingActivity = activity;
    console.log('[Discord RPC] Not connected yet — queuing activity for ready event');
    return;
  }
  applyActivity(activity);
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('window:quit', () => {
  isQuitting = true;
  disconnectDiscordRPC();
  app.quit();
});

// Settings sync from renderer
ipcMain.handle('settings:setMinimizeToTray', (_e, value: boolean) => {
  minimizeToTray = value;
});

ipcMain.handle('window:setAlwaysOnTop', (_e, value: boolean) => {
  mainWindow?.setAlwaysOnTop(value, 'normal');
});

// Shell
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));

// File system
ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return {
      success: true,
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fs:getVRChatLogPath', () => {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(app.getPath('home'), 'AppData', 'LocalLow', 'VRChat', 'VRChat');
  } else if (platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Logs', 'VRChat');
  } else {
    return path.join(app.getPath('home'), '.steam', 'steam', 'steamapps', 'compatdata', '438100', 'pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'LocalLow', 'VRChat', 'VRChat');
  }
});

ipcMain.handle('fs:getVRChatScreenshotPath', () => {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(app.getPath('pictures'), 'VRChat');
  } else if (platform === 'darwin') {
    return path.join(app.getPath('home'), 'Pictures', 'VRChat');
  }
  return path.join(app.getPath('home'), 'Pictures', 'VRChat');
});

// ─── Persistent App Data Storage ─────────────────────────────────────────────

const getAppDataPath = (fileName: string) => {
  const appDataDir = path.join(app.getPath('userData'), 'AppData');
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
  return path.join(appDataDir, `${fileName}.json`);
};

ipcMain.handle('storage:saveAppData', async (_e, key: string, data: string) => {
  try {
    const filePath = getAppDataPath(key);
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to save app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('storage:loadAppData', async (_e, key: string) => {
  try {
    const filePath = getAppDataPath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return data;
  } catch (error) {
    throw new Error(`Failed to load app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('storage:deleteAppData', async (_e, key: string) => {
  try {
    const filePath = getAppDataPath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('storage:clearAllAppData', async (_e) => {
  try {
    const appDataDir = path.join(app.getPath('userData'), 'AppData');
    if (fs.existsSync(appDataDir)) {
      fs.rmSync(appDataDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to clear app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Desktop notifications (Electron native)
ipcMain.handle('notification:send', (_e, opts: { title: string; body: string; icon?: string }) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      silent: false,
    });
    n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
    n.show();
  }
});

// Discord RPC
ipcMain.handle('discord:init', (_e, clientId: string) => initDiscordRPC(clientId));
ipcMain.handle('discord:disconnect', () => disconnectDiscordRPC());
ipcMain.handle('discord:setActivity', (_e, activity: Parameters<typeof setDiscordActivity>[0]) => setDiscordActivity(activity));
ipcMain.handle('discord:isConnected', () => rpcConnected);

// Auto-launch
ipcMain.handle('autoLaunch:set', (_e, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'VRC Studio',
    path: process.execPath,
  });
});
ipcMain.handle('autoLaunch:get', () => app.getLoginItemSettings().openAtLogin);

// App info
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);

// Audio visualizer / media detection
// Returns desktop sources (windows + screens) so the renderer can request
// system-audio capture via getUserMedia({ chromeMediaSource: 'desktop' }).
ipcMain.handle('audio:getDesktopSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  } catch (err) {
    return [];
  }
});

// Detects whether Spotify or YouTube is currently playing by scanning
// window titles. Returns a small object the renderer can react to.
ipcMain.handle('audio:detectMedia', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    const titles = sources.map(s => s.name);

    // Spotify: title becomes "Track - Artist" while playing, "Spotify Free"/"Spotify Premium" when idle
    const spotifyTitle = titles.find(t =>
      /^Spotify(?:\s|$)/i.test(t) === false &&
      titles.some(x => /Spotify/i.test(x)) &&
      / - /.test(t) &&
      !/^Spotify (Free|Premium)$/i.test(t)
    );
    // Heuristic: any window owned by Spotify with a "X - Y" track title
    const spotifyPlaying = titles.find(t => / - /.test(t) && /Spotify/i.test(t));

    // YouTube: browser tab title pattern "Video Title - YouTube — Browser"
    const youtubePlaying = titles.find(t => /\sYouTube\b/i.test(t) || /\)\s*-\s*YouTube/i.test(t));

    if (spotifyPlaying || spotifyTitle) {
      const t = spotifyPlaying || spotifyTitle!;
      return { active: true, source: 'spotify' as const, title: t.replace(/\s*[—-]\s*Spotify.*$/i, '').trim() };
    }
    if (youtubePlaying) {
      return { active: true, source: 'youtube' as const, title: youtubePlaying.replace(/\s*-\s*YouTube.*$/i, '').trim() };
    }
    return { active: false, source: null, title: null };
  } catch {
    return { active: false, source: null, title: null };
  }
});


// ─── VRChat API Proxy ────────────────────────────────────────────────────────

ipcMain.handle('vrchat:request', async (_e, opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Record<string, string>;
}) => {
  return new Promise((resolve) => {
    const url = new URL(`https://api.vrchat.cloud${opts.path}`);

    const cookieParts: string[] = [];
    if (opts.cookies) {
      for (const [k, v] of Object.entries(opts.cookies)) {
        if (v) cookieParts.push(`${k}=${v}`);
      }
    }

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'VRCStudio/1.0.0 (https://github.com/DoNotPetMe/VRCStudio; vrcstudio@proton.me)',
      ...(opts.headers || {}),
    };
    if (cookieParts.length > 0) {
      reqHeaders['Cookie'] = cookieParts.join('; ');
    }

    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: opts.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const bodyStr = Buffer.concat(chunks).toString('utf-8');

          const setCookieHeaders = res.headers['set-cookie'] || [];
          const responseCookies: Record<string, string> = {};
          for (const sc of setCookieHeaders) {
            const authMatch = sc.match(/^auth=([^;]+)/);
            if (authMatch) responseCookies['auth'] = authMatch[1];
            const tfaMatch = sc.match(/^twoFactorAuth=([^;]+)/);
            if (tfaMatch) responseCookies['twoFactorAuth'] = tfaMatch[1];
          }

          let json: any = null;
          try {
            json = JSON.parse(bodyStr);
          } catch {}

          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode,
            data: json,
            cookies: responseCookies,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        ok: false,
        status: 0,
        data: { error: { message: err.message } },
        cookies: {},
      });
    });

    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
});

// Generic outbound GET — used for third-party APIs (VRCDB, etc.)
// Runs in main process so we can set any User-Agent header.
// Follows up to 3 redirects.
ipcMain.handle('http:get', async (_e, url: string, headers?: Record<string, string>) => {
  const doRequest = (targetUrl: string, hops = 0): Promise<any> => new Promise((resolve) => {
    let parsed: URL;
    try { parsed = new URL(targetUrl); } catch {
      return resolve({ ok: false, status: 0, data: null, raw: 'Invalid URL', url: targetUrl });
    }

    const finalHeaders: Record<string, string> = {
      'User-Agent': 'VRCX',
      'Accept': 'application/json, text/plain, */*',
      ...headers,
    };

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: finalHeaders,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
          const next = new URL(res.headers.location, parsed).toString();
          res.resume();
          return resolve(doRequest(next, hops + 1));
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data: any = null;
          try { data = JSON.parse(raw); } catch {}
          const ok = res.statusCode! >= 200 && res.statusCode! < 300;
          if (!ok) {
            console.warn(`[http:get] ${targetUrl} → ${res.statusCode}: ${raw.slice(0, 200)}`);
          }
          resolve({ ok, status: res.statusCode, data, raw, url: targetUrl, headers: res.headers });
        });
      }
    );
    req.on('error', (err) => {
      console.warn(`[http:get] ${targetUrl} failed:`, err.message);
      resolve({ ok: false, status: 0, data: null, raw: err.message, url: targetUrl });
    });
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.end();
  });

  return doRequest(url);
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    disconnectDiscordRPC();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  disconnectDiscordRPC();
});
