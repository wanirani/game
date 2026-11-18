// v2g seams — one-line switches for the lanes that plug in later (docs/v2/ENGINE_API.md 3, 4).
// A loader is `() => import('../<lane>/index.js')`. Keep it null until that file exists: the release build resolves
// every literal import() path, so a loader that points at a missing file stops the build.
//   WORLD_LOADER  module exports AREAS (id -> async () => area definition, docs/v2/AREA_FORMAT.md)
//   UI_LOADER     module exports createHud(game) -> { update(dt, state), draw(ctx, state), resize?(), release?(), modal?, hidePad? } (docs/v2/UI_API.md)
//   UI_DEFAULT    true = the cut-glass interface (src/v2/ui) unless switched off: address option v2ui=0, localStorage 'bn.v2.ui' = '0',
//                 or the pause menu row that switches between the new buttons and the old pad (remembered in 'bn.v2.ui').
export const WORLD_LOADER = () => import('../world/index.js');
export const UI_LOADER = () => import('../ui/index.js');
export const UI_DEFAULT = true;
