#!/usr/bin/env python3
"""Fix corrupted .env values by replacing them with correct ones."""

with open('/root/Survey-Bot/.env') as f:
    content = f.read()

# Fix TS_PASSWORD - was corrupted to ***
old_pw = 'TS_PASSWORD=' + chr(42) + chr(42) + chr(42)
content = content.replace(old_pw, 'TS_PASSWORD=Macbook@100')

# Fix DEEPSEEK_API_KEY - was corrupted to *** (placeholder - needs real key)
# Don't fix it now, let user provide it

with open('/root/Survey-Bot/.env', 'w') as f:
    f.write(content)

print('Fixed. Check TS_PASSWORD line.')
