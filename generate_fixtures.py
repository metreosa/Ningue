import re

html_content = open("index.html").read()

# Extract leagues
tabs_match = re.search(r'<div class="league-filter-track">(.*?)</div>\s*</div>\s*<div class="leagues-header-row">', html_content, re.DOTALL)
if not tabs_match:
    print("Could not find league-filter-track")
    exit(1)

tabs_html = tabs_match.group(1)
leagues = []

for tab in re.finditer(r'<button class="league-tab.*?data-league="(.*?)".*?>\s*<span class="league-icon">(.*?)</span>\s*<span class="league-label">(.*?)</span>\s*</button>', tabs_html, re.DOTALL):
    league_id = tab.group(1)
    icon_html = tab.group(2).strip()
    # Force width/height to 20px if it's an img
    icon_html = icon_html.replace('alt=', 'style="width:20px;height:20px;object-fit:contain;" alt=')
    label = tab.group(3).strip()
    leagues.append({"id": league_id, "icon": icon_html, "label": label})

# Generate fixture blocks
blocks_html = ""

import datetime

today = datetime.date.today()
tomorrow = today + datetime.timedelta(days=1)
future = today + datetime.timedelta(days=3)

def format_date(d):
    if d == today: return "Today"
    elif d == tomorrow: return "Tomorrow"
    else: return d.strftime("%a, %b %d").replace(" 0", " ")

# Define placeholder data with dates
teams = {
    "worldcup26": [
        ("Brazil", "Argentina", "https://flagcdn.com/w40/br.png", "https://flagcdn.com/w40/ar.png", today, True),
        ("France", "Germany", "https://flagcdn.com/w40/fr.png", "https://flagcdn.com/w40/de.png", tomorrow, False)
    ],
    "mls": [
        ("Inter Miami", "LA Galaxy", "https://media.api-sports.io/football/teams/1613.png", "https://media.api-sports.io/football/teams/1604.png", today, True),
        ("NY City FC", "Seattle Sounders", "https://media.api-sports.io/football/teams/1609.png", "https://media.api-sports.io/football/teams/1614.png", tomorrow, False)
    ],
    "epl": [
        ("Arsenal", "Chelsea", "https://media.api-sports.io/football/teams/42.png", "https://media.api-sports.io/football/teams/49.png", today, True),
        ("Man City", "Liverpool", "https://media.api-sports.io/football/teams/50.png", "https://media.api-sports.io/football/teams/40.png", future, False)
    ],
    "laliga": [
        ("Real Madrid", "Barcelona", "https://media.api-sports.io/football/teams/541.png", "https://media.api-sports.io/football/teams/529.png", tomorrow, False)
    ],
    "seriea": [
        ("Juventus", "AC Milan", "https://media.api-sports.io/football/teams/496.png", "https://media.api-sports.io/football/teams/489.png", today, False),
        ("Inter", "Napoli", "https://media.api-sports.io/football/teams/505.png", "https://media.api-sports.io/football/teams/492.png", future, False)
    ],
    "ucl": [
        ("Bayern Munich", "PSG", "https://media.api-sports.io/football/teams/157.png", "https://media.api-sports.io/football/teams/85.png", today, True)
    ],
    "bundesliga": [
        ("B. Dortmund", "RB Leipzig", "https://media.api-sports.io/football/teams/165.png", "https://media.api-sports.io/football/teams/173.png", tomorrow, False)
    ],
    "ligue1": [
        ("Marseille", "Lyon", "https://media.api-sports.io/football/teams/81.png", "https://media.api-sports.io/football/teams/80.png", future, False)
    ],
    "spl": [
        ("Al Hilal", "Al Nassr", "https://media.api-sports.io/football/teams/2961.png", "https://media.api-sports.io/football/teams/2939.png", today, False)
    ]
}

# The 'All' tab doesn't get its own section, skip it
for l in leagues:
    if l['id'] == 'all': continue
    
    label = l['label']
    icon = l['icon']
    tms = teams.get(l['id'], teams["mls"])
    
    # Group matches by date
    from collections import defaultdict
    grouped = defaultdict(list)
    for m in tms:
        grouped[m[4]].append(m)
        
    block = f"""
        <!-- LEAGUE BLOCK: {label} -->
        <div class="league-block">
          <div class="league-title">
            <span class="icon">{icon}</span> {label}
            <span class="expand-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
          </div>
"""
    
    # Sort dates
    for d in sorted(grouped.keys()):
        header_text = format_date(d)
        block += f'          <div class="match-date-group">{header_text}</div>\n'
        block += '          <div class="match-list">\n'
        
        for m in grouped[d]:
            home, away, home_img, away_img, date, is_live = m
            time_html = '<span class="live-badge">LIVE</span><span class="live-minute">58\'</span>' if is_live else date.strftime("%a %b %d 08:00 PM")
            plus_val = "+14" if is_live else "+12"
            
            block += f"""            <div class="match-row">
              <div class="match-info-col">
                <div class="match-full-date">{time_html}</div>
                <div class="match-teams">
                  <div class="team-line"><span class="flag"><img src="{home_img}"></span> {home}</div>
                  <div class="team-line"><span class="flag"><img src="{away_img}"></span> {away}</div>
                </div>
              </div>
              <div class="match-odds">
                <div class="odds-col"><span class="odds-lbl">{home}</span><span class="odds-val">45.0¢</span></div>
                <div class="odds-col"><span class="odds-lbl">Draw</span><span class="odds-val">22.0¢</span></div>
                <div class="odds-col"><span class="odds-lbl">{away}</span><span class="odds-val">33.0¢</span></div>
              </div>
              <div class="match-plus">{plus_val}</div>
            </div>
"""
        block += '          </div>\n'

    block += "        </div>\n"
    blocks_html += block

# Inject into index.html
start_marker = r'<!-- LEAGUE BLOCK: World.*?>'
end_marker = r'        </div>\n  </div>'
pattern = re.compile(f'({start_marker}).*?(        </div>\n  </div>)', re.DOTALL)

if pattern.search(html_content):
    new_html = pattern.sub(f'{blocks_html}\\2', html_content)
    with open("index.html", "w") as f:
        f.write(new_html)
    print("Injected successfully into index.html")
else:
    print("Could not find the injection point in index.html. Saved to fixtures.html")
    with open("fixtures.html", "w") as f:
        f.write(blocks_html)

print("Done")
