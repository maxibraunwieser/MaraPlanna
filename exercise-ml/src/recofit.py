"""Loader for the RecoFit exercise data set (Morris, Saponas, Guillory, Kelner, CHI 2014).

Data source: https://github.com/microsoft/Exercise-Recognition-from-Wearable-Sensors (CDLA-Permissive-2.0).

Format of exercise_data.50.0000_singleonly.mat (see data/raw/recofit-load_exercise_data.m):
  subject_data                 cell matrix, one row per person, one column per exercise
  subject_data{i, j}           struct array, one element per recording of person i doing exercise j
  rec.activityName             name of the exercise
  rec.data.accelDataMatrix     N x 4: time [s], x, y, z in g (50 Hz)
  rec.data.gyroDataMatrix      N x 4: time [s], x, y, z in deg/s (50 Hz)
  exerciseConstants.activities names of the exercises (column order of subject_data)

The multi-activity file has one column and, per recording, activityStartMatrix with
[name, start, end, notes, repetitions] rows (see load_multi).

The garmin watch delivers milli-g, RecoFit delivers g. This module keeps the original units;
convert in src/features.py or when resampling.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import numpy as np
import pandas as pd
from scipy.io import loadmat
from scipy.io.matlab import mat_struct

RAW = Path(__file__).resolve().parent.parent / 'data' / 'raw'
SINGLE = RAW / 'exercise_data.50.0000_singleonly.mat'
MULTI = RAW / 'exercise_data.50.0000_multionly.mat'

SAMPLE_COLUMNS = ['t', 'ax', 'ay', 'az', 'gx', 'gy', 'gz']


@dataclass
class Recording:
    subject: int
    exercise: str
    index: int
    raw: mat_struct

    def frame(self) -> pd.DataFrame:
        """One row per accelerometer sample with the gyroscope interpolated onto the same times."""
        return recording_frame(self.raw)


def _structs(x) -> Iterator[mat_struct]:
    """A cell of the file holds a struct array (or a cell of structs, or one struct); yield every struct."""
    if isinstance(x, mat_struct):
        yield x
    elif isinstance(x, np.ndarray) and x.dtype == object:
        for e in x.ravel():
            yield from _structs(e)


def _get(x, name: str):
    """Field of a struct; with squeeze_me off, a 1 x 1 struct shows up as a one-element object array."""
    if isinstance(x, np.ndarray) and x.dtype == object and x.size == 1:
        x = x.ravel()[0]
    return getattr(x, name)


def _matrix(rec, name: str) -> np.ndarray:
    return np.asarray(_get(_get(rec, 'data'), name), dtype=float)


def _text(x) -> str:
    return str(np.asarray(x).ravel()[0]) if np.asarray(x).size else ''


def _load(path: Path) -> dict:
    # squeeze_me stays off so that a 1 x n cell and an n x 1 cell keep their shape.
    return loadmat(str(path), squeeze_me=False, struct_as_record=False)


def load_single(path: Path = SINGLE):
    """Returns (subject_data, activities). Needs a few GB of memory for the full file."""
    m = _load(path)
    names = [_text(a) for a in np.asarray(_get(m['exerciseConstants'], 'activities'), dtype=object).ravel()]
    return m['subject_data'], names


def iter_recordings(subject_data, activities) -> Iterator[Recording]:
    for i, row in enumerate(np.atleast_2d(subject_data)):
        for j, cell in enumerate(row):
            for k, rec in enumerate(_structs(cell)):
                yield Recording(subject=i, exercise=activities[j], index=k, raw=rec)


def recording_frame(rec: mat_struct) -> pd.DataFrame:
    a = _matrix(rec, 'accelDataMatrix')
    g = _matrix(rec, 'gyroDataMatrix')
    if a.ndim != 2 or a.shape[1] < 4:
        return pd.DataFrame(columns=SAMPLE_COLUMNS)
    t = a[:, 0]
    if g.ndim == 2 and g.shape[0] == a.shape[0] and np.allclose(g[:, 0], t, atol=1e-6):
        gyro = g[:, 1:4]
    elif g.ndim == 2 and g.shape[0] > 1:
        gyro = np.column_stack([np.interp(t, g[:, 0], g[:, c]) for c in (1, 2, 3)])
    else:
        gyro = np.full((len(t), 3), np.nan)
    return pd.DataFrame(np.column_stack([t, a[:, 1:4], gyro]), columns=SAMPLE_COLUMNS)


def index_frame(subject_data, activities) -> pd.DataFrame:
    """One row per recording: who, which exercise, how long, how many samples, sample rate."""
    out = []
    for r in iter_recordings(subject_data, activities):
        a = _matrix(r.raw, 'accelDataMatrix')
        n = int(a.shape[0]) if a.ndim == 2 else 0
        dur = float(a[-1, 0] - a[0, 0]) if n > 1 else 0.0
        out.append({
            'subject': r.subject, 'exercise': r.exercise, 'rec': r.index,
            'samples': n, 'seconds': dur, 'hz': (n - 1) / dur if dur > 0 else float('nan'),
            'aligned_gyro': bool(_matrix(r.raw, 'gyroDataMatrix').shape[0] == n),
        })
    return pd.DataFrame(out)


def load_multi(path: Path = MULTI):
    """Whole sessions with exercise start/end times and repetition counts (set detection and counting)."""
    return _load(path)['subject_data']
