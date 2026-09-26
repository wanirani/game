// [임시 최소 구현] 스킬 담당 에이전트가 전면 확장.
// SKILLS[id] = { id, charId, name, desc, type:'active'|'passive', branch, row, maxLv, reqLevel, req:[선행스킬id], reqClass?,
//                cost(MP), cd(초), stats(패시브: {stat:[lv1..lv5]}), color, icon? }
// SKILL_TREES[charId] = { branches: [{ id, name, desc, skills:[id,...] }] }
export const SKILLS = {};
export const SKILL_TREES = {};
