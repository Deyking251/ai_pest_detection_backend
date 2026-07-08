import os
import sys
from groq import Groq

# Load environment variables
def load_env():
    env_path = ".env"
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k.strip()] = v.strip()

load_env()

api_key = os.environ.get("GROQ_API_KEY")
model = os.environ.get("GROQ_VISION_MODEL", "llama-3.2-11b-vision-preview")

print(f"Groq API Key: {api_key}")
print(f"Vision Model: {model}")

if not api_key:
    print("No Groq API Key found!")
    sys.exit(1)

client = Groq(api_key=api_key)

try:
    print("Testing chat completion...")
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Hello"}]
    )
    print("Chat response:")
    print(completion.choices[0].message.content)
except Exception as e:
    print(f"Chat failed: {e}")

try:
    print("\nTesting vision completion (using a blank dummy image base64 if needed or just checking authentication)...")
    # Let's send a minimal base64 pixel of 1x1 png to check if key works with vision
    # Red dot 1x1 png base64: iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is in this image?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="}
                    }
                ]
            }
        ]
    )
    print("Vision response:")
    print(completion.choices[0].message.content)
except Exception as e:
    print(f"Vision failed: {e}")
