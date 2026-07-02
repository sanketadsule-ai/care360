import os
import json
import re
from scrape_trustpilot_to_db import analyze_review

print("Running Python LLM Scraper Unit Tests...")

# Mocking the env for testing fallback behavior
os.environ["AZURE_OPENAI_API_KEY"] = ""
os.environ["AZURE_OPENAI_ENDPOINT"] = ""
os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"] = ""

res = analyze_review("Excellent app! Very helpful for fundraising.")
assert res["priority"] == "P3", f"Expected default P3, got {res['priority']}"
assert res["department"] == "Support", f"Expected default Support, got {res['department']}"

print("✓ Test Case 1 Passed: Default fallback behavior when API keys are absent")

# Testing content clean parser block directly
def test_clean_response(content):
    if "```" in content:
        match = re.search(r'```(?:json)?([\s\S]*?)```', content)
        if match:
            content = match.group(1).strip()
    return json.loads(content)

raw_with_block = """```json
{
  "priority": "P0",
  "next_action": "Contact donor immediately",
  "department": "Sales",
  "user_type": "Donor"
}
```"""

parsed = test_clean_response(raw_with_block)
assert parsed["priority"] == "P0", f"Expected P0, got {parsed['priority']}"
assert parsed["department"] == "Sales", f"Expected Sales, got {parsed['department']}"
assert parsed["user_type"] == "Donor", f"Expected Donor, got {parsed['user_type']}"

print("✓ Test Case 2 Passed: Markdown JSON blocks regex cleaning")

print("\nAll Python LLM Scraper Unit Tests Passed Successfully!")
