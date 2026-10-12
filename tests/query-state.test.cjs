const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  beginDatabaseQuery,
  databaseQueryView,
} = require('../.test-build/utils/databaseQueryState.js');
const loaded = (key, data) => ({ key, dataKey: key, data, pending: false, error: null });
const september = () => {},
  october = () => {},
  november = () => {};
const septemberBudget = { month: '2026-09', progress: { budget: { id: 7 }, spent: 14500 } };
test('month switches retain the same card data immediately and mark it as previous until new results arrive', () => {
  const before = loaded(september, septemberBudget);
  // Render happens before the focus effect starts the next query.
  const immediate = databaseQueryView(before, october, true);
  assert.equal(immediate.data, septemberBudget);
  assert.equal(immediate.loading, false);
  assert.equal(immediate.refreshing, true);
  assert.equal(immediate.isPreviousData, true);
  const pending = beginDatabaseQuery(before, october, true);
  const visible = databaseQueryView(pending, october, true);
  assert.equal(visible.data.month, '2026-09');
  assert.equal(visible.data.progress.budget.id, 7);
  assert.equal(visible.loading || visible.refreshing || visible.isPreviousData, true);
  const after = loaded(october, {
    month: '2026-10',
    progress: { budget: { id: 8 }, spent: 30000 },
  });
  const settled = databaseQueryView(after, october, true);
  assert.equal(settled.data.month, '2026-10');
  assert.equal(settled.data.progress.budget.id, 8);
  assert.equal(settled.loading || settled.refreshing || settled.isPreviousData, false);
});
test('rapid month changes and failed new-month reads keep the displayed month identifiable and edits blocked', () => {
  const pendingOctober = beginDatabaseQuery(loaded(september, septemberBudget), october, true);
  const pendingNovember = beginDatabaseQuery(pendingOctober, november, true);
  assert.equal(databaseQueryView(pendingNovember, november, true).data, septemberBudget);
  const failed = {
    ...pendingNovember,
    pending: false,
    error: 'Unable to load local records. Please retry.',
  };
  const view = databaseQueryView(failed, november, true);
  assert.equal(view.data.month, '2026-09');
  assert.equal(view.isPreviousData, true);
  assert.equal(view.refreshing, false);
  assert.match(view.error, /retry/);
  const retry = databaseQueryView(beginDatabaseQuery(failed, november, true), november, true);
  assert.equal(retry.data, septemberBudget);
  assert.equal(retry.error, null);
  assert.equal(retry.refreshing, true);
});
test('entry forms and ordinary queries continue hiding unrelated records on a new query key', () => {
  const before = loaded(september, septemberBudget);
  assert.equal(databaseQueryView(before, october, false).data, undefined);
  const pending = beginDatabaseQuery(before, october, false);
  const view = databaseQueryView(pending, october, false);
  assert.equal(view.data, undefined);
  assert.equal(view.loading, true);
  assert.equal(view.isPreviousData, false);
});
test('same-month refresh retains card identities, while first load never fabricates an empty budget', () => {
  const refreshed = databaseQueryView(
    beginDatabaseQuery(loaded(september, septemberBudget), september, false),
    september,
    false
  );
  assert.equal(refreshed.data, septemberBudget);
  assert.equal(refreshed.isPreviousData, false);
  assert.equal(refreshed.refreshing, true);
  const initial = { key: september, dataKey: null, data: undefined, pending: true, error: null };
  const changed = databaseQueryView(beginDatabaseQuery(initial, october, true), october, true);
  assert.equal(changed.data, undefined);
  assert.equal(changed.loading, true);
  assert.equal(changed.refreshing, false);
});
