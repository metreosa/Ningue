import re

with open('index_fixed.html', 'r') as f:
    content = f.read()

pattern = r'</div> <!-- end content-inner -->\s*</div>\s*</main>\s*</div>'
replacement = '</div>\n  </div>'

new_content = re.sub(pattern, replacement, content)

if new_content != content:
    with open('index.html', 'w') as f:
        f.write(new_content)
    print("Fixed bottom closing tags.")
else:
    print("Pattern not found for closing tags!")

