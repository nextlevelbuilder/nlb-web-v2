---
name: nlb-course-video-publish
description: Internal NLB admin skill. Publish an NLB Weekly session recording as a paid course video on nextlevelbuilder.io — transcribe in 10-minute chunks, write the title and summary in the house style, upload signed-only to Cloudflare Stream, register, publish (creates the Polar product) and verify /courses.
user-invocable: true
when_to_use: "Use when an NLB admin wants to post new NLB Weekly recordings (record-YYMMDD.mp4) to the Courses page, or asks how to upload a course video."
category: internal-ops
keywords: [nextlevelbuilder, courses, nlb-weekly, cloudflare-stream, polar, upload, admin]
argument-hint: "<record-YYMMDD.mp4>... [--speaker <name>] [--staging]"
metadata:
  author: Next Level Builders
  version: "0.1.0"
  repository: "https://github.com/nextlevelbuilder/nlb-web-v2"
  internal: true
---

# NLB course video publish (`nlb-course-video-publish`)

Internal skill for NLB admins. It turns one or more NLB Weekly recordings into published course videos with the same conventions as the 40+ videos already on `/courses`. Background and the access model: [docs/courses.md](../../docs/courses.md).

## Requirements

- An **admin** API key for the target environment in `NLB_API_KEY` (production: the admin key from `.env`, loaded with `set -a; . ./.env; set +a` — never echo it, never pass it on a command line that is logged).
- `ffmpeg`, and optionally `multix` with `GEMINI_API_KEY`, for transcripts.
- Or the hosted MCP server connected with OAuth `mcp:write` as an admin: the `course_*` tools cover the same steps (see [docs/toolkits/mcp.md](../../docs/toolkits/mcp.md)).

## Conventions (match the existing catalogue)

| Field | Rule | Example |
|---|---|---|
| Week | Highest published `weekNumber` + 1, in recording-date order | `41`, `42`, `43` for 17/10, 24/10, 31/10 |
| Title | `NLB Weekly #<week>: <topic>`; topic in Vietnamese, short, names the main subject | `NLB Weekly #43: Grok bot và công ty một người` |
| Slug | ASCII of the title (the CLI derives it) | `nlb-weekly-43-grok-bot-va-cong-ty-mot-nguoi` |
| Description | 2–3 sentences of concrete content, then a blank line and `Diễn giả: <name> · YYYY-MM-DD` | see `nlb courses list --json` |
| Price | `900` (9 USD), `usd`, locale `vi`. Locked once published. | |
| Stream name | `<week> - <date> - <speaker> - <topic>` | |
| Playback | Signed-only. The CLI refuses to publish otherwise. | |

File names: keep `record-YYMMDD.mp4` so the date is inferred. One recording per session.

## Workflow

```text
[1. Inspect] -> [2. Transcribe in chunks] -> [3. Write title + summary] -> [4. Dry run] -> [5. Publish] -> [6. Verify]
```

Run steps 2–3 for every file while earlier uploads are processing; uploads and Stream encoding (~10–30 min for a 2 h session) are the slow part.

1. **Inspect**: `node packages/cli/bin/nlb.js courses list` (or `course_list_videos`) shows the next week number and the latest titles to imitate.
2. **Transcribe**: `npm run courses:transcribe -- <file>` writes 10-minute audio chunks and, with multix, one verbatim transcript per chunk under `.recordings/<name>/`.
3. **Write** the topic and summary from the chunk transcripts, not from a single whole-file AI summary.
   - Whole-file summaries of 90+ minute sessions drift and often stop half way. Read the transcript of the last chunks too.
   - Check every product or tool name against at least two chunks; when the audio is ambiguous (e.g. "Grok bot" vs "Grokbot"), say so in your report.
   - Speaker names with diacritics: Cường Võ, Duy Nguyễn, Việt Trần. Ask the user when the speaker is not obvious from the recording.
4. **Dry run**: `npm run courses:publish -- <file> --title "<topic>" --speaker "<name>" --description-file <summary.txt> --dry-run` prints the title, slug, URL and price without writing.
5. **Publish**: rerun without `--dry-run`. The command uploads with tus (resumable), waits for Stream, registers the draft and publishes. It is idempotent:
   - an already published slug is skipped;
   - if it stops after the upload, rerun with the printed `--stream-uid <uid>`;
   - a draft left by a failed run is refreshed instead of failing on `slug_taken`.
   Publish multiple recordings oldest first so week numbers follow the dates, or pass `--week`.
6. **Verify**: `/courses` and `/vi/courses` list the new videos; `nlb courses list` shows the duration and price. With a VIP account, the player loads.

Use `--url https://staging.nextlevelbuilder.io` with the staging admin key to rehearse.

## MCP path

`course_create_upload` → `nlb courses put <file> <uploadUrl>` (the agent cannot stream a multi-GB file through MCP) → `course_get_upload` until `ready` → `course_create_video` with `durationSec` → `course_publish_video`.

## Safety

- Publishing creates a real Polar product and is visible to everyone. Confirm titles and prices with the user before step 5 unless they already approved them.
- Do not edit D1 or Stream directly; if a fix needs that, ask the user and back up first.
- Never print or commit `.env*`, `.dev.vars`, API keys or the one-time upload URL.

## Report

For each video: slug, URL (`https://nextlevelbuilder.io/courses/<slug>`), price, duration, and any uncertain names.
