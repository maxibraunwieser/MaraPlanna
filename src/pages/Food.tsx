import { useLocation } from 'react-router-dom';
import { Diary } from './food/Diary';
import { WeekTargets } from './food/WeekTargets';
import { Analysis } from './food/Analysis';

/** The nutrition section: diary (today), the targets of the coming week, and the look back. */
export function Food() {
  const path = useLocation().pathname.replace(/\/$/, '');
  if (path.endsWith('/food/plan')) return <WeekTargets />;
  if (path.endsWith('/food/analysis')) return <Analysis />;
  return <Diary />;
}
