"""Which exercises are in the RecoFit single-activity file, and how often?

    ./.venv/Scripts/python src/inspect_recofit.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import recofit  # noqa: E402


def main() -> None:
    subject_data, activities = recofit.load_single()
    idx = recofit.index_frame(subject_data, activities)
    print(f'{idx.subject.nunique()} subjects, {len(activities)} exercise names, {len(idx)} recordings, '
          f'{idx.seconds.sum() / 3600:.1f} h of data')
    print(f'sample rate: median {idx.hz.median():.2f} Hz (min {idx.hz.min():.2f}, max {idx.hz.max():.2f}); '
          f'gyro on the accelerometer time grid in {idx.aligned_gyro.mean() * 100:.1f} % of recordings')

    per = (idx.groupby('exercise')
              .agg(recordings=('rec', 'size'), subjects=('subject', 'nunique'), minutes=('seconds', lambda s: s.sum() / 60))
              .sort_values('recordings', ascending=False))
    with pd.option_context('display.max_rows', None, 'display.width', 200, 'display.max_colwidth', 80):
        print(per.round(1))

    first = next(recofit.iter_recordings(subject_data, activities))
    df = first.frame()
    mag = (df[['ax', 'ay', 'az']] ** 2).sum(axis=1).pow(0.5)
    print(f'\nexample: subject {first.subject}, "{first.exercise}", {len(df)} samples; '
          f'|a| median {mag.median():.2f} g (should be close to 1 g)')


if __name__ == '__main__':
    main()
