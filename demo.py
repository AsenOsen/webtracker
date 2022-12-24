from playwright.sync_api import sync_playwright
import time
import json

from flask import Flask, render_template, jsonify

class Fetcher:

	def __init__(self):
		self.xpathjs = open("xpath.js").read()
		self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
		self.waiting = 10
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
		    page.set_default_navigation_timeout(self.waiting*1000)
		    page.set_default_timeout(self.waiting*1000)
		    page.on("console", lambda msg: print(f"Playwright console: {msg.type}: {msg.text} {msg.args}"))
		    page.goto(url, wait_until='commit')
		    page.set_viewport_size({"width": 1280, "height": 1024})
		    # some sites need a lot of time to warm up
		    time.sleep(self.waiting)
		    # without it page sometimes only partially loaded
		    page.set_viewport_size({"width": 1280, "height": 1024})
		    screenshot = page.screenshot(full_page=True)
		    xpath = page.evaluate("async () => {" + self.xpathjs + "}")
		    context.close()
		    browser.close()

		return [screenshot, xpath]

	def scrap(self, url):
		try:
			return self._load(url)
		except:
			time.sleep(1)
			print("second try")
			return self._load(url)

screenshot, xpath = Fetcher().scrap("https://www.noon.com/uae-en/boox-note-air-2-plus-with-free-magneitc-case-cover/Z5FB24233B963637637F1Z/p/?o=z5fb24233b963637637f1z-1")
open("static/xpath.log","w").write(json.dumps(xpath, indent=4))
open("static/screenshot.png","wb").write(screenshot)

app = Flask(__name__)
@app.route('/')
def view():
	return render_template("canvas.html", screenshot_url="/static/screenshot.png")
@app.route('/xpath')
def xpath():
	return jsonify(json.loads(open('static/xpath.log').read()))
app.run(port=8080)