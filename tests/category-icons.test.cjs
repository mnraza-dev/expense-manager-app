const { test } = require('node:test');
const assert = require('node:assert/strict');
const { categoryIconName, categoryIconOptions } = require('../.test-build/utils/categoryIcons.js');
const { themeChartColors } = require('../.test-build/utils/chartData.js');
const { palette } = require('../.test-build/design/tokens.js');
test('legacy default category icons resolve by meaning, including native category names', () => {
  for (const [name, icon] of [
    ['Food & dining', 'food'],
    ['Groceries', 'groceries'],
    ['Transport', 'transport'],
    ['Fuel', 'fuel'],
    ['Utilities', 'utilities'],
    ['Education', 'education'],
    ['Entertainment', 'entertainment'],
    ['Salary', 'salary'],
    ['Other income', 'tag'],
    ['भोजन', 'food'],
    ['تنخواہ', 'salary'],
    ['صحت', 'health'],
  ])
    assert.equal(categoryIconName(name, 'basket'), icon, name);
  assert.equal(categoryIconName('Business', 'briefcase'), 'business');
  assert.equal(categoryIconName('Current salary', 'briefcase'), 'salary');
  assert.equal(categoryIconName('Bus fares', 'basket'), 'transport');
  assert.equal(categoryIconName('Home rent', 'basket'), 'home');
});
test('saved specific icons take precedence, aliases stay compatible and transfers use a transfer glyph', () => {
  assert.equal(categoryIconName('Food', 'gift'), 'gift');
  assert.equal(categoryIconName('Custom category', 'heart'), 'health');
  assert.equal(categoryIconName('Custom category', 'car'), 'transport');
  assert.equal(categoryIconName('Salary', 'tag'), 'tag');
  assert.equal(categoryIconName('Food', 'gift', true), 'transfer');
  assert.equal(categoryIconName('Unknown category', 'unknown'), 'tag');
  assert.equal(
    new Set(categoryIconOptions.map((row) => row.value)).size,
    categoryIconOptions.length
  );
  for (const option of categoryIconOptions.filter((row) => row.value !== 'auto'))
    assert.equal(categoryIconName('', option.value), option.value);
});
test('chart colors come exclusively from the current light or dark theme', () => {
  for (const theme of [palette.light, palette.dark]) {
    const colors = themeChartColors(theme);
    assert.ok(colors.every((color) => Object.values(theme).includes(color)));
    assert.equal(colors[0], theme.accent);
    assert.equal(colors[1], theme.negative);
  }
});
