import requests
import time

def check_health():
    print("Checking Candidate Sourcing API (Port 5000)...")
    try:
        response = requests.get("http://localhost:5000/health", timeout=2)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        if response.status_code == 200:
            print("API is RUNNING!")
        else:
            print("API is running but returned error.")
    except Exception as e:
        print(f"API is NOT running. Error: {e}")

if __name__ == "__main__":
    check_health()
