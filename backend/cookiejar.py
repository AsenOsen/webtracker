import json

class Cookies:

	def __init__(self):
		self.cookiesByDomains = json.loads(open("cookies.json").read())

	def get(self, domain):
		if domain.startswith("www."):
			domain = domain.replace("www.", "")
		if domain in self.cookiesByDomains:
			return self.cookiesByDomains[domain] 
		if f"www.{domain}" in self.cookiesByDomains:
			return self.cookiesByDomains[f"www.{domain}"] 
		return {}