from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

options = Options()
options.add_argument('--headless')
options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

driver = webdriver.Chrome(options=options)
driver.get("http://localhost:8080")
time.sleep(2)

print("BROWSER LOGS:")
for log in driver.get_log('browser'):
    print(log)

driver.quit()
