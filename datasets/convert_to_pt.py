"""
Convert Next-Day Wildfire Spread TFRecords to PyTorch tensors.

Channel order (12 channels, consistent with backend Normalizer):
  0: PrevFireMask         → fire_mask (inference)
  1: temperature (tmmx)   → Open-Meteo temp
  2: wind speed (vs)      → Open-Meteo wind speed
  3: wind direction (th)  → Open-Meteo wind direction
  4: humidity (sph)       → Open-Meteo humidity
  5: elevation            → 0 (inference)
  6: pdsi (drought)       → 0 (inference)
  7: NDVI (vegetation)    → 0 (inference)
  8: population           → 0 (inference)
  9: precipitation (pr)   → 0 (inference)
  10: erc (fire danger)   → 0 (inference)
  11: tmmn (min temp)     → 0 (inference)

Label:
  FireMask

Usage:
    python datasets/convert_to_pt.py
"""

import os
import numpy as np
import torch

SPLITS = ["train", "eval", "test"]
DATA_DIR = os.path.join(os.path.dirname(__file__), "next-day-wildfire-spread")
OUT_DIR = os.path.join(os.path.dirname(__file__), "converted")

H = 64
W = 64

FEATURE_MAP = {
    "PrevFireMask": 0,
    "tmmx": 1,
    "vs": 2,
    "th": 3,
    "sph": 4,
    "elevation": 5,
    "pdsi": 6,
    "NDVI": 7,
    "population": 8,
    "pr": 9,
    "erc": 10,
    "tmmn": 11,
}


def convert_split(split: str):
    import tfrecord
    from tfrecord import example_pb2

    split_dir = os.path.join(DATA_DIR, split)
    out_path = os.path.join(OUT_DIR, f"{split}_data.pt")
    out_labels_path = os.path.join(OUT_DIR, f"{split}_labels.pt")

    if os.path.exists(out_path) and os.path.exists(out_labels_path):
        print(f"[{split}] Already converted, skipping.")
        return

    tfrecord_files = sorted([
        os.path.join(split_dir, f)
        for f in os.listdir(split_dir)
        if f.endswith(".tfrecord")
    ])

    if not tfrecord_files:
        print(f"[{split}] No TFRecord files found in {split_dir}")
        return

    print(f"[{split}] Files: {[os.path.basename(f) for f in tfrecord_files]}")

    all_inputs = []
    all_labels = []

    for filepath in tfrecord_files:
        print(f"[{split}] Reading {os.path.basename(filepath)}...")
        count = 0
        for record in tfrecord.tfrecord_iterator(filepath):
            ex = example_pb2.Example()
            ex.ParseFromString(bytes(record))
            feat = ex.features.feature

            tensor = np.zeros((12, H, W), dtype=np.float32)
            for name, ch in FEATURE_MAP.items():
                vals = np.array(feat[name].float_list.value, dtype=np.float32)
                tensor[ch] = vals.reshape(H, W)

            fire = np.array(feat["FireMask"].float_list.value, dtype=np.float32).reshape(1, H, W)
            fire = (fire > 0.5).astype(np.float32)

            all_inputs.append(tensor)
            all_labels.append(fire)
            count += 1

        print(f"[{split}]   Records: {count}")

    if not all_inputs:
        print(f"[{split}] No records found.")
        return

    inputs_tensor = torch.from_numpy(np.stack(all_inputs, axis=0))
    labels_tensor = torch.from_numpy(np.stack(all_labels, axis=0))

    os.makedirs(OUT_DIR, exist_ok=True)
    torch.save(inputs_tensor, out_path)
    torch.save(labels_tensor, out_labels_path)
    print(f"[{split}] Saved: {out_path} ({inputs_tensor.shape})")
    print(f"[{split}] Saved: {out_labels_path} ({labels_tensor.shape})")


if __name__ == "__main__":
    for split in SPLITS:
        convert_split(split)
    print("\nDone! Converted files are in:", OUT_DIR)