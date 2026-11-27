"""macro 行情合并：保留宏观任务维护的 long / frequency，不静默删序列。

python3 -m unittest scripts/normalize-market-refresh-macro_test.py
"""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'normalize_market_refresh', Path(__file__).with_name('normalize-market-refresh.py'))
normalize = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalize)


def series(latest_date, latest_value, **extra):
    out = {
        'unit': '%',
        'latest': {'date': latest_date, 'value': latest_value},
        'history': [[latest_date, latest_value]],
    }
    out.update(extra)
    return out


class MergeMacroSeriesTest(unittest.TestCase):
    def test_preserves_old_only_fields_and_updates_latest(self):
        before = series('2026-01-01', 1, frequency='monthly', long=[['2020-01-01', 0], ['2026-01-01', 1]], fred='X')
        incoming = series('2026-02-01', 2, live=True, fred='X')
        merged, changed = normalize.merge_macro_series_entry(
            before, incoming, '2026-02-02T00:00:00Z', market='us', key='vix')
        self.assertTrue(changed)
        self.assertEqual(merged['latest'], {'date': '2026-02-01', 'value': 2})
        self.assertEqual(merged['frequency'], 'monthly')
        self.assertEqual(merged['long'], before['long'])
        self.assertEqual(merged['refreshStatus'], 'updated')
        self.assertNotIn('live', merged)

    def test_checked_no_new_observation_still_keeps_long(self):
        before = series('2026-01-01', 1, frequency='quarterly', long=[['2019-01-01', 9]])
        incoming = series('2026-01-01', 1, live=True)
        merged, changed = normalize.merge_macro_series_entry(
            before, incoming, '2026-02-02T00:00:00Z', market='us', key='gdp')
        self.assertFalse(changed)
        self.assertEqual(merged['refreshStatus'], 'checked-no-new-observation')
        self.assertEqual(merged['long'], before['long'])
        self.assertEqual(merged['frequency'], 'quarterly')

    def test_older_provider_data_keeps_entire_old_series(self):
        before = series('2026-02-01', 2, frequency='monthly', long=[['2020-01-01', 0]])
        incoming = series('2026-01-15', 1, live=True, note='stale')
        merged, changed = normalize.merge_macro_series_entry(
            before, incoming, '2026-02-02T00:00:00Z', market='us', key='hy')
        self.assertFalse(changed)
        self.assertEqual(merged['refreshStatus'], 'provider-returned-older-data-preserved')
        self.assertEqual(merged['latest'], before['latest'])
        self.assertEqual(merged['long'], before['long'])
        self.assertEqual(merged['frequency'], 'monthly')
        self.assertNotIn('note', merged)

    def test_fetch_failed_preserves_missing_macro_fields(self):
        before = series('2026-01-01', 1, frequency='monthly', long=[['2020-01-01', 0]])
        # collect() normally copies previous; simulate a stripped failed payload
        incoming = series('2026-01-01', 1, live=False)
        merged, changed = normalize.merge_macro_series_entry(
            before, incoming, '2026-02-02T00:00:00Z', market='us', key='curve')
        self.assertFalse(changed)
        self.assertEqual(merged['refreshStatus'], 'fetch-failed-preserved')
        self.assertEqual(merged['long'], before['long'])
        self.assertEqual(merged['frequency'], 'monthly')

    def test_new_fields_overwrite_old(self):
        before = series('2026-01-01', 1, note='old', long=[['2020-01-01', 0]])
        incoming = series('2026-02-01', 2, live=True, note='new', long=[['2021-01-01', 5]])
        merged, _ = normalize.merge_macro_series_entry(
            before, incoming, '2026-02-02T00:00:00Z', market='us', key='gold')
        self.assertEqual(merged['note'], 'new')
        self.assertEqual(merged['long'], [['2021-01-01', 5]])


class MergeMacroMarketTest(unittest.TestCase):
    def test_missing_series_preserved_with_status(self):
        old = {'generatedAt': '2026-01-01', 'source': 'old', 'series': {
            'keep': series('2026-01-01', 1, frequency='monthly', long=[['2020-01-01', 0]]),
            'orphan': series('2026-01-01', 9, frequency='monthly', long=[['2018-01-01', 3]]),
        }}
        new = {'generatedAt': '2026-02-01', 'fetchedAt': '2026-02-01T00:00:00Z', 'source': 'new', 'series': {
            'keep': series('2026-02-01', 2, live=True),
        }}
        merged, changed = normalize.merge_macro_market(
            old, new, '2026-02-02T00:00:00Z', 'us', ['warn'])
        self.assertEqual(changed, ['keep'])
        self.assertNotIn('fetchedAt', merged)
        self.assertEqual(merged['warnings'], ['warn'])
        self.assertEqual(merged['series']['keep']['long'], old['series']['keep']['long'])
        self.assertEqual(merged['series']['keep']['frequency'], 'monthly')
        self.assertEqual(merged['series']['orphan']['refreshStatus'], 'not-collected-preserved')
        self.assertEqual(merged['series']['orphan']['long'], old['series']['orphan']['long'])
        self.assertEqual(merged['series']['orphan']['latest'], old['series']['orphan']['latest'])

    def test_ae91bfd4_replay_keeps_twenty_five_long_and_frequency(self):
        """旧文件取自 ae91bfd4^ 的 macro-us.json（fixtures 里只保留每个序列 long / history 的前 3 点，
        CI 是浅克隆读不到 git 历史）；新采集只用 latest（模拟 company-refresh 的 pack 结果）。"""
        old = json.loads((ROOT / 'scripts/fixtures/macro-us-before-ae91bfd4.json').read_text(encoding='utf-8'))
        with_long = [k for k, s in old['series'].items() if 'long' in s]
        self.assertEqual(len(with_long), 25, with_long)
        collected_series = {}
        for key, s in old['series'].items():
            # company refresh 的 pack() 序列：没有 long / frequency
            entry = {
                'latest': {'date': '2099-01-01', 'value': 123.45},
                'history': [['2099-01-01', 123.45]],
                'live': True,
            }
            for field in ('fred', 'unit', 'note', 'source'):
                if field in s:
                    entry[field] = s[field]
            collected_series[key] = entry
        new = {
            'generatedAt': '2099-01-01',
            'fetchedAt': '2099-01-01T00:00:00Z',
            'source': old.get('source'),
            'series': collected_series,
        }
        merged, changed = normalize.merge_macro_market(
            old, new, '2099-01-01T12:00:00Z', 'us', [])
        self.assertEqual(len(changed), len(old['series']))
        for key in with_long:
            self.assertIn('long', merged['series'][key], key)
            self.assertEqual(merged['series'][key]['long'], old['series'][key]['long'], key)
            if 'frequency' in old['series'][key]:
                self.assertEqual(
                    merged['series'][key]['frequency'], old['series'][key]['frequency'], key)
            self.assertEqual(merged['series'][key]['latest']['date'], '2099-01-01', key)
            self.assertEqual(merged['series'][key]['latest']['value'], 123.45, key)
        self.assertEqual(sum(1 for s in merged['series'].values() if 'long' in s), 25)
        self.assertEqual(
            sum(1 for s in merged['series'].values() if 'frequency' in s),
            sum(1 for s in old['series'].values() if 'frequency' in s))


if __name__ == '__main__':
    unittest.main()
