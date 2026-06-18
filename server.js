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
  let settings = { wtPath: '', sightsPath: '', cookie: '' };
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
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  res.json({
    wtPath: settings.wtPath,
    sightsPath: settings.sightsPath,
    cookie: settings.cookie || '',
    detectedWT: autoDetectWTPath(),
    detectedSights: autoDetectUserSightsPath(),
    isWTValid: settings.wtPath ? fs.existsSync(settings.wtPath) : false,
    isSightsValid: settings.sightsPath ? fs.existsSync(settings.sightsPath) : false
  });
});

// API: Update settings
app.post('/api/settings', (req, res) => {
  const { wtPath, sightsPath, cookie } = req.body;
  const cleanWT = wtPath ? wtPath.trim() : '';
  const cleanSights = sightsPath ? sightsPath.trim() : '';
  const cleanCookie = cookie ? cookie.trim() : '';

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

  const settings = { wtPath: cleanWT, sightsPath: cleanSights, cookie: cleanCookie };
  saveSettings(settings);
  ensureSubdirsExist(cleanWT, cleanSights);

  res.json({ success: true, settings });
});

// API: Proxy request to live.warthunder.com search feed
app.post('/api/feed', async (req, res) => {
  const { content, sort, page, searchString } = req.body;
  const settings = loadSettings();

  try {
    const params = new URLSearchParams();
    params.append('content', content || 'camouflage');
    params.append('sort', sort || 'downloads');
    params.append('page', page || '0');
    if (searchString) {
      params.append('searchString', searchString);
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

// API: Trigger download and installation of a skin/sight
app.post('/api/download', async (req, res) => {
  const { url, type, name, lang_group } = req.body;
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

// API: List installed skins and sights
app.get('/api/installed', (req, res) => {
  const settings = loadSettings();
  const installedSkins = [];
  const installedSights = [];

  // Read UserSkins
  if (settings.wtPath && fs.existsSync(settings.wtPath)) {
    const skinsDir = path.join(settings.wtPath, 'UserSkins');
    if (fs.existsSync(skinsDir)) {
      const files = fs.readdirSync(skinsDir);
      for (const file of files) {
        const fullPath = path.join(skinsDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const subfiles = fs.readdirSync(fullPath);
          const hasBlk = subfiles.some(f => f.endsWith('.blk'));
          installedSkins.push({
            name: file,
            path: fullPath,
            installedAt: stat.mtime,
            hasBlk
          });
        }
      }
    }
  }

  // Read UserSights
  if (settings.sightsPath && fs.existsSync(settings.sightsPath)) {
    const sightsDir = settings.sightsPath;
    if (fs.existsSync(sightsDir)) {
      const files = fs.readdirSync(sightsDir);
      for (const file of files) {
        const fullPath = path.join(sightsDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          // Check if it has a subfolder 'all_tanks'
          const allTanksDir = path.join(fullPath, 'all_tanks');
          if (fs.existsSync(allTanksDir) && fs.statSync(allTanksDir).isDirectory()) {
            const subfiles = fs.readdirSync(allTanksDir);
            const blkFiles = subfiles.filter(f => f.toLowerCase().endsWith('.blk'));
            if (blkFiles.length > 0) {
              installedSights.push({
                name: file, // Name of the mod folder
                path: fullPath,
                installedAt: stat.mtime,
                filesCount: blkFiles.length
              });
            }
          }
        }
      }
    }
  }

  res.json({
    skins: installedSkins.sort((a, b) => b.installedAt - a.installedAt),
    sights: installedSights.sort((a, b) => b.installedAt - a.installedAt)
  });
});

// API: Delete an installed skin/sight
app.delete('/api/installed', (req, res) => {
  const { type, name } = req.body;
  const settings = loadSettings();

  if (!name || !type) {
    return res.status(400).json({ error: 'Missing parameters: type, name' });
  }

  let folderPath = '';
  if (type === 'camouflage') {
    if (!settings.wtPath) return res.status(400).json({ error: 'War Thunder path is not set.' });
    folderPath = path.join(settings.wtPath, 'UserSkins', name);
  } else if (type === 'sight') {
    if (!settings.sightsPath) return res.status(400).json({ error: 'User Sights path is not set.' });
    folderPath = path.join(settings.sightsPath, name);
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'Folder or file not found' });
  }

  try {
    const stat = fs.statSync(folderPath);
    if (stat.isDirectory()) {
      fs.rmSync(folderPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(folderPath);
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
