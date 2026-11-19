// Story data of the first release, one object. Shape: docs/v2/DATA_FORMAT.md.
// Everything here is plain data except run.js (the runner). No imports from outside this folder.

import { PEOPLE } from './people.js';
import { DIALOGS_NOW } from './dialogs_now.js';
import { DIALOGS_PAST } from './dialogs_past.js';
import { DIALOGS_DUNGEON } from './dialogs_dungeon.js';
import { EVENTS } from './events.js';
import { ITEMS, OBJECTIVES } from './items.js';
import { CHRONICLE } from './chronicle.js';
import { FLAGS } from './flags.js';
import { TEXT } from './text.js';
import { SHOP } from './shop.js';
import { createStory } from './run.js';

export const STORY = {
  version: 1,
  PEOPLE,
  DIALOGS: Object.assign({}, DIALOGS_NOW, DIALOGS_PAST, DIALOGS_DUNGEON),
  EVENTS,
  ITEMS,
  OBJECTIVES,
  CHRONICLE,
  FLAGS,
  TEXT,
  SHOP,
};

export { createStory };
export default STORY;
