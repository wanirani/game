# Higgsfield 그림 만들기 (7단계부터 Kling 대신)

Kling 크레딧은 아끼고, 새 그림은 Higgsfield MCP(서버 id `059c3459-8a16-4f9a-84d0-008cf204d39d`)로 만든다.
화풍은 지금 게임 그림(채색 판타지, `docs/specs/ART_DECISION.md`)을 그대로 따른다 — 애니풍 금지.

## 값

| 모델 | 1장 | 쓰임 |
|---|---|---|
| `gpt_image_2_5` | 0.25 크레딧 | 기본. 참고 그림을 잘 따르고 `#00FF00` 녹색 배경 지시를 지킨다 (시범: 공허 순례자 두건 아이콘) |
| `nano_banana_pro` (2k) | 2 | 큰 그림 · 초상화 · CG 에서 gpt 결과가 모자랄 때만. **녹색 배경 지시를 무시하고 흰 배경을 낼 때가 있다** → 오려야 하면 `remove_background` |
| `flux_3_image` (1k) | 2 | 참고 그림 여러 장(최대 10)이 필요할 때 |

## 순서 (에이전트)

1. 도구 불러오기: `ToolSearch` 로
   `select:mcp__059c3459-8a16-4f9a-84d0-008cf204d39d__media_upload,mcp__059c3459-8a16-4f9a-84d0-008cf204d39d__media_confirm,mcp__059c3459-8a16-4f9a-84d0-008cf204d39d__generate_image_batch,mcp__059c3459-8a16-4f9a-84d0-008cf204d39d__jobs_wait,mcp__059c3459-8a16-4f9a-84d0-008cf204d39d__remove_background`
2. 참고 그림 올리기 (지금 게임 그림을 띠로 이어 붙여 한 장으로):
   `media_upload({filename, content_type:'image/png'})` → 돌려준 `upload_url` 에
   `curl -sS -X PUT -H "Content-Type: image/png" -H "If-None-Match: *" --data-binary @FILE '<upload_url>'` (200 이어야 함)
   → `media_confirm({type:'image', media_id})`.
3. 만들기: `generate_image_batch({requests:[{index, params:{model:'gpt_image_2_5', aspect_ratio:'1:1', prompt, medias:[{value:<media_id>, role:'image_references'}]}}]})` — 한 번에 최대 12장.
   프롬프트 끝에 늘 `no text, no border, no frame, plain flat solid #00FF00 green background` 를 붙인다.
4. 기다리기: `jobs_wait({jobs:[{index, job_id}], timeout_seconds:15})` 를 끝날 때까지 반복 → `result_url` 을 `curl -sS -o` 로 받는다.
5. 오리기: `python3 tools/higgsfield/key_green.py IN.png OUT.png --size 128` (아이콘) / `--trim` (퍼핏 부위·초상화).
6. **받은 그림은 반드시 눈으로 본다** (Read 로 PNG 열기). 화풍이 어긋나거나 글자·테두리·녹색 테두리가 남으면 버리고 다시.
7. 기록: `tools/higgsfield/manifest_<묶음>.json` 에 `{file, model, prompt, job_id, credits, kept}` 를 묶음마다 따로 (공유 manifest 를 고치지 않는다).

## 지킬 것

- 사람 얼굴 사진 · 실존 인물 · 상표를 넣지 않는다. 비밀값(키스토어 · 토큰)을 올리지 않는다.
- 묶음마다 크레딧 상한을 지키고 보고서에 쓴 크레딧을 적는다.
- `get_cost:true` 로 미리 값 확인 가능 (`generate_image` 단건).
