#!/usr/bin/env python3
"""Phase 4 checks: the sync transport.

The interesting cases are the ones that lose data quietly:
a read grant writing anyway, a page boundary inside a millisecond, a delete
that comes back as an absence instead of a tombstone, and a stale push
overwriting a newer row.
"""
import os
import json, urllib.request, urllib.error, sys, time

# Override to run against a local `wrangler dev`:
#   ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_sync.py
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

item = lambda c, i, j, **kw: dict({"collection": c, "itemId": i, "json": j}, **kw)

print("\n== setup ==")
owner, owner_id = device("owner")
writer, writer_id = device("writer")
reader, reader_id = device("reader")
outsider, _ = device("outsider")

s, prof = call("POST", "/v1/profiles", token=owner, body={"name": "Sync test"})
PID, WRITE_SEED = prof["profileId"], prof["seed"]
check("profile created with a write seed", s == 201 and bool(WRITE_SEED), (s, prof))

s, b = call("POST", "/v1/join", token=writer, body={"seed": WRITE_SEED})
check("writer joined with write level", s == 201 and b.get("level") == "write", (s, b))

s, rs = call("POST", "/v1/profiles/%s/seeds" % PID, token=owner, body={"level": "read"})
s, b = call("POST", "/v1/join", token=reader, body={"seed": rs["seed"]})
check("reader joined with read level", s == 201 and b.get("level") == "read", (s, b))

print("\n== a fresh profile is empty, not missing ==")
s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=owner)
check("empty profile returns an empty feed", s == 200 and b.get("items") == [], (s, b))
check("feed reports the level", b.get("level") == "owner", b)
s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=outsider)
check("an outsider gets 404 on the feed", s == 404, (s, b))

print("\n== who may write ==")
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=writer,
            body={"items": [item("log", "L1", {"exercise": "Squat", "weight": 100})]})
check("write grant can push", s == 200 and b.get("accepted") == 1, (s, b))

s, b = call("POST", "/v1/profiles/%s/items" % PID, token=reader,
            body={"items": [item("log", "L2", {"exercise": "Sneaky"})]})
check("read grant is refused with 403", s == 403 and b.get("error") == "read_only", (s, b))

s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=reader)
ids = [i["itemId"] for i in b.get("items", [])]
check("the refused write left no trace", "L2" not in ids, ids)
check("read grant can still pull", s == 200 and "L1" in ids, (s, ids))

s, b = call("POST", "/v1/profiles/%s/items" % PID, token=outsider,
            body={"items": [item("log", "L3", {})]})
check("an outsider gets 404, not 403", s == 404, (s, b))

# ── the level is not a label, and it has to be able to go DOWN ─────────────
# This is the one that shipped broken. Join used to keep the better of the two
# levels, so handing a read code to somebody who had once been given a write
# one changed nothing at all: her app said "read only" because that is what
# the code said, the server still took her pushes because the grant still said
# write, and her sets landed in his log.
print("\n== a read code demotes, and the owner can set a level directly ==")
demoted, demoted_id = device("demoted")
s, b = call("POST", "/v1/join", token=demoted, body={"seed": WRITE_SEED})
check("joined on the write code, as write", s == 201 and b.get("level") == "write", (s, b))

s, rs2 = call("POST", "/v1/profiles/%s/seeds" % PID, token=owner, body={"level": "read"})
s, b = call("POST", "/v1/join", token=demoted, body={"seed": rs2["seed"]})
check("re-joining on a read code reports read", s in (200, 201) and b.get("level") == "read", (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=demoted,
            body={"items": [item("log", "L4", {"exercise": "Hers"})]})
check("and the push is refused afterwards", s == 403 and b.get("error") == "read_only", (s, b))

s, b = call("PUT", "/v1/profiles/%s/grants/%s" % (PID, demoted_id), token=owner, body={"level": "write"})
check("the owner can put somebody back to write", s == 200 and b.get("level") == "write", (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=demoted,
            body={"items": [item("log", "L4", {"exercise": "Hers"})]})
check("and the push works again", s == 200 and b.get("accepted") == 1, (s, b))

s, b = call("PUT", "/v1/profiles/%s/grants/%s" % (PID, demoted_id), token=owner, body={"level": "read"})
check("and move them to read without evicting them", s == 200 and b.get("level") == "read", (s, b))
s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=demoted)
check("they can still read after the move", s == 200 and b.get("level") == "read", (s, b))

s, b = call("PUT", "/v1/profiles/%s/grants/%s" % (PID, owner_id), token=demoted, body={"level": "write"})
check("a grant holder cannot set levels", s == 404, (s, b))
s, b = call("PUT", "/v1/profiles/%s/grants/%s" % (PID, demoted_id), token=owner, body={"level": "admin"})
check("an invented level is refused", s == 400, (s, b))
s, b = call("PUT", "/v1/profiles/%s/grants/nobody" % PID, token=owner, body={"level": "read"})
check("setting a level on a stranger is 404, not a silent ok", s == 404, (s, b))

# ── rotate: what the share sheet's own caption has always claimed ─────────
print("\n== a rotated code retires the old ones and evicts nobody ==")
s, spare = call("POST", "/v1/profiles" , token=owner, body={"name": "Rotate test"})
P3, P3_SEED = spare["profileId"], spare["seed"]
joiner, _ = device("joiner")
call("POST", "/v1/join", token=joiner, body={"seed": P3_SEED})
s, rot = call("POST", "/v1/profiles/%s/seeds" % P3, token=owner, body={"level": "read", "rotate": True})
check("rotating mints a new code", s == 201 and bool(rot.get("seed")), (s, rot))
s, b = call("GET", "/v1/profiles/%s/seeds" % P3, token=owner)
check("exactly one code is live afterwards", len(b.get("seeds", [])) == 1, b)
check("and the one shipped with the profile is not it",
      all(x["seed"] != P3_SEED for x in b.get("seeds", [])), b)
s, b = call("POST", "/v1/join", token=outsider, body={"seed": P3_SEED})
check("the retired code no longer works", s == 404, (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % P3, token=joiner,
            body={"items": [item("log", "R1", {"still": "in"})]})
check("somebody who joined before the rotate is untouched", s == 200, (s, b))
call("DELETE", "/v1/profiles/" + P3, token=owner)

print("\n== the allowlist is closed ==")
for coll, iid, why in [
    ("drafts", "entry", "drafts never sync"),
    ("timers", "t1", "timers hold a device-local push handle"),
    ("nonsense", "x", "an unknown collection"),
]:
    s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
                body={"items": [item(coll, iid, {"a": 1})]})
    check("refuses %s" % why, s == 400 and b.get("error") == "bad_item", (s, b))

s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
            body={"items": [item("settings", "theme", "dark")]})
check("refuses theme, a device preference", s == 400, (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
            body={"items": [item("settings", "units", "kg")]})
check("accepts units, which is training config", s == 200 and b.get("accepted") == 1, (s, b))

print("\n== size limits ==")
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
            body={"items": [item("library", "huge", {"image": "x" * 600_000})]})
check("refuses an item over the row budget", s == 400, (s, b))
check("the error names the offending item", "library/huge" in str(b.get("message", "")), b)

s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
            body={"items": [item("log", "n%d" % n, {"i": n}) for n in range(250)]})
check("refuses more than 200 items in one push", s == 400 and b.get("error") == "too_many", (s, b))

print("\n== nothing half-lands ==")
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner, body={"items": [
    item("log", "GOOD1", {"ok": True}),
    item("nonsense", "BAD", {}),
    item("log", "GOOD2", {"ok": True}),
]})
check("a batch with one bad item is refused whole", s == 400, (s, b))
s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=owner)
ids = [i["itemId"] for i in b.get("items", [])]
check("the good items in that batch were not written", "GOOD1" not in ids and "GOOD2" not in ids, ids)

print("\n== tombstones ==")
call("POST", "/v1/profiles/%s/items" % PID, token=owner,
     body={"items": [item("body", "B1", {"weight": 80})]})
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
            body={"items": [{"collection": "body", "itemId": "B1", "deleted": True}]})
check("a delete is accepted", s == 200 and b.get("accepted") == 1, (s, b))

s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=owner)
row = next((i for i in b.get("items", []) if i["itemId"] == "B1"), None)
check("the deleted row still comes back", row is not None, b.get("items"))
check("it comes back marked deleted", row and row.get("deleted") is True, row)
check("its payload is gone", row and row.get("json") is None, row)

print("\n== the server owns the clock ==")
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=owner,
            body={"items": [item("goals", "Squat", 180)]})
stamped = b.get("updatedAt")
check("push reports the stamp it wrote", isinstance(stamped, int), b)
s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=owner)
g = next((i for i in b["items"] if i["itemId"] == "Squat"), None)
check("the feed carries that same server stamp", g and g["updatedAt"] == stamped, (g, stamped))
order = [i["updatedAt"] for i in b["items"]]
check("the feed is ordered oldest first", order == sorted(order), order)

print("\n== a stale push cannot go backwards ==")
now = int(time.time() * 1000)
call("POST", "/v1/profiles/%s/items" % PID, token=owner,
     body={"items": [item("log", "RACE", {"v": "new"}, clientUpdatedAt=now)]})
s, b = call("POST", "/v1/profiles/%s/items" % PID, token=writer,
            body={"items": [item("log", "RACE", {"v": "old"}, clientUpdatedAt=now - 60_000)]})
check("an older edit is skipped, not applied", s == 200 and b.get("skipped") == 1, (s, b))
check("the skip is reported back", b.get("staleItems", [{}])[0].get("itemId") == "RACE", b)

s, b = call("GET", "/v1/profiles/%s/changes" % PID, token=owner)
race = next((i for i in b["items"] if i["itemId"] == "RACE"), None)
check("the newer value survived", race and race["json"]["v"] == "new", race)

s, b = call("POST", "/v1/profiles/%s/items" % PID, token=writer,
            body={"items": [item("log", "RACE", {"v": "newest"}, clientUpdatedAt=now + 60_000)]})
check("a newer edit is applied", s == 200 and b.get("accepted") == 1, (s, b))

print("\n== paging inside a single millisecond ==")
s, fresh = call("POST", "/v1/profiles", token=owner, body={"name": "Paging"})
P2 = fresh["profileId"]
BATCH = [item("log", "p%02d" % n, {"i": n}) for n in range(40)]
s, b = call("POST", "/v1/profiles/%s/items" % P2, token=owner, body={"items": BATCH})
check("40 items written in one push, one timestamp", s == 200 and b.get("accepted") == 40, (s, b))

seen, cursor, pages = [], None, 0
while pages < 20:
    pages += 1
    q = "/v1/profiles/%s/changes?limit=7" % P2
    if cursor: q += "&cursor=" + cursor
    s, b = call("GET", q, token=owner)
    if s != 200: break
    seen += [i["itemId"] for i in b["items"]]
    cursor = b.get("cursor")
    if not b.get("hasMore"): break

check("paging terminated", pages < 20, "%d pages" % pages)
check("every item arrived", sorted(set(seen)) == sorted([i["itemId"] for i in BATCH]),
      "got %d unique of 40" % len(set(seen)))
check("no item was delivered twice", len(seen) == len(set(seen)), "%d rows, %d unique" % (len(seen), len(set(seen))))
check("it actually took several pages", pages >= 6, "%d pages" % pages)

print("\n== a bad cursor is rejected, not ignored ==")
s, b = call("GET", "/v1/profiles/%s/changes?cursor=notacursor" % P2, token=owner)
check("garbage cursor is a 400", s == 400 and b.get("error") == "bad_cursor", (s, b))

call("DELETE", "/v1/profiles/" + PID, token=owner)
call("DELETE", "/v1/profiles/" + P2, token=owner)

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL: print("  - " + f)
sys.exit(1 if FAIL else 0)
