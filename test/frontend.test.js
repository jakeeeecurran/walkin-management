const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('every front-end script parses', () => {
  const files = [...fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).map((f) => path.join('public', 'js', f)), path.join('demo', 'demo-api.js')];
  for (const f of files) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f }), f);
  }
});
