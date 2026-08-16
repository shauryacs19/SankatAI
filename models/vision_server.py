from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
import numpy as np
from PIL import Image
import io
import os
 
#CONFIG
MODEL_PATH  = "emergency_vision_model.h5"
IMG_SIZE    = (224, 224)
PORT        = 5000
 

CLASS_NAMES = ["Abrasions", "Bruises", "Burns", "Cut", "Ingrown_nails", "Laceration", "Stab_wound"]

 
app = Flask(__name__)
CORS(app)  # allows your frontend app to call this API
 
print("🧠 Loading model...")
model = tf.keras.models.load_model(MODEL_PATH)
print(f"✅ Model loaded — serving {len(CLASS_NAMES)} classes on port {PORT}")
 
 
@app.route("/health", methods=["GET"])
def health():
    """Simple health check so your frontend can confirm the server is up."""
    return jsonify({"status": "ok", "classes": CLASS_NAMES})
 
 
@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded. Send a multipart/form-data request with key 'image'."}), 400
 
    try:
        file      = request.files["image"]
        img       = Image.open(io.BytesIO(file.read())).convert("RGB").resize(IMG_SIZE)
        img_array = np.array(img, dtype=np.float32)
        img_array = np.expand_dims(img_array, axis=0)
 
        # (scales [0,255] → [−1,+1] as MobileNetV2 expects)
        img_array = preprocess_input(img_array)
 
        
        
        preds      = model.predict(img_array, verbose=0)[0]
        pred_index = int(np.argmax(preds))
 
        all_scores = {CLASS_NAMES[i]: round(float(preds[i]) * 100, 2) for i in range(len(CLASS_NAMES))}
 
        return jsonify({
            "prediction": CLASS_NAMES[pred_index],
            "confidence": round(float(preds[pred_index]) * 100, 2),
            "all_scores": all_scores,
        })
 
    except Exception as e:
        return jsonify({"error": str(e)}), 500
 
 
if __name__ == "__main__":
    print(f"🚀 Vision AI Server running at http://localhost:{PORT}")
    print("   POST an image to /predict   |   GET /health to check status")
    app.run(port=PORT, debug=False)
 