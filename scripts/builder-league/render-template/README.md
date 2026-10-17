# Year in Review video template

Used by [`render-year-video.ts`](../render-year-video.ts). The renderer leases a job from
`POST /api/v1/builder-admin/render-jobs/claim`, builds the cards, renders them, and uploads the result.

- `scene.html` is one 9:16 or 16:9 card in the dark observatory theme: an atlas plate with a roman
  numeral, a title, a caption and up to four facts. It needs no network and uses system font fallbacks,
  so a headless browser renders the same pixels on every run. Every placeholder is HTML-escaped before
  substitution.
- For each job the renderer writes a work directory with:
  - `scene-NN.html`: one file per card (an intro card, one card per shared scene, an outro card);
  - `composition.html`: every card as a `<section class="clip" data-start data-duration>` clip, for
    HTML-to-video tools such as HyperFrames;
  - `captions.srt`: one caption per card, muxed into the MP4 as a soft subtitle track;
  - `poster.png`: the intro card, the static fallback still.

Only the public, redacted review returned by the claim endpoint reaches this template: no RP, no score,
no private milestones or notes.

## Renderers

- Default (`chrome-ffmpeg`): headless Chrome screenshots each card, then ffmpeg builds the video with
  crossfades and the caption track. Needs `ffmpeg` and Chrome or Chromium on `PATH` (or `CHROME_PATH`).
- Custom: `--render-cmd "<command>"` runs any HTML-to-video tool. `{dir}` is replaced with the work
  directory and `{out}` with the MP4 path; the poster is still made with Chrome.

Total length is 30 to 60 seconds: each card lasts `clamp(45 s / cards, 4.5 s, 10 s)`.
