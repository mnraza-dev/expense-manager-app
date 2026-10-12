const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  categoryRingSegments,
  ringArcs,
  chartPeriods,
  chartDomain,
  curvePath,
  cashFlowSegments,
  budgetRingSegments,
} = require('../.test-build/utils/chartData.js');
const {
  createRingGroup,
  disposeRingGroup,
} = require('../.test-build/components/charting/ringScene.js');
test('category ring bounds 3D complexity without losing amounts or mutating category data', () => {
  const categories = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    name: 'Category ' + index,
    amount: (index + 1) * 100,
  }));
  const original = JSON.stringify(categories);
  const segments = categoryRingSegments(categories);
  assert.equal(segments.length, 6);
  assert.equal(segments[5].key, 'other');
  assert.equal(
    segments.reduce((sum, row) => sum + row.value, 0),
    categories.reduce((sum, row) => sum + row.amount, 0)
  );
  assert.equal(JSON.stringify(categories), original);
  const arcs = ringArcs(segments);
  assert.ok(Math.abs(arcs.reduce((sum, row) => sum + row.fraction, 0) - 1) < 1e-12);
  assert.ok(Math.abs(arcs[5].end - arcs[0].start - Math.PI * 2) < 1e-12);
});
test('refund cash movement retains its meaning and budget rings do not invent usage above or below the limit', () => {
  assert.deepEqual(
    cashFlowSegments(10000, -2000).map(({ key, value }) => ({ key, value })),
    [
      { key: 'income', value: 10000 },
      { key: 'refund', value: 2000 },
    ]
  );
  assert.deepEqual(cashFlowSegments(0, 0), []);
  assert.deepEqual(
    budgetRingSegments(10000, 15000, '#000', '#FFF').map(({ key, value }) => ({ key, value })),
    [{ key: 'used', value: 10000 }]
  );
  assert.deepEqual(
    budgetRingSegments(10000, -2000, '#000', '#FFF').map(({ key, value }) => ({ key, value })),
    [{ key: 'remaining', value: 10000 }]
  );
  assert.deepEqual(budgetRingSegments(0, 15000, '#000', '#FFF'), []);
  assert.deepEqual(
    ringArcs([
      { key: 'refund', label: 'Refund', value: -1, color: '#000' },
      { key: 'zero', label: '', value: 0, color: '#000' },
    ]),
    []
  );
});
test('long chart ranges preserve every signed financial amount and count when grouped', () => {
  const rows = Array.from({ length: 1100 }, (_, index) => ({
    period: String(index),
    income: index * 11,
    expense: index % 3 ? index * 4 : -index * 8,
    count: index % 10,
  }));
  const buckets = chartPeriods(rows);
  assert.ok(buckets.length <= 40);
  assert.equal(buckets[0].period, '0');
  assert.equal(buckets[buckets.length - 1].endPeriod, '1099');
  for (const key of ['income', 'expense', 'count'])
    assert.equal(
      buckets.reduce((sum, row) => sum + row[key], 0),
      rows.reduce((sum, row) => sum + row[key], 0)
    );
  assert.deepEqual(chartPeriods([]), []);
  assert.throws(() => chartPeriods(rows, 0), /bucket count/);
});
test('chart scales keep zero visible and distinguish spending from refund credits', () => {
  const mixed = chartDomain([-20000, 40000], 180);
  assert.ok(mixed.zero > 0 && mixed.zero < 180);
  assert.ok(mixed.y(-20000) > mixed.zero);
  assert.ok(mixed.y(40000) < mixed.zero);
  for (const values of [[0], [10000], [-10000], []]) {
    const domain = chartDomain(values);
    assert.ok(Number.isFinite(domain.y(0)));
    assert.ok(domain.zero >= 0 && domain.zero <= 180);
  }
  assert.equal(curvePath([]), '');
  assert.equal(curvePath([{ x: 5, y: 8 }]), 'M 5 8');
  assert.match(
    curvePath([
      { x: 0, y: 10 },
      { x: 40, y: 20 },
    ]),
    /C 20 10, 20 20, 40 20/
  );
});
test('actual Three.js geometry carries exact proportions and releases every geometry/material', () => {
  const group = createRingGroup(
    [
      { key: 'a', label: 'A', value: 100, color: '#28B69C' },
      { key: 'b', label: 'B', value: 300, color: '#6487E8' },
    ],
    '#FFFFFF'
  );
  assert.equal(group.children.length, 3);
  assert.equal(group.children[1].userData.fraction, 0.25);
  assert.equal(group.children[2].userData.fraction, 0.75);
  let geometries = 0,
    materials = 0;
  group.children.forEach((mesh) => {
    mesh.geometry.computeBoundingBox();
    assert.ok(Number.isFinite(mesh.geometry.boundingBox.max.x));
    assert.ok(mesh.geometry.attributes.position.count > 0);
    mesh.geometry.addEventListener('dispose', () => geometries++);
    mesh.material.addEventListener('dispose', () => materials++);
  });
  disposeRingGroup(group);
  assert.equal(geometries, 3);
  assert.equal(materials, 3);
});
