import os, glob, re

for filepath in glob.glob("*.html"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Remove the entire <div class="nav-links">...</div> block
    pattern = r'<div class="nav-links">\s*<a href="livescores\.html" class="nav-link.*?</a>\s*<a href="markets\.html" class="nav-link.*?</a>\s*<a href="games\.html" class="nav-link.*?</a>\s*</div>'
    
    # Actually, a more robust regex just to catch the div and its contents
    pattern2 = r'\s*<div class="nav-links">.*?</div>'
    
    new_content = re.sub(pattern2, '', content, flags=re.DOTALL)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Removed nav-links from {filepath}")
