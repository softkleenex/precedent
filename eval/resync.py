"""Force re-extraction of every decision page through the dev web trigger, then dump decisions."""
import json, os, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
URL = open(os.path.expanduser('~/.config/precedent/eval_url')).read().strip()
TOKEN = open(os.path.expanduser('~/.config/precedent/eval_token')).read().strip()
def call(body):
    req = urllib.request.Request(URL, data=json.dumps({**body, 'token': TOKEN}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)
for p in call({'op': 'pages'})['pages']:
    print(call({'op': 'syncPage', 'pageId': p['id']}))
keep = ['id','title','decision','alternativesRejected','rationale','exceptions','revisitWhen','status','date','quote','keywords','pageTitle']
d = call({'op': 'decisions'})['decisions']
json.dump([{k: x.get(k) for k in keep} for x in d], open(f'{HERE}/real_decisions.json', 'w'), indent=1)
for x in d: print(x['id'], '|', x['title'], '| exc:', x.get('exceptions'), '| revisit:', x.get('revisitWhen'))
