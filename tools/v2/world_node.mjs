// WORLD lane: node-side helpers shared by the world/env tools.
import fs from 'node:fs';
import { setPropPack, propPack } from '../../src/v2/env/baked.js';
/** load the baked prop pack from disk (the browser fetches it: ensureProps) */
/** BN_PROPS_PACK=<props.bin>: check against another pack (an earlier one, a scratch build) */
export function loadPropsNode(file = process.env.BN_PROPS_PACK || 'assets/v2/props/props.bin') { if (!propPack() && fs.existsSync(file)) setPropPack(fs.readFileSync(file)); return propPack(); }
