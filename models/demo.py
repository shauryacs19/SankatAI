import streamlit as st
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
import numpy as np
from PIL import Image
 
#CONFIG 
MODEL_PATH  = "emergency_vision_model.h5"
IMG_SIZE    = (224, 224)
 
CLASS_NAMES = ["Abrasions", "Bruises", "Burns", "Cut", "Ingrown_nails", "Laceration", "Stab_wound"]
 
# Advice shown for each predicted wound type
FIRST_AID = {
    "Abrasions":    "Clean gently with water, apply antiseptic, and cover with a sterile bandage.",
    "Bruises":      "Apply a cold pack for 20 min to reduce swelling. Elevate if possible.",
    "Burns":        "Cool under running water for 10–20 min. Do NOT use ice or butter. Seek medical help for large burns.",
    "Cut":          "Apply firm pressure to stop bleeding. Clean and cover. Seek help if deep or gaping.",
    "Ingrown_nails":"Soak in warm water, gently lift the nail edge. See a doctor if infected.",
    "Laceration":   "Apply pressure to stop bleeding. Do not remove embedded objects. Seek medical attention.",
    "Stab_wound":   "⚠️ Call emergency services immediately. Apply pressure — do NOT remove any object.",
}

 
st.set_page_config(page_title="Emergency Vision AI", page_icon="🚑", layout="centered")
st.title("🚑 Emergency Wound Classifier")
st.caption("Upload a photo of a wound to get an AI-powered classification and basic first-aid advice.")
 
@st.cache_resource
def load_model():
    return tf.keras.models.load_model(MODEL_PATH)
 
model = load_model()
 
uploaded_file = st.file_uploader("Upload a wound photo", type=["jpg", "jpeg", "png"])
 
if uploaded_file is not None:
    img = Image.open(uploaded_file).convert("RGB")
    st.image(img, use_container_width=True, caption="Uploaded image")
 
    # Preprocess
    img_resized = img.resize(IMG_SIZE)
    img_array  = np.array(img_resized, dtype=np.float32)
    img_array  = np.expand_dims(img_array, axis=0)
    img_array  = preprocess_input(img_array)   # scales [0,255] → [−1,+1]
 
    # Predict
    preds = model.predict(img_array, verbose=0)[0]
 
    result_index = int(np.argmax(preds))
    result       = CLASS_NAMES[result_index]
    confidence   = float(preds[result_index]) * 100
 
    #Results
    st.divider()
 
    col1, col2 = st.columns(2)
    col1.metric("Prediction", result)
    col2.metric("Confidence", f"{confidence:.1f}%")
 
    if confidence < 60:
        st.warning("⚠️ Low confidence — the model is uncertain. Please verify with a medical professional.")
 
    with st.expander("💡 First Aid Advice", expanded=True):
        st.write(FIRST_AID.get(result, "Please consult a medical professional."))
 
    st.divider()
    st.write("### Full confidence breakdown")
    sorted_indices = np.argsort(preds)[::-1]
    for i in sorted_indices:
        bar_pct = float(preds[i])
        st.progress(bar_pct, text=f"{CLASS_NAMES[i]}: {bar_pct*100:.1f}%")
 
    st.caption("🔴 This tool is for informational purposes only and does not replace professional medical advice.")
 