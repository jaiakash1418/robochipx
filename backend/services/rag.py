import numpy as np


def build_rag_context(state: dict) -> str:
    fuel_map = np.array(state.get("fuel_map", [[]]), dtype=np.int8)
    fire_mask = np.array(state.get("fire_mask", [[]]), dtype=np.int8)
    stats = state.get("stats", {})
    towns = state.get("towns", [])
    alerts = state.get("alerts", [])
    step = state.get("step", 0)
    running = state.get("running", False)
    weather = state.get("weather", {})
    location = state.get("location", {})

    total = fuel_map.size
    if total == 0:
        return "No simulation data available."

    forest_pct = round(float((fuel_map == 0).sum()) / total * 100, 1)
    grass_pct = round(float((fuel_map == 1).sum()) / total * 100, 1)
    water_pct = round(float((fuel_map == 2).sum()) / total * 100, 1)
    town_pct = round(float((fuel_map == 3).sum()) / total * 100, 1)

    burning = int((fire_mask == 1).sum())
    burned = int((fire_mask == 2).sum())
    unburned = total - burning - burned

    user_lat = location.get("lat")
    user_lon = location.get("lon")
    location_info = ""
    if user_lat and user_lon:
        burning_coords = np.argwhere(fire_mask == 1)
        if len(burning_coords) > 0:
            import math
            grid_size = int(np.sqrt(total))
            cell_deg = 1.0 / grid_size
            cy, cx = burning_coords.mean(axis=0)
            fire_lat = 38.5 - (cy + 0.5) * cell_deg
            fire_lon = -122.0 + (cx + 0.5) * cell_deg
            dlat = (user_lat - fire_lat) * 111.0
            dlon = (user_lon - fire_lon) * 111.0 * math.cos(math.radians((user_lat + fire_lat) / 2))
            dist_km = round(math.sqrt(dlat ** 2 + dlon ** 2), 1)
            location_info = (
                f"- User location: {user_lat}, {user_lon}\n"
                f"- Distance from fire centroid: ~{dist_km} km\n"
            )
        else:
            location_info = f"- User location: {user_lat}, {user_lon} (no active fire)\n"

    alerts_summary = ""
    if alerts:
        alert_lines = []
        for a in alerts:
            alert_lines.append(f"  - {a['town']}: {a['message']} (severity: {a['severity']}, distance: {a['distance_cells']} cells)")
        alerts_summary = "Active alerts:\n" + "\n".join(alert_lines) + "\n"
    else:
        alerts_summary = "No active alerts.\n"

    wind_analysis = ""
    ws = weather.get("wind_speed", 0)
    wd = weather.get("wind_direction", 0)
    if ws and wd:
        dir_names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        idx = round(wd / 45) % 8
        wind_dir_name = dir_names[idx]
        wind_analysis = f"- Wind blows FROM the {wind_dir_name} at {ws} km/h\n"
        if ws > 30:
            wind_analysis += "- HIGH WIND: Extreme fire behavior expected, rapid spread downwind\n"
        elif ws > 15:
            wind_analysis += "- Moderate wind: Fire will spread steadily downwind\n"
        else:
            wind_analysis += "- Low wind: Fire spread will be driven more by fuel and terrain\n"

    ctx = f"""CURRENT SIMULATION STATE:
- Step: {step} | Status: {'Running' if running else 'Paused'}
- Grid: {total} cells ({int(np.sqrt(total))}x{int(np.sqrt(total))})
- Unburned: {unburned} | Burning: {burning} | Burned: {burned} ({stats.get('percentage_burned', 0)}%)

FUEL COMPOSITION:
- Forest: {forest_pct}% | Grass: {grass_pct}% | Water: {water_pct}% | Town: {town_pct}%

WEATHER CONDITIONS:
- Wind: {ws} km/h from {wd}° | Temp: {weather.get('temperature', 'N/A')}°C | Humidity: {weather.get('humidity', 'N/A')}%
{wind_analysis}
ALERTS:
{alerts_summary}
LOCATION:
{location_info}TOWNS:
- Total towns: {len(towns)}
"""
    return ctx
