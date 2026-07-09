import math


def euclidean_distance(x1: int, y1: int, x2: int, y2: int) -> float:
    return math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)


THRESHOLD_CELLS = 5


def check_alerts(fire_mask: list[list[int]], towns: list[dict], grid_size: int) -> list[dict]:
    alerts = []
    burning_cells = []

    for i in range(grid_size):
        for j in range(grid_size):
            if fire_mask[i][j] == 1:
                burning_cells.append((i, j))

    if not burning_cells:
        return alerts

    for town in towns:
        tx, ty = town["x"], town["y"]
        min_dist = min(euclidean_distance(tx, ty, bx, by) for bx, by in burning_cells)

        if min_dist <= THRESHOLD_CELLS:
            cx = sum(bx for bx, _ in burning_cells) / len(burning_cells)
            cy = sum(by for _, by in burning_cells) / len(burning_cells)

            evac_dx = tx - cx
            evac_dy = ty - cy
            magnitude = math.sqrt(evac_dx**2 + evac_dy**2)
            if magnitude > 0:
                evac_dx /= magnitude
                evac_dy /= magnitude

            alerts.append({
                "town": town["name"],
                "town_x": tx,
                "town_y": ty,
                "distance_cells": round(min_dist, 1),
                "severity": "danger" if min_dist <= 2 else "warning",
                "evacuation_direction": {"dx": round(evac_dx, 2), "dy": round(evac_dy, 2)},
                "message": f"Fire approaching {town['name']}! Evacuate immediately.",
            })

    return alerts


def compute_evacuation_route(
    town_x: int,
    town_y: int,
    fire_centroid_x: float,
    fire_centroid_y: float,
    grid_size: int,
) -> list[dict]:
    route = []
    dx = town_x - fire_centroid_x
    dy = town_y - fire_centroid_y
    magnitude = math.sqrt(dx**2 + dy**2)
    if magnitude == 0:
        return route

    dx /= magnitude
    dy /= magnitude

    for step in range(1, 6):
        nx = int(town_x + dx * step * 3)
        ny = int(town_y + dy * step * 3)
        if 0 <= nx < grid_size and 0 <= ny < grid_size:
            route.append({"x": nx, "y": ny})

    return route
