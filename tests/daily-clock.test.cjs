const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/daily-tracks.js'), 'utf8'), context);
const daily = context.ThreadDaily;

test('Track 3 stays locked until midnight Pacific, independent of the device timezone', () => {
  for (const [instant, expected] of [
    ['2026-09-04T00:00:00-07:00', 1],
    ['2026-09-05T00:00:00Z', 1],
    ['2026-09-05T00:00:00-07:00', 2],
    ['2026-09-05T17:20:00-07:00', 2],
    ['2026-09-06T06:59:59.999Z', 2],
    ['2026-09-06T07:00:00Z', 3],
    ['2026-09-06T16:00:00+09:00', 3],
  ]) assert.equal(daily.today(Date.parse(instant)), expected, instant);
});

test('short and long daylight saving days advance exactly once at Pacific midnight', () => {
  for (const [instant, expected] of [
    ['2026-11-01T07:00:00Z', 59],
    ['2026-11-01T08:59:59Z', 59],
    ['2026-11-01T09:00:00Z', 59],
    ['2026-11-02T07:59:59.999Z', 59],
    ['2026-11-02T08:00:00Z', 60],
    ['2027-03-14T08:00:00Z', 192],
    ['2027-03-14T09:59:59Z', 192],
    ['2027-03-14T10:00:00Z', 192],
    ['2027-03-15T06:59:59.999Z', 192],
    ['2027-03-15T07:00:00Z', 193],
  ]) assert.equal(daily.today(new Date(instant)), expected, instant);
});

test('the displayed date matches the Pacific track date during the UTC evening rollover', () => {
  const format = new Intl.DateTimeFormat('en-US', {timeZone: daily.timeZone, weekday:'long', month:'long', day:'numeric'});
  assert.equal(format.format(new Date('2026-09-06T00:20:00Z')), 'Saturday, September 5');
  assert.equal(format.format(new Date('2026-09-06T07:00:00Z')), 'Sunday, September 6');
});
