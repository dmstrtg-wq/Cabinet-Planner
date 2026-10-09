#!/usr/bin/env python3
"""
Copy check — grammar, spelling and "sounds like AI" check for the text people see on
mycabinetplanner.com (pages, tips, Help & FAQ, messages). Run before every push:

    python3 tools/copy_check.py            # app + website pages and scripts
    python3 tools/copy_check.py --legal    # also the legal pages (terms, privacy, …)
    python3 tools/copy_check.py --offline  # skip the grammar service; style checks only

What it does
  1. Collects the visible text: HTML text, button titles / placeholders, and the sentences
     inside the JavaScript files (tips, toasts, warnings, emails). Code is never sent.
  2. Grammar + spelling: sends that text to LanguageTool's free public service
     (api.languagetool.org — only text a visitor can already read on the site).
  3. Style checks we run ourselves: AI-sounding words and phrases, dash-heavy lines, and
     sentences that start with a verb and no subject ("Flags layout problems…").
  4. Prints a report and saves it to docs/copy-check-report.md (docs/ isn't public).

Needs only the Python that comes with macOS. Nothing is changed in the site's files.
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index.html', 'app.html', 'profile.html', 'contact.html', 'contact-success.html', '404.html', 'project.html', 'find-a-pro.html']
LEGAL = ['terms.html', 'privacy.html', 'cookie.html', 'refund.html', 'accessibility.html']
SKIP_JS = {'owner-styles.js'}
LT_URL = 'https://api.languagetool.org/v2/check'

# Words the spell checker doesn't know but are right here
ALLOW = set('''
shaker shakers sku skus csv pdf pdfs msrp xlsx xls excel netlify supabase stripe resend
upcharge upcharges filler fillers lazy susan backsplash toe kick toekick countertop countertops
elevations elevation's 3d 2d dims cabinetry vanity vanities mudroom pantry pull-outs pullout pullouts
gmail planner's homeowner homeowners walkthrough tooltip tooltips iso hinge hinges stile stiles
reinstall install installs qty gettingstarted installer installers rep reps signup signups login logins ok wcag
myCabinetPlanner mycabinetplanner termly sm md lg ga i.e e.g etc vs
'''.split())
# Known-OK wording: (rule id, words it flagged) — trade terms the grammar service doesn't know
IGNORE = {('A_INFINITIVE', 'the install')}
# LanguageTool rules that are mostly noise for UI text
DISABLED = ','.join([
    'WHITESPACE_RULE', 'EN_QUOTES', 'DASH_RULE', 'MULTIPLICATION_SIGN', 'PUNCTUATION_PARAGRAPH_END',
    'UPPERCASE_SENTENCE_START', 'COMMA_PARENTHESIS_WHITESPACE', 'EN_UNPAIRED_BRACKETS', 'EN_UNPAIRED_QUOTES',
    'ARROWS', 'PLUS_MINUS', 'WORD_CONTAINS_UNDERSCORE', 'CONSECUTIVE_SPACES', 'SENTENCE_WHITESPACE',
    'DOUBLE_PUNCTUATION', 'UNIT_SPACE', 'ELLIPSIS', 'EN_COMPOUNDS',
    'ENGLISH_WORD_REPEAT_BEGINNING_RULE',   # "No IT department. No install. No learning curve." is on purpose
    'A_INSTALL', 'A_WINDOWS',               # "the install" is normal trade talk; "windows" are windows
    'EN_ELLIPSIS',                          # "Loading…" placeholders are fine
    'UNLIKELY_OPENING_PUNCTUATION',         # pieces of a sentence the code joins together
    'CONFUSION_RULE_READS_REEDS',           # "reads" = the AI's reads of a page
    'CONFUSION_RULE_PRINTS_PRINCE',         # "prints as revision 2"
    'COMMA_COMPOUND_SENTENCE_2',            # "…so you can…" (purpose) needs no comma
])

# Phrases that read like generic marketing / AI writing. Plain words win.
AI_PHRASES = [
    r'seamless(ly)?', r'effortless(ly)?', r'elevat(e|es|ing)\b', r'unlock(s|ing)?\b', r'unleash', r'supercharg',
    r'game[- ]chang', r'next[- ]level', r'cutting[- ]edge', r'state[- ]of[- ]the[- ]art', r'world[- ]class',
    r'best[- ]in[- ]class', r'revolutioni[sz]', r'leverag', r'\brobust\b', r'\bdelve', r'empower', r'streamlin',
    r'\bharness', r'\btailored\b', r'in today\'?s', r'look no further', r'whether you\'?re', r'rest assured',
    r'peace of mind', r'hassle[- ]free', r'a testament', r'\bjourney\b', r'take .{1,30} to the next level',
    r'not (just|only) .{1,40} but', r'\bboasts?\b', r'dive (in|into)', r'\bnavigate\b', r'\bcomprehensive\b',
    r'\bensure[sd]?\b', r'\butiliz', r'\bfacilitat', r'\bholistic', r'\bsynerg', r'\bimpactful\b', r'\bcrucial\b',
]
AI_RE = re.compile('|'.join(AI_PHRASES), re.I)
# A sentence that opens with a verb and no subject ("Shows the…", "Flags…") is usually a fragment
FRAG_RE = re.compile(r'(^|[.!?]\s+)(Shows|Flags|Puts|Lists|Creates|Adds|Lets|Gives|Makes|Opens|Sends|Keeps|Turns|Helps|Saves|Moves|Prints|Counts|Includes|Allows|Provides|Displays)\s', re.M)


def visible_html_text(src):
    """Text a visitor sees in an HTML file, with line numbers."""
    out = []
    body = re.sub(r'(?is)<(script|style|svg|noscript)\b.*?</\1>', lambda m: '\n' * m.group(0).count('\n'), src)
    for m in re.finditer(r'(?:title|placeholder|aria-label|alt)="([^"]{12,})"', body):
        out.append((src.count('\n', 0, m.start()) + 1, html.unescape(m.group(1))))
    pos = 0
    for m in re.finditer(r'>([^<>]+)<', body):
        t = html.unescape(re.sub(r'\s+', ' ', m.group(1))).strip()
        if len(t.split()) >= 3 and re.search(r'[a-z]', t):
            out.append((body.count('\n', 0, m.start()) + 1, t))
    return out


STR_RE = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)

def js_sentences(src):
    """Sentences inside JS string literals (template ${…} parts become 'X'); skips code-like strings."""
    out = []
    # Comments aren't shown to anyone (and their apostrophes would look like strings)
    src = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), src, flags=re.S)
    src = re.sub(r'(?m)^[ \t]*//.*$', '', src)
    src = re.sub(r'(?m)(?<=[;,{}()\]])\s*//[^\'"`\n]*$', '', src)
    for m in STR_RE.finditer(src):
        s = m.group(0)[1:-1]
        TPL = r'\$\{(?:[^{}]|\{[^{}]*\})*\}'
        s = re.sub(r'(?<=[a-z])' + TPL, lambda t: 'es' if "'es'" in t.group(0) else 's', s)   # cabinet${n === 1 ? '' : 's'} → cabinets
        s = re.sub(TPL, 'X', s)
        s = s.replace("\\'", "'").replace('\\"', '"').replace('\\n', ' ')
        s = re.sub(r'<[^>]+>', ' ', s)                 # strip HTML tags inside strings
        s = html.unescape(re.sub(r'\s+', ' ', s)).strip()
        words = s.split()
        if len(words) < 4: continue
        if re.match(r"(ll|s|t|re|ve|d)\b", s): continue   # tail of a string split at an apostrophe
        if sum(len(w) <= 2 for w in words) / len(words) > 0.5: continue   # drawing data (SVG paths)
        letters = sum(c.isalpha() or c.isspace() for c in s)
        if letters / max(1, len(s)) < 0.8: continue    # code, CSS, selectors, URLs
        if re.search(r'(=>|function\b|;\s|\{|\}|::|\bvar\(|px\b|rgba?\(|#[0-9a-f]{3,6}\b|\w+\.\w+\()', s): continue
        if not re.search(r'[A-Z]', s[:1] + s): continue
        out.append((src.count('\n', 0, m.start()) + 1, s))
    return out


def collect(include_legal):
    items, seen = [], set()
    for f in PAGES + (LEGAL if include_legal else []):
        p = os.path.join(ROOT, f)
        if not os.path.exists(p): continue
        for line, t in visible_html_text(open(p, encoding='utf-8').read()):
            if t not in seen: seen.add(t); items.append((f, line, t))
    jsdir = os.path.join(ROOT, 'js')
    for f in sorted(os.listdir(jsdir)):
        if not f.endswith('.js') or f in SKIP_JS: continue
        for line, t in js_sentences(open(os.path.join(jsdir, f), encoding='utf-8').read()):
            if t not in seen: seen.add(t); items.append(('js/' + f, line, t))
    fn = os.path.join(ROOT, 'netlify', 'functions', 'notify.js')   # alert emails
    if os.path.exists(fn):
        for line, t in js_sentences(open(fn, encoding='utf-8').read()):
            if t not in seen: seen.add(t); items.append(('netlify/functions/notify.js', line, t))
    return items


def languagetool(items):
    """Send text in ≤15 KB batches (the free service allows 20 requests a minute)."""
    issues, batch, size = [], [], 0
    def run(batch):
        text, spans, off = '', [], 0
        for it in batch:
            spans.append((off, off + len(it[2]), it)); text += it[2] + '\n\n'; off = len(text)
        data = urllib.parse.urlencode({'text': text, 'language': 'en-US', 'disabledRules': DISABLED, 'level': 'default'}).encode()
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(LT_URL, data=data, headers={'User-Agent': 'mcp-copy-check'}), timeout=60) as r:
                    res = json.load(r); break
            except Exception as e:
                if attempt == 2: print('  ! grammar service failed:', e); return
                time.sleep(8)
        # LanguageTool counts in UTF-16 units (emoji count twice); map back to Python positions
        u16, n = [], 0
        for ch in text:
            u16.append(n); n += 2 if ord(ch) > 0xFFFF else 1
        u16.append(n)
        def py(off):
            lo, hi = 0, len(u16) - 1
            while lo < hi:
                mid = (lo + hi) // 2
                if u16[mid] < off: lo = mid + 1
                else: hi = mid
            return lo
        for m in res.get('matches', []):
            o, e = py(m['offset']), py(m['offset'] + m['length'])
            for a, b, it in spans:
                if a <= o < b:
                    word = it[2][o - a: e - a]
                    if m['rule']['issueType'] == 'misspelling' and (word.lower().strip("'") in ALLOW or word.isupper() or re.search(r'\d', word)):
                        break
                    if (m['rule']['id'], word.lower()) in IGNORE: break
                    fixes = ', '.join(r['value'] for r in m.get('replacements', [])[:3])
                    issues.append((it, 'grammar' if m['rule']['issueType'] != 'misspelling' else 'spelling', m['message'] + f" [{m['rule']['id']}]", word, fixes))
                    break
        time.sleep(3.5)
    for it in items:
        if size + len(it[2]) > 15000 and batch: run(batch); batch, size = [], 0
        batch.append(it); size += len(it[2]) + 2
    if batch: run(batch)
    return issues


def style(items):
    issues = []
    for it in items:
        t = it[2]
        for m in AI_RE.finditer(t):
            issues.append((it, 'AI-sounding', 'Generic marketing / AI phrasing — say it plainly', m.group(0), ''))
        if t.count('—') >= 2 and not re.fullmatch(r'—[^—]+—', t.strip()):   # ("— Width —" dropdown labels are fine)
            issues.append((it, 'dashes', f'{t.count("—")} dashes in one line — split into sentences', '—', ''))
        for m in FRAG_RE.finditer(t):
            issues.append((it, 'fragment?', 'Sentence starts with a verb and no subject', m.group(2), 'add who/what does it'))
    return issues


def main():
    legal, offline = '--legal' in sys.argv, '--offline' in sys.argv
    items = collect(legal)
    print(f'Checking {len(items)} pieces of text from {len({i[0] for i in items})} files…')
    issues = style(items) + ([] if offline else languagetool(items))
    order = {'spelling': 0, 'grammar': 1, 'fragment?': 2, 'AI-sounding': 3, 'dashes': 4}
    issues.sort(key=lambda x: (order.get(x[1], 9), x[0][0], x[0][1]))
    lines = [f'# Copy check — {time.strftime("%Y-%m-%d %H:%M")}', '',
             f'{len(items)} pieces of text checked · ' + (f'{len(issues)} thing{"" if len(issues) == 1 else "s"} to look at' if issues else 'nothing to fix'), '']
    cur = None
    for (f, line, t), kind, msg, word, fixes in issues:
        if kind != cur: cur = kind; lines += ['', f'## {kind} ({sum(1 for x in issues if x[1] == kind)})', '']
        ctx = t if len(t) <= 160 else t[:157] + '…'
        lines.append(f'- **{f}:{line}** — {msg}' + (f' · “{word}”' if word else '') + (f' → {fixes}' if fixes else ''))
        lines.append(f'  > {ctx}')
    report = '\n'.join(lines) + '\n'
    out = os.path.join(ROOT, 'docs', 'copy-check-report.md')
    open(out, 'w', encoding='utf-8').write(report)
    print(report if len(report) < 20000 else report[:20000] + '\n… (full report in docs/copy-check-report.md)')
    print(f'Saved: docs/copy-check-report.md')


if __name__ == '__main__':
    main()
