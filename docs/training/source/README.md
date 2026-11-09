# Rebuilding the training decks

The two decks in `docs/training/` are generated from light-mode screenshots of the trial build.

1. Build the trial: `node demo/build.js`. Wrap the output in a full HTML document as `local.html`, next to `capture-screenshots.js`.
2. Capture the screenshots: `LANG=en_AU.UTF-8 node capture-screenshots.js`. They are written to `s2/`.
3. Crop the sidebar off the three admin shots. This gives `gm-sites-crop.png`, `gm-models-crop.png` and `gm-backups-crop.png`. Crop the left 21.5% and the top 8.5%. Then crop `gm-trends.png` to its top 47%, saved as `gm-trends-crop.png`.
4. Install the build tools: `npm i pptxgenjs sharp react react-dom react-icons`.
5. Build both decks: `SHOTS=s2 OUT=.. node build-decks.js`.

Both decks use Arial throughout, so they look the same in PowerPoint on Windows, Mac and iPad, and in Keynote. Speaker notes are on every slide.
