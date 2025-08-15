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
  const videoTitleDisplay = document.getElementById("video-title-display");
  
  // Add event listener to hide splash screen on first video play
  videoPlayer.addEventListener('play', onFirstVideoPlay, { once: true });
  const playlistElement = document.getElementById("playlist-list");
  const playlistTitle = document.querySelector(".playlist-title");
  const categorySelector = document.getElementById("category-selector");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const videoWrapper = document.querySelector(".video-player-wrapper");
  // Offline UI Elements
  const offlineControls = document.getElementById("offline-controls");
  const offlineMessage = document.getElementById("offline-message");
  const downloadBtn = document.getElementById("download-videos-btn");
  const downloadProgress = document.getElementById("download-progress");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

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
  function showVideoTitle(title) {
    videoTitleDisplay.textContent = cleanTitle(title);
    videoTitleDisplay.classList.remove("fade-in-out");
    void videoTitleDisplay.offsetWidth;
    videoTitleDisplay.classList.add("fade-in-out");
  }

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
    showVideoTitle(itemData.title);

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

    const isSameVideo = videoPlayer.currentSrc === finalVideoSrc;
    if (!isSameVideo) {
      videoPlayer.src = finalVideoSrc;
    }

    if (drillData.type === "chapters") {
      videoPlayer.currentTime = itemData.startTime;
    } else if (isSameVideo) {
      videoPlayer.currentTime = 0;
    }

    if (shouldPlay) {
      videoPlayer
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

  videoPlayer.addEventListener("loadedmetadata", function () {
    const drillData = exerciseData[currentGroupKey]?.[currentDrillKey];
    if (drillData?.type === "playlist" && currentItemIndex !== -1) {
      const durationElement =
        playlistElement.querySelectorAll(".item-duration")[currentItemIndex];
      if (durationElement && durationElement.textContent === "--:--") {
        durationElement.textContent = formatDuration(videoPlayer.duration);
      }
    }
  });

  videoPlayer.addEventListener("ended", function () {
    const drillData = exerciseData[currentGroupKey][currentDrillKey];
    if (drillData.type === "playlist") {
      const nextIndex =
        currentItemIndex + 1 < drillData.items.length
          ? currentItemIndex + 1
          : 0;
      playItem(nextIndex);
    }
  });

  videoPlayer.addEventListener("timeupdate", function () {
    const drillData = exerciseData[currentGroupKey]?.[currentDrillKey];
    if (drillData?.type !== "chapters") return;
    const currentTime = videoPlayer.currentTime;
    const activeChapter = drillData.items.find(
      (chap) => currentTime >= chap.startTime && currentTime < chap.endTime
    );
    let activeChapterIndex = activeChapter
      ? drillData.items.indexOf(activeChapter)
      : -1;
    if (activeChapterIndex !== -1 && activeChapterIndex !== currentItemIndex) {
      currentItemIndex = activeChapterIndex;
      showVideoTitle(drillData.items[activeChapterIndex].title);
      updateActiveItemInPlaylist(activeChapterIndex);
    }
  });

  categorySelector.addEventListener("change", function () {
    const selectedOption = this.options[this.selectedIndex];
    if (selectedOption) {
      loadDrill(selectedOption.parentElement.label, selectedOption.value);
    }
  });

  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      videoWrapper
        .requestFullscreen()
        .catch((err) =>
          console.error(
            `Error attempting to enable full-screen mode: ${err.message} (${err.name})`
          )
        );
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      // Feature detection for Screen Orientation API
      if (window.screen && window.screen.orientation && typeof screen.orientation.lock === "function") {
        screen.orientation
          .lock("landscape")
          .catch((err) =>
            console.warn("Screen orientation lock failed:", err.message)
          );
      } else {
        // Fallback: try legacy vendor methods or inform user
        if (screen.lockOrientation) {
          screen.lockOrientation("landscape");
        } else if (screen.mozLockOrientation) {
          screen.mozLockOrientation("landscape");
        } else if (screen.msLockOrientation) {
          screen.msLockOrientation("landscape");
        } else {
          console.info("Screen orientation lock not supported in this browser");
        }
      }
    } else {
      // Feature detection for unlock as well
      if (window.screen && window.screen.orientation && typeof screen.orientation.unlock === "function") {
        screen.orientation.unlock();
      } else {
        // Fallback: try legacy vendor methods
        if (screen.unlockOrientation) {
          screen.unlockOrientation();
        } else if (screen.mozUnlockOrientation) {
          screen.mozUnlockOrientation();
        } else if (screen.msUnlockOrientation) {
          screen.msUnlockOrientation();
        }
      }
    }
  });

  downloadBtn.addEventListener("click", handleDownloadAll);

  // --- 6. OFFLINE & INITIALIZATION ---
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
      const response = await fetch("data.json");
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      exerciseData = await response.json();
      allVideoUrls = getAllVideoUrls(exerciseData);

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
        const firstOption = categorySelector.options[0];
        loadDrill(firstOption.parentElement.label, firstOption.value);
      } else {
        videoTitleDisplay.textContent = "No exercises found.";
        playlistTitle.textContent = "Playlist Empty";
      }

      if (isPWA()) {
        await checkOfflineStatus();
      }
    } catch (error) {
      console.error("Could not load exercise data:", error);
      videoTitleDisplay.textContent = "Error loading data.";
      playlistTitle.textContent = "Error";
    }
  }

  init();
});
