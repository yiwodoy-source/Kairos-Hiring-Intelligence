from googlesearch import search
import logging

logging.basicConfig(level=logging.INFO)

def test_google():
    print("Testing Google Search...")
    try:
        query = 'site:linkedin.com/in/ "Senior React Developer" Bangalore'
        print(f"Query: {query}")
        
        results = search(query, num_results=5, advanced=True)
        
        count = 0
        for r in results:
            print(f"- {r.title}")
            print(f"  Link: {r.url}")
            print(f"  Desc: {r.description}")
            count += 1
            if count >= 5: break
            
        print(f"Found {count} results.")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_google()
