#!/usr/bin/env python3
"""
Setup script to download and cache the Hugging Face model locally.
Run this once: ./venv/bin/python setup_model.py
"""
import sys
import os

def main():
    print("=" * 60)
    print("  CropGuard AI - Model Setup")
    print("=" * 60)
    print()
    
    # Step 1: Verify dependencies
    print("[1/4] Verifying dependencies...")
    try:
        import torch
        print(f"  ✅ torch {torch.__version__}")
    except ImportError:
        print("  ❌ torch not installed!")
        print("  Run: ./venv/bin/pip install torch")
        sys.exit(1)
    
    try:
        import transformers
        print(f"  ✅ transformers {transformers.__version__}")
    except ImportError:
        print("  ❌ transformers not installed!")
        print("  Run: ./venv/bin/pip install transformers")
        sys.exit(1)
    
    try:
        from PIL import Image
        print(f"  ✅ Pillow (PIL)")
    except ImportError:
        print("  ❌ Pillow not installed!")
        print("  Run: ./venv/bin/pip install Pillow")
        sys.exit(1)
    
    print()
    
    # Step 2: Download image processor
    print("[2/4] Downloading image processor from google/mobilenet_v2_1.0_224...")
    from transformers import AutoImageProcessor
    processor = AutoImageProcessor.from_pretrained("google/mobilenet_v2_1.0_224")
    print("  ✅ Image processor downloaded and cached!")
    print()
    
    # Step 3: Download the plant disease model
    model_id = "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"
    print(f"[3/4] Downloading model: {model_id}...")
    from transformers import AutoModelForImageClassification
    model = AutoModelForImageClassification.from_pretrained(model_id)
    print("  ✅ Model downloaded and cached!")
    print(f"  Model has {sum(p.numel() for p in model.parameters())} parameters")
    print(f"  Number of classes: {model.config.num_labels}")
    print()
    
    # Step 4: Run a quick test prediction
    print("[4/4] Running test prediction with dummy image...")
    import numpy as np
    
    # Create a dummy 224x224 green image (simulating a leaf)
    dummy = Image.fromarray(np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8))
    inputs = processor(images=dummy, return_tensors="pt")
    
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        predicted_class_idx = logits.argmax(-1).item()
        confidence = torch.softmax(logits, dim=-1)[0, predicted_class_idx].item()
    
    label = model.config.id2label.get(str(predicted_class_idx), f"class_{predicted_class_idx}")
    print(f"  ✅ Prediction: '{label}' (confidence: {confidence:.2%})")
    print()
    
    # Step 5: Test with actual uploaded image if available
    test_images = [
        "uploads/test_disease_tomato.jpg",
        "uploads/test_healthy_tomato.jpg",
    ]
    
    for img_path in test_images:
        if os.path.exists(img_path):
            print(f"  Testing with {img_path}...")
            try:
                image = Image.open(img_path).convert("RGB")
                inputs = processor(images=image, return_tensors="pt")
                with torch.no_grad():
                    outputs = model(**inputs)
                    logits = outputs.logits
                    idx = logits.argmax(-1).item()
                    conf = torch.softmax(logits, dim=-1)[0, idx].item()
                label = model.config.id2label.get(str(idx), f"class_{idx}")
                print(f"  ✅ {img_path}: '{label}' (confidence: {conf:.2%})")
            except Exception as e:
                print(f"  ⚠️  {img_path}: Error - {e}")
    
    print()
    print("=" * 60)
    print("  ✅ Setup complete! Model is cached locally.")
    print("  You can now start the backend server with: npm start")
    print("=" * 60)


if __name__ == "__main__":
    main()
