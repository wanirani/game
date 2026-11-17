export const meta = {
  name: 'v2-p1-story',
  description: 'P1 story data: dialogue, event sequences, people, items and chronicle text for the first release (staged outside src), with a node-tested runner, then adversarial proofreading and canon check',
  phases: [
    { title: 'Write', detail: 'STORY lane: data format, runner, first-release script' },
    { title: 'Review', detail: 'canon, cross-references, Korean proofreading' },
  ],
}

const COMMON = `
You are one lane of a multi-lane build of the 3D edition of a Korean action game (HTML5 Canvas + WebGL, ES modules). Repo: /home/user/game. Work directly in that tree. Other lanes work there at the same time (ENGINE in src/v2/game/, PROPS in src/v2/world/ and src/v2/env/). You do not edit anything under src/ at all.

WHERE YOU WRITE: tools/v2/story_stage/ (the staged copy of what will become src/v2/data/), docs/v2/DATA_FORMAT.md, tools/v2/story_*.mjs. Reason: the game's fonts are subset to the exact characters found under src/ and a font check fails when new characters appear there; story text brings new Hangul syllables. So the text is staged outside src/ and the main session moves the folder to src/v2/data/ and rebuilds the fonts in one step afterwards. Therefore: every module in the staged folder may import only from inside that folder (relative paths that still work after the move), no browser APIs, no Node APIs — plain ES modules of data plus one small pure runner.

READ FIRST: docs/v2/P1_CONTRACT.md (rules — binding), docs/v2/README.md §2 (owner decisions), docs/v2/GDD.md §1, §2 (the bell and time crossing rules), §5 (story), §6 (the seven hunters), §9.1 (the first two hours minute by minute) and §9.2 (scope of the first release), docs/v2/STORY_CANON.md (what is fixed), docs/v2/ENGINE_API.md §6 (how the game scene calls a story function: story(name, data, api) and the event names it raises), docs/v2/UI_API.md (dialogue box: showDialog shape, portraits, choices, banners, toasts, prompts), docs/v2/AREA_FORMAT.md and src/v2/world/eshville.js, graveyard.js (actors with talk keys, triggers with event names, interactables, exits and their locks, anchors — the hooks your events attach to), docs/v2/CAST_R1_PEOPLE.md (who has a 3D model and a portrait: assets/v2/char3d/<id>.glb, assets/v2/portraits/).

About the text. The whole game is in Korean; the owner is a Korean elementary-education official and reads carefully. Original story only — no names, lines or scenes taken from any existing game, film or book. Tone: dark fantasy told plainly and warmly, short spoken lines, no profanity, no gore described in detail (the game should be comfortable for a teenager). Each character keeps one way of speaking (speech level and habit words) from first line to last. Names of people, places, things and years must be written the same way everywhere (the two nights are 1797 = 오늘 밤 and 1697 = 그 밤; check every year and every weekday or date you mention against the canon). One dialogue page must fit the dialogue box: at most 2 lines of about 30 Hangul characters each per page; split longer speech into pages.

Hard rules: no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall. Never run tools/fonts/build_fonts.py without --check (and you do not need it: your text is not under src/). No paid generation. Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: work in small complete increments.
Final answer = your report (plain text, English, short Korean summary for the owner at the end).
`

const STORY = COMMON + `
YOUR LANE: STORY. Progress log: /tmp/claude-0/v2/story_progress.md. Time box: 110 minutes from start.

Deliver, in priority order:
1. docs/v2/DATA_FORMAT.md, first version within 20 minutes: the shape and key names of
   - people (id, display name, title, era(s), model id, portrait id, voice note = how they speak),
   - dialogue sets (talk key → pages: speaker, portrait, text, optional mood; optional two-way choice with result flags; variants selected by flags and by era),
   - event sequences (id, when = an ENGINE event name plus conditions on flags/area/era, steps = a small fixed vocabulary such as say, banner, toast, give, take, setFlag, unlockExit, lockExit, wakeGroup, spawn, moveActor, hideActor, showActor, camera, wait, sound, music, objective, save, gotoArea, bellCross; say what each step asks of the engine through the api object),
   - items and key things (id, name, one-line description, kind), objectives (short text shown under the section name),
   - chronicle entries (the in-game record of what changed between the two nights: id, title, body, unlock condition),
   - flags (name, meaning, who sets it, who reads it) and the save shape of story state.
   State exactly which api functions the runner needs from the game scene (name, arguments, what it must do, whether it is async) so the integration lane can supply them; mark each as "exists in ENGINE_API/UI_API" or "new".
2. The runner: tools/v2/story_stage/run.js exporting createStory(data, opts) → { story(name, data, api), state, save(), load(obj), talk(key, api), reset() }. story() is the function ENGINE_API §6 describes. Pure and deterministic; sequences are resumable (a say step waits until the dialogue closes); never throws on unknown names (reports through opts.warn). No per-frame work, no allocation when no event matches.
3. The script of the first release (GDD §9.1 and §9.2), complete enough to play from the first minute to the end of the first release in order: opening, every beat of the minute table, every person's talk lines in both eras (including what they say before and after each change the player makes across the two nights), tutorial prompts worded for touch buttons (the button names are 공격, 점프, 구르기, 솜씨, 종, 다음 적), the bell and first crossing, the three verbs of GDD §2.3 each taught once, the graveyard, the boss introduction and aftermath, objectives, item texts, chronicle entries, area and section banners, death and retry lines. Where an area is not built yet (see src/v2/world: built = eshville_now, eshville_past, graveyard_now, graveyard_past, slice0) still write the text and mark the event as waiting for that area.
4. A node test, tools/v2/story_check.mjs (no browser): loads the staged data, validates it against the format, cross-checks every reference (people ↔ models and portraits on disk, talk keys ↔ area actors, event conditions ↔ trigger/interact/exit ids in src/v2/world areas — import the world modules read-only, flags set before read, items given before taken, no orphan dialogue, no unreachable sequence), checks the page length rule, lists every distinct Hangul syllable used and which are NOT yet in the game fonts (read assets/fonts/fonts.json and the font files with python/fontTools if needed, or compare with the characters already under src/) so the main session knows the font cost, and plays the whole first release against a fake api from start to end in the order of the minute table, printing the transcript to /tmp/claude-0/v2/story/transcript.txt. It must exit 0 on the final tree.
5. A readable script for the owner: /tmp/claude-0/v2/story/script_owner.md — the transcript as a screenplay in Korean, grouped by the minute table, with the choices and what each changes.
Read your transcript aloud in your head as a player would hear it: cut every line that explains what the screen already shows, every repeated idea, every stiff written-style ending in spoken lines.
`

phase('Write')
const built = await agent(STORY, { label: 'STORY', phase: 'Write' })

phase('Review')
const REVIEW = COMMON + `
YOUR LANE: STORY-REVIEW — adversarially review the STORY lane's work and fix what you find in tools/v2/story_stage/, docs/v2/DATA_FORMAT.md and tools/v2/story_check.mjs. Progress log: /tmp/claude-0/v2/storyreview_progress.md. Time box: 50 minutes.

The STORY lane's report (null means the lane died — read /tmp/claude-0/v2/story_progress.md and the tree instead):
${String(built).slice(0, 14000)}

Do not trust the report. Do:
1. Run node tools/v2/story_check.mjs and report the exact result. Try to break the runner: unknown event names, events in the wrong order, the same event twice, save in the middle of a sequence then load and continue, a choice answered while another sequence waits, 10,000 unmatched events (must not allocate or slow down — measure).
2. Canon: read docs/v2/GDD.md §2, §5, §6, §9 and docs/v2/STORY_CANON.md, then the transcript. List every contradiction (who knows what and when, what the bell can and cannot do, what stays changed between the nights, ages, family ties, the years 1697 and 1797 and anything dated) and fix the text.
3. Korean proofreading of every line shown to the player, as a careful editor: spelling and spacing, typos, wrong or inconsistent names of people, places and things (make a name table and check every occurrence), each character's speech level consistent, missing or doubled words, awkward translated-sounding phrasing, year and date errors, lines too long for a page, button names that differ from 공격 · 점프 · 구르기 · 솜씨 · 종 · 다음 적. Fix them and list what you changed (before → after) in /tmp/claude-0/v2/story/review_changes.md.
4. Cross-references: every talk key, trigger event, interact id, exit id and actor id the story uses against src/v2/world (read-only) — list what the world must add or rename for the story to run (append a dated section to /tmp/claude-0/v2/requests.md), and what api functions are still "new" for the integration lane.
5. Play value: is anything in the first 15 minutes told instead of played? Is every tutorial line shown at the moment the player needs it and not before? Is there a stretch of more than about 6 dialogue pages without the player doing something? Cut or move.
6. Regenerate /tmp/claude-0/v2/story/transcript.txt and /tmp/claude-0/v2/story/script_owner.md from the final data. Report: number of dialogue pages, events, people, items, chronicle entries, distinct Hangul syllables and how many are new to the fonts.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL) with reasons, what you fixed, what is left, what the integration lane must supply, and a 3–4 sentence Korean summary for the owner.
`
const verdict = await agent(REVIEW, { label: 'STORY-REVIEW', phase: 'Review' })
return { story: built, verdict }
