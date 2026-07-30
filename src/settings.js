const fs = require('fs');
const path = require('path');
const { logActivity } = require('./logger');

const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const SETTINGS_FILE = path.join(baseDir, 'settings.json');

// Helper to load settings
function loadSettings() {
  let settings = { wtPath: '', sightsPath: '', cookie: '', blacklistTags: '', whitelistTags: '', limitPerDownload: 0, limitGlobal: 0, verifyIntegrity: true, tempPath: '' };
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      logActivity('Error reading settings file: ' + e.message, 'ERROR');
    }
  }

  // Fallback to auto-detection if settings are empty
  if (!settings.wtPath) {
    settings.wtPath = autoDetectWTPath();
  }
  if (!settings.sightsPath) {
    settings.sightsPath = autoDetectUserSightsPath();
  }
  if (!Array.isArray(settings.favorites)) {
    settings.favorites = [];
  }
  if (!Array.isArray(settings.collections)) {
    settings.collections = [];
  }
  return settings;
}

// Helper to save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) {
    logActivity('Error writing settings file: ' + e.message, 'ERROR');
  }
}

// Automatically detect War Thunder installation path on Windows
function autoDetectWTPath() {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\War Thunder',
    'C:\\Program Files\\Steam\\steamapps\\common\\War Thunder',
    'D:\\SteamLibrary\\steamapps\\common\\War Thunder',
    'E:\\SteamLibrary\\steamapps\\common\\War Thunder',
    'C:\\WarThunder',
    'D:\\WarThunder',
    'C:\\AppData\\Local\\WarThunder'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return '';
}

// Automatically detect UserSights saves folder path inside My Games on Windows
function autoDetectUserSightsPath() {
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  if (!homeDir) return '';

  const myGamesPath = path.join(homeDir, 'Documents', 'My Games', 'WarThunder');
  if (fs.existsSync(myGamesPath)) {
    const savesPath = path.join(myGamesPath, 'Saves');
    if (fs.existsSync(savesPath)) {
      try {
        const files = fs.readdirSync(savesPath);
        for (const file of files) {
          const fullPath = path.join(savesPath, file);
          if (fs.statSync(fullPath).isDirectory() && /^\d+$/.test(file)) {
            const userSightsPath = path.join(fullPath, 'UserSights');
            return userSightsPath;
          }
        }
      } catch (e) {
        // Ignorar erro e retornar vazio
      }
    }
  }
  return '';
}

// Ensure critical directories exist
function ensureSubdirsExist(wtPath, sightsPath) {
  if (wtPath && fs.existsSync(wtPath)) {
    const userSkinsDir = path.join(wtPath, 'UserSkins');
    if (!fs.existsSync(userSkinsDir)) {
      try {
        fs.mkdirSync(userSkinsDir, { recursive: true });
        logActivity(`Created missing UserSkins folder: ${userSkinsDir}`, 'INFO');
      } catch (err) {
        logActivity(`Failed to create UserSkins folder: ${err.message}`, 'ERROR');
      }
    }
  }

  if (sightsPath) {
    try {
      if (!fs.existsSync(sightsPath)) {
        fs.mkdirSync(sightsPath, { recursive: true });
        logActivity(`Created missing UserSights folder: ${sightsPath}`, 'INFO');
      }
    } catch (err) {
      logActivity(`Failed to create UserSights folder: ${err.message}`, 'ERROR');
    }
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  autoDetectWTPath,
  autoDetectUserSightsPath,
  ensureSubdirsExist,
  SETTINGS_FILE
};
