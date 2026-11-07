// Deutsche Texte. Dieselben Schlüssel wie in en.ts (der Typ erzwingt das).

import type { MsgKey } from './en';
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
import { deSetup } from './setup.de';

export const de: Record<MsgKey, string> = {
  'lang.label': 'Sprache',
  ...deSetup,
  ...common.de,
  ...coachText.de,
  ...analysisText.de,
  ...actText.de,
  ...planText.de,
  ...progText.de,
  ...setText.de,
  ...sysText.de,
  ...strText.de,
  ...obText.de,
  ...buildText.de,
  ...exText.de,
  ...privText.de,
};
