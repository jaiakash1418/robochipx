import httpx
bbox = "37.5,-122,38.5,-121"
query = f"""
[out:json];
(
  way["natural"="water"]({bbox});
  way["waterway"]({bbox});
  way["landuse"="forest"]({bbox});
  way["natural"="wood"]({bbox});
  way["highway"]({bbox});
  node["place"]({bbox});
);
out body;
>;
out skel qt;
"""
headers = {"User-Agent": "RoboChipX/1.0 wildfire-simulator"}
r = httpx.post("https://overpass-api.de/api/interpreter", data={"data": query}, headers=headers, timeout=30)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    print(f"Elements: {len(data.get('elements', []))}")
    for el in data.get("elements", [])[:3]:
        print(f"  {el['type']} {el['id']}")
else:
    print(r.text[:500])
