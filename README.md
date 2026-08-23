# KNA — Audio Analysis

KNA is a lightweight browser-based audio analysis app that helps you explore the feeling and energy of a track by turning audio into a visual color heatmap. Upload a song, voice note, or recording, and the app analyzes the sound in short chunks to surface a vibe profile based on loudness and tonal brightness.

This project is designed for public-facing demo use: you can drop in audio, preview it in-browser, and view a stylized analysis of the sound without any backend processing.

## What it does

- Upload audio files directly from your browser
- Supports common formats like MP3, WAV, M4A, FLAC, and OGG
- Shows waveform preview and file metadata
- Analyzes audio in 1-second chunks
- Maps each chunk to a color based on audio characteristics
- Displays a heatmap timeline and summary analytics
- Runs as a small Express app serving a modern frontend UI

## Why this project exists

The app treats audio like a visual signal. Instead of only listening, it interprets the sound's intensity and spectral character and translates that into a color-based “vibe” representation. It is a creative audio exploration tool and a simple prototype for audio-to-visual analysis.

## Live app flow

1. Open the app in a browser.
2. Drag and drop an audio file or click to browse.
3. Review the waveform and file details.
4. Start analysis.
5. View the heatmap, timeline, and summary information.

## Tech stack

- TypeScript
- Express.js
- Static frontend assets served from the app
- Web Audio API for decoding and analyzing audio in-browser
- Vanilla JavaScript for the UI and processing logic

## Getting started

### Prerequisites

- Node.js 18 or newer
- npm or pnpm

### Install dependencies

```bash
npm install
```

Or with pnpm:

```bash
pnpm install
```

### Run the app in development mode

```bash
npm run dev
```

Then open:

```text
http://localhost:3213
```

### Build for production

```bash
npm run build
```

## Project structure

```text
.
├── src/
│   ├── index.ts
│   ├── server.ts
│   └── public/
│       ├── index.html
│       ├── styles.css
│       └── js/
│           ├── app.js
│           ├── audio.js
│           └── colors.js
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

## Notes

- The app is intentionally lightweight and front-end focused.
- Audio analysis happens in the browser using the Web Audio API.
- Files larger than 50 MB are blocked by validation in the UI. -- you can tune them
- The server runs on port 3213 by default.

## License

This project is currently licensed under the MIT license.

## Contributing

Contributions are welcome. If you want to improve the analysis logic, UI, or project setup, feel free to open an issue or submit a pull request.
