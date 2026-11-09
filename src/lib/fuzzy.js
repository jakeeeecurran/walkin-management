// Forgiving name matching, so "Calandra" finds Caloundra and "hodna" finds Honda.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Swapped neighbouring letters count as one typo ("Kai" -> "Kia").
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  return dp[a.length][b.length];
}

const ALIASES = { used: 'usedcars', usedcar: 'usedcars', cherry: 'chery', greatwall: 'gwm', haval: 'gwm', merc: 'mercedesbenz', mercedes: 'mercedesbenz', vw: 'volkswagen', landrover: 'landrover', holdenhsv: 'holden' };

// Closest item by name, allowing small misspellings. prefix: also accept a name that starts with what was typed.
function fuzzyFind(list, raw, nameKey = 'name', { prefix = true } = {}) {
  const target = norm(raw);
  if (!target) return null;
  const t = ALIASES[target] || target;
  let best = null;
  let bestScore = Infinity;
  for (const item of list) {
    const n = norm(item[nameKey]);
    if (n === t) return item;
    const score = prefix && t.length >= 3 && (n.startsWith(t) || t.startsWith(n)) ? 1 : distance(n, t);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  const allowed = t.length <= 3 ? 1 : Math.max(1, Math.floor(t.length / 3));
  return bestScore <= allowed ? best : null;
}

// Tidies typed names: "honda" -> "Honda", "land rover" -> "Land Rover", "rav4" -> "RAV4", "cx-5" -> "CX-5".
// Anything typed with capitals is kept as typed.
function tidyName(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s !== s.toLowerCase()) return s;
  return s
    .split(' ')
    .map((w) => {
      if (/^[a-z]+$/.test(w)) return w[0].toUpperCase() + w.slice(1);
      if (/^[a-z]{2,}[-\d]/.test(w)) return w.toUpperCase();
      return w;
    })
    .join(' ');
}

module.exports = { norm, distance, fuzzyFind, tidyName };
