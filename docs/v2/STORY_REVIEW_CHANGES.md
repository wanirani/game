# STORY-REVIEW — what was changed (2026-11-18, UTC)

Files touched: tools/v2/story_stage/{run.js, events.js, dialogs_now.js, dialogs_past.js, dialogs_dungeon.js, text.js, items.js, people.js, flags.js(synced)}, tools/v2/story_check.mjs, tools/v2/story_route.mjs, tools/v2/story_break.mjs (new), docs/v2/DATA_FORMAT.md. Nothing under src/. The folder as STORY left it is kept at /tmp/claude-0/-home-user-game/01bb32c1-b295-5e05-8160-23ed04e60e08/scratchpad/stage_before.

## A. Canon contradictions fixed (before → after)

| # | where | before | after | why |
|---|---|---|---|---|
| 1 | 식탁, 에드문트 | 에드문트 발크레인이다. / 동이 트면 성에 오른다. | 에드문트 발크레인이다. / 달이 지기 전에 성에 오른다. | 성은 붉은 달 밤에만 솟고, 에드문트는 그 밤 안에 성에 오른다(GDD 5.3 7·16장). 「동이 트면」은 그 밤이 끝난 뒤다 |
| 2 | 그 밤의 농부 | 붉은 달만 뜨면 이 모양이라니까. | 붉은 달이 뜨더니 이 모양이라니까. | 붉은 달은 백 년에 한 번 — 한 사람이 두 번 겪을 수 없다 |
| 3 | 오늘 밤, 끝난 뒤의 신부 | 허허. 자네 얼굴을 보니 / 오래된 밤이 생각나는군. | 허허. 종소리가 맑아졌군. / 자네 덕일세. | 신부의 비밀은 12장까지 아낀다. 첫 조각에서는 「로테」에 말을 잃는 것뿐(GDD 12절). 그리고 이 시점의 소년 알베르토는 아직 카엘을 만난 적이 없다(규칙 10) |
| 4 | 첫 건넘 뒤, 카엘 → 신부 | …엘리제도 / 거기 있습니다. 살아 있습니다. | …엘리제도 / 거기 있습니다. 데려오겠습니다. | 카엘은 엘리제가 끌려갔다는 것만 안다. 살아 있는지는 모른다 |
| 5 | 카엘 → 세라 | 납골 언덕에 있습니다. / 찾으러 갑니다. | 납골 언덕으로 끌려갔습니다. / 찾으러 갑니다. | 같은 까닭 |
| 6 | 조종 넷을 얻는 곳 | (오늘 밤) 석관 곁에 작은 종 넷이 놓여 있다. 조종이다. → 얻었다 | 메아리 창: 그 밤의 석관 곁에 작은 종 넷이 / 놓여 있다. 조종이다. → 그 밤으로 건너가서 「석관 곁의 조종 넷을 챙긴다.」 | 오늘 밤의 물건을 그 밤에 두고 오면 「한쪽으로만 흐른다」(규칙 3)에 어긋나고, 어디서 난 종인지 설명할 수 없다. 그 밤의 것을 그 밤에 건다 |
| 7 | 밴시 여왕, 달아날 때 | …그 밤이 좋았단다. / 다들 살아 있던 밤. | …그 밤이 좋았단다. 넷째 발크레인이 / 아직 살아 있던 밤. | 그 밤에도 발크레인 셋은 이미 묻혀 있었다(비석 셋). 살아 있던 사람은 넷째(에드문트)다 |
| 8 | 석관의 이름 | 곡하는 이 마그다 | 곡하는 이 프리다 | 「마그다」는 GDD 15절 8번에서 로테의 다른 이름 후보로 소유자께 보인 이름이다. 겹치지 않게 바꿨다 (소유자 확인 필요) |
| 9 | 쓰러졌을 때, 신부를 만나기 전 | 알베르토 신부: 촛불은 다시 켜면 되네. / 일어서게. | 카엘: (종소리가 멎지 않았다. 다시 간다.) · 두 번째: (서두르지 마라. 밤은 길다.) | 성당에 닿기 전에는 신부를 만난 적이 없다 |
| 10 | 성당, 약속 | 카엘: 먼저 올라가라. 곧 따라가마. | 카엘: 줄은 네가 잡아라. / 너는 내가 지키마. (엘리제가 제 발로 뛰어 올라간다. 신부: 아이는 벌써 종탑으로 올라갔네.) | 사냥꾼이 박쥐 가득한 종탑에 아이를 먼저 올려 보내는 꼴이었다. 약속의 내용도 「지킨다」로 분명해져 뒤의 「약속했잖아」「약속했습니다」와 맞는다 |
| 11 | 그 밤의 묘지기 (유령을 보기 전에 온 경우) | 카엘: 이름 없는 무덤 둘을 찾습니다. | (새 갈래) 묘지기: 오늘 묻은 남매의 비석이 비어 있습니다. / 석수가 역병이 무서워 달아났답니다. | 유령을 아직 못 본 카엘이 그 무덤을 찾을 수는 없다 |
| 12 | 까마귀 깃털 설명 | 납골당 문간에 떨어져 있었다. 누가 두고 갔을까. | 납골당 맨 안에서 발치에 떨어졌다. 누구의 것일까. | 대사에서는 보스 방에서 발치에 떨어진다 |
| 13 | 맺음 | 여관 창가에 까마귀 깃털 하나가 / 놓여 있다. | 여관 창가에도 까마귀 깃털 하나가 / 놓여 있다. | 납골당에서 이미 한 번 떨어졌다. 「따라붙는다」는 뜻이 살게 |

Checked and left as they are: the years (only 1797 = 오늘 밤, 1697 = 그 밤; no weekday or date anywhere), 넷째 붉은 달 = 1697 / 다섯째 발크레인 = 카엘, 비석 셋(그 밤)·넷(오늘 밤), 고조할아버지, 수녀 일곱과 총잡이 울프람, 마르타의 조카 엘리제, 로크가 두 밤에 있음(「같은 가면」은 그 밤에 로크와 말한 뒤에만 나온다), 종이 앞날의 말을 덮는 장면, 엘리제는 제 밤으로 돌아오는 것이라 규칙 7에 걸리지 않음, 은 열쇠(그 밤에 벼려 백 년 묵은 것)를 그 밤 자물쇠에 쓰는 것.

## B. Korean proofreading (before → after)

| where | before | after | why |
|---|---|---|---|
| 하드윈 1세 | 묘지기와 나, 둘만 쥐는 열쇠구려. | 묘지기와 나, 둘만 쥐는 열쇠라오. | 「~구려」는 감탄. 사실을 일러 주는 말은 「~라오」 |
| 하드윈 1세 | …날이 새야 / 끝나오. 쇠도 식어야 하오. | …날이 새야 / 끝나오. 식히는 데도 한참이오. | 쇠·은을 고르기 전인데 「쇠」라고 못박았다 |
| 하드윈 1세 (다시 말 걸기) | 열쇠는 아직이오. / 쇠가 식어야 하오. | 열쇠는 아직이오. / 식으려면 멀었소. | 은을 골랐을 때도 나오는 말 |
| 납골당 고르기 · 해설 | 돌 석상 (4곳) | 석상 | 겹말(석상 = 돌로 만든 상) |
| 카엘 → 밴시 여왕 | 잘 가라. 배웅은 내가 하지. | 잘 가십시오. / 이번 배웅은 제가 합니다. | 떠나보내는 어른에게는 카엘의 말씨(합쇼체)로. 적일 때의 반말과 구별된다. 말투 표에 한 줄 더함 |
| 단추 안내 | 맞는 순간 「구르기」 — 튕겨낸다 | 서서, 맞는 순간 「구르기」 — 튕겨낸다 | 밀면서 누르면 구른다(PLAY_API). 막기 안내와 같은 말로 |
| 하드윈(손자) | 할아버지 때부터 내려온 건데, / 이름 칸이 비어 있소. ‖ 선불이랍디다. (두 쪽) | 한 쪽으로 | GDD 2.5 의 한 마디 그대로 |

| 그 밤의 납골당 | 그 밤의 예배굴 · 촛불 켠 예배굴 | 그 밤의 예배실 · 촛불 켠 예배실 | 「예배굴」은 사전에 없는 지어낸 말이라 오자로 보인다 |
| 그 밤, 새긴 비석 | 한나. ‖ 틸. 한나의 동생. | 한나. 1697년. ‖ 틸. 1697년. 한나의 동생. | 오늘 밤의 같은 비석(「한나. 1697년.」)과 글이 달랐다 |
| 쓰러졌을 때 | 화면을 누르면 촛불 앞에서 다시 일어난다 | …다시 일어선다 | 띠의 「다시 일어선다」와 같은 말로 |
| 목표 | 큰길을 지나 광장으로 | 큰길을 지나 광장으로 간다 | 다른 목표는 모두 「~다」로 끝난다 |
| 물건: 빈칸 주문서 | 하드윈 1세의 주문서. 이름 칸이 백 년 동안 비어 있었다. | 받을 이 「채찍 든 길손」. 백 년 비어 있던 이름 칸에 「카엘」. | 손자가 「…당신이오? 채찍 든 길손이.」 하고 알아보는 까닭이 글에 없었고, 얻는 순간에는 이름이 이미 적혀 있다 |
| 그림자 속 목소리 | 발크레인. ‖ 그 늙은 신부를 조심해. (두 쪽) | 한 쪽 두 줄 | 보스 뒤 대사가 7 쪽 → 6 쪽 |
| 한나 (이름을 찾은 뒤) | 응, 틸. 이제 같이 가자. | 응, 틸. 길손 가는 것만 보고 가자. | 바로 뒤 납골당 문 앞에서 한나가 다시 말한다 — 「같이 가자」 하고 떠난 뒤가 되면 어색하다 |
| 에드문트의 비석 (길종을 건 뒤 다시 볼 때) | (수프가 식는다고 하셨지.) | (식기 전에, 라고 하셨지.) — 길종을 걸기 전에 볼 때는 앞의 줄 그대로 | 묘지에서 헤어질 때 에드문트의 마지막 말이 「그래, 식기 전에」 |
| 종탑, 종에 금이 가는 장면 | 해설 세 쪽(박쥐 떼가… / 금 사이로… / 산 위로 은빛 별똥…) + 대사 두 쪽 | 종탑이 지어진 곳에서는 대사 두 쪽만(나머지는 카메라와 소리). 종탑이 없는 지금은 해설을 그대로 둠 | 해설은 화면에 보이는 것을 말하지 않는다(말투 표). 첫 20분의 큰 장면을 글로 읽히지 않게 |

Name table (every occurrence checked by search): 카엘 · 카엘 발크레인 / 알베르토 신부 / 엘리제 / 로테 / 세라(사냥꾼님) / 마르타(사냥꾼 양반, 이모) / 하드윈 · 하드윈 1세 / 에드문트 발크레인(젊은이, 대장) / 로크(나리) / 아그네스 수녀 / 울프람 / 묘지기(손님) / 한나 · 틸 / 밴시 여왕 / 프리다 — 에슈빌 · 발라키르 · 흑묘 여관(오늘 밤) · 작은 주막(그 밤) · 대장간 · 성당 · 종탑 · 안개의 묘지 · 납골 언덕 = 배웅의 납골당 · 장미 수녀원 · 잠긴 수문 — 큰 종 · 길종 · 조종 · 종 조각 · 발크레인 매듭 · 빈칸 공고 · 빈칸 주문서 · 낡은 은 열쇠 · 묘지기의 끌 · 로테의 빵 · 까마귀 깃털. No variant spellings found. Button names inside 「」 in every tip: 공격 · 점프 · 구르기 · 솜씨 · 종 · 다음 적 only.
Speech levels: one per person, unchanged except the two lines above. Widest line 19 (limit 30); no page over two lines.

## C. Play value (cut or moved)

| where | before | after |
|---|---|---|
| 12–15 성당 | 9 쪽을 이어서 | 7 쪽. 신부의 두 마디(「종이 멎으면 마을도 멎는다네」「두려워 말게…」)는 다시 말 걸 때로 옮김 |
| 20–26 로테 | 8 쪽 | 6 쪽. 「종에 금이 없다」는 종 앞에서(이미 있던 해설), 「큰길은 조심해요」는 로테에게 다시 말 걸 때 |
| 26–33 식탁 | 18 쪽을 한 번에 | 두 번에 나눔: 식탁과 종소리(8 쪽, 「종이 울린다」 해설은 지우고 종소리로) → 목표 「에드문트에게 조각을 보인다」 → 다시 말 걸면 매듭과 빈칸 공고(7 쪽). 아그네스·울프람의 주고받기 한 번, 「큰 종 앞에서 울려 봐라」(다시 말 걸 때 나옴)는 뺌 |
| 26–33 대장간 | 고르기 앞 7 쪽 | 6 쪽 |
| 33–36 손자의 서랍 (쇠 열쇠 갈래) | 9 쪽 | 7 쪽 |
| 58–68 에드문트 | 해설 1 + 6 쪽, 건너간 뒤에 채찍 걸기 안내 | 6 쪽. 에드문트와의 대화는 끊긴 길 **이쪽**(새 자리 grave.edmund)에서, 길종 걸기는 건너편에서 — 채찍 걸기 안내가 건너기 **전**에 나온다 |
| 114–118 두 종지기 | 9 쪽 | 6 쪽. 빵 이야기 3 쪽은 종 앞에서 건너기 직전으로 |
| 118–120 맺음 | 7 쪽 | 6 쪽 (「…….」 한 쪽 뺌) |
| 20–26 그 밤의 주막 문 | 큰길을 치우기 전에는 에드문트가 나오지 않는데 까닭을 알 길이 없었다 | 주막 문에서 「작은 주막. 안에서 문을 걸어 잠갔다.」 「(큰길의 주검부터 쓰러뜨려야 열겠군.)」 |
| 단추 안내 | 「공격」과 「다음 적」이 한꺼번에 | 「다음 적」은 첫 무리를 쓰러뜨리고 둘째 무리가 올 때 |
| 단추 안내 | 「건넘」이 대장간에서(맡긴다 안내에 바로 이어) | 큰 종이 있는 성당 마당에 들어설 때 |
| 단추 안내 | 보스전에서 같은 「쫓아 건넌다」가 두 번 | 두 번째는 「같은 종에서 오늘 밤으로 돌아간다」 |

Longest stretch of pages without the player doing anything is now 8 (the table, with the bell in the middle); everything else is 7 or fewer (measured on the regenerated transcript). Exception: the text bridge that stands in for the unbuilt ossuary (route B) is 36 pages in one go — it disappears when the ossuary is built. The first 15 minutes have 2 pages of telling before the first fight.

Also: Sera no longer stands in the square while she is at the lantern stand in the ossuary (hideActor on arrival, showActor at the ending); the line under the section name after the smithy now says what is still missing (「주막의 사냥꾼을 만난다」 / 「에드문트에게 조각을 보인다」 / 「큰 종 앞에서 종을 친다」); the transcript and the owner script show the bell that covers Kael's word (〔소리: 종이 울린다〕).

## D. Runner and sequence fixes (found by tools/v2/story_break.mjs)

1. Out-of-order events changed the story (a `boss.phase sent` or `group.clear tower_bats` in the first minute set flags, gave items and moved the hero to 1697). → guards added (`promise`, `area:ossuary_*`, `area:graveyard_past`).
2. A bell pressed twice during one crossing crossed and crossed straight back; a person pressed three times played their lines three times. → the runner drops a second start of a sequence that is running or queued.
3. A save taken during the first crossing, the road-bell crossing or the last crossing, loaded with the hero already on the 1797 side, left the game stuck (bell dead, no ending). → sequences now end at the area change; the other side is its own sequence on `area.enter` (`ev_return_first`, `ev_hung_now`, `ev_ending_home`); `ev_bell_lost` is the net. `ev_keepers` now saves.
4. The tower door and the ossuary door raise `exit.locked` (not `exit.missing`) in today's world until the scene has `unlockExit`; nothing listened, so the game would have stopped at minute 15. → `ev_tower_locked`, second press on `ev_ossuary_exit_now`, `ev_ossuary_exit_past`.
5. Stress added to the break script: every step of routes A and B fired three times in a row (same end state), every scene cut off by quitting and replayed from the save (5 plays × 4 routes, about 2,500 cuts, same end state), 60,000 random events in 300 games (no throw, nothing left running).
6. 10,000 unmatched events: about 2–6 ms in total (0.2–0.6 µs each), heap +3 KB — no per-event allocation.

## E. Final numbers (2026-11-18 00:27 UTC)

25 people · 78 dialogue sets, 161 variants, 299 pages (265 shown in play A, 266 in play B) · 86 sequences (29 wait for the bell tower / ossuary / two hooks, 6 bridges, 1 safety net) · 11 items · 24 objectives · 13 chronicle entries (8 written or filled in the first release, 5 blanks stay open) · 43 flags · 24 tutorial prompts.
Hangul: 556 distinct syllables in the text (560 with the code comments); 11 are new to the first-frame fonts (Noto Sans KR, Hahmlet, BN Brush): 넜닭댓둡딨밧뵌샌앓칩켠 — counted twice, by the check and by a separate fontTools script. The review added no new syllable.
`node tools/v2/story_check.mjs` → OK: 0 errors, 0 warning(s) (also with `--dir` on a copy of the folder). `node --expose-gc tools/v2/story_break.mjs` → OK: all break tests passed (41 checks).
