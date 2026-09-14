#!/usr/bin/env python3
"""Black-box test of usernames and passwords, Phase 6.

Run against production by default, or a local `wrangler dev` with:

    ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_auth.py

The client derives its key with PBKDF2 before anything is sent, so this file
does the same. If these two ever disagree the app will look broken while every
test here passes, so the parameters live in one obvious place at the top.
"""
import json, os, urllib.request, urllib.error, hashlib, secrets

API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
PASS, FAIL = [], []

# Must match deriveKey() in zenofit-cloud.js, exactly.
PBKDF2_ITERS = 210_000

def derive(username, password):
    salt = ("zenofit:" + username.lower()).encode()
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERS).hex()

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

def device(label="test"):
    s, b = call("POST", "/v1/devices", body={"displayName": label})
    assert s == 201, (s, b)
    return b["token"], b["userId"]

tag = secrets.token_hex(4)
NAME = "zt_" + tag                 # unique per run, so re-running never collides
PW   = "correct horse battery"

print("\n== the name rules ==")
for bad, why in [("ab", "too short"), ("x" * 25, "too long"), ("has space", "space"),
                 ("me@you", "at sign"), ("_leading", "leading separator"), ("", "empty")]:
    s, b = call("POST", "/v1/auth/register", body={"username": bad, "key": derive("x" * 5, PW)})
    check("refuses a username: " + why, s == 400 and b.get("error") == "bad_username", (s, b))

print("\n== the key has to be derived ==")
s, b = call("POST", "/v1/auth/register", body={"username": NAME, "key": PW})
check("refuses a raw password as the key", s == 400 and b.get("error") == "bad_request", (s, b))
s, b = call("POST", "/v1/auth/register", body={"username": NAME})
check("refuses a missing key", s == 400, (s, b))

print("\n== registering with no device makes a new account ==")
s, b = call("POST", "/v1/auth/register", body={"username": NAME, "key": derive(NAME, PW)})
check("registers", s == 201, (s, b))
check("hands back a token", isinstance(b.get("token"), str) and len(b["token"]) > 20, b)
check("says it was not a claim", b.get("claimed") is False, b)
NEW_TOKEN, NEW_USER = b.get("token"), b.get("userId")

s, b = call("GET", "/v1/me", token=NEW_TOKEN)
check("that token works", s == 200 and b.get("userId") == NEW_USER, (s, b))

print("\n== a name is taken once ==")
s, b = call("POST", "/v1/auth/register", body={"username": NAME, "key": derive(NAME, "other")})
check("second registration is refused", s == 409 and b.get("error") == "name_taken", (s, b))
s, b = call("POST", "/v1/auth/register", body={"username": NAME.upper(), "key": derive(NAME.upper(), "other")})
check("and case does not make a second one", s == 409, (s, b))

print("\n== availability ==")
s, b = call("GET", "/v1/auth/available?username=" + NAME)
check("a taken name reads as taken", s == 200 and b.get("available") is False, (s, b))
s, b = call("GET", "/v1/auth/available?username=zt_free_" + tag)
check("a free name reads as free", s == 200 and b.get("available") is True, (s, b))
s, b = call("GET", "/v1/auth/available?username=ab")
check("an illegal name is not available", s == 200 and b.get("available") is False, (s, b))

print("\n== signing in ==")
s, b = call("POST", "/v1/auth/login", body={"username": NAME, "key": derive(NAME, PW)})
check("right password signs in", s == 200 and b.get("userId") == NEW_USER, (s, b))
SECOND = b.get("token")
check("and mints a DIFFERENT token", SECOND and SECOND != NEW_TOKEN, "same token reused")

s, b = call("GET", "/v1/me", token=NEW_TOKEN)
check("the first device is still signed in", s == 200 and b.get("userId") == NEW_USER, (s, b))
s, b = call("GET", "/v1/me", token=SECOND)
check("and so is the second", s == 200 and b.get("userId") == NEW_USER, (s, b))

print("\n== signing in wrong ==")
s, b = call("POST", "/v1/auth/login", body={"username": NAME, "key": derive(NAME, "wrong password")})
check("wrong password is 401", s == 401 and b.get("error") == "bad_login", (s, b))
s, b = call("POST", "/v1/auth/login", body={"username": "zt_nobody_" + tag, "key": derive("zt_nobody_" + tag, PW)})
check("unknown user is the SAME 401", s == 401 and b.get("error") == "bad_login", (s, b))
s, b = call("POST", "/v1/auth/login", body={"username": NAME, "key": PW})
check("a raw password never signs in", s == 401, (s, b))

print("\n== the salt is the username, so the key is portable ==")
check("same name and password derive the same key", derive(NAME, PW) == derive(NAME.upper(), PW),
      "case of the username must not change the key")
check("a different name derives a different key", derive(NAME, PW) != derive(NAME + "x", PW))

print("\n== claiming the device you are already using ==")
DEV_TOKEN, DEV_USER = device("to be claimed")
s, b = call("POST", "/v1/profiles", token=DEV_TOKEN, body={"name": "Synced before signing up"})
check("device made a profile", s == 201, (s, b))
PROFILE = b.get("profileId")

CLAIM = "zt_claim_" + tag
s, b = call("POST", "/v1/auth/register", token=DEV_TOKEN, body={"username": CLAIM, "key": derive(CLAIM, PW)})
check("registering WITH a device claims it", s == 200 and b.get("claimed") is True, (s, b))
check("and keeps the same user id", b.get("userId") == DEV_USER, (b, DEV_USER))

s, b = call("GET", "/v1/profiles", token=DEV_TOKEN)
ids = [p.get("profileId") for p in (b.get("profiles") or [])]
check("the profile it already owned is still there", PROFILE in ids, (PROFILE, ids))

print("\n== and that account now works from a new phone ==")
s, b = call("POST", "/v1/auth/login", body={"username": CLAIM, "key": derive(CLAIM, PW)})
check("signs in", s == 200 and b.get("userId") == DEV_USER, (s, b))
FRESH = b.get("token")
s, b = call("GET", "/v1/profiles", token=FRESH)
ids = [p.get("profileId") for p in (b.get("profiles") or [])]
check("and the training is waiting there", PROFILE in ids, (PROFILE, ids))

s, b = call("POST", "/v1/auth/register", token=DEV_TOKEN, body={"username": "zt_again_" + tag, "key": derive("zt_again_" + tag, PW)})
check("a claimed device cannot be claimed twice", s == 409 and b.get("error") == "already_claimed", (s, b))

print("\n== old device tokens still work ==")
OLD_TOKEN, OLD_USER = device("plain device")
s, b = call("GET", "/v1/me", token=OLD_TOKEN)
check("a device with no account is still a user", s == 200 and b.get("userId") == OLD_USER, (s, b))

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("\nFAILED:")
    for f in FAIL: print("  - " + f)
raise SystemExit(1 if FAIL else 0)
