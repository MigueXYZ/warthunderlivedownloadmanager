const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

const { logActivity, logFilePath } = require('./src/logger');
const { loadSettings, saveSettings, ensureSubdirsExist } = require('./src/settings');
const { fetchPostMetadata } = require('./src/feed');
const { isNewerVersion, getDirectoryStats, cleanDirectory, scanInstalledSkins, scanInstalledSights, installLocalZip } = require('./src/library');
const { queueState, processQueue } = require('./src/queue');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API: Get current settings
app.get('/api/settings', async (req, res) => {
  const settings = loadSettings();
  
  let cookieValid = null;
  let cookieUsername = null;
  
  if (settings.cookie) {
    try {
      const checkRes = await fetch('https://live.warthunder.com/feed/all/', {
        headers: {
          'Cookie': `token=${settings.cookie}`,
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
      logActivity('Error verifying Gaijin session cookie: ' + err.message, 'ERROR');
      cookieValid = false;
    }
  }

  const { autoDetectWTPath, autoDetectUserSightsPath } = require('./src/settings');
  res.json({
    wtPath: settings.wtPath,
    sightsPath: settings.sightsPath,
    cookie: settings.cookie || '',
    blacklistTags: settings.blacklistTags || '',
    whitelistTags: settings.whitelistTags || '',
    limitPerDownload: settings.limitPerDownload || 0,
    limitGlobal: settings.limitGlobal || 0,
    verifyIntegrity: settings.verifyIntegrity !== false,
    tempPath: settings.tempPath || '',
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
  const { wtPath, sightsPath, cookie, blacklistTags, whitelistTags, limitPerDownload, limitGlobal, verifyIntegrity, tempPath } = req.body;
  const cleanWT = wtPath ? wtPath.trim() : '';
  const cleanSights = sightsPath ? sightsPath.trim() : '';
  const cleanCookie = cookie ? cookie.trim() : '';
  const cleanBlacklist = blacklistTags ? blacklistTags.trim() : '';
  const cleanWhitelist = whitelistTags ? whitelistTags.trim() : '';
  const cleanTemp = tempPath ? tempPath.trim() : '';
  const dlLimit = parseInt(limitPerDownload, 10) || 0;
  const gLimit = parseInt(limitGlobal, 10) || 0;
  const valIntegrity = verifyIntegrity !== false;

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

  if (cleanTemp) {
    try {
      if (!fs.existsSync(cleanTemp)) {
        fs.mkdirSync(cleanTemp, { recursive: true });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Failed to access or create the custom temp directory.' });
    }
  }

  const settings = { 
    wtPath: cleanWT, 
    sightsPath: cleanSights, 
    cookie: cleanCookie,
    blacklistTags: cleanBlacklist,
    whitelistTags: cleanWhitelist,
    limitPerDownload: dlLimit,
    limitGlobal: gLimit,
    verifyIntegrity: valIntegrity,
    tempPath: cleanTemp
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

    if (settings.cookie) {
      headers['Cookie'] = `token=${settings.cookie}`;
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

    if (data.status === 'OK' && data.data && Array.isArray(data.data.list)) {
      let list = data.data.list;

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
    logActivity('Error proxying feed request: ' + err.message, 'ERROR');
    res.status(500).json({ error: err.message });
  }
});

// API: Get rich details of a post
app.post('/api/post-details', async (req, res) => {
  const { lang_group } = req.body;
  const settings = loadSettings();
  
  if (!lang_group) {
    return res.status(400).json({ error: 'Missing lang_group parameter.' });
  }

  const meta = await fetchPostMetadata(lang_group, settings.cookie);
  if (meta) {
    res.json(meta);
  } else {
    res.status(500).json({ error: 'Failed to retrieve metadata from WT Live API.' });
  }
});

// API: Download resource directly (Queue addition)
app.post(['/api/download', '/api/queue/add'], (req, res) => {
  const { url, type, name, postId, title, image, author, lang_group } = req.body;
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

  const id = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  const isActive = queueState.currentActiveDownload && queueState.currentActiveDownload.postId === postId;
  const isQueued = queueState.downloadQueue.some(x => x.postId === postId);
  if (isActive || isQueued) {
    return res.status(400).json({ error: 'This modification is already downloading or in the queue.' });
  }

  const newItem = {
    id,
    postId,
    name,
    title: title || name,
    url,
    type,
    image,
    author,
    lang_group,
    status: 'pending',
    progress: 0,
    retries: 0,
    maxRetries: 3,
    queuedAt: Date.now()
  };

  queueState.downloadQueue.push(newItem);
  processQueue();

  res.json({ success: true, message: 'Added to download queue.', item: newItem });
});

// API: Get download queue status
app.get('/api/queue', (req, res) => {
  const cleanActive = queueState.currentActiveDownload ? {
    id: queueState.currentActiveDownload.id,
    postId: queueState.currentActiveDownload.postId,
    name: queueState.currentActiveDownload.name,
    title: queueState.currentActiveDownload.title,
    url: queueState.currentActiveDownload.url,
    type: queueState.currentActiveDownload.type,
    image: queueState.currentActiveDownload.image,
    author: queueState.currentActiveDownload.author,
    lang_group: queueState.currentActiveDownload.lang_group,
    status: queueState.currentActiveDownload.status,
    progress: queueState.currentActiveDownload.progress,
    downloadedBytes: queueState.currentActiveDownload.downloadedBytes,
    totalBytes: queueState.currentActiveDownload.totalBytes,
    speed: queueState.currentActiveDownload.speed,
    eta: queueState.currentActiveDownload.eta
  } : null;

  res.json({
    active: cleanActive,
    queue: queueState.downloadQueue,
    history: queueState.downloadHistory
  });
});

// API: Pause download
app.post('/api/queue/pause', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing parameter: id' });

  if (queueState.currentActiveDownload && queueState.currentActiveDownload.id === id) {
    queueState.currentActiveDownload.status = 'paused';
    if (queueState.currentActiveDownload.abortController) {
      queueState.currentActiveDownload.abortController.abort();
    }
    return res.json({ success: true, message: 'Active download paused.' });
  }

  const queuedItem = queueState.downloadQueue.find(x => x.id === id);
  if (queuedItem) {
    queuedItem.status = 'paused';
    return res.json({ success: true, message: 'Queued item paused.' });
  }

  res.status(404).json({ error: 'Download item not found.' });
});

// API: Resume download
app.post('/api/queue/resume', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing parameter: id' });

  const queuedItem = queueState.downloadQueue.find(x => x.id === id);
  if (queuedItem) {
    queuedItem.status = 'pending';
    queuedItem.retryAfter = 0; // Bypass delay
    processQueue();
    return res.json({ success: true, message: 'Download item resumed.' });
  }

  res.status(404).json({ error: 'Download item not found in queue.' });
});

// API: Cancel download
app.post('/api/queue/cancel', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing parameter: id' });

  if (queueState.currentActiveDownload && queueState.currentActiveDownload.id === id) {
    queueState.currentActiveDownload.status = 'cancelled';
    if (queueState.currentActiveDownload.abortController) {
      try {
        queueState.currentActiveDownload.abortController.abort();
      } catch (e) {
        logActivity('Error aborting active download: ' + e.message, 'ERROR');
      }
    }
    return res.json({ success: true, message: 'Active download cancellation triggered.' });
  }

  const index = queueState.downloadQueue.findIndex(x => x.id === id);
  if (index !== -1) {
    const removed = queueState.downloadQueue.splice(index, 1)[0];
    removed.status = 'cancelled';
    removed.completedAt = Date.now();
    queueState.downloadHistory.unshift(removed);

    // Clean up partial file in temp folder if any
    const settings = loadSettings();
    const tempDir = settings.tempPath || path.join(baseDir, 'temp');
    const safeName = removed.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const tempZipPath = path.join(tempDir, safeName);
    if (fs.existsSync(tempZipPath)) {
      try {
        fs.unlinkSync(tempZipPath);
      } catch (err) {
        logActivity('Error cleaning up temp file on cancel: ' + err.message, 'ERROR');
      }
    }

    return res.json({ success: true, message: 'Pending download cancelled.' });
  }

  res.status(404).json({ error: 'Download item not found in queue or active downloads.' });
});

// API: Clear completed/failed history
app.post('/api/queue/clear-history', (req, res) => {
  queueState.downloadHistory = [];
  res.json({ success: true, message: 'Download history cleared.' });
});

// API: Export download list
app.get('/api/queue/export', (req, res) => {
  const cleanQueue = queueState.downloadQueue.map(item => ({
    postId: item.postId,
    name: item.name,
    title: item.title,
    url: item.url,
    type: item.type,
    image: item.image,
    author: item.author,
    lang_group: item.lang_group
  }));
  const cleanHistory = queueState.downloadHistory.map(item => ({
    postId: item.postId,
    name: item.name,
    title: item.title,
    url: item.url,
    type: item.type,
    image: item.image,
    author: item.author,
    lang_group: item.lang_group,
    status: item.status,
    error: item.error,
    completedAt: item.completedAt
  }));
  res.json({ queue: cleanQueue, history: cleanHistory });
});

// API: Import download list
app.post('/api/queue/import', (req, res) => {
  const { queue } = req.body;
  if (!queue || !Array.isArray(queue)) {
    return res.status(400).json({ error: 'Invalid import format. Expected { queue: [...] }' });
  }

  let importedCount = 0;
  for (const item of queue) {
    if (!item.url || !item.name) continue;
    
    const isActive = queueState.currentActiveDownload && queueState.currentActiveDownload.postId === item.postId;
    const isQueued = queueState.downloadQueue.some(x => x.postId === item.postId);
    if (isActive || isQueued) continue;

    const newItem = {
      id: `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      postId: item.postId,
      name: item.name,
      title: item.title || item.name,
      url: item.url,
      type: item.type || 'camouflage',
      image: item.image,
      author: item.author,
      lang_group: item.lang_group,
      status: 'pending',
      progress: 0,
      retries: 0,
      maxRetries: 3,
      queuedAt: Date.now()
    };

    queueState.downloadQueue.push(newItem);
    importedCount++;
  }

  if (importedCount > 0) {
    processQueue();
  }

  res.json({ success: true, message: `Successfully imported ${importedCount} items to the download queue.` });
});

// API: Reorder queue item (Priority ordering)
app.post('/api/queue/reorder', (req, res) => {
  const { id, action } = req.body; // action: 'up' | 'down' | 'top'
  if (!id || !action) {
    return res.status(400).json({ error: 'Missing parameters: id, action' });
  }
  
  const index = queueState.downloadQueue.findIndex(x => x.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found in queue' });
  }
  
  const item = queueState.downloadQueue[index];
  if (item.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending items can be reordered' });
  }
  
  const pendingIndexes = queueState.downloadQueue
    .map((x, i) => x.status === 'pending' ? i : -1)
    .filter(i => i !== -1);
    
  const rank = pendingIndexes.indexOf(index);
  if (rank === -1) return res.status(500).json({ error: 'Internal queue ranking error' });
  
  if (action === 'up' && rank > 0) {
    const targetIdx = pendingIndexes[rank - 1];
    queueState.downloadQueue[index] = queueState.downloadQueue[targetIdx];
    queueState.downloadQueue[targetIdx] = item;
  } else if (action === 'down' && rank < pendingIndexes.length - 1) {
    const targetIdx = pendingIndexes[rank + 1];
    queueState.downloadQueue[index] = queueState.downloadQueue[targetIdx];
    queueState.downloadQueue[targetIdx] = item;
  } else if (action === 'top' && rank > 0) {
    queueState.downloadQueue.splice(index, 1);
    const firstPendingIdx = pendingIndexes[0];
    queueState.downloadQueue.splice(firstPendingIdx, 0, item);
  }
  
  res.json({ success: true, queue: queueState.downloadQueue });
});

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

  const names = name.split(',');
  let totalSaved = 0;

  for (const singleName of names) {
    let folderPath = '';
    let disabledFolderPath = '';
    if (type === 'camouflage') {
      if (!settings.wtPath) return res.status(400).json({ error: 'War Thunder path is not set.' });
      folderPath = path.join(settings.wtPath, 'UserSkins', singleName);
      disabledFolderPath = path.join(settings.wtPath, 'UserSkins_disabled', singleName);
    } else if (type === 'sight') {
      if (!settings.sightsPath) return res.status(400).json({ error: 'User Sights path is not set.' });
      folderPath = path.join(settings.sightsPath, singleName);
      if (!fs.existsSync(folderPath)) {
        const allTanksPath = path.join(settings.sightsPath, 'all_tanks', singleName);
        if (fs.existsSync(allTanksPath)) {
          folderPath = allTanksPath;
        }
      }
      disabledFolderPath = path.join(settings.sightsPath + '_disabled', singleName);
      if (!fs.existsSync(disabledFolderPath)) {
        const allTanksDisabledPath = path.join(settings.sightsPath + '_disabled', 'all_tanks', singleName);
        if (fs.existsSync(allTanksDisabledPath)) {
          disabledFolderPath = allTanksDisabledPath;
        }
      }
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    let targetPath = '';
    if (fs.existsSync(folderPath)) {
      targetPath = folderPath;
    } else if (fs.existsSync(disabledFolderPath)) {
      targetPath = disabledFolderPath;
    }

    if (targetPath) {
      if (fs.statSync(targetPath).isDirectory()) {
        totalSaved += cleanDirectory(targetPath);
      }
    }
  }

  res.json({
    success: true,
    spaceSaved: totalSaved,
    message: `Cleaned "${name}". Saved ${(totalSaved / 1024 / 1024).toFixed(1)} MB.`
  });
});

// API: List installed skins and sights
app.get('/api/installed', (req, res) => {
  const settings = loadSettings();
  const installedSkins = scanInstalledSkins(settings.wtPath);
  const installedSights = scanInstalledSights(settings.sightsPath);

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

  try {
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

    const names = name.split(',');
    let successCount = 0;
    let isNowDisabled = false;

    for (const singleName of names) {
      let activePath = path.join(activeBaseDir, singleName);
      let disabledPath = path.join(disabledBaseDir, singleName);

      if (type === 'sight') {
        const allTanksActive = path.join(activeBaseDir, 'all_tanks', singleName);
        const allTanksDisabled = path.join(disabledBaseDir, 'all_tanks', singleName);
        if (fs.existsSync(allTanksActive) || fs.existsSync(allTanksDisabled)) {
          activePath = allTanksActive;
          disabledPath = allTanksDisabled;
          if (!fs.existsSync(path.dirname(activePath))) {
            fs.mkdirSync(path.dirname(activePath), { recursive: true });
          }
          if (!fs.existsSync(path.dirname(disabledPath))) {
            fs.mkdirSync(path.dirname(disabledPath), { recursive: true });
          }
        }
      }

      const activeExists = fs.existsSync(activePath);
      const disabledExists = fs.existsSync(disabledPath);

      try {
        if (activeExists && !disabledExists) {
          fs.renameSync(activePath, disabledPath);
          if (activePath.endsWith('.blk')) {
            const activeMeta = activePath.replace(/\.blk$/i, '.wtlive.json');
            const disabledMeta = disabledPath.replace(/\.blk$/i, '.wtlive.json');
            if (fs.existsSync(activeMeta)) {
              fs.renameSync(activeMeta, disabledMeta);
            }
          }
          isNowDisabled = true;
          successCount++;
        } else if (disabledExists && !activeExists) {
          fs.renameSync(disabledPath, activePath);
          if (disabledPath.endsWith('.blk')) {
            const activeMeta = activePath.replace(/\.blk$/i, '.wtlive.json');
            const disabledMeta = disabledPath.replace(/\.blk$/i, '.wtlive.json');
            if (fs.existsSync(disabledMeta)) {
              fs.renameSync(disabledMeta, activeMeta);
            }
          }
          isNowDisabled = false;
          successCount++;
        }
      } catch (_) {}
    }

    if (successCount > 0) {
      return res.json({ success: true, disabled: isNowDisabled, message: `Toggled ${successCount} files successfully.` });
    } else {
      return res.status(404).json({ error: `Modification folders/files not found for ${name}` });
    }
  } catch (err) {
    logActivity('Error toggling modification state: ' + err.message, 'ERROR');
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

  const names = name.split(',');
  let deletedCount = 0;

  for (const singleName of names) {
    let folderPath = '';
    let disabledFolderPath = '';
    if (type === 'camouflage') {
      if (!settings.wtPath) return res.status(400).json({ error: 'War Thunder path is not set.' });
      folderPath = path.join(settings.wtPath, 'UserSkins', singleName);
      disabledFolderPath = path.join(settings.wtPath, 'UserSkins_disabled', singleName);
    } else if (type === 'sight') {
      if (!settings.sightsPath) return res.status(400).json({ error: 'User Sights path is not set.' });
      folderPath = path.join(settings.sightsPath, singleName);
      if (!fs.existsSync(folderPath)) {
        const allTanksPath = path.join(settings.sightsPath, 'all_tanks', singleName);
        if (fs.existsSync(allTanksPath)) {
          folderPath = allTanksPath;
        }
      }
      disabledFolderPath = path.join(settings.sightsPath + '_disabled', singleName);
      if (!fs.existsSync(disabledFolderPath)) {
        const allTanksDisabledPath = path.join(settings.sightsPath + '_disabled', 'all_tanks', singleName);
        if (fs.existsSync(allTanksDisabledPath)) {
          disabledFolderPath = allTanksDisabledPath;
        }
      }
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    let pathToTarget = '';
    if (fs.existsSync(folderPath)) {
      pathToTarget = folderPath;
    } else if (fs.existsSync(disabledFolderPath)) {
      pathToTarget = disabledFolderPath;
    }

    if (pathToTarget) {
      try {
        const stat = fs.statSync(pathToTarget);
        if (stat.isDirectory()) {
          fs.rmSync(pathToTarget, { recursive: true, force: true });
        } else {
          fs.unlinkSync(pathToTarget);
          if (pathToTarget.endsWith('.blk')) {
            const metaPath = pathToTarget.replace(/\.blk$/i, '.wtlive.json');
            if (fs.existsSync(metaPath)) {
              try { fs.unlinkSync(metaPath); } catch (_) {}
            }
          }
        }
        deletedCount++;
      } catch (err) {
        logActivity(`Error deleting ${singleName}: ` + err.message, 'ERROR');
      }
    }
  }

  if (deletedCount > 0) {
    res.json({ success: true, message: `Deleted ${deletedCount} files successfully.` });
  } else {
    res.status(404).json({ error: 'Folder or file not found' });
  }
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
                    author: metadata.author || null,
                    metaPath
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
    headers['Cookie'] = `token=${settings.cookie}`;
  }

  for (const mod of installedList) {
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const response = await fetch(`https://live.warthunder.com/post/${mod.postId}/`, { headers });
      if (!response.ok) {
        continue;
      }
      
      const html = await response.text();
      const match = html.match(/lang_group=(\d+)/);
      if (match) {
        const onlineLangGroup = parseInt(match[1], 10);
        const richMeta = await fetchPostMetadata(onlineLangGroup, settings.cookie);
        
        if (richMeta) {
          try {
            const currentMetadata = JSON.parse(fs.readFileSync(mod.metaPath, 'utf8'));
            const updatedMetadata = {
              ...currentMetadata,
              ...richMeta,
              lang_group: currentMetadata.lang_group,
              installedAt: currentMetadata.installedAt || Date.now()
            };
            fs.writeFileSync(mod.metaPath, JSON.stringify(updatedMetadata, null, 2), 'utf8');
            
            mod.title = updatedMetadata.title || mod.title;
            mod.image = updatedMetadata.image || mod.image;
            mod.author = updatedMetadata.author || mod.author;
          } catch (e) {
            logActivity(`Error updating local metadata file at ${mod.metaPath}: ` + e.message, 'ERROR');
          }
        }

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
      logActivity(`Error checking updates for ${mod.name}: ` + err.message, 'ERROR');
    }
  }

  res.json(results);
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
    logActivity('Error reading package.json version: ' + err.message, 'ERROR');
  }

  // Support for mock testing
  if (forceMock) {
    return res.json({
      currentVersion,
      latestVersion: '1.4.0',
      updateAvailable: true,
      releaseUrl: 'https://github.com/MigueXYZ/warthunderlivedownloadmanager/releases',
      releaseName: 'v1.4.0: Custom Collections & Favorites',
      releaseNotes: '### Added\n- Group installed mods into playlists and folders\n- Mark modifications as favorites for fast tracking\n\n### Fixed\n- Telemetry filter quirks'
    });
  }

  try {
    const response = await fetch('https://api.github.com/repos/MigueXYZ/warthunderlivedownloadmanager/releases/latest', {
      headers: {
        'User-Agent': 'warthunderlivedownloadmanager-updater'
      }
    });

    if (response.status === 404) {
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
    logActivity('Error checking software update: ' + err.message, 'ERROR');
    res.status(500).json({ error: 'Failed to check for updates: ' + err.message });
  }
});

// API: Perform software auto-update by downloading and launching setup.exe
app.post('/api/software/update', async (req, res) => {
  const { spawn } = require('child_process');
  const { Readable } = require('stream');
  const { finished } = require('stream/promises');

  try {
    const response = await fetch('https://api.github.com/repos/MigueXYZ/warthunderlivedownloadmanager/releases/latest', {
      headers: {
        'User-Agent': 'warthunderlivedownloadmanager-updater'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const data = await response.json();
    const assets = data.assets || [];
    
    // Find the installer asset (.exe or .msi)
    const installerAsset = assets.find(asset => 
      asset.name.endsWith('-setup.exe') || 
      asset.name.endsWith('.msi') || 
      asset.name.endsWith('.exe')
    );

    if (!installerAsset) {
      return res.status(404).json({ error: 'No installer executable asset found in the latest release.' });
    }

    logActivity(`Downloading update from: ${installerAsset.browser_download_url}`, 'INFO');
    
    const downloadRes = await fetch(installerAsset.browser_download_url);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download installer from GitHub, status: ${downloadRes.status}`);
    }

    const tempDir = path.join(process.env.TEMP || 'C:\\temp', 'wt-live-manager-updates');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, installerAsset.name);
    const fileStream = fs.createWriteStream(tempFilePath);
    
    // Pipe response body to file stream
    await finished(Readable.fromWeb(downloadRes.body).pipe(fileStream));
    
    logActivity(`Update installer downloaded to: ${tempFilePath}. Launching installer...`, 'INFO');

    // Run the installer as a detached child process
    const child = spawn(tempFilePath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    res.json({ success: true, message: 'Installer launched successfully. Application is shutting down to update.' });

    // Exit backend process so installer can replace files
    setTimeout(() => {
      process.exit(0);
    }, 1000);

  } catch (err) {
    logActivity('Error executing auto-update: ' + err.message, 'ERROR');
    res.status(500).json({ error: 'Auto-update failed: ' + err.message });
  }
});

// API: Favorites Endpoints
app.get('/api/favorites', (req, res) => {
  const settings = loadSettings();
  res.json({ favorites: settings.favorites || [] });
});

app.post('/api/favorites/toggle', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing mod id' });
  const settings = loadSettings();
  const idStr = String(id);
  
  if (!Array.isArray(settings.favorites)) {
    settings.favorites = [];
  }
  
  const index = settings.favorites.indexOf(idStr);
  let isFavorite = false;
  
  if (index > -1) {
    settings.favorites.splice(index, 1);
    isFavorite = false;
  } else {
    settings.favorites.push(idStr);
    isFavorite = true;
  }

  saveSettings(settings);
  res.json({ success: true, isFavorite, favorites: settings.favorites });
});

// API: Custom Collections Endpoints
app.get('/api/collections', (req, res) => {
  const settings = loadSettings();
  res.json({ collections: settings.collections || [] });
});

app.post('/api/collections', (req, res) => {
  const { id, name, description, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Collection name is required.' });
  
  const settings = loadSettings();
  if (!Array.isArray(settings.collections)) {
    settings.collections = [];
  }

  let collection = null;
  if (id) {
    collection = settings.collections.find(c => c.id === id);
    if (collection) {
      collection.name = name;
      collection.description = description || '';
      collection.type = type || collection.type || 'all';
    }
  }

  if (!collection) {
    collection = {
      id: 'col_' + Date.now(),
      name,
      description: description || '',
      type: type || 'all',
      items: [],
      createdAt: Date.now()
    };
    settings.collections.push(collection);
  }

  saveSettings(settings);
  res.json({ success: true, collection, collections: settings.collections });
});

app.delete('/api/collections/:id', (req, res) => {
  const { id } = req.params;
  const settings = loadSettings();
  if (!Array.isArray(settings.collections)) {
    settings.collections = [];
  }

  settings.collections = settings.collections.filter(c => c.id !== id);
  saveSettings(settings);
  res.json({ success: true, collections: settings.collections });
});

app.post('/api/collections/:id/items', (req, res) => {
  const { id } = req.params;
  const { action, itemName } = req.body; // action: 'add' | 'remove'
  if (!itemName) return res.status(400).json({ error: 'Item name is required.' });

  const settings = loadSettings();
  const collection = (settings.collections || []).find(c => c.id === id);
  if (!collection) return res.status(404).json({ error: 'Collection not found.' });

  if (!Array.isArray(collection.items)) {
    collection.items = [];
  }

  if (action === 'add') {
    if (!collection.items.includes(itemName)) {
      collection.items.push(itemName);
    }
  } else if (action === 'remove') {
    collection.items = collection.items.filter(item => item !== itemName);
  }

  saveSettings(settings);
  res.json({ success: true, collection });
});

app.post('/api/collections/:id/bulk-toggle', (req, res) => {
  const { id } = req.params;
  const { targetState } = req.body; // 'enable' | 'disable'
  const settings = loadSettings();
  const collection = (settings.collections || []).find(c => c.id === id);
  if (!collection) return res.status(404).json({ error: 'Collection not found.' });

  let toggledCount = 0;
  const items = collection.items || [];

  for (const item of items) {
    const activeSkins = path.join(settings.wtPath, 'UserSkins', item);
    const disabledSkins = path.join(settings.wtPath, 'UserSkins_disabled', item);
    const activeSights = path.join(settings.sightsPath, 'all_tanks', item);
    const disabledSights = path.join(settings.sightsPath + '_disabled', 'all_tanks', item);

    try {
      if (targetState === 'disable') {
        if (fs.existsSync(activeSkins)) {
          if (!fs.existsSync(path.dirname(disabledSkins))) fs.mkdirSync(path.dirname(disabledSkins), { recursive: true });
          fs.renameSync(activeSkins, disabledSkins);
          toggledCount++;
        } else if (fs.existsSync(activeSights)) {
          if (!fs.existsSync(path.dirname(disabledSights))) fs.mkdirSync(path.dirname(disabledSights), { recursive: true });
          fs.renameSync(activeSights, disabledSights);
          if (activeSights.endsWith('.blk')) {
            const activeMeta = activeSights.replace(/\.blk$/i, '.wtlive.json');
            const disabledMeta = disabledSights.replace(/\.blk$/i, '.wtlive.json');
            if (fs.existsSync(activeMeta)) fs.renameSync(activeMeta, disabledMeta);
          }
          toggledCount++;
        }
      } else if (targetState === 'enable') {
        if (fs.existsSync(disabledSkins)) {
          if (!fs.existsSync(path.dirname(activeSkins))) fs.mkdirSync(path.dirname(activeSkins), { recursive: true });
          fs.renameSync(disabledSkins, activeSkins);
          toggledCount++;
        } else if (fs.existsSync(disabledSights)) {
          if (!fs.existsSync(path.dirname(activeSights))) fs.mkdirSync(path.dirname(activeSights), { recursive: true });
          fs.renameSync(disabledSights, activeSights);
          if (disabledSights.endsWith('.blk')) {
            const activeMeta = activeSights.replace(/\.blk$/i, '.wtlive.json');
            const disabledMeta = disabledSights.replace(/\.blk$/i, '.wtlive.json');
            if (fs.existsSync(disabledMeta)) fs.renameSync(disabledMeta, activeMeta);
          }
          toggledCount++;
        }
      }
    } catch (_) {}
  }

  logActivity(`Bulk toggled collection "${collection.name}" (${targetState}): ${toggledCount} items affected`, 'INFO');
  res.json({ success: true, toggledCount, message: `Updated ${toggledCount} modifications in collection.` });
});

// API: Get recent activity logs
app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(logFilePath)) {
    return res.json({ logs: '[System] Log file does not exist yet. Perform some activity to generate logs.' });
  }

  try {
    const data = fs.readFileSync(logFilePath, 'utf8');
    const lines = data.split('\n');
    const lastLines = lines.slice(-300).join('\n');
    res.json({ logs: lastLines });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read logs: ' + err.message });
  }
});

// API: Clear logs
app.post('/api/logs/clear', (req, res) => {
  try {
    fs.writeFileSync(logFilePath, '', 'utf8');
    logActivity('Logs cleared by user.', 'INFO');
    res.json({ success: true, message: 'Log file cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear logs: ' + err.message });
  }
});

// API: Download log file
app.get('/api/logs/download', (req, res) => {
  if (!fs.existsSync(logFilePath)) {
    return res.status(404).send('Log file does not exist.');
  }
  res.download(logFilePath, 'wt-live-manager.log');
});

// API: Install a locally uploaded ZIP file
app.post('/api/library/install-local', async (req, res) => {
  const encodedFilename = req.headers['x-file-name'];
  const type = req.headers['x-mod-type'];

  if (!encodedFilename || !type) {
    return res.status(400).json({ error: 'Missing headers: X-File-Name or X-Mod-Type' });
  }

  const filename = decodeURIComponent(encodedFilename);
  const settings = loadSettings();

  if (type === 'camouflage' && (!settings.wtPath || !fs.existsSync(settings.wtPath))) {
    return res.status(400).json({ error: 'War Thunder game path is not set or invalid.' });
  }
  if (type === 'sight' && (!settings.sightsPath || !fs.existsSync(settings.sightsPath))) {
    return res.status(400).json({ error: 'User Sights path is not set or invalid.' });
  }

  const tempDir = settings.tempPath || path.join(baseDir, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const tempZipPath = path.join(tempDir, `local_${Date.now()}_${safeName}`);

  const fileStream = fs.createWriteStream(tempZipPath);

  try {
    await new Promise((resolve, reject) => {
      req.pipe(fileStream);
      req.on('end', resolve);
      req.on('error', reject);
      fileStream.on('error', reject);
    });

    logActivity(`Uploaded local ZIP file saved to ${tempZipPath}. Installing...`, 'INFO');
    
    // Extract and install ZIP
    const installedFolder = installLocalZip(tempZipPath, type, settings);
    
    res.json({
      success: true,
      message: `Successfully installed local modification.`,
      folder: installedFolder
    });
  } catch (err) {
    logActivity(`Failed to install local mod ZIP: ${err.message}`, 'ERROR');
    if (fs.existsSync(tempZipPath)) {
      try { fs.unlinkSync(tempZipPath); } catch (_) {}
    }
    res.status(500).json({ error: `Installation failed: ${err.message}` });
  }
});

// API: Fix sights structure by moving loose sight folders under all_tanks
app.post('/api/library/fix-sights', (req, res) => {
  const settings = loadSettings();
  if (!settings.sightsPath || !fs.existsSync(settings.sightsPath)) {
    return res.status(400).json({ error: 'User Sights path is not set or invalid.' });
  }

  let movedCount = 0;

  const fixDir = (baseDir) => {
    if (!fs.existsSync(baseDir)) return;
    const allTanksDir = path.join(baseDir, 'all_tanks');
    if (!fs.existsSync(allTanksDir)) {
      fs.mkdirSync(allTanksDir, { recursive: true });
    }

    try {
      const files = fs.readdirSync(baseDir);
      for (const file of files) {
        const fullPath = path.join(baseDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const lowerName = file.toLowerCase();
          if (lowerName === 'all_tanks' || lowerName.endsWith('_disabled') || file.startsWith('.')) {
            continue;
          }

          const destPath = path.join(allTanksDir, file);
          if (!fs.existsSync(destPath)) {
            fs.renameSync(fullPath, destPath);
            movedCount++;
          }
        }
      }
    } catch (err) {
      logActivity(`Error during fixDir for sights: ${err.message}`, 'ERROR');
    }
  };

  const flattenNestedAllTanks = (baseDir) => {
    if (!fs.existsSync(baseDir)) return;
    try {
      const folders = fs.readdirSync(baseDir);
      for (const folder of folders) {
        const folderPath = path.join(baseDir, folder);
        if (fs.statSync(folderPath).isDirectory()) {
          const lowerName = folder.toLowerCase();
          if (lowerName === 'all_tanks' || lowerName.endsWith('_disabled') || folder.startsWith('.')) {
            continue;
          }

          // First, check if there is a subfolder 'all_tanks' inside this directory and flatten it
          const nestedAllTanks = path.join(folderPath, 'all_tanks');
          if (fs.existsSync(nestedAllTanks) && fs.statSync(nestedAllTanks).isDirectory()) {
            const nestedFiles = fs.readdirSync(nestedAllTanks);
            for (const file of nestedFiles) {
              const src = path.join(nestedAllTanks, file);
              const dest = path.join(folderPath, file);
              if (!fs.existsSync(dest)) {
                fs.renameSync(src, dest);
              }
            }
            try {
              fs.rmdirSync(nestedAllTanks);
            } catch (_) {}
          }

          // Second, move all .blk files from this folder directly up into baseDir (all_tanks)
          const subfiles = fs.readdirSync(folderPath);
          let blkMoved = false;
          for (const file of subfiles) {
            if (file.toLowerCase().endsWith('.blk')) {
              const src = path.join(folderPath, file);
              const dest = path.join(baseDir, file);
              if (!fs.existsSync(dest)) {
                fs.renameSync(src, dest);
                movedCount++;
                blkMoved = true;

                // Also rename metadata .wtlive.json next to it if it exists or folder's metadata
                const folderMeta = path.join(folderPath, '.wtlive.json');
                const destMeta = dest.replace(/\.blk$/i, '.wtlive.json');
                if (fs.existsSync(folderMeta)) {
                  fs.renameSync(folderMeta, destMeta);
                }
              }
            }
          }

          // If we moved files or if the folder is empty/only has wtlive config, try to delete it
          try {
            const remaining = fs.readdirSync(folderPath);
            if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === '.wtlive.json')) {
              if (remaining[0] === '.wtlive.json') {
                fs.unlinkSync(path.join(folderPath, '.wtlive.json'));
              }
              fs.rmdirSync(folderPath);
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      logActivity(`Error flattening nested all_tanks: ${err.message}`, 'ERROR');
    }
  };

  // Fix active sights
  fixDir(settings.sightsPath);
  flattenNestedAllTanks(path.join(settings.sightsPath, 'all_tanks'));
  
  // Fix disabled sights
  const disabledDir = settings.sightsPath + '_disabled';
  if (fs.existsSync(disabledDir)) {
    fixDir(disabledDir);
    flattenNestedAllTanks(path.join(disabledDir, 'all_tanks'));
  }

  logActivity(`Sights folder structure fixed. Moved/flattened ${movedCount} folders.`, 'INFO');
  res.json({ success: true, movedCount });
});

// Start Server
app.listen(PORT, () => {
  logActivity(`Server running at http://localhost:${PORT}`, 'INFO');
});
