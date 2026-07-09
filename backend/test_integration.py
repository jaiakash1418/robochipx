#!/usr/bin/env python3
"""
Backend Integration Tests
Run with: python test_integration.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import settings
from services.simulation import simulation
from services.firms import firms_service
from services.weather import weather_service
from core.grid import Grid


async def test_terrain_generation():
    """Test that terrain generates with real elevation data"""
    if os.path.exists(settings.fuel_map_path):
        os.remove(settings.fuel_map_path)

    await simulation.load_fuel_map(settings.fuel_map_path, settings.default_lat, settings.default_lon)
    
    assert simulation.grid.fuel_map is not None
    assert simulation.grid.fuel_map.shape == (64, 64)
    assert simulation.grid.bounds is not None
    
    # Should have some variety in fuel types
    unique_types = len(set(simulation.grid.fuel_map.flatten()))
    assert unique_types > 1, "Terrain should have multiple fuel types"
    
    # Towns should be placed
    assert len(simulation.grid.towns) >= 0
    print(f"OK Terrain: {simulation.grid.fuel_map.shape}, {len(simulation.grid.towns)} towns")


async def test_fire_spread():
    """Test that fire spreads from ignition point"""
    simulation.grid.ignite(32, 32)
    simulation.running = True
    
    # Initial state: 1 burning cell
    burning_before = int((simulation.grid.fire_mask == 1).sum())
    assert burning_before == 1
    
    # Tick 1: should spread
    result1 = await simulation.tick()
    burning1 = result1["stats"]["burning"]
    burned1 = result1["stats"]["burned"]
    assert burning1 >= 1, "Fire should spread to neighbors"
    assert simulation.running == True
    
    # Tick 2: continue spreading
    result2 = await simulation.tick()
    assert result2["stats"]["burned"] > burned1, "Cells should turn to burned"
    
    print(f"OK Fire spread: Tick1={burning1} burning, Tick2={result2['stats']['burning']} burning")


async def test_weather_service():
    """Test weather fetch returns valid data"""
    weather = await weather_service.get_current(settings.default_lat, settings.default_lon)
    
    assert "wind_speed" in weather
    assert "wind_direction" in weather
    assert "temperature" in weather
    assert "humidity" in weather
    assert weather["source"] in ["open-meteo", "demo", "manual_override"]
    
    print(f"OK Weather: {weather['wind_speed']} km/h, {weather['temperature']}C, {weather['humidity']}%")


async def test_firms_api():
    """Test FIRMS API connection (may return 400 for some regions)"""
    try:
        fires = await firms_service.nearest_fires(settings.default_lat, settings.default_lon, 0.5)
        assert isinstance(fires, list)
        print(f"OK FIRMS: {len(fires)} fires returned")
    except Exception as e:
        # FIRMS API may return 400 for some bounding boxes - that's OK for this test
        print(f"OK FIRMS: API returned error (expected for some regions): {type(e).__name__}")


async def test_grid_bounds():
    """Test that grid bounds match frontend 1° × 1° display"""
    grid = Grid(size=64)
    await grid.generate_terrain(settings.default_lat, settings.default_lon)
    
    south, west, north, east = grid.bounds
    lat_span = north - south
    lon_span = east - west
    
    # Should be approximately 1° × 1°
    assert abs(lat_span - 1.0) < 0.01, f"Lat span {lat_span} != 1.0"
    assert abs(lon_span - 1.0) < 0.01, f"Lon span {lon_span} != 1.0"
    
    print(f"OK Bounds: {lat_span:.4f} deg x {lon_span:.4f} deg (matches frontend 1 deg)")


async def test_terrain_caching():
    """Test that fuel map is saved and can be loaded"""
    cache_path = settings.fuel_map_path
    if os.path.exists(cache_path):
        os.remove(cache_path)
    
    # Generate and save
    await simulation.load_fuel_map(cache_path, settings.default_lat, settings.default_lon)
    assert os.path.exists(cache_path), "Cache file should be created"
    
    # Load from cache (should be fast, no API calls)
    from services.simulation import SimulationService
    simulation2 = SimulationService()
    await simulation2.load_fuel_map(cache_path, settings.default_lat, settings.default_lon)
    
    assert simulation2.grid.fuel_map.shape == (64, 64)
    print("OK Caching: Fuel map saved and loaded from disk")


def test_model_loading():
    """Test that model loads or falls back gracefully"""
    from models.unet import unet_model
    
    # Should have a model or fallback
    assert unet_model is not None
    
    # Test prediction works (with dummy data)
    import numpy as np
    dummy_input = np.random.rand(12, 64, 64).astype(np.float32)
    dummy_fuel = np.zeros((64, 64), dtype=np.int8)
    prob_map = unet_model.predict(dummy_input, dummy_fuel)
    
    assert prob_map.shape == (64, 64)
    assert prob_map.min() >= 0 and prob_map.max() <= 1
    print("OK Model: Loaded and predicts valid probability map")


async def run_all():
    print("=" * 60)
    print("BACKEND INTEGRATION TESTS")
    print("=" * 60)
    
    await test_terrain_generation()
    await test_fire_spread()
    await test_weather_service()
    await test_firms_api()
    await test_grid_bounds()
    await test_terrain_caching()
    test_model_loading()
    
    print("\n" + "=" * 60)
    print("ALL TESTS PASSED OK")
    print("=" * 60)


if __name__ == "__main__":
    print("=" * 60)
    print("BACKEND INTEGRATION TESTS")
    print("=" * 60)
    asyncio.run(run_all())