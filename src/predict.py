import os
import sys
import json
import re
from PIL import Image

# ─── Google Gemini Configuration ─────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

# ─── Structured Prompt for Plant Disease Analysis ────────────────────────────
ANALYSIS_PROMPT = """You are an expert agricultural scientist and plant pathologist. 
Analyze this plant/crop image carefully and provide a detailed disease/pest diagnosis.

IMPORTANT RULES:
1. If the image shows a plant, crop, leaf, fruit, or any agricultural specimen, analyze it for diseases, pests, or health status.
2. If the plant appears healthy with no issues, say so clearly and still identify the plant name.
3. If you cannot identify the specific disease, provide your best assessment based on visible symptoms.
4. Be specific about the crop type and the disease/condition name.
5. ALWAYS identify the plant/crop name even if it is healthy.

Respond ONLY with a valid JSON object in this exact format (no markdown, no code fences, just raw JSON):
{
    "cropName": "Name of the crop/plant (e.g., Tomato, Rice, Banana, Mango, Rose, Tulsi, Neem, etc.)",
    "issueName": "Name of the disease, pest, or condition (e.g., 'Leaf Blight', 'Healthy Leaf', 'Powdery Mildew')",
    "confidence": 0.92,
    "severity": "None|Low|Moderate|High",
    "description": "Detailed 2-3 sentence description of the condition, its cause (pathogen name if applicable), and how it affects the plant.",
    "treatments": [
        "First specific treatment recommendation",
        "Second specific treatment recommendation", 
        "Third specific treatment recommendation"
    ]
}

SEVERITY GUIDE:
- "None" = Plant is healthy, no disease detected
- "Low" = Minor cosmetic issue, minimal yield impact
- "Moderate" = Needs attention, could worsen without treatment
- "High" = Serious condition requiring immediate action

For confidence: Use a value between 0.70 and 0.99 based on how clearly the symptoms are visible.
For healthy plants, set severity to "None" and confidence to 0.95+.
Always provide at least 2-3 actionable treatment/care recommendations relevant to the specific crop.
"""


def query_gemini(image_path):
    """
    Send image + prompt to Google Gemini Vision API using official SDK.
    Returns the text response from Gemini.
    """
    if not GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is not set in the environment variables. Please add it to your .env file."
        )

    # Import and configure the Google GenAI SDK
    try:
        from google import genai
    except ImportError:
        raise RuntimeError(
            "google-genai package is not installed. Run: pip install google-genai"
        )

    # Create client with API key
    client = genai.Client(api_key=GEMINI_API_KEY)

    # Open and prepare the image
    sys.stderr.write(f"Opening image: {image_path}\n")
    img = Image.open(image_path)

    # Ensure image is in RGB mode (handle RGBA/palette PNGs)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    sys.stderr.write(f"Image size: {img.size}, mode: {img.mode}\n")

    # Send to Gemini
    sys.stderr.write(f"Sending image to Gemini ({GEMINI_MODEL})...\n")

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[img, ANALYSIS_PROMPT],
    )

    text_content = response.text.strip()
    sys.stderr.write(f"Gemini response received ({len(text_content)} chars)\n")

    return text_content


def extract_json_from_response(text):
    """
    Extract JSON object from Gemini response text.
    Handles cases where response might include markdown code fences.
    """
    # Try to find JSON in code fences first
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if json_match:
        return json.loads(json_match.group(1))

    # Try to find raw JSON object (handles nested objects like treatments array)
    # Find the first { and last }
    first_brace = text.find('{')
    last_brace = text.rfind('}')
    if first_brace != -1 and last_brace != -1:
        json_str = text[first_brace:last_brace + 1]
        return json.loads(json_str)

    # Try parsing the entire text as JSON
    return json.loads(text)


def predict_disease(image_path):
    """
    Run plant disease prediction via Google Gemini Vision API.
    Returns a structured diagnosis dictionary.
    """
    # Step 1: Analyze the plant image
    sys.stderr.write(f"Analyzing image: {image_path}\n")
    raw_response = query_gemini(image_path)
    sys.stderr.write(f"Gemini raw response: {raw_response[:500]}\n")

    # Step 2: Parse the JSON response
    try:
        diagnosis = extract_json_from_response(raw_response)
    except (json.JSONDecodeError, ValueError) as e:
        sys.stderr.write(f"Failed to parse Gemini JSON response: {e}\n")
        sys.stderr.write(f"Raw response was: {raw_response}\n")
        # Return a reasonable fallback
        return {
            "cropName": "Unknown",
            "issueName": "Analysis Incomplete",
            "confidence": 0.5,
            "severity": "Moderate",
            "description": f"The AI analyzed the image but returned an unparseable response. Raw analysis: {raw_response[:200]}",
            "treatments": [
                "Try uploading a clearer, well-lit photo of the affected plant part.",
                "Ensure the image shows leaves, fruit, or stems up close.",
                "Consult a local agricultural extension officer for in-person diagnosis."
            ]
        }

    # Step 3: Validate and sanitize the response
    required_fields = ["cropName", "issueName", "confidence", "severity", "description", "treatments"]
    for field in required_fields:
        if field not in diagnosis:
            sys.stderr.write(f"Missing field '{field}' in Gemini response, adding default.\n")
            if field == "cropName":
                diagnosis[field] = "Unknown"
            elif field == "issueName":
                diagnosis[field] = "Unidentified Condition"
            elif field == "confidence":
                diagnosis[field] = 0.75
            elif field == "severity":
                diagnosis[field] = "Moderate"
            elif field == "description":
                diagnosis[field] = "The AI detected a condition but could not provide a full description."
            elif field == "treatments":
                diagnosis[field] = [
                    "Consult with a local agricultural extension office.",
                    "Take multiple photos from different angles for better analysis.",
                    "Monitor the plant for changes over the next few days."
                ]

    # Ensure confidence is a float between 0 and 1
    try:
        confidence = float(diagnosis["confidence"])
        if confidence > 1:
            confidence = confidence / 100.0
        diagnosis["confidence"] = round(min(max(confidence, 0.0), 1.0), 2)
    except (ValueError, TypeError):
        diagnosis["confidence"] = 0.75

    # Ensure treatments is a list
    if isinstance(diagnosis["treatments"], str):
        diagnosis["treatments"] = [diagnosis["treatments"]]
    elif not isinstance(diagnosis["treatments"], list):
        diagnosis["treatments"] = ["Consult with a local agricultural expert."]

    # Ensure severity is valid
    valid_severities = ["None", "Low", "Moderate", "High"]
    if diagnosis["severity"] not in valid_severities:
        diagnosis["severity"] = "Moderate"

    sys.stderr.write(
        f"Gemini diagnosis: Crop='{diagnosis['cropName']}', "
        f"Issue='{diagnosis['issueName']}', "
        f"Confidence={diagnosis['confidence']}, "
        f"Severity='{diagnosis['severity']}'\n"
    )

    return {
        "cropName": str(diagnosis["cropName"]),
        "issueName": str(diagnosis["issueName"]),
        "confidence": diagnosis["confidence"],
        "severity": str(diagnosis["severity"]),
        "description": str(diagnosis["description"]),
        "treatments": [str(t) for t in diagnosis["treatments"]]
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided."}))
        sys.exit(1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(json.dumps({"error": f"Image file not found: {image_path}"}))
        sys.exit(1)

    try:
        result = predict_disease(image_path)
        print(json.dumps(result))
    except Exception as e:
        sys.stderr.write(f"Prediction execution failed: {str(e)}\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
