// v2g seams — one-line switches for the lanes that plug in later (docs/v2/ENGINE_API.md 3, 4).
// A loader is `() => import('../<lane>/index.js')`. Keep it null until that file exists: the release build resolves
// every literal import() path, so a loader that points at a missing file stops the build.
//   WORLD_LOADER  module exports AREAS (id -> async () => area definition, docs/v2/AREA_FORMAT.md)
//   UI_LOADER     module exports createHud(game) -> { update(dt, state), draw(ctx, state), resize?(), release?(), modal?, hidePad? } (docs/v2/UI_API.md)
//   UI_DEFAULT    false = the built-in HUD unless asked for (address option v2ui=1 or localStorage 'bn.v2.ui' = '1');
//                 true  = the UI lane's HUD by default (v2ui=0 goes back). Flip it when the UI lane says it is ready.
export const WORLD_LOADER = null;   // () => import('../world/index.js')
export const UI_LOADER = () => import('../ui/index.js');
export const UI_DEFAULT = false;
