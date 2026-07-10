import math
import heapq

CRITICAL_VALUE_MAP = {
    0: 1,
    1: 1,
    2: 0,
    3: 5,
    4: 2,
    5: 0,
}

INFRASTRUCTURE_LABELS = {
    (5, "substation"): 10,
    (4, "highway_intersection"): 8,
    (3, "hospital"): 10,
    (3, "school"): 9,
    (3, "fire_station"): 10,
    (3, "town"): 5,
}

UNIT_NAMES = [
    "Engine 1", "Engine 2", "Engine 3",
    "Truck 4", "Truck 5",
    "Helicopter 6",
]


def get_infrastructure_value(fuel_type: int, is_town: bool) -> int:
    if is_town:
        return 5
    return CRITICAL_VALUE_MAP.get(fuel_type, 1)


def fire_risk(
    x: int,
    y: int,
    fire_mask: list[list[int]],
    fuel_map: list[list[int]],
    size: int,
    wind_speed: float = 0.0,
    wind_dir_deg: float = 0.0,
) -> float:
    if fire_mask[y][x] == 1:
        return 1.0
    if fire_mask[y][x] == 2:
        return 1.0

    burning_cells = [(cx, cy) for cy in range(size) for cx in range(size) if fire_mask[cy][cx] == 1]
    if not burning_cells:
        return 0.0

    min_dist = min(math.sqrt((x - bx) ** 2 + (y - by) ** 2) for bx, by in burning_cells)

    if min_dist == 0:
        return 1.0

    dist_factor = max(0.0, 1.0 - min_dist / 25.0)

    fuel_flammability = {0: 1.0, 1: 1.3, 2: 0.0, 3: 0.8, 4: 0.3, 5: 0.1}
    f = fuel_flammability.get(fuel_map[y][x], 0.5)

    rad = math.radians(wind_dir_deg)
    dx = math.cos(rad)
    dy = math.sin(rad)
    cx = sum(bx for bx, _ in burning_cells) / len(burning_cells)
    cy = sum(by for _, by in burning_cells) / len(burning_cells)
    to_cell_x = x - cx
    to_cell_y = y - cy
    dot = (to_cell_x * dx + to_cell_y * dy)
    mag = math.sqrt(to_cell_x ** 2 + to_cell_y ** 2) + 0.001
    wind_alignment = max(0.0, dot / mag)
    wind_factor = 1.0 + wind_alignment * min(wind_speed / 20.0, 1.0)

    risk = dist_factor * f * wind_factor
    return min(risk, 1.0)


def estimate_arrival_ticks(
    x: int,
    y: int,
    fire_mask: list[list[int]],
    size: int,
) -> int:
    burning_cells = [(cx, cy) for cy in range(size) for cx in range(size) if fire_mask[cy][cx] == 1]
    if not burning_cells:
        return 999

    min_dist = min(math.sqrt((x - bx) ** 2 + (y - by) ** 2) for bx, by in burning_cells)
    return max(1, int(min_dist / 1.5))


def compute_dispatches(
    fuel_map: list[list[int]],
    fire_mask: list[list[int]],
    towns: list[dict],
    size: int,
    wind_speed: float = 0.0,
    wind_dir_deg: float = 0.0,
) -> list[dict]:
    queue: list[tuple[float, int, int, str, int]] = []

    for town in towns:
        tx, ty = town["x"], town["y"]
        risk = fire_risk(tx, ty, fire_mask, fuel_map, size, wind_speed, wind_dir_deg)
        value = get_infrastructure_value(fuel_map[ty][tx], True)
        score = risk * value
        arrival = estimate_arrival_ticks(tx, ty, fire_mask, size)

        if risk > 0 and value > 0:
            infrastructure_type = "town"
            if fuel_map[ty][tx] == 3 and not any(
                t["x"] == tx and t["y"] == ty for t in towns
            ):
                infrastructure_type = "building"
            queue.append((-score, risk, value, town["name"], tx, ty, arrival, infrastructure_type))

    for cy in range(size):
        for cx in range(size):
            fuel = fuel_map[cy][cx]
            if fuel == 3:
                is_town = any(t["x"] == cx and t["y"] == cy for t in towns)
                if is_town:
                    continue
                risk = fire_risk(cx, cy, fire_mask, fuel_map, size, wind_speed, wind_dir_deg)
                value = get_infrastructure_value(fuel, False)
                score = risk * value
                arrival = estimate_arrival_ticks(cx, cy, fire_mask, size)
                if risk > 0 and value > 0:
                    queue.append((-score, risk, value, f"Building ({cx},{cy})", cx, cy, arrival, "building"))

    queue.sort(key=lambda x: x[0])

    dispatches = []
    for i, item in enumerate(queue[:12]):
        neg_score, risk, value, label, gx, gy, arrival, infra_type = item
        unit = UNIT_NAMES[i % len(UNIT_NAMES)]
        dispatches.append({
            "unit": unit,
            "priority": i + 1,
            "risk_score": round(-neg_score, 2),
            "grid_x": gx,
            "grid_y": gy,
            "target": label,
            "infrastructure_type": infra_type,
            "arrival_estimate_ticks": arrival,
            "risk_pct": round(risk * 100, 0),
            "critical_value": value,
            "action": f"Deploy {unit} to Grid ({gx}, {gy}) - {label} at Risk in ~{arrival * 2}s",
        })

    return dispatches