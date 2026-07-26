const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { logActivity } = require('./logger');
const { loadSettings } = require('./settings');

const queueState = {
  downloadQueue: [],
  downloadHistory: [],
  currentActiveDownload: null,
  isProcessingQueue: false
};

// Calculate SHA-256 hash of a file
function calculateSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

// Download file from URL to local temp path
async function downloadFile(url, destPath, cookie) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
  if (cookie) {
    headers['Cookie'] = `token=${cookie}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download file: status ${res.status}`);
  }

  const fileStream = fs.createWriteStream(destPath);
  const reader = res.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
  }

  fileStream.end();
}

// Download file with signal support, rate limiting, and progress
async function downloadFileWithSignal(url, destPath, cookie, signal, onProgress) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Encoding': 'identity'
  };
  if (cookie) {
    headers['Cookie'] = `token=${cookie}`;
  }

  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    throw new Error(`Failed to download file: status ${response.status}`);
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  const fileStream = fs.createWriteStream(destPath);
  const reader = response.body.getReader();

  let downloadedBytes = 0;
  let startTime = Date.now();
  let lastProgressTime = Date.now();
  let bytesSinceLastCheck = 0;
  let currentSpeed = 0;

  while (true) {
    if (signal && signal.aborted) {
      fileStream.destroy();
      throw new Error('Download aborted by signal.');
    }

    const settings = loadSettings();
    const limitPerDl = (settings.limitPerDownload || 0) * 1024; // KB to Bytes
    const limitGlob = (settings.limitGlobal || 0) * 1024; // KB to Bytes

    // We take the lower of the active limits
    let maxSpeed = 0;
    if (limitPerDl > 0 && limitGlob > 0) {
      maxSpeed = Math.min(limitPerDl, limitGlob);
    } else if (limitPerDl > 0) {
      maxSpeed = limitPerDl;
    } else if (limitGlob > 0) {
      maxSpeed = limitGlob;
    }

    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    downloadedBytes += chunk.length;
    bytesSinceLastCheck += chunk.length;
    fileStream.write(chunk);

    const now = Date.now();
    const elapsed = now - lastProgressTime;

    // Rate limiter delay logic
    if (maxSpeed > 0 && elapsed > 50) {
      const expectedTime = (bytesSinceLastCheck / maxSpeed) * 1000;
      const delay = expectedTime - elapsed;
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (now - lastProgressTime >= 300 || done) {
      const timeDiff = (Date.now() - lastProgressTime) / 1000;
      currentSpeed = bytesSinceLastCheck / (timeDiff || 1);
      bytesSinceLastCheck = 0;
      lastProgressTime = Date.now();

      const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      const eta = currentSpeed > 0 ? Math.round((totalBytes - downloadedBytes) / currentSpeed) : 0;

      if (onProgress) {
        onProgress(pct, downloadedBytes, totalBytes, currentSpeed, eta);
      }
    }
  }

  fileStream.end();
}

// Queue processor
async function processQueue() {
  if (queueState.isProcessingQueue) return;
  queueState.isProcessingQueue = true;

  while (true) {
    const pendingItems = queueState.downloadQueue.filter(x => x.status === 'pending');
    if (pendingItems.length === 0) break;

    // Sort: items that failed but are retrying wait until their retryAfter time has passed
    const now = Date.now();
    const readyIndex = pendingItems.findIndex(x => !x.retryAfter || x.retryAfter <= now);

    if (readyIndex === -1) {
      // All items are waiting for backoff, sleep/timer check
      const waitingItems = pendingItems.filter(x => x.retryAfter && x.retryAfter > now);
      if (waitingItems.length > 0) {
        const nextRetryTime = Math.min(...waitingItems.map(x => x.retryAfter));
        const delay = nextRetryTime - now;
        setTimeout(() => {
          processQueue();
        }, delay);
      }
      break;
    }

    const item = pendingItems[readyIndex];
    const itemIndex = queueState.downloadQueue.findIndex(x => x.id === item.id);
    queueState.currentActiveDownload = item;
    
    item.status = 'downloading';
    item.progress = item.progress || 0;
    
    const settings = loadSettings();
    const tempDir = settings.tempPath || path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const safeName = item.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const tempZipPath = path.join(tempDir, safeName);
    
    item.abortController = new AbortController();
    let createdExtractionFolder = null;

    try {
      if (item.type === 'camouflage' && (!settings.wtPath || !fs.existsSync(settings.wtPath))) {
        throw new Error('War Thunder game folder path is not set or invalid.');
      }
      if (item.type === 'sight' && (!settings.sightsPath || !fs.existsSync(settings.sightsPath))) {
        throw new Error('User Sights path is not set or invalid.');
      }

      logActivity(`[Queue] Starting download for: ${item.title}`, 'INFO');
      
      await downloadFileWithSignal(
        item.url, 
        tempZipPath, 
        settings.cookie, 
        item.abortController.signal, 
        (pct, downloaded, total, speed, eta) => {
          item.progress = pct;
          item.downloadedBytes = downloaded;
          item.totalBytes = total;
          item.speed = speed;
          item.eta = eta;
        }
      );

      if (item.status === 'cancelled') {
        throw new Error('Download cancelled by user.');
      }

      // Check integrity if enabled
      if (settings.verifyIntegrity !== false) {
        logActivity(`[Queue] Verifying file integrity for: ${item.title}`, 'INFO');
        try {
          const hash = await calculateSHA256(tempZipPath);
          logActivity(`[Queue] SHA-256 Checksum: ${hash} (${item.title})`, 'INFO');
          
          // Verify zip header integrity
          const testZip = new AdmZip(tempZipPath);
          const entries = testZip.getEntries();
          if (!entries || entries.length === 0) {
            throw new Error('ZIP file directory structure is empty or corrupt.');
          }
        } catch (verifErr) {
          throw new Error(`File integrity check failed: ${verifErr.message}`);
        }
      }

      item.status = 'extracting';
      item.progress = 100;
      logActivity(`[Queue] Extracting zip for: ${item.title}`, 'INFO');

      // Increment download counter on WT Live
      if (item.lang_group) {
        try {
          const downloadHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          };
          if (settings.cookie) {
            downloadHeaders['Cookie'] = `token=${settings.cookie}`;
          }
          await fetch('https://live.warthunder.com/api/post/downloaded/', {
            method: 'POST',
            headers: downloadHeaders,
            body: `lang_group=${item.lang_group}`
          });
        } catch (_) {}
      }

      // Extract ZIP
      const targetBaseDir = item.type === 'sight' 
        ? path.join(settings.sightsPath, 'all_tanks') 
        : path.join(settings.wtPath, 'UserSkins');

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

      if (zipHasWTFolderRoot) {
        const rootFolder = Array.from(rootFolders)[0];
        const lowerRoot = rootFolder.toLowerCase();
        
        let prefix = rootFolder + '/';
        if (lowerRoot === 'userskins') {
          extractionPath = path.join(settings.wtPath, 'UserSkins');
        } else if (lowerRoot === 'usersights') {
          extractionPath = path.dirname(settings.sightsPath);
          const hasAllTanks = entries.some(e => e.entryName.toLowerCase().startsWith('usersights/all_tanks/'));
          if (hasAllTanks) {
            prefix = rootFolder + '/all_tanks/';
          }
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
          fs.unlinkSync(tempZipPath);
        }

        if (createdFolder && zipHasWTFolderRoot && subFolders.size === 1) {
          zip.extractAllTo(extractionPath, true);
          fs.unlinkSync(tempZipPath);
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
        fs.unlinkSync(tempZipPath);
      }

      const metadataFolder = path.join(targetBaseDir, createdFolder);

      // Clean up double-nested all_tanks subfolder if it exists
      if (item.type === 'sight' && fs.existsSync(metadataFolder) && fs.statSync(metadataFolder).isDirectory()) {
        const nestedAllTanks = path.join(metadataFolder, 'all_tanks');
        if (fs.existsSync(nestedAllTanks) && fs.statSync(nestedAllTanks).isDirectory()) {
          try {
            const files = fs.readdirSync(nestedAllTanks);
            for (const file of files) {
              const src = path.join(nestedAllTanks, file);
              const dest = path.join(metadataFolder, file);
              if (!fs.existsSync(dest)) {
                fs.renameSync(src, dest);
              }
            }
            fs.rmdirSync(nestedAllTanks);
            logActivity(`Automatically flattened nested all_tanks folder structure in ${createdFolder}`, 'INFO');
          } catch (e) {
            logActivity(`Failed to flatten nested all_tanks folder: ${e.message}`, 'ERROR');
          }
        }
      }

      createdExtractionFolder = metadataFolder;
      if (fs.existsSync(metadataFolder)) {
        await writeQueueMetadata(metadataFolder, item);
      }

      item.status = 'completed';
      item.progress = 100;
      item.completedAt = Date.now();        
      logActivity(`[Queue] Completed installation for: ${item.title}`, 'INFO');

    } catch (err) {
      const isRetryable = item.status !== 'cancelled' && item.status !== 'paused';
      
      if (isRetryable && (item.retries || 0) < (item.maxRetries || 3)) {
        item.retries = (item.retries || 0) + 1;
        const backoffDelay = Math.pow(2, item.retries) * 1000;
        item.retryAfter = Date.now() + backoffDelay;
        item.status = 'pending';
        logActivity(`[Queue] Download failed for "${item.title}". Retrying in ${backoffDelay}ms (Attempt ${item.retries}/${item.maxRetries}). Error: ${err.message}`, 'WARN');
      } else {
        if (fs.existsSync(tempZipPath)) {
          if (item.status !== 'paused') {
            try { fs.unlinkSync(tempZipPath); } catch (_) {}
          }
        }

        if (createdExtractionFolder && fs.existsSync(createdExtractionFolder)) {
          if (item.status !== 'paused') {
            try {
              fs.rmSync(createdExtractionFolder, { recursive: true, force: true });
              logActivity(`[Queue] Cleaned up partial folder on failure/cancel: ${createdExtractionFolder}`, 'INFO');
            } catch (cleanupErr) {
              logActivity(`[Queue] Failed to clean up folder ${createdExtractionFolder}: ${cleanupErr.message}`, 'ERROR');
            }
          }
        }

        if (item.status === 'cancelled') {
          logActivity(`[Queue] Cancelled: ${item.title}`, 'INFO');
        } else if (item.status === 'paused') {
          logActivity(`[Queue] Paused: ${item.title}`, 'INFO');
        } else {
          item.status = 'failed';
          item.error = err.message;
          logActivity(`[Queue] Failed installation for: ${item.title} after maximum retries. Error: ${err.message}`, 'ERROR');
        } 
      }
      item.completedAt = Date.now();
    } finally {
      delete item.abortController;
      
      const isRetrying = item.status === 'pending';
      const isPaused = item.status === 'paused';
      
      if (!isRetrying && !isPaused) {
        const idx = queueState.downloadQueue.findIndex(x => x.id === item.id);
        if (idx !== -1) {
          queueState.downloadQueue.splice(idx, 1);
        }
        queueState.downloadHistory.unshift(item);
        if (queueState.downloadHistory.length > 50) {
          queueState.downloadHistory.pop();
        }
      }
      
      queueState.currentActiveDownload = null;
    }
  }

  queueState.isProcessingQueue = false;
}

// Write .wtlive.json metadata file inside custom folders
async function writeQueueMetadata(folder, item) {
  const metaPath = path.join(folder, '.wtlive.json');
  const metadata = {
    postId: item.postId,
    name: item.name,
    title: item.title,
    url: item.url,
    type: item.type,
    image: item.image,
    author: item.author,
    lang_group: item.lang_group,
    downloadedAt: Date.now()
  };
  try {
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (err) {
    logActivity(`Failed to write wtlive metadata at ${metaPath}: ${err.message}`, 'ERROR');
  }
}

module.exports = {
  queueState,
  calculateSHA256,
  downloadFile,
  downloadFileWithSignal,
  processQueue,
  writeQueueMetadata
};
