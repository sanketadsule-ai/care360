import urllib.request
import json

try:
    req = urllib.request.urlopen("http://localhost:8080/api/trustpilot-reviews")
    data = json.loads(req.read().decode('utf-8'))
    print("Trustpilot Reviews Count:", len(data.get('data', [])))
except Exception as e:
    print("Error:", e)
