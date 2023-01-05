from flask import Flask, jsonify, request
from storage import Storage


app = Flask(__name__)
storage = Storage()

@app.route('/urls')
def urls():
	return jsonify(storage.getSites())

@app.route('/latest/<key>')
def latest(key):
	xpath, screen = storage.latestSnapshot(key)
	return jsonify({'xpath':xpath, 'img':screen})

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
	url = (request.form.get('url') if request.form.get('url') else "").strip()
	storage.addSite(url, useragent, locale)
	return 'ok', 200

@app.route('/del/<key>')
def delete(key):
	storage.deleteSite(key)
	return 'ok, deleted', 200

app.run(host="0.0.0.0", port=8080)