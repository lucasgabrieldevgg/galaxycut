# GalaxyCut

<p align="center">
  <img src="docs/banner.png" alt="GalaxyCut — free video editor, right in your browser" width="720" />
</p>

**A free video editor that runs 100% in your browser** (and as a desktop app too). CapCut-style multi-track timeline, automatic karaoke captions with local Whisper, silence detector, voice recording, free music & SFX search — and **no watermark**.

- Web: **https://galaxycut.vercel.app**
- Releases (Linux AppImage + Windows installer): **https://github.com/lucasgabrieldevgg/galaxycut/releases**

## Why you'll like it

- Free, no account, no watermark, no subscription.
- Your files stay **on your device** — nothing is uploaded to any server.
- Automatic captions with **local AI** (Whisper runs on your own machine, in a background worker — the app never freezes, and you can cancel mid-run).
- Made for **game shorts** creators (9:16, 1:1 and 16:9, plus 4:5, 4:3, 3:2, 21:9 and more).
- Interface in **English, Portuguese and Spanish**.

## Features

- **Multi-track timeline** — video, audio and text; free dragging, cut at the playhead, trim edges, magnetic snapping, transitions and fades.
- **Multi-project library** — home screen with all your edits: create, rename, duplicate, delete. On the desktop app each edit lives in its own folder on disk, with configurable autosave (1–10 min) — crash-proof, and even Ctrl+Z survives a restart.
- **Visual editing, CapCut-style** — drag clips around the preview, scale from the corner handles, rotate with the top handle. Every control also works with numbers: steppers that auto-accelerate when held, always in sync with the sliders.
- **Silence detector** — finds the parts where nobody is talking and you choose: delete, silence, hide the scene, or **delete audio only** (video keeps playing, all silent audio is removed). Applies to every clip that uses the file.
- **Extract audio** — pulls a clip's audio out as its own WAV file, reusable anywhere.
- **Karaoke captions** — word-by-word transcription (local Whisper) with 8 CapCut-style presets; the spoken word pops on screen. Runs in multiple languages (Portuguese, English, Spanish, French, German, Italian, Japanese, Korean, Russian and more).
- **Audio enhancement** — one-click studio chain (noise cut + compressor + limiter).
- **Voice recording** — narration straight from the editor, with an OBS-style decibel meter.
- **Free stock search** — photos, videos, music and SFX from open banks (Openverse, Freesound, Wikimedia Commons, Internet Archive, Jamendo; Pexels and Pixabay with optional keys). Search in your language — translation is automatic. Plus **emoji stickers** you can drop straight onto the timeline.
- **Flexible export** — MP4 / WebM, animated **GIF**, audio-only **WAV** and single-frame **PNG**; from 240p up to 8K, 24–60 fps (defaults to 1080p/30). Vertical 1080p is a true 1080×1920. Subtitles export as `.srt`.
- **Update checker** — the app notices new versions, shows the changelog and asks before you download.
- **Editable shortcuts** — rebind keys in Settings → Shortcuts.

## Installation

### Web (recommended)

Open **https://galaxycut.vercel.app** in an up-to-date Chrome/Edge. Nothing to install.

### Linux (AppImage)

1. Download `GalaxyCut-<version>-x86_64.AppImage` from the [releases page](https://github.com/lucasgabrieldevgg/galaxycut/releases/latest).
2. Make it executable: `chmod +x GalaxyCut-*.AppImage`
3. Double-click it. Exported videos land in `~/Videos/GalaxyCut/` with unique names (`GalaxyCut_YYYY-MM-DD_HH-MM-SS.mp4`) — your other videos are never overwritten. Your projects live in `~/Documents/GalaxyCut/Projetos/`, one folder per edit.

### Windows

Download `GalaxyCut-Setup-<version>.exe` from the [releases](https://github.com/lucasgabrieldevgg/galaxycut/releases/latest) and install it.

## Development

```bash
npm ci
npm run dev          # editor at http://localhost:3000
npm run build        # static build in out/
npm run typecheck    # types
```

The app is 100% static (no server): host it on any CDN.

### Desktop app (Electron)

```bash
npm run build                                # generates out/
mkdir -p desktop/www && cp -r out/* desktop/www/
cd desktop && npm ci && npx electron .       # runs the app
npx electron-builder --linux AppImage        # builds the AppImage
npx electron-builder --win nsis              # builds the Windows installer
```

### Publishing a new version

1. Update `src/lib/editor/changelog.json` (version + items) and `package.json`'s `version`.
2. Commit to `main` (the site redeploys itself on Vercel).
3. `git tag vY.Z.K && git push origin vY.Z.K` — GitHub Actions builds the AppImage + Windows installer and creates the Release with the **full changelog in the release notes**, plus the `latest.json` the in-app update checker reads.

## Structure

```
src/app/                 Next.js app (single page, static export)
src/components/editor/   the whole editor (timeline, panels, home, dialogs)
src/lib/editor/          editor engine (state, playback, render, export, subtitles…)
desktop/                 Electron app (main process, preload, builder config)
scripts/                 build helpers (version sync, icon generator)
```

## Feedback

Found a bug or have an idea? Use the feedback button inside the editor (top bar). It tries to send **directly** (one click — no account needed): the `/api/feedback` serverless function turns it into a `feedback`-labeled issue in this repo. If one-click sending isn't configured, the dialog falls back to opening a pre-filled issue.

To enable one-click sending, the project owner sets a GitHub token as a Vercel env var (never exposed to the browser):

1. Create a fine-grained PAT with **Issues: Read and write** permission for this repo (GitHub → Settings → Developer settings).
2. Add it to the Vercel project: `vercel env add GITHUB_FEEDBACK_TOKEN production` (paste the token) and redeploy.

That's it — the token lives only on the server side.

## License

MIT — see [LICENSE](LICENSE).
