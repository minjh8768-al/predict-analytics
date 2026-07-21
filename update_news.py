import urllib.request
import xml.etree.ElementTree as ET
import re
import sys
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
now = datetime.now(KST)
time_str = f"{now.month}월 {now.day}일 오전 9시"

def fetch_rss(query):
    url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return ET.parse(r)
    except Exception as e:
        print(f"RSS 가져오기 실패: {e}")
        return None

def clean(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    for a, b in [("&amp;","&"),("&lt;","<"),("&gt;",">"),("&#39;","'"),("&quot;",'"'),("\n"," ")]:
        text = text.replace(a, b)
    return text.strip()

tree = fetch_rss("Trump")
if not tree:
    print("RSS 없음, 종료")
    sys.exit(0)

items = tree.getroot().findall(".//item")
if not items:
    print("기사 없음, 종료")
    sys.exit(0)

item = items[0]
title   = clean(item.find("title").text if item.find("title") is not None else "")
desc    = clean(item.find("description").text if item.find("description") is not None else "")
src_el  = item.find("source")
source  = src_el.text if src_el is not None else "Google News"

# 제목에서 " - 출처" 부분 제거
title = re.sub(r"\s*-\s*[^-]+$", "", title).strip()
desc  = (desc[:200] + "...") if len(desc) > 200 else desc

# 작은따옴표 이스케이프 (JS 문자열 안전)
title  = title.replace("'", "\\'")
desc   = desc.replace("'", "\\'")
source = source.replace("'", "\\'")

new_block = f"""  {{
    category: '정치', catClass: 'cat-politics', emoji: '🇺🇸',
    img: 'https://images.unsplash.com/photo-1580128660010-fd027e1e587a?w=800&h=420&fit=crop&auto=format',
    title: '[트럼프] {title}',
    excerpt: '{desc}',
    time: '{time_str}', author: 'N. Silver', prob: 62, featured: true,
    views: '38.4k', comments: 1240,
    source: '{source}'
  }},"""

with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

# <!-- FEATURED_START --> ... <!-- FEATURED_END --> 사이를 교체
pattern = r"(<!-- FEATURED_START -->)[\s\S]*?(<!-- FEATURED_END -->)"
replacement = r"\g<1>\n" + new_block + r"\n  \g<2>"
new_content = re.sub(pattern, replacement, content)

if new_content == content:
    print("마커를 찾지 못함 — 변경 없음")
else:
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"업데이트 완료: {title}")
