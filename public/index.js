// App State
const state = {
  activeTab: 'browse',
  contentType: 'camouflage', // 'camouflage' or 'sight'
  searchString: '',
  sort: 'downloads',
  page: 0,
  installedList: { skins: [], sights: [] },
  wtPathValid: false,
  sightsPathValid: false,
  telemetryActive: false,
  activeVehicle: ''
};

// DOM Elements
const elements = {
  wtPathInput: document.getElementById('wt-path-input'),
  sightsPathInput: document.getElementById('sights-path-input'),
  cookieInput: document.getElementById('cookie-input'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  pathStatusMsg: document.getElementById('path-status-msg'),
  sightsStatusMsg: document.getElementById('sights-status-msg'),
  
  searchInput: document.getElementById('search-input'),
  btnSearch: document.getElementById('btn-search'),
  contentToggleButtons: document.querySelectorAll('#content-toggle .toggle-btn'),
  sortSelect: document.getElementById('sort-select'),
  resultsGrid: document.getElementById('results-grid'),
  
  paginationPanel: document.getElementById('pagination-panel'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageIndicator: document.getElementById('page-indicator'),
  
  tabBrowse: document.getElementById('tab-browse'),
  tabLibrary: document.getElementById('tab-library'),
  btnTabBrowse: document.getElementById('btn-tab-browse'),
  btnTabLibrary: document.getElementById('btn-tab-library'),
  
  countSkins: document.getElementById('count-skins'),
  countSights: document.getElementById('count-sights'),
  skinsList: document.getElementById('skins-list'),
  sightsList: document.getElementById('sights-list'),
  
  telemetryPanel: document.getElementById('telemetry-panel'),
  telemetryPulse: document.getElementById('telemetry-pulse'),
  telemetryStatus: document.getElementById('telemetry-status'),
  telemetryContent: document.getElementById('telemetry-content'),
  activeVehicleName: document.getElementById('active-vehicle-name'),
  btnAutoSearch: document.getElementById('btn-auto-search'),
  
  installOverlay: document.getElementById('install-overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  
  lightboxOverlay: document.getElementById('lightbox-overlay'),
  lightboxImg: document.getElementById('lightbox-img'),
  
  toastContainer: document.getElementById('toast-container')
};

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadLibrary();
  fetchFeed();
  
  // Start telemetry polling
  pollTelemetry();
  setInterval(pollTelemetry, 2000);
  
  // Set up event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Save Settings
  elements.btnSaveSettings.addEventListener('click', saveSettings);
  
  // Search
  elements.btnSearch.addEventListener('click', () => {
    state.searchString = elements.searchInput.value.trim();
    state.page = 0;
    fetchFeed();
  });
  
  elements.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.searchString = elements.searchInput.value.trim();
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
      fetchFeed();
    });
  });
  
  // Sort Selection
  elements.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 0;
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
      // Clean vehicle name for searching
      const cleanName = formatVehicleForSearch(state.activeVehicle);
      elements.searchInput.value = cleanName;
      state.searchString = cleanName;
      state.page = 0;
      switchTab('browse');
      fetchFeed();
    }
  });
}

// Format WT Internal vehicle names to standard search text
function formatVehicleForSearch(vehicleName) {
  let cleaned = vehicleName.toLowerCase();
  
  // Remove common suffixes
  cleaned = cleaned.replace(/_(germany|usa|ussr|uk|japan|italy|france|china|sweden|israel)$/g, '');
  
  // Replace underscores with spaces
  cleaned = cleaned.replace(/_/g, ' ');
  
  return cleaned;
}

// Switch Tab
function switchTab(tab) {
  state.activeTab = tab;
  
  if (tab === 'browse') {
    elements.tabBrowse.classList.add('active');
    elements.tabLibrary.classList.remove('active');
    elements.btnTabBrowse.classList.add('active');
    elements.btnTabLibrary.classList.remove('active');
  } else {
    elements.tabBrowse.classList.remove('active');
    elements.tabLibrary.classList.add('active');
    elements.btnTabBrowse.classList.remove('active');
    elements.btnTabLibrary.classList.add('active');
    loadLibrary(); // Reload installed list
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
  
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wtPath, sightsPath, cookie })
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
      loadLibrary();
      fetchFeed(); // Re-fetch feed in case cookie changes content visibility
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
  
  try {
    const res = await fetch('/api/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: state.contentType,
        sort: state.sort,
        page: state.page,
        searchString: state.searchString
      })
    });
    
    const data = await res.json();
    
    if (data.status === 'OK' && data.data && data.data.list) {
      renderCards(data.data.list);
      
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
    
    const isInstalled = isModInstalled(item.file.name);

    // Extract a readable name from the filename since Gaijin's feed doesn't include a title property
    const cleanModName = item.file.name
      .replace(/\.(zip|rar|tar|gz)$/i, '')
      .replace(/_/g, ' ')
      .replace(/%20/g, ' ');

    // Strip HTML from description to get a clean snippet
    const rawDescText = stripHtml(item.description || '');
    let descSnippet = rawDescText.trim();
    if (descSnippet.length > 110) {
      descSnippet = descSnippet.substring(0, 107) + '...';
    }
    if (!descSnippet) {
      descSnippet = 'No description details provided.';
    }

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
        <img class="card-img" src="${imageUrl}" alt="${item.file.name}" onerror="this.src='https://placehold.co/600x400/111317/fff?text=Error+Loading'" onclick="openFullscreenImage(this.src, event)">
        
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
          <p class="card-desc" style="font-size: 12px; color: var(--text-muted); line-height: 1.4; height: 34px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-overflow: ellipsis; margin-top: 4px;" title="${rawDescText}">${descSnippet}</p>
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
        <button class="btn-install ${isInstalled ? 'installed' : ''}" 
                onclick="installMod('${item.file.link}', '${item.type}', '${item.file.name}', ${item.lang_group}, this)"
                ${isInstalled ? 'disabled' : ''}>
          ${isInstalled ? '✓ Installed' : '📥 Install'}
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

// Fullscreen Image Lightbox Functions
window.openFullscreenImage = function(src, event) {
  if (event) event.stopPropagation();
  elements.lightboxImg.src = src;
  elements.lightboxOverlay.classList.remove('hidden');
};

window.closeLightbox = function() {
  elements.lightboxOverlay.classList.add('hidden');
};

function isModInstalled(filename) {
  const cleanName = filename.replace(/\.(zip|rar|tar|gz)$/i, '').replace(/[^a-zA-Z0-9_\-\.]/g, '_').toLowerCase();
  
  if (state.contentType === 'camouflage') {
    return state.installedList.skins.some(x => {
      const name = x.name.replace(/\.[^/.]+$/, "").toLowerCase(); // strip extension
      return name === cleanName || name.includes(cleanName) || cleanName.includes(name);
    });
  } else {
    return state.installedList.sights.some(x => {
      const name = x.name.replace(/\.[^/.]+$/, "").toLowerCase(); // strip extension
      return name === cleanName || name.includes(cleanName) || cleanName.includes(name);
    });
  }
}

// API: Install Modification
async function installMod(url, type, name, lang_group, btnElement) {
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
  
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type, name, lang_group })
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

// Render Library Tab Lists
function renderLibraryLists() {
  // Skins List
  elements.skinsList.innerHTML = '';
  if (state.installedList.skins.length === 0) {
    elements.skinsList.innerHTML = '<div class="info-text" style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No custom skins installed.</div>';
  } else {
    state.installedList.skins.forEach(skin => {
      const item = document.createElement('div');
      item.className = 'lib-item';
      
      const dateStr = new Date(skin.installedAt).toLocaleDateString();
      
      item.innerHTML = `
        <div class="lib-item-info">
          <span class="lib-item-name" title="${skin.name}">${skin.name}</span>
          <span class="lib-item-date">Installed: ${dateStr} ${skin.hasBlk ? '' : '(No .blk detected)'}</span>
        </div>
        <button class="btn-delete" onclick="deleteMod('camouflage', '${skin.name}')">Delete</button>
      `;
      elements.skinsList.appendChild(item);
    });
  }
  
  // Sights List
  elements.sightsList.innerHTML = '';
  if (state.installedList.sights.length === 0) {
    elements.sightsList.innerHTML = '<div class="info-text" style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No custom sights installed.</div>';
  } else {
    state.installedList.sights.forEach(sight => {
      const item = document.createElement('div');
      item.className = 'lib-item';
      
      const dateStr = new Date(sight.installedAt).toLocaleDateString();
      
      item.innerHTML = `
        <div class="lib-item-info">
          <span class="lib-item-name" title="${sight.name}">${sight.name}</span>
          <span class="lib-item-date">Installed: ${dateStr} ${sight.isFile ? '(File)' : '(Folder)'}</span>
        </div>
        <button class="btn-delete" onclick="deleteMod('sight', '${sight.name}')">Delete</button>
      `;
      elements.sightsList.appendChild(item);
    });
  }
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

// API: Poll game telemetry
async function pollTelemetry() {
  try {
    const res = await fetch('/api/telemetry');
    const data = await res.json();
    
    if (data.active) {
      state.telemetryActive = true;
      state.activeVehicle = data.vehicle;
      
      elements.telemetryPulse.className = 'pulse-indicator active';
      elements.telemetryStatus.innerText = 'WT Client Active';
      elements.activeVehicleName.innerText = formatVehicleDisplayName(data.vehicle);
      elements.telemetryContent.classList.remove('hidden');
      document.getElementById('telemetry-footer-text').innerText = 'In-match tracking active';
    } else {
      state.telemetryActive = false;
      state.activeVehicle = '';
      
      elements.telemetryPulse.className = 'pulse-indicator offline';
      elements.telemetryStatus.innerText = 'WT Client Offline';
      elements.telemetryContent.classList.add('hidden');
      document.getElementById('telemetry-footer-text').innerText = 'Launch WT & enter test flight/match';
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
