// App State
const state = {
  activeTab: 'browse',
  contentType: 'camouflage', // 'camouflage' or 'sight'
  searchString: '',
  vehicle: '', // Selected vehicle for filtering (using official vehicle ID)
  country: 'all',
  vehicleType: 'all',
  sort: 'downloads',
  page: 0,
  installedList: { skins: [], sights: [] },
  queueList: { active: null, queue: [], history: [] },
  updatesList: [],
  wtPathValid: false,
  sightsPathValid: false,
  telemetryActive: false,
  activeVehicle: '',
  hideUniversal: false, // Hide universal skins if searching a specific vehicle
  currentFeedList: []
};

// DOM Elements
const elements = {
  wtPathInput: document.getElementById('wt-path-input'),
  sightsPathInput: document.getElementById('sights-path-input'),
  cookieInput: document.getElementById('cookie-input'),
  blacklistInput: document.getElementById('blacklist-input'),
  whitelistInput: document.getElementById('whitelist-input'),
  limitDownloadInput: document.getElementById('limit-download-input'),
  limitGlobalInput: document.getElementById('limit-global-input'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  pathStatusMsg: document.getElementById('path-status-msg'),
  sightsStatusMsg: document.getElementById('sights-status-msg'),
  cookieStatusMsg: document.getElementById('cookie-status-msg'),
  
  searchInput: document.getElementById('search-input'),
  btnSearch: document.getElementById('btn-search'),
  contentToggleButtons: document.querySelectorAll('#content-toggle .toggle-btn'),
  countrySelect: document.getElementById('country-select'),
  vehicleTypeSelect: document.getElementById('vehicle-type-select'),
  countryFilterGroup: document.getElementById('country-filter-group'),
  vehicleTypeFilterGroup: document.getElementById('vehicle-type-filter-group'),
  sortSelect: document.getElementById('sort-select'),
  hideUniversalCheckbox: document.getElementById('hide-universal-checkbox'),
  universalFilterGroup: document.getElementById('universal-filter-group'),
  resultsGrid: document.getElementById('results-grid'),
  
  paginationPanel: document.getElementById('pagination-panel'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageIndicator: document.getElementById('page-indicator'),
  
  tabBrowse: document.getElementById('tab-browse'),
  tabLibrary: document.getElementById('tab-library'),
  tabQueue: document.getElementById('tab-queue'),
  btnTabBrowse: document.getElementById('btn-tab-browse'),
  btnTabLibrary: document.getElementById('btn-tab-library'),
  btnTabQueue: document.getElementById('btn-tab-queue'),
  
  countSkins: document.getElementById('count-skins'),
  countSights: document.getElementById('count-sights'),
  countQueue: document.getElementById('count-queue'),
  skinsList: document.getElementById('skins-list'),
  sightsList: document.getElementById('sights-list'),
  librarySearchInput: document.getElementById('library-search-input'),
  
  activeDownloadContainer: document.getElementById('active-download-container'),
  pendingQueueContainer: document.getElementById('pending-queue-container'),
  historyQueueContainer: document.getElementById('history-queue-container'),
  
  telemetryPanel: document.getElementById('telemetry-panel'),
  telemetryPulse: document.getElementById('telemetry-pulse'),
  telemetryStatus: document.getElementById('telemetry-status'),
  telemetryContent: document.getElementById('telemetry-content'),
  activeVehicleName: document.getElementById('active-vehicle-name'),
  btnAutoSearch: document.getElementById('btn-auto-search'),
  telemetrySkinsAlert: document.getElementById('telemetry-skins-alert'),
  telemetrySkinsAlertText: document.getElementById('telemetry-skins-alert-text'),
  linkViewMatchingSkins: document.getElementById('link-view-matching-skins'),
  
  installOverlay: document.getElementById('install-overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  
  lightboxOverlay: document.getElementById('lightbox-overlay'),
  lightboxImg: document.getElementById('lightbox-img'),
  
  toastContainer: document.getElementById('toast-container'),

  appUpdateCard: document.getElementById('app-update-card'),
  appNewVersion: document.getElementById('app-new-version'),
  appUpdateLink: document.getElementById('app-update-link'),
  appVersionLabel: document.getElementById('app-version-label'),
  cookieOverlay: document.getElementById('cookie-overlay')
};

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadLibrary();
  updateFilterVisibility();
  fetchFeed();
  checkSoftwareUpdate();
  
  // Start telemetry polling
  pollTelemetry();
  setInterval(pollTelemetry, 2000);

  // Start download queue polling
  pollQueue();
  setInterval(pollQueue, 1500);
  
  // Set up event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Save Settings
  elements.btnSaveSettings.addEventListener('click', saveSettings);
  
  // Search
  elements.btnSearch.addEventListener('click', () => {
    state.searchString = elements.searchInput.value.trim();
    state.vehicle = ''; // Reset vehicle ID filter on manual search
    state.page = 0;
    fetchFeed();
  });
  
  elements.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.searchString = elements.searchInput.value.trim();
      state.vehicle = ''; // Reset vehicle ID filter on manual search
      state.page = 0;
      fetchFeed();
    }
  });
  
  // Toggle Content Type (Skins vs Sights)
  elements.contentToggleButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      elements.contentToggleButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.contentType = e.target.getAttribute('data-value');
      state.page = 0;
      updateFilterVisibility();
      fetchFeed();
    });
  });

  // Country Selection
  elements.countrySelect.addEventListener('change', (e) => {
    state.country = e.target.value;
    state.page = 0;
    fetchFeed();
  });

  // Vehicle Type Selection
  elements.vehicleTypeSelect.addEventListener('change', (e) => {
    state.vehicleType = e.target.value;
    state.page = 0;
    fetchFeed();
  });
  
  // Sort Selection
  elements.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 0;
    fetchFeed();
  });
  
  // Hide Universal Selection
  elements.hideUniversalCheckbox.addEventListener('change', (e) => {
    state.hideUniversal = e.target.checked;
    fetchFeed();
  });
  
  // Pagination
  elements.btnPrevPage.addEventListener('click', () => {
    if (state.page > 0) {
      state.page--;
      fetchFeed();
    }
  });
  
  elements.btnNextPage.addEventListener('click', () => {
    state.page++;
    fetchFeed();
  });

  // Telemetry auto-search
  elements.btnAutoSearch.addEventListener('click', () => {
    if (state.activeVehicle) {
      // Use the cleaned active vehicle ID directly for WT Live's vehicle filter
      state.vehicle = state.activeVehicle;
      state.searchString = ''; // Clear hashtag search when vehicle parameter is active
      elements.searchInput.value = formatVehicleDisplayName(state.activeVehicle);
      
      // Reset filters so that we search globally for the active vehicle
      elements.countrySelect.value = 'all';
      elements.vehicleTypeSelect.value = 'all';
      state.country = 'all';
      state.vehicleType = 'all';
      
      state.page = 0;
      switchTab('browse');
      fetchFeed();
    }
  });

  // Lightbox zoom on mousewheel
  elements.lightboxImg.addEventListener('wheel', (e) => {
    if (!state.lightbox) return;
    e.preventDefault();
    const amount = e.deltaY < 0 ? 0.15 : -0.15;
    state.lightbox.scale = Math.max(0.5, Math.min(4, state.lightbox.scale + amount));
    updateLightboxTransform();
  }, { passive: false });

  // Lightbox drag and pan
  elements.lightboxImg.addEventListener('mousedown', (e) => {
    if (!state.lightbox || state.lightbox.scale <= 1) return;
    state.lightbox.isDragging = true;
    elements.lightboxImg.style.cursor = 'grabbing';
    state.lightbox.startX = e.clientX - state.lightbox.translateX;
    state.lightbox.startY = e.clientY - state.lightbox.translateY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.lightbox || !state.lightbox.isDragging) return;
    state.lightbox.translateX = e.clientX - state.lightbox.startX;
    state.lightbox.translateY = e.clientY - state.lightbox.startY;
    updateLightboxTransform();
  });

  window.addEventListener('mouseup', () => {
    if (state.lightbox && state.lightbox.isDragging) {
      state.lightbox.isDragging = false;
      elements.lightboxImg.style.cursor = 'grab';
    }
  });

  elements.linkViewMatchingSkins.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.activeVehicle) {
      switchTab('library');
      // Set the search input value to match the display name of the vehicle
      elements.librarySearchInput.value = formatVehicleDisplayName(state.activeVehicle);
      filterLibrary();
    }
  });

  // Check for software updates on version label click (Shift-Click to force debug)
  if (elements.appVersionLabel) {
    elements.appVersionLabel.addEventListener('click', (e) => {
      const forceMock = e.shiftKey;
      showToast(forceMock ? 'Checking for software updates (Debug)...' : 'Checking for software updates...', 'info');
      checkSoftwareUpdate(forceMock, true);
    });
  }
}

// Format WT Internal CDK vehicle names to a clean hashtag for WT Live search
function formatVehicleForSearch(vehicleName) {
  let cleaned = vehicleName.toLowerCase();
  
  // 1. Remove country prefixes
  cleaned = cleaned.replace(/^(us|usa|germ|germany|ussr|su|uk|britain|jp|japan|it|italy|fr|france|cn|china|swe|sweden|il|israel)_/, '');
  
  // 2. Remove common country suffixes
  cleaned = cleaned.replace(/_(germany|usa|ussr|uk|japan|italy|france|china|sweden|israel)$/g, '');
  
  // 3. Remove common minor suffixes
  cleaned = cleaned.replace(/_(shop|default|late|early|1944|1943|1942|1941|1945)$/g, '');
  
  // 4. Remove block versions or minor suffixes (like block_50, block_15, a_e, etc. if they are part of a long name)
  cleaned = cleaned.replace(/_block_\d+/g, '');

  // 5. Generate hashtag by removing all underscores and prefixing with #
  const hashtag = '#' + cleaned.replace(/_/g, '');
  
  return hashtag;
}

// Switch Tab
function switchTab(tab) {
  state.activeTab = tab;
  
  // Hide all tab sections
  elements.tabBrowse.classList.remove('active');
  elements.tabLibrary.classList.remove('active');
  elements.tabQueue.classList.remove('active');
  
  // Deactivate all navigation items
  elements.btnTabBrowse.classList.remove('active');
  elements.btnTabLibrary.classList.remove('active');
  elements.btnTabQueue.classList.remove('active');
  
  // Activate selected tab
  if (tab === 'browse') {
    elements.tabBrowse.classList.add('active');
    elements.btnTabBrowse.classList.add('active');
  } else if (tab === 'library') {
    elements.tabLibrary.classList.add('active');
    elements.btnTabLibrary.classList.add('active');
    loadLibrary(); // Reload installed list
  } else if (tab === 'queue') {
    elements.tabQueue.classList.add('active');
    elements.btnTabQueue.classList.add('active');
    pollQueue(); // Poll immediately when switching to queue
  }
}

// Check for software updates
async function checkSoftwareUpdate(forceMock = false, isManual = false) {
  try {
    const url = forceMock ? '/api/software/check-update?force=true' : '/api/software/check-update';
    const res = await fetch(url);
    if (!res.ok) {
      if (isManual) {
        showToast('Failed to check for software updates.', 'error');
      }
      return;
    }
    const data = await res.json();
    
    // Update current version label
    if (elements.appVersionLabel) {
      elements.appVersionLabel.textContent = `v${data.currentVersion}`;
    }
    
    if (data.updateAvailable) {
      if (elements.appNewVersion) {
        elements.appNewVersion.textContent = data.latestVersion;
      }
      if (elements.appUpdateLink) {
        elements.appUpdateLink.href = data.releaseUrl;
        elements.appUpdateLink.title = data.releaseName || `Version ${data.latestVersion}`;
      }
      if (elements.appUpdateCard) {
        elements.appUpdateCard.classList.remove('hidden');
      }
      showToast(`A new software version (v${data.latestVersion}) is available!`, 'warning');
    } else {
      if (elements.appUpdateCard && !forceMock) {
        elements.appUpdateCard.classList.add('hidden');
      }
      if (isManual) {
        showToast(`WT Live Manager is up to date (v${data.currentVersion}).`, 'success');
      }
    }
  } catch (e) {
    console.error('Failed to check for software updates:', e);
    if (isManual) {
      showToast('Error checking for software updates.', 'error');
    }
  }
}

// API: Load Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    
    if (data.wtPath) {
      elements.wtPathInput.value = data.wtPath;
      updatePathStatus('wt', true, 'Game folder verified.');
    } else if (data.detectedWT) {
      elements.wtPathInput.value = data.detectedWT;
      updatePathStatus('wt', false, 'Suggested folder (not saved).');
    } else {
      updatePathStatus('wt', false, 'Set War Thunder game folder.');
    }

    if (data.sightsPath) {
      elements.sightsPathInput.value = data.sightsPath;
      updatePathStatus('sights', true, 'Sights folder verified.');
    } else if (data.detectedSights) {
      elements.sightsPathInput.value = data.detectedSights;
      updatePathStatus('sights', false, 'Auto-detected saves folder.');
    } else {
      updatePathStatus('sights', false, 'Set custom sights folder.');
    }

    if (data.cookie) {
      elements.cookieInput.value = data.cookie;
      if (data.cookieValid === true) {
        elements.cookieStatusMsg.textContent = `✓ Active (${data.cookieUsername})`;
        elements.cookieStatusMsg.className = 'path-status valid';
        elements.cookieStatusMsg.style.color = 'var(--color-success)';
      } else if (data.cookieValid === false) {
        elements.cookieStatusMsg.textContent = `✗ Expired/Invalid Session Cookie`;
        elements.cookieStatusMsg.className = 'path-status invalid';
        elements.cookieStatusMsg.style.color = 'var(--color-error)';
        showToast('Your Gaijin session cookie has expired or is invalid. Restricted content might be hidden.', 'warning');
      } else {
        elements.cookieStatusMsg.textContent = `❓ Verify session status`;
        elements.cookieStatusMsg.className = 'path-status info';
        elements.cookieStatusMsg.style.color = 'var(--accent-secondary)';
      }
    } else {
      elements.cookieInput.value = '';
      elements.cookieStatusMsg.textContent = `❓ How to get`;
      elements.cookieStatusMsg.className = 'path-status info';
      elements.cookieStatusMsg.style.color = 'var(--accent-secondary)';
    }
    if (data.blacklistTags) {
      elements.blacklistInput.value = data.blacklistTags;
    } else {
      elements.blacklistInput.value = '';
    }
    if (data.whitelistTags) {
      elements.whitelistInput.value = data.whitelistTags;
    } else {
      elements.whitelistInput.value = '';
    }
    if (data.limitPerDownload) {
      elements.limitDownloadInput.value = data.limitPerDownload;
    } else {
      elements.limitDownloadInput.value = '';
    }
    if (data.limitGlobal) {
      elements.limitGlobalInput.value = data.limitGlobal;
    } else {
      elements.limitGlobalInput.value = '';
    }
  } catch (e) {
    showToast('Failed to load settings from server', 'error');
  }
}

// API: Save Settings
async function saveSettings() {
  const wtPath = elements.wtPathInput.value.trim();
  const sightsPath = elements.sightsPathInput.value.trim();
  const cookie = elements.cookieInput.value.trim();
  const blacklistTags = elements.blacklistInput.value.trim();
  const whitelistTags = elements.whitelistInput.value.trim();
  const limitPerDownload = parseInt(elements.limitDownloadInput.value, 10) || 0;
  const limitGlobal = parseInt(elements.limitGlobalInput.value, 10) || 0;
  
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wtPath, sightsPath, cookie, blacklistTags, whitelistTags, limitPerDownload, limitGlobal })
    });
    
    const data = await res.json();
    if (data.success) {
      if (data.settings.wtPath) {
        updatePathStatus('wt', true, 'Game folder saved.');
      } else {
        updatePathStatus('wt', false, 'Set War Thunder folder.');
      }

      if (data.settings.sightsPath) {
        updatePathStatus('sights', true, 'Sights folder saved.');
      } else {
        updatePathStatus('sights', false, 'Set custom sights folder.');
      }

      showToast('Settings saved successfully!', 'success');
      await loadSettings(); // Refresh cookie validation status & profile fields
      loadLibrary();
      fetchFeed(); // Re-fetch feed in case cookie or filters change content visibility
    } else {
      showToast(data.error || 'Failed to save settings.', 'error');
    }
  } catch (e) {
    showToast('Server connection failed.', 'error');
  }
}

function updatePathStatus(type, isValid, msg) {
  if (type === 'wt') {
    state.wtPathValid = isValid;
    elements.pathStatusMsg.innerText = msg;
    elements.pathStatusMsg.className = 'path-status ' + (isValid ? 'valid' : 'invalid');
  } else if (type === 'sights') {
    state.sightsPathValid = isValid;
    elements.sightsStatusMsg.innerText = msg;
    elements.sightsStatusMsg.className = 'path-status ' + (isValid ? 'valid' : 'invalid');
  }
}

// Helper: Strip HTML tags and return plain text
function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

// API: Fetch WT Live Feed
async function fetchFeed() {
  elements.resultsGrid.innerHTML = `
    <div class="overlay-card" style="grid-column: 1 / -1; margin: 40px auto; background: transparent; border: none; box-shadow: none;">
      <div class="spinner"></div>
      <h3>Fetching modifications...</h3>
    </div>
  `;
  
  const apiQuery = getQueryStringForAPI();
  
  try {
    const res = await fetch('/api/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: state.contentType,
        sort: state.sort,
        page: state.page,
        searchString: apiQuery,
        vehicle: state.vehicle
      })
    });
    
    const data = await res.json();
    
    if (data.status === 'OK' && data.data && data.data.list) {
      // Filter list based on country, vehicle type, and universal checkbox (only for camouflage/skins)
      const filteredList = data.data.list.filter(item => {
        if (state.contentType !== 'camouflage') return true;
        
        // Hide Universal filter (if checked, hide skins that match universal patterns)
        if (state.hideUniversal) {
          const descLower = (item.description || '').toLowerCase();
          const fileLower = (item.file && item.file.name ? item.file.name.toLowerCase() : '');
          
          if (
            descLower.includes('#universal') ||
            descLower.includes('universal') ||
            fileLower.includes('universal') ||
            descLower.includes('for all tanks') ||
            descLower.includes('all tanks') ||
            descLower.includes('camo pack') ||
            descLower.includes('color pack')
          ) {
            return false;
          }
        }

        const classification = classifyItem(item);
        
        // Country filter
        if (state.country && state.country !== 'all') {
          if (classification.country !== state.country) {
            return false;
          }
        }
        
        // Vehicle type filter
        if (state.vehicleType && state.vehicleType !== 'all') {
          if (classification.type !== state.vehicleType) {
            return false;
          }
        }
        
        return true;
      });
      
      state.currentFeedList = data.data.list || [];
      renderCards(filteredList);
      
      // Update pagination
      elements.paginationPanel.classList.remove('hidden');
      elements.pageIndicator.innerText = `Page ${state.page + 1}`;
      elements.btnPrevPage.disabled = state.page === 0;
      elements.btnNextPage.disabled = data.data.list.length < 20;
    } else {
      elements.resultsGrid.innerHTML = `<div class="info-text" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No results found or error loading feed.</div>`;
      elements.paginationPanel.classList.add('hidden');
    }
  } catch (e) {
    elements.resultsGrid.innerHTML = `<div class="info-text" style="grid-column: 1/-1; text-align: center; color: var(--color-error); padding: 40px;">Failed to fetch feed data. Ensure server is running.</div>`;
    elements.paginationPanel.classList.add('hidden');
  }
}

// Helper to extract a readable post title from description HTML, falling back to the filename
function cleanFilename(filename) {
  if (!filename) return 'Unnamed Modification';
  return filename
    .replace(/\.(zip|rar|tar|gz)$/i, '')
    .replace(/_/g, ' ')
    .replace(/%20/g, ' ')
    .trim();
}

function getPostTitle(item) {
  if (!item.description) {
    return cleanFilename(item.file.name);
  }

  // Use DOMParser since this runs in the browser
  const doc = new DOMParser().parseFromString(item.description, 'text/html');

  // 1. Try to find content in <b> or <strong> tags first, which is typically the title
  const boldElement = doc.querySelector('b, strong, h1, h2, h3, h4');
  let titleCandidate = '';
  if (boldElement) {
    titleCandidate = boldElement.textContent.trim();
  }

  // 2. If bold/heading is too short or doesn't exist, try the first text line
  if (!titleCandidate || titleCandidate.length < 3) {
    const textContent = doc.body.textContent || '';
    const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      titleCandidate = lines[0];
    }
  }

  // Clean the candidate: remove hashtags and normalize spaces
  if (titleCandidate) {
    titleCandidate = titleCandidate
      .replace(/#[a-zA-Z0-9_\-\/]+/g, '') // remove hashtags
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Skip lines that are just generic tags like "[PBR READY]" or "[UPDATE]"
  if (titleCandidate) {
    const lower = titleCandidate.toLowerCase();
    if (lower === 'pbr ready' || lower === '[pbr ready]' || lower === 'update' || lower === '[update]') {
      // Try to get next paragraph/line if available
      const textContent = doc.body.textContent || '';
      const lines = textContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        const cleanedLine = line.replace(/#[a-zA-Z0-9_\-\/]+/g, '').replace(/\s+/g, ' ').trim();
        const lowerLine = cleanedLine.toLowerCase();
        if (cleanedLine.length >= 3 && lowerLine !== 'pbr ready' && lowerLine !== '[pbr ready]' && lowerLine !== 'update' && lowerLine !== '[update]') {
          titleCandidate = cleanedLine;
          break;
        }
      }
    }
  }

  // Validate candidate length. If it's valid, return it.
  if (titleCandidate && titleCandidate.length >= 3 && titleCandidate.length <= 100) {
    return titleCandidate;
  }

  return cleanFilename(item.file.name);
}

// Render Results Grid
function renderCards(list) {
  elements.resultsGrid.innerHTML = '';
  
  if (list.length === 0) {
    elements.resultsGrid.innerHTML = `<div class="info-text" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No modifications found. Try adjusting your search query.</div>`;
    return;
  }
  
  list.forEach(item => {
    if (!item.file) return;
    
    const card = document.createElement('div');
    card.className = 'card';
    
    const likes = item.likes || 0;
    const views = item.views || 0;
    const downloads = item.downloads || 0;
    const sizeMb = (item.file.size / 1024 / 1024).toFixed(1);
    
    const imageUrl = (item.images && item.images.length > 0) ? item.images[0].src : 'https://placehold.co/600x400/111317/fff?text=No+Preview';
    
    const isInstalled = isModInstalled(item);

    // Determine button class and label based on queue status
    let btnClass = 'btn-install';
    let btnText = '📥 Install';
    let btnDisabled = '';

    if (isInstalled) {
      btnClass += ' installed';
      btnText = '✓ Installed';
      btnDisabled = 'disabled';
    } else if (state.queueList && state.queueList.active && state.queueList.active.postId === item.id) {
      const active = state.queueList.active;
      if (active.status === 'downloading') {
        btnClass += ' downloading';
        btnText = `⏳ downloading (${active.progress}%)`;
      } else if (active.status === 'extracting') {
        btnClass += ' extracting';
        btnText = `⚙️ Extracting...`;
      }
      btnDisabled = 'disabled';
    } else if (state.queueList && state.queueList.queue && state.queueList.queue.some(q => q.postId === item.id)) {
      btnClass += ' queued';
      btnText = '✓ Queued';
      btnDisabled = 'disabled';
    }

    // Extract a readable post title from the description, falling back to the filename
    const cleanModName = getPostTitle(item);
    const rawDescText = stripHtml(item.description || '');

    // Map all images to an array of URLs for our gallery carousel
    const imagesList = (item.images && item.images.length > 0) ? item.images.map(img => img.src) : [imageUrl];
    const hasMultipleImages = imagesList.length > 1;

    // Build the dot indicators HTML
    let dotsHtml = '';
    if (hasMultipleImages) {
      dotsHtml = `<div class="gallery-dots">`;
      imagesList.forEach((_, idx) => {
        dotsHtml += `<span class="gallery-dot ${idx === 0 ? 'active' : ''}"></span>`;
      });
      dotsHtml += `</div>`;
    }
    
    card.innerHTML = `
      <div class="card-media" data-images='${JSON.stringify(imagesList)}' data-index="0">
        <img class="card-img" src="${imageUrl}" alt="${item.file.name}" onerror="this.src='https://placehold.co/600x400/111317/fff?text=Error+Loading'" onclick="openFullscreenImage(this.src, JSON.parse(this.parentNode.getAttribute('data-images')), parseInt(this.parentNode.getAttribute('data-index'), 10), event)">
        
        ${hasMultipleImages ? `
          <button class="gallery-btn prev" onclick="changeCardImage(this, -1, event)">‹</button>
          ${dotsHtml}
          <button class="gallery-btn next" onclick="changeCardImage(this, 1, event)">›</button>
        ` : ''}
        
        <span class="card-badge ${item.isMarketSuitable ? 'market' : ''}">
          ${item.isMarketSuitable ? 'Market Ready' : state.contentType === 'camouflage' ? 'Skin' : 'Sight'}
        </span>
      </div>
      <div class="card-content">
        <div class="card-header">
          <div class="card-author">
            <img src="${item.author.avatar}" alt="${item.author.nickname}" onerror="this.style.display='none'">
            <span>${item.author.nickname}</span>
          </div>
          <h2 class="card-title" title="${cleanModName}">${cleanModName}</h2>
          <div class="card-desc-wrapper">
            <div class="card-desc collapsed" id="desc-${item.id}">
              ${item.description}
            </div>
            ${rawDescText.length > 110 ? `<button class="btn-read-more" onclick="toggleDescription('desc-${item.id}', this)">Read More</button>` : ''}
          </div>
        </div>
        <div class="card-stats">
          <span>👍 ${likes}</span>
          <span>👁️ ${views}</span>
          <span>📥 ${downloads}</span>
        </div>
      </div>
      <div class="card-footer">
        <div class="file-info">
          <span class="file-name" title="${item.file.name}">${item.file.name}</span>
          <span class="file-size">${sizeMb} MB</span>
        </div>
        <button class="${btnClass}" 
                data-id="${item.id}"
                onclick="addModToQueueById(${item.id}, this)"
                ${btnDisabled}>
          ${btnText}
        </button>
      </div>
    `;
    elements.resultsGrid.appendChild(card);
  });
}

// Inline image switcher inside each feed card
window.changeCardImage = function(btn, dir, event) {
  event.stopPropagation(); // Prevent card clicks or fullscreen opening
  
  const mediaContainer = btn.closest('.card-media');
  const img = mediaContainer.querySelector('.card-img');
  const images = JSON.parse(mediaContainer.getAttribute('data-images'));
  let index = parseInt(mediaContainer.getAttribute('data-index'), 10);
  
  index = (index + dir + images.length) % images.length;
  mediaContainer.setAttribute('data-index', index);
  img.src = images[index];
  
  // Update navigation dots
  const dots = mediaContainer.querySelectorAll('.gallery-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === index);
  });
};

// Toggle Card description expansion
window.toggleDescription = function(descId, btn) {
  const descEl = document.getElementById(descId);
  if (descEl.classList.contains('collapsed')) {
    descEl.classList.remove('collapsed');
    descEl.classList.add('expanded');
    btn.innerText = 'Read Less';
  } else {
    descEl.classList.add('collapsed');
    descEl.classList.remove('expanded');
    btn.innerText = 'Read More';
  }
};

// Fullscreen Image Lightbox Functions
window.openFullscreenImage = function(src, imagesList, currentIndex, event) {
  if (event) event.stopPropagation();
  
  state.lightbox = {
    images: imagesList || [src],
    index: currentIndex || 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  };
  
  updateLightboxUI();
  elements.lightboxOverlay.classList.remove('hidden');
};

window.closeLightbox = function() {
  elements.lightboxOverlay.classList.add('hidden');
  if (state.lightbox) {
    state.lightbox = null;
  }
};

window.changeLightboxImage = function(dir, event) {
  if (event) event.stopPropagation();
  if (!state.lightbox || state.lightbox.images.length <= 1) return;
  
  state.lightbox.index = (state.lightbox.index + dir + state.lightbox.images.length) % state.lightbox.images.length;
  state.lightbox.scale = 1;
  state.lightbox.translateX = 0;
  state.lightbox.translateY = 0;
  
  updateLightboxUI();
};

window.zoomLightbox = function(amount, event) {
  if (event) event.stopPropagation();
  if (!state.lightbox) return;
  
  state.lightbox.scale = Math.max(0.5, Math.min(4, state.lightbox.scale + amount));
  updateLightboxTransform();
};

window.resetLightboxZoom = function(event) {
  if (event) event.stopPropagation();
  if (!state.lightbox) return;
  
  state.lightbox.scale = 1;
  state.lightbox.translateX = 0;
  state.lightbox.translateY = 0;
  updateLightboxTransform();
};

function updateLightboxUI() {
  const imgUrl = state.lightbox.images[state.lightbox.index];
  elements.lightboxImg.src = imgUrl;
  
  // Show/hide navigation arrows based on count of images
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');
  if (state.lightbox.images.length > 1) {
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
  } else {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
  }
  
  updateLightboxTransform();
}

function updateLightboxTransform() {
  elements.lightboxImg.style.transform = `scale(${state.lightbox.scale}) translate(${state.lightbox.translateX}px, ${state.lightbox.translateY}px)`;
  document.getElementById('lightbox-zoom-val').innerText = `${Math.round(state.lightbox.scale * 100)}%`;
  
  // Toggle cursor style based on zoom
  if (state.lightbox.scale > 1) {
    elements.lightboxImg.style.cursor = 'grab';
  } else {
    elements.lightboxImg.style.cursor = 'default';
  }
}

function isModInstalled(item) {
  if (!item || !item.file) return false;
  const filename = item.file.name;
  const cleanName = filename.replace(/\.(zip|rar|tar|gz)$/i, '').replace(/[^a-zA-Z0-9_\-\.]/g, '_').toLowerCase();
  
  if (state.contentType === 'camouflage') {
    return state.installedList.skins.some(x => {
      if (x.metadata && x.metadata.postId === item.id) {
        return true;
      }
      const name = x.name.replace(/\.[^/.]+$/, "").toLowerCase(); // strip extension
      return name === cleanName || name.includes(cleanName) || cleanName.includes(name);
    });
  } else {
    return state.installedList.sights.some(x => {
      if (x.metadata && x.metadata.postId === item.id) {
        return true;
      }
      const name = x.name.replace(/\.[^/.]+$/, "").toLowerCase(); // strip extension
      return name === cleanName || name.includes(cleanName) || cleanName.includes(name);
    });
  }
}

// API: Install Modification using Cached Item ID (and pass metadata details)
async function installModById(id, btnElement) {
  const item = state.currentFeedList.find(x => x.id === id);
  if (!item) {
    showToast('Failed to find mod data in cache.', 'error');
    return;
  }
  
  const type = item.type || state.contentType;
  if (type === 'camouflage' && !state.wtPathValid) {
    showToast('Please set and save a valid War Thunder Game Folder first!', 'warning');
    return;
  }
  if (type === 'sight' && !state.sightsPathValid) {
    showToast('Please set and save a valid Custom Sights Folder first!', 'warning');
    return;
  }
  
  // Show loading overlay
  elements.overlayTitle.innerText = `Installing ${type === 'camouflage' ? 'Skin' : 'Sight'}...`;
  elements.installOverlay.classList.remove('hidden');
  
  const url = item.file.link;
  const name = item.file.name;
  const lang_group = item.lang_group;
  const postId = item.id;
  const title = getPostTitle(item);
  const image = (item.images && item.images.length > 0) ? item.images[0].src : '';
  const author = item.author ? { nickname: item.author.nickname, avatar: item.author.avatar } : null;
  
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type, name, lang_group, postId, title, image, author })
    });
    
    const data = await res.json();
    
    if (data.success) {
      showToast(data.message, 'success');
      
      // Update UI button to 'Installed' state
      if (btnElement) {
        btnElement.classList.add('installed');
        btnElement.innerText = '✓ Installed';
        btnElement.disabled = true;
      }
      
      // Refresh local library cache
      await loadLibrary();
    } else {
      showToast(data.error || 'Failed to install modification.', 'error');
    }
  } catch (e) {
    showToast('Connection error during installation.', 'error');
  } finally {
    // Hide loading overlay
    elements.installOverlay.classList.add('hidden');
  }
}

// API: Load Local Installed library
async function loadLibrary() {
  try {
    const res = await fetch('/api/installed');
    const data = await res.json();
    
    state.installedList = data;
    
    elements.countSkins.innerText = data.skins.length;
    elements.countSights.innerText = data.sights.length;
    
    renderLibraryLists();
  } catch (e) {
    showToast('Failed to load installed modifications list.', 'error');
  }
}

// API: Toggle Mod Active State
async function toggleModActive(type, name) {
  try {
    const res = await fetch('/api/installed/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadLibrary();
      
      if (state.activeTab === 'browse') {
        fetchFeed();
      }
    } else {
      showToast(data.error || 'Failed to toggle modification state.', 'error');
    }
  } catch (e) {
    showToast('Connection error during toggle.', 'error');
  }
}

// Render Library Tab Lists using Steam Library Style Visual Cards
function renderLibraryLists() {
  // Skins List
  elements.skinsList.innerHTML = '';
  if (state.installedList.skins.length === 0) {
    elements.skinsList.innerHTML = '<div class="info-text" style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px; width: 100%;">No custom skins installed.</div>';
  } else {
    state.installedList.skins.forEach(skin => {
      const metadata = skin.metadata || {};
      const displayTitle = metadata.title || cleanFilename(metadata.fileName || skin.name);
      const imageUrl = metadata.image || 'https://placehold.co/600x400/111317/fff?text=No+Preview';
      
      let authorHtml = '';
      if (metadata.author && metadata.author.nickname) {
        const avatar = metadata.author.avatar || 'https://placehold.co/150x150/111317/fff?text=U';
        authorHtml = `
          <div class="lib-item-author">
            <img src="${avatar}" alt="${metadata.author.nickname}" onerror="this.style.display='none'">
            <span>${metadata.author.nickname}</span>
          </div>
        `;
      }
      
      const dateStr = new Date(skin.installedAt).toLocaleDateString();
      const typeSpecificMeta = skin.hasBlk ? '📄 BLK OK' : '⚠️ No BLK';
      
      // Update check
      const update = state.updatesList && state.updatesList.find(u => u.postId === metadata.postId && u.type === 'camouflage');
      let updateBadgeHtml = '';
      let updateBtnHtml = '';
      
      if (update) {
        updateBadgeHtml = `<span class="update-badge">Update</span>`;
        
        let updateBtnText = '🔄 Update';
        let updateBtnDisabled = '';
        
        if (state.queueList.active && state.queueList.active.postId === metadata.postId) {
          updateBtnText = '⏳ Updating...';
          updateBtnDisabled = 'disabled';
        } else if (state.queueList.queue.some(q => q.postId === metadata.postId)) {
          updateBtnText = '✓ Queued';
          updateBtnDisabled = 'disabled';
        }
        
        updateBtnHtml = `
          <button class="btn-update" onclick="installUpdate(${JSON.stringify(update).replace(/"/g, '&quot;')}, this)" ${updateBtnDisabled}>
            ${updateBtnText}
          </button>
        `;
      }

      const card = document.createElement('div');
      card.className = `lib-card ${skin.disabled ? 'disabled' : ''}`;
      card.setAttribute('data-name', skin.name.toLowerCase());
      if (skin.blkFiles) {
        card.setAttribute('data-blkfiles', JSON.stringify(skin.blkFiles));
      }
      card.innerHTML = `
        <div class="lib-card-media" onclick="openFullscreenImage(this.querySelector('img').src, [this.querySelector('img').src], 0, event)">
          <img src="${imageUrl}" alt="${displayTitle}" onerror="this.src='https://placehold.co/600x400/111317/fff?text=No+Preview'">
          ${skin.disabled ? '<span class="disabled-badge">Disabled</span>' : ''}
          ${updateBadgeHtml}
        </div>
        <div class="lib-card-content">
          <div class="lib-card-title" title="${displayTitle}">${displayTitle}</div>
          <div class="lib-card-meta">
            ${authorHtml}
            <span>📅 ${dateStr}</span>
            <span>${typeSpecificMeta}</span>
          </div>
          <div class="lib-card-actions">
            ${updateBtnHtml}
            <button class="btn-toggle ${skin.disabled ? 'enable' : 'disable'}" onclick="toggleModActive('camouflage', '${skin.name}')">
              ${skin.disabled ? '🟢 Enable' : '🔴 Disable'}
            </button>
            <button class="btn-delete" onclick="deleteMod('camouflage', '${skin.name}')">🗑️ Delete</button>
          </div>
        </div>
      `;
      elements.skinsList.appendChild(card);
    });
  }
  
  // Sights List
  elements.sightsList.innerHTML = '';
  if (state.installedList.sights.length === 0) {
    elements.sightsList.innerHTML = '<div class="info-text" style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px; width: 100%;">No custom sights installed.</div>';
  } else {
    state.installedList.sights.forEach(sight => {
      const metadata = sight.metadata || {};
      const displayTitle = metadata.title || cleanFilename(metadata.fileName || sight.name);
      const imageUrl = metadata.image || 'https://placehold.co/600x400/111317/fff?text=No+Preview';
      
      let authorHtml = '';
      if (metadata.author && metadata.author.nickname) {
        const avatar = metadata.author.avatar || 'https://placehold.co/150x150/111317/fff?text=U';
        authorHtml = `
          <div class="lib-item-author">
            <img src="${avatar}" alt="${metadata.author.nickname}" onerror="this.style.display='none'">
            <span>${metadata.author.nickname}</span>
          </div>
        `;
      }
      
      const dateStr = new Date(sight.installedAt).toLocaleDateString();
      const typeSpecificMeta = `🎯 Files: ${sight.filesCount}`;
      
      // Update check
      const update = state.updatesList && state.updatesList.find(u => u.postId === metadata.postId && u.type === 'sight');
      let updateBadgeHtml = '';
      let updateBtnHtml = '';
      
      if (update) {
        updateBadgeHtml = `<span class="update-badge">Update</span>`;
        
        let updateBtnText = '🔄 Update';
        let updateBtnDisabled = '';
        
        if (state.queueList.active && state.queueList.active.postId === metadata.postId) {
          updateBtnText = '⏳ Updating...';
          updateBtnDisabled = 'disabled';
        } else if (state.queueList.queue.some(q => q.postId === metadata.postId)) {
          updateBtnText = '✓ Queued';
          updateBtnDisabled = 'disabled';
        }
        
        updateBtnHtml = `
          <button class="btn-update" onclick="installUpdate(${JSON.stringify(update).replace(/"/g, '&quot;')}, this)" ${updateBtnDisabled}>
            ${updateBtnText}
          </button>
        `;
      }

      const card = document.createElement('div');
      card.className = `lib-card ${sight.disabled ? 'disabled' : ''}`;
      card.innerHTML = `
        <div class="lib-card-media" onclick="openFullscreenImage(this.querySelector('img').src, [this.querySelector('img').src], 0, event)">
          <img src="${imageUrl}" alt="${displayTitle}" onerror="this.src='https://placehold.co/600x400/111317/fff?text=No+Preview'">
          ${sight.disabled ? '<span class="disabled-badge">Disabled</span>' : ''}
          ${updateBadgeHtml}
        </div>
        <div class="lib-card-content">
          <div class="lib-card-title" title="${displayTitle}">${displayTitle}</div>
          <div class="lib-card-meta">
            ${authorHtml}
            <span>📅 ${dateStr}</span>
            <span>${typeSpecificMeta}</span>
          </div>
          <div class="lib-card-actions">
            ${updateBtnHtml}
            <button class="btn-toggle ${sight.disabled ? 'enable' : 'disable'}" onclick="toggleModActive('sight', '${sight.name}')">
              ${sight.disabled ? '🟢 Enable' : '🔴 Disable'}
            </button>
            <button class="btn-delete" onclick="deleteMod('sight', '${sight.name}')">🗑️ Delete</button>
          </div>
        </div>
      `;
      elements.sightsList.appendChild(card);
    });
  }

  // Apply library filter if query exists
  filterLibrary();
}

// Filter Local Library Items
function filterLibrary() {
  const inputEl = document.getElementById('library-search-input');
  if (!inputEl) return;
  const query = inputEl.value.toLowerCase().trim();
  const cleanQuery = query.replace(/[\s\-_]+/g, '');
  
  // Filter skins
  const skinCards = elements.skinsList.querySelectorAll('.lib-card');
  skinCards.forEach(card => {
    const title = card.querySelector('.lib-card-title').textContent.toLowerCase();
    const meta = card.querySelector('.lib-card-meta').textContent.toLowerCase();
    
    let matches = false;
    if (query) {
      matches = title.includes(query) || meta.includes(query);
      
      if (!matches) {
        const cardName = card.getAttribute('data-name') || '';
        const cleanCardName = cardName.replace(/[\s\-_]+/g, '');
        if (cleanCardName.includes(cleanQuery) || cleanQuery.includes(cleanCardName)) {
          matches = true;
        }
      }
      
      if (!matches) {
        try {
          const blkFilesAttr = card.getAttribute('data-blkfiles');
          if (blkFilesAttr) {
            const blkFiles = JSON.parse(blkFilesAttr);
            matches = blkFiles.some(blk => {
              const cleanBlk = blk.toLowerCase().replace(/\.blk$/, '').replace(/[\s\-_]+/g, '');
              return cleanBlk.includes(cleanQuery) || cleanQuery.includes(cleanBlk);
            });
          }
        } catch (_) {}
      }
    } else {
      matches = true;
    }
    
    if (matches) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
  
  // Filter sights
  const sightCards = elements.sightsList.querySelectorAll('.lib-card');
  sightCards.forEach(card => {
    const title = card.querySelector('.lib-card-title').textContent.toLowerCase();
    const meta = card.querySelector('.lib-card-meta').textContent.toLowerCase();
    
    let matches = false;
    if (query) {
      matches = title.includes(query) || meta.includes(query);
    } else {
      matches = true;
    }
    
    if (matches) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

// API: Delete Installed Mod
async function deleteMod(type, name) {
  if (!confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
    return;
  }
  
  try {
    const res = await fetch('/api/installed', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadLibrary();
      
      if (state.activeTab === 'browse') {
        fetchFeed();
      }
    } else {
      showToast(data.error || 'Failed to delete modification.', 'error');
    }
  } catch (e) {
    showToast('Connection error during deletion.', 'error');
  }
}

// Helper to clean telemetry vehicle names to standard WT Live vehicle IDs
function cleanTelemetryVehicleName(rawName) {
  if (!rawName) return '';
  // 1. Remove #tankmodels/, #airmodels/, #navalmodels/ prefixes
  let cleaned = rawName.replace(/^#?[a-zA-Z0-9_\-]+\//, '');
  
  // 2. Fix German missing underscore (e.g. germm44 -> germ_m44)
  if (cleaned.startsWith('germ') && !cleaned.startsWith('germ_')) {
    cleaned = 'germ_' + cleaned.substring(4);
  }
  // usm1a2 -> us_m1a2
  if (cleaned.startsWith('us') && !cleaned.startsWith('us_') && !cleaned.startsWith('ussr')) {
    cleaned = 'us_' + cleaned.substring(2);
  }
  // ussrt34 -> ussr_t34
  if (cleaned.startsWith('ussr') && !cleaned.startsWith('ussr_')) {
    cleaned = 'ussr_' + cleaned.substring(4);
  }
  // ukspitfire -> uk_spitfire
  if (cleaned.startsWith('uk') && !cleaned.startsWith('uk_')) {
    cleaned = 'uk_' + cleaned.substring(2);
  }
  // jptype90 -> jp_type90
  if (cleaned.startsWith('jp') && !cleaned.startsWith('jp_')) {
    cleaned = 'jp_' + cleaned.substring(2);
  }
  // itcentauro -> it_centauro
  if (cleaned.startsWith('it') && !cleaned.startsWith('it_')) {
    cleaned = 'it_' + cleaned.substring(2);
  }
  // frleclerc -> fr_leclerc
  if (cleaned.startsWith('fr') && !cleaned.startsWith('fr_')) {
    cleaned = 'fr_' + cleaned.substring(2);
  }
  // cnztz99 -> cn_ztz99
  if (cleaned.startsWith('cn') && !cleaned.startsWith('cn_')) {
    cleaned = 'cn_' + cleaned.substring(2);
  }
  // swestrv122 -> swe_strv122
  if (cleaned.startsWith('swe') && !cleaned.startsWith('swe_')) {
    cleaned = 'swe_' + cleaned.substring(3);
  }
  // ilmerkava -> il_merkava
  if (cleaned.startsWith('il') && !cleaned.startsWith('il_')) {
    cleaned = 'il_' + cleaned.substring(2);
  }
  
  return cleaned;
}

// Helper to check if an installed skin matches a vehicle name
function doesSkinMatchVehicle(skin, vehicleName) {
  if (!vehicleName) return false;
  const vClean = vehicleName.toLowerCase().replace(/[\s\-_]+/g, '');
  
  // Check blk files
  if (skin.blkFiles && skin.blkFiles.length > 0) {
    const matchesBlk = skin.blkFiles.some(blk => {
      const bClean = blk.toLowerCase().replace(/\.blk$/, '').replace(/[\s\-_]+/g, '');
      return bClean.includes(vClean) || vClean.includes(bClean);
    });
    if (matchesBlk) return true;
  }
  
  // Check folder name as fallback
  const folderClean = skin.name.toLowerCase().replace(/[\s\-_]+/g, '');
  return folderClean.includes(vClean) || vClean.includes(folderClean);
}

// API: Poll game telemetry
async function pollTelemetry() {
  try {
    const res = await fetch('/api/telemetry');
    const data = await res.json();
    
    if (data.active) {
      const cleanedVehicle = cleanTelemetryVehicleName(data.vehicle);
      state.telemetryActive = true;
      state.activeVehicle = cleanedVehicle;
      
      elements.telemetryPulse.className = 'pulse-indicator active';
      elements.telemetryStatus.innerText = 'WT Client Active';
      elements.activeVehicleName.innerText = formatVehicleDisplayName(cleanedVehicle);
      elements.telemetryContent.classList.remove('hidden');
      document.getElementById('telemetry-footer-text').innerText = 'In-match tracking active';

      // Check for matching skins in state.installedList.skins
      const matchingSkins = (state.installedList.skins || []).filter(skin => 
        doesSkinMatchVehicle(skin, cleanedVehicle)
      );

      if (matchingSkins.length > 0) {
        elements.telemetrySkinsAlertText.innerText = `You have ${matchingSkins.length} skin(s) installed for this vehicle.`;
        elements.telemetrySkinsAlert.classList.remove('hidden');
      } else {
        elements.telemetrySkinsAlert.classList.add('hidden');
      }
    } else {
      state.telemetryActive = false;
      state.activeVehicle = '';
      
      elements.telemetryPulse.className = 'pulse-indicator offline';
      elements.telemetryStatus.innerText = 'WT Client Offline';
      elements.telemetryContent.classList.add('hidden');
      document.getElementById('telemetry-footer-text').innerText = 'Launch WT & enter test flight/match';
      elements.telemetrySkinsAlert.classList.add('hidden');
    }
  } catch (e) {
    // Silently ignore telemetry polling errors
  }
}

// Formats ugly internal game IDs into cleaner user-facing text
function formatVehicleDisplayName(rawName) {
  let name = rawName;
  const matchNation = name.match(/_(germany|usa|ussr|uk|japan|italy|france|china|sweden|israel)$/);
  
  name = name.replace(/_/g, ' ');
  
  if (matchNation) {
    const nation = matchNation[1];
    name = name.replace(new RegExp(` ${nation}$`, 'i'), ` (${nation.toUpperCase()})`);
  }
  
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Toast Notifications Helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${message}</span>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Helpers for searching and filtering
function getQueryStringForAPI() {
  if (state.searchString) {
    let q = state.searchString.trim();
    // Prepend # and strip spaces/hyphens/underscores if search string doesn't start with #
    if (q && !q.startsWith('#')) {
      q = '#' + q.replace(/[\s\-_]+/g, '');
    }
    return q;
  }
  
  if (state.contentType === 'camouflage') {
    if (state.country && state.country !== 'all') {
      return '#' + state.country;
    }
    if (state.vehicleType && state.vehicleType !== 'all') {
      if (state.vehicleType === 'ground') return '#tank';
      if (state.vehicleType === 'air') return '#plane';
      if (state.vehicleType === 'naval') return '#ship';
    }
  }
  return '';
}

function updateFilterVisibility() {
  if (state.contentType === 'camouflage') {
    elements.countryFilterGroup.classList.remove('hidden');
    elements.vehicleTypeFilterGroup.classList.remove('hidden');
    elements.universalFilterGroup.classList.remove('hidden');
  } else {
    elements.countryFilterGroup.classList.add('hidden');
    elements.vehicleTypeFilterGroup.classList.add('hidden');
    elements.universalFilterGroup.classList.add('hidden');
  }
}

function classifyItem(item) {
  const descLower = (item.description || '').toLowerCase();
  const fileLower = (item.file && item.file.name ? item.file.name.toLowerCase() : '');
  const combinedText = `${descLower} ${fileLower}`;
  
  // 1. Identify Country
  const countries = ['usa', 'germany', 'ussr', 'uk', 'japan', 'italy', 'france', 'china', 'sweden', 'israel'];
  const countryScores = {};
  countries.forEach(c => countryScores[c] = 0);
  
  // USA clues
  if (combinedText.includes('#usa') || combinedText.includes('#usaf') || combinedText.includes('#usn') || combinedText.includes('#usmc') || combinedText.includes('#america')) countryScores.usa += 15;
  if (/\busa\b|\busmc\b|\busaf\b|\bamerican\b|\bunited states\b|\bus navy\b|\bus air force\b/.test(combinedText)) countryScores.usa += 8;
  if (/\bm1a[12]\b|\babrams\b|\bf-14\b|\bf14\b|\bf-15\b|\bf15\b|\bf-16\b|\bf16\b|\bf-18\b|\bf18\b|\bp-51\b|\bp51\b|\bp-47\b|\bp47\b|\ba-10\b|\ba10\b|\bf4u\b|\bhellcat\b|\bwildcat\b|\bbearcat\b|\bpatton\b/.test(combinedText)) countryScores.usa += 10;
  
  // Germany clues
  if (combinedText.includes('#germany') || combinedText.includes('#german') || combinedText.includes('#luftwaffe') || combinedText.includes('#bundeswehr') || combinedText.includes('#wehrmacht')) countryScores.germany += 15;
  if (/\bgermany\b|\bgerman\b|\bluftwaffe\b|\bbundeswehr\b|\bwehrmacht\b|\bheer\b|\bdeutschland\b/.test(combinedText)) countryScores.germany += 8;
  if (/\btiger\b|\bpanther\b|\bleopard\b|\bstug\b|\bbf[- ]?109\b|\bfw[- ]?190\b|\bju[- ]?87\b|\bhe[- ]?111\b|\bme[- ]?262\b|\bdo[- ]?335\b|\bta[- ]?152\b|\bpanzer\b|\bpz\b/.test(combinedText)) countryScores.germany += 10;
  
  // USSR clues
  if (combinedText.includes('#ussr') || combinedText.includes('#soviet') || combinedText.includes('#russian') || combinedText.includes('#russia') || combinedText.includes('#vvs')) countryScores.ussr += 15;
  if (/\bussr\b|\bsoviet\b|\brussian\b|\brussia\b|\bvvs\b|\brkka\b/.test(combinedText)) countryScores.ussr += 8;
  if (/\bmig[-_]?\d+\b|\bsu[-_]?(?:17|22|24|25|27|30|33|39|57)\b|\byak[-_]?\d+\b|\bla[-_]?\d+\b|\bil[-_]?\d+\b|\bt[- ]?34\b|\bt[- ]?54\b|\bt[- ]?55\b|\bt[- ]?62\b|\bt[- ]?64\b|\bt[- ]?72\b|\bt[- ]?80\b|\bt[- ]?90\b|\bis[- ]?[12347]\b|\bkv[- ]?[12]\b|\bbmp[-_]?\d+\b/.test(combinedText)) countryScores.ussr += 10;
  
  // UK clues
  if (combinedText.includes('#uk') || combinedText.includes('#britain') || combinedText.includes('#british') || combinedText.includes('#raf') || combinedText.includes('#royalnavy')) countryScores.uk += 15;
  if (/\buk\b|\bbritain\b|\bbritish\b|\broyal air force\b|\broyal navy\b|\braf\b/.test(combinedText)) countryScores.uk += 8;
  if (/\bspitfire\b|\bhurricane\b|\btempest\b|\btyphoon\b|\bmeteor\b|\bharrier\b|\blightning\b|\bvulcan\b|\bhunter\b|\bchallenger\b|\bchieftain\b|\bcenturion\b|\bchurchill\b/.test(combinedText)) countryScores.uk += 10;
  
  // Japan clues
  if (combinedText.includes('#japan') || combinedText.includes('#japanese') || combinedText.includes('#jasdf') || combinedText.includes('#jgsdf') || combinedText.includes('#jmsdf')) countryScores.japan += 15;
  if (/\bjapan\b|\bjapanese\b|\bjasdf\b|\bjgsdf\b|\bjmsdf\b/.test(combinedText)) countryScores.japan += 8;
  if (/\bzero\b|\ba6m\b|\bki[-_]?\d+\b|\bn1k\b|\btype[- ]?90\b|\btype[- ]?10\b|\btype[- ]?74\b|\btype[- ]?16\b/.test(combinedText)) countryScores.japan += 10;

  // Italy clues
  if (combinedText.includes('#italy') || combinedText.includes('#italian')) countryScores.italy += 15;
  if (/\bitaly\b|\bitalian\b|\bregia aeronautica\b/.test(combinedText)) countryScores.italy += 8;
  if (/\bcentauro\b|\bariete\b|\bfiat\b|\bmacchi\b|\bbreda\b/.test(combinedText)) countryScores.italy += 10;

  // France clues
  if (combinedText.includes('#france') || combinedText.includes('#french') || combinedText.includes('#aeronavale')) countryScores.france += 15;
  if (/\bfrance\b|\bfrench\b|\barmee de l'air\b/.test(combinedText)) countryScores.france += 8;
  if (/\bleclerc\b|\bmirage\b|\brafale\b|\bamx\b/.test(combinedText)) countryScores.france += 10;

  // China clues
  if (combinedText.includes('#china') || combinedText.includes('#chinese') || combinedText.includes('#pla') || combinedText.includes('#plaf') || combinedText.includes('#taiwan') || combinedText.includes('#rocaf')) countryScores.china += 15;
  if (/\bchina\b|\bchinese\b|\btaiwan\b|\bpla\b|\bplaf\b/.test(combinedText)) countryScores.china += 8;
  if (/\bztz\b|\bj[-_]?[789101115]\b|\bq[-_]?5\b/.test(combinedText)) countryScores.china += 10;

  // Sweden clues
  if (combinedText.includes('#sweden') || combinedText.includes('#swedish') || combinedText.includes('#finland') || combinedText.includes('#finnish')) countryScores.sweden += 15;
  if (/\bsweden\b|\bswedish\b|\bfinland\b|\bfinnish\b/.test(combinedText)) countryScores.sweden += 8;
  if (/\bstrv\b|\bgripen\b|\bviggen\b|\bdraken\b|\blansen\b/.test(combinedText)) countryScores.sweden += 10;

  // Israel clues
  if (combinedText.includes('#israel') || combinedText.includes('#israeli') || combinedText.includes('#iaf') || combinedText.includes('#idf')) countryScores.israel += 15;
  if (/\bisrael\b|\bisraeli\b|\biaf\b|\bidf\b/.test(combinedText)) countryScores.israel += 8;
  if (/\bmerkava\b|\bkfir\b|\blavi\b/.test(combinedText)) countryScores.israel += 10;

  // Determine highest country score
  let detectedCountry = 'unknown';
  let maxCountryScore = 0;
  countries.forEach(c => {
    if (countryScores[c] > maxCountryScore) {
      maxCountryScore = countryScores[c];
      detectedCountry = c;
    }
  });

  // 2. Identify Vehicle Type
  let detectedType = 'unknown';
  
  if (item.type === 'sight') {
    detectedType = 'ground'; // Sights are always ground
  } else {
    const typeScores = { ground: 0, air: 0, naval: 0 };
    
    // Air keywords/hashtags
    if (combinedText.includes('#plane') || combinedText.includes('#planes') || combinedText.includes('#aircraft') || combinedText.includes('#jet') || combinedText.includes('#jets') || combinedText.includes('#helicopter') || combinedText.includes('#helicopters') || combinedText.includes('#aviation') || combinedText.includes('#interceptor') || combinedText.includes('#bomber') || combinedText.includes('#fighter')) {
      typeScores.air += 15;
    }
    if (/\bplane\b|\bplanes\b|\baircraft\b|\bjet\b|\bjets\b|\bhelicopter\b|\bhelicopters\b|\baviation\b|\bfighter\b|\bbomber\b|\binterceptor\b/.test(combinedText)) {
      typeScores.air += 8;
    }
    if (/\bspitfire\b|\bbf[- ]?109\b|\bfw[- ]?190\b|\bju[- ]?87\b|\bhe[- ]?111\b|\bme[- ]?262\b|\bdo[- ]?335\b|\bta[- ]?152\b|\bp[- ]?51\b|\bp[- ]?47\b|\bp[- ]?38\b|\ba[- ]?10\b|\bf[- ]?4\b|\bf[- ]?14\b|\bf[- ]?15\b|\bf[- ]?16\b|\bf[- ]?18\b|\bmig[-_]?\d+\b|\bsu[-_]?(?:17|22|24|25|27|30|33|39|57)\b|\byak[-_]?\d+\b|\bla[-_]?\d+\b|\bil[-_]?\d+\b|\btu[-_]?\d+\b|\bgripen\b|\bviggen\b|\bdraken\b|\bmirage\b|\brafale\b|\bzero\b|\ba6m\b|\bki[-_]?\d+\b/.test(combinedText)) {
      typeScores.air += 10;
    }
    
    // Naval keywords/hashtags
    if (combinedText.includes('#ship') || combinedText.includes('#ships') || combinedText.includes('#boat') || combinedText.includes('#boats') || combinedText.includes('#naval') || combinedText.includes('#navy') || combinedText.includes('#fleet') || combinedText.includes('#destroyer') || combinedText.includes('#cruiser') || combinedText.includes('#battleship') || combinedText.includes('#frigate')) {
      typeScores.naval += 15;
    }
    if (/\bship\b|\bships\b|\bboat\b|\bboats\b|\bnaval\b|\bnavy\b|\bfleet\b|\bdestroyer\b|\bcruiser\b|\bbattleship\b|\bfrigate\b/.test(combinedText)) {
      typeScores.naval += 8;
    }
    if (/\bkms\s|\buss\s|\bhms\s|\bijn\s|\bprinz eugen\b|\bbismarck\b|\byamato\b|\btirpitz\b/.test(combinedText)) {
      typeScores.naval += 10;
    }

    // Ground keywords/hashtags
    if (combinedText.includes('#tank') || combinedText.includes('#tanks') || combinedText.includes('#ground') || combinedText.includes('#panzer') || combinedText.includes('#spg') || combinedText.includes('#sam') || combinedText.includes('#ifv') || combinedText.includes('#apc') || combinedText.includes('#armor') || combinedText.includes('#armored') || combinedText.includes('#spaa')) {
      typeScores.ground += 15;
    }
    if (/\btank\b|\btanks\b|\bground\b|\bpanzer\b|\bspg\b|\bifv\b|\bapc\b|\barmor\b|\barmored\b|\bspaa\b/.test(combinedText)) {
      typeScores.ground += 8;
    }
    if (/\btiger\b|\bpanther\b|\bleopard\b|\babrams\b|\bm1a[12]\b|\bt[- ]?34\b|\bt[- ]?54\b|\bt[- ]?55\b|\bt[- ]?62\b|\bt[- ]?64\b|\bt[- ]?72\b|\bt[- ]?80\b|\bt[- ]?90\b|\bstrv\b|\bchallenger\b|\bchieftain\b|\bcenturion\b|\bsherman\b|\bstug\b|\bhetzer\b|\bjagdpanther\b|\bjagdtiger\b|\bmaus\b|\bbmp[-_]?\d+\b|\bpanzer[-_]?\w+\b|\bpz[-_]?\w+\b/.test(combinedText)) {
      typeScores.ground += 10;
    }

    // Determine highest category score
    let maxTypeScore = 0;
    Object.keys(typeScores).forEach(t => {
      if (typeScores[t] > maxTypeScore) {
        maxTypeScore = typeScores[t];
        detectedType = t;
      }
    });
  }

  return { country: detectedCountry, type: detectedType };
}

// Global window functions for the Queue
window.cancelDownload = cancelDownload;
window.reorderQueue = reorderQueue;
window.clearQueueHistory = clearQueueHistory;
window.addModToQueueById = addModToQueueById;
window.pollQueue = pollQueue;
window.checkUpdates = checkUpdates;
window.installUpdate = installUpdate;
window.openStorageModal = openStorageModal;
window.closeStorageModal = closeStorageModal;
window.cleanSingleMod = cleanSingleMod;
window.cleanAllStorage = cleanAllStorage;
window.openCookieModal = openCookieModal;
window.closeCookieModal = closeCookieModal;
window.copyCookieSnippet = copyCookieSnippet;
window.pauseDownload = pauseDownload;
window.resumeDownload = resumeDownload;

// ==========================================
// DOWNLOAD QUEUE HANDLERS & RENDERING
// ==========================================

// Add a modification to the download queue
async function addModToQueueById(id, btnElement) {
  const item = state.currentFeedList.find(x => x.id === id);
  if (!item) {
    showToast('Failed to find mod data in cache.', 'error');
    return;
  }
  
  const type = item.type || state.contentType;
  if (type === 'camouflage' && !state.wtPathValid) {
    showToast('Please set and save a valid War Thunder Game Folder first!', 'warning');
    return;
  }
  if (type === 'sight' && !state.sightsPathValid) {
    showToast('Please set and save a valid Custom Sights Folder first!', 'warning');
    return;
  }

  // Instant UI feedback
  if (btnElement) {
    btnElement.className = 'btn-install queued';
    btnElement.innerText = '✓ Queued';
    btnElement.disabled = true;
  }

  const url = item.file.link;
  const name = item.file.name;
  const lang_group = item.lang_group;
  const postId = item.id;
  const title = getPostTitle(item);
  const image = (item.images && item.images.length > 0) ? item.images[0].src : '';
  const author = item.author ? { nickname: item.author.nickname, avatar: item.author.avatar } : null;

  try {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type, name, lang_group, postId, title, image, author })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast('Added to download queue!', 'success');
      pollQueue();
    } else {
      showToast(data.error || 'Failed to add to queue.', 'error');
      if (btnElement) {
        btnElement.className = 'btn-install';
        btnElement.innerText = '📥 Install';
        btnElement.disabled = false;
      }
    }
  } catch (e) {
    showToast('Connection error adding to queue.', 'error');
    if (btnElement) {
      btnElement.className = 'btn-install';
      btnElement.innerText = '📥 Install';
      btnElement.disabled = false;
    }
  }
}

// Cancel a queued or active download
async function cancelDownload(id) {
  try {
    const res = await fetch('/api/queue/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Download cancelled.', 'info');
      pollQueue();
      loadLibrary();
    } else {
      showToast(data.error || 'Failed to cancel download.', 'error');
    }
  } catch (e) {
    showToast('Failed to cancel download.', 'error');
  }
}

// Pause a queued or active download
async function pauseDownload(id) {
  try {
    const res = await fetch('/api/queue/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Download paused.', 'success');
      pollQueue();
    } else {
      showToast(data.error || 'Failed to pause download.', 'error');
    }
  } catch (e) {
    showToast('Failed to pause download.', 'error');
  }
}

// Resume a paused download
async function resumeDownload(id) {
  try {
    const res = await fetch('/api/queue/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Download resumed.', 'success');
      pollQueue();
    } else {
      showToast(data.error || 'Failed to resume download.', 'error');
    }
  } catch (e) {
    showToast('Failed to resume download.', 'error');
  }
}

// Reorder queue item
async function reorderQueue(id, action) {
  try {
    const res = await fetch('/api/queue/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action })
    });
    const data = await res.json();
    if (data.success) {
      state.queueList.queue = data.queue;
      renderQueueLists();
      showToast('Queue reordered.', 'success');
    } else {
      showToast(data.error || 'Failed to reorder queue.', 'error');
    }
  } catch (e) {
    showToast('Failed to reorder queue.', 'error');
  }
}

// Clear finished downloads from history
async function clearQueueHistory() {
  try {
    const res = await fetch('/api/queue/clear-history', {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Download history cleared.', 'success');
      pollQueue();
    }
  } catch (e) {
    showToast('Failed to clear download history.', 'error');
  }
}

function formatSpeed(speedBytesPerSec) {
  if (!speedBytesPerSec || speedBytesPerSec <= 0) return '0 B/s';
  if (speedBytesPerSec < 1024) {
    return `${speedBytesPerSec.toFixed(0)} B/s`;
  } else if (speedBytesPerSec < 1024 * 1024) {
    return `${(speedBytesPerSec / 1024).toFixed(1)} KB/s`;
  } else {
    return `${(speedBytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  }
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0.0 MB';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatETA(seconds) {
  if (seconds === undefined || seconds === null || seconds < 0) return 'ETA: --';
  if (seconds < 60) {
    return `ETA: ${seconds}s`;
  } else {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `ETA: ${mins}m ${secs}s`;
  }
}

// Render queue section contents
function renderQueueLists() {
  const active = state.queueList.active;
  const queue = state.queueList.queue;
  const history = state.queueList.history;

  // 1. Render Active Download
  if (active) {
    const progressFill = active.progress || 0;
    const thumbnail = active.image || 'https://placehold.co/600x400/111317/fff?text=No+Preview';
    const cleanTitle = active.title || active.name;
    const authorName = active.author ? active.author.nickname : 'Anonymous';
    
    let statusText = 'Pending...';
    if (active.status === 'downloading') {
      statusText = `Downloading (${progressFill}%)`;
    } else if (active.status === 'extracting') {
      statusText = 'Extracting ZIP...';
    }

    elements.activeDownloadContainer.innerHTML = `
      <div class="download-card">
        <img class="download-img" src="${thumbnail}" alt="${cleanTitle}">
        <div class="download-info">
          <div class="download-title-row">
            <span class="download-type-badge ${active.type === 'sight' ? 'sight' : 'skin'}">${active.type === 'sight' ? 'Sight' : 'Skin'}</span>
            <h4 class="download-title" title="${cleanTitle}">${cleanTitle}</h4>
          </div>
          <div class="download-meta">By <span>${authorName}</span></div>
          <div class="download-status-container">
            <div class="download-progress-bar">
              <div class="download-progress-fill" style="width: ${progressFill}%"></div>
            </div>
            <div class="download-status-row">
              <span class="download-status-text ${active.status}">${statusText}</span>
              ${active.status === 'downloading' && active.speed ? `
                <div class="download-speed-eta">
                  <span class="speed">${formatSpeed(active.speed)}</span>
                  <span class="divider">•</span>
                  <span class="size">${formatSize(active.downloadedBytes)} / ${formatSize(active.totalBytes)}</span>
                  <span class="divider">•</span>
                  <span class="eta">${formatETA(active.eta)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
        <div class="download-actions">
          <button class="btn-pause-dl" onclick="pauseDownload('${active.id}')">Pause</button>
          <button class="btn-cancel-dl" onclick="cancelDownload('${active.id}')">Cancel</button>
        </div>
      </div>
    `;
  } else {
    elements.activeDownloadContainer.innerHTML = `<div class="no-downloads-msg">No active downloads.</div>`;
  }

  // 2. Render Pending Queue
  if (queue && queue.length > 0) {
    elements.pendingQueueContainer.innerHTML = queue.map((item, idx) => {
      const thumbnail = item.image || 'https://placehold.co/600x400/111317/fff?text=No+Preview';
      const cleanTitle = item.title || item.name;
      const authorName = item.author ? item.author.nickname : 'Anonymous';
      
      const isPaused = item.status === 'paused';
      const statusClass = isPaused ? 'paused' : 'pending';
      let statusText = isPaused ? 'Paused' : `Queued (Position #${idx + 1})`;
      if (!isPaused && item.retries > 0) {
        statusText = `⏳ Retrying (Attempt ${item.retries}/3)...`;
      }
      
      const isFirst = idx === 0;
      const isLast = idx === queue.length - 1;
      
      const upDisabled = isFirst ? 'disabled title="Already at the top"' : 'title="Move Up"';
      const downDisabled = isLast ? 'disabled title="Already at the bottom"' : 'title="Move Down"';
      const topDisabled = isFirst ? 'disabled title="Already at the top"' : 'title="Move to Top"';
      
      let actionButtons = '';
      if (isPaused) {
        actionButtons = `
          <button class="btn-resume-dl" onclick="resumeDownload('${item.id}')" title="Resume download">Resume</button>
          <button class="btn-cancel-dl" onclick="cancelDownload('${item.id}')" title="Remove from queue">✕</button>
        `;
      } else {
        actionButtons = `
          <button class="btn-order-dl" onclick="reorderQueue('${item.id}', 'top')" ${topDisabled}>⇈</button>
          <button class="btn-order-dl" onclick="reorderQueue('${item.id}', 'up')" ${upDisabled}>↑</button>
          <button class="btn-order-dl" onclick="reorderQueue('${item.id}', 'down')" ${downDisabled}>↓</button>
          <button class="btn-pause-dl" onclick="pauseDownload('${item.id}')" title="Pause download" style="padding: 6px 10px;">⏸</button>
          <button class="btn-cancel-dl" onclick="cancelDownload('${item.id}')" title="Remove from queue">✕</button>
        `;
      }
      
      return `
        <div class="download-card" style="margin-bottom: 8px;">
          <img class="download-img" src="${thumbnail}" alt="${cleanTitle}">
          <div class="download-info">
            <div class="download-title-row">
              <span class="download-type-badge ${item.type === 'sight' ? 'sight' : 'skin'}">${item.type === 'sight' ? 'Sight' : 'Skin'}</span>
              <h4 class="download-title" title="${cleanTitle}">${cleanTitle}</h4>
            </div>
            <div class="download-meta">By <span>${authorName}</span></div>
            <div class="download-status-container">
              <span class="download-status-text ${statusClass}">${statusText}</span>
            </div>
          </div>
          <div class="download-actions" style="display: flex; gap: 4px; align-items: center;">
            ${actionButtons}
          </div>
        </div>
      `;
    }).join('');
  } else {
    elements.pendingQueueContainer.innerHTML = `<div class="no-downloads-msg">No pending items in queue.</div>`;
  }

  // 3. Render Download History
  if (history && history.length > 0) {
    elements.historyQueueContainer.innerHTML = history.map(item => {
      const thumbnail = item.image || 'https://placehold.co/600x400/111317/fff?text=No+Preview';
      const cleanTitle = item.title || item.name;
      const authorName = item.author ? item.author.nickname : 'Anonymous';
      
      let statusLabel = 'Finished';
      if (item.status === 'completed') statusLabel = 'Installed';
      else if (item.status === 'failed') statusLabel = `Failed: ${item.error || 'unknown error'}`;
      else if (item.status === 'cancelled') statusLabel = 'Cancelled';

      return `
        <div class="download-card" style="margin-bottom: 8px; opacity: 0.75;">
          <img class="download-img" src="${thumbnail}" alt="${cleanTitle}">
          <div class="download-info">
            <div class="download-title-row">
              <span class="download-type-badge ${item.type === 'sight' ? 'sight' : 'skin'}">${item.type === 'sight' ? 'Sight' : 'Skin'}</span>
              <h4 class="download-title" title="${cleanTitle}">${cleanTitle}</h4>
            </div>
            <div class="download-meta">By <span>${authorName}</span></div>
            <div class="download-status-container">
              <span class="download-status-text ${item.status}">${statusLabel}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    elements.historyQueueContainer.innerHTML = `<div class="no-downloads-msg">No download history.</div>`;
  }
}

// Poll download queue API
async function pollQueue() {
  try {
    const res = await fetch('/api/queue');
    const data = await res.json();
    
    state.queueList = data;
    
    // Update sidebar tab badge
    const count = data.queue.length + (data.active ? 1 : 0);
    if (count > 0) {
      elements.countQueue.innerText = count;
      elements.countQueue.classList.remove('hidden');
    } else {
      elements.countQueue.classList.add('hidden');
    }
    
    // If active tab is queue, render the lists
    if (state.activeTab === 'queue') {
      renderQueueLists();
    }
    
    // Update cards grid button states on the fly
    updateResultsGridButtonStates();
  } catch (e) {
    console.error('Failed to poll queue status:', e);
  }
}

// Dynamically refresh feed install buttons state
function updateResultsGridButtonStates() {
  const installButtons = document.querySelectorAll('.results-grid .btn-install');
  if (installButtons.length === 0) return;

  installButtons.forEach(btn => {
    const idAttr = btn.getAttribute('data-id');
    if (!idAttr) return;
    const postId = parseInt(idAttr, 10);

    const item = state.currentFeedList.find(x => x.id === postId);
    if (!item) return;

    const isInstalled = isModInstalled(item);

    if (isInstalled) {
      btn.className = 'btn-install installed';
      btn.innerText = '✓ Installed';
      btn.disabled = true;
      return;
    }

    if (state.queueList.active && state.queueList.active.postId === postId) {
      const active = state.queueList.active;
      if (active.status === 'downloading') {
        btn.className = 'btn-install downloading';
        btn.innerText = `⏳ downloading (${active.progress}%)`;
      } else if (active.status === 'extracting') {
        btn.className = 'btn-install extracting';
        btn.innerText = `⚙️ Extracting...`;
      }
      btn.disabled = true;
      return;
    }

    const queuedItem = state.queueList.queue.find(q => q.postId === postId);
    if (queuedItem) {
      btn.className = 'btn-install queued';
      btn.innerText = '✓ Queued';
      btn.disabled = true;
      return;
    }

    btn.className = 'btn-install';
    btn.innerText = '📥 Install';
    btn.disabled = false;
  });
}

// Check updates for all installed mods on WT Live
async function checkUpdates(btnElement) {
  if (!btnElement) btnElement = document.getElementById('btn-check-updates');
  
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = '⏳ Checking...';
  }
  
  try {
    showToast('Checking for updates on WT Live...', 'info');
    const res = await fetch('/api/installed/check-updates');
    const data = await res.json();
    
    state.updatesList = data.updates || [];
    
    if (state.updatesList.length > 0) {
      showToast(`Found ${state.updatesList.length} updates!`, 'success');
    } else {
      showToast('All modifications are up to date.', 'success');
    }
    
    // Rerender library lists to display badges and update buttons
    renderLibraryLists();
  } catch (e) {
    showToast('Failed to check for updates.', 'error');
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerText = '🔄 Check Updates';
    }
  }
}

// Queue an update download
async function installUpdate(update, btnElement) {
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = '✓ Queued';
  }

  const { downloadUrl, type, name, newLangGroup, postId, title, image, author } = update;

  try {
    const res = await fetch('/api/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: downloadUrl,
        type,
        name,
        lang_group: newLangGroup,
        postId,
        title,
        image,
        author
      })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast(`Update for "${title || name}" added to queue!`, 'success');
      pollQueue();
    } else {
      showToast(data.error || 'Failed to queue update.', 'error');
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerText = '🔄 Update';
      }
    }
  } catch (e) {
    showToast('Connection error starting update.', 'error');
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerText = '🔄 Update';
    }
  }
}

// ==========================================
// STORAGE ANALYZER & CLEANUP METHODS
// ==========================================

// Open the storage optimizer modal and query stats
async function openStorageModal() {
  const modal = document.getElementById('storage-overlay');
  modal.classList.remove('hidden');
  
  // Render loading state
  document.getElementById('storage-val-total').innerText = '⏳ ...';
  document.getElementById('storage-val-source').innerText = '⏳ ...';
  document.getElementById('storage-val-archive').innerText = '⏳ ...';
  document.getElementById('storage-val-game').innerText = '⏳ ...';
  
  const listContainer = document.getElementById('storage-mods-list-container');
  listContainer.innerHTML = '<div class="no-downloads-msg">Analyzing local directories, please wait...</div>';

  try {
    const res = await fetch('/api/storage/analyze');
    const data = await res.json();
    
    // Fill stat boxes
    const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
    
    document.getElementById('storage-val-total').innerText = toMB(data.totals.totalSize);
    document.getElementById('storage-val-source').innerText = toMB(data.totals.sourceSize);
    document.getElementById('storage-val-archive').innerText = toMB(data.totals.archiveSize);
    document.getElementById('storage-val-game').innerText = toMB(data.totals.gameSize);
    
    // Fill list of mods
    if (data.mods && data.mods.length > 0) {
      listContainer.innerHTML = data.mods.map(mod => {
        const wasteBytes = mod.stats.sourceSize + mod.stats.archiveSize;
        const wasteMb = (wasteBytes / 1024 / 1024).toFixed(1);
        const totalMb = (mod.stats.totalSize / 1024 / 1024).toFixed(1);
        
        let detailsText = `<span>Total: ${totalMb} MB (${mod.stats.filesCount} files)</span>`;
        if (wasteBytes > 0) {
          detailsText += ` • <span class="waste">Source & Backups: ${wasteMb} MB</span>`;
        }

        const isCleanable = wasteBytes > 0;
        
        return `
          <div class="storage-mod-row">
            <div class="storage-mod-info">
              <span class="storage-mod-title" title="${mod.title}">${mod.title} ${mod.disabled ? '(Disabled)' : ''}</span>
              <div class="storage-mod-details">
                ${detailsText}
              </div>
            </div>
            <div class="storage-mod-actions">
              <button class="btn-clean-single" 
                      onclick="cleanSingleMod('${mod.name}', '${mod.type}', this)" 
                      ${!isCleanable ? 'disabled' : ''}>
                🧹 Clean
              </button>
            </div>
          </div>
        `;
      }).join('');
    } else {
      listContainer.innerHTML = '<div class="no-downloads-msg">No custom modifications found to analyze.</div>';
    }
  } catch (e) {
    showToast('Failed to analyze storage usage.', 'error');
    listContainer.innerHTML = '<div class="no-downloads-msg" style="color: var(--color-error)">Failed to complete storage analysis.</div>';
  }
}

// Close the storage optimizer modal
function closeStorageModal() {
  document.getElementById('storage-overlay').classList.add('hidden');
}

// Clean source and archive files inside a single mod folder
async function cleanSingleMod(name, type, btnElement) {
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = '⏳ ...';
  }

  try {
    const res = await fetch('/api/storage/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      // Refresh statistics inside the modal
      openStorageModal();
      // Reload installed list in the background
      loadLibrary();
    } else {
      showToast(data.error || 'Failed to clean modification.', 'error');
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerText = '🧹 Clean';
      }
    }
  } catch (e) {
    showToast('Connection error during cleanup.', 'error');
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerText = '🧹 Clean';
    }
  }
}

// Clean source and archive files for ALL installed mods
async function cleanAllStorage(btnElement) {
  if (!confirm('Are you sure you want to clean all project source files (.psd, .xcf) and archives (.zip, .rar) from ALL your custom mods? This is 100% safe and will keep skins/sights working in game, but will permanently delete these project files.')) {
    return;
  }

  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = '⏳ Cleaning All Mods...';
  }

  try {
    const res = await fetch('/api/storage/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      openStorageModal();
      loadLibrary();
    } else {
      showToast(data.error || 'Failed to complete clean execution.', 'error');
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerText = '🧹 Clean All Source & Archive Files';
      }
    }
  } catch (e) {
    showToast('Connection error during global clean execution.', 'error');
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerText = '🧹 Clean All Source & Archive Files';
    }
  }
}

// Open the cookie instructions modal
function openCookieModal() {
  if (elements.cookieOverlay) {
    elements.cookieOverlay.classList.remove('hidden');
  }
}

// Close the cookie instructions modal
function closeCookieModal() {
  if (elements.cookieOverlay) {
    elements.cookieOverlay.classList.add('hidden');
  }
}

// Copy the console JavaScript snippet to get the cookie
function copyCookieSnippet() {
  const codeEl = document.getElementById('cookie-code-snippet');
  if (codeEl) {
    const code = codeEl.textContent;
    navigator.clipboard.writeText(code).then(() => {
      showToast('Consola snippet copiado para a área de transferência!', 'success');
    }).catch(() => {
      showToast('Erro ao copiar. Selecione e copie manualmente.', 'error');
    });
  }
}
