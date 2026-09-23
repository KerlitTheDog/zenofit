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
import json, urllib.request, urllib.error, sys, hashlib, uuid

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


def derive(username, password):
    """The client half of the password work, as zenofit-cloud.js does it."""
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), ("zenofit:" + username.lower()).encode(), 210000, 32
    ).hex()


def account(label):
    """A registered account, which is the only thing that HAS a username."""
    name = (label + uuid.uuid4().hex[:8])[:24]
    s, b = call("POST", "/v1/auth/register", body={"username": name, "key": derive(name, "correct horse battery")})
    assert s == 201, (s, b)
    return {"token": b["token"], "id": b["userId"], "name": b["username"]}

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
owner_before = [(p["profileId"], p["position"]) for p in call("GET", "/v1/profiles", token=owner)[1]["profiles"]]
s, o = call("POST", "/v1/profiles/order", token=her, body={"order": [a["profileId"]]})
check("ordering it places it in HER list", s == 200 and o.get("ordered") == 1, (s, o))
s, hers = call("GET", "/v1/profiles", token=her)
check("where it now has her own position",
      [p["position"] for p in hers["profiles"] if p["profileId"] == a["profileId"]] == [0], hers["profiles"])
owner_after = [(p["profileId"], p["position"]) for p in call("GET", "/v1/profiles", token=owner)[1]["profiles"]]
check("and the owner's own order has not moved", owner_after == owner_before, (owner_before, owner_after))

print("\n== somebody who can EDIT a shared profile still cannot reorder the owner's list ==")
# The bug this pins: a write grantee dragging two of THEIR OWN profiles pushed
# their whole order, and the shared profile's index was written into
# profiles.position, which is the owner's. The owner's list reshuffled.
ed, _ = device("can edit")
s, wseed = call("POST", "/v1/profiles/%s/seeds" % a["profileId"], token=owner, body={"level": "write"})
call("POST", "/v1/join", token=ed, body={"seed": wseed["seed"]})
s, e1 = call("POST", "/v1/profiles", token=ed, body={"name": "Editor own 1"})
s, e2 = call("POST", "/v1/profiles", token=ed, body={"name": "Editor own 2"})
owner_before = [(p["profileId"], p["position"]) for p in call("GET", "/v1/profiles", token=owner)[1]["profiles"]]
s, o = call("POST", "/v1/profiles/order", token=ed, body={"order": [e2["profileId"], e1["profileId"], a["profileId"]]})
check("the editor's whole list is ordered", s == 200 and o.get("ordered") == 3, (s, o))
owner_after = [(p["profileId"], p["position"]) for p in call("GET", "/v1/profiles", token=owner)[1]["profiles"]]
check("and the OWNER's positions are exactly as they were", owner_after == owner_before, (owner_before, owner_after))
s, eds = call("GET", "/v1/profiles", token=ed)
check("while the editor's own listing carries the editor's order",
      [p["position"] for p in eds["profiles"] if p["profileId"] == a["profileId"]] == [2], eds["profiles"])
s, _ = call("PUT", "/v1/profiles/%s" % a["profileId"], token=ed, body={"position": 7})
owner_after = [(p["profileId"], p["position"]) for p in call("GET", "/v1/profiles", token=owner)[1]["profiles"]]
check("a position sent with PUT by the editor does not reach the owner either", owner_after == owner_before, owner_after)

print("\n== the same create, sent twice, is one profile ==")
# A create whose reply is lost on gym wifi is retried by the next roster
# pass. With the device's own id for the profile, the retry finds the first.
dup, _ = device("flaky wifi")
s, c1 = call("POST", "/v1/profiles", token=dup, body={"name": "Retried", "clientKey": "localid123"})
check("first create is 201", s == 201, (s, c1))
s, c2 = call("POST", "/v1/profiles", token=dup, body={"name": "Retried", "clientKey": "localid123"})
check("the retry hands back the SAME profile", s == 200 and c2.get("profileId") == c1.get("profileId") and c2.get("existing"), (s, c2))
s, lst = call("GET", "/v1/profiles", token=dup)
check("the account holds one of it, carrying its key",
      [p.get("clientKey") for p in lst["profiles"]] == ["localid123"], lst["profiles"])
other, _ = device("someone else")
s, c3 = call("POST", "/v1/profiles", token=other, body={"name": "Retried", "clientKey": "localid123"})
check("the same key from another account is its own profile", s == 201 and c3["profileId"] != c1["profileId"], (s, c3))
call("DELETE", "/v1/profiles/" + c1["profileId"], token=dup)
s, c4 = call("POST", "/v1/profiles", token=dup, body={"name": "Retried", "clientKey": "localid123"})
check("once deleted, the key makes a new one", s == 201 and c4["profileId"] != c1["profileId"], (s, c4))
for pid, tok in [(c3["profileId"], other), (c4["profileId"], dup), (e1["profileId"], ed), (e2["profileId"], ed)]:
    call("DELETE", "/v1/profiles/" + pid, token=tok)

print("\n== the roster says WHO owns each profile, by name ==")
# isOwner only answers "is this mine". Once a phone has been signed in to
# more than one account that is not enough: a profile you do not recognise
# needs to say whose it is, and a boolean cannot.
named = account("owner")
s, np = call("POST", "/v1/profiles", token=named["token"], body={"name": "Named owner profile"})
s, mine = call("GET", "/v1/profiles", token=named["token"])
row = [p for p in mine.get("profiles", []) if p["profileId"] == np["profileId"]]
check("your own profile is owned by your username",
      row and row[0].get("ownerName") == named["name"], row)

friend = account("friend")
s, sd = call("POST", "/v1/profiles/%s/seeds" % np["profileId"], token=named["token"], body={"level": "write"})
s, j = call("POST", "/v1/join", token=friend["token"], body={"seed": sd["seed"]})
check("joining reports the owner straight away, so the row is labelled before any sync",
      j.get("ownerName") == named["name"], j)
s, theirs = call("GET", "/v1/profiles", token=friend["token"])
row = [p for p in theirs.get("profiles", []) if p["profileId"] == np["profileId"]]
check("and their listing names the owner rather than only saying not-yours",
      row and row[0].get("ownerName") == named["name"] and row[0]["isOwner"] is False, row)

# A device that never registered owns profiles under no username at all.
# That must not drop the row, which is why the join is a LEFT JOIN.
anon, _ = device("unclaimed owner")
s, ap = call("POST", "/v1/profiles", token=anon, body={"name": "Owned by nobody"})
s, sd2 = call("POST", "/v1/profiles/%s/seeds" % ap["profileId"], token=anon, body={"level": "read"})
s, _ = call("POST", "/v1/join", token=friend["token"], body={"seed": sd2["seed"]})
s, theirs = call("GET", "/v1/profiles", token=friend["token"])
row = [p for p in theirs.get("profiles", []) if p["profileId"] == ap["profileId"]]
check("an owner with no account leaves the row present and the name empty",
      row and row[0].get("ownerName") is None, row)
call("DELETE", "/v1/profiles/" + ap["profileId"], token=anon)
call("DELETE", "/v1/profiles/" + np["profileId"], token=named["token"])


print("\n== leaving a profile somebody shared with you ==")
# The one that shipped broken: "delete" on a shared profile could only ever be
# local. The grant survived, so the profile kept coming back in GET /v1/profiles,
# every other device the account was signed in on kept its copy, and the account
# sheet went on offering to fetch the very thing that had just been deleted.
s, resp = call("DELETE", "/v1/profiles/%s/grants/me" % a["profileId"], token=her)
check("a grant holder can leave", s == 200 and resp.get("left") is True, (s, resp))
s, theirs = call("GET", "/v1/profiles", token=her)
check("it is out of THEIR account", a["profileId"] not in ids(theirs), theirs)
s, mine = call("GET", "/v1/profiles", token=owner)
check("and still in the owner's", a["profileId"] in ids(mine), names(mine))
s, _ = call("GET", "/v1/profiles/%s/changes" % a["profileId"], token=her)
check("they can no longer read it", s == 404, s)

s, _ = call("DELETE", "/v1/profiles/%s/grants/me" % a["profileId"], token=her)
check("leaving twice is 404, which the client reads as already done", s == 404, s)
s, resp = call("DELETE", "/v1/profiles/%s/grants/me" % a["profileId"], token=owner)
check("an owner cannot leave their own profile", s == 400 and resp.get("error") == "owner_cannot_leave", (s, resp))
outsider2, _ = device("outsider2")
s, _ = call("DELETE", "/v1/profiles/%s/grants/me" % a["profileId"], token=outsider2)
check("a stranger gets 404, not a hint it exists", s == 404, s)

s, g = call("GET", "/v1/profiles/%s/grants" % a["profileId"], token=owner)
check("the owner's people list drops whoever left",
      her_id not in [x["userId"] for x in g.get("grants", [])], g.get("grants"))

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
