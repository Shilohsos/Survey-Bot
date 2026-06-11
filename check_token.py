#!/usr/bin/env python3
"""Check BOT_TOKEN in .env file - raw bytes."""
with open('/root/Survey-Bot/.env', 'rb') as f:
    content = f.read()

marker = b'BOT_TOKEN='
idx = content.find(marker)
if idx >= 0:
    end = content.find(b'\n', idx)
    line = content[idx:end]
    print(f'Line bytes: {len(line)}')
    print(f'Line hex: {line.hex()}')
    val = line.split(b'=', 1)[1]
    print(f'Value bytes: {len(val)}')
    print(f'Value str repr: {val.decode("utf-8", errors="replace")}')
    
    # Also check each byte
    for i, b in enumerate(val):
        print(f'  byte {i}: {b:02x} ({chr(b) if 32 <= b < 127 else "?"})')
else:
    print('BOT_TOKEN not found')
