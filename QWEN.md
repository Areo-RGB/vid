# Exercise Video Player - Project Context

## Project Overview

This is a Progressive Web App (PWA) for playing exercise training videos. The application provides a categorized playlist interface for viewing various exercise routines including agility drills, ball control, dribbling, flexibility exercises, and more. 

Key features include:
- Video playback with Plyr player
- Categorized playlists with chapters support
- Offline caching capabilities
- PWA installation support
- Responsive mobile-first design

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Video Player**: Plyr.js
- **Storage**: IndexedDB for offline video caching
- **Service Worker**: For PWA functionality and offline support
- **Build/Deployment**: Static site (no build process required)

## Project Structure

```
.
├── index.html          # Main HTML file
├── script.js           # Application logic
├── style.css           # Styling
├── data.json           # Exercise video data and playlists
├── manifest.json       # PWA manifest file
├── service-worker.js   # Service worker for offline support
├── icons/              # PWA icons
└── QWEN.md             # This file
```

## Core Functionality

### Video Playback
- Uses Plyr.js for video playback
- Supports two types of playlists:
  - `chapters`: Single video file with timed segments
  - `playlist`: Multiple video files
- Videos can be cached for offline viewing

### Data Structure
The `data.json` file contains categorized exercise videos:
- Top-level categories (e.g., "Agility & Speed", "Ball Control & Dribbling")
- Each category contains drills with:
  - `type`: Either "chapters" or "playlist"
  - `playlistTitle`: Display name
  - `videoUrl`: For chapters type
  - `items`: Array of video segments or files

### Offline Support
- Service worker caches core application files
- Videos can be downloaded and stored in IndexedDB
- "Cache All Videos" feature in settings
- Offline status detection and UI controls

### PWA Features
- Installable on mobile/desktop devices
- Works offline after initial load
- Splash screen during loading
- App-like experience with standalone display mode

## Development Workflow

### Running the Application
As a static site, simply open `index.html` in a browser or serve with any static file server:
```bash
# Using Python's built-in server
python -m http.server 8000

# Using Node's http-server (if installed)
npx http-server
```

### Key Components

1. **DOM Management**:
   - Category selector for navigation
   - Playlist display with thumbnail and duration
   - Video player with Plyr controls
   - Settings panel with caching options

2. **Data Management**:
   - `exerciseData`: Loaded from data.json
   - `dbManager`: Handles IndexedDB operations for video caching
   - URL management for video sources (network vs cached)

3. **UI Features**:
   - Splash screen during initial load
   - Active item highlighting in playlists
   - Progress indicators for downloads
   - Responsive design for mobile devices

## Recent Development

Recent commits show work on:
1. Replacing the video player with Plyr
2. Adding settings category with cache and update options
3. Implementing PWA installation functionality
4. Improving UI focus features (later reverted)

## Development Notes

- The application is designed as a static site with no build process
- All dependencies are loaded via CDN
- Videos are streamed from external sources
- IndexedDB is used for offline video storage
- The service worker handles caching of core application files