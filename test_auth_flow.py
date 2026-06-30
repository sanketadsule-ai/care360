import urllib.request
import urllib.parse
import json

BASE_URL = 'http://localhost:8080/api/auth'

def test_auth(action, payload):
    data = json.dumps({'action': action, **payload}).encode('utf-8')
    req = urllib.request.Request(BASE_URL, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return 500, {'error': str(e)}

print("Registering new user (testuser@example.com)...")
status, res = test_auth('register', {'email': 'testuser@example.com', 'name': 'Test User', 'password': 'password123'})
print("Status:", status, "Response:", res)
assert status == 403 and res['error'] == 'Pending admin approval', "Expected pending approval"

print("Trying to login as pending user...")
status, res = test_auth('login', {'email': 'testuser@example.com', 'password': 'password123'})
print("Status:", status, "Response:", res)
assert status == 403 and res['error'] == 'Pending admin approval', "Expected pending approval"

print("Registering admin (sanket.adsule@impactguru.com)...")
status, res = test_auth('register', {'email': 'sanket.adsule@impactguru.com', 'name': 'Sanket Adsule', 'password': 'adminpassword'})
print("Status:", status, "Response:", res)
assert status == 200 and res['success'], "Expected successful admin registration"

print("Logging in as admin...")
status, res = test_auth('login', {'email': 'sanket.adsule@impactguru.com', 'password': 'adminpassword'})
print("Status:", status, "Response:", res)
assert status == 200 and res['success'], "Expected successful admin login"

print("All tests passed!")
