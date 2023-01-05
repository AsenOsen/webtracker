from playwright.sync_api import sync_playwright
from storage import Storage
import datetime
import time
import math


JOB_BUNCH_SIZE = 4
PERIOD_SEC = 300
storage = Storage()

class Fetcher:

	def __init__(self, sites):
		self.xpathjs = open("xpath.js").read()
		self.timeoutSec = 50
		self.sites = sites
		#self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
		#self.ua = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Mobile Safari/537.36"

	def createPage(self, site, browser):
		context = browser.new_context(
	    	locale=site['lc'], 
	    	user_agent=site['ua'],
	    	bypass_csp=True,
	    	service_workers='block',
	    	accept_downloads=False
	    )
		page = context.new_page()
		page.set_default_navigation_timeout(30 * 1000)
		page.set_default_timeout(30 * 1000)
		#page.on("console", lambda msg: print(f"Playwright console: {msg.type}: {msg.text} {msg.args}"))
		return page, context	    

	def load(self):
		results = []
		with sync_playwright() as p:
		    browser = p.chromium.connect_over_cdp("ws://localhost:3000")
		    pages = []
		    for key in self.sites:
		    	url = self.sites[key]['url']
		    	page, context = self.createPage(self.sites[key], browser)
		    	page.goto(url, wait_until='commit')
		    	pages.append({'page':page, 'xpath':None, 'screenshot':None, 'start': time.time(), 'ready': False, 'url': url, 'ctx': context})

		    atLeastOneLeft = True
		    while atLeastOneLeft:
		    	time.sleep(1);
		    	atLeastOneLeft = False
		    	for page in pages:
		    		if page['ready']:
		    			print("Ready | " + page['url'])
		    			continue
		    		print("Loading | " + page['url'])
		    		atLeastOneLeft = True
		    		new_xpath = page['page'].evaluate("async () => {" + self.xpathjs + "}")
		    		# too long, probably page with dynamic content
		    		if time.time() - page['start'] > self.timeoutSec:
		    			page['xpath'] = new_xpath
		    			page['screenshot'] = page['page'].screenshot(full_page=True, type='jpeg', quality=50)
		    			del page['xpath']['fingerprint']
		    			page['ready'] = True
		    			results.append({'url': page['url'], 'xpath': page['xpath'], 'screenshot':page['screenshot']})
			    	# paged is loaded if no changes in xpath detected since last check
			    	if page['xpath'] and new_xpath['fingerprint'] == page['xpath']['fingerprint']:    		
			    		# only if page loaded, make screenshot
			    		page['screenshot'] = page['page'].screenshot(full_page=True, type='jpeg', quality=50)
			    		# and verify that xpath stays unchanged after screenshot
			    		if page['page'].evaluate("async () => {" + self.xpathjs + "}")['fingerprint'] == page['xpath']['fingerprint']:
				    		page['ready'] = True
				    		del page['xpath']['fingerprint']
				    		results.append({'url': page['url'], 'xpath': page['xpath'], 'screenshot':page['screenshot']})
				    	else:
				    		page['xpath'] = None
		    		page['xpath'] = new_xpath
		    for page in pages:
		    	page['ctx'].close()
		    browser.close()
		return results

	def fetch(self):
		global storage
		results = self.load()
		for result in results:
			storage.saveSnapshot(result['url'], result['xpath'], result['screenshot'])


def readJobQueue():
	sites = storage.getSites()
	priority = {}
	size = 0
	now = int(datetime.datetime.utcnow().timestamp())
	for key in sites:
		# TODO: priority levels: [least recent added sites by users] (can eat all CPU time?), [latest updated sites] ... 
		if 'last' not in sites[key] or (now-sites[key]['last'] > PERIOD_SEC):
			priority[key] = sites[key]
			size += 1
		if size == JOB_BUNCH_SIZE:
			break
	return priority

if __name__ == "__main__":
	while True:
		start = time.time()
		sites = readJobQueue()
		jobSize = len(sites.keys())
		if jobSize == 0:
			print("No job found")
			time.sleep(10)
		else:
			print(f"Job found: {jobSize}")
			Fetcher(sites).fetch()
			print(f"Finished. Total time = {time.time() - start}\n")