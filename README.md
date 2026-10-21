# LocalDub

Browser-only AI video dubbing. No server, no uploads, no quotas.

1. **Upload** any video/audio the browser can decode.
2. **Transcribe** with Whisper (tiny/base/small) via Transformers.js, on WebGPU with CPU fallback.
3. **Translate** with NLLB-200 (200 languages; add rows to `L` in `js/app.js`, or use "Other…").
4. **Voices & timing**: pitch-based speaker clustering with gender guess, emotion presets, system voices matched by gender, max speed-up, no-overlap scheduling (pause video or drift), background ducking.
5. **Export**: SRT/VTT, project JSON, or a dubbed video recorded from the tab.

## Run
Serve over HTTPS or localhost (modules, workers and WebGPU need it):
`python3 -m http.server 8080` then open http://localhost:8080. Or enable GitHub Pages on the repo root.
Models download from the Hugging Face CDN on first use and are cached.

## Limits
- Tab recording (`getDisplayMedia`) works on desktop Chrome/Edge. Phones: use "Play fullscreen" with the OS screen recorder, or export subtitles/JSON.
- Speaker detection is pitch-based, so similar voices may merge; fix per line.
- Dubbing uses the device's installed speech voices. Original speech is ducked, not separated from music.
- Long or very large files can exhaust phone memory during decode.
