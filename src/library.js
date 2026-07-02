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

module.exports = {
  isNewerVersion,
  getDirectoryStats,
  cleanDirectory,
  scanInstalledSkins,
  scanInstalledSights
};
