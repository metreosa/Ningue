import re

with open('index.html', 'r') as f:
    content = f.read()

# 1. We want to remove from <!-- Layer 2: Dashboard Layout --> down to <div class="content-inner">
# And replace with <div class="page"><div class="container">

pattern = r'<!-- Layer 2: Dashboard Layout -->.*?<div class="content-inner">'
replacement = '''<!-- Layer 2: Main Page Layout -->
  <div class="page">
    <div class="container">'''

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# 2. We need to remove the closing tags at the bottom.
# Currently at the bottom of index.html, there are closing tags for:
# </div> (content-inner)
# </div> (content-area)
# </main> (main-area)
# </div> (dashboard-layout)
# And we need to replace them with:
# </div> (container)
# </div> (page)
# So it's 4 closing tags replaced by 2. Let's see the bottom of the file first to make sure.

with open('index_fixed.html', 'w') as f:
    f.write(new_content)

print("Replaced top part.")

