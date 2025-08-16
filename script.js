// Variable to store the beforeinstallprompt event
let deferredPrompt;

// Listen for the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  // Show the installation banner
  showInstallBanner();
});

document.addEventListener("DOMContentLoaded", function () {
  // --- 0. SPLASH SCREEN MANAGEMENT ---
  const splashScreen = document.getElementById('splash-screen');
  let splashHidden = false;

  function hideSplashScreen() {
    if (!splashHidden && splashScreen) {
      splashHidden = true;
      splashScreen.classList.add('hidden');
      
      // Remove splash screen completely after animation
      setTimeout(() => {
        if (splashScreen && splashScreen.parentNode) {
          splashScreen.parentNode.removeChild(splashScreen);
        }
      }, 500); // Match CSS transition duration
    }
  }

  // Hide splash screen when first video starts playing
  function onFirstVideoPlay() {
    hideSplashScreen();
  }

  // --- 1. DATA SOURCES & DB ---
  let exerciseData = {}; // Data will be loaded from data.json
  const dbManager = {
    db: null,
    dbName: "videoDB",
    storeName: "videos",
    async openDB() {
      return new Promise((resolve, reject) => {
        if (this.db) {
          return resolve(this.db);
        }
        const request = indexedDB.open(this.dbName, 1);
        request.onerror = (event) =>
          reject("Error opening DB: " + event.target.errorCode);
        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(this.db);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
      });
    },
    async saveVideo(url, blob) {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.put(blob, url);
        request.onsuccess = () => resolve();
        request.onerror = (event) =>
          reject("Error saving video: " + event.target.error);
      });
    },
    async getVideo(url) {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(url);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) =>
          reject("Error getting video: " + event.target.error);
      });
    },
    async getAllVideoKeys() {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.getAllKeys();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) =>
          reject("Error getting keys: " + event.target.error);
      });
    },
  };

  // --- 2. DOM ELEMENT REFERENCES ---
  const videoPlayer = document.getElementById("main-video");
  const player = new Plyr(videoPlayer, {
    speed: {
      selected: 1,
      options: [0.25, 0.5, 1]
    }
  });
  
  // Add event listener to hide splash screen on first video play
  player.on('play', onFirstVideoPlay, { once: true });
  const playlistElement = document.getElementById("playlist-list");
  const playlistTitle = document.querySelector(".playlist-title");
  const categorySelector = document.getElementById("category-selector");
  // const fullscreenBtn = document.getElementById("fullscreen-btn");
  // const videoWrapper = document.querySelector(".video-player-wrapper");
  // Offline UI Elements
  const offlineControls = document.getElementById("offline-controls");
  const offlineMessage = document.getElementById("offline-message");
  const downloadBtn = document.getElementById("download-videos-btn");
  const installPwaBtn = document.getElementById("install-pwa-btn");
  const downloadProgress = document.getElementById("download-progress");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const settingsCardArea = document.getElementById("settings-card-area");
  
  // PWA Install Banner Elements
  const pwaInstallBanner = document.getElementById("pwa-install-banner");
  const pwaInstallBtn = document.getElementById("pwa-install-btn");
  const pwaInstallClose = document.getElementById("pwa-install-close");

  let currentItemIndex = -1;
  let currentGroupKey = "";
  let currentDrillKey = "";
  let currentBlobUrl = null; // To manage blob URL memory
  let allVideoUrls = []; // To store all unique video URLs from data.json

  // --- 3. HELPER FUNCTIONS ---
  function isPWA() {
    const ua = navigator.userAgent;
    const isIosWebView = /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua);
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone ||
      document.referrer.includes("android-app://") ||
      isIosWebView
    );
  }

  function getAllVideoUrls(data) {
    const urls = new Set();
    for (const group in data) {
      for (const drill in data[group]) {
        const drillData = data[group][drill];
        if (drillData.videoUrl) {
          urls.add(drillData.videoUrl);
        }
        if (drillData.items) {
          drillData.items.forEach((item) => {
            if (item.url) {
              urls.add(item.url);
            }
          });
        }
      }
    }
    return Array.from(urls);
  }

  function formatDuration(secs) {
    if (isNaN(secs) || secs < 0) return "--:--";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  function cleanTitle(rawTitle) {
    return rawTitle
      .replace(/^\d+_+/, "")
      .replace(/\.mp4$/, "")
      .replace(/_/g, " ");
  }

  // --- 4. CORE FUNCTIONS ---

  function renderPlaylist(groupKey, drillKey) {
    const drillData = exerciseData[groupKey][drillKey];
    playlistTitle.textContent = drillData.playlistTitle || "Playlist";
    let playlistHTML = "";
    drillData.items.forEach((item, index) => {
      const number = String(index + 1).padStart(2, "0");
      let duration = "--:--";
      if (drillData.type === "chapters" && item.endTime && item.startTime) {
        duration = formatDuration(item.endTime - item.startTime);
      } else if (item.duration) {
        duration = formatDuration(item.duration);
      }
      playlistHTML += `
          <li>
              <a class="playlist-item" data-index="${index}">
                  <div class="item-thumbnail">${number}</div>
                  <div class="item-info">
                      <h3 class="item-title">${cleanTitle(item.title)}</h3>
                      <p class="item-duration">${duration}</p>
                  </div>
              </a>
          </li>`;
    });
    playlistElement.innerHTML = playlistHTML;
  }

  function renderSettings() {
    const settingsHTML = `
      <ul id="settings-list">
        <li>
          <a class="playlist-item" id="cache-all-btn">
            <div class="item-thumbnail">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 14V3"/></svg>
            </div>
            <div class="item-info">
              <h3 class="item-title">Cache All Videos</h3>
              <p class="item-duration">Download all videos for offline playback.</p>
            </div>
          </a>
        </li>
        <li>
          <a class="playlist-item" id="storage-usage-btn">
            <div class="item-thumbnail">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/></svg>
            </div>
            <div class="item-info">
              <h3 class="item-title">Storage Usage</h3>
              <p class="item-duration">View app storage and cached data.</p>
            </div>
          </a>
        </li>
        <li>
          <a class="playlist-item" id="check-update-btn">
            <div class="item-thumbnail">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-9 9H3.5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2H12a9 9 0 0 1 9 9Z"/><path d="M12 7v5l3 3"/></svg>
            </div>
            <div class="item-info">
              <h3 class="item-title">Check for Updates</h3>
              <p class="item-duration">Check for new videos and app data.</p>
            </div>
          </a>
        </li>
      </ul>
    `;
    settingsCardArea.innerHTML = settingsHTML;

    document.getElementById('cache-all-btn')?.addEventListener('click', handleDownloadAll);
    document.getElementById('storage-usage-btn')?.addEventListener('click', handleStorageUsage);
    document.getElementById('check-update-btn')?.addEventListener('click', handleCheckForUpdate);
  }

  function updateActiveItemInPlaylist(activeIndex) {
    const allItems = playlistElement.querySelectorAll(".playlist-item");
    allItems.forEach((item, index) => {
      item.classList.toggle("active", index === activeIndex);
    });
    if (activeIndex > -1 && allItems[activeIndex]) {
      allItems[activeIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  async function loadItem(index, shouldPlay = false) {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }

    const drillData = exerciseData[currentGroupKey][currentDrillKey];
    if (!drillData || index < 0 || index >= drillData.items.length) return;

    const itemData = drillData.items[index];

    let videoSourceUrl =
      drillData.type === "playlist" ? itemData.url : drillData.videoUrl;
    let finalVideoSrc = videoSourceUrl;
    const cachedVideoBlob = await dbManager
      .getVideo(videoSourceUrl)
      .catch((err) => console.error(err));

    if (cachedVideoBlob) {
      console.log(`Loading video from IndexedDB: ${videoSourceUrl}`);
      finalVideoSrc = URL.createObjectURL(cachedVideoBlob);
      currentBlobUrl = finalVideoSrc;
    } else {
      console.log(`Loading video from network: ${videoSourceUrl}`);
    }

    const isSameVideo = player.source === finalVideoSrc;
    
    if (!isSameVideo) {
      player.source = {
        type: 'video',
        sources: [{
          src: finalVideoSrc,
        }],
      };
    }

    // For chapters, we need to set the start time
    if (drillData.type === "chapters") {
      // Wait for the video to be ready before setting currentTime
      const setStartTime = () => {
        player.currentTime = itemData.startTime;
        player.off('loadeddata', setStartTime); // Remove the listener after setting
      };
      
      // If the player is already loaded, set the time immediately
      if (player.media && player.media.readyState >= 2) {
        player.currentTime = itemData.startTime;
      } else {
        // Otherwise, wait for the video to be loaded
        player.on('loadeddata', setStartTime);
      }
    } else if (isSameVideo) {
      player.currentTime = 0;
    }

    if (shouldPlay) {
      player
        .play()
        .catch((error) => console.warn("Autoplay was prevented:", error));
    }

    currentItemIndex = index;
    updateActiveItemInPlaylist(index);
  }

  function playItem(index) {
    loadItem(index, true);
  }

  function loadDrill(groupKey, drillKey) {
    // Handle settings view
    if (drillKey === "settings") {
      playlistElement.hidden = true;
      offlineControls.hidden = true;
      settingsCardArea.hidden = false;
      playlistTitle.textContent = "Settings";
      renderSettings();
      return;
    }

    // Handle playlist view
    playlistElement.hidden = false;
    if (isPWA()) {
      checkOfflineStatus(); // Re-check status when switching back to a playlist
    }
    settingsCardArea.hidden = true;

    if (!exerciseData[groupKey] || !exerciseData[groupKey][drillKey]) return;
    currentGroupKey = groupKey;
    currentDrillKey = drillKey;
    currentItemIndex = -1;
    renderPlaylist(groupKey, drillKey);
    loadItem(0, false);
  }

  // --- 5. EVENT LISTENERS ---
  playlistElement.addEventListener("click", function (event) {
    const clickedItem = event.target.closest(".playlist-item");
    if (clickedItem) {
      event.preventDefault();
      playItem(parseInt(clickedItem.dataset.index, 10));
    }
  });

  // PWA Install Banner Event Listeners
  pwaInstallBtn?.addEventListener("click", handleInstallPWA);
  pwaInstallClose?.addEventListener("click", () => {
    pwaInstallBanner?.classList.add("hidden");
  });

  player.on("loadedmetadata", function () {
    const drillData = exerciseData[currentGroupKey]?.[currentDrillKey];
    if (drillData?.type === "playlist" && currentItemIndex !== -1) {
      const durationElement =
        playlistElement.querySelectorAll(".item-duration")[currentItemIndex];
      if (durationElement && durationElement.textContent === "--:--") {
        durationElement.textContent = formatDuration(player.duration);
      }
    }
  });

  player.on("ended", function () {
    const drillData = exerciseData[currentGroupKey][currentDrillKey];
    if (drillData.type === "playlist") {
      const nextIndex =
        currentItemIndex + 1 < drillData.items.length
          ? currentItemIndex + 1
          : 0;
      playItem(nextIndex);
    }
  });

  player.on("timeupdate", function () {
    const drillData = exerciseData[currentGroupKey]?.[currentDrillKey];
    if (drillData?.type !== "chapters") return;
    const currentTime = player.currentTime;
    const activeChapter = drillData.items.find(
      (chap) => currentTime >= chap.startTime && currentTime < chap.endTime
    );
    let activeChapterIndex = activeChapter
      ? drillData.items.indexOf(activeChapter)
      : -1;
    if (activeChapterIndex !== -1 && activeChapterIndex !== currentItemIndex) {
      currentItemIndex = activeChapterIndex;
      updateActiveItemInPlaylist(activeChapterIndex);
    }
  });

  categorySelector.addEventListener("change", function () {
    const selectedOption = this.options[this.selectedIndex];
    if (selectedOption) {
      loadDrill(selectedOption.parentElement.label, selectedOption.value);
    }
  });


  downloadBtn.addEventListener("click", handleDownloadAll);
  installPwaBtn?.addEventListener("click", handleInstallPWA);

  // --- 6. OFFLINE & INITIALIZATION ---
  function handleCheckForUpdate() {
    // We'll show a simple alert, then re-initialize the app
    alert("Checking for updates...");
    init()
      .then(() => {
        alert("Update check complete. The app is now up-to-date.");
      })
      .catch((error) => {
        alert("Failed to check for updates. Please try again later.");
        console.error("Update check failed:", error);
      });
  }

  function handleInstallPWA() {
    // Check if we have a stored beforeinstallprompt event
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        // Clear the saved prompt since it can't be used again
        deferredPrompt = null;
        // Hide the banner after the prompt is shown
        pwaInstallBanner?.classList.add("hidden");
      });
    } else {
      // Provide instructions for manual installation
      alert("To install this app on your device:\n\n" +
            "1. On mobile: Look for the 'Add to Home Screen' option in your browser's menu\n" +
            "2. On desktop: Look for the install icon in the address bar or menu\n\n" +
            "This will allow you to use the app offline!");
    }
  }

  function showInstallBanner() {
    // Show the installation banner if it exists
    if (pwaInstallBanner) {
      pwaInstallBanner.hidden = false;
    }
  }

  async function handleStorageUsage() {
    try {
      // Calculate IndexedDB storage usage
      let indexedDBSize = 0;
      const cachedKeys = await dbManager.getAllVideoKeys();
      
      // Get size of each cached video
      for (const key of cachedKeys) {
        try {
          const videoBlob = await dbManager.getVideo(key);
          if (videoBlob) {
            indexedDBSize += videoBlob.size;
          }
        } catch (error) {
          console.error(`Error getting size for video ${key}:`, error);
        }
      }
      
      // Format bytes to human readable format
      function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }
      
      // Calculate cache storage usage
      let cacheStorageSize = 0;
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();
            for (const request of requests) {
              try {
                const response = await cache.match(request);
                if (response) {
                  const clonedResponse = response.clone();
                  const blob = await clonedResponse.blob();
                  cacheStorageSize += blob.size;
                }
              } catch (error) {
                console.error(`Error getting size for cache item:`, error);
              }
            }
          }
        } catch (error) {
          console.error('Error calculating cache storage size:', error);
        }
      }
      
      // Display storage information
      const totalSize = indexedDBSize + cacheStorageSize;
      alert(
        "Storage Usage:\n\n" +
        `Cached Videos: ${formatBytes(indexedDBSize)} (${cachedKeys.length} files)\n` +
        `App Cache: ${formatBytes(cacheStorageSize)}\n` +
        `Total: ${formatBytes(totalSize)}`
      );
    } catch (error) {
      console.error('Error calculating storage usage:', error);
      alert("Unable to calculate storage usage. Please try again later.");
    }
  }

  async function handleDownloadAll() {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Downloading...";
    downloadProgress.hidden = false;

    const cachedKeys = await dbManager.getAllVideoKeys();
    const urlsToDownload = allVideoUrls.filter(
      (url) => !cachedKeys.includes(url)
    );
    const totalVideos = urlsToDownload.length;
    let downloadedCount = 0;

    if (totalVideos === 0) {
      offlineMessage.textContent = "All videos are already downloaded.";
      downloadBtn.hidden = true;
      downloadProgress.hidden = true;
      return;
    }

    for (const url of urlsToDownload) {
      try {
        downloadedCount++;
        progressText.textContent = `Downloading... (${downloadedCount}/${totalVideos})`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}`);
        const blob = await response.blob();
        await dbManager.saveVideo(url, blob);
        const progressPercentage = (downloadedCount / totalVideos) * 100;
        progressBar.style.width = `${progressPercentage}%`;
      } catch (error) {
        console.error(`Failed to download ${url}:`, error);
        // Consider adding a UI indicator for failed downloads
      }
    }

    offlineMessage.textContent =
      "All videos are downloaded and available offline.";
    downloadBtn.hidden = true;
    downloadProgress.hidden = true;
  }

  async function checkOfflineStatus() {
    try {
      const cachedKeys = await dbManager.getAllVideoKeys();
      const urlsToDownload = allVideoUrls.filter(
        (url) => !cachedKeys.includes(url)
      );

      if (urlsToDownload.length > 0) {
        offlineMessage.textContent = `Download ${urlsToDownload.length} videos for full offline access.`;
        downloadBtn.hidden = false;
        downloadProgress.hidden = true;
      } else {
        offlineMessage.textContent = "All videos are available offline.";
        downloadBtn.hidden = true;
        downloadProgress.hidden = true;
      }
      offlineControls.hidden = false;
    } catch (error) {
      console.error("Could not check offline status:", error);
      offlineControls.hidden = true;
    }
  }

  async function init() {
    try {
      // Clear previous categories to prevent duplication on re-init
      categorySelector.innerHTML = "";

      const response = await fetch("data.json");
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      exerciseData = await response.json();
      allVideoUrls = getAllVideoUrls(exerciseData);

      // Add settings category
      const settingsOptgroup = document.createElement("optgroup");
      settingsOptgroup.label = "Settings";
      const settingsOption = document.createElement("option");
      settingsOption.value = "settings"; // A unique value for settings
      settingsOption.textContent = "General";
      settingsOptgroup.appendChild(settingsOption);
      categorySelector.appendChild(settingsOptgroup);

      const groupKeys = Object.keys(exerciseData);
      groupKeys.forEach((groupKey) => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = groupKey;
        const drillKeys = Object.keys(exerciseData[groupKey]);
        drillKeys.forEach((drillKey) => {
          const option = document.createElement("option");
          option.value = drillKey;
          option.textContent =
            exerciseData[groupKey][drillKey].playlistTitle || drillKey;
          optgroup.appendChild(option);
        });
        categorySelector.appendChild(optgroup);
      });

      if (categorySelector.options.length > 0) {
        let firstDrillOption = null;
        for (const option of categorySelector.options) {
          if (option.value !== "settings") {
            firstDrillOption = option;
            break;
          }
        }

        if (firstDrillOption) {
          categorySelector.value = firstDrillOption.value;
          loadDrill(
            firstDrillOption.parentElement.label,
            firstDrillOption.value
          );
        } else if (categorySelector.options[0]?.value === "settings") {
          // If only settings is available, load it
          loadDrill("Settings", "settings");
        } else {
          playlistTitle.textContent = "Playlist Empty";
        }
      } else {
        playlistTitle.textContent = "Playlist Empty";
      }

      if (isPWA()) {
        await checkOfflineStatus();
      }
      
      // Show install banner for browsers that support PWA but don't fire beforeinstallprompt
      // (e.g., Safari on iOS)
      if (!deferredPrompt && !isPWA()) {
        // Only show banner if we're not already in PWA mode and there's no deferred prompt
        // This is a simplified check - in a real app, you might want more sophisticated detection
        setTimeout(() => {
          if (!isPWA() && pwaInstallBanner) {
            pwaInstallBanner.hidden = false;
          }
        }, 3000); // Show after 3 seconds
      }
    } catch (error) {
      console.error("Could not load exercise data:", error);
      playlistTitle.textContent = "Error";
    }
  }

  init();
});
