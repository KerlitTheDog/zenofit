#!/usr/bin/env python3
"""The roster: one account, the same profile list on every device.

Everything in smoke_sync.py is about what is INSIDE a profile. This is about
the list those profiles sit in, which for a long time was not account data at
all: a name lived on the phone that typed it, the order lived on the phone it
was dragged on, and whether a profile existed on a device was a decision each
device made for itself. Signing in on a laptop gave you the right training
under the wrong names, in a different order, with some of it missing.

The cases worth holding are the ones that lose or flap:
a rename racing another device, an order that has to survive profiles created
before positions existed, and a listing that has to say enough for a second
device to rebuild the whole list from it.
"""
import os
import json, urllib.request, urllib.error, sys

# Override to run against a local `wrangler dev`:
#   ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_roster.py
API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
PASS, FAIL = [], []

def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")
    if token: req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: parsed = json.loads(raw) if raw else {}
        except Exception: parsed = {"raw": raw}
        return e.code, parsed

def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else "   <- " + str(detail)))

def device(label):
    s, b = call("POST", "/v1/devices", body={"displayName": label})
    assert s == 201, (s, b)
    return b["token"], b["userId"]

names = lambda listing: [p["name"] for p in listing["profiles"]]
ids = lambda listing: [p["profileId"] for p in listing["profiles"]]

print("\n== setup ==")
owner, owner_id = device("roster owner")

s, a = call("POST", "/v1/profiles", token=owner, body={"name": "Main", "position": 0, "nameUpdatedAt": 1000})
check("a profile is created with a position and a name stamp",
      s == 201 and a.get("position") == 0 and a.get("nameUpdatedAt") == 1000, (s, a))
s, b = call("POST", "/v1/profiles", token=owner, body={"name": "Second", "position": 1, "nameUpdatedAt": 1000})
s, c = call("POST", "/v1/profiles", token=owner, body={"name": "Third"})
check("one created without either still gets a stamp", isinstance(c.get("nameUpdatedAt"), int), c)

print("\n== the listing is enough to rebuild a whole profile list from ==")
s, lst = call("GET", "/v1/profiles", token=owner)
check("it loads", s == 200 and len(lst.get("profiles", [])) == 3, (s, lst))
check("every row carries a name, a level, a position and a name stamp",
      all(set(("name", "level", "position", "nameUpdatedAt")) <= set(p) for p in lst["profiles"]), lst["profiles"])
check("and says which are yours", all(p["isOwner"] for p in lst["profiles"]), lst["profiles"])

print("\n== a rename is settled by WHEN it was typed, not by who spoke last ==")
s, r = call("PUT", "/v1/profiles/%s" % a["profileId"], token=owner,
            body={"name": "Renamed later", "nameUpdatedAt": 5000})
check("a newer rename lands", s == 200 and r.get("name") == "Renamed later" and not r.get("stale"), (s, r))

s, r = call("PUT", "/v1/profiles/%s" % a["profileId"], token=owner,
            body={"name": "Stale phone reconnecting", "nameUpdatedAt": 2000})
check("an older one is refused", s == 200 and r.get("stale") is True, (s, r))
check("and the reply is the name that won, so the client can take it",
      r.get("name") == "Renamed later" and r.get("nameUpdatedAt") == 5000, r)

s, lst = call("GET", "/v1/profiles", token=owner)
stored = next(p for p in lst["profiles"] if p["profileId"] == a["profileId"])
check("the stored name is the newer one", stored["name"] == "Renamed later", stored)

print("\n== the order belongs to the account ==")
want = [c["profileId"], b["profileId"], a["profileId"]]
s, o = call("POST", "/v1/profiles/order", token=owner, body={"order": want})
check("one call orders the whole list", s == 200 and o.get("ordered") == 3, (s, o))
s, lst = call("GET", "/v1/profiles", token=owner)
check("and the listing comes back in it", ids(lst) == want, names(lst))

s, o = call("POST", "/v1/profiles/order", token=owner, body={"order": "not a list"})
check("a non-list is refused", s == 400, (s, o))

print("\n== profiles that predate positions do not shuffle ==")
legacy, _ = device("legacy device")
s, l1 = call("POST", "/v1/profiles", token=legacy, body={"name": "Made first"})
s, l2 = call("POST", "/v1/profiles", token=legacy, body={"name": "Made second"})
s, lst = call("GET", "/v1/profiles", token=legacy)
check("with no positions at all they keep creation order",
      ids(lst) == [l1["profileId"], l2["profileId"]], names(lst))
call("POST", "/v1/profiles/order", token=legacy, body={"order": [l2["profileId"]]})
s, lst = call("GET", "/v1/profiles", token=legacy)
check("a positioned profile sorts ahead of an unpositioned one",
      ids(lst)[0] == l2["profileId"], [(p["name"], p["position"]) for p in lst["profiles"]])

print("\n== a shared profile is in the roster, and is not yours to rearrange ==")
her, her_id = device("shared with")
s, seed = call("POST", "/v1/profiles/%s/seeds" % a["profileId"], token=owner, body={"level": "read"})
call("POST", "/v1/join", token=her, body={"seed": seed["seed"]})
s, hers = call("GET", "/v1/profiles", token=her)
check("it appears in her listing", s == 200 and a["profileId"] in ids(hers), hers)
check("marked read, and not hers",
      all(p["level"] == "read" and not p["isOwner"] for p in hers["profiles"]), hers["profiles"])
s, _ = call("PUT", "/v1/profiles/%s" % a["profileId"], token=her,
            body={"name": "Hers now", "nameUpdatedAt": 99999})
check("she cannot rename it", s == 404, s)
s, o = call("POST", "/v1/profiles/order", token=her, body={"order": [a["profileId"]]})
check("and ordering skips what she cannot write rather than failing", s == 200 and o.get("ordered") == 0, (s, o))

print("\n== a deleted profile leaves the roster ==")
call("DELETE", "/v1/profiles/" + b["profileId"], token=owner)
s, lst = call("GET", "/v1/profiles", token=owner)
check("gone from the listing", b["profileId"] not in ids(lst), names(lst))

print("\n== position alone is a valid edit ==")
s, r = call("PUT", "/v1/profiles/%s" % a["profileId"], token=owner, body={"position": 9})
check("no name means the name is untouched", s == 200 and r.get("name") == "Renamed later", (s, r))

for pid in (a["profileId"], c["profileId"]):
    call("DELETE", "/v1/profiles/" + pid, token=owner)
for pid in (l1["profileId"], l2["profileId"]):
    call("DELETE", "/v1/profiles/" + pid, token=legacy)

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL: print("  - " + f)
sys.exit(1 if FAIL else 0)
