// Reads the seed rows (insert ... values ...) of a migration, so the simulation and the tests use exactly the rules and
// reference values the database gets, instead of a second copy that could drift apart.

type Row = Record<string, string | number | boolean | null>;

/** Splits "a, 'b, c', (d)" at top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === "'" && s[i + 1] === "'") {
        cur += s[++i];
      } else if (ch === "'") quote = false;
      continue;
    }
    if (ch === "'") quote = true;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function value(token: string): string | number | boolean | null {
  if (/^null$/i.test(token)) return null;
  if (/^true$/i.test(token)) return true;
  if (/^false$/i.test(token)) return false;
  if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
  const n = Number(token);
  if (!Number.isNaN(n)) return n;
  throw new Error(`sqlSeed: cannot read value ${token}`);
}

/** Rows of every `insert into public.<table> (...) values (...), ...;` of the SQL text, by table. */
export function seedRows(sql: string): Record<string, Row[]> {
  // drop comments (a quote inside a comment would confuse the tuple reader)
  const text = sql.split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');
  const out: Record<string, Row[]> = {};
  const re = /insert into public\.(\w+)\s*\(([^)]*)\)\s*values\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const table = m[1];
    const cols = m[2].split(',').map((c) => c.trim());
    // values run until "on conflict" or the closing semicolon outside quotes and parentheses
    let i = re.lastIndex;
    let depth = 0;
    let quote = false;
    let start = -1;
    const tuples: string[] = [];
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === "'" && text[i + 1] === "'") i++;
        else if (ch === "'") quote = false;
        continue;
      }
      if (ch === "'") quote = true;
      else if (ch === '(') {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) tuples.push(text.slice(start, i));
      } else if (depth === 0 && (ch === ';' || /^on conflict/i.test(text.slice(i, i + 11)))) break;
    }
    re.lastIndex = i;
    const rows = (out[table] ??= []);
    for (const t of tuples) {
      const vals = splitTop(t).map(value);
      rows.push(Object.fromEntries(cols.map((c, k) => [c, vals[k]])));
    }
  }
  return out;
}
