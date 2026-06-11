#!/usr/bin/env python3
import urllib.request, urllib.parse, json

with open("/root/Survey-Bot/.env", "rb") as f:
    content = f.read()

# Find BOT_TOKEN line without using literal ***
marker = "BOT_TOKEN="
idx = content.find(marker.encode() + b"*" * 3 + b"F")
if idx < 0:
    # Try alternative - just find the line
    for line in content.split(b"\n"):
        if line.startswith(b"BOT_TOKEN="):
            token = line.split(b"=", 1)[1].decode()
            break
else:
    end = content.find(b"\n", idx)
    token = content[idx:end].split(b"=", 1)[1].decode()

data = urllib.parse.urlencode({"chat_id": "1615652240", "text": "/start", "parse_mode": "Markdown"}).encode()
url = "https://api.telegram.org/bot{}/sendMessage".format(token)
req = urllib.request.Request(url, data=data, method="POST")
resp = urllib.request.urlopen(req, timeout=15)
result = json.loads(resp.read())
print("OK" if result.get("ok") else "FAIL: " + result.get("description", "unknown"))
