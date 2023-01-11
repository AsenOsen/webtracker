# ToDo

- keep cookies for popular web sites
	- update cookie after page load
- timer-based scrapping (30m, 1h, 5h, 24h)
- look at history snapshots (left, right scroller)
- spread fetching by domain name frequency 
	- use proxy if too fast even after spreading
	- use domain db with `domain` and `last_fetch` fields
- shrink snapshot data
	- if the same xpath detected in last 5 snapshots, make link instead of file
	- do not send repeated data to client (pass same points)
- remove repeated texts in element selection
- check entire page changes button
- fetcher sleep dependant from bunch size (should be more if 1-2 sites)
- UTC to local time on graph
- onmouseout from canvas, clear canvas

# UI

- back click in graph view -> close graph (via router)
- text of selected element in toast
- show only what added\deleted in changes
- changes sort order desc

# Bugs

# Promo

- producthunt
- zenlink
- facebook
- google search query "site tracker"

# Use cases

- spy on people's social pages (LinkedIn, Facebook, Instagram, Tiktok)
- spy on people's activity in internet (forums, resumes, blogs)
- monitor people`s actions in internet
- track prices and rating changes in any marketplace (Amazon, Alibaba, Noon and many more)
- track new sections and items on web sites (GitHub, new StackOverflow sites)
- track trends changes in web
- track competitor actions in their web sites (other sellers on marketplaces, landing pages)
- track information changes on web sites
- monitor documentation changes (API, law)