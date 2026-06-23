import urllib.request
import json

try:
    req = urllib.request.Request('https://sanketadsule-ai-carepal360-ouz4.vercel.app/api/facebook-sync')
    with urllib.request.urlopen(req) as response:
        html = response.read()
        print(html.decode('utf-8'))
except Exception as e:
    print(e)
