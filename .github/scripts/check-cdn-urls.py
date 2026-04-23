"""
Check that newly added CDN image URLs in images.csv and glossary.csv are reachable.
Writes new-image-urls.txt for lychee to check.
"""
import csv
import subprocess
from urllib.parse import quote

CDN_BASE = 'https://pnwmoths.b-cdn.net'
urls = []


def new_lines(path):
    r = subprocess.run(
        ['git', 'diff', 'origin/main...HEAD', '--', path],
        capture_output=True, text=True
    )
    return [l[1:] for l in r.stdout.splitlines() if l.startswith('+') and not l.startswith('+++')]


for line in new_lines('data/images.csv'):
    parts = line.split(',', 2)
    if len(parts) >= 2 and parts[0] not in ('', 'species_slug') and parts[1]:
        urls.append(f"{CDN_BASE}/{parts[0]}/{quote(parts[1])}")

for row in csv.reader(new_lines('data/glossary.csv')):
    if len(row) >= 3 and row[0] != 'term' and row[2]:
        urls.append(f"{CDN_BASE}/glossary/{quote(row[2])}")

with open('new-image-urls.txt', 'w') as f:
    f.write('\n'.join(urls))
print(f"Checking {len(urls)} new image URL(s)")
