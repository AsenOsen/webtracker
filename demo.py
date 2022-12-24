from flask import Flask, render_template, jsonify, request
from playwright.sync_api import sync_playwright
import time
import json
import hashlib
import os

class Fetcher:

	def __init__(self, useragent):
		self.xpathjs = open("xpath.js").read()
		self.waiting = 3
		self.ua = useragent
		#self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
		#self.ua = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Mobile Safari/537.36"

	def _load(self, url):
		screenshot, xpath = None, None
		with sync_playwright() as p:
		    browser = p.chromium.connect_over_cdp("ws://localhost:3000")
		    context = browser.new_context(
		    	locale="en-US", 
		    	user_agent=self.ua,
		    	bypass_csp=True,
		    	service_workers='block',
		    	accept_downloads=False
		    	)
		    page = context.new_page()
		    page.set_default_navigation_timeout(self.waiting * 1000)
		    page.set_default_timeout(self.waiting * 1000)
		    page.on("console", lambda msg: print(f"Playwright console: {msg.type}: {msg.text} {msg.args}"))
		    page.goto(url, wait_until='commit')
		    #page.set_viewport_size({"width": 1280, "height": 1024})
		    # some sites need a lot of time to warm up
		    time.sleep(self.waiting)
		    # without it page sometimes only partially loaded
		    #page.set_viewport_size({"width": 1280, "height": 1024})
		    screenshot = page.screenshot(full_page=True)
		    xpath = page.evaluate("async () => {" + self.xpathjs + "}")
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

	def run(self, url):
		key = Fetcher.getKey(url)
		ts = time.time()
		screenshot, xpath = self._scrap(url)
		os.makedirs(f"static/data/{key}", exist_ok=True)
		open(f"static/data/{key}/xpath.{ts}.log","w").write(json.dumps(xpath))
		open(f"static/data/{key}/screenshot.{ts}.png","wb").write(screenshot)
		open(f"static/data/{key}/xpath.log","w").write(json.dumps(xpath))
		open(f"static/data/{key}/screenshot.png","wb").write(screenshot)

app = Flask(__name__)
@app.route('/')
def view():
	key = Fetcher.getKey(request.args.get('site')) if request.args.get('site') else ""
	return render_template("index.html", screenshot_url=f"/static/data/{key}/screenshot.png", key=key)
@app.route('/xpath')
def xpath():
	key = request.args.get('key') if request.args.get('key') else ""
	return jsonify(json.loads(open(f"static/data/{key}/xpath.log").read()))
@app.route('/fetch')
def fetch():
	fetcher = Fetcher(useragent=request.headers.get("User-Agent"))
	site = request.args.get('site') if request.args.get('site') else ""
	fetcher.run(site)
	return 'ok', 200
app.run(port=8080)