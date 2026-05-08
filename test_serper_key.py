import requests
import json

API_KEY = "7d9960e190bceaa3baeeb0662ff7e0c05ed170d6"
URL = "https://google.serper.dev/search"

def test_key():
    print(f"Testing Serper Key: {API_KEY[:5]}...")
    
    payload = json.dumps({
        "q": "site:linkedin.com/in/ \"Senior React Developer\" Bangalore",
        "num": 5
    })
    headers = {
        'X-API-KEY': API_KEY,
        'Content-Type': 'application/json'
    }

    try:
        response = requests.post(URL, headers=headers, data=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            results = data.get('organic', [])
            print(f"Success! Found {len(results)} results.")
            for r in results:
                print(f"- {r.get('title')}")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_key()
