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

	def set(self, domain, cookies):
		if domain.startswith("www."):
			domain = domain.replace("www.", "")
		changed = False
		for cookieName in self.cookiesByDomains[domain]:
			# update only known cookies
			if cookieName in cookies and self.cookiesByDomains[domain][cookieName] != cookies[cookieName]:
				self.cookiesByDomains[domain][cookieName] = cookies[cookieName]
				changed = True
		if changed:
			open("cookies.json", "w").write(json.dumps(self.cookiesByDomains, indent=4))