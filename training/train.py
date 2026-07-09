import os
import sys
import math
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import torchvision.transforms.functional as TF
from tqdm import tqdm

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from config import settings

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "converted")
MODEL_SAVE_DIR = os.path.join(os.path.dirname(__file__), "..", "backend", "models")
MODEL_SAVE_PATH = os.path.join(MODEL_SAVE_DIR, "unet_checkpoint.pt")

BATCH_SIZE = 64
EPOCHS = 50
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-4
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
EARLY_STOPPING_PATIENCE = 7


class FocalLoss(nn.Module):
    def __init__(self, gamma=2.0, alpha=None):
        super().__init__()
        self.gamma = gamma
        self.alpha = alpha

    def forward(self, logits, targets):
        BCE_loss = nn.functional.binary_cross_entropy_with_logits(logits, targets, reduction="none")
        probs = torch.sigmoid(logits)
        pt = torch.where(targets == 1, probs, 1 - probs)
        focal_weight = (1 - pt) ** self.gamma

        if self.alpha is not None:
            alpha_t = targets * self.alpha + (1 - targets) * (1 - self.alpha)
            focal_weight = alpha_t * focal_weight

        return focal_weight.mean()


class SimpleUNet(nn.Module):
    def __init__(self, in_channels=12, out_channels=1, base_filters=64):
        super().__init__()
        self.enc1 = self._block(in_channels, base_filters)
        self.enc2 = self._block(base_filters, base_filters * 2)
        self.enc3 = self._block(base_filters * 2, base_filters * 4)
        self.enc4 = self._block(base_filters * 4, base_filters * 8)

        self.pool = nn.MaxPool2d(2)
        self.bottleneck = self._block(base_filters * 8, base_filters * 16)

        self.up4 = nn.ConvTranspose2d(base_filters * 16, base_filters * 8, 2, 2)
        self.dec4 = self._block(base_filters * 16, base_filters * 8)
        self.up3 = nn.ConvTranspose2d(base_filters * 8, base_filters * 4, 2, 2)
        self.dec3 = self._block(base_filters * 8, base_filters * 4)
        self.up2 = nn.ConvTranspose2d(base_filters * 4, base_filters * 2, 2, 2)
        self.dec2 = self._block(base_filters * 4, base_filters * 2)
        self.up1 = nn.ConvTranspose2d(base_filters * 2, base_filters, 2, 2)
        self.dec1 = self._block(base_filters * 2, base_filters)

        self.dropout = nn.Dropout2d(0.3)
        self.out = nn.Conv2d(base_filters, out_channels, 1)

    def _block(self, in_c, out_c):
        return nn.Sequential(
            nn.Conv2d(in_c, out_c, 3, padding=1),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_c, out_c, 3, padding=1),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))

        b = self.bottleneck(self.pool(e4))

        d4 = self.up4(b)
        d4 = torch.cat([d4, e4], dim=1)
        d4 = self.dec4(d4)
        d4 = self.dropout(d4)
        d3 = self.up3(d4)
        d3 = torch.cat([d3, e3], dim=1)
        d3 = self.dec3(d3)
        d3 = self.dropout(d3)
        d2 = self.up2(d3)
        d2 = torch.cat([d2, e2], dim=1)
        d2 = self.dec2(d2)
        d2 = self.dropout(d2)
        d1 = self.up1(d2)
        d1 = torch.cat([d1, e1], dim=1)
        d1 = self.dec1(d1)
        d1 = self.dropout(d1)

        return self.out(d1)


def augment(x: torch.Tensor, y: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    if torch.rand(1) > 0.5:
        x = TF.hflip(x)
        y = TF.hflip(y)
    if torch.rand(1) > 0.5:
        x = TF.vflip(x)
        y = TF.vflip(y)
    k = torch.randint(0, 4, (1,)).item()
    if k > 0:
        x = torch.rot90(x, k, dims=[-2, -1])
        y = torch.rot90(y, k, dims=[-2, -1])
    return x, y


class WildfireDataset(Dataset):
    def __init__(self, inputs_path: str, labels_path: str, augment: bool = False):
        self.inputs = torch.load(inputs_path, map_location="cpu", weights_only=True)
        self.labels = torch.load(labels_path, map_location="cpu", weights_only=True)
        self.augment = augment

        assert self.inputs.shape[0] == self.labels.shape[0], (
            f"Mismatch: {self.inputs.shape[0]} inputs vs {self.labels.shape[0]} labels"
        )

    def __len__(self):
        return self.inputs.shape[0]

    def __getitem__(self, idx):
        x = self.inputs[idx].float()
        y = self.labels[idx].float()
        if self.augment:
            x, y = augment(x, y)
        return x, y


def compute_class_weights(labels_path: str) -> float:
    labels = torch.load(labels_path, map_location="cpu", weights_only=True)
    fire_pixels = labels.sum().item()
    total_pixels = labels.numel()
    non_fire_pixels = total_pixels - fire_pixels
    alpha = non_fire_pixels / fire_pixels if fire_pixels > 0 else 0.99
    alpha = min(alpha, 0.99)
    print(f"  Class weight alpha: {alpha:.4f} (fire ratio: {fire_pixels/total_pixels:.6f})")
    return alpha


def dice_coefficient(preds: torch.Tensor, targets: torch.Tensor, threshold=0.5, eps=1e-7):
    preds = (torch.sigmoid(preds) > threshold).float()
    intersection = (preds * targets).sum()
    return (2.0 * intersection + eps) / (preds.sum() + targets.sum() + eps)


def average_precision(preds: torch.Tensor, targets: torch.Tensor, threshold=0.5):
    preds = torch.sigmoid(preds)
    preds_bin = (preds > threshold).float()
    tp = (preds_bin * targets).sum().item()
    fp = (preds_bin * (1 - targets)).sum().item()
    fn = ((1 - preds_bin) * targets).sum().item()
    precision = tp / (tp + fp + 1e-7)
    recall = tp / (tp + fn + 1e-7)
    f1 = 2 * precision * recall / (precision + recall + 1e-7)
    return precision, recall, f1


def build_model():
    try:
        import segmentation_models_pytorch as smp
        model = smp.Unet(
            encoder_name="resnet34",
            encoder_weights="imagenet",
            in_channels=12,
            classes=1,
            decoder_attention_type="scse",
        )
        print("  Using ResNet34-UNet (segmentation_models_pytorch)")
        print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")
        return model
    except ImportError:
        print("  segmentation_models_pytorch not available. Using SimpleUNet fallback.")
        model = SimpleUNet(in_channels=12, out_channels=1)
        print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")
        return model


def train():
    for path in [f"{s}_{t}.pt" for s in ["train", "eval"] for t in ["data", "labels"]]:
        full = os.path.join(DATA_DIR, path)
        if not os.path.exists(full):
            print(f"ERROR: Missing {full}")
            print("Run `python datasets/convert_to_pt.py` first to convert TFRecords.")
            sys.exit(1)

    os.makedirs(MODEL_SAVE_DIR, exist_ok=True)
    print(f"Device: {DEVICE}")
    print(f"Batch size: {BATCH_SIZE}, Epochs: {EPOCHS}, LR: {LEARNING_RATE}")

    print("\nComputing class weights from training data...")
    train_labels_path = os.path.join(DATA_DIR, "train_labels.pt")
    alpha = compute_class_weights(train_labels_path)

    print("\nLoading datasets...")
    train_dataset = WildfireDataset(
        os.path.join(DATA_DIR, "train_data.pt"),
        os.path.join(DATA_DIR, "train_labels.pt"),
        augment=True,
    )
    val_dataset = WildfireDataset(
        os.path.join(DATA_DIR, "eval_data.pt"),
        os.path.join(DATA_DIR, "eval_labels.pt"),
    )

    print(f"  Train samples: {len(train_dataset)}")
    print(f"  Val samples:   {len(val_dataset)}")

    train_loader = DataLoader(
        train_dataset, batch_size=BATCH_SIZE, shuffle=True,
        num_workers=4, pin_memory=True, drop_last=True
    )
    val_loader = DataLoader(
        val_dataset, batch_size=BATCH_SIZE, shuffle=False,
        num_workers=4, pin_memory=True
    )

    print("\nBuilding model...")
    model = build_model()
    model.to(DEVICE)

    criterion = FocalLoss(gamma=2.0, alpha=alpha)
    optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", factor=0.5, patience=3, verbose=True,
    )

    best_f1 = 0.0
    epochs_no_improve = 0
    best_epoch = 0
    history = {"train_loss": [], "val_loss": [], "val_f1": [], "val_precision": [], "val_recall": []}

    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_loss = 0.0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch}/{EPOCHS} [Train]")
        for inputs, labels in pbar:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item()
            pbar.set_postfix(loss=loss.item())

        avg_train_loss = train_loss / len(train_loader)
        history["train_loss"].append(avg_train_loss)

        model.eval()
        val_loss = 0.0
        all_prec, all_rec, all_f1 = [], [], []

        with torch.no_grad():
            pbar = tqdm(val_loader, desc=f"Epoch {epoch}/{EPOCHS} [Val]")
            for inputs, labels in pbar:
                inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
                outputs = model(inputs)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                prec, rec, f1 = average_precision(outputs, labels)
                all_prec.append(prec)
                all_rec.append(rec)
                all_f1.append(f1)
                pbar.set_postfix(f1=f1)

        avg_val_loss = val_loss / len(val_loader)
        avg_prec = np.mean(all_prec)
        avg_rec = np.mean(all_rec)
        avg_f1 = np.mean(all_f1)

        history["val_loss"].append(avg_val_loss)
        history["val_f1"].append(avg_f1)
        history["val_precision"].append(avg_prec)
        history["val_recall"].append(avg_rec)

        print(f"\n  Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f}")
        print(f"  Val Precision: {avg_prec:.4f} | Recall: {avg_rec:.4f} | F1: {avg_f1:.4f}")

        scheduler.step(avg_f1)

        if avg_f1 > best_f1:
            best_f1 = avg_f1
            best_epoch = epoch
            epochs_no_improve = 0
            torch.save(model.state_dict(), MODEL_SAVE_PATH)
            print(f"  >> New best model saved! (F1: {best_f1:.4f})")
        else:
            epochs_no_improve += 1
            print(f"  No improvement for {epochs_no_improve} epoch(s)")

        if epochs_no_improve >= EARLY_STOPPING_PATIENCE:
            print(f"\nEarly stopping triggered after {epoch} epochs (best at epoch {best_epoch})")
            break

    print(f"\n=== Training Complete ===")
    print(f"Best validation F1: {best_f1:.4f} (epoch {best_epoch})")
    print(f"Model saved to: {MODEL_SAVE_PATH}")

    history_path = os.path.join(MODEL_SAVE_DIR, "training_history.json")
    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)
    print(f"Training history saved to: {history_path}")


if __name__ == "__main__":
    train()