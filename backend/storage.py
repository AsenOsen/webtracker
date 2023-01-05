import json
import hashlib
import datetime
import os


class Storage:

	def __init__(self):
		try:
			self.db = json.loads(open('static/sites.json', 'r').read())
		except:
			self.db = {}

	def flushSites(self):
		# TODO: remove indent before release
		open('static/sites.json', 'w').write(json.dumps(self.db, indent=4))

	def addSite(self, url, useragent, locale):
		key = self.getKey(url)
		self.db[key] = {
			"url": url,
			'lc': locale,
			"ua": useragent,
			'last': None
		}
		self.flushSites()

	def updateLastTime(self, key, ts):
		self.db[key]['last'] = int(ts)
		self.flushSites()

	def deleteSite(self, key):
		del self.db[key]
		self.flushSites()

	def getSites(self):
		return self.db

	def getKey(self, url):
		return hashlib.md5(url.encode('utf-8')).hexdigest()

	def saveSnapshot(self, url, xpath, screenshot):
		key = self.getKey(url)
		ts = int(datetime.datetime.utcnow().timestamp())
		os.makedirs(f"static/snapshots/{key}", exist_ok=True)
		# TODO: remove indent before release
		open(f"static/snapshots/{key}/xpath.{ts}.json","w").write(json.dumps(xpath, indent=4))
		open(f"static/snapshots/{key}/screenshot.{ts}.jpg","wb").write(screenshot)
		open(f"static/snapshots/{key}/history.inf","a").write(str(ts)+"\n")
		open(f"static/snapshots/{key}/latest.inf","w").write(str(ts))
		self.updateLastTime(key, ts)

	def latestSnapshot(self, key):
		latestTs = open(f"static/snapshots/{key}/latest.inf").read()
		xpath = json.loads(open(f"static/snapshots/{key}/xpath.{latestTs}.json").read())
		screenshot = f"/static/snapshots/{key}/screenshot.{latestTs}.jpg"
		return [xpath, screenshot]

	def getXpathHistory(self, key, xpath):
		history = open(f"static/snapshots/{key}/history.inf").read().split("\n")
		xpathHistory = {}
		for point in history:
			if not point:
				break
			xpathData = json.loads(open(f"static/snapshots/{key}/xpath.{point}.json").read())
			if xpath in xpathData['xpath']:
				xpathHistory[point] = xpathData['xpath'][xpath]['text']
			else:
				xpathHistory[point] = None
		return xpathHistory