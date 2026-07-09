import os
import sys
import json
import io
import base64
import numpy as np
from pathlib import Path

import torch
from torch.utils.data import Dataset, DataLoader

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from config import settings

DATA_DIR = Path(__file__).resolve().parent.parent / "datasets" / "converted"
MODEL_PATH = Path(settings.model_path)
RESULTS_DIR = Path(__file__).resolve().parent / "models" / "evaluation_results"


class EvalDataset(Dataset):
    def __init__(self, inputs_path, labels_path):
        self.inputs = torch.load(inputs_path, map_location="cpu", weights_only=True)
        self.labels = torch.load(labels_path, map_location="cpu", weights_only=True)

    def __len__(self):
        return self.inputs.shape[0]

    def __getitem__(self, idx):
        return self.inputs[idx].float(), self.labels[idx].float()


def dice_score(pred, target, eps=1e-7):
    intersection = (pred * target).sum()
    return (2.0 * intersection + eps) / (pred.sum() + target.sum() + eps)


def iou_score(pred, target, eps=1e-7):
    intersection = (pred * target).sum()
    union = pred.sum() + target.sum() - intersection
    return (intersection + eps) / (union + eps)


def metrics(pred_bin, target):
    tp = (pred_bin * target).sum().item()
    fp = (pred_bin * (1 - target)).sum().item()
    fn = ((1 - pred_bin) * target).sum().item()
    tn = ((1 - pred_bin) * (1 - target)).sum().item()
    precision = tp / (tp + fp + 1e-7)
    recall = tp / (tp + fn + 1e-7)
    f1 = 2 * precision * recall / (precision + recall + 1e-7)
    accuracy = (tp + tn) / (tp + fp + fn + tn + 1e-7)
    return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4), "accuracy": round(accuracy, 4)}


def load_model():
    try:
        import segmentation_models_pytorch as smp
        device = torch.device(settings.device)
        model = smp.Unet(
            encoder_name="resnet34",
            encoder_weights=None,
            in_channels=settings.input_channels,
            classes=1,
        )
        checkpoint = torch.load(MODEL_PATH, map_location=device)
        model.load_state_dict(checkpoint)
        model.to(device)
        model.eval()
        return model, device, "ResNet34-UNet"
    except (ImportError, FileNotFoundError) as e:
        print(f"Error loading model: {e}")
        return None, None, None


def evaluate():
    os.makedirs(RESULTS_DIR, exist_ok=True)

    test_data_path = DATA_DIR / "test_data.pt"
    test_labels_path = DATA_DIR / "test_labels.pt"

    if not test_data_path.exists() or not test_labels_path.exists():
        return {"error": f"Test dataset not found at {DATA_DIR}"}

    model, device, model_name = load_model()
    if model is None:
        return {"error": "Failed to load model — check checkpoint file and dependencies"}

    dataset = EvalDataset(str(test_data_path), str(test_labels_path))
    loader = DataLoader(dataset, batch_size=32, shuffle=False, num_workers=2)

    all_metrics = {"precision": [], "recall": [], "f1": [], "accuracy": [], "dice": [], "iou": []}
    sample_images = []

    with torch.no_grad():
        for batch_idx, (inputs, labels) in enumerate(loader):
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = torch.sigmoid(model(inputs))
            pred_bin = (outputs > 0.5).float()

            for i in range(inputs.size(0)):
                m = metrics(pred_bin[i], labels[i])
                d = dice_score(pred_bin[i], labels[i]).item()
                iou = iou_score(pred_bin[i], labels[i]).item()
                for k in m:
                    all_metrics[k].append(m[k])
                all_metrics["dice"].append(round(d, 4))
                all_metrics["iou"].append(round(iou, 4))

            if batch_idx == 0:
                for i in range(min(5, inputs.size(0))):
                    fire_mask = inputs[i, 0].cpu().numpy()
                    prob = outputs[i, 0].cpu().numpy()
                    gt = labels[i, 0].cpu().numpy()
                    pred = pred_bin[i, 0].cpu().numpy()

                    sample_images.append({
                        "fire_mask": fire_mask.tolist(),
                        "prediction_prob": np.round(prob, 4).tolist(),
                        "prediction_bin": pred.tolist(),
                        "ground_truth": gt.tolist(),
                        "metrics": metrics(pred, labels[i, 0]),
                    })

    summary = {k: round(float(np.mean(v)), 4) for k, v in all_metrics.items()}

    result = {
        "model": model_name,
        "test_samples": len(dataset),
        "summary": summary,
        "samples": sample_images,
    }

    result_path = RESULTS_DIR / "latest_eval.json"
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)

    return result


if __name__ == "__main__":
    result = evaluate()
    print(json.dumps(result.get("summary", result), indent=2))
