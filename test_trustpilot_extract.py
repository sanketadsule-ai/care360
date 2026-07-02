import os
import sys
import json
import time
from scrape_trustpilot_to_db import make_driver, extract_reviews

DOMAIN = "impactguru.com"
BASE = "https://www.trustpilot.com/review/{domain}?page=1"

driver = make_driver()
driver.get(BASE.format(domain=DOMAIN))
time.sleep(2)
reviews = extract_reviews(driver.page_source)

if reviews:
    print(json.dumps(reviews[0], indent=2))
else:
    print("No reviews found or could not extract.")

driver.quit()
