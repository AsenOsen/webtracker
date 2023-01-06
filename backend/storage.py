import json
import hashlib
import datetime
import os
from pymongo import MongoClient


class Site:

	def __init__(self, record):
		self.key = record['key']
		self.url = record['url']
		self.locale = record['lc']
		self.useragent = record['ua']
		self.latestSnapshot = record['last']


class Storage:

	def __init__(self):
		self.mongo = MongoClient('localhost', 27017, username='root', password='example')
		self.db = self.mongo.sites.default
		self.db.create_index('key', unique=True)
		#self.db.update_many({}, {'$set': {'history': []}})

	def addSite(self, url, useragent, locale):
		self.db.insert_one({
			'key': self.getKey(url), 
			"url": url,
			'lc': locale,
			"ua": useragent,
			'last': None
			})

	def updateLastTime(self, key, ts:int):
		self.db.update_one({'key': key}, {
			'$set': {'last': ts},
			'$push': {'history': ts}
			})

	def deleteSite(self, key):
		self.db.delete_one({'key': key})

	def getSites(self):
		return [Site(site) for site in self.db.find({})]

	def getKey(self, url):
		return hashlib.md5(url.encode('utf-8')).hexdigest()

	def saveSnapshot(self, url, xpath, screenshot):
		key = self.getKey(url)
		ts = int(datetime.datetime.utcnow().timestamp())
		os.makedirs(f"static/snapshots/{key}", exist_ok=True)
		# TODO: remove indent before release
		open(f"static/snapshots/{key}/xpath.{ts}.json","w").write(json.dumps(xpath, indent=4))
		open(f"static/snapshots/{key}/screenshot.{ts}.jpg","wb").write(screenshot)
		self.updateLastTime(key, ts)

	def latestSnapshot(self, key):
		latestTs = self.db.find_one({'key': key})['last']
		if latestTs:
			xpath = json.loads(open(f"static/snapshots/{key}/xpath.{latestTs}.json").read())
			screenshot = f"/static/snapshots/{key}/screenshot.{latestTs}.jpg"
			return [xpath, screenshot]
		return [None, None]

	def getXpathHistory(self, key, xpath):
		history = self.db.find_one({'key': key})['history']
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