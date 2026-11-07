// English texts (the source). The setup wizard's texts live in setup.en.ts, everything else in one file per area
// (common.ts, ...) with the English and the German table side by side. de.ts has to have exactly the same keys.

import { actText } from './actText';
import { analysisText } from './analysisText';
import { coachText } from './coachText';
import { common } from './common';
import { buildText } from './buildText';
import { exText } from './exText';
import { obText } from './obText';
import { planText } from './planText';
import { privText } from './privText';
import { progText } from './progText';
import { setText } from './setText';
import { strText } from './strText';
import { sysText } from './sysText';
import { enSetup } from './setup.en';

export const en = {
  'lang.label': 'Language',
  ...enSetup,
  ...common.en,
  ...coachText.en,
  ...analysisText.en,
  ...actText.en,
  ...planText.en,
  ...progText.en,
  ...setText.en,
  ...sysText.en,
  ...strText.en,
  ...obText.en,
  ...buildText.en,
  ...exText.en,
  ...privText.en,
} as const;

export type MsgKey = keyof typeof en;
