import tensorflow as tf
from tensorflow.keras.preprocessing import image_dataset_from_directory
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.models import Model
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
import os


DATA_DIR    = "/Users/vihaan/Documents/6thsem/Mini-project/Emergency_ai/Wound_dataset"
IMG_SIZE    = (224, 224)
BATCH_SIZE  = 32
EPOCHS      = 20
MODEL_PATH  = "emergency_vision_model.h5"


# 1. Load datasets
print("📂 Loading dataset...")

train_ds = image_dataset_from_directory(
    DATA_DIR,
    validation_split=0.2,
    subset="training",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="categorical",
)

val_ds = image_dataset_from_directory(
    DATA_DIR,
    validation_split=0.2,
    subset="validation",
    seed=123,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="categorical",
)

class_names = train_ds.class_names
print(f"✅ Classes detected ({len(class_names)}): {class_names}")



train_ds = train_ds.map(lambda x, y: (preprocess_input(x), y),
                        num_parallel_calls=tf.data.AUTOTUNE)
val_ds   = val_ds.map(lambda x, y: (preprocess_input(x), y),
                      num_parallel_calls=tf.data.AUTOTUNE)

train_ds = train_ds.cache().shuffle(1000).prefetch(tf.data.AUTOTUNE)
val_ds   = val_ds.cache().prefetch(tf.data.AUTOTUNE)

print("🧠 Building model...")
base_model = MobileNetV2(weights="imagenet", include_top=False, input_shape=(224, 224, 3))
base_model.trainable = False 

x = base_model.output
x = GlobalAveragePooling2D()(x)
x = Dense(128, activation="relu")(x)
x = Dropout(0.3)(x)
predictions = Dense(len(class_names), activation="softmax")(x)

model = Model(inputs=base_model.input, outputs=predictions)

# 4. Compile
model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss="categorical_crossentropy",
    metrics=["accuracy"],
)

# 5. Callbacks
callbacks = [
    # Stop early if val_accuracy stops improving
    EarlyStopping(monitor="val_accuracy", patience=5, restore_best_weights=True, verbose=1),
    # Save the best checkpoint automatically
    ModelCheckpoint(MODEL_PATH, monitor="val_accuracy", save_best_only=True, verbose=1),
    # Reduce LR when stuck
    ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6, verbose=1),
]

# 6. Phase 1 — train only the new head
print("\n🚀 Phase 1: Training head only...")
model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS, callbacks=callbacks)

# 7. Phase 2 — fine-tune the top layers of the backbone
print("\n🔓 Phase 2: Fine-tuning top layers of MobileNetV2...")
base_model.trainable = True

# Freeze all layers except the last 30
for layer in base_model.layers[:-30]:
    layer.trainable = False

# Re-compile with a much lower learning rate for fine-tuning
model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
    loss="categorical_crossentropy",
    metrics=["accuracy"],
)

model.fit(train_ds, validation_data=val_ds, epochs=10, callbacks=callbacks)

print(f"\n✅ Best model saved to {MODEL_PATH}")
print(f"   Class order: {class_names}")