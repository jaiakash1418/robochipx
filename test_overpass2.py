import httpx, time
bbox = "37.5,-122,38.5,-121"
query = f"""[out:json];(way["natural"="water"]({bbox});way["waterway"]({bbox}););out body;>;out skel qt;"""
headers = {"User-Agent": "RoboChipX/1.0"}
try:
    r = httpx.post("https://overpass-api.de/api/interpreter", data={"data": query}, headers=headers, timeout=15)
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"Elements: {len(data.get('elements', []))}")
    else:
        print(r.text[:300])
except Exception as e:
    print(f"Error: {e}")
