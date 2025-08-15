document.addEventListener("DOMContentLoaded", function () {
  // --- 1. DATA SOURCES ---
  let exerciseData = {}; // Data will be loaded from data.json

  // --- 2. DOM ELEMENT REFERENCES ---
  const videoPlayer = document.getElementById("main-video");
  const videoTitleDisplay = document.getElementById("video-title-display");
  const playlistElement = document.getElementById("playlist-list");
  const playlistTitle = document.querySelector(".playlist-title");
  const categorySelector = document.getElementById("category-selector");
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const videoWrapper = document.querySelector(".video-player-wrapper");

  let currentItemIndex = -1;
  let currentGroupKey = "";
  let currentDrillKey = "";

  // --- 3. HELPER FUNCTIONS ---
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
    // Remove leading numbers and underscores, remove file extension, and replace underscores with spaces
    return rawTitle
      .replace(/^\d+_+/, "")
      .replace(/\.mp4$/, "")
      .replace(/_/g, " ");
  }

  // --- 4. CORE FUNCTIONS ---
  function showVideoTitle(title) {
    videoTitleDisplay.textContent = cleanTitle(title);
    // Re-trigger CSS animation
    videoTitleDisplay.classList.remove("fade-in-out");
    void videoTitleDisplay.offsetWidth; // Force browser reflow
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
          </li>
      `;
    });
    playlistElement.innerHTML = playlistHTML;
  }

  function updateActiveItemInPlaylist(activeIndex) {
    const allItems = playlistElement.querySelectorAll(".playlist-item");
    allItems.forEach((item, index) => {
      if (index === activeIndex) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
    if (activeIndex > -1 && allItems[activeIndex]) {
      allItems[activeIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  /**
   * Loads a video item, with an option to play it.
   * @param {number} index - The index of the item in the current drill's items array.
   * @param {boolean} shouldPlay - If true, the video will play. If false, it will only load.
   */
  function loadItem(index, shouldPlay = false) {
    const drillData = exerciseData[currentGroupKey][currentDrillKey];
    if (!drillData || index < 0 || index >= drillData.items.length) return;

    const itemData = drillData.items[index];
    showVideoTitle(itemData.title);

    let videoSource = "";
    if (drillData.type === "playlist") {
      videoSource = itemData.url;
    } else {
      // Handles "chapters"
      videoSource = drillData.videoUrl;
    }

    const isSameVideo = videoPlayer.currentSrc === videoSource;

    // If it's a new video, set the source. This will implicitly reset currentTime.
    if (!isSameVideo) {
      videoPlayer.src = videoSource;
    }

    // Set the correct start time.
    // For chapters, it's the specific start time.
    // For playlists, if it's the same video, we must reset to 0.
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

  /**
   * Plays a specific item from the playlist.
   * @param {number} index - The index of the item to play.
   */
  function playItem(index) {
    loadItem(index, true);
  }

  function loadDrill(groupKey, drillKey) {
    if (!exerciseData[groupKey] || !exerciseData[groupKey][drillKey]) return;
    currentGroupKey = groupKey;
    currentDrillKey = drillKey;
    currentItemIndex = -1;
    renderPlaylist(groupKey, drillKey);
    // Load the first item without playing it
    loadItem(0, false);
  }

  // --- 5. EVENT LISTENERS ---
  playlistElement.addEventListener("click", function (event) {
    const clickedItem = event.target.closest(".playlist-item");
    if (clickedItem) {
      event.preventDefault();
      const index = parseInt(clickedItem.dataset.index, 10);
      playItem(index);
    }
  });

  videoPlayer.addEventListener("loadedmetadata", function () {
    const drillData = exerciseData[currentGroupKey]?.[currentDrillKey];
    if (drillData?.type === "playlist" && currentItemIndex !== -1) {
      const durationElement =
        playlistElement.querySelectorAll(".item-duration")[currentItemIndex];
      // Only update if it hasn't been set, to avoid fetching metadata repeatedly
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
          : 0; // Loop back to start
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

    let activeChapterIndex = -1;
    if (activeChapter) {
      activeChapterIndex = drillData.items.indexOf(activeChapter);
    }

    if (activeChapterIndex !== -1 && activeChapterIndex !== currentItemIndex) {
      currentItemIndex = activeChapterIndex;
      showVideoTitle(drillData.items[activeChapterIndex].title);
      updateActiveItemInPlaylist(activeChapterIndex);
    }
  });

  categorySelector.addEventListener("change", function () {
    const selectedOption = this.options[this.selectedIndex];
    if (selectedOption) {
      const drillKey = selectedOption.value;
      const groupKey = selectedOption.parentElement.label;
      loadDrill(groupKey, drillKey);
    }
  });

  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      videoWrapper.requestFullscreen().catch((err) => {
        console.error(
          `Error attempting to enable full-screen mode: ${err.message} (${err.name})`
        );
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      // Entered fullscreen, try to lock to landscape
      screen.orientation.lock("landscape").catch((err) => {
        // This might fail on desktop or if not permitted, which is fine.
        console.warn("Screen orientation lock failed:", err.message);
      });
    } else {
      // Exited fullscreen, unlock orientation
      screen.orientation.unlock();
    }
  });

  // --- 6. INITIALIZATION ---
  async function init() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      exerciseData = await response.json();

      // Populate category selector with optgroups
      const groupKeys = Object.keys(exerciseData).sort();
      groupKeys.forEach((groupKey) => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = groupKey;

        const drillKeys = Object.keys(exerciseData[groupKey]).sort();
        drillKeys.forEach((drillKey) => {
          const option = document.createElement("option");
          option.value = drillKey;
          option.textContent =
            exerciseData[groupKey][drillKey].playlistTitle || drillKey;
          optgroup.appendChild(option);
        });
        categorySelector.appendChild(optgroup);
      });

      // Load the first drill by default
      if (categorySelector.options.length > 0) {
        const firstOption = categorySelector.options[0];
        const drillKey = firstOption.value;
        const groupKey = firstOption.parentElement.label;
        loadDrill(groupKey, drillKey);
      } else {
        videoTitleDisplay.textContent = "No exercises found.";
        playlistTitle.textContent = "Playlist Empty";
      }
    } catch (error) {
      console.error("Could not load exercise data:", error);
      videoTitleDisplay.textContent = "Error loading data.";
      playlistTitle.textContent = "Error";
    }
  }

  init();
});
