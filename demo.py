from flask import Flask, render_template, jsonify, request
from playwright.sync_api import sync_playwright
import datetime
import time
import json
import hashlib
import os

class Storage:

	def __init__(self):
		try:
			self.db = json.loads(open('static/sites.json', 'r').read())
		except:
			self.db = {}

	def flush(self):
		open('static/sites.json', 'w').write(json.dumps(self.db))

	def add(self, url, useragent, locale, key):
		self.db[key] = {
			"url": url,
			'lc': locale,
			"ua": useragent
		}
		self.flush()

	def delete(self, key):
		del self.db[key]
		self.flush()

	def get(self):
		return self.db


class Snapshot:

	def __init__(self):
		pass

	def save(self, key, xpath, screenshot):
		ts = int(datetime.datetime.utcnow().timestamp())
		os.makedirs(f"static/snapshots/{key}", exist_ok=True)
		open(f"static/snapshots/{key}/xpath.{ts}.json","w").write(json.dumps(xpath))
		open(f"static/snapshots/{key}/screenshot.{ts}.jpg","wb").write(screenshot)
		open(f"static/snapshots/{key}/xpath.json","w").write(json.dumps(xpath))
		open(f"static/snapshots/{key}/screenshot.jpg","wb").write(screenshot)
		open(f"static/snapshots/{key}/points.inf","a").write(str(ts)+"\n")

	def getXpathHistory(self, key, xpath):
		points = open(f"static/snapshots/{key}/points.inf").read().split("\n")
		xpathHistory = {}
		for point in points:
			if not point:
				break
			xpathData = json.loads(open(f"static/snapshots/{key}/xpath.{point}.json").read())
			if xpath in xpathData['xpath']:
				xpathHistory[point] = xpathData['xpath'][xpath]['text']
			else:
				xpathHistory[point] = None
		return xpathHistory


class Fetcher:

	def __init__(self, useragent, locale):
		self.xpathjs = open("xpath.js").read()
		self.timeoutSec = 20
		self.ua = useragent
		self.locale = locale
		#self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
		#self.ua = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Mobile Safari/537.36"

	def _load(self, url):
		screenshot, xpath = None, None
		with sync_playwright() as p:
		    browser = p.chromium.connect_over_cdp("ws://localhost:3000")
		    context = browser.new_context(
		    	locale=self.locale, 
		    	user_agent=self.ua,
		    	bypass_csp=True,
		    	service_workers='block',
		    	accept_downloads=False
		    	)
		    page = context.new_page()
		    page.set_default_navigation_timeout(30 * 1000)
		    page.set_default_timeout(30 * 1000)
		    page.on("console", lambda msg: print(f"Playwright console: {msg.type}: {msg.text} {msg.args}"))
		    page.goto(url, wait_until='commit')
		    #page.set_viewport_size({"width": 1280, "height": 1024})		
		    # wait while xpath data will stay unchanged between 2 runs
		    xpath, screenshot = None, None
		    start = time.time()
		    while True:
		    	time.sleep(1);
		    	new_xpath = page.evaluate("async () => {" + self.xpathjs + "}")
		    	# too long, probably page with dynamic content
		    	if time.time() - start > self.timeoutSec:
		    		xpath = new_xpath
		    		screenshot = page.screenshot(full_page=True, type='jpeg', quality=50)
		    		break
		    	# paged is loaded if no changes in xpath detected since last check
		    	if xpath and new_xpath['fingerprint'] == xpath['fingerprint']:    		
		    		# only if page loaded, make screenshot
		    		screenshot = page.screenshot(full_page=True, type='jpeg', quality=50)
		    		# and verify that xpath stays unchanged after screenshot
		    		if page.evaluate("async () => {" + self.xpathjs + "}")['fingerprint'] == xpath['fingerprint']:
			    		break
			    	else:
			    		xpath = None
		    	xpath = new_xpath
		    del xpath['fingerprint']
		    context.close()
		    browser.close()
		return [screenshot, xpath]

	def _scrap(self, url):
		try:
			return self._load(url)
		except:
			return self._load(url)

	def getKey(url):
		return hashlib.md5(url.encode('utf-8')).hexdigest()

	def fetch(self, url):
		key = Fetcher.getKey(url)
		screenshot, xpath = self._scrap(url)
		Snapshot().save(key, xpath, screenshot)
		

app = Flask(__name__)
storage = Storage()

@app.route('/')
def index():
	return render_template("index.html", db=storage.get())
@app.route('/view')
def view():
	key = request.args.get('key') if request.args.get('key') else ""
	return render_template("canvas.html", screenshot_url=f"/static/snapshots/{key}/screenshot.jpg", key=key)
@app.route('/xpath')
def xpath():
	key = request.args.get('key') if request.args.get('key') else ""
	return jsonify(json.loads(open(f"static/snapshots/{key}/xpath.json").read()))
@app.route('/history')
def history():
	key = request.args.get('key') if request.args.get('key') else ""
	xpath = request.args.get('xpath') if request.args.get('xpath') else ""
	history = Snapshot().getXpathHistory(key, xpath)
	return jsonify(history)
@app.route('/add')
def add():
	useragent = request.headers.get("User-Agent")
	locale = request.headers.get("Accept-Language")
	url = (request.args.get('url') if request.args.get('url') else "").strip()
	key = Fetcher.getKey(url)
	storage.add(url, useragent, locale, key)
	return 'ok', 200
@app.route('/del')
def delete():
	key = request.args.get('key') if request.args.get('key') else ""
	storage.delete(key)
	return 'ok', 200
@app.route('/snapshot')
def snapshot():
	key = request.args.get('key') if request.args.get('key') else ""
	info = storage.get()[key]
	start = time.time()
	Fetcher(info['ua'], info['lc']).fetch(info['url'])
	return f"ok, took {time.time()-start} sec", 200
app.run(host="0.0.0.0", port=8080)

