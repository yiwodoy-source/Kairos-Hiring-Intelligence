import requests
import json

def test_sourcing_endpoint():
    print("Testing /api/source-candidates endpoint...")
    url = "http://localhost:5000/api/source-candidates"
    payload = {
        "role": "Senior React Developer",
        "skills": "React, Node.js",
        "location": "Bangalore"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            candidates = data.get('candidates', [])
            print(f"Success! Found {len(candidates)} candidates.")
            for c in candidates:
                print(f"- {c.get('name')} ({c.get('company')})")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_sourcing_endpoint()
