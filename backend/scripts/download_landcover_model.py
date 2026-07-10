import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def main():
    logger.info("Downloading SegFormer landcover model and exporting to ONNX...")
    from models.landcover_model import landcover_model
    success = landcover_model.load()
    if success:
        logger.info("Done — model saved to backend/models/landcover_onnx/model.onnx")
    else:
        logger.error("Failed to download/export model. Check internet connection.")
        sys.exit(1)

if __name__ == "__main__":
    main()
