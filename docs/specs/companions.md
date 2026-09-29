# 동료 시스템 설계서 — 탈것(Mount) & 수호신(Guardian)

Spec for user request 4: *"탈 것(동물 등)이나 보조 수호신 등을 영입하면 타고 다니거나 나와 같이 다니면서 같이 공격해주는 게 있었으면 좋겠어"*.
Target: BLOOD NOCTURNE (pure Canvas + ES modules, 60 Hz fixed step, view height 540, TILE 48). Read together with `docs/ARCHITECTURE.md`.

Language rule: this document is English. **Every string the player sees is natural Korean** and is given verbatim here (implementers copy it; do not paraphrase into awkward Korean).

---

## 0. Design pillars

1. **Arcade feel, DNF-style punch.** Riding must *feel* fast and heavy: gallop ramp-up, hoof-beat SFX, dust, charge trample with hitstop, landing thud. Guardians visibly fight *with* you (assist follow-ups on your finishers, skill call-outs with portrait), not as invisible DPS.
2. **Zero soft-locks.** A mount can always be dismissed; the rider body is always smaller than the mounted body, so dismounting never embeds the player. Guardians have no collision and no HP. All failure paths degrade to "the mount goes away" and never to "player stuck".
3. **Contract-first & file ownership.** All companion logic lives in new files. Shared engine files receive only small, guarded hook lines (`this.mount?.…`, `world.companions?.…`) listed in §12.3. Those hooks are inserted first (WP C0) with stub modules so every later package can work in parallel.
4. **Same on keyboard, touch and gamepad.** Two new actions: `mount` (summon / dismount) and `guard` (guardian skill). Guardian skills can also fire automatically (default ON for touch devices).
5. **Scales with the hero.** Companion power is derived from the rider's current stats (ratio grows with companion level and bond), so late-joined companions stay relevant and early ones never become useless.

---

## 1. Roster

### 1.1 Mounts (탈것) — 6

| id | 이름 | 칭호 (title) | Role | How obtained | Chapter |
|---|---|---|---|---|---|
| `m_warhorse` | 그림메인 | 흑철 군마 | Balanced all-rounder, charge + rear-up stomp | Story: Greta gives it when the stable opens (first hub visit after clearing s01) | 1 |
| `m_boar` | 바르그 | 철엄니 멧돼지 | Tank, wall-breaking charge, super armor while charging | Stable shop, 6,000 G | 2 |
| `m_skelsteed` | 코슈타 | 망령 해골마 | Hazard walker (spikes/poison/blood), phase-through charge, ghost-fire trail | First kill of `b_dullahan` (s03) — the headless knight's steed | 3 |
| `m_direwolf` | 스콜 | 서리 늑대 | Fastest, double jump, wall-kick, frost howl | Quest `cq_skoll` 「늑대 왕의 시험」 (Greta) | 4 |
| `m_wyvern` | 이그니스 | 진홍 와이번 | Glide + 3 wing flaps, fire breath, air dive | Egg from first kill of `b_chimera` (s07) → hatches at the stable after 1 more stage clear | 7–8 |
| `m_giantbat` | 녹티스 | 거대 박쥐 | True flight with stamina, 8-way lunge, echolocation screech | All 5 Dracula relics collected (`progress.relics.length >= 5`) | ≈11 |

### 1.2 Guardians (수호신) — 8

| id | 이름 | 칭호 | Role | How obtained | Chapter |
|---|---|---|---|---|---|
| `g_fairy` | 루미 | 빛의 요정 | Healer / support: heal pulses, invincibility dome | First kill of `b_banshee` (s02) — freed from the banshee's lantern | 2 |
| `g_spiritwolf` | 하티 | 영혼 늑대 | Fast melee flanker, wolf-pack skill | Quest `cq_hati` 「묘지의 푸른 울음」 (Greta) | 2+ |
| `g_imp` | 핌 | 소악마 마법사 | Ranged fire caster, meteor rain | Stable shop «소악마 계약서» 7,500 G | 3 |
| `g_knight` | 가웨인 | 망령 기사 | Melee guard: blocks projectiles, shield-wall skill | First kill of `b_crimson` (s04) | 4 |
| `g_whelp` | 크론 | 새끼 본 드래곤 | Breath-cone crowd damage, orbiting bone storm | Egg from first kill of `b_bonedragon` (s05) → hatches after 1 more clear | 5–6 |
| `g_owl` | 미네르바 | 성스러운 올빼미 | Utility: **secret sight** (outlines breakable/fake walls), holy beam | First kill of `b_grimoire` (s06) | 6 |
| `g_clock` | 틱톡 | 태엽 인형 | Gear turret, **time stop** skill | First kill of `b_colossus` (s09) | 9 |
| `g_reaper` | 모르스 | 꼬마 사신 | Executioner (instantly reaps weak non-boss enemies), screen-wide scythe | First kill of `b_death` (s11) | 11 |

Loadout per hero: **1 mount + 1 guardian slot**; the **2nd guardian slot opens when `progress.chapter >= 8`** (Greta "expands the altar").

### 1.3 Unlock timeline (story order)

```
ch1  그림메인 (stable opens)          ch2  루미 (boss) · 바르그 (shop) · 하티 quest opens
ch3  코슈타 (boss) · 핌 (shop)         ch4  가웨인 (boss) · 스콜 quest opens
ch5  크론 egg → hatch                  ch6  미네르바 (boss)
ch7  이그니스 egg → hatch              ch8  2nd guardian slot
ch9  틱톡 (boss)                       ch11 모르스 (boss) · 녹티스 (5 relics; earliest at ch11)
```
Part 2 (s14–s20, other spec) may register extra companions later purely by adding rows to `src/data/companions.js` (obtain types `boss`/`clear`/`quest` are generic).

---

## 2. Acquisition, levels, bond

### 2.1 Obtain types (data field `obtain`)

| type | Fields | Trigger (runtime) | Retro-migration for existing saves |
|---|---|---|---|
| `flag` | `flag` | Unlocked when `progress.flags[flag]` becomes true. `m_warhorse` uses `flag:'stable_open'`, set by script `cmp_stable_open` | none (script plays on next hub visit if `chapter>=1`) |
| `boss` | `boss` | bus `bossKilled` with matching `bossId`, story mode only (`world.mode==='story'`, `!state.arcade`) | if `progress.bosses` includes boss → unlock + pending reveal |
| `egg` | `boss`, `hatchAfter:2` | bus `bossKilled` → create egg `{at: companions.clears}`; ready when `companions.clears - at >= 2` (the boss stage's own clear counts as 1); hatch by pressing 「부화시키기」 in the stable | if boss killed → egg with `at:-99` (ready) |
| `quest` | `quest` | bus `questClaimed` with matching `questId` | if `quests.done` includes quest → unlock |
| `shop` | `price`, `chapter` | Purchase in the stable (§7.3) | none |
| `relics` | `count` | Evaluated on `relicFound`, hub enter, migration: `progress.relics.length >= count`; plays `cmp_bat_arrive` before the reveal | yes |

`unlockCompanion(state, id, {source})` is idempotent; it sets the starting level (catch-up, §2.3), pushes `id` to `state.companions.pending` (join reveal queue), auto-equips into the **current hero's** empty slot, and emits bus `companionUnlocked {id, source}`. In-stage feedback on boss unlock: `game.toast('새 동료 합류 — 「코슈타」! 마을로 돌아가면 만날 수 있다', '#ffd070', 3.2)` (no banner: the STAGE CLEAR banner owns that slot). Egg: `game.toast('「본 드래곤의 알」을 손에 넣었다 — 영혼의 마구간에 맡기자', '#e8c872', 3.2)`.

### 2.2 New facility — 「영혼의 마구간」 (Stable of Souls), NPC 그레타

**Placement (no existing coordinate moves):** the town map is extended **eastward** from 84 to 96 columns. Everything west of x = 4032 is unchanged (the gate stays where it is; the stable stands *outside the east gate*, which is where medieval stables were).

`src/data/town.js` changes:
- `const W = 96;` (TOWN_W becomes 96).
- Row 8 markers: add `89: 'D'` (stable door) and `93: 'N'` (Greta). Row 9 stays `'%'.repeat(W)`.
- `rooms.town.doors` append `'scene:stable'` (7th D from the left). `rooms.town.npcs` append `'npc_greta'` (6th N).
- `BUILDINGS` append `{ id: 'stable', kind: 'stable', x0: 4100, x1: 4580, door: 89, scene: 'stable', name: '영혼의 마구간', eng: 'STABLE OF SOULS', desc: '탈것 · 수호신 · 공물' }`.
- `TOWN_LAMPS` append `4066`. `TOWN_PROPS` append `{ id: 'deco_village_haybale', fx: 4530, w: 96, h: 72 }, { id: 'deco_village_fence', fx: 4180, w: 180, h: 68 }`.
- `TOWN_NPCS.npc_greta = { name: '그레타', title: '영혼의 마구간지기', portrait: 'portraits/npc_greta', range: 80, speed: 36, idle: [2.5, 5], look: GRETA_LOOK }`.
- `TOWN_TALK.npc_greta = [{ who: 'npc_greta', text: '말이든 영혼이든, 먼저 믿어 줘야 너를 믿어. 공물은 그 첫걸음이지.' }]`.

`src/data/npcs.js` adds (and append to `NPC_ORDER`):
```js
npc_greta: {
  id: 'npc_greta', name: '그레타', title: '영혼의 마구간지기', portrait: 'portraits/npc_greta', role: 'stable', services: ['stable', 'quest'],
  desc: '불타 버린 에슈빌 외곽 목장의 주인. 짐승의 말과 죽은 이의 속삭임을 듣는다는 소문이 있다. 무뚝뚝하지만 동물 앞에서는 누구보다 다정하다.',
  appear: { minChapter: 1 },
  look: { build: 'broad', height: 1.0, skin: '#d8a888', hair: '#c8b8a0', hairStyle: 'braid', eyes: '#5a9ab0', outfit: 'villager',
    primary: '#4a3624', secondary: '#2a3a2e', trim: '#b89a60', pants: '#3a2a1a', boots: '#2a1a10', headgear: 'wide_hat', headColor: '#2a2018',
    scarf: { color: '#7a2a1a' }, fem: true },
},
```
Before chapter 1 the stable door opens the stable scene in "closed" mode: narrator line `'불에 그을린 빈 마구간이다. 곧 누군가 이곳을 찾아올 것만 같다.'` then pops.

**Facade** (`PAINT.stable` / `LIVE.stable` / `HEIGHT.stable = 330` in `facades.js`, same painterly style as the other buildings): timber barn with a steep slate gable roof, big double stable door (the `D`), three horse stalls with half-doors on the left (heads of *owned* mounts appear in stalls — LIVE layer, idle head bobs), hay loft opening with spilling straw, a stone **spirit altar** on the right: a ring of standing stones with candles and a floating soul-lantern (glow, LIVE flicker) where owned guardians' silhouettes hover faintly; paddock fence closing the east edge (x 4560–4608). Hanging sign `b._sign` with a horse-head icon (add `'horse'` to the sign icon switch). Lights: stall lantern (`b._lan`), altar candles (`b._altar = {x,y}` → `facadeLights` adds `Lg.add(x, y, 160, '#9fd8ff', 0.7)`).

**Hub hint marker:** when an egg is ready, a reveal is pending, or a Greta quest can be claimed, the stable door draws a pulsing `!` (use `this.boardInfo.stableNote` set in `hub.refreshBoard` via `companionHubNote(state)`).

### 2.3 Levels & EXP

- Level 1–30 (`CMP_MAX_LV = 30`). `cexpToNext(lv) = floor(40 * lv^1.6 + 40 * lv)` → Lv1 80, Lv5 725, Lv10 1 992, Lv15 3 646, Lv20 5 627, Lv25 7 898, Lv29 9 907 (≈119 k total).
- **Catch-up start level** on unlock: `clamp(round(maxHeroLevel * 0.7), 1, 25)`.
- EXP sources:
  - Guardians: **40 %** of every kill EXP the player receives while the guardian is equipped (in addition to, not taken from, the player).
  - Mount: **40 %** of kill EXP when the kill happens while riding (any killer), + **1 EXP per tile** travelled while riding (cap 300 per room load).
  - Boss defeated: every equipped companion gets **50 %** of the boss EXP.
  - Tribute at the stable (§7.3).
- Simulation (hero LV table from `data/quests.js`): a companion used from ch1 reaches ≈Lv 21 at ch12 and ≈Lv 26 after ch13; one joining at ch6 (start Lv 10) reaches ≈Lv 27. Lv 30 is a Part 2 / grind goal.
- Level-up feedback (in stage): small ring on the companion + `world.fx.text(x, y, 'Lv UP!', { color: '#ffe070', size: 16 })` + SFX `bond_up` at 0.6 volume; bus `companionLevelUp {id, level}`.

### 2.4 Bond (유대)

Points per companion (`owned[id].bond`, 0–200). Ranks at `BOND_RANKS = [0, 15, 40, 80, 130, 200]` (rank 0–5, shown as 5 hearts).

| Source | Points |
|---|---|
| Stage cleared with it equipped | +6 |
| Boss defeated with it equipped (any, incl. replays) | +10 |
| Tribute at the stable (max once per companion per stage-clear cycle) | +8 |
| Every 50 kills while equipped (cap 5 per stage) | +1 |

| Rank | 이름 | Perk |
|---|---|---|
| 1 | 신뢰 | Active skill / mount special **+25 % power** |
| 2 | 교감 | Guardian aura ×1.5 / mount ride-bonus ×1.5 |
| 3 | 공명 | **Resonance**: joins the hero's ultimate (§4.7); assist cooldown 2.5 s → 1.8 s |
| 4 | 각성 | Awakened look (palette variant + extra FX, §11) ; mount charge CD −30 % ; guardian attack interval −15 % ; skill power total +50 % |
| 5 | 영혼 결속 | Guardian skill CD −20 % ; mount: once per stage a lethal knock-off is prevented (mount stays at 1 HP, 3 s invulnerable, line `'버텨라, 그림메인!'` via `fx.text`) |

Bus `bondUp {id, rank}`; toast `「루미」와의 유대가 깊어졌다 — 공명` (rank name).

### 2.5 Guardian slots
`guardianSlots(state) = state.progress.chapter >= 8 ? 2 : 1`. Two guardians may not be the same id. Slot 2 shows a lock with `'8장 클리어 시 개방'`.

---

## 3. Mount gameplay

### 3.1 State machine (`MountRider.state`)

```
stowed ──R (fits)──► summoning (0.45 s, invuln) ──► riding
riding ──R──► dismounting (0.30 s) ──► stowed   (re-summon cooldown 2 s)
riding ──mount HP 0──► knocked → recall (cooldown def.recall s, mount flees as MountGhost entity)
riding ──ultimate──► 'ult' stowed (no cooldown) ──auto after 1.4 s if on ground & fits──► summoning
riding ──fall in pit / player death──► recall (fall) / stowed with cd 0 (death)
riding ──room load doesn't fit / forced──► stowed (cd 0), toast
```
Only `summoning` and `riding` count as "mounted" (`get riding()` true from the moment the rider lands in the saddle, i.e. after 0.25 s of summoning).

### 3.2 Summon / dismount rules

- Input `mount` (pressed) toggles. Refused (SFX `menu_cancel` at 0.4 vol + toast) when: dead, `world.cutscene`, hurt-stun (`hurtT>0`), inside a move whose `cancel` time not reached, `world.inputLock`, recall cooldown > 0 (`'그림메인이 아직 돌아오지 않았다 (12초)'`), boss with `noMount` active (`'이 싸움에는 탈것이 겁을 먹었다'`), or no mount equipped (`'장착한 탈것이 없다 — 메뉴 › 동료'`).
- Ground mounts require `onGround`; flying mounts (`flight` not null) may be summoned in the air (the mount swoops in from above-behind and catches the rider).
- **Fit test** (must pass before summoning, and every frame while riding):
```js
function fits(map, x, y, w, h) {           // AABB vs SOLID/BREAK tiles only
  const l = Math.floor(x / TILE), r = Math.floor((x + w - 0.01) / TILE);
  const t = Math.floor(y / TILE), b = Math.floor((y + h - 0.01) / TILE);
  for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) if (isSolidType(map.typeAt(tx, ty))) return false;
  return true;
}
function findMountSpot(p, W, H, map) {    // keep feet (cx,bottom); nudge sideways up to 32 px
  for (const dx of [0, -8, 8, -16, 16, -24, 24, -32, 32]) {
    const x = p.cx + dx - W / 2, y = p.bottom - H;
    if (fits(map, x, y, W, H)) return { x, y };
  }
  return null;
}
```
  Failure → toast `'여기서는 탈것을 부를 수 없다'`.
- While riding, if `!fits(body)` (e.g. a skill moved the body into a wall): try `findMountSpot`; if null → `dismount('forced')` with toast `'공간이 좁아 탈것을 돌려보냈다'`. The rider body (≤ 36×88) always fits inside the mounted body's footprint, so this cannot embed the player.
- Body swap keeps feet-center: `const cx = p.cx, b = p.bottom; p.w = W; p.h = H; p.cx = cx; p.bottom = b;` (Entity setters). Reverse on dismount with `ch.size`.
- Summon FX: crimson summoning circle under the feet (`fx.ring` ×2, glyph particles `magic` #ff3a50), the mount materialises from red mist behind the player (alpha 0→1, scale 0.9→1 over 0.3 s), rider hops into the saddle (0.25 s arc), `dust` burst 14, `camera.shake(2, 0.15)`, SFX `summon` then the mount's cry (`neigh`, `boar_grunt`, …). Toast only the first time per stage: `'그림메인에 올라탔다!'`.
- Dismount FX: rider hops back (`vy = -380`, `vx = -facing*120`), mount rears and dissolves into mist (`smoke` + `dark` particles), SFX `dismiss`.

### 3.3 Body, hurtbox, seat, auto-duck

Per-mount `body {w,h}` (collision AABB while riding) — **h ≤ 90 so every 2-tile (96 px) corridor the player can use stays passable**. Width 56–70 means 1-tile-wide vertical shafts need dismounting (acceptable; dismount is always possible).

- `seat {x, y}`: saddle point relative to the mount's feet-centre (facing right, y up negative). The rider's pelvis sits there. Final per-frame seat = data seat + rig bob/pitch offset (from `mountPose`, §11.1).
- `footY`: stirrup depth below the pelvis (rider feet target).
- **Hurtbox while riding** = union of the mount body rect (`{x: p.x+4, y: p.bottom-bodyH+6, w: p.w-8, h: bodyH-6}`) and the rider torso rect (`{x: seatX-12, y: seatY-48+20*duck, w: 24, h: 48-20*duck}`), returned as one rect.
- **Auto-duck:** if any SOLID tile lies within 14 px above the body top across its width, `duck` eases to 1 (8/s), else to 0. Rider leans forward (hero `p.ride.duck`), hurtbox top lowers by 20 px. Pure visual + hurtbox; collision body unchanged.

### 3.4 Movement parameters (Lv 1; see §9 for growth)

`MountRider.profile(p)` replaces the rider's `ch.move` values while riding. Speed multiplier = `(1 + 0.005*(lv-1)) * (1 + 0.5 * stats.moveSpd/100)` (the rider's move-speed stat counts half).

| id | body w×h | seat x,y | footY | speed | accel | decel | air accel | jump | airJumps | extras |
|---|---|---|---|---|---|---|---|---|---|---|
| m_warhorse | 60×90 | −4, −56 | 26 | 400 | 1500 | 2000 | 1200 | 820 | 0 | gallop ramp 0.35 s |
| m_boar | 64×80 | −6, −48 | 20 | 350 | 2600 | 2600 | 1100 | 700 | 0 | — |
| m_skelsteed | 58×88 | −4, −54 | 26 | 420 | 2000 | 2200 | 1300 | 800 | 1 | 2nd jump = 유령 도약 (blue flame ring) |
| m_direwolf | 56×78 | −2, −44 | 16 | 480 | 3400 | 3000 | 2000 | 880 | 1 | `wallJump: true` |
| m_wyvern | 66×90 | −10, −58 | 24 | 330 | 2000 | 2000 | 1600 | 760 | 0 | `flight: glide` |
| m_giantbat | 70×84 | −4, −52 | 22 | 300 (ground) / 400 (air) | 1800 / 2600 | 2000 | 2600 | 700 | 0 | `flight: fly` |

- **Gallop ramp (arcade feel):** holding a direction for `gallopAfter` (0.35 s) at ≥ 85 % speed switches anim `walk`→`run` (gallop): +6 % speed bonus, speed-line particles every 0.05 s behind the rider (`fx.emit('dust'...)`), hoof SFX cadence doubles. Releasing direction: skid with dust (`decel`), turning around at > 60 % speed plays `turn` (0.18 s, mount pivots, rider leans back).
- **Attacking while riding** does not stop the mount: horizontal control continues at 70 % speed (`canMove` semantics, §3.6).
- **Landing impact:** landing with `vyBefore > 700` → `camera.shake(3, 0.15)`, dust ring, SFX `hoof_land`; enemies within 70 px of the feet take `mv 0.4` phys, kb `[180,-260]`, `tags:['mount']`, hitId per landing.

### 3.5 Jump, flight, glide, swim, wall-kick (`MountRider.handleJump`)

- Standard mounts: ground jump `vy = -jump`; variable height as the player (release → `vy *= 0.5`); `airJumps` resets on ground; one-way drop-through (↓+jump) works as for the player.
- **Glide (wyvern)** `flight: { type: 'glide', flaps: 3, flapVy: -620, glideFall: 150, glideSpeed: 400 }`: in the air, pressing jump with flaps left → `vy = flapVy`, anim `flap`, SFX `wing_flap`, small dust ring below; **holding** jump while falling → `maxFall = glideFall`, horizontal cap `glideSpeed`, anim `glide`. Flaps reset on landing.
- **Fly (giant bat)** `flight: { type: 'fly', stamina: 3.0, ascend: -380, hoverFall: 110, regen: 1.5, airSpeed: 400, dive: 700 }`: on ground, jump = takeoff (`vy=-420`). In air: holding jump → `vy` approaches `ascend` (accel 2400) while `stamina -= dt`; not holding → hover (`maxFall = hoverFall`); ↓+jump → dive (`vy = dive`). Stamina regenerates `regen`/s only when grounded. At 0 stamina the bat can only hover-descend. Stamina arc shown on the HUD widget.
- **Room ceiling clamp for flyers:** if `!room.exitUp` and `p.y < 4` → `p.y = 4; p.vy = max(p.vy, 0)` (prevents leaving the camera bounds).
- **Swim:** in `water` liquid: speed ×0.6, `maxFall = 180`, jump allowed anytime (`vy=-520`, anim `swim`), splash FX every 0.4 s while moving. Flying mounts that are airborne are unaffected.
- **Wall-kick (dire wolf):** same rule as the player's `wallJump` using the mounted body (`hitWall`), `vx = dir*460`, `vy = -jump*0.9`.

### 3.6 Combat while riding

Allowed rider actions: ground combo (`ms.ground`), air combo (`ms.air`), `ms.up`, charge attack (hold), sub-weapon, skills, command techniques, ultimate (§3.6.4). **Not** available: `ms.crouch`, `ms.down` (plunge/dive-kick), `ms.dash` (replaced by the mount charge), wall-slide (unless `wallJump`).

**3.6.1 `adaptMove(mv)`** (cached per move object in a `WeakMap`): shallow copy without `lunge, vx, vy, pogo, groundPound, airStall, recoil, recoilY`, with `canMove: true`. `startMove` uses the adapted move when riding, so the mount never gets launched or stalled by rider moves. Renderer still sees the same `anim`/`box`.

**3.6.2 Hitbox lift.** Rider attack rects are computed from the feet, but the rider sits higher. `riderLift() = { dx: seatX_facing, dy: seatY + 41 }` (e.g. warhorse −4, −15). `Player.updateMove` uses `this.relRect(b.x + L.dx, b.y + L.dy, w, b.h)`; `fireMoveProjectiles` adds `L.dy` to `oy` and `L.dx*facing` to `ox`. Mounted **reach bonus +15 %** (height advantage) applied to `w` like the `reach` stat.

**3.6.3 Input mapping while riding** (in `handleAttackInput`, after command-technique checks):
- `dash` pressed → `mount.tryCharge(world, p, ax, ay)` (replaces the dash branch; ignores `dashCool`).
- `down` held + `attack` → `mount.trySpecial(world, p)`; if the special is on cooldown, fall through to the normal ground/air combo (never a dead input).
- Otherwise normal rider attacks per the allowed list.

**3.6.4 Skills / techniques / ultimate.**
- `castUltimate`: always `mount.dismount('ult')` first (rider leaps off, mount fades to 30 % and waits off-screen), ultimate plays normally; 1.4 s later, if on ground and `findMountSpot` succeeds, auto-summon with no cooldown (`'ult'` state). Rationale: ULT code moves/teleports the player freely.
- `castSkill`/`castTechnique`: allowed mounted. Skills that assign `p.x/p.y` or set `p.hidden` (teleports/shadow steps) are listed in `DISMOUNT_SKILLS` in `mount.js` — WP C2 builds the list by grepping `src/game/skills.js` for `p.x =`, `p.y =`, `p.hidden =` (currently around lines 1700 and 2436) and for `p.vy = -9xx`/`-1xxx` launches (≈1600, 2357); those auto-dismount like the ultimate (auto-remount 1.2 s later). All other skills keep the mount; the per-frame fit check (§3.2) catches anything else.

**3.6.5 Charge (돌진) — `tryCharge`**: sets `chargeT = charge.dur`, `p.vx = facing*charge.speed` each frame (flyers: direction from `ax, ay`, see table), mount anim `charge`, rider anim `ride_charge`, invuln for `charge.iframes` via `mount.invulnT` (no blink), afterimage ghosts every 0.04 s (`mount.ghost`), speed lines, SFX `charge.sfx`. Every frame of the charge: `playerStrike(world, frontRect, attack)` where `frontRect = p.relRect(body.w*0.1, -body.h*0.9, body.w*0.6 + 30, body.h*0.8)` and attack = `{ owner: p, team: 'player', stats: mount.atkStats, mv, type, element, dir: facing, kb, launch, stun: 0.4, hitstop: 0.04, shake: 2, hitId: 'chg'+n, tags: ['mount','melee'], breakWalls }`. Hitting a wall mid-charge (`hitWall`) → stop, `camera.shake(4,0.15)`, mount stagger 0.3 s (boar: walls of type BREAK are broken by the strike first and the charge continues).

**3.6.6 Special (↓+공격) — `trySpecial`**: one per mount (table §3.9), cooldown per mount, shows its Korean name via `world.fx.text(p.cx, p.y-30, name, { color, size: 24, life: 1.1, vy: -60, outline: '#1a0610' })` (same style as technique names), `camera.punchZoom(1.03, 0.2)`.

### 3.7 Damage model

`MountRider.incoming(p, dmg, attack, world)` is called (through `CompanionSystem.incoming`, hook §12.3-12) at the top of `Player.takeHit` (after the invuln check and the Lia evade roll) while riding:

```js
let taken = def.taken * (attack.owner?.kind === 'boss' ? 1.3 : 1);      // bosses terrify animals
const toMount = Math.round(dmg * def.absorb * taken), toRider = Math.round(dmg * (1 - def.absorb));
mount.hp -= toMount;                                                   // flash mount, SFX mount cry (hurt pitch)
const heavy = toMount >= def.armor * mount.maxHp || (attack.kb?.[0] ?? 0) >= 420;
if (mount.hp <= 0) { if (rank5 && !usedThisStage) { mount.hp = 1; invulnT = 3; } else knockOff(world, p, 'hp'); }
return { dmg: toRider, noStagger: !heavy && mount.hp > 0 };
```
- `noStagger` (super armor): Player skips `hurtT`, move cancel and knockback; `iframes = 0.6`; rider flashes only.
- Heavy hit: `hurtT = 0.2`, knockback ×0.5, `iframes = 1.0`, mount anim `hurt`.
- **Knock-off:** rider thrown (`vy=-560`, `vx = away*260`, `iframes 1.2`, anim `hurt`), a transient `MountGhost` entity plays `knocked` (stumble 0.4 s) then flees horizontally at 500 px/s fading over 1.2 s; SFX `knock_off`; state `recall` with cooldown `def.recall * (1 - 0.01*(lv-1))`. Toast `'그림메인이 쓰러졌다! (재소환 18초)'`.
- Mount HP persists for the stage run (`world.run.mountHp[id]`); **full at stage start**, regenerates 3 %/s while not ridden; food pickups heal the mount by the same fraction as the rider; save points and goddess statues heal it fully. Death/respawn: mount stowed with cd 0 and full HP.

**Hazards while riding** (`mount.hazard(kind, p, world)` returns true if handled; the Player skips its own hazard damage):
| Hazard | Default | Exceptions |
|---|---|---|
| Spikes | mount takes 15 % mount max HP, `vy=-560`, iframes 0.8 | skelsteed immune; boar half |
| Lava / poison / blood liquid | mount takes 12 % mount max HP per contact (iframes 0.8) | skelsteed immune to poison & blood, half lava; wyvern immune to lava; airborne flyers untouched |
| Water | swim rules §3.5 | — |
| Pit fall (`onPlayerFell`) | `knockOff('fall')` (recall cooldown) **before** the world resets position; the rider then takes the normal fall damage | — |

### 3.8 Rooms, bosses, cutscenes, town, arcade

- **Room change** while riding: riding state persists (`run` object). After `loadRoom` places the player, `companions.onRoomLoaded` re-applies the mounted body at the start marker via `findMountSpot`; failure → stow (cd 0) + toast `'공간이 좁아 탈것을 돌려보냈다'`.
- **Doors / NPC talk / save coffins / chests** work unchanged (they use `p.cx`/`p.bottom` and `up`).
- **Boss arenas:** riding allowed by default. Boss defs may set `noMount: true` (boss-redesign spec owns `data/bosses_*.js`; default list empty; QA may add). On `startBoss`, if `noMount`: dismount (`'boss'`) with line `'그림메인이 겁에 질려 물러섰다'`, summon disabled until the boss dies. Arena clamping uses the body AABB (already generic).
- **Cutscenes / boss intro / dialogue:** `world.cutscene` → input null → mount idles (anim `idle`), guardians idle at anchors.
- **Town hub:** riding allowed (showing off the mount). `guard` is added to the hub's `NO_COMBAT` list; guardians follow and emote but never attack. Mount charge/special are disabled in town (`world.mode==='town'`).
- **Arcade modes** (boss rush / survival / practice): `state.arcade` temp state has no companions → system inactive. Optional stretch (WP C7b): `buildArcadeState` grants loaners by preset (preset ≥2: 그림메인 + 루미 at preset level; preset 3: any two guardians).

### 3.9 Per-mount abilities (Lv 1 values; "power" = `rider max(atk,mag) * trampleRatio(lv)`)

| id | 돌진 (charge, `dash`) | 특수기 (↓+공격) | Ride bonus (while riding) | Passive |
|---|---|---|---|---|
| m_warhorse | **돌진** dur 0.36, 780 px/s, mv 1.1 phys, kb [420,−260], launch, cd 0.7, iframes 0.2, breaks walls | **앞발 강타**: rear-up 0.3 s (invuln 0.3) then stomp: rect `cx±180, bottom−64, h 64`, mv 1.6, launch, kb [360,−520], hitstop 0.08, shake 8, shards+dust ring; cd 4 | `dmgReduce +5` | light-hit super armor (armor 0.10) |
| m_boar | **철엄니 돌격** dur 0.5, 820 px/s, mv 1.4, kb [520,−200], cd 1.0, iframes 0.15, **super armor during charge** (all hits `noStagger`), breaks walls | **땅 파헤치기**: 3 rocks thrown in arcs (vx 360/460/560, vy −520/−450/−380, `behavior:'arc'`, collide 'land'), mv 0.9 each, burst r 30 mv 0.5 on landing; cd 5 | `dmgReduce +8` | armor 0.16; spikes half |
| m_skelsteed | **망령 질주** dur 0.3, 900 px/s, mv 0.9 dark, full invuln 0.3, passes through enemies; leaves ghost-fire trail `Hitbox` 1.2 s, mv 0.35 dark, rehit 0.25; cd 0.8 | **저승 사슬**: chain pillars erupt at 70/150/230 px ahead (staggered 0.08 s), each Hitbox 44×160 for 0.5 s, mv 0.8 dark, stun 1.2; cd 6 | `dark +15` | hazard immunity (§3.7); blue flame hoofprints |
| m_direwolf | **송곳니 돌진** lunge-bite dur 0.26, 860 px/s, mv 1.2 ice, stun 0.5, cd 0.6, iframes 0.15 | **서리 포효**: ring r 260 around the wolf, mv 0.8 ice, stun 1.0; grants rider `atkSpd +15` for 5 s (companion-side timer, not `p.buffs`); cd 7 | `crit +8, ice +15` | wall-kick; double jump |
| m_wyvern | ground: **날개 돌진** dur 0.3, 700 px/s, mv 1.0 fire; air: **급강하** dive at 50° down 900 px/s until landing (max 0.6 s), mv 1.5 fire, landing shockwave r 120 mv 0.8; cd 1.0 | **화염 숨결**: 1.0 s cone Hitbox 220×80 following the mouth, rehit 0.12, mv 0.35 fire (≈2.9 total), usable in the air (vy clamped ≤ 60 while breathing); cd 6 | `fire +20, resFire +30` | lava immune; glide |
| m_giantbat | **흡혈 급습** 8-direction dash (from `ax, ay`, default forward) dur 0.32, 880 px/s, mv 1.1 dark, heals the mount 20 % of damage dealt, iframes 0.2, cd 0.8 | **초음파**: cone rect 360×160 ahead, mv 0.6 dark, stun 1.2, **reveals secrets within 5 tiles for 4 s** (same outline FX as the owl); usable in air; cd 8 | `lifesteal +3` | true flight (stamina) |

Mount stats for HP: `maxHp = riderMaxHp * hp * (1 + 0.02*(lv-1)) * (1 + 0.05*rank)`.

| id | hp ratio | absorb | taken | armor | recall (s) |
|---|---|---|---|---|---|
| m_warhorse | 0.90 | 0.70 | 1.00 | 0.10 | 20 |
| m_boar | 1.30 | 0.80 | 0.85 | 0.16 | 16 |
| m_skelsteed | 0.80 | 0.70 | 1.00 | 0.10 | 18 |
| m_direwolf | 0.70 | 0.60 | 1.10 | 0.06 | 14 |
| m_wyvern | 1.00 | 0.70 | 1.00 | 0.12 | 22 |
| m_giantbat | 0.75 | 0.60 | 1.15 | 0.06 | 24 |

---

## 4. Guardian gameplay

### 4.1 Entity model

`class Guardian extends Entity` (`src/game/guardian.js`), `kind = 'companion'`. Not in `world.hittables()` / `world.enemies()` → **invulnerable; enemies never target it**. No tile collision (spirits pass through walls — lore: 영체). `z = def.front ? 11 : 9` (player is 10). Sizes from data (used for culling/lights only). Removed and re-created by `CompanionSystem` on every room load and loadout change.

Guardians react to the player being hit: 0.3 s flinch (anim `hurt`, pause attacking). Player dead: guardians fade to 30 % alpha and gather above the body; on respawn they poof to their anchors.

### 4.2 Following, leash, teleport, perch

- **Anchor** (world): `ax = p.cx - p.facing * anchor.dx`, `ay = p.bottom + anchor.dy + sin(t*2.2+seed)*4` (flyers). Ground types (`move: 'ground'`: knight, spirit wolf) use `ay = lastGroundBottom(p)` and hop visually when the player jumps. Two guardians: the second uses `anchor.dx + 34`, phase-shifted bob.
- Motion: critically damped spring toward the target point (anchor while following, strike point while attacking): `k = 40, c = 12.6; v += ((T - pos)*k - v*c)*dt`, clamp |v| ≤ `def.speed`. Facing = sign of v (or toward target).
- **Leash:** while engaging, a guardian may roam up to `leash` (560 px) from the player; beyond → drop target. **Teleport** when the distance to the anchor exceeds 620 px or |dy| > 420 (after room teleports, fast falls): dissolve FX at old spot, reappear at anchor with `magic` burst (their colour), 0.25 s fade-in, SFX `summon` at 0.3 vol.
- **Perch:** owl (and fairy on the rider's head) perch after 3 s of player idle on ground: anchor = shoulder point `(p.cx - facing*6, p.bottom - p.h*0.78)` (riding: rider seat −30 px). Leave the perch instantly when combat starts.

### 4.3 Target selection (every 0.35 s, or immediately when the target dies)

```js
candidates = world.enemies().filter(e => !e.invuln && !e.harmless &&
  dist(e, p) <= def.engage + 4*lv && Math.abs(e.cy - p.cy) < 300);
score(e) = dist(e, p)
  + (behindPlayer(e) ? (def.bias === 'behind' ? -100 : +120) : 0)
  - (e.kind === 'boss' ? 80 : 0)
  - (e === g.target ? 60 : 0)                                // stickiness
  + (def.bias === 'lowhp' ? 200 * (e.hp / e.stats.maxHp) : 0);
target = argmin(score)
```
No target → return to anchor. `world.mode === 'town'` or `world.cutscene` → never target.

### 4.4 Attacks and the attack object

```js
gAttack(g, o) = { owner: g, team: 'player', stats: g.stats, mv: 1, type: 'phys', element: null, dir: sign(target.cx - g.cx) || g.facing,
  kb: [140, -80], hitstop: 0, shake: 0.6, hitId: 'g' + (++seq), mult: 1, crit: 0, tags: ['companion', 'guardian'],
  breakWalls: false, dmgColor: '#bfe6ff', ...o }
```
- `hitstop: 0` is mandatory (combat.js defaults undefined to 0.05 — constant auto-hits would freeze the game).
- `breakWalls: false`: finding secrets stays the player's job.
- **Do not use `projectiles.js explode()` for guardian auto attacks**: it hard-codes `camera.shake(8)`, hitstop 0.08 and the `explode` SFX. Use a small `Hitbox` (`{ team:'player', life: 0.1, attack: gAttack(g, {...}) , render }`) plus `fx.flash/ring/burst` scaled to the radius. `Hitbox` defaults `attack.tags` to `['skill']` — always pass `tags` explicitly. Hitbox visuals go in its `render` property (never override `draw`).
- Melee: `playerStrike(world, rect, atk)`; ranged: `world.spawnProjectile({ team: 'player', owner: g, attack: atk, ... })`.
- `g.stats` (refreshed on `player.refreshStats` and level change): `power = max(p.stats.atk, p.stats.mag) * share(lv) * (1 + 0.04*rank)`; `{ atk: power, mag: power, crit: 5 + 0.3*lv + p.stats.crit*0.3, critDmg: p.stats.critDmg*0.5, fire/ice/holy/dark/thunder: p.stats[el]*0.5, skillDmg: 0, subDmg: 0 }`.
- Guardian kills count as the player's kills (EXP, drops, bestiary, quests) through the normal `Enemy.die → world.onEnemyKilled` path.

### 4.5 Active skill (`guard` action or auto)

- Manual: `guard` pressed → first ready guardian in slot order casts; if none ready: SFX `menu_cancel` 0.3 vol and `fx.text(p.cx, p.y-20, '쿨타임', {size:14, color:'#9d8f80'})`.
- Auto (`state.companions.autoSkill`; `null` = device default: ON when `input.touchMode`, OFF otherwise): cast when ready and (≥ 3 enemies within 300 px of the player, **or** a boss is active and within 520 px, **or** for 루미 the player HP < 40 %).
- Cooldown: `cd = def.skill.cd * (1 - 0.01*(lv-1)) * (rank >= 5 ? 0.8 : 1)`; power ×1.25 at rank 1, ×1.5 at rank 4.
- **Skill call-out** (arcade flourish): HUD slides a 44 px portrait + name + line from the left for 1.6 s (§7.1); `audio.duck(0.3, 0.4)`; the guardian's cast pose + big FX.

### 4.6 Assist (협공) — "같이 공격"

Trigger (in `CompanionSystem.onHit`): a **player-owned** hit (`attack.owner === p`) that is a finisher (`p.move?.finisher`), a charged attack, a mount charge/special, or a crit. Each guardian whose `assistCd <= 0` (2.5 s; 1.8 s at rank 3) and within `leash` of the target performs its assist immediately: dash/teleport to a point beside the target (0.12 s streak), strike with `hitstop: 0.03, shake: 2, tags: ['companion','assist']`, and the first assist per chain shows `fx.text(x, y-30, '협공!', { color: def.color, size: 18 })`. Assist hits use `dmgColor` of the guardian. SFX `assist`.

### 4.7 Resonance (공명, bond rank ≥ 3)

`skills.js castUltimate` emits bus `ultimateCast {charId}` (hook C0). 0.9 s later every equipped guardian with rank ≥ 3 casts its **skill at 60 % power without using its cooldown**; the stowed mount (rank ≥ 3) performs a spectral **"기마 돌격"**: a translucent copy of the mount gallops across the whole camera view at the rider's height, hitting every enemy once (mv 2.0, its charge element), SFX mount cry + `charge`. (Ultimate cut-in owners may additionally show guardian portraits on the cut-in; optional.)

### 4.8 Aura (always on while equipped)

Flat stat adds merged into `computeStats` via `companionAuraStats(state, hero)`: `value = base + perLv*(lv-1)`, ×1.5 at rank ≥ 2. Shown in the status tab like any other stat.

### 4.9 Per-guardian specification (Lv 1)

| id | move / size / z | anchor dx,dy | 기본 공격 (auto) | 스킬 (`guard`) | 협공 (assist) | 오라 base (+perLv) | Special passive |
|---|---|---|---|---|---|---|---|
| g_fairy 루미 | fly · 16×20 · front | 34, −96 | Light needle: homing `orb` proj speed 700, mv 0.9 holy (R1-REQ-367 tuning, was 0.5), every 1.4 s, range 320, bias front | **요정의 가호** cd 35: heal 25 % max HP, 2.0 s invincibility dome (`companions.shieldT = 2.0` → player `invuln` via hook 3, golden dome FX drawn by the fairy; no i-frame blink) | **빛의 파동**: ring r 60 at target, mv 1.0 holy (R1-REQ-367 tuning, was 0.8) | hpRegen 0.8 (+0.04), resHoly 10 | Heal pulse every 8 s if HP < 85 %: 4 % max HP (+0.1 %/lv), sparkle spiral + `+N` green text |
| g_spiritwolf 하티 | ground · 50×36 · back | 60, 0 | Pounce: leap to target within 380 px (0.25 s arc) then 2 bites (rect 50×40, mv 0.7 ice each, 0.12 s apart), every 1.0 s, bias **behind** (guards your back) | **늑대 무리** cd 26: 3 phantom wolves (custom-render projectiles, pierce 99) charge 900 px from behind the player, staggered 0.1 s, mv 1.2 ice each | **측면 물기**: mv 1.0 ice, stun 0.4 | moveSpd 6 (+0.1), crit 3 (+0.05) | Howls when the player lands a 25-hit combo (FX + SFX only) |
| g_imp 핌 | fly · 26×28 · back | 40, −110 | Fireball: `fireball` proj speed 520, mv 0.8 fire, `explode` r 40 on hit (mv 0.4), every 1.2 s, range 360 | **지옥불 소나기** cd 28: 12 meteors fall over 2 s across 520 px ahead (`behavior:'fall'`, explode r 50, mv 0.9 fire each) | **삼연 화염구**: 3 small fireballs mv 0.5 fire | skillDmg 6 (+0.2), fire 10 | Cackles (SFX + tiny `'키히힛!'` text) on every 10th kill |
| g_knight 가웨인 | ground-hover · 34×72 · back | 46, 0 | Glides to target (≤ 300 px, speed 600), 2-hit slash (rect 80×70, mv 0.9 phys each, 0.18 s apart), every 1.3 s | **수호의 방패진** cd 30: 4 s spectral shield wall (entity) 2 tiles in front of the player that follows facing; destroys enemy projectiles it overlaps (skip `behavior:'beam'`, size > 80 px, or `unblockable`); player incoming damage ×0.7 while active (applied in `CompanionSystem.incoming`) | **방패 강타**: mv 1.0, stun 0.6 | dmgReduce 4 (+0.1) | Every 4 s blocks one enemy projectile within 70 px of the knight (clang + spark, projectile `dead`) |
| g_whelp 크론 | fly · 36×30 · back | 44, −100 | Bone-fire breath: Hitbox cone 160×60 for 0.5 s, rehit 0.1, mv 0.22 dark per tick (≈1.1), every 1.8 s, range 200 | **뼈 폭풍** cd 32: 6 bone shards orbit the player (r 90, 5 s, `behavior:'orbit'`, owner player, pierce 99, rehit 0.3, mv 0.5 dark) | **뼈 뱉기**: piercing bone proj mv 0.9 dark | critDmg 10 (+0.3), resDark 10 | Nibbles the rider's ear when idle (emote) |
| g_owl 미네르바 | fly · 24×24 · front | 30, −120 (perches) | Dive talon: swoop from above (0.3 s), rect 40×40, mv 1.0 holy, every 1.6 s, range 360 | **성광의 눈** cd 30: horizontal holy beam from the owl, 700 px long, 0.6 s, rehit 0.1, mv 0.5 holy (≈3.0), stun 1.0 | **급강하**: mv 1.0 holy | luck 8 (+0.2), dropBonus 10 (+0.2) | **Secret sight**: every frame, BREAK tiles (`H`,`K`,`B`) and unrevealed FAKE tiles within 7 tiles get a faint pulsing gold outline (`globalAlpha 0.25–0.45`), and the owl hoots once per newly seen secret |
| g_clock 틱톡 | fly · 26×32 · back | 38, −104 | Gear burst: 3 gear bullets speed 900, mv 0.45 phys each, 0.08 s apart, every 1.5 s, range 400 | **정지된 초침** cd 45: `world.timeStop = 2.0 + 0.02*(lv-1)` (max 2.6) + giant ghostly clock face FX + `clock_tick` | **톱니 드릴**: piercing gear mv 1.0 | atkSpd 5 (+0.1), cdr 5 (+0.1) | — |
| g_reaper 모르스 | float · 28×40 · back | 42, −60 | Blink behind target (0.1 s), scythe sweep rect 90×70, mv 1.1 dark, every 1.5 s, range 340, bias **lowhp** | **영혼 수확** cd 40: screen-wide scythe sweep (all enemies in camera view), mv 2.5 dark; heals the player 2 % max HP per enemy hit (max 20 %) | **영혼 베기**: mv 1.2 dark; execute threshold 20 % | lifesteal 2 (+0.03), dark 10 | **Execute**: a non-boss enemy under 12 % HP within range is reaped instantly (`flat: e.hp + 1`, soul burst, `'처형'` text), 3 s internal cooldown |

Lights (`lights(L)`): fairy `#fff2b0` r110 i.7 · wolf `#7ee0ff` r80 i.5 · imp `#ff7a2a` r90 i.6 · knight `#8ac8ff` r90 i.5 · whelp `#b060ff` r80 i.5 · owl `#ffe7a0` r70 i.5 · clock `#ffd070` r60 i.4 · reaper `#7aff9a` r80 i.6.

Signature lines (skill call-out `line`, join reveal `join`):

| id | line (skill) | join |
|---|---|---|
| g_fairy | 빛이여, 이 사람을 지켜 줘! | 밴시의 등불에서 꺼내 줘서 고마워! 이제 내가 널 지켜 줄게! |
| g_spiritwolf | 아우우우— | (서술) 무덤가를 헤매던 푸른 늑대의 영혼이 당신의 발치에 몸을 누였다. |
| g_imp | 키히힛! 전부 바삭하게 구워 주지! | 계약 성립! 영혼은… 에이, 농담이야, 농담. 금화면 충분해! |
| g_knight | 이 방패가 부서지기 전엔, 누구도 지나가지 못한다! | 주군은 타락했으나 내 맹세는 아직 살아 있다. 그대를 새 주군으로 모시겠다. |
| g_whelp | 크르르… 캬아악! | (서술) 알을 깨고 나온 작은 뼈의 용이 당신의 손가락을 깨물었다. …애정 표현인 것 같다. |
| g_owl | 어둠 속에 숨은 것은 나의 눈을 피할 수 없다. | 금서의 사슬이 풀렸군요. 지혜를 구하는 이여, 제 눈을 빌려 드리지요. |
| g_clock | 째깍, 째깍… 시간이여, 멈춰라. | 태엽이 다시 감겼어요. 주인님의 시간을 지켜 드릴게요. 째깍. |
| g_reaper | 네 이름도… 장부에 적혀 있어. | 스승님은 쓰러졌어. 이제 장부는 내가 들고 다닐게. …너, 오래 살 것 같진 않은데. 재밌겠다. |

Mount join narrations (narrator):
- 그림메인: 불타는 마구간에서 끝까지 버틴 검은 군마. 그 눈에는 아직 꺼지지 않은 불씨가 일렁인다.
- 바르그: 무엇이든 들이받아 부수는 강철 엄니의 멧돼지. 고집은 세지만 한 번 따르면 끝까지 따른다.
- 코슈타: 머리 없는 기사를 태우던 망령마. 이제 새 주인을 저승 끝까지라도 태우려 한다.
- 스콜: 달을 쫓는 늑대의 피를 이은 서리 늑대. 약한 자는 결코 태우지 않는다.
- 이그니스: 연구소의 알에서 태어난 진홍의 비룡. 태어나 처음 본 당신을 어미로 여긴다.
- 녹티스: 유물의 피 냄새를 따라 날아든 백작의 옛 권속. 이상하게도 당신에게 고개를 숙인다.

---

## 5. Combo / hit-feel integration

| Item | Rider & mount (charge, special, landing) | Guardian auto / skill / assist |
|---|---|---|
| Combo counter `world.combo.n` | +1 per hit, refreshes timer (as now) | +1 per hit, **does not refresh** `combo.t` (you keep the chain alive yourself); if no chain is running (`n` was 0) set `t = 1.0` |
| Ult gauge SP | full (these are the rider's actions) | ×0.4 |
| Lifesteal (`p.stats.lifesteal`) | yes | no (reaper skill heal is its own effect) |
| Hitstop | charge 0.04, special 0.08, landing 0.03 | auto 0 · assist 0.03 · skill per table (≤ 0.06) |
| Camera | charge `shake 2`, special `shake 6–8` + `punchZoom 1.03` | auto `shake 0.6` · skill `shake 3–6` |
| Damage numbers | default colours | `attack.dmgColor` (guardian colour) unless crit |
| Style rank | normal | normal (fed by combo count) |
| Kill credit / EXP / drops | player | player (+ companion EXP share) |

World change in `onPlayerHit(target, info, attack)`: `const cmp = attack.tags?.includes('guardian');` → skip `combo.t` refresh when `cmp`, multiply SP gain by 0.4, skip lifesteal; then call `this.companions?.onHit(target, info, attack)`.

---

## 6. Controls

| Action | Keyboard | Touch | Gamepad (standard mapping) |
|---|---|---|---|
| 탈것 소환 / 하차 (`mount`) | **R** | **탑승** button | **L3** (button 10) |
| 수호신 스킬 (`guard`) | **G** | **수호** button | **R3** (button 11) |
| 탈것 돌진 (riding) | C / Shift / K (dash) | 대시 | dash button |
| 탈것 특수기 (riding) | ↓ + X/J | stick ↓ + 공격 | ↓ + attack |
| 날갯짓 / 활공 / 비행 | Z/Space tap / hold | 점프 tap / hold | A tap / hold |
| 동료 관리 | Enter/Esc → 메뉴 → 「동료」 탭 | Ⅱ → 메뉴 → 동료 | Start → LB/RB to the tab |

`src/core/input.js` (C0): `ACTIONS` append `'mount', 'guard'`; `KEYMAP.KeyR = ['mount']`, `KEYMAP.KeyG = ['guard']`; `PADMAP[10] = ['mount']`, `PADMAP[11] = ['guard']`. (If the controller spec remaps buttons, it must keep both actions reachable; list them in its remap table.) Add `'mount'` and `'guard'` to the `history` push list is **not** needed.

Touch pad DOM (C0, `index.html` inside `#btns`): `<button class="b mnt" data-act="mount">탑승</button>` and `<button class="b grd" data-act="guard">수호</button>`, placed as a small pair above the S1/S2 cluster (CSS in `style.css`: same size as `.sk1`, positioned `right: calc(var(--pad-right) + 170px); bottom: 190px` / `+ 116px`; adapt to the mobile spec's layout variables if they change). Visibility: `body.has-mount` / `body.has-guard` classes (CSS `body:not(.has-mount) #touch .mnt, body:not(.has-guard) #touch .grd { display: none; }`) toggled by `CompanionSystem` (≤ 1 change per state change). Cooldown overlay: CSS var `--cd` (0–1) set at ≤ 10 Hz on each button, rendered with `::after { background: conic-gradient(rgba(0,0,0,.62) calc(var(--cd) * 360deg), transparent 0); border-radius: 50%; }`. The mount button label switches to `하차` while riding (`textContent` change only on state change). The hub's `townPad` hides `guard` (add to `NO_COMBAT`) but keeps `mount`.

**Canvas fallback (touch):** the HUD widgets (§7.1) are also tap targets (`input.pointer.tapped` inside the widget rect → same as the action), so the feature works even if a future pad layout drops the DOM buttons.

Options → 조작 안내 (owned by the controls spec; coordination item): add rows `['R'] 탈것 탑승/하차`, `['G'] 수호신 스킬`; pad diagram `L3 탈것`, `R3 수호신`; touch line `'탑승 · 수호 버튼은 스킬 버튼 위에 있습니다'`.

---

## 7. UI

### 7.1 HUD (`src/render/companion_hud.js`, called once from `hud.js`)

Call: `drawCompanionHUD(ctx, world, { x: ux + uw + 14, y: ky, touch: T })` right after the ult gauge block (`ux=106, uw=120, ky=92` → x = 240). Returns rects for tap fallback (stored on `world.companions.hudRects`).

- **Mount widget** (40 px circle at x, y): portrait crop (`portraits/cmp_<id>`, `iconFocus` from data; procedural head fallback via `drawCompanionIcon`), outer ring = mount HP (amber `#e8a040`, red below 30 %), grey veil + seconds while recalling, riding indicator = gold glow ring; flyers draw the stamina arc (blue `#7ec8ff`) outside the HP ring. Label under it: keyboard `[R]`, touch `탑승`/`하차`, pad `L3`.
- **Guardian widgets** (1–2 × 38 px circles at x+46, x+90): portrait crop, clockwise dark cooldown sweep + seconds (like skill slots), gold pulse when ready, `AUTO` pill (8 px text) when auto-skill is on. Label `[G]` / `수호` / `R3`.
- Hidden entirely when nothing is equipped or in town.
- **Skill call-out lane:** left edge at y = 170 (desktop) / 232 (touch, below the touch boss bar); card 300×52: portrait 44 px, name in `FONT.title` 16 px colour `def.color`, line 13 px; slide in 0.18 s, hold 1.2 s, slide out 0.2 s; queue ≤ 2.
- **Mount special / charge names** use world-space `fx.text` (§3.6.6), not the HUD.

### 7.2 Menu tab 「동료」 (`src/scenes/menu/tab_companions.js`)

Registered in `MENU_TABS` after `class`: `{ id: 'companions', name: '동료', glyph: 'paw', C: () => CompanionsTab }` (10 tabs; at W 960 each tab ≈ 81 px — fits). New glyph `'paw'` in `menu/common.js glyph()` (one pad + four toes).

Layout inside A (`{x:14, y:72, w:W-28, h}`):
- **Top strip (h 54): loadout** — `탈것` slot, `수호신 1`, `수호신 2` (locked: lock glyph + `'8장 클리어 시 개방'`), plus toggle `자동 스킬: 켬/끔/기기 기본`.
- **Left list (w 270):** segmented toggle `탈것 | 수호신`; rows 52 px: 40 px icon, name + title, `Lv 12`, 5 mini hearts (bond), badges `장착` (gold) / `NEW` (red, cleared when viewed) / egg `부화 대기`. Locked rows: black silhouette icon, name `???`, hint line from `obtain.hint` (e.g. `'3장 보스 「둘라한」을 처치하면 합류'`, `'영혼의 마구간에서 6,000 G에 구입'`, `'그레타의 의뢰 「늑대 왕의 시험」'`, `'드라큘라의 유물 5개를 모으면…'`).
- **Center preview (flex):** `HeroStage`-style gothic backdrop (reuse `HeroStage` from `hero_view.js`). Mount: drawn at scale 1.8 with the **current hero seated** (hero `p.ride` contract §11.4), cycling `idle(2s) → walk(2s) → run(2s) → special(1s)`; tap/confirm-on-preview cycles manually. Guardian: hero idle at scale 1.6 with the guardian at its anchor, periodically playing `attack` and `skill` poses. Level-up / bond-up sparkle when values change.
- **Right detail (w 300):** name (`FONT.title` 22), title, `Lv 12  EXP 1,234 / 2,480` gauge, bond hearts + rank name + next threshold, **stats**: mount → `체력 820 · 이동 속도 408 · 점프 820 · 돌진 위력 94%`; guardian → `공격력 312 (영웅 공격력의 47%) · 공격 간격 1.3초 · 스킬 재사용 27초`; **abilities** list: `돌진`, `특수기`, `탑승 효과`, `패시브` (mount) or `기본 공격`, `스킬`, `협공`, `오라`, `고유 능력` (guardian), each with a one-line Korean description generated from data (`desc` fields); buttons: `장착` / `해제` (mount), `수호신 1에 장착` / `수호신 2에 장착` / `해제` (guardian).
- Changing loadout calls `equipMount/equipGuardian`, `this.m.changed()`, and `this.world?.companions?.sync()`; notify via `this.m.notify('그림메인을(를) 장착했다')` using `josa()` from `items.js` (`'그림메인을'`).
- Controls: ↑↓ list, ←→ between list / buttons, Z confirm, X back, Q/E tabs; touch: tap rows/buttons, drag list (`Scroller`); `hints(focused)` → `[['↑↓','선택'],['Z','장착/해제'],['←→','항목'],['X','뒤로']]`, touch tips `'항목을 터치해 선택 · 버튼으로 장착'`.
- Empty state (no companion owned): centered text `'아직 동료가 없습니다'` + sub `'1장을 클리어하면 마을 동쪽 성문 밖 「영혼의 마구간」이 열립니다'`.
- Viewing a companion with `pending` membership removes it from `pending` (the reveal is considered seen).

### 7.3 Stable scene (`'stable'`, `src/scenes/town/stable.js`)

Uses the town UI kit (`scenes/town/common.js`: `uiPanel`, `uiButton`, `uiHints`, NPC portrait + dialogue box like `shop.js`/`smith.js`). Background: procedural barn interior (warm lantern light, straw, stalls with owned mounts' heads; altar alcove with floating owned guardians) or `bg/stable` if the art WP produced one (optional). Greta portrait left, dialogue line box bottom-left (random from `STABLE_LINES`), tabbed panel right:

1. **공물 (Tribute)** — list of owned companions; selecting shows cost/effect; `공물 바치기` pays gold: `price = 100 + 30*lv` G, EXP `floor(cexpToNext(lv)*0.3)`, bond +8 if not already given since the last stage clear (`owned[id].gift !== companions.clears`), otherwise EXP only with note `'유대는 다음 스테이지를 다녀온 뒤에 더 깊어진다'`.
2. **구입 (Shop)** — `STABLE_SHOP`: 바르그 6,000 G (ch ≥ 2), 소악마 계약서 → 핌 7,500 G (ch ≥ 3). Locked rows show `'2장 클리어 후 입고'`. Owned → `보유 중`. Purchase → `buyCompanion` → join reveal.
3. **부화 (Eggs)** — eggs with status `'따뜻하다… (스테이지 1개 더 클리어)'` / `'금이 가기 시작했다!'`; `부화시키기` (ready only) → 2 s hatch animation in the panel (egg wobble, cracks, burst of bone dust / embers, SFX `egg_crack`) → `hatchEgg` → join reveal.
4. **의뢰 (Quests)** — Greta's quests from `game.quests.available('npc_greta')` + active ones: accept / claim buttons (`game.quests.accept/claim`); claim triggers the companion unlock via the `questClaimed` listener.
Footer button `동료 관리` → `game.push('menu', { world, tab: 'companions' })`.

`STABLE_LINES`: hello `['왔구나. 녀석들이 네 냄새를 기억하고 있었어.', '말이든 영혼이든, 먼저 믿어 줘야 너를 믿어.', '오늘 밤도 살아서 왔네. 다행이야.']`, tribute `['봐, 꼬리가 흔들리잖아.', '좋아하는 것 같네. 표정만 봐도 알아.']`, buy `['잘 부탁해. 이 녀석, 겉보기보다 순해.', '계약서는 로크한테서 받은 거야. 수상하긴 해도… 진짜야.']`, poor `['금화가 모자라. 짐승도 영혼도 공짜로는 안 움직여.']`, egg `['알에 금이 가기 시작했어! 어서!', '아직 따뜻해. 조금만 더 기다려.']`, bye `['살아서 돌아와. 너도, 녀석들도.']`.

### 7.4 Join reveal scene (`'companionJoin'`, `src/scenes/companion_join.js`)

`game.push('companionJoin', { id, onDone })`, opaque overlay, 3.5 s minimum 1.2 s before skippable:
- Background darkens (0.8), crimson radial burst, embers.
- Portrait (`portraits/cmp_<id>`, 3:4) slides in from the right with a slight Ken Burns zoom; procedural fallback = the in-game renderer at scale 3 on a glow disc.
- Left: `'새로운 동료'` (FONT.logo 16, gold) → name (FONT.title 44, `def.color`, outline 6) → title (18) → kind pill (`탈것` / `수호신`) → join line (dialogue box style) → three ability chips (`돌진 · 앞발 강타 · 받는 피해 -5%`).
- Bottom hint: keyboard `'[R] 로 소환 · 메뉴 › 동료 탭에서 관리'` (mount) / `'[G] 로 스킬 · 자동 스킬은 메뉴에서 설정'` (guardian); touch `'탑승 버튼으로 소환'` / `'수호 버튼으로 스킬'`.
- SFX `companion_join` + the companion's cry; `audio.duck(0.5, 1.0)`.

`companionHubEnter(game, hub)` (hub.js hook, on `enter` and `onResume`): 1) if `chapter >= 1 && !flags.stable_open` → play `cmp_stable_open` (dialogue), whose end sets the flag → unlock warhorse; 2) evaluate relic unlock (plays `cmp_bat_arrive` first); 3) show up to 3 pending reveals in sequence (the rest remain `NEW` in the menu). Never pushes while another overlay is on top (`game.top !== hub` → retry on next `onResume`).

### 7.5 Toasts / texts (verbatim)

`'그림메인에 올라탔다!'` · `'여기서는 탈것을 부를 수 없다'` · `'공간이 좁아 탈것을 돌려보냈다'` · `'장착한 탈것이 없다 — 메뉴 › 동료'` · `'{name}이(가) 아직 돌아오지 않았다 ({n}초)'` · `'{name}이(가) 쓰러졌다! (재소환 {n}초)'` · `'이 싸움에는 탈것이 겁을 먹었다'` · `'쿨타임'` · `'협공!'` · `'처형'` · `'새 동료 합류 — 「{name}」! 마을로 돌아가면 만날 수 있다'` · `'「{egg}」을(를) 손에 넣었다 — 영혼의 마구간에 맡기자'` · `'「{name}」와(과)의 유대가 깊어졌다 — {rank}'` · `'수호신 슬롯이 하나 더 열렸다!'` (first hub visit at ch ≥ 8). Use `josa()` for 이/가, 을/를, 와/과.

---

## 8. Save data schema & migration

```js
state.companions = {
  v: 1,                        // internal schema version (SAVE_VERSION untouched)
  owned: { [id]: { lv: 1, exp: 0, bond: 0, got: <ms>, src: 'story'|'boss'|'egg'|'quest'|'shop'|'relics'|'migrate'|'debug', gift: -1, seen: false } },
  eggs: { [id]: { at: <clears counter when obtained>, got: <ms> } },   // id = the companion that will hatch
  pending: [id, ...],          // join reveals not yet shown
  clears: 0,                   // total stage clears (story), drives eggs & tribute cycle
  autoSkill: null,             // null = device default | true | false
  slot2Seen: false,            // '수호신 슬롯이 하나 더 열렸다!' shown
  last: { mount: null, guards: [null, null] },   // loadout template for heroes without one
}
hero.companions = { mount: id|null, guards: [id|null, id|null] }        // per hero
world.run.mount = { hp: { [id]: number }, cd: 0, state: 'stowed'|'riding', saved: false }   // per stage run, not saved
```

`migrateCompanions(state)` (called at the end of `migrateState`, and by `ensureCompanionState` on new games; idempotent):
1. Create missing structure; drop unknown ids (`owned`, `eggs`, `pending`, loadouts); clamp `lv` to 1–30, `exp` ≥ 0 finite, `bond` 0–200; `pending` unique and owned.
2. For each hero: ensure `hero.companions` (copy from `last` if absent); clear ids not owned; mount must be a mount id, guards guardian ids; duplicates → clear the later; guard slot 2 cleared (moved to slot 1 if empty) when `guardianSlots < 2`.
3. **Retro unlocks** (saves from before this feature): bosses in `progress.bosses` → boss-type unlocks (`src:'migrate'`, into `pending`); egg-type → egg `{at:-99}`; `quests.done` → quest unlocks; relics ≥ 5 → bat. (`m_warhorse` is *not* retro-unlocked: the Greta intro plays on the next hub visit.)
4. Never throws; wraps in try/catch and resets `state.companions` to empty on corruption (logged with `console.warn`).
- `isValidSave` unchanged (companions optional). Export codes / cloud sync carry `state.companions` automatically.
- Debug (C0 hook in `main.js`, only with `?scene=stage` or `?scene=hub`): `applyCompanionDebug(state, params)`: `cmp=all|id,id` grant, `cmplv=N`, `bond=N`, `mount=id`, `guards=id,id`, `ride=1` (auto-summon on stage start), `ch=N` (sets `progress.chapter`, for hub tests).

---

## 9. Balance tables

| Lv | guardian share `0.30+0.015(lv−1)` | trample ratio `0.8+0.02(lv−1)` | mount HP ×`1+0.02(lv−1)` | speed × `1+0.005(lv−1)` | skill/recall CD × `1−0.01(lv−1)` | EXP to next |
|---|---|---|---|---|---|---|
| 1 | 0.300 | 0.80 | 1.00 | 1.000 | 1.00 | 80 |
| 5 | 0.360 | 0.88 | 1.08 | 1.020 | 0.96 | 725 |
| 10 | 0.435 | 0.98 | 1.18 | 1.045 | 0.91 | 1 992 |
| 15 | 0.510 | 1.08 | 1.28 | 1.070 | 0.86 | 3 646 |
| 20 | 0.585 | 1.18 | 1.38 | 1.095 | 0.81 | 5 627 |
| 25 | 0.660 | 1.28 | 1.48 | 1.120 | 0.76 | 7 898 |
| 30 | 0.735 | 1.38 | 1.58 | 1.145 | 0.71 | — |

Bond: guardian power ×(1 + 0.04·rank), mount HP ×(1 + 0.05·rank).

Expected guardian DPS share of total player damage (player combo ≈ 3.0–3.5 mv/s; melee guardians ~60 % uptime due to travel): Lv 1 ≈ 8–12 %, Lv 15 ≈ 13–18 %, Lv 30 bond 5 ≈ 20–28 %. **Hard limits checked by `tools/balance_companions.mjs`: every guardian's modelled share must lie in [6 %, 30 %] at (companion Lv, hero Lv) pairs (1,5) (10,15) (20,30) (30,45).** Skills are burst tools (≈ 3–6 × one guardian attack interval of damage every 26–45 s).

Mount effective buffer: with absorb 0.7 and HP 0.9× rider, a warhorse soaks ≈ 1.29× rider max HP of incoming damage while the rider takes ≈ 0.39×. The bigger hurtbox takes more hits, bosses deal ×1.3 to mounts, and knock-off costs 14–24 s. Difficulty settings do not change companion numbers (enemy HP/ATK scaling already applies).

Economy: tribute 130 G (Lv1) – 970 G (Lv29); shop mounts/pacts 6,000/7,500 G (≈ 2–3 stages of gold at ch 2–3 per the current economy).

---

## 10. Audio

No new music. New SFX are registered from `src/core/audio_companions.js` via a C0-added API in `core/audio.js`: `export function defineSfx(name, def, vol)` (merges into `SFX`/`SFX_VOL`) and `export const SFX_KIT = { T, N, R }` (the existing tone/noise/random helpers). Recipes (same style as existing entries):

| name | sketch | vol |
|---|---|---|
| `summon` | rising bandpass noise swell 0.35 s + sine bell 880/1320 | 1.2 |
| `dismiss` | falling noise whoosh + low sine 220→110 | 1.0 |
| `mount_up` | leather creak (bandpass noise 600 Hz, 2 bursts) + thump 90 Hz | 1.0 |
| `neigh` | horse whinny: saw through formant bandpass 900→1400→700 Hz, vibrato 9 Hz, 0.7 s | 1.4 |
| `gallop` | hoof clop: 20 ms lowpass noise + 70 Hz thump (played per hoof contact, `gap 0.04`, `max 4`) | 0.7 |
| `hoof_land` | heavy thud: 55 Hz sine 0.2 s + noise | 1.2 |
| `boar_grunt` | low square 110→80 Hz stutter ×3 through lowpass | 1.2 |
| `wolf_howl` | sine glide 420→720→560 Hz, vibrato 5 Hz, 1.1 s + airy noise | 1.3 |
| `wolf_bite` | snap: 12 ms highpass noise + 300 Hz click | 1.0 |
| `wing_flap` | lowpass noise whump 0.12 s | 1.0 |
| `roar_small` | saw 180→120 Hz + distorted noise 0.6 s | 1.3 |
| `fire_breath` | bandpass noise 800–2400 Hz rising, 0.25 s (retriggered every 0.2 s while breathing) | 1.0 |
| `screech` | high sine sweeps 3200→5200 Hz ×3 + ring-mod shimmer | 1.1 |
| `bone_rattle` | 6 tiny clicks (highpass noise) randomly spaced over 0.2 s | 0.9 |
| `fairy_chime` | sine arpeggio 1568/2093/2637 Hz, 40 ms apart, long reverb | 1.1 |
| `knight_guard` | metal clang (existing `clang`-like) + shimmer sine 1200 Hz | 1.1 |
| `imp_cackle` | square formant stutter 500–800 Hz ×5 | 1.0 |
| `owl_hoot` | two soft sines 420 Hz / 380 Hz, 0.25 s each | 1.0 |
| `gear_whir` | fast clicks 30/s for 0.2 s + saw 300 Hz | 0.9 |
| `scythe` | whoosh bandpass 400→2400 Hz + metallic ring 2600 Hz | 1.1 |
| `soul_reap` | reversed-envelope choir-ish triangle chord + noise | 1.2 |
| `egg_crack` | 3 crisp cracks (highpass noise bursts) + tiny squeak sine | 1.2 |
| `companion_join` | 1.2 s fanfare: organ chord C–E–G–C' arpeggio + bell | 1.3 |
| `bond_up` | two-note heart chime 1047/1319 Hz | 1.0 |
| `knock_off` | thud + pained mount cry (pitch 1.3 of the mount's cry) | 1.2 |
| `assist` | short swoosh + ding 1760 Hz | 0.9 |

Mount cries by id: warhorse/skelsteed `neigh` (skelsteed pitch 0.8 + `bone_rattle`), boar `boar_grunt`, wolf `wolf_howl`, wyvern `roar_small`, bat `screech`. Hoof SFX per gait contact: warhorse/skelsteed `gallop`; boar `gallop` pitch 1.3 vol 0.5; wolf/flyers `footstep` pitch 0.8.

---

## 11. Rendering requirements

General: procedural Canvas, same painterly-gothic language as `render/hero.js` and the enemy renderers (dark outline ~1 px `#0a0608`, 2–3 tone shading with gradients, rim light from upper-left behind, emissive eyes/runes with additive glow). Draw facing right, origin = feet centre `(cx, bottom)`, mirror by `facing`. Everything must look **detailed, not flat** (request 1/2 quality bar): layered anatomy, secondary motion (verlet manes/tails/cloth via `VerletChain` from `core/physics.js`), per-state FX.

Quality levels (`game.settings.quality`): `high` all; `medium` no verlet on guardians, fewer particles; `low` static manes/tails (keyframed sway), no glow sprites except eyes, no afterimages. Budget (desktop, headless Chromium): ≤ 0.35 ms per mount draw, ≤ 0.15 ms per guardian draw at `high`.

### 11.1 Shared rig — `src/render/mount_rig.js` (pure math, no ctx)

`mountPose(m, dt) → pose` computed **once per update** (called by `MountRider.update`, reused by draw and by the seat/hurtbox): body root (x,y), body pitch, spine flex, neck/head angles, per-leg IK joints, wing angles, tail anchor, **seat point** `{x, y}` (world) and seat lean. Templates:
- `horse` (warhorse, skelsteed): body 64×26, withers (22,−62), hips (−26,−60), fore legs at x 20 (upper 24, lower 26 + hoof), hind at x −24 (upper 26, lower 26, hock bends forward), neck 30 at −1.0 rad, head 26. Gaits: **walk** 4-beat (LH 0, LF .25, RH .5, RF .75; duty .65; bob 1.5 px; pitch ±.02), **trot** diagonal pairs (duty .5; bob 3), **gallop** rotary (LH 0, RH .12, RF .45, LF .55; duty .35; suspension; pitch ±.07; bob 5; head pumps ±.12). Foot trajectory: stance = planted, moving back at body speed; swing = arc with lift 10–16 px. Stride length 70 (walk) / 110 (gallop); `phase += |vx|*dt/stride`.
- `boar`: short legs (upper 14, lower 16), fast trot, head low, bob 2, body 60×30.
- `wolf`: bounding gallop (fore pair / hind pair), spine flex ±6 % length, tail streaming.
- `wyvern`: biped digitigrade hind legs + wing-wrist "knuckle walk" on the ground; wings (humerus/forearm/3 finger spars + membrane) with flap cycle (down 0.18 s / up 0.22 s), glide spread 170°; tail 10-segment chain.
- `bat`: body + head/ears; wings with 4 finger spars + membrane; ground crawl-hop on wing wrists; flight flap period 0.28 s; hover micro-flaps.
Seat = saddle point transformed by body pitch/bob. Rear-up (special) = body rotation about the hind hooves up to −0.7 rad.

### 11.2 Mount visuals & animation list — `src/render/mounts.js`

`drawMount(ctx, m, world, layer /* 'back'|'front' */, opts = {alpha, tint, scale, noFx})`. `back` = far legs, far wing, tail, body, near legs, neck/head, barding; `front` = saddle skirt straps and **near wing / near mane strands / reins** that must overlap the rider's near leg. The rider is drawn between the two layers (§11.4). `opts.tint` for ghosts (mount charge afterimage, flee, spectral resonance charge).

Animation states required for **every** mount: `idle` (breathing, weight shift, tail sway, ear flicks; idle extras: warhorse paw-scrape & snort smoke, boar sniff-dig, skelsteed flame flicker & jaw clack, wolf pant & look-around, wyvern neck coil & tongue flick, bat ear twitch & wing fold), `walk`, `run` (gallop), `turn`, `jump` (take-off crouch → stretch), `fall`, `land` (absorb squash), `charge`, `special`, `hurt`, `knocked` (stumble, legs buckle), `flee` (ghost run-away), `summon` (materialise from red mist, scale 0.9→1), `dismiss` (rear + dissolve), `swim` (head up, paddling legs, water line). Mount-specific: wyvern `flap`, `glide`, `breath`, `dive`; bat `takeoff`, `flap`, `hover`, `dive`, `screech`; wolf `wall` (kick-off pose), `howl`; horse `rear` (special wind-up), boar `dig`.

| id | Look (key details) | Palette |
|---|---|---|
| m_warhorse 그림메인 | Muscular black destrier with blue-steel sheen highlights; flowing **crimson mane & tail** (verlet, 8–10 segments); iron **chanfron** face plate with a single short horn spike; ember-glowing eyes; crimson saddle cloth with gold trim, black leather saddle, stirrups, reins to the rider's hand; feathered fetlocks; iron-shod hooves; nostril smoke puffs in idle; awakened (rank 4): ember cracks glowing along the barding, fiery mane tips | `#141018 #2a2a3a #8a1020 #c8a040 #ff6a2a` |
| m_boar 바르그 | Huge bristled boar, dark-brown hide with scars and a spiky mane ridge (bristle strokes); **steel-plated tusks** with rivets; small red eyes; studded leather harness, riveted head plate; stubby powerful legs; dust constantly kicked up at speed; awakened: molten-orange tusk edges | `#3a2618 #5a3a24 #8a8e9a #c8ccd8 #ff4a2a` |
| m_skelsteed 코슈타 | Skeletal horse: bone-white with ash shading, visible ribcage **with blue soul-fire inside** (flickering additive), eye sockets with blue flames, mane and tail made of blue flame particles (no hair), tattered black barding, chain reins, cracked hooves leaving blue flame hoofprints (fade 1 s); awakened: green-white hellfire | `#d8d0bc #8a8478 #1a1418 #6ad0ff #e0f8ff` |
| m_direwolf 스콜 | Big wolf, frost-white fur with blue-grey back saddle patch (layered fur tufts), icy glowing blue eyes, frost breath particles, fur mantle behind the saddle, leather saddle with bone ornaments; long bushy tail (verlet); awakened: ice crystals growing on shoulders | `#c8d8e8 #6a7a8a #2a3440 #8ae8ff #ffffff` |
| m_wyvern 이그니스 | Crimson wyvern, orange-gold belly scales (scale pattern strokes), dark horns & spinal ridges, membranous wings with veins (translucent when lit from behind), long tail with a spade tip, ember glow in the throat before breathing, riding harness with a war saddle | `#a01828 #5a0a14 #ff8a3a #ffd070 #2a1418` |
| m_giantbat 녹티스 | Enormous vampire bat, black-brown fur, **crimson-veined membranes**, huge ears, glowing red eyes, fangs, silver saddle with chains between the shoulders, wing-thumb claws; sound-ring FX when screeching | `#141016 #3a1a24 #8a1426 #ff2a3a #c8c8d0` |

### 11.3 Guardian visuals & animation list — `src/render/guardians.js`

`drawGuardian(ctx, g, world, opts)` + FX helpers used by `guardian.js` for skill/attack visuals: `fxFairyDome, fxShieldWall, fxMeteor, fxPhantomWolf, fxHolyBeam, fxBoneShard, fxClockFace, fxScytheSweep, fxSecretOutline` (all `(ctx, e, world)` callbacks usable as `Hitbox`/`Projectile`/`SkillFx` render functions).

States for every guardian: `idle` (float bob / breathing), `move`, `attack` (wind-up + strike keyframes), `skill` (cast pose + aura), `assist` (dash streak), `hurt` (flinch), `appear` / `vanish` (teleport poof), `emote` (idle personality beat every 6–10 s). Plus: owl & fairy `perch`; knight `guard` (shield raised); wolf `run`, `pounce`, `howl`; reaper `blink`.

| id | Look |
|---|---|
| g_fairy 루미 | 16 px-tall girl with golden hair, leaf-petal dress, **two pairs of dragonfly wings** (motion-blurred flutter, iridescent), glowing core aura, sparkle trail particles; wand star tip |
| g_spiritwolf 하티 | Translucent cyan wolf (alpha .8, additive rim), starfield specks inside the body, flame-like tail and ear tips (particles), glowing white eyes; spectral paws leave fading prints |
| g_imp 핌 | Red-violet imp, big toothy grin, small curled horns, bat wings, pointed tail, tiny skull staff with a flame; exaggerated squash/stretch |
| g_knight 가웨인 | Translucent blue armoured knight (full plate, great helm with a slit glowing white), tattered cape (verlet), kite shield with a faded cross, longsword; **no legs — lower body fades into mist**; additive rim light |
| g_whelp 크론 | Small skeletal dragon, oversized cute skull, **purple soulfire inside the ribcage**, tiny bone wings with torn membranes, wiggly bone tail |
| g_owl 미네르바 | White-and-gold barn owl with a thin halo ring behind the head, glowing gold eyes, feather layering on the wings (primary/secondary rows), talons; perched pose with folded wings |
| g_clock 틱톡 | Porcelain doll face with painted cheeks and a crack, brass ball joints, Victorian dress, **rotating wind-up key on the back**, hovering under a small gear-propeller parasol; gears orbit when casting |
| g_reaper 모르스 | Tiny hooded skeleton in a black robe, **oversized scythe** (≈2× its height) with a hanging green soul-lantern, glowing green pinpoint eyes; a floating ledger book when idle |

Awakened (bond rank 4) variants: brighter core glow + one extra element (fairy: halo; wolf: twin tails; imp: flaming horns; knight: gold trim; whelp: wing membranes of flame; owl: second halo; clock: golden gears; reaper: ghostly second scythe).

### 11.4 Rider contract for `render/hero.js` (owned by the hero-render spec; implemented as WP C6)

When riding, `MountRider.riderView(p)` returns a reusable object that mirrors every field `drawHero` reads (`cx, bottom, facing, anim, animT, move, moveT, atkSpeedMul, look, ch, vx, vy, onGround, rig (the player's own rig object, for cloth continuity), t, stats, charging, muzzleT, dashT`) plus:
```js
p.ride = {
  sx, sy,          // world coords of the saddle seat point (pelvis target), includes bob/pitch
  lean,            // extra torso lean in rad (+ forward); gait- & state-driven
  duck,            // 0..1 low-ceiling lean (adds up to +0.6 lean, head lowered)
  footY,           // stirrup depth below the pelvis (px, positive down)
  legs: 'straddle' | 'kneel',   // wolf uses 'kneel' (knees bent more)
  reins: true,     // free hand holds reins when not attacking/casting/throwing
  gait: 'idle'|'walk'|'run'|'charge'|'air'|'rear'|'swim'|'fly', phase,   // for secondary bounce
}
```
`drawHero` rules when `p.ride` is present:
1. Pose: compute the normal upper-body pose for `p.anim` (`ride` = idle-seated; any attack/cast/throw/charge/hurt anim as usual), then **force**: `P.px = 0, P.py = -41, P.rot = 0, P.sx = 1, P.ox = 0`, `P.lean = clamp(P.lean, -0.35, 0.6) + ride.lean + 0.6*ride.duck`; legs: near foot `f1 = (7, -41 + footY)`, far foot `f2 = (3, -41 + footY - 2)`, knees forward (`t1 = t2 = 0.6`, `kneel`: 0.9, foot x −2).
2. Origin: translate so the pelvis lands on `(ride.sx, ride.sy)`: origin = `(sx, sy + 41*hs)`.
3. **Skip the far leg** (it is behind the mount body).
4. Rider-specific anims: `ride` (seated idle, reins), `ride_charge` (lean +0.45, weapon arm forward like a lance, hair/cape stream back), `ride_rear` (lean −0.3, weapon arm raised), `ride_hurt`, `ride_duck`. `mount_on`/`dismount` hops are drawn with the normal `jump`/`fall` poses and `p.ride = null` (MountRider interpolates the position).
5. Works in menus: the companions tab passes the same structure with `rig: {}` of its own.

Player draw while riding (`Player.draw`): `if (this.mount?.riding) { this.mount.draw(ctx, world, this, 'back'); drawHero(ctx, this.mount.riderView(this), world, opts); this.mount.draw(ctx, world, this, 'front'); } else drawHero(...)` — the iframe blink skip applies to the whole group.

### 11.5 Art assets (Kling) — WP C9

15 portraits, 3:4, `kling-image-v3_0_omni`, cleaned with `tools/kling/clean_watermark.py`, saved as `assets/portraits/cmp_<id>.webp` (≈760×1013, quality 88) and `assets/portraits/npc_greta.webp`; entries appended to `tools/kling/manifest.json` (`group: 'portrait'`). Prompt template (same suffix as existing portraits): `"<subject>. Dark gothic fantasy creature portrait, highly detailed painterly digital illustration, dramatic rim lighting, dark atmospheric background with crimson moonlight, video game companion card art, no text, no letters, no watermark."`

| file | subject |
|---|---|
| cmp_m_warhorse | A majestic black warhorse destrier with a flowing crimson mane, an iron chanfron face plate with a short horn spike, glowing ember eyes, crimson and gold saddle cloth, smoke from its nostrils, rearing slightly |
| cmp_m_boar | A giant battle boar with steel-plated riveted tusks, scarred dark-brown hide, spiky bristle mane, studded leather harness and saddle, small furious red eyes |
| cmp_m_skelsteed | A skeletal undead horse with blue soul-fire burning inside its ribcage and eye sockets, a mane and tail of blue flames, tattered black barding and chain reins |
| cmp_m_direwolf | A huge frost dire wolf with white and blue-grey fur, glowing icy blue eyes, frost breath, a bone-ornamented leather saddle and fur mantle |
| cmp_m_wyvern | A young crimson wyvern with orange-gold belly scales, dark horns, wide veined membranous wings, a spade-tipped tail, embers in its throat, wearing a war saddle |
| cmp_m_giantbat | An enormous vampire bat with crimson-veined wings, huge ears, glowing red eyes and fangs, a silver saddle with chains on its back, hanging under a blood moon |
| cmp_g_fairy | A tiny glowing fairy girl with golden hair, a leaf-petal dress and two pairs of iridescent dragonfly wings, holding a star wand, surrounded by sparkles |
| cmp_g_spiritwolf | A translucent spectral cyan wolf spirit with stars inside its body, flame-like tail, glowing white eyes, howling in a misty graveyard |
| cmp_g_imp | A mischievous small red-violet imp mage with a toothy grin, curled horns, bat wings, a pointed tail, holding a tiny skull staff with a flame |
| cmp_g_knight | A translucent blue ghost knight in full plate armor with a great helm glowing white through the slit, tattered cape, kite shield with a faded cross and a longsword, lower body fading into mist |
| cmp_g_whelp | A cute baby skeletal dragon with an oversized skull, purple soulfire glowing inside its ribcage, tiny bone wings with torn membranes, curled bone tail |
| cmp_g_owl | A holy white-and-gold barn owl with a thin golden halo behind its head, glowing golden eyes, detailed layered feathers, perched on a gothic candelabra |
| cmp_g_clock | A floating porcelain clockwork doll with a cracked painted face, brass ball joints, Victorian dress, a wind-up key turning on its back, gears orbiting around it |
| cmp_g_reaper | A tiny cute hooded skeleton reaper child in a black robe holding an oversized scythe with a hanging green soul lantern, glowing green eyes, a ledger book floating beside it |
| npc_greta | Greta, a sturdy weathered woman stablekeeper in her forties with grey-blond braided hair and pale blue eyes, a wide-brimmed leather hat, a rust-red scarf, leather work clothes, holding a lantern beside a black horse's head, calm stern expression (upper body, visual novel dialogue portrait) |

Each companion entry in data holds `iconFocus: { x, y, s }` (normalized crop for 40 px HUD circles; the art WP fills these after viewing the images). Everything must degrade to procedural drawing if an image is missing (`assets.get()` → null).

---

## 12. Code architecture & APIs

### 12.1 New files (one owner each, see §14)

| File | Exports / responsibility |
|---|---|
| `src/data/companions.js` | Pure data: `CMP_MAX_LV, BOND_RANKS, BOND_NAMES, MOUNTS, GUARDIANS, MOUNT_IDS, GUARDIAN_IDS, COMPANION_ORDER, companionDef(id), cexpToNext(lv), guardianShare(lv), trampleRatio(lv), cdMul(lv), STABLE_SHOP, TRIBUTE, COMPANION_QUESTS ({cq_hati:'g_spiritwolf', cq_skoll:'m_direwolf'}), STABLE_LINES, DISMOUNT_NOTE` |
| `src/game/companion_state.js` | Pure state helpers (node-importable, imports only data + `core/events.js` bus): see §12.2 |
| `src/game/companion_events.js` | `initCompanions(game)`: bus wiring (`bossKilled`, `stageCleared`, `questClaimed`, `relicFound`) → unlocks/eggs/bond/clears; toasts through `game.toast` |
| `src/game/companions.js` | `class CompanionSystem` (runtime per World) + `class CompanionDirector extends Entity` (invisible, `kind:'director'`, `z:-99`, updates the system inside the entity loop so World.update needs no edit) + `companionHubEnter(game, hub)` + `companionHubNote(state)` |
| `src/game/mount.js` | `class MountRider`, `class MountGhost extends Entity`, `DISMOUNT_SKILLS`, `fits`, `findMountSpot` |
| `src/game/guardian.js` | `class Guardian extends Entity`, `GUARDIAN_AI = { [id]: { init, think, attack, skill, assist, passive } }`, `gAttack` |
| `src/render/mount_rig.js` | `mountPose(m, dt)`, rig templates, `seatOf(pose, out)` |
| `src/render/mounts.js` | `drawMount(ctx, m, world, layer, opts)`, `drawMountIcon(ctx, id, x, y, r)` |
| `src/render/guardians.js` | `drawGuardian(ctx, g, world, opts)`, `drawGuardianIcon(ctx, id, x, y, r)`, FX helpers (§11.3) |
| `src/render/companion_hud.js` | `drawCompanionHUD(ctx, world, o) → rects`, `drawCompanionIcon(ctx, id, x, y, r)` (portrait crop or procedural), call-out queue |
| `src/scenes/menu/tab_companions.js` | `class CompanionsTab extends Tab` |
| `src/scenes/town/stable.js` | `class StableScene extends Scene` |
| `src/scenes/companion_join.js` | `class CompanionJoinScene extends Scene` |
| `src/data/story_companions.js` | `COMPANION_SCRIPTS` (Korean scripts, §13) — must not import `story.js` |
| `src/core/audio_companions.js` | registers §10 SFX via `defineSfx` (imported for side effects by `companions.js`) |
| `tools/test_companion_state.mjs`, `tools/test_companions.mjs`, `tools/balance_companions.mjs`, `tools/scan_mount_fit.mjs` | tests (§14) |

### 12.2 `companion_state.js` API

```js
ensureCompanionState(state) → state.companions
migrateCompanions(state) → void
heroLoadout(state, hero) → { mount, guards }            // ensures hero.companions
isOwned(state, id) → bool; ownedIds(state, kind?) → id[]; ownedEntry(state, id) → entry|null
unlockCompanion(state, id, { source = 'story', silent = false } = {}) → entry|null   // emits 'companionUnlocked'
startLevelFor(state) → number
addCompanionExp(state, id, n) → levelsGained                                          // emits 'companionLevelUp'
addBond(state, id, pts) → rankUps                                                     // emits 'bondUp'
bondRankOf(state, id) → 0..5
guardianSlots(state) → 1|2
equipMount(state, hero, id|null) → { ok, msg }
equipGuardian(state, hero, slot /*0|1*/, id|null) → { ok, msg }                       // moves if equipped in the other slot
companionAuraStats(state, hero) → { statKey: value }                                  // guardians only, rank-2 ×1.5
mountRideStats(state, id) → { statKey: value }
mountDerived(state, id, playerStats) → { maxHp, speedMul, trampleRatio, recall, cdMul, rank, lv }
guardianDerived(state, id, playerStats) → { stats, share, interval, skillCd, auraMul, rank, lv }
evaluateUnlocks(state) → id[]                                                          // flag/relics/boss/quest conditions (idempotent)
obtainEgg(state, id) → bool; eggStatus(state) → [{ id, ready, left }]; hatchEgg(state, id) → entry|null
tributeCost(state, id) → gold; giveTribute(state, id) → { ok, msg, exp, bond }
buyCompanion(state, id) → { ok, msg }
applyCompanionDebug(state, params /* URLSearchParams */) → void
```

### 12.3 Hook points in existing files (inserted by WP C0; each guarded, no-op when the module/stub does nothing)

**`src/game/player.js`** (coordinate: the movement/hit-feel spec also edits this file — C0 lands its hooks on top of whatever version exists; never restructure):
1. Constructor: `this.mount = null;` (CompanionSystem attaches `MountRider`).
2. `update()` top (after `tickTimers`): `this.mount?.tick(dt, world, this, inp);` (summon/dismount input, timers, auto-remount).
3. `get invuln()`: add `|| (this.mount?.invulnT > 0) || (this.world?.companions?.shieldT > 0)` (mount charge i-frames and 루미's dome; neither causes the i-frame blink).
4. Movement numbers: introduce `moveProfile()` → `this.mount?.riding ? this.mount.profile(this) : { speed: ch.move.speed*speedMul, accel: 3200, decel: 3600, airAccel: 2200, airDecel: 900, jump: jumpVel(), airJumps: maxAirJumps(), wallJump: ch.move.wallJump }` and use it in the move/jump code (if the movement spec already introduces an equivalent profile, extend that one instead — single source of truth).
5. Crouch: `this.crouch = !this.mount?.riding && …`.
6. Dash branch: `if (this.mount?.riding) { if (inp && input.pressed('dash')) this.mount.tryCharge(world, this, ax, input.axisY); } else if (…existing dash…)`; while `this.mount?.chargeT > 0` call `this.mount.updateCharge(dt, world, this)` instead of normal horizontal control.
7. `handleAttackInput`: after technique checks: `if (this.mount?.riding && down && this.mount.trySpecial(world, this)) { input.consume('attack'); return; }`; skip `ms.dash`, `ms.down`, `ms.crouch` when riding.
8. `startMove(world, mv, kind)`: `if (this.mount?.riding) mv = this.mount.adaptMove(mv);`.
9. `updateMove`: rect `this.relRect(x + L.dx, b.y + L.dy, w * (riding ? 1.15 : 1), b.h)` with `const L = this.mount?.riding ? this.mount.riderLift() : ZERO`; same lift in `fireMoveProjectiles` (`ox`, `oy`) and `spawnMoveFx`.
10. `handleJump`: first line `if (this.mount?.riding && this.mount.handleJump(world, this, dt)) return;`.
11. `physics()`: spikes/liquid: `if (!(this.mount?.riding && this.mount.hazard('spike'|liq, this, world)))` before the existing damage; after `moveBody`: `this.mount?.afterPhysics(dt, world, this, vyBefore);` (landing impact, unstuck/fit, gait, duck, ceiling clamp for flyers).
12. `takeHit()`: after the invuln/evade checks: `const mr = world.companions?.incoming(this, dmg, attack) ?? null; if (mr?.cancel) return false; if (mr) dmg = mr.dmg;` (`CompanionSystem.incoming` applies the knight's shield-wall ×0.7, then delegates to `MountRider.incoming` when riding; returns `null` when nothing applies). Then the existing body with two conditionals: when `mr?.mounted && mr.noStagger` → skip `hurtT`, `endMove()`, dash/charge reset and the knockback velocity, and use `iframes = 0.6`; when `mr?.mounted && !mr.noStagger` (heavy) → `hurtT = 0.2`, `iframes = 1.0`, knockback velocity ×0.5; when not mounted the existing values apply. `world.onPlayerHurt`, `bus.emit('playerHurt')` and the **existing death block (including the `sera_saint` revive)** run unchanged in all cases. If the knock-off happened inside `incoming`, the rider-size body is already restored before the knockback is applied.
13. `die()`: `this.mount?.dismount(world, this, 'death');`.
14. `refreshStats()`: after `computeStats`: `if (this.mount?.riding) addStats(this.stats, this.mount.rideStats());` then `this.mount?.refresh(this); this.world?.companions?.onStatsChanged();`.
15. `hurtbox()`: first line `if (this.mount?.riding) return this.mount.hurtbox(this);`.
16. `updateAnim()`: `if (this.mount?.riding) { this.mount.updateAnim(dt, world, this); if (!this.move && !(this.throwT > 0) && !(this.castT > 0)) { this.setAnim(this.mount.riderAnim(this)); } return; }` placed after the move/throw/cast timers.
17. `draw()`: riding branch per §11.4. `lights()`: `this.mount?.lights(L, this);`.
18. `ghostTrail()`: `if (this.mount?.riding) return this.mount.ghost(world, this, color);`.

**`src/game/world.js`**: import `CompanionSystem`; constructor before `loadRoom`: `this.companions = new CompanionSystem(this);` · `loadRoom` after `this.add(p);`: `this.companions?.onRoomLoaded(roomId);` · `onPlayerHit` (§5) · `onEnemyKilled` after `gainExp`: `this.companions?.onKill(e, expGain);` · `onBossDefeated` after `gainExp`: `this.companions?.onBossDefeated(boss);` · `startBoss` after creating the boss: `this.companions?.onBossStart(this.boss);` · `onPlayerFell` first line after the guard: `if (p.mount?.riding) p.mount.dismount(this, p, 'fall');` · `respawn` end: `this.companions?.onRespawn();` · `useSavePoint` + `healPlayer`: `this.player.mount?.healFrac(frac or 1)` · `collect('food')`: `p.mount?.healFrac(d.heal ?? 0.25)`.

**`src/game/combat.js`**: damage text colour `const color = res.crit ? '#ffd24a' : attack.dmgColor ?? (res.weak ? … )` (one expression; coordinate with the hit-feel owner).

**`src/game/skills.js`**: `castUltimate`: before `world.startUltimate`: `p.mount?.beforeCast(world, p, 'ult'); bus.emit('ultimateCast', { charId: p.hero.charId });` · `castSkill` / `castTechnique`: `p.mount?.beforeCast(world, p, id)` (dismounts for `DISMOUNT_SKILLS`).

**`src/game/stats.js`** `computeStats`: after the docs loop, before multipliers: `addStats(s, companionAuraStats(state, hero));` (import from `companion_state.js`).

**`src/game/state.js`**: `newGameState` → `ensureCompanionState(state)` before return; `migrateState` end → `migrateCompanions(s)`.

**`src/core/input.js`**: §6. **`index.html`, `css/style.css`**: §6 buttons + classes. **`src/core/audio.js`**: `defineSfx`, `SFX_KIT` exports. **`src/render/hud.js`**: one `drawCompanionHUD` call. **`src/scenes/menu/menu.js`**: MENU_TABS row. **`src/scenes/menu/common.js`**: `'paw'` glyph. **`src/scenes/index.js`**: `game.register('companionJoin', CompanionJoinScene)`. **`src/scenes/reg_town.js`**: `game.register('stable', StableScene)`. **`src/scenes/town/hub.js`**: `NO_COMBAT` add `'guard'`; `enter()` end and `onResume()` end → `companionHubEnter(this.game, this)`; `refreshBoard()` → `this.boardInfo.stableNote = companionHubNote(st)`. **`src/data/story.js`**: bottom `import { COMPANION_SCRIPTS } from './story_companions.js'; Object.assign(SCRIPTS, COMPANION_SCRIPTS);`. **`src/main.js`**: `initCompanions(game)` after `initQuests(game)`; debug `applyCompanionDebug(game.state, params)` in the `scene=stage` branch (and a `scene=hub` branch creating a debug state when `cmp`/`ch` params exist). **`src/core/events.js`**: comment list add the new events.

Stubs created by C0 export the full API with no-op bodies (`riding` false, `profile` null, `CompanionSystem.incoming` returns `null`, `shieldT` 0, draw functions return, etc.) so the game behaves exactly as before until the real packages land.

### 12.4 `CompanionSystem` (runtime) — key methods

```js
class CompanionSystem {
  constructor(world)                       // active = !world.arcade && !state.arcade && world.mode !== 'bossrush'
  onRoomLoaded(roomId)                     // add CompanionDirector; spawn Guardians at anchors; re-seat mount (fit or stow)
  sync()                                   // compare loadout key; attach/detach MountRider on player; (re)spawn guardians; pad classes
  update(dt)                               // (via Director) cooldowns, auto-skill, `guard` input, touch-widget taps, pad --cd vars, exp-per-tile
  onHit(target, info, attack)              // assist triggers; kill-chain bond counter
  onKill(enemy, exp)                       // exp share (guardians 40 %, mount 40 % if riding)
  onBossStart(boss) / onBossDefeated(boss) // noMount; bond +10 & 50 % boss exp to equipped
  onRespawn()                              // teleport guardians, reset mount (cd 0, full HP)
  onStatsChanged()                         // recompute guardian stats
  incoming(p, dmg, attack) → { dmg, mounted, noStagger, cancel } | null   // knight wall ×0.7, then MountRider.incoming when riding
  shieldT                                  // seconds of 루미's dome (player invuln, hook 3)
  tryGuardianSkill(auto = false) → bool
  hudInfo() → { mount: { id, state, hp, maxHp, cd, cdMax, riding, stamina, staminaMax } | null, guards: [{ id, cd, cdMax, auto }] }
  debug: { summon(), dismount(), knock(), skill(i), setLevel(id, lv) }    // for tests via window.__game.world.companions.debug
}
```

### 12.5 Events (bus)
New: `companionUnlocked {id, source}` · `companionLevelUp {id, level}` · `bondUp {id, rank}` · `mounted {id}` · `dismounted {id, reason}` · `guardianSkill {id, auto}` · `eggObtained {id}` · `eggHatched {id}` · `ultimateCast {charId}`.

---

## 13. Story & text content (`src/data/story_companions.js`)

Script format is the existing one (`who`, `text`, `name`, `portrait`, `cmd`). Companion speakers use explicit `name`/`portrait` overrides (e.g. `{ who: 'g_fairy', name: '루미', portrait: 'portraits/cmp_g_fairy', text }`).

`cmp_stable_open` (hub, first visit with chapter ≥ 1):
```
N  동쪽 성문 밖, 불에 그을린 마구간에 등불이 켜져 있다.
G  거기, 헌터. 잠깐 이리 와 봐.
H  {default:'…누구시죠?', kael:'…누구지?', bran:'무슨 일이오?', lia:'…뭐야?'}
G  그레타. 불타 버린 외곽 목장 주인이었지. 이젠 성문 밖 이 낡은 마구간이 전부야.
G  그날 밤 마구간이 통째로 불탔어. 끝까지 버틴 건 이 녀석 하나뿐이었지.
N  어둠 속에서 붉은 갈기를 늘어뜨린 흑마가 콧김을 내뿜는다. 눈동자 속에 꺼지지 않은 불씨가 일렁인다.
G  그림메인. 저 성으로 가는 길이라면 두 다리보다 네 다리가 빠를 거야. 데려가.
G  돌려줄 땐 살아서 돌려줘. 너도, 이 녀석도.
cmd flag stable_open
```
(G = `npc_greta`, H = hero, N = narrator.) The hub hook then runs `evaluateUnlocks` → warhorse → reveal.

`npc_greta_default`: `'말이든 영혼이든, 먼저 믿어 줘야 너를 믿어. 공물은 그 첫걸음이지.'`
`npc_greta_ch2`: `'밴시의 등불에서 요정을 꺼내 줬다며? 그 녀석, 너한테 푹 빠졌던데.'` / `'묘지 쪽에서 푸른 늑대가 울어. 시간 나면 들러 줘.'`
`npc_greta_ch4`: `'북쪽 설원에서 늑대 왕의 울음이 들려. 녀석은 강한 자만 태워. 힘을 증명해 봐.'`
`npc_greta_ch5`: `'그 알… 아직 따뜻해. 스테이지 하나만 더 다녀와. 그때쯤이면 깨어날 거야.'`
`npc_greta_ch8`: `'제단을 넓혀 뒀어. 이제 수호신 둘을 함께 모실 수 있을 거야. 둘이 싸우지만 않는다면.'`
`npc_greta_ch11`: `'요즘 녀석들이 밤마다 성 쪽을 보고 울어. 끝이 가까워졌다는 걸 아는 거지.'`
`q_cq_hati_start`: `'안개 묘지에서 푸른 늑대 영혼이 울고 있어. 원혼과 도깨비불이 그 녀석을 괴롭히는 거야. 열다섯만 쫓아내 줘.'`
`q_cq_hati_done`: `'들려? 울음이 그쳤어. …봐, 벌써 네 발치에 와 있잖아.'`
`q_cq_skoll_start`: `'늑대 왕 스콜은 약한 주인을 태우지 않아. 늑대 스무 마리를 쓰러뜨리고 돌아와. 굶주린 늑대든, 설원 늑대든, 지옥견이든.'`
`q_cq_skoll_done`: `'서리 냄새가 나… 왔구나. 스콜이 너를 인정했어.'`
`cmp_egg_ready`: `'알에 금이 가기 시작했어! 어서 제단으로!'`
`cmp_bat_arrive`: N `'마구간 지붕 위에 거대한 그림자가 거꾸로 매달려 있다.'` · G `'저 박쥐… 유물의 피 냄새를 따라온 거야. 백작의 옛 권속, 녹티스.'` · G `'이상하지. 너한테 고개를 숙이네.'`
`cmp_slot2`: G `'제단을 넓혀 뒀어. 이제 수호신 둘을 함께 모실 수 있어.'` (first hub visit with chapter ≥ 8).

Quests appended to `src/data/quests.js` (Greta section, before `QUEST_ORDER`):
```js
side({ id: 'cq_hati', name: '묘지의 푸른 울음', giver: 'npc_greta', req: { chapter: 2 },
  desc: '안개의 묘지에서 푸른 늑대의 영혼이 운다. 원혼·도깨비불 15마리를 쫓아내 영혼을 달래 주자. (보상: 수호신 「하티」 합류)',
  goal: { type: 'kill', enemy: ['ghost', 'wisp'], count: 15 }, reward: { gold: 600, exp: xp(3, 1), items: [] } });
side({ id: 'cq_skoll', name: '늑대 왕의 시험', giver: 'npc_greta', req: { chapter: 4 },
  desc: '늑대 왕 스콜은 강한 자만 태운다. 굶주린 늑대·설원 늑대·지옥견 20마리를 쓰러뜨려 힘을 증명하자. (보상: 탈것 「스콜」 합류)',
  goal: { type: 'kill', enemy: ['wolf', 'snow_wolf', 'hellhound'], count: 20 }, reward: { gold: 1500, exp: xp(5, 1), items: [] } });
```

---

## 14. Implementation plan — work packages

Order: **C0 first (serial, short)** → C1…C9 in parallel → C10 last. Each file has exactly one owner; "hook" edits in shared files are done only by C0. If a shared file is concurrently owned by another feature's package (player.js ↔ movement/hit-feel; hero.js ↔ hero-render; input.js/index.html/css ↔ mobile/controller; combat.js ↔ hit-feel; skills.js ↔ ultimate), C0 applies its guarded lines with the Edit tool on the current version (re-read first) and lists them in the file's header comment `// 동료 시스템 훅: …` so later refactors keep them.

| WP | Owns (exclusive) | Depends on | Description | Acceptance tests |
|---|---|---|---|---|
| **C0 Skeleton & hooks** | stubs of every new file in §12.1; hook lines in `player.js, world.js, combat.js, skills.js, stats.js, state.js, input.js, audio.js, events.js, hud.js, menu.js, menu/common.js (paw glyph), scenes/index.js, reg_town.js, hub.js, story.js, main.js, index.html, css/style.css` | — | Insert §12.3 hooks guarded by optional chaining; stubs export the full API (no-op). Add the two pad buttons/classes and key bindings. | `node tools/validate_maps.mjs` 0 errors; `tools/integration.mjs` (existing) passes; smoke `?scene=stage&stage=s01` right+attack+jump: 0 console errors; `?scene=hub` loads; pressing R/G does nothing and throws nothing. |
| **C1 Data & state** | `src/data/companions.js`, `src/game/companion_state.js`, `src/game/companion_events.js`, `tools/test_companion_state.mjs` | C0 | Full roster data (§1, §3.4, §3.9, §4.9, lines), formulas (§2, §9), state API (§12.2), migration & retro unlocks (§8), bus wiring, debug params. | `node tools/test_companion_state.mjs`: formulas match §9 table; unlock evaluation on fixtures (ch0 empty; ch3 with b_dullahan → 코슈타 pending; ch5 with b_bonedragon → egg ready; relics 5 → 녹티스; quests.done cq_hati → 하티); migration idempotent (run twice, deep-equal) and survives garbage (`companions: 5`, unknown ids, duplicate guards, slot-2 at ch3); JSON round-trip; tribute/buy/hatch gold & exp math; `guardianSlots` 1→2 at ch8. |
| **C2 Mount runtime** | `src/game/mount.js`, `tools/test_mount.mjs` | C0, C1 (C4 rig optional: fall back to data seat + sine bob) | `MountRider` full behaviour §3 (states, fit/unstuck, profile, gallop ramp, turn, jump/glide/fly/swim/wall-kick, charge, 6 specials, landing impact, damage model, hazards, knock-off/recall/MountGhost, ult/skill dismount+auto-remount, riderView, adaptMove, riderLift, hurtbox, heal). `DISMOUNT_SKILLS` from grep. | Headless (`?scene=stage&stage=s01&cmp=all&cmplv=10&mount=m_warhorse&ride=1`): riding within 0.6 s, `p.w===60`; hold right 1.5 s → `|vx|>=390`; dash → spawned zombie takes damage & launches; ↓+X → special cooldown set, enemies in r180 hit; `enemyStrike` hit → mount HP drops, rider loses ≤ 30 % of the pre-absorb damage, no `hurtT` on light hit; mount HP→1 then hit → `state==='recall'`, body back to `ch.size`; R twice → stowed/re-summoned after cd; fall into a pit (s01 room with a pit, or teleport below map) → recall + safe spot; `gotoRoom` while riding → never embedded (fits() true); s08 water room → swim speed ≤ 0.6×; wyvern: 3 flaps then glide `vy<=150`; bat: ascend drains stamina, can't exceed y 4 without `exitUp`; ult while riding → dismount then auto-remount ≤ 2 s; every mount summoned in every stage start room without errors. |
| **C3 Guardian runtime & system** | `src/game/companions.js`, `src/game/guardian.js`, `tools/test_guardians.mjs` | C0, C1 | `CompanionSystem` + Director (§12.4), guardian entity (§4.1–4.3), 8 AIs (§4.9), skills/auto, assist, resonance, auras via stats hook, exp/bond runtime, pad classes/`--cd`, touch widget taps, hub enter flow (`companionHubEnter`, `companionHubNote`). | `?…&guards=g_knight,g_imp`: 2 `kind==='companion'` entities; teleport player +2000 px → guardians within 620 px after 0.5 s; spawned enemies lose HP within 3 s with no player input; `hitstop` never set by guardian auto hits; combo count rises but `combo.t` not refreshed by guardian hits; G → cooldown set & `guardianSkill` emitted; auto-skill fires with 3 enemies near (touch mode); finisher hit → `'협공!'` assist; owl outlines secrets in s01 H-wall room; clock skill sets `timeStop≈2`; reaper executes a 10 %-HP zombie; town: guardians never attack, `G` ignored; `ultimateCast` with bond 3 → free skill casts. |
| **C4 Mount rendering** | `src/render/mount_rig.js`, `src/render/mounts.js`, `tools/.proto_specCompanions/…` galleries (throwaway) | C0 (C1 palettes) | Rig & gaits (§11.1), 6 mounts × all states (§11.2), back/front layers, ghost/tint, awakened variants, icons, quality levels. | Gallery screenshots (every mount × idle/walk/run/jump/land/charge/special/hurt/knocked/summon/dismiss/swim + flyer states) reviewed at 2× zoom: no z-fighting, hooves plant (no foot sliding > 3 px during stance), seat point moves with the saddle; perf ≤ 0.35 ms/draw (1000-draw loop in headless). |
| **C5 Guardian rendering** | `src/render/guardians.js` | C0 | 8 guardians × states (§11.3), FX helpers, awakened variants, icons. | Gallery screenshots of every state; ≤ 0.15 ms/draw; FX helpers render inside Hitbox/Projectile without errors. |
| **C6 Rider pose** (hero-render owner) | `src/render/hero.js` (+`hero_parts.js` if needed) — rider section only | C0; runs after/within the hero-render package | Implement §11.4 (`p.ride`, seated legs, far-leg skip, ride anims, attack poses seated) for all 6 characters × class looks. | Screenshots: each character seated on warhorse & wolf (idle, ground combo frames, charge, cast, hurt); pelvis within 2 px of seat; no leg IK flips; menu preview uses the same path. |
| **C7 UI** | `src/render/companion_hud.js`, `src/scenes/menu/tab_companions.js`, `src/scenes/companion_join.js` | C0, C1 (C4/C5 for previews; stubs fine) | HUD widgets + call-outs (§7.1), 「동료」 tab (§7.2), join reveal (§7.4). Optional C7b: arcade loaners (`scenes/front/arcade.js` buildArcadeState) only if the arcade owner agrees. | Screenshots at 960×540 and 1280×540, desktop & `--mobile`: no overlap with skill slots, boss bar, score block; tab keyboard-only flow (equip mount, equip 2 guardians at ch8, toggle auto) and touch-only flow both work; reveal skippable after 1.2 s; all texts Korean; 0 console errors. |
| **C8 Town & content** | `src/scenes/town/stable.js`, `src/scenes/town/facades.js` (stable painter + sign icon only, add-only), `src/data/town.js`, `src/data/npcs.js` (Greta entry), `src/data/story_companions.js`, `src/data/quests.js` (append 2 quests) | C0, C1 | Map extension & Greta (§2.2), facade, stable scene (§7.3), scripts (§13), quests. | `?scene=hub&cmp=&ch=1`: Greta intro plays once, warhorse revealed, flag set; walking east reaches the stable (x≈4296), `▲` enters; buy 바르그 with 6,000 G → owned & reveal; tribute math; egg hatch flow with a debug egg; Greta quests appear on the board and in the stable; `validate_maps` unaffected; town screenshot shows the stable in style with the rest. |
| **C9 Art & audio** | `assets/portraits/cmp_*.webp`, `assets/portraits/npc_greta.webp`, `tools/kling/manifest.json` (append), `src/core/audio_companions.js` | C0 (audio API) | 15 Kling portraits (§11.5), watermark cleaned, webp; fill `iconFocus` in data via a PR note to C1 (or C1 reads a `tools/kling/icon_focus.json` produced here); 26 SFX recipes (§10). | Images exist, no watermark visible in bottom-right at 100 %, ≤ 250 KB each; every SFX name plays without errors (`audio.sfx(name)` loop in headless), peak level comparable to existing SFX. |
| **C10 QA & balance** | `tools/test_companions.mjs`, `tools/balance_companions.mjs`, `tools/scan_mount_fit.mjs` | all | End-to-end scenarios (below), balance model (§9 limits), room fit scan, save/load, mobile & gamepad. | See next table; must end with 0 console errors across all scenarios. |

**C10 end-to-end checklist (`node tools/test_companions.mjs`, headless Chromium via `tools/serve.mjs`):**
1. New game → prologue skipped via state → hub at ch1 → Greta intro → warhorse; summon in town; enter s01 riding; clear s01 room 1 mounted; results; back to hub.
2. Old save fixture (no `companions`, ch6, bosses b_banshee/b_dullahan/b_crimson/b_bonedragon/b_grimoire) → load → migration grants 루미, 코슈타, 가웨인, 미네르바 + ready 크론 egg; pending reveals shown in hub (max 3), rest `NEW` in the menu.
3. All 6 mounts × stages s01–s13 start rooms: summon/dismount/charge/special/jump; no embed (`fits`), no console errors.
4. All 8 guardians active in s05 & s11 for 30 s of scripted play: enemies die, no hitstop spam (`world.hitstop` stays 0 without player hits), frame time delta vs. no companions ≤ 1.5 ms (desktop headless average).
5. Boss fights s03 (둘라한) and s12 (드라큘라) riding with 2 guardians: intro, fight to 50 % via `eval` damage, knock-off by boss hit, re-summon after recall, resonance on ultimate at bond 3.
6. Save at a coffin while riding → reload → state intact; export/import code round-trip keeps `state.companions`.
7. `--mobile` (844×390): pad shows 탑승/수호 when equipped, taps work, cooldown overlay updates, canvas widget taps work, no overlap with the stick.
8. Gamepad: override `navigator.getGamepads` to press button 10/11 → summon / skill.
9. `tools/scan_mount_fit.mjs` report: per room, number of 2-tile-high corridors vs. places where the mounted body cannot pass (informational) and **0 rooms whose `P` start fails `findMountSpot` with the widest mount after the ±32 px nudge** (if any, the room is listed for the map owner; auto-stow covers it at runtime).
10. `tools/balance_companions.mjs`: all guardian shares within [6 %, 30 %] at the §9 check points; mount buffer ratios printed.

---

## 15. Risks & coordination notes

- **player.js contention** with the movement/hit-feel package: C0's hook list is small and guarded; if the movement package introduces its own movement profile, C0 must extend that function instead of adding a parallel one.
- **hero.js contention**: the rider pose (C6) must be scheduled inside or after the hero-render upgrade; until then `drawHero` ignores `p.ride` and the rider floats standing on the saddle (acceptable placeholder only for development, not for release).
- **Mounted body width (56–70 px)** cannot enter 1-tile-wide shafts: by design (dismount). `scan_mount_fit` informs the map owner; no map edits are required for correctness.
- **Flight mounts can bypass platforming** (by design, late game); ceiling clamp prevents leaving room bounds; `exitUp` rooms still work.
- **Boss mechanics** (grabs, arena gimmicks) may interact badly with the bigger mounted hurtbox → boss owners can set `noMount: true`; QA decides per boss.
- **Balance drift**: guardian share uses the rider's stats; if the stat economy changes (Part 2 gear), re-run `balance_companions.mjs`.
- **Touch pad crowding**: two more buttons; the mobile spec owns the final layout. Canvas-widget taps are the fallback.
- **Performance on low-end phones**: quality `low` path (§11) must be honoured; guardians are capped at 2.
