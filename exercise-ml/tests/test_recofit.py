"""The loader is checked against a tiny synthetic file in the same layout as the RecoFit .mat files,
so the test needs neither the 1.5 GB download nor a network."""
import sys
from pathlib import Path

import numpy as np
from scipy.io import savemat

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import recofit  # noqa: E402


def _rec(name: str, n: int, hz: float = 50.0, gyro_rows: int | None = None) -> dict:
    t = np.arange(n) / hz
    accel = np.column_stack([t, np.zeros(n), np.zeros(n), np.ones(n)])
    gt = np.arange(gyro_rows if gyro_rows is not None else n) / (hz * (n / (gyro_rows or n)))
    gyro = np.column_stack([gt, np.full(len(gt), 5.0), np.zeros(len(gt)), np.zeros(len(gt))])
    return {'activityName': name, 'data': {'accelDataMatrix': accel, 'gyroDataMatrix': gyro}}


def _write(tmp_path: Path) -> Path:
    cells = np.empty((2, 2), dtype=object)
    cells[0, 0] = np.array([_rec('Curl', 100), _rec('Curl', 150)], dtype=object)  # two recordings
    cells[0, 1] = np.array([_rec('Squat', 100, gyro_rows=80)], dtype=object)       # gyro on another grid
    cells[1, 0] = np.empty((0, 0))                                                 # person 1 skipped the curl
    cells[1, 1] = np.array([_rec('Squat', 200)], dtype=object)
    path = tmp_path / 'tiny.mat'
    savemat(path, {'subject_data': cells, 'exerciseConstants': {'activities': np.array(['Curl', 'Squat'], dtype=object)}})
    return path


def test_index_counts_recordings_per_subject_and_exercise(tmp_path):
    data, names = recofit.load_single(_write(tmp_path))
    assert names == ['Curl', 'Squat']
    idx = recofit.index_frame(data, names)
    assert len(idx) == 4
    assert set(idx.exercise) == {'Curl', 'Squat'}
    assert sorted(idx[idx.exercise == 'Curl'].samples) == [100, 150]
    assert idx[(idx.subject == 1) & (idx.exercise == 'Curl')].empty


def test_frame_keeps_units_and_interpolates_unaligned_gyro(tmp_path):
    data, names = recofit.load_single(_write(tmp_path))
    recs = list(recofit.iter_recordings(data, names))
    squat = [r for r in recs if r.exercise == 'Squat' and r.subject == 0][0]
    df = squat.frame()
    assert list(df.columns) == recofit.SAMPLE_COLUMNS
    assert len(df) == 100
    assert np.allclose(df.az, 1.0)          # g stays g
    assert np.allclose(df.gx.iloc[:50], 5.0)  # gyro interpolated onto the accelerometer times
