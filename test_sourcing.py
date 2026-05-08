from duckduckgo_search import DDGS
import logging

logging.basicConfig(level=logging.INFO)

def test_ddg():
    print("Testing DuckDuckGo Search...")
    try:
        with DDGS() as ddgs:
            # Try a broader query
            query = 'Senior React Developer Bangalore site:linkedin.com/in/'
            print(f"Query: {query}")
            results = list(ddgs.text(query, region='in-en', max_results=5))
            
            print(f"Found {len(results)} results.")
            for r in results:
                print(f"- {r.get('title')}")
                print(f"  Link: {r.get('href')}")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_ddg()
