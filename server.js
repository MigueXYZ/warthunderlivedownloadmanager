const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Path to save settings
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Helper to load settings
function loadSettings() {
  let settings = { wtPath: '', sightsPath: '', cookie: '', blacklistTags: '', whitelistTags: '' };
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      console.error('Error reading settings file:', e);
    }
  }

  // Fallback to auto-detection if settings are empty
  if (!settings.wtPath) {
    settings.wtPath = autoDetectWTPath();
  }
  if (!settings.sightsPath) {
    settings.sightsPath = autoDetectUserSightsPath();
  }
  return settings;
}

// Helper to save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing settings file:', e);
  }
}

// Automatically detect War Thunder installation path on Windows
function autoDetectWTPath() {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\War Thunder',
    'D:\\SteamLibrary\\steamapps\\common\\War Thunder',
    'E:\\SteamLibrary\\steamapps\\common\\War Thunder',
    'C:\\WarThunder',
    'D:\\WarThunder',
    'E:\\WarThunder',
    path.join(process.env.LOCALAPPDATA || 'C:', 'WarThunder')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'win64', 'aces.exe'))) {
      return p;
    }
  }
  return '';
}

// Automatically detect User Sights folder under Documents/My Games/WarThunder/Saves/<UserID>/production/UserSights
function autoDetectUserSightsPath() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
  const documentsPaths = [
    path.join(userProfile, 'Documents'),
    path.join(userProfile, 'OneDrive', 'Documents')
  ];

  for (const docPath of documentsPaths) {
    const savesPath = path.join(docPath, 'My Games', 'WarThunder', 'Saves');
    if (fs.existsSync(savesPath)) {
      try {
        const dirs = fs.readdirSync(savesPath);
        // Find folders that are numeric (User IDs)
        const userDirs = dirs.filter(d => {
          const full = path.join(savesPath, d);
          return fs.statSync(full).isDirectory() && /^\d+$/.test(d);
        });

        // Find the active folder with a production/UserSights folder inside
        const sortedDirs = userDirs.map(d => {
          const p = path.join(savesPath, d, 'production');
          return {
            dir: d,
            productionPath: p,
            mtime: fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0
          };
        }).filter(x => x.mtime > 0)
          .sort((a, b) => b.mtime - a.mtime);

        if (sortedDirs.length > 0) {
          const sightsPath = path.join(sortedDirs[0].productionPath, 'UserSights');
          return sightsPath;
        }
      } catch (e) {
        console.error('Error scanning WT Sights path:', e);
      }
    }
  }
  return '';
}

// Ensure game directories exist
function ensureSubdirsExist(wtPath, sightsPath) {
  if (wtPath) {
    const skinsDir = path.join(wtPath, 'UserSkins');
    if (!fs.existsSync(skinsDir)) {
      fs.mkdirSync(skinsDir, { recursive: true });
    }
  }
  if (sightsPath) {
    if (!fs.existsSync(sightsPath)) {
      fs.mkdirSync(sightsPath, { recursive: true });
    }
  }
}

// API: Get current settings
app.get('/api/settings', async (req, res) => {
  const settings = loadSettings();
  
  let cookieValid = null;
  let cookieUsername = null;
  
  if (settings.cookie) {
    try {
      const checkRes = await fetch('https://live.warthunder.com/', {
        headers: {
          'Cookie': `identity_sid=${settings.cookie}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (checkRes.ok) {
        const html = await checkRes.text();
        const regex = /href="https:\/\/live\.warthunder\.com\/user\/([^/"]*)\/"/;
        const match = html.match(regex);
        if (match) {
          const username = match[1];
          if (username) {
            cookieValid = true;
            cookieUsername = username;
          } else {
            cookieValid = false;
          }
        } else {
          cookieValid = false;
        }
      } else {
        cookieValid = false;
      }
    } catch (err) {
      console.error('Error verifying Gaijin session cookie:', err);
      cookieValid = false;
    }
  }

  res.json({
    wtPath: settings.wtPath,
    sightsPath: settings.sightsPath,
    cookie: settings.cookie || '',
    blacklistTags: settings.blacklistTags || '',
    whitelistTags: settings.whitelistTags || '',
    detectedWT: autoDetectWTPath(),
    detectedSights: autoDetectUserSightsPath(),
    isWTValid: settings.wtPath ? fs.existsSync(settings.wtPath) : false,
    isSightsValid: settings.sightsPath ? fs.existsSync(settings.sightsPath) : false,
    cookieValid,
    cookieUsername
  });
});

// API: Update settings
app.post('/api/settings', (req, res) => {
  const { wtPath, sightsPath, cookie, blacklistTags, whitelistTags } = req.body;
  const cleanWT = wtPath ? wtPath.trim() : '';
  const cleanSights = sightsPath ? sightsPath.trim() : '';
  const cleanCookie = cookie ? cookie.trim() : '';
  const cleanBlacklist = blacklistTags ? blacklistTags.trim() : '';
  const cleanWhitelist = whitelistTags ? whitelistTags.trim() : '';

  if (cleanWT && !fs.existsSync(cleanWT)) {
    return res.status(400).json({ error: 'War Thunder game folder path does not exist.' });
  }

  if (cleanSights) {
    try {
      if (!fs.existsSync(cleanSights)) {
        fs.mkdirSync(cleanSights, { recursive: true });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Failed to access or create the User Sights directory.' });
    }
  }

  const settings = { 
    wtPath: cleanWT, 
    sightsPath: cleanSights, 
    cookie: cleanCookie,
    blacklistTags: cleanBlacklist,
    whitelistTags: cleanWhitelist
  };
  saveSettings(settings);
  ensureSubdirsExist(cleanWT, cleanSights);

  res.json({ success: true, settings });
});

// API: Proxy request to live.warthunder.com search feed
app.post('/api/feed', async (req, res) => {
  const { content, sort, page, searchString, vehicle } = req.body;
  const settings = loadSettings();

  try {
    const params = new URLSearchParams();
    params.append('content', content || 'camouflage');
    params.append('sort', sort || 'downloads');
    params.append('page', page || '0');
    if (searchString) {
      params.append('searchString', searchString);
    }
    if (vehicle) {
      params.append('vehicle', vehicle);
    }

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    // Include the Gaijin session cookie if configured
    if (settings.cookie) {
      headers['Cookie'] = `identity_sid=${settings.cookie}`;
    }

    const response = await fetch('https://live.warthunder.com/api/feed/get_regular/', {
      method: 'POST',
      headers: headers,
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`WT Live feed returned status ${response.status}`);
    }

    const data = await response.json();

    // Apply Blacklist & Whitelist filtering if response is successful
    if (data.status === 'OK' && data.data && Array.isArray(data.data.list)) {
      let list = data.data.list;

      // 1. Blacklist Filtering
      if (settings.blacklistTags) {
        const blacklist = settings.blacklistTags
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0);

        if (blacklist.length > 0) {
          list = list.filter(item => {
            const desc = (item.description || '').toLowerCase();
            for (const tag of blacklist) {
              if (desc.includes(tag)) {
                return false;
              }
            }
            return true;
          });
        }
      }

      // 2. Whitelist Filtering
      if (settings.whitelistTags) {
        const whitelist = settings.whitelistTags
          .split(',')
          .map(t => t.trim().toLowerCase())
          .filter(t => t.length > 0);

        if (whitelist.length > 0) {
          list = list.filter(item => {
            const desc = (item.description || '').toLowerCase();
            for (const tag of whitelist) {
              if (desc.includes(tag)) {
                return true;
              }
            }
            return false;
          });
        }
      }

      data.data.list = list;
    }

    res.json(data);
  } catch (err) {
    console.error('Error fetching WT Live feed:', err);
    res.status(500).json({ error: 'Failed to fetch WT Live feed data' });
  }
});

// Helper function to download file from URL to local temp path
async function downloadFile(url, destPath, cookie) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  if (cookie) {
    headers['Cookie'] = `identity_sid=${cookie}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText} (${response.status})`);
  }

  const fileStream = fs.createWriteStream(destPath);
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
  }
  fileStream.end();
}

// Queue State
let downloadQueue = [];
let currentActiveDownload = null;
let downloadHistory = [];
let isProcessingQueue = false;

// Helper function to download file from URL with support for AbortSignal and progress reporting
async function downloadFileWithSignal(url, destPath, cookie, signal, onProgress) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  if (cookie) {
    headers['Cookie'] = `identity_sid=${cookie}`;
  }

  const response = await fetch(url, { headers, signal });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText} (${response.status})`);
  }

  const totalBytes = parseInt(response.headers.get('content-length'), 10) || 0;
  let downloadedBytes = 0;

  const fileStream = fs.createWriteStream(destPath);
  const reader = response.body.getReader();

  try {
    while (true) {
      if (signal && signal.aborted) {
        throw new Error('Download aborted');
      }
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloadedBytes += value.length;
      if (totalBytes && onProgress) {
        const pct = Math.round((downloadedBytes / totalBytes) * 100);
        onProgress(pct);
      }
    }
  } finally {
    fileStream.end();
  }
}

// Background queue processor
async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (downloadQueue.length > 0) {
    const itemIndex = downloadQueue.findIndex(x => x.status === 'pending');
    if (itemIndex === -1) break;

    const item = downloadQueue[itemIndex];
    currentActiveDownload = item;
    
    item.status = 'downloading';
    item.progress = 0;
    
    const settings = loadSettings();
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const safeName = item.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const tempZipPath = path.join(tempDir, safeName);
    
    item.abortController = new AbortController();

    try {
      if (item.type === 'camouflage' && (!settings.wtPath || !fs.existsSync(settings.wtPath))) {
        throw new Error('War Thunder game folder path is not set or invalid.');
      }
      if (item.type === 'sight' && (!settings.sightsPath || !fs.existsSync(settings.sightsPath))) {
        throw new Error('User Sights path is not set or invalid.');
      }

      console.log(`[Queue] Starting download for: ${item.title}`);
      
      await downloadFileWithSignal(
        item.url, 
        tempZipPath, 
        settings.cookie, 
        item.abortController.signal, 
        (pct) => {
          item.progress = pct;
        }
      );

      if (item.status === 'cancelled') {
        throw new Error('Download cancelled by user.');
      }

      item.status = 'extracting';
      item.progress = 100;
      console.log(`[Queue] Extracting zip for: ${item.title}`);

      // Incrementar contagem de download no WT Live
      if (item.lang_group) {
        try {
          const downloadHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          };
          if (settings.cookie) {
            downloadHeaders['Cookie'] = `identity_sid=${settings.cookie}`;
          }
          await fetch('https://live.warthunder.com/api/post/downloaded/', {
            method: 'POST',
            headers: downloadHeaders,
            body: `lang_group=${item.lang_group}`
          });
        } catch (e) {
          console.error('Failed to notify WT Live download count:', e);
        }
      }

      const zip = new AdmZip(tempZipPath);
      const entries = zip.getEntries();

      // Determinar diretório de destino
      let targetBaseDir = '';
      if (item.type === 'camouflage') {
        targetBaseDir = path.join(settings.wtPath, 'UserSkins');
      } else if (item.type === 'sight') {
        targetBaseDir = path.join(settings.sightsPath, 'all_tanks');
      } else {
        targetBaseDir = path.join(settings.wtPath, 'UserSkins');
      }

      if (!fs.existsSync(targetBaseDir)) {
        fs.mkdirSync(targetBaseDir, { recursive: true });
      }

      let createdFolder = '';

      if (item.type === 'sight') {
        const blkEntries = entries.filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.blk'));
        if (blkEntries.length === 0) {
          throw new Error('No .blk sight files found in the download ZIP archive.');
        }
        
        const cleanZipName = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
        const modSightsDir = path.join(settings.sightsPath, cleanZipName, 'all_tanks');
        
        if (!fs.existsSync(modSightsDir)) {
          fs.mkdirSync(modSightsDir, { recursive: true });
        }

        for (const entry of blkEntries) {
          const entryData = entry.getData();
          const originalFileName = path.basename(entry.entryName);
          const finalDestPath = path.join(modSightsDir, originalFileName);
          fs.writeFileSync(finalDestPath, entryData);
        }
        
        fs.unlinkSync(tempZipPath);
        createdFolder = cleanZipName;

        const metadataFolder = path.join(settings.sightsPath, cleanZipName);
        if (fs.existsSync(metadataFolder)) {
          writeQueueMetadata(metadataFolder, item);
        }
      } else {
        // Smart Extraction para Skins
        let hasRootFiles = false;
        let rootFolders = new Set();

        for (const entry of entries) {
          if (!entry.isDirectory) {
            const parts = entry.entryName.split('/');
            if (parts.length === 1) {
              hasRootFiles = true;
            } else {
              rootFolders.add(parts[0]);
            }
          }
        }

        let extractionPath = targetBaseDir;
        let zipHasWTFolderRoot = false;
        let rootFolderName = '';
        if (rootFolders.size === 1) {
          rootFolderName = Array.from(rootFolders)[0];
          const lowerRoot = rootFolderName.toLowerCase();
          if (lowerRoot === 'userskins' || lowerRoot === 'usersights' || lowerRoot === 'all_tanks') {
            zipHasWTFolderRoot = true;
          }
        }

        if (zipHasWTFolderRoot) {
          const lowerRoot = rootFolderName.toLowerCase();
          if (lowerRoot === 'userskins') {
            extractionPath = settings.wtPath;
          } else if (lowerRoot === 'usersights') {
            extractionPath = path.dirname(settings.sightsPath);
          } else if (lowerRoot === 'all_tanks') {
            extractionPath = settings.sightsPath;
          }

          const prefix = rootFolderName + '/';
          const subFolders = new Set();
          for (const entry of entries) {
            if (!entry.isDirectory && entry.entryName.startsWith(prefix)) {
              const remainingPath = entry.entryName.substring(prefix.length);
              const parts = remainingPath.split('/');
              if (parts.length > 0) {
                subFolders.add(parts[0]);
              }
            }
          }
          if (subFolders.size === 1) {
            createdFolder = Array.from(subFolders)[0];
          } else {
            createdFolder = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
          }
        } else {
          if (hasRootFiles || rootFolders.size > 1) {
            const folderName = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
            extractionPath = path.join(targetBaseDir, folderName);
            createdFolder = folderName;
            if (!fs.existsSync(extractionPath)) {
              fs.mkdirSync(extractionPath, { recursive: true });
            }
          } else if (rootFolders.size === 1) {
            createdFolder = Array.from(rootFolders)[0];
          }
        }

        zip.extractAllTo(extractionPath, true);
        fs.unlinkSync(tempZipPath);

        const metadataFolder = path.join(targetBaseDir, createdFolder);
        if (fs.existsSync(metadataFolder)) {
          writeQueueMetadata(metadataFolder, item);
        }
      }

      item.status = 'completed';
      item.progress = 100;
      item.completedAt = Date.now();
      console.log(`[Queue] Completed installation for: ${item.title}`);

    } catch (err) {
      if (fs.existsSync(tempZipPath)) {
        try { fs.unlinkSync(tempZipPath); } catch (_) {}
      }

      if (item.status === 'cancelled') {
        console.log(`[Queue] Cancelled: ${item.title}`);
      } else {
        item.status = 'failed';
        item.error = err.message;
        console.error(`[Queue] Failed installation for: ${item.title}`, err);
      }
      item.completedAt = Date.now();
    } finally {
      delete item.abortController;
      
      const idx = downloadQueue.findIndex(x => x.id === item.id);
      if (idx !== -1) {
        downloadQueue.splice(idx, 1);
      }
      downloadHistory.unshift(item);
      if (downloadHistory.length > 50) {
        downloadHistory.pop();
      }
      
      currentActiveDownload = null;
    }
  }

  isProcessingQueue = false;
}

function writeQueueMetadata(folder, item) {
  try {
    const metadata = {
      postId: item.postId ? parseInt(item.postId, 10) : null,
      lang_group: item.lang_group ? parseInt(item.lang_group, 10) : null,
      fileName: item.name,
      type: item.type,
      title: item.title || null,
      image: item.image || null,
      author: item.author || null,
      installedAt: Date.now()
    };
    fs.writeFileSync(
      path.join(folder, '.wtlive.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Error writing metadata file in queue:', err);
  }
}

// API: Trigger download and installation of a skin/sight
app.post('/api/download', async (req, res) => {
  const { url, type, name, lang_group, postId, title, image, author } = req.body;
  const settings = loadSettings();

  if (type === 'camouflage' && (!settings.wtPath || !fs.existsSync(settings.wtPath))) {
    return res.status(400).json({ error: 'War Thunder installation path is not set or invalid.' });
  }

  if (type === 'sight' && (!settings.sightsPath || !fs.existsSync(settings.sightsPath))) {
    return res.status(400).json({ error: 'User Sights path is not set or invalid.' });
  }

  if (!url || !type || !name) {
    return res.status(400).json({ error: 'Missing required parameters: url, type, name.' });
  }

  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Clean filename
  const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const tempZipPath = path.join(tempDir, safeName);

  try {
    console.log(`Starting download from: ${url}`);
    await downloadFile(url, tempZipPath, settings.cookie);
    console.log(`Download finished: ${tempZipPath}`);

    // Respectful download count increment
    if (lang_group) {
      try {
        const downloadHeaders = {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (settings.cookie) {
          downloadHeaders['Cookie'] = `identity_sid=${settings.cookie}`;
        }

        await fetch('https://live.warthunder.com/api/post/downloaded/', {
          method: 'POST',
          headers: downloadHeaders,
          body: `lang_group=${lang_group}`
        });
      } catch (e) {
        console.error('Failed to notify WT Live download count:', e);
      }
    }

    const zip = new AdmZip(tempZipPath);
    const entries = zip.getEntries();

    // Determine target directory
    let targetBaseDir = '';
    if (type === 'camouflage') {
      targetBaseDir = path.join(settings.wtPath, 'UserSkins');
    } else if (type === 'sight') {
      targetBaseDir = path.join(settings.sightsPath, 'all_tanks');
    } else {
      targetBaseDir = path.join(settings.wtPath, 'UserSkins');
    }

    if (!fs.existsSync(targetBaseDir)) {
      fs.mkdirSync(targetBaseDir, { recursive: true });
    }

    // Special Extraction for Sights:
    if (type === 'sight') {
      const blkEntries = entries.filter(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.blk'));
      
      if (blkEntries.length === 0) {
        throw new Error('No .blk sight files found in the download ZIP archive.');
      }
      
      const cleanZipName = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
      const modSightsDir = path.join(settings.sightsPath, cleanZipName, 'all_tanks');
      
      if (!fs.existsSync(modSightsDir)) {
        fs.mkdirSync(modSightsDir, { recursive: true });
      }

      const installedFiles = [];

      for (const entry of blkEntries) {
        const entryData = entry.getData();
        const originalFileName = path.basename(entry.entryName);
        
        const finalDestPath = path.join(modSightsDir, originalFileName);
        console.log(`Extracting sight file to: ${finalDestPath}`);
        fs.writeFileSync(finalDestPath, entryData);
        installedFiles.push(originalFileName);
      }
      
      // Delete temp zip file
      fs.unlinkSync(tempZipPath);

      // Write metadata file
      const metadataFolder = path.join(settings.sightsPath, cleanZipName);
      if (fs.existsSync(metadataFolder)) {
        try {
          const metadata = {
            postId: postId ? parseInt(postId, 10) : null,
            lang_group: lang_group ? parseInt(lang_group, 10) : null,
            fileName: name,
            type,
            title: title || null,
            image: image || null,
            author: author || null,
            installedAt: Date.now()
          };
          fs.writeFileSync(
            path.join(metadataFolder, '.wtlive.json'),
            JSON.stringify(metadata, null, 2),
            'utf8'
          );
        } catch (err) {
          console.error('Error writing metadata file:', err);
        }
      }

      return res.json({
        success: true,
        message: `Sight installed successfully! Extracted ${blkEntries.length} sight file(s) into ${cleanZipName}/all_tanks/`,
        folder: cleanZipName
      });
    }

    // Smart Extraction (for skins):
    let hasRootFiles = false;
    let rootFolders = new Set();

    for (const entry of entries) {
      if (!entry.isDirectory) {
        const parts = entry.entryName.split('/');
        if (parts.length === 1) {
          hasRootFiles = true;
        } else {
          rootFolders.add(parts[0]);
        }
      }
    }

    let extractionPath = targetBaseDir;
    let createdFolder = '';

    // Check if the zip contains a single root folder named UserSkins/UserSights/all_tanks
    let zipHasWTFolderRoot = false;
    let rootFolderName = '';
    if (rootFolders.size === 1) {
      rootFolderName = Array.from(rootFolders)[0];
      const lowerRoot = rootFolderName.toLowerCase();
      if (lowerRoot === 'userskins' || lowerRoot === 'usersights' || lowerRoot === 'all_tanks') {
        zipHasWTFolderRoot = true;
      }
    }

    if (zipHasWTFolderRoot) {
      const lowerRoot = rootFolderName.toLowerCase();
      // Extract directly to appropriate parent folder so folders merge correctly
      if (lowerRoot === 'userskins') {
        extractionPath = settings.wtPath;
      } else if (lowerRoot === 'usersights') {
        extractionPath = path.dirname(settings.sightsPath);
      } else if (lowerRoot === 'all_tanks') {
        extractionPath = settings.sightsPath;
      }

      // Determine the actual mod folder name inside UserSkins/UserSights/all_tanks
      const prefix = rootFolderName + '/';
      const subFolders = new Set();
      for (const entry of entries) {
        if (!entry.isDirectory && entry.entryName.startsWith(prefix)) {
          const remainingPath = entry.entryName.substring(prefix.length);
          const parts = remainingPath.split('/');
          if (parts.length > 0) {
            subFolders.add(parts[0]);
          }
        }
      }
      if (subFolders.size === 1) {
        createdFolder = Array.from(subFolders)[0];
      } else {
        createdFolder = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
      }
    } else {
      // Normal packaging (files directly, or folder named after the mod)
      if (hasRootFiles || rootFolders.size > 1) {
        const folderName = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
        extractionPath = path.join(targetBaseDir, folderName);
        createdFolder = folderName;
        if (!fs.existsSync(extractionPath)) {
          fs.mkdirSync(extractionPath, { recursive: true });
        }
      } else if (rootFolders.size === 1) {
        createdFolder = Array.from(rootFolders)[0];
      }
    }

    console.log(`Extracting zip to: ${extractionPath}`);
    zip.extractAllTo(extractionPath, true);
    console.log('Extraction complete!');

    // Delete temp zip file
    fs.unlinkSync(tempZipPath);

    // Write metadata file
    const metadataFolder = path.join(targetBaseDir, createdFolder);
    if (fs.existsSync(metadataFolder)) {
      try {
        const metadata = {
          postId: postId ? parseInt(postId, 10) : null,
          lang_group: lang_group ? parseInt(lang_group, 10) : null,
          fileName: name,
          type,
          title: title || null,
          image: image || null,
          author: author || null,
          installedAt: Date.now()
        };
        fs.writeFileSync(
          path.join(metadataFolder, '.wtlive.json'),
          JSON.stringify(metadata, null, 2),
          'utf8'
        );
      } catch (err) {
        console.error('Error writing metadata file:', err);
      }
    }

    res.json({
      success: true,
      message: `${type === 'camouflage' ? 'Skin' : 'Sight'} installed successfully!`,
      folder: createdFolder
    });

  } catch (err) {
    console.error('Error during download/install:', err);
    // Cleanup temp file if error
    if (fs.existsSync(tempZipPath)) {
      try { fs.unlinkSync(tempZipPath); } catch (_) {}
    }
    res.status(500).json({ error: `Installation failed: ${err.message}` });
  }
});

// API: Get download queue status
app.get('/api/queue', (req, res) => {
  const cleanQueue = downloadQueue.map(item => {
    const { abortController, ...rest } = item;
    return rest;
  });
  const cleanActive = currentActiveDownload ? { 
    id: currentActiveDownload.id,
    url: currentActiveDownload.url,
    type: currentActiveDownload.type,
    name: currentActiveDownload.name,
    lang_group: currentActiveDownload.lang_group,
    postId: currentActiveDownload.postId,
    title: currentActiveDownload.title,
    image: currentActiveDownload.image,
    author: currentActiveDownload.author,
    status: currentActiveDownload.status,
    progress: currentActiveDownload.progress,
    error: currentActiveDownload.error,
    addedAt: currentActiveDownload.addedAt
  } : null;
  const cleanHistory = downloadHistory.map(item => {
    const { abortController, ...rest } = item;
    return rest;
  });
  res.json({
    active: cleanActive,
    queue: cleanQueue,
    history: cleanHistory
  });
});

// API: Add item to download queue
app.post('/api/queue/add', (req, res) => {
  const { url, type, name, lang_group, postId, title, image, author } = req.body;

  if (!url || !type || !name) {
    return res.status(400).json({ error: 'Missing required parameters: url, type, name.' });
  }

  const inQueue = downloadQueue.some(x => x.postId === postId) || (currentActiveDownload && currentActiveDownload.postId === postId);
  if (inQueue) {
    return res.status(400).json({ error: 'This item is already in the download queue or installing.' });
  }

  const newItem = {
    id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    url,
    type,
    name,
    lang_group: lang_group ? parseInt(lang_group, 10) : null,
    postId: postId ? parseInt(postId, 10) : null,
    title,
    image,
    author,
    status: 'pending',
    progress: 0,
    error: null,
    addedAt: Date.now()
  };

  downloadQueue.push(newItem);
  res.json({ success: true, message: 'Added to download queue.', item: newItem });

  processQueue();
});

// API: Cancel active or queued download
app.post('/api/queue/cancel', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing parameter: id' });
  }

  if (currentActiveDownload && currentActiveDownload.id === id) {
    currentActiveDownload.status = 'cancelled';
    if (currentActiveDownload.abortController) {
      try {
        currentActiveDownload.abortController.abort();
      } catch (e) {
        console.error('Error aborting active download:', e);
      }
    }
    return res.json({ success: true, message: 'Active download cancellation triggered.' });
  }

  const index = downloadQueue.findIndex(x => x.id === id);
  if (index !== -1) {
    const removed = downloadQueue.splice(index, 1)[0];
    removed.status = 'cancelled';
    removed.completedAt = Date.now();
    downloadHistory.unshift(removed);
    return res.json({ success: true, message: 'Pending download cancelled.' });
  }

  res.status(404).json({ error: 'Download item not found in queue or active downloads.' });
});

// API: Clear completed/failed history
app.post('/api/queue/clear-history', (req, res) => {
  downloadHistory = [];
  res.json({ success: true, message: 'Download history cleared.' });
});

// API: Reorder queue item (Priority ordering)
app.post('/api/queue/reorder', (req, res) => {
  const { id, action } = req.body; // action: 'up' | 'down' | 'top'
  if (!id || !action) {
    return res.status(400).json({ error: 'Missing parameters: id, action' });
  }
  
  // Find the item index
  const index = downloadQueue.findIndex(x => x.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found in queue' });
  }
  
  const item = downloadQueue[index];
  if (item.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending items can be reordered' });
  }
  
  // Get all pending items indexes
  const pendingIndexes = downloadQueue
    .map((x, i) => x.status === 'pending' ? i : -1)
    .filter(i => i !== -1);
    
  const position = pendingIndexes.indexOf(index);
  if (position === -1) {
    return res.status(500).json({ error: 'Internal consistency error' });
  }
  
  if (action === 'up' && position > 0) {
    // Swap with the previous pending item
    const targetIndex = pendingIndexes[position - 1];
    downloadQueue[index] = downloadQueue[targetIndex];
    downloadQueue[targetIndex] = item;
  } else if (action === 'down' && position < pendingIndexes.length - 1) {
    // Swap with the next pending item
    const targetIndex = pendingIndexes[position + 1];
    downloadQueue[index] = downloadQueue[targetIndex];
    downloadQueue[targetIndex] = item;
  } else if (action === 'top' && position > 0) {
    // Move to the very beginning of the pending section (right after any active downloading items)
    downloadQueue.splice(index, 1);
    const firstPendingIndex = pendingIndexes[0];
    downloadQueue.splice(firstPendingIndex, 0, item);
  }
  
  const cleanQueue = downloadQueue.map(item => {
    const { abortController, ...rest } = item;
    return rest;
  });
  
  res.json({ success: true, queue: cleanQueue });
});

// API: Check updates for installed modifications
app.get('/api/installed/check-updates', async (req, res) => {
  const settings = loadSettings();
  const installedList = [];

  const scanMods = (dir, type) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const metaPath = path.join(fullPath, '.wtlive.json');
            if (fs.existsSync(metaPath)) {
              try {
                const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (metadata && metadata.postId && metadata.lang_group) {
                  installedList.push({
                    name: file,
                    type,
                    postId: metadata.postId,
                    lang_group: metadata.lang_group,
                    title: metadata.title || file,
                    image: metadata.image || '',
                    author: metadata.author || null
                  });
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  };

  if (settings.wtPath) {
    scanMods(path.join(settings.wtPath, 'UserSkins'), 'camouflage');
    scanMods(path.join(settings.wtPath, 'UserSkins_disabled'), 'camouflage');
  }
  if (settings.sightsPath) {
    scanMods(settings.sightsPath, 'sight');
    scanMods(settings.sightsPath + '_disabled', 'sight');
  }

  const results = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
  if (settings.cookie) {
    headers['Cookie'] = `identity_sid=${settings.cookie}`;
  }

  for (const mod of installedList) {
    try {
      // 150ms delay between requests to be polite to Gaijin's servers
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const response = await fetch(`https://live.warthunder.com/post/${mod.postId}/`, { headers });
      if (!response.ok) {
        continue;
      }
      
      const html = await response.text();
      const match = html.match(/lang_group=(\d+)/);
      if (match) {
        const onlineLangGroup = parseInt(match[1], 10);
        if (onlineLangGroup !== mod.lang_group) {
          const downloadUrl = `https://live.warthunder.com/api/post/download/?lang_group=${onlineLangGroup}`;
          
          results.push({
            name: mod.name,
            type: mod.type,
            postId: mod.postId,
            currentLangGroup: mod.lang_group,
            newLangGroup: onlineLangGroup,
            title: mod.title,
            image: mod.image,
            author: mod.author,
            downloadUrl
          });
        }
      }
    } catch (err) {
      console.error(`Error checking update for post ${mod.postId}:`, err);
    }
  }
  res.json({ updates: results });
});

// API: Check updates for the software itself
app.get('/api/software/check-update', async (req, res) => {
  const forceMock = req.query.force === 'true';
  const pkgPath = path.join(__dirname, 'package.json');
  let currentVersion = '1.0.0';
  
  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      currentVersion = pkg.version || '1.0.0';
    }
  } catch (err) {
    console.error('Error reading package.json version:', err);
  }

  // Support for mock testing
  if (forceMock) {
    return res.json({
      currentVersion,
      latestVersion: '1.1.0',
      updateAvailable: true,
      releaseUrl: 'https://github.com/MigueXYZ/warthunderlivedownloadmanager/releases',
      releaseName: 'v1.1.0: Aero Update & Performance Improvements',
      releaseNotes: '### Added\n- Beautiful glassmorphic UI updates\n- Support for fast batch extraction\n- Telemetry stability improvements\n\n### Fixed\n- Telemetry connection dropouts\n- Empty settings load issues'
    });
  }

  try {
    const response = await fetch('https://api.github.com/repos/MigueXYZ/warthunderlivedownloadmanager/releases/latest', {
      headers: {
        'User-Agent': 'warthunderlivedownloadmanager-updater'
      }
    });

    if (response.status === 404) {
      // No releases yet, check tags
      const tagsResponse = await fetch('https://api.github.com/repos/MigueXYZ/warthunderlivedownloadmanager/tags', {
        headers: {
          'User-Agent': 'warthunderlivedownloadmanager-updater'
        }
      });
      if (tagsResponse.ok) {
        const tags = await tagsResponse.json();
        if (Array.isArray(tags) && tags.length > 0) {
          const latestTag = tags[0].name.replace(/^v/, '');
          const updateAvailable = isNewerVersion(currentVersion, latestTag);
          return res.json({
            currentVersion,
            latestVersion: latestTag,
            updateAvailable,
            releaseUrl: `https://github.com/MigueXYZ/warthunderlivedownloadmanager/releases/tag/v${latestTag}`,
            releaseName: `v${latestTag}`,
            releaseNotes: 'New tag release available on GitHub.'
          });
        }
      }
      return res.json({
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        message: 'No releases or tags found on GitHub repository.'
      });
    }

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.tag_name) {
      throw new Error('Invalid release payload from GitHub');
    }

    const latestVersion = data.tag_name.replace(/^v/, '');
    const updateAvailable = isNewerVersion(currentVersion, latestVersion);

    res.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: data.html_url,
      releaseName: data.name || data.tag_name,
      releaseNotes: data.body || 'No release notes provided.'
    });
  } catch (err) {
    console.error('Error checking software update:', err);
    res.status(500).json({ error: 'Failed to check for updates: ' + err.message });
  }
});

// Helper to compare semver versions
function isNewerVersion(current, latest) {
  const cParts = current.split('.').map(Number);
  const lParts = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
    const c = cParts[i] || 0;
    const l = lParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

// Helper: Calculate directory statistics (Total, Source Project files, Archive files, Game textures)
function getDirectoryStats(dirPath) {
  let stats = {
    totalSize: 0,
    sourceSize: 0,
    archiveSize: 0,
    gameSize: 0,
    filesCount: 0
  };

  if (!fs.existsSync(dirPath)) return stats;

  const walk = (currentPath) => {
    try {
      const files = fs.readdirSync(currentPath);
      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const fileStat = fs.statSync(fullPath);
        if (fileStat.isDirectory()) {
          walk(fullPath);
        } else {
          const size = fileStat.size;
          stats.totalSize += size;
          stats.filesCount += 1;
          
          const ext = path.extname(file).toLowerCase();
          if (ext === '.psd' || ext === '.xcf') {
            stats.sourceSize += size;
          } else if (ext === '.zip' || ext === '.rar' || ext === '.7z' || ext === '.tar' || ext === '.gz') {
            stats.archiveSize += size;
          } else {
            stats.gameSize += size;
          }
        }
      }
    } catch (_) {}
  };

  walk(dirPath);
  return stats;
}

// Helper: Delete source project and archive files from directory recursively
function cleanDirectory(dirPath) {
  let spaceSaved = 0;
  if (!fs.existsSync(dirPath)) return spaceSaved;

  const walkAndClean = (currentPath) => {
    try {
      const files = fs.readdirSync(currentPath);
      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const fileStat = fs.statSync(fullPath);
        if (fileStat.isDirectory()) {
          walkAndClean(fullPath);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (ext === '.psd' || ext === '.xcf' || ext === '.zip' || ext === '.rar' || ext === '.7z' || ext === '.tar' || ext === '.gz') {
            fs.unlinkSync(fullPath);
            spaceSaved += fileStat.size;
          }
        }
      }
    } catch (_) {}
  };

  walkAndClean(dirPath);
  return spaceSaved;
}

// API: Analyze storage usage of all installed mods
app.get('/api/storage/analyze', (req, res) => {
  const settings = loadSettings();
  const modsList = [];

  const scanDir = (baseDir, type, isDisabled) => {
    if (!fs.existsSync(baseDir)) return;
    try {
      const folders = fs.readdirSync(baseDir);
      for (const folder of folders) {
        const fullPath = path.join(baseDir, folder);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          let metadata = null;
          const metaPath = path.join(fullPath, '.wtlive.json');
          if (fs.existsSync(metaPath)) {
            try {
              metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            } catch (_) {}
          }
          
          const stats = getDirectoryStats(fullPath);
          if (stats.totalSize > 0) {
            modsList.push({
              name: folder,
              type,
              disabled: isDisabled,
              path: fullPath,
              title: metadata ? metadata.title : folder,
              stats
            });
          }
        }
      }
    } catch (_) {}
  };

  if (settings.wtPath) {
    scanDir(path.join(settings.wtPath, 'UserSkins'), 'camouflage', false);
    scanDir(path.join(settings.wtPath, 'UserSkins_disabled'), 'camouflage', true);
  }
  if (settings.sightsPath) {
    scanDir(settings.sightsPath, 'sight', false);
    scanDir(settings.sightsPath + '_disabled', 'sight', true);
  }

  let globalTotal = 0;
  let globalSource = 0;
  let globalArchive = 0;
  let globalGame = 0;

  modsList.forEach(m => {
    globalTotal += m.stats.totalSize;
    globalSource += m.stats.sourceSize;
    globalArchive += m.stats.archiveSize;
    globalGame += m.stats.gameSize;
  });

  modsList.sort((a, b) => b.stats.totalSize - a.stats.totalSize);

  res.json({
    mods: modsList,
    totals: {
      totalSize: globalTotal,
      sourceSize: globalSource,
      archiveSize: globalArchive,
      gameSize: globalGame
    }
  });
});

// API: Perform cleanup on a single mod or all mods
app.post('/api/storage/clean', (req, res) => {
  const { name, type, all } = req.body;
  const settings = loadSettings();
  let spaceSaved = 0;

  if (all) {
    const cleanAllInDir = (baseDir) => {
      if (!fs.existsSync(baseDir)) return;
      try {
        const folders = fs.readdirSync(baseDir);
        for (const folder of folders) {
          const fullPath = path.join(baseDir, folder);
          if (fs.statSync(fullPath).isDirectory()) {
            spaceSaved += cleanDirectory(fullPath);
          }
        }
      } catch (_) {}
    };

    if (settings.wtPath) {
      cleanAllInDir(path.join(settings.wtPath, 'UserSkins'));
      cleanAllInDir(path.join(settings.wtPath, 'UserSkins_disabled'));
    }
    if (settings.sightsPath) {
      cleanAllInDir(settings.sightsPath);
      cleanAllInDir(settings.sightsPath + '_disabled');
    }

    return res.json({
      success: true,
      spaceSaved,
      message: `Successfully cleaned all modifications. Saved ${(spaceSaved / 1024 / 1024).toFixed(1)} MB.`
    });
  }

  if (!name || !type) {
    return res.status(400).json({ error: 'Missing parameters: name, type' });
  }

  let folderPath = '';
  let disabledFolderPath = '';
  if (type === 'camouflage') {
    if (!settings.wtPath) return res.status(400).json({ error: 'War Thunder path is not set.' });
    folderPath = path.join(settings.wtPath, 'UserSkins', name);
    disabledFolderPath = path.join(settings.wtPath, 'UserSkins_disabled', name);
  } else if (type === 'sight') {
    if (!settings.sightsPath) return res.status(400).json({ error: 'User Sights path is not set.' });
    folderPath = path.join(settings.sightsPath, name);
    disabledFolderPath = path.join(settings.sightsPath + '_disabled', name);
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  let targetPath = '';
  if (fs.existsSync(folderPath)) {
    targetPath = folderPath;
  } else if (fs.existsSync(disabledFolderPath)) {
    targetPath = disabledFolderPath;
  }

  if (!targetPath) {
    return res.status(404).json({ error: 'Modification folder not found.' });
  }

  spaceSaved = cleanDirectory(targetPath);
  res.json({
    success: true,
    spaceSaved,
    message: `Cleaned "${name}". Saved ${(spaceSaved / 1024 / 1024).toFixed(1)} MB.`
  });
});

// API: List installed skins and sights (including disabled mods in separate folders)
app.get('/api/installed', (req, res) => {
  const settings = loadSettings();
  const installedSkins = [];
  const installedSights = [];

  // Read UserSkins (active and disabled)
  if (settings.wtPath && fs.existsSync(settings.wtPath)) {
    const skinsDir = path.join(settings.wtPath, 'UserSkins');
    const disabledSkinsDir = path.join(settings.wtPath, 'UserSkins_disabled');

    const scanSkins = (dir, isDisabled) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            let metadata = null;
            const metaPath = path.join(fullPath, '.wtlive.json');
            if (fs.existsSync(metaPath)) {
              try {
                metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              } catch (_) {}
            }
            let blkFiles = [];
            try {
              blkFiles = fs.readdirSync(fullPath)
                .filter(f => f.toLowerCase().endsWith('.blk'))
                .map(f => f.toLowerCase());
            } catch (_) {}

            installedSkins.push({
              name: file,
              disabled: isDisabled,
              path: fullPath,
              installedAt: stat.mtimeMs || stat.mtime.getTime(),
              hasBlk: blkFiles.length > 0,
              blkFiles,
              metadata
            });
          }
        } catch (_) {}
      }
    };

    scanSkins(skinsDir, false);
    scanSkins(disabledSkinsDir, true);
  }

  // Read UserSights (active and disabled)
  if (settings.sightsPath && fs.existsSync(settings.sightsPath)) {
    const sightsDir = settings.sightsPath;
    const disabledSightsDir = settings.sightsPath + '_disabled';

    const scanSights = (dir, isDisabled) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            // Check if it has a subfolder 'all_tanks'
            const allTanksDir = path.join(fullPath, 'all_tanks');
            if (fs.existsSync(allTanksDir) && fs.statSync(allTanksDir).isDirectory()) {
              const subfiles = fs.readdirSync(allTanksDir);
              const blkFiles = subfiles.filter(f => f.toLowerCase().endsWith('.blk'));
              let metadata = null;
              const metaPath = path.join(fullPath, '.wtlive.json');
              if (fs.existsSync(metaPath)) {
                try {
                  metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                } catch (_) {}
              }

              installedSights.push({
                name: file,
                disabled: isDisabled,
                path: fullPath,
                installedAt: stat.mtimeMs || stat.mtime.getTime(),
                filesCount: blkFiles.length,
                metadata
              });
            }
          }
        } catch (_) {}
      }
    };

    scanSights(sightsDir, false);
    scanSights(disabledSightsDir, true);
  }

  res.json({
    skins: installedSkins.sort((a, b) => b.installedAt - a.installedAt),
    sights: installedSights.sort((a, b) => b.installedAt - a.installedAt)
  });
});

// API: Toggle modification active/disabled state by moving folder
app.post('/api/installed/toggle', (req, res) => {
  const { type, name } = req.body;
  const settings = loadSettings();

  if (!name || !type) {
    return res.status(400).json({ error: 'Missing parameters: type, name' });
  }

  let activeBaseDir = '';
  let disabledBaseDir = '';
  if (type === 'camouflage') {
    if (!settings.wtPath) return res.status(400).json({ error: 'War Thunder path is not set.' });
    activeBaseDir = path.join(settings.wtPath, 'UserSkins');
    disabledBaseDir = path.join(settings.wtPath, 'UserSkins_disabled');
  } else if (type === 'sight') {
    if (!settings.sightsPath) return res.status(400).json({ error: 'User Sights path is not set.' });
    activeBaseDir = settings.sightsPath;
    disabledBaseDir = settings.sightsPath + '_disabled';
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const activePath = path.join(activeBaseDir, name);
  const disabledPath = path.join(disabledBaseDir, name);

  const activeExists = fs.existsSync(activePath);
  const disabledExists = fs.existsSync(disabledPath);

  try {
    if (activeExists && !disabledExists) {
      if (!fs.existsSync(disabledBaseDir)) {
        fs.mkdirSync(disabledBaseDir, { recursive: true });
      }
      fs.renameSync(activePath, disabledPath);
      return res.json({ success: true, disabled: true, message: `${name} disabled successfully.` });
    } else if (disabledExists && !activeExists) {
      if (!fs.existsSync(activeBaseDir)) {
        fs.mkdirSync(activeBaseDir, { recursive: true });
      }
      fs.renameSync(disabledPath, activePath);
      return res.json({ success: true, disabled: false, message: `${name} enabled successfully.` });
    } else if (activeExists && disabledExists) {
      return res.status(409).json({ error: `Conflict: both active and disabled folders exist for ${name}` });
    } else {
      return res.status(404).json({ error: `Modification folder not found for ${name}` });
    }
  } catch (err) {
    console.error('Error toggling modification state:', err);
    return res.status(500).json({ error: `Toggle failed: ${err.message}` });
  }
});

// API: Delete an installed skin/sight
app.delete('/api/installed', (req, res) => {
  const { type, name } = req.body;
  const settings = loadSettings();

  if (!name || !type) {
    return res.status(400).json({ error: 'Missing parameters: type, name' });
  }

  let folderPath = '';
  let disabledFolderPath = '';
  if (type === 'camouflage') {
    if (!settings.wtPath) return res.status(400).json({ error: 'War Thunder path is not set.' });
    folderPath = path.join(settings.wtPath, 'UserSkins', name);
    disabledFolderPath = path.join(settings.wtPath, 'UserSkins_disabled', name);
  } else if (type === 'sight') {
    if (!settings.sightsPath) return res.status(400).json({ error: 'User Sights path is not set.' });
    folderPath = path.join(settings.sightsPath, name);
    disabledFolderPath = path.join(settings.sightsPath + '_disabled', name);
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  let pathToTarget = '';
  if (fs.existsSync(folderPath)) {
    pathToTarget = folderPath;
  } else if (fs.existsSync(disabledFolderPath)) {
    pathToTarget = disabledFolderPath;
  } else {
    return res.status(404).json({ error: 'Folder or file not found' });
  }

  try {
    const stat = fs.statSync(pathToTarget);
    if (stat.isDirectory()) {
      fs.rmSync(pathToTarget, { recursive: true, force: true });
    } else {
      fs.unlinkSync(pathToTarget);
    }
    res.json({ success: true, message: `${name} deleted successfully.` });
  } catch (err) {
    console.error('Error deleting directory:', err);
    res.status(500).json({ error: `Delete failed: ${err.message}` });
  }
});

// API: Poll local War Thunder client telemetry
app.get('/api/telemetry', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);

    const response = await fetch('http://127.0.0.1:8111/state', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error();
    }

    const state = await response.json();

    // Fetch indicators as well
    let indicators = {};
    try {
      const indController = new AbortController();
      const indTimeoutId = setTimeout(() => indController.abort(), 800);
      const indResponse = await fetch('http://127.0.0.1:8111/indicators', {
        signal: indController.signal
      });
      clearTimeout(indTimeoutId);
      if (indResponse.ok) {
        indicators = await indResponse.json();
      }
    } catch (_) {}

    res.json({
      active: true,
      vehicle: state.type || indicators.type || 'Unknown Vehicle',
      state,
      indicators
    });
  } catch (err) {
    res.json({ active: false, message: 'Game is not running or not in a flight/drive' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
