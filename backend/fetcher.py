from playwright.sync_api import sync_playwright
from storage import Storage, Site
import datetime
import time
import urllib
import cookiejar


class Fetcher:

	FETCH_JOB_BUNCH_SIZE = 4
	SITE_FETCH_PERIOD_SEC = 3600
	PAGE_LOAD_TIMEOUT_SEC = 20
	BROWSER_TIMEOUT_SEC = 30

	def __init__(self):
		self.xpathjs = open("xpath.js").read()
		self.storage = Storage()
		self.cookies = cookiejar.Cookies()

	def defaultLocale(self):
		return 'en-US,en;q=0.9'

	def getCookies(self, url):
		domain = urllib.parse.urlparse(url).netloc
		return [{'domain': domain, 'path': '/', 'name': key, 'value': value} for key, value in self.cookies.get(domain).items()]

	def createPage(self, site, browser):
		context = browser.new_context(
	    	locale=(site.locale or self.defaultLocale()), 
	    	user_agent=site.useragent,
	    	bypass_csp=True,
	    	service_workers='block',
	    	accept_downloads=False,
	    	#is_mobile=True,
	    	#has_touch=True,
	    	extra_http_headers={
		    	'User-Agent': site.useragent,
		    	'Referer': site.url
		    },
	    	storage_state={
	    		'cookies':self.getCookies(site.url), 
	    		'origins': [{'origin':site.url, 'localStorage':[]}]
	    	},
	    	viewport={
	    		'width': 1280, 
	    		'height': 1024
	    	}
	    )
		page = context.new_page()
		page.set_default_navigation_timeout(self.BROWSER_TIMEOUT_SEC * 1000)
		page.set_default_timeout(self.BROWSER_TIMEOUT_SEC * 1000)
		#page.on("console", lambda msg: print(f"Playwright console: {msg.type}: {msg.text} {msg.args}"))
		return page, context	   

	def load(self, sites):
		with sync_playwright() as p:
		    browser = p.chromium.connect_over_cdp("ws://localhost:3000")
		    #browser = browser = p.chromium.launch()
		    pages = []
		    for site in sites:
		    	page, context = self.createPage(site, browser)
		    	page.goto(site.url, wait_until='commit')
		    	pages.append({'page':page, 'xpath':None, 'screenshot':None, 'start': time.time(), 'ready': False, 'url': site.url, 'ctx': context})
		    processing = True
		    while processing:
		    	time.sleep(1);
		    	processing = False
		    	for page in pages:
		    		if page['ready']:
		    			print("Ready | " + page['url'])
		    			continue
		    		print("Loading | " + page['url'])
		    		processing = True
		    		new_xpath = page['page'].evaluate("async () => {" + self.xpathjs + "}")
		    		# too long, probably page with dynamic content
		    		if time.time() - page['start'] > self.PAGE_LOAD_TIMEOUT_SEC:
		    			page['xpath'] = new_xpath
		    			page['screenshot'] = page['page'].screenshot(full_page=True, type='jpeg', quality=50)
		    			self.onResult(page)
		    			continue
			    	# page most probably is loaded if no changes in xpath detected since last check
			    	if page['xpath'] and new_xpath['fingerprint'] == page['xpath']['fingerprint']:    		
			    		# only if page loaded, make screenshot
			    		page['screenshot'] = page['page'].screenshot(full_page=True, type='jpeg', quality=50)
			    		# and verify that xpath stays unchanged after screenshot
			    		if page['page'].evaluate("async () => {" + self.xpathjs + "}")['fingerprint'] == page['xpath']['fingerprint']:
				    		self.onResult(page)
				    	else:
				    		page['xpath'] = None
		    		page['xpath'] = new_xpath
		    browser.close()

	def onResult(self, page):
		page['ready'] = True
		del page['xpath']['fingerprint']
		self.storage.saveSnapshot(page['url'], page['xpath'], page['screenshot'], round(time.time()-page['start'], 2))
		page['ctx'].close()

	def getNextBunch(self):
		sites = self.storage.getSites()
		priority = []
		now = int(datetime.datetime.utcnow().timestamp())
		for site in sites:
			# TODO: priority levels: [least recent added sites by users] (can eat all CPU time?), [latest updated sites] ... 
			if (site.latestSnapshot is None) or (now-site.latestSnapshot > self.SITE_FETCH_PERIOD_SEC):
				priority.append(site)
			if len(priority) == self.FETCH_JOB_BUNCH_SIZE:
				break
		return priority

	def fetch(self):
		nextSites = self.getNextBunch()
		if len(nextSites) == 0:
			return False
		else:
			self.load(nextSites)	
			return True


if __name__ == "__main__":
	fetcher = Fetcher()
	while True:
		try:
			start = time.time()
			if fetcher.fetch():
				print(f"Bunch job finished. Total time = {time.time() - start}")
			else:
				print("No job found")
				time.sleep(1)
		except Exception as e:
			print(f"Error | {e}")