// WORLD lane: node-side helpers shared by the world/env tools.
import fs from 'node:fs';
import { setPropPack, propPack } from '../../src/v2/env/baked.js';
/** load the baked prop pack from disk (the browser fetches it: ensureProps) */
export function loadPropsNode(file = 'assets/v2/props/props.bin') { if (!propPack() && fs.existsSync(file)) setPropPack(fs.readFileSync(file)); return propPack(); }
