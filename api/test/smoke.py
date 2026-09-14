#!/usr/bin/env python3
"""Black-box test of the Zenofit API, Phase 2 + 3."""
import os
import json, urllib.request, urllib.error, sys

# Override to run against a local `wrangler dev`:
#   ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke.py
API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
PASS, FAIL = [], []

def call(method, path, token=None, body=None, origin=None):
    req = urllib.request.Request(API + path, method=method)
    # Cloudflare answers 1010 to a bare python UA before the Worker ever runs.
    req.add_header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")
    if token: req.add_header("Authorization", "Bearer " + token)
    if origin: req.add_header("Origin", origin)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=20) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {}), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: parsed = json.loads(raw) if raw else {}
        except Exception: parsed = {"raw": raw}
        return e.code, parsed, dict(e.headers)

def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else "   <- " + str(detail)))

def device(label):
    s, b, _ = call("POST", "/v1/devices", body={"displayName": label})
    assert s == 201, (s, b)
    return b["token"], b["userId"]

print("\n== identity ==")
s, b, _ = call("GET", "/v1/me")
check("no token is 401", s == 401, (s, b))
s, b, _ = call("GET", "/v1/me", token="garbage")
check("bad token is 401", s == 401, (s, b))

tokA, uidA = device("Brad phone")
tokB, uidB = device("Lika phone")
tokC, uidC = device("friend phone")
tokD, uidD = device("outsider")
s, b, _ = call("GET", "/v1/me", token=tokA)
check("GET /v1/me works", s == 200 and b["userId"] == uidA, (s, b))

print("\n== profile creation ==")
s, b, _ = call("GET", "/v1/profiles", token=tokA)
check("new device sees no profiles", s == 200 and b["profiles"] == [], (s, b))

s, prof, _ = call("POST", "/v1/profiles", token=tokA, body={"name": "Brad"})
check("create profile is 201", s == 201, (s, prof))
PID, SEED = prof.get("profileId"), prof.get("seed")
check("profile ships with a seed", bool(SEED) and len(SEED) == 12, SEED)
check("creator is owner", prof.get("level") == "owner" and prof.get("isOwner"), prof)

s, b, _ = call("GET", "/v1/profiles", token=tokA)
check("owner lists own profile", s == 200 and len(b["profiles"]) == 1, (s, b))

print("\n== joining with the seed ==")
messy = SEED.lower().replace("-", " ")
s, b, _ = call("POST", "/v1/join", token=tokB, body={"seed": messy})
check("join accepts messy formatting", s == 201, (s, b, messy))
check("joiner gets write, not owner", b.get("level") == "write" and b.get("isOwner") is False, b)
check("joiner gets the same profile id", b.get("profileId") == PID, b)

s, b, _ = call("GET", "/v1/profiles", token=tokB)
check("joiner now lists the profile", s == 200 and len(b["profiles"]) == 1, (s, b))
s, b, _ = call("GET", "/v1/profiles/" + PID, token=tokB)
check("joiner can read the profile", s == 200, (s, b))

s, b, _ = call("PUT", "/v1/profiles/" + PID, token=tokB, body={"name": "Brad and Lika"})
check("write-level can rename", s == 200 and b.get("name") == "Brad and Lika", (s, b))

print("\n== owner-only actions are owner-only ==")
s, b, _ = call("GET", "/v1/profiles/%s/seeds" % PID, token=tokB)
check("non-owner cannot list seeds", s == 404, (s, b))
s, b, _ = call("POST", "/v1/profiles/%s/seeds" % PID, token=tokB, body={"level": "write"})
check("non-owner cannot mint seeds", s == 404, (s, b))
s, b, _ = call("GET", "/v1/profiles/%s/grants" % PID, token=tokB)
check("non-owner cannot see grants", s == 404, (s, b))
s, b, _ = call("DELETE", "/v1/profiles/" + PID, token=tokB)
check("non-owner cannot delete profile", s == 404, (s, b))

s, b, _ = call("GET", "/v1/profiles/%s/grants" % PID, token=tokA)
check("owner sees exactly one grant", s == 200 and len(b["grants"]) == 1, (s, b))
check("grant shows the joiner", b["grants"][0]["userId"] == uidB and b["grants"][0]["level"] == "write", b)

print("\n== outsiders see nothing ==")
s, b, _ = call("GET", "/v1/profiles/" + PID, token=tokD)
check("stranger gets 404, not 403", s == 404 and b.get("error") == "not_found", (s, b))

print("\n== read-only seeds ==")
s, rs, _ = call("POST", "/v1/profiles/%s/seeds" % PID, token=tokA, body={"level": "read"})
check("owner can mint a read seed", s == 201 and rs.get("level") == "read", (s, rs))
s, b, _ = call("POST", "/v1/join", token=tokC, body={"seed": rs["seed"]})
check("read seed grants read", s == 201 and b.get("level") == "read", (s, b))
s, b, _ = call("PUT", "/v1/profiles/" + PID, token=tokC, body={"name": "nope"})
check("read level cannot rename", s == 404, (s, b))
s, b, _ = call("GET", "/v1/profiles/" + PID, token=tokC)
check("read level can still read", s == 200, (s, b))

print("\n== bad codes ==")
for bad, why in [("", "empty"), ("ABC", "too short"), ("ZZZZ-ZZZZ-ZZZZZZ", "too long"), (None, "null")]:
    s, b, _ = call("POST", "/v1/join", token=tokD, body={"seed": bad})
    check("rejects %s code with 400" % why, s == 400, (s, b))
s, b, _ = call("POST", "/v1/join", token=tokD, body={"seed": "ZZZZ-ZZZZ-ZZ"})
check("well-formed but unknown code is 404", s == 404, (s, b))

print("\n== rotation ==")
s, rot, _ = call("POST", "/v1/profiles/%s/seeds" % PID, token=tokA, body={"level": "write", "rotate": True})
check("rotate mints a new seed", s == 201 and rot["seed"] != SEED, (s, rot))
s, b, _ = call("POST", "/v1/join", token=tokD, body={"seed": SEED})
check("old seed stops working after rotate", s == 404, (s, b))
s, b, _ = call("GET", "/v1/profiles/" + PID, token=tokB)
check("rotate does NOT evict people already in", s == 200, (s, b))
s, b, _ = call("GET", "/v1/profiles/%s/seeds" % PID, token=tokA)
check("only the new seed is active", s == 200 and len(b["seeds"]) == 1 and b["seeds"][0]["seed"] == rot["seed"], (s, b))

print("\n== revoking a person ==")
s, b, _ = call("DELETE", "/v1/profiles/%s/grants/%s" % (PID, uidC), token=tokA)
check("owner can revoke a grant", s == 200, (s, b))
s, b, _ = call("GET", "/v1/profiles/" + PID, token=tokC)
check("revoked person loses access", s == 404, (s, b))
s, b, _ = call("GET", "/v1/profiles", token=tokC)
check("revoked person's list is empty", s == 200 and b["profiles"] == [], (s, b))

print("\n== rate limit on join ==")
codes = []
for i in range(13):
    s, _, _ = call("POST", "/v1/join", token=tokD, body={"seed": "ZZZZ-ZZZZ-ZZ"})
    codes.append(s)
check("guessing gets rate limited", 429 in codes, codes)
check("limit kicks in around 10 tries", codes.count(404) <= 11, codes)

print("\n== CORS ==")
s, b, h = call("OPTIONS", "/v1/profiles", origin="https://kerlitthedog.github.io")
check("preflight from the app is allowed", h.get("Access-Control-Allow-Origin") == "https://kerlitthedog.github.io", h)
s, b, h = call("OPTIONS", "/v1/profiles", origin="https://evil.example.com")
check("preflight from elsewhere is refused", "Access-Control-Allow-Origin" not in h, h)

print("\n== deletion ==")
s, b, _ = call("DELETE", "/v1/profiles/" + PID, token=tokA)
check("owner can delete profile", s == 200, (s, b))
s, b, _ = call("GET", "/v1/profiles/" + PID, token=tokA)
check("deleted profile is gone for owner", s == 404, (s, b))
s, b, _ = call("GET", "/v1/profiles", token=tokB)
check("deleted profile is gone for joiner", s == 200 and b["profiles"] == [], (s, b))

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL: print("  - " + f)
sys.exit(1 if FAIL else 0)
