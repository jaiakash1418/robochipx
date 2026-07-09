# Training Pipeline

## Setup

```bash
pip install -r training/requirements.txt
```

## Step 1: Convert TFRecords → PyTorch tensors

```bash
python datasets/convert_to_pt.py
```

Output: `datasets/converted/train_data.pt`, `train_labels.pt`, `eval_data.pt`, `eval_labels.pt`

## Step 2: Train the model

```bash
python training/train.py
```

Output: `backend/models/unet_checkpoint.pt`

## Output

| Artifact | Path |
|---|---|
| Model weights | `backend/models/unet_checkpoint.pt` |
| Training history | `backend/models/training_history.json` |

## Notes

- Uses ResNet34-UNet from `segmentation_models_pytorch` with ImageNet pretrained encoder
- Focal loss (γ=2) with class weighting for imbalance (>97% non-fire pixels)
- Target: ~0.45 AP / ~0.55-0.59 F1 score
- Training time: ~30-60 min on GPU, ~2-3 hours on CPU with 64x64 inputs
