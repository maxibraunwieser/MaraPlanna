import type { ReactNode } from 'react';

// A small, safe renderer for the coach's answers: paragraphs, bullet and numbered lists,
// headings, **bold**, *italic* and `code`. Everything is built from React elements, never
// from HTML strings, so nothing in an answer can inject markup.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${i++}`} className="font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}-${i++}`} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const key = `b${bi}`;
        if (lines.every((l) => BULLET.test(l))) {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => <li key={li}>{inline(l.replace(BULLET, ''), `${key}-${li}`)}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => NUMBER.test(l))) {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => <li key={li}>{inline(l.replace(NUMBER, ''), `${key}-${li}`)}</li>)}
            </ol>
          );
        }
        if (/^#{1,4}\s/.test(lines[0])) {
          const rest = lines.slice(1).join('\n');
          return (
            <div key={key}>
              <div className="font-semibold text-slate-900">{inline(lines[0].replace(/^#{1,4}\s+/, ''), key)}</div>
              {rest && <p className="mt-1 whitespace-pre-line">{inline(rest, `${key}r`)}</p>}
            </div>
          );
        }
        // A paragraph that starts with text and continues as a list.
        const firstList = lines.findIndex((l) => BULLET.test(l) || NUMBER.test(l));
        if (firstList > 0 && lines.slice(firstList).every((l) => BULLET.test(l) || NUMBER.test(l))) {
          const numbered = NUMBER.test(lines[firstList]);
          const items = lines.slice(firstList).map((l, li) => <li key={li}>{inline(l.replace(numbered ? NUMBER : BULLET, ''), `${key}-${li}`)}</li>);
          return (
            <div key={key} className="space-y-1">
              <p className="whitespace-pre-line">{inline(lines.slice(0, firstList).join('\n'), `${key}p`)}</p>
              {numbered ? <ol className="list-decimal space-y-1 pl-5">{items}</ol> : <ul className="list-disc space-y-1 pl-5">{items}</ul>}
            </div>
          );
        }
        return <p key={key} className="whitespace-pre-line">{inline(block, key)}</p>;
      })}
    </div>
  );
}
