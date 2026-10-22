import copy
import unittest
from validate_records import validate


def sample():
    return {'schemaVersion': 1, 'asOf': '2026-10-22', 'records': [{
        'key': 'us:TEST', 'market': 'us', 'code': 'TEST', 'name': 'test', 'currency': 'USD', 'asOf': '2026-10-22',
        'price': {'value': 100, 'date': '2026-10-21', 'currency': 'USD', 'source': 'q'}, 'status': 'conditional',
        'value': {'low': 90, 'base': 100, 'high': 120, 'kind': 'present', 'date': '2026-10-22', 'primaryMethod': 'PE'},
        'methods': [
            {'name': 'PE', 'applicable': True, 'reason': 'test normalized EPS', 'formula': '5 * [18,20,24]', 'inputs': {'eps': 5}, 'values': [90, 100, 120], 'sourceIds': ['q']},
            *[{'name': name, 'applicable': False, 'reason': 'missing facts', 'formula': '', 'inputs': {}, 'values': None, 'sourceIds': []} for name in ['PEG', 'PB']]],
        'quality': 'test', 'pricing': 'test', 'expectations': 'missing consensus', 'risk': 'loss', 'assumptions': ['test multiples'], 'missing': ['cash flow'],
        'sources': [{'id': 'q', 'title': 'test only', 'url': 'https://example.com', 'asOf': '2026-10-21'}],
        'review': {'mode': 'programmatic', 'by': 'test', 'note': 'test only'},
    }]}


class ValidationBehavior(unittest.TestCase):
    def test_accepts_traceable_conditional_and_checks_coverage(self):
        self.assertEqual(validate(sample(), ['us:TEST']), [])
        self.assertTrue(validate(sample(), ['us:OTHER']))

    def test_rejects_currency_time_and_false_certification(self):
        for edit in [lambda r: r['price'].update(currency='HKD'), lambda r: r.update(status='reviewed'), lambda r: r['value'].update(kind='future', date='2026-10-21')]:
            document = sample()
            edit(document['records'][0])
            self.assertTrue(validate(document))

    def test_rejects_unexplained_average_unsourced_price_and_duplicate(self):
        for edit in [lambda r: r['value'].update(base=105), lambda r: r['methods'][0].update(sourceIds=['missing']), lambda r: r['price'].update(value=float('nan'))]:
            document = sample()
            edit(document['records'][0])
            self.assertTrue(validate(document))
        document = sample()
        document['records'].append(copy.deepcopy(document['records'][0]))
        self.assertTrue(validate(document))

    def test_insufficient_keeps_coverage_but_cannot_publish_zero_value(self):
        document = sample()
        r = document['records'][0]
        r.update(status='insufficient', value=None)
        self.assertEqual(validate(document, ['us:TEST']), [])
        r['missing'] = []
        self.assertTrue(validate(document))


if __name__ == '__main__':
    unittest.main()
