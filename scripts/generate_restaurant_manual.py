#!/usr/bin/env python3
"""Convert NEXXUS_POS_Restaurant_Manual.md to a styled PDF using weasyprint."""

import sys
sys.path.insert(0, ".pythonlibs/lib/python3.11/site-packages")

import markdown
from weasyprint import HTML, CSS

SRC = "NEXXUS_POS_Restaurant_Manual.md"
OUT = "NEXXUS_POS_Restaurant_Manual.pdf"

CSS_STYLE = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

@page {
  size: A4;
  margin: 2cm 2.2cm 2.5cm 2.2cm;
  @bottom-center {
    content: "NEXXUS POS  •  Restaurant Manual  •  Page " counter(page) " of " counter(pages);
    font-size: 8pt;
    color: #6b7280;
    font-family: Inter, sans-serif;
  }
}
@page cover { margin: 0; @bottom-center { content: none; } }

* { box-sizing: border-box; }
body {
  font-family: Inter, 'Segoe UI', Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.6;
  color: #1f2937;
}

.cover {
  page: cover;
  width: 100%;
  height: 297mm;
  background: #0f1729;
  color: #fff;
  text-align: center;
  padding: 80px 40px;
  page-break-after: always;
}
.cover h1 {
  font-size: 44pt;
  font-weight: 800;
  color: #3b82f6;
  letter-spacing: -1px;
  margin-top: 30px;
}
.cover h1 span { color: #fff; }
.cover .tag {
  font-size: 15pt;
  color: #93c5fd;
  margin-top: 8px;
  font-weight: 400;
  letter-spacing: 0.5px;
}
.cover .div {
  width: 80px; height: 3px;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 2px;
  margin: 50px auto;
}
.cover h2 {
  font-size: 26pt;
  font-weight: 700;
  margin-bottom: 14px;
}
.cover .sub {
  font-size: 13pt;
  color: #cbd5e1;
  font-weight: 400;
  line-height: 1.6;
  max-width: 480px;
  margin: 0 auto;
}
.cover .meta {
  margin-top: 70px;
  font-size: 10pt;
  color: #94a3b8;
  letter-spacing: 1px;
}

h1 {
  font-size: 22pt;
  font-weight: 800;
  color: #0f1729;
  margin: 22px 0 10px;
  padding-bottom: 6px;
  border-bottom: 3px solid #3b82f6;
  page-break-after: avoid;
}
h2 {
  font-size: 16pt;
  font-weight: 700;
  color: #1e3a8a;
  margin: 24px 0 8px;
  padding-bottom: 4px;
  border-bottom: 2px solid #e5e7eb;
  page-break-after: avoid;
  page-break-before: auto;
}
h2:first-of-type { page-break-before: avoid; }
h3 {
  font-size: 12pt;
  font-weight: 700;
  color: #1f2937;
  margin: 14px 0 4px;
  page-break-after: avoid;
}

p { margin: 6px 0; }

ul, ol { margin: 6px 0 8px 22px; }
li { margin: 2px 0; }

code {
  font-family: 'SF Mono', Consolas, Monaco, monospace;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 9pt;
  color: #1e3a8a;
}

strong { color: #0f1729; font-weight: 700; }
em { color: #475569; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0 14px;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th {
  background: #1e3a8a;
  color: #fff;
  padding: 7px 9px;
  text-align: left;
  font-weight: 600;
  font-size: 9pt;
}
td {
  padding: 6px 9px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: top;
}
tr:nth-child(even) td { background: #f8fafc; }

hr { display: none; }
"""

COVER = """
<div class="cover">
  <h1>NEXXUS<span> POS</span></h1>
  <div class="tag">Restaurant Operations Manual</div>
  <div class="div"></div>
  <h2>For Restaurants, Bars &amp; Cafés</h2>
  <div class="sub">
    Everything you need to set up menus and recipes, run tables, manage the
    kitchen display, handle online orders, track inventory and ingredients,
    and close the day with confidence.
  </div>
  <div class="meta">Version: May 2026 &nbsp;•&nbsp; Currency: JMD</div>
</div>
"""

def main():
    with open(SRC, "r", encoding="utf-8") as f:
        md = f.read()

    # Drop the markdown title and meta line (we use our own cover)
    lines = md.splitlines()
    body_md = "\n".join(lines[3:]) if lines and lines[0].startswith("#") else md

    html_body = markdown.markdown(
        body_md,
        extensions=["tables", "fenced_code", "sane_lists"],
    )

    html_doc = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>NEXXUS POS — Restaurant Manual</title></head>
<body>{COVER}{html_body}</body></html>"""

    HTML(string=html_doc).write_pdf(OUT, stylesheets=[CSS(string=CSS_STYLE)])
    print(f"Wrote {OUT}")

if __name__ == "__main__":
    main()
