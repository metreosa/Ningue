import os, glob, re

new_nav_right = """<div class="nav-right">
    <button class="btn-deposit" id="depositBtn">Deposit</button>
    <div class="interest-badge" title="Requires $10,000+ balance to unlock 6% Yield">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      6% Interest
    </div>
    <div class="nav-gift-icon" title="Rewards coming soon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13"></path><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"></path></svg>
    </div>
    <a href="profile.html" class="nav-avatar" title="My Account"></a>
  </div>"""

for filepath in glob.glob("*.html"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    pattern = r'<div class="nav-right">.*?</div>\s*</nav>'
    replacement = new_nav_right + "\n</nav>"
    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
