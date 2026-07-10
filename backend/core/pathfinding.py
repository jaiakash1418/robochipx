import heapq
import math

FUEL_IMPASSABLE = {2, 5}


def neighbors(x: int, y: int, size: int) -> list[tuple[int, int]]:
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
        nx, ny = x + dx, y + dy
        if 0 <= nx < size and 0 <= ny < size:
            yield (nx, ny)


def is_passable(
    cell_x: int,
    cell_y: int,
    fuel_map: list[list[int]],
    fire_mask: list[list[int]],
    buffer: int = 1,
) -> bool:
    fuel = fuel_map[cell_y][cell_x]
    if fuel in FUEL_IMPASSABLE:
        return False
    if fire_mask[cell_y][cell_x] != 0:
        return False
    for dx in range(-buffer, buffer + 1):
        for dy in range(-buffer, buffer + 1):
            nx, ny = cell_x + dx, cell_y + dy
            if 0 <= nx < len(fuel_map) and 0 <= ny < len(fuel_map):
                if fire_mask[ny][nx] != 0:
                    return False
    return True


def heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def road_cost(fuel_type: int) -> float:
    if fuel_type == 4:
        return 0.5
    if fuel_type == 3:
        return 1.0
    if fuel_type == 1:
        return 1.5
    if fuel_type == 0:
        return 2.0
    return 1.0


def find_safest_route(
    start_x: int,
    start_y: int,
    goal_x: int,
    goal_y: int,
    fuel_map: list[list[int]],
    fire_mask: list[list[int]],
    size: int,
) -> list[dict]:
    start = (start_x, start_y)
    goal = (goal_x, goal_y)

    if not (0 <= start_x < size and 0 <= start_y < size):
        return []
    if not (0 <= goal_x < size and 0 <= goal_y < size):
        return []

    if not is_passable(start_x, start_y, fuel_map, fire_mask, buffer=0):
        return []
    if not is_passable(goal_x, goal_y, fuel_map, fire_mask, buffer=0):
        return []

    open_set = [(0.0, start)]
    came_from: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    g_score: dict[tuple[int, int], float] = {start: 0.0}
    f_score: dict[tuple[int, int], float] = {start: heuristic(start, goal)}

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == goal:
            path: list[dict] = []
            node = current
            while node is not None:
                path.append({"x": node[0], "y": node[1]})
                node = came_from[node]
            path.reverse()
            return path

        for nx, ny in neighbors(current[0], current[1], size):
            if not is_passable(nx, ny, fuel_map, fire_mask, buffer=1):
                continue

            step_cost = road_cost(fuel_map[ny][nx])
            tentative = g_score[current] + step_cost

            neighbor = (nx, ny)
            if neighbor not in g_score or tentative < g_score[neighbor]:
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                f = tentative + heuristic(neighbor, goal)
                f_score[neighbor] = f
                heapq.heappush(open_set, (f, neighbor))

    return []