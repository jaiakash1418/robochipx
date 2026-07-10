import os
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent / "landcover_onnx"
ONNX_PATH = MODEL_DIR / "model.onnx"
HF_REPO = "boehnen/satlens-segformer"

OEM_CLASSES = {
    0: "background", 1: "bareland", 2: "rangeland",
    3: "developed", 4: "road", 5: "tree", 6: "water", 7: "agriculture",
}

OEM_TO_FUEL = {
    0: 1, 1: 1, 2: 1, 3: 3, 4: 4, 5: 0, 6: 2, 7: 1,
}


class LandcoverONNXModel:
    def __init__(self):
        self._session: Optional["onnxruntime.InferenceSession"] = None
        self._input_name: Optional[str] = None
        self._output_name: Optional[str] = None

    def is_loaded(self) -> bool:
        return self._session is not None

    def load(self) -> bool:
        if self._session is not None:
            return True
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        if ONNX_PATH.exists():
            try:
                return self._load_onnx()
            except Exception as e:
                logger.warning(f"Failed to load ONNX model: {e}")
                ONNX_PATH.unlink(missing_ok=True)
        try:
            self._export_to_onnx()
            return self._load_onnx()
        except Exception as e:
            logger.warning(f"ONNX export failed: {e}")
            return False

    def _load_onnx(self) -> bool:
        import onnxruntime
        self._session = onnxruntime.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name
        return True

    def _export_to_onnx(self):
        import torch
        torch.backends.cudnn.enabled = False
        from transformers import AutoImageProcessor, SegformerForSemanticSegmentation
        logger.info(f"Downloading {HF_REPO} from HuggingFace Hub (first run only)...")
        processor = AutoImageProcessor.from_pretrained(HF_REPO)
        model = SegformerForSemanticSegmentation.from_pretrained(HF_REPO)
        model.eval()
        dummy = processor(images=Image.new("RGB", (512, 512)), return_tensors="pt")
        with torch.no_grad():
            torch.onnx.export(model, dummy["pixel_values"], str(ONNX_PATH),
                              input_names=["pixel_values"], output_names=["logits"],
                              dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
                              opset_version=14)
        logger.info("ONNX export complete")

    def predict(self, image: Image.Image) -> Optional[np.ndarray]:
        if not self.is_loaded() and not self.load():
            return None
        img = np.array(image.resize((512, 512), Image.LANCZOS), dtype=np.float32).transpose(2, 0, 1)
        mean, std = np.array([123.675, 116.28, 103.53]).reshape(3, 1, 1), np.array([58.395, 57.12, 57.375]).reshape(3, 1, 1)
        pixel_values = np.expand_dims((img - mean) / std, axis=0)
        logits = self._session.run([self._output_name], {self._input_name: pixel_values})[0]
        return np.argmax(logits[0], axis=0).astype(np.int8)

    def predict_to_fuel(self, image: Image.Image, grid_size: int = 64) -> Optional[dict]:
        pred = self.predict(image)
        if pred is None:
            return None
        h, w = pred.shape
        cell_h, cell_w = h // grid_size, w // grid_size
        if cell_h == 0 or cell_w == 0:
            return None
        fuel = np.zeros((grid_size, grid_size), dtype=np.int8)
        classes_grid = []
        for r in range(grid_size):
            row_classes = []
            for c in range(grid_size):
                patch = pred[r * cell_h:(r + 1) * cell_h, c * cell_w:(c + 1) * cell_w]
                dominant = np.argmax(np.bincount(patch.ravel()))
                fuel[r, c] = OEM_TO_FUEL.get(int(dominant), 1)
                row_classes.append(OEM_CLASSES.get(int(dominant), "rangeland"))
            classes_grid.append(row_classes)
        return {"fuel_map": fuel.tolist(), "landcover": fuel.tolist(), "classes": classes_grid, "source": "satlens+openearthmap"}


landcover_model = LandcoverONNXModel()
