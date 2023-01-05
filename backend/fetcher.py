from playwright.sync_api import sync_playwright
from storage import Storage
import datetime
import time
import math


JOB_BUNCH_SIZE = 4
PERIOD_SEC = 150

class Fetcher:

	def __init__(self):
		self.xpathjs = open("xpath.js").read()
		self.timeoutSec = 50
		self.pages = []
		self.browser = None
		self.storage = Storage()
		#self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
		#self.ua = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Mobile Safari/537.36"

	def createPage(self, site):
		context = self.browser.new_context(
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

	def addJob(self):
		if len(self.pages) == JOB_BUNCH_SIZE:
			return
		sites = self.storage.getSites()
		now = int(datetime.datetime.utcnow().timestamp())
		alreadyProcessingSites = {page['key']:1 for page in self.pages}
		for key in sites:
			noSnapshot = sites[key]['last'] is None
			alreadyProcessing = key in alreadyProcessingSites
			isIsTime = (now - sites[key]['last'] > PERIOD_SEC)
			# TODO: priority levels: [least recent added sites by users] (can eat all CPU time?), [latest updated sites] ... 
			if not alreadyProcessing and (noSnapshot or isIsTime):
				url = sites[key]['url']
				page, context = self.createPage(sites[key])
				self.pages.append({'key':key, 'page':page, 'xpath':None, 'screenshot':None, 'start': time.time(), 'ready': False, 'url': url, 'ctx': context, 'goto': False})
				print("Job taken | " + url)
			if len(self.pages) == JOB_BUNCH_SIZE:
				break   

	def onResult(self, page):
		page['ready'] = True
		del page['xpath']['fingerprint']
		print(f"Ready | {page['url']}, took = {time.time()-page['start']}")
		self.storage.saveSnapshot(page['url'], page['xpath'], page['screenshot'])

	def fetch(self):
		while True:
			try:
				# connection can close spontaneously
				self._fetch()
				break
			except:
				print("[Error] | connection closed.");
				self.pages = []

	def _fetch(self):
		with sync_playwright() as p:
		    self.browser = p.chromium.connect_over_cdp("ws://localhost:3000")
		    atLeastOneLeft = True
		    while atLeastOneLeft:
		    	# clean ready pages and add new jobs
		    	newPages = []
		    	for page in self.pages:
		    		if not page['ready']:
		    			newPages.append(page)
		    		else:
		    			page['ctx'].close()
		    			page['page'].close()
		    			del page['ctx'], page['page']
		    	self.pages = newPages
		    	self.addJob()
		    	#
		    	time.sleep(1);
		    	#
		    	atLeastOneLeft = False
		    	for page in self.pages:
		    		print("Loading | " + page['url'])
		    		atLeastOneLeft = True

		    		if not page['goto']:
		    			page['page'].goto(page['url'], wait_until='commit')
		    			page['goto'] = True
		    			# no point to execute JS right away, so wait next iteration
		    			continue

		    		new_xpath = page['page'].evaluate("async () => {" + self.xpathjs + "}")
		    		# too long, probably page with dynamic content
		    		if time.time() - page['start'] > self.timeoutSec:
		    			page['xpath'] = new_xpath
		    			page['screenshot'] = page['page'].screenshot(full_page=True, type='jpeg', quality=50)
		    			self.onResult(page)
			    	# paged is loaded if no changes in xpath detected since last check
			    	if page['xpath'] and new_xpath['fingerprint'] == page['xpath']['fingerprint']:    		
			    		# only if page loaded, make screenshot
			    		page['screenshot'] = page['page'].screenshot(full_page=True, type='jpeg', quality=50)
			    		# and verify that xpath stays unchanged after screenshot
			    		if page['page'].evaluate("async () => {" + self.xpathjs + "}")['fingerprint'] == page['xpath']['fingerprint']:
				    		self.onResult(page)
				    	else:
				    		page['xpath'] = None
		    		page['xpath'] = new_xpath
		    self.browser.close()

if __name__ == "__main__":
	while True:
		start = time.time()
		Fetcher().fetch()
		print(f"Finished. Total time = {time.time() - start}\n")
		time.sleep(10)