from flask import Flask, jsonify, request
from storage import Storage, Site

app = Flask(__name__)
storage = Storage()

@app.route('/urls')
def urls():
	sites = {site.key:site.url for site in storage.getSites()}
	return jsonify(sites)

@app.route('/snapshot/<key>', methods = ["GET"])
def snapshot(key):
	offset = int(request.args.get('offset'))
	xpath, screen, ts = storage.getSnapshot(key, offset)
	return jsonify({'xpath':xpath, 'img':screen, 'ts': ts})

@app.route('/history')
def history():
	key = request.args.get('key') if request.args.get('key') else ""
	xpath = request.args.get('xpath') if request.args.get('xpath') else ""
	history = storage.getXpathHistory(key, xpath)
	return jsonify(history)

@app.route('/add', methods = ["POST"])
def add():
	useragent = request.headers.get("User-Agent")
	locale = request.headers.get("Accept-Language")
	url = request.json.get('url').strip()
	try:
		storage.addSite(url, useragent, locale)
		return 'ok', 200
	except:
		return 'already exist', 200

@app.route('/del/<key>')
def delete(key):
	storage.deleteSite(key)
	return 'ok, deleted', 200

app.run(host="0.0.0.0", port=8080)