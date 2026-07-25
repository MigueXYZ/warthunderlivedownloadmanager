const fs = require('fs');
const path = require('path');

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

// Calculate directory statistics (Total, Source Project files, Archive files, Game textures)
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

// Delete source project and archive files from directory recursively
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

// Scan installed skins
function scanInstalledSkins(wtPath) {
  const installedSkins = [];
  if (!wtPath || !fs.existsSync(wtPath)) return installedSkins;

  const skinsDir = path.join(wtPath, 'UserSkins');
  const disabledSkinsDir = path.join(wtPath, 'UserSkins_disabled');

  const scan = (dir, isDisabled) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
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
      }
    } catch (_) {}
  };

  scan(skinsDir, false);
  scan(disabledSkinsDir, true);
  return installedSkins;
}

// Scan installed sights
function scanInstalledSights(sightsPath) {
  const installedSights = [];
  if (!sightsPath) return installedSights;

  const activeSightsDir = sightsPath;
  const disabledSightsDir = sightsPath + '_disabled';

  const scan = (dir, isDisabled) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file.toLowerCase() === 'all_tanks') {
            scan(fullPath, isDisabled);
            continue;
          }
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

          installedSights.push({
            name: file,
            disabled: isDisabled,
            path: fullPath,
            installedAt: stat.mtimeMs || stat.mtime.getTime(),
            hasBlk: blkFiles.length > 0,
            blkFiles,
            metadata
          });
        }
      }
    } catch (_) {}
  };

  scan(activeSightsDir, false);
  scan(disabledSightsDir, true);
  return installedSights;
}

const AdmZip = require('adm-zip');
const { logActivity } = require('./logger');

function installLocalZip(tempZipPath, type, settings) {
  const targetBaseDir = type === 'sight' 
    ? path.join(settings.sightsPath, 'all_tanks') 
    : path.join(settings.wtPath, 'UserSkins');
    
  if (!fs.existsSync(targetBaseDir)) {
    fs.mkdirSync(targetBaseDir, { recursive: true });
  }

  const zip = new AdmZip(tempZipPath);
  const entries = zip.getEntries();
  
  let hasRootFiles = false;
  const rootFolders = new Set();
  let zipHasWTFolderRoot = false;

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

  if (rootFolders.size === 1) {
    const lowerRoot = Array.from(rootFolders)[0].toLowerCase();
    if (lowerRoot === 'userskins' || lowerRoot === 'usersights' || lowerRoot === 'all_tanks') {
      zipHasWTFolderRoot = true;
    }
  }

  let extractionPath = targetBaseDir;
  let createdFolder = '';

  const safeName = path.basename(tempZipPath);

  if (zipHasWTFolderRoot) {
    const rootFolder = Array.from(rootFolders)[0];
    const lowerRoot = rootFolder.toLowerCase();
    
    let prefix = rootFolder + '/';
    if (lowerRoot === 'userskins') {
      extractionPath = path.join(settings.wtPath, 'UserSkins');
    } else if (lowerRoot === 'usersights') {
      extractionPath = settings.sightsPath;
    } else if (lowerRoot === 'all_tanks') {
      extractionPath = settings.sightsPath;
    }

    const subFolders = new Set();
    for (const entry of entries) {
      if (!entry.isDirectory && entry.entryName.startsWith(prefix)) {
        const relativeName = entry.entryName.substring(prefix.length);
        const parts = relativeName.split('/');
        if (parts.length > 0) {
          subFolders.add(parts[0]);
        }
      }
    }

    if (subFolders.size === 1) {
      createdFolder = Array.from(subFolders)[0];
    } else {
      const folderName = safeName.replace(/\.(zip|rar|tar|gz)$/i, '');
      extractionPath = path.join(extractionPath, folderName);
      createdFolder = folderName;
      
      if (!fs.existsSync(extractionPath)) {
        fs.mkdirSync(extractionPath, { recursive: true });
      }

      for (const entry of entries) {
        if (!entry.isDirectory && entry.entryName.startsWith(prefix)) {
          const zipSub = new AdmZip(tempZipPath);
          const relativeName = entry.entryName.substring(prefix.length);
          const destFileDir = path.join(extractionPath, path.dirname(relativeName));
          
          if (!fs.existsSync(destFileDir)) {
            fs.mkdirSync(destFileDir, { recursive: true });
          }
          zipSub.extractEntryTo(entry.entryName, destFileDir, false, true);
        }
      }
      try { fs.unlinkSync(tempZipPath); } catch (_) {}
    }

    if (createdFolder && zipHasWTFolderRoot && subFolders.size === 1) {
      zip.extractAllTo(extractionPath, true);
      try { fs.unlinkSync(tempZipPath); } catch (_) {}
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

    zip.extractAllTo(extractionPath, true);
    try { fs.unlinkSync(tempZipPath); } catch (_) {}
  }

  // Write local metadata
  const metadataFolder = path.join(targetBaseDir, createdFolder);
  if (fs.existsSync(metadataFolder)) {
    const metaPath = path.join(metadataFolder, '.wtlive.json');
    const metadata = {
      postId: `local_${Date.now()}`,
      name: safeName,
      title: safeName.replace(/\.(zip)$/i, ''),
      url: '',
      type,
      image: '',
      author: { nickname: 'Local File', avatar: '' },
      lang_group: 0,
      downloadedAt: Date.now()
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
    logActivity(`Successfully installed local mod: ${createdFolder} (${type})`, 'INFO');
  }
  
  return createdFolder;
}

module.exports = {
  isNewerVersion,
  getDirectoryStats,
  cleanDirectory,
  scanInstalledSkins,
  scanInstalledSights,
  installLocalZip
};
