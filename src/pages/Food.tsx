import { useLocation } from 'react-router-dom';
import { Diary } from './food/Diary';
import { WeekTargets } from './food/WeekTargets';
import { Analysis } from './food/Analysis';
import { AddFoodPage } from './food/AddFood';
import { MealPage } from './food/MealPage';

/** The nutrition section: diary (today), the targets of the coming week, and the look back. */
export function Food() {
  const path = useLocation().pathname.replace(/\/$/, '');
  if (path.endsWith('/food/plan')) return <WeekTargets />;
  if (path.endsWith('/food/analysis')) return <Analysis />;
  if (path.endsWith('/food/add')) return <AddFoodPage />;
  if (path.endsWith('/food/meal')) return <MealPage />;
  return <Diary />;
}
