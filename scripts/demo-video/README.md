# Demo video recorder

Re-records the demo against the live site. Needs Microsoft Edge, ffmpeg on PATH, and `playwright-core` (`npm i -g playwright-core` or install it next to these scripts).

1. Generate the narration WAVs (Windows SAPI voice) into `demo-video/audio` and `demo-video/narration.json`. The lines are in `docs/video-script.md`.
2. `node record-demo.mjs`: drives the live site in a headless browser, records `demo-video/raw/*.webm` and `timeline.json`.
3. `node assemble-demo.mjs`: cuts the AI and webhook waits, adds the narration, writes `demo-video/proofpay-demo.mp4` and `.srt`.

