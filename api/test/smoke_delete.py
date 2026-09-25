#!/usr/bin/env python3
"""Deleting an account: DELETE /v1/me, and every phone signed in to it finding out.

Run against production by default, or a local `wrangler dev` with:

    ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_delete.py

One account is given everything an account can have -- two phones, a profile
with training and photos in it, one it deleted earlier, a profile shared with
somebody, a profile somebody shared with it and a set logged into that, a
conversation with a picture in it, a block, a rest counting down -- and is then
deleted. The checks are what that has to mean from the OUTSIDE:

  - a wrong password, or none, deletes nothing: a token alone is not enough
  - every token the account had is answered `account_deleted`, not a bare
    401, because the app on that phone is holding the account's training
    and has to know to let go of it
  - its profiles are gone for the people it shared them with, its
    conversations are gone for the people it talked to, and nobody can find
    it or write to it
  - a picture only it held is gone; one somebody else's library also holds
    stays, because it is theirs too
  - a set it logged into somebody else's profile stays: that is their log
  - the username is free, and taking it again is a new, empty account that
    the old tokens do not open
  - the password check shares login's limits, so this is no way round them

Like the other suites it makes throwaway accounts, and unlike them it deletes
almost all of them again on the way out. `dan`, the account the limit check
locks for fifteen minutes, is left behind.
"""
import json, os, urllib.request, urllib.error, hashlib, secrets, base64

API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
PASS, FAIL = [], []
PW = "correct horse battery"

# Must match deriveKey() in zenofit-cloud.js, exactly.
def derive(username, password):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), ("zenofit:" + username.lower()).encode(), 210000, 32).hex()

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

def account(label):
    name = (label + secrets.token_hex(4))[:24]
    s, b = call("POST", "/v1/auth/register", body={"username": name, "key": derive(name, PW)})
    assert s == 201, (s, b)
    return {"token": b["token"], "id": b["userId"], "name": b["username"]}

# A distinct JPEG-typed data URL each time, and its id as the app computes it.
def data_url():
    return "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + os.urandom(400) + b"\xff\xd9").decode()
def photo_id(u):
    return hashlib.sha256(u.encode()).hexdigest()

item = lambda c, i, j: {"collection": c, "itemId": i, "json": j}

print("API: " + API)
ada = account("zd_ada")      # the account that goes
bob = account("zd_bob")      # talks to her, and holds a profile she shared
cat = account("zd_cat")      # shared a profile with her; her library shares a picture with cat's

print("\n== everything she has ==")
s, b = call("POST", "/v1/auth/login", body={"username": ada["name"], "key": derive(ada["name"], PW)})
ADA_LAPTOP = b.get("token")
check("she is signed in on a second device", s == 200 and ADA_LAPTOP, (s, b))

s, p1 = call("POST", "/v1/profiles", ada["token"], {"name": "Mine"})
P1, P1_SEED = p1["profileId"], p1["seed"]
s, p2 = call("POST", "/v1/profiles", ada["token"], {"name": "Old block"})
P2 = p2["profileId"]
s, b = call("DELETE", "/v1/profiles/" + P2, ada["token"])
check("one of her profiles was deleted before (a tombstone)", s == 200, (s, b))

only_hers, both = data_url(), data_url()
ONLY, BOTH = photo_id(only_hers), photo_id(both)
for u in (only_hers, both):
    s, b = call("PUT", "/v1/photos/" + photo_id(u), ada["token"], {"data": u})
check("she uploaded two library pictures", s in (200, 201), (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % P1, ada["token"], {"items": [
    item("log", "L1", {"exercise": "Squat", "weight": 100}),
    item("library", "ex1", {"name": "Squat", "photoId": ONLY, "imageMissing": True}),
    item("library", "ex2", {"name": "Bench", "photoId": BOTH, "imageMissing": True}),
]})
check("her profile has training in it", s == 200 and b.get("accepted") == 3, (s, b))

s, b = call("POST", "/v1/join", bob["token"], {"seed": P1_SEED})
check("bob holds her profile", s == 201, (s, b))

s, pc = call("POST", "/v1/profiles", cat["token"], {"name": "Cat's"})
PC = pc["profileId"]
s, b = call("POST", "/v1/join", ada["token"], {"seed": pc["seed"]})
check("cat shared a profile with her", s == 201 and b.get("level") == "write", (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % PC, cat["token"],
            {"items": [item("library", "cx", {"name": "Bench", "photoId": BOTH, "imageMissing": True})]})
check("cat's own library holds one of her pictures too", s == 200, (s, b))
s, b = call("POST", "/v1/profiles/%s/items" % PC, ada["token"],
            {"items": [item("log", "ADA1", {"exercise": "Bench", "weight": 40})]})
check("she logged a set into cat's profile", s == 200 and b.get("accepted") == 1, (s, b))

s, t = call("POST", "/v1/chats", ada["token"], {"userId": bob["id"]})
THREAD = t["threadId"]
s, up = call("POST", "/v1/chats/%s/photos" % THREAD, ada["token"], {"data": data_url()})
CHAT_PIC = up.get("photoId")
sent = [
    call("POST", "/v1/chats/%s/messages" % THREAD, ada["token"], {"body": "hi", "clientId": "a1"})[0],
    call("POST", "/v1/chats/%s/messages" % THREAD, bob["token"], {"body": "hey", "clientId": "b1"})[0],
    call("POST", "/v1/chats/%s/messages" % THREAD, ada["token"],
         {"body": "Photo", "clientId": "a2", "kind": "image", "payload": {"photo": CHAT_PIC}})[0],
]
check("she and bob have a conversation with a picture in it", sent == [201, 201, 201], sent)
s, t2 = call("POST", "/v1/chats", bob["token"], {"userId": cat["id"]})
OTHER = t2["threadId"]
s, b = call("POST", "/v1/chats/%s/messages" % OTHER, cat["token"], {"body": "nothing to do with her", "clientId": "c1"})
check("and bob and cat have one of their own", s == 201, (s, b))
s, b = call("POST", "/v1/chats/blocks", ada["token"], {"userId": cat["id"]})
check("she blocked somebody", s == 201, (s, b))
s, b = call("POST", "/v1/timers", ada["token"], {"durationMs": 120000, "label": "Rest", "ref": "p1_seed-timer-120"})
check("a rest of hers is counting down", s == 201, (s, b))

print("\n== the password is asked for, and a wrong one deletes nothing ==")
s, b = call("DELETE", "/v1/me", ada["token"], {"key": derive(ada["name"], "wrong password")})
check("a wrong password is refused", s == 403 and b.get("error") == "bad_password", (s, b))
s, b = call("DELETE", "/v1/me", ada["token"], {})
check("no password at all is refused", s == 403 and b.get("error") == "bad_password", (s, b))
s, b = call("DELETE", "/v1/me", ada["token"], {"key": PW})
check("a raw password is not a key", s == 403, (s, b))
s, b = call("GET", "/v1/profiles", ada["token"])
check("and she is untouched", s == 200 and any(p["profileId"] == P1 for p in b.get("profiles", [])), (s, b))
s, b = call("DELETE", "/v1/me")
check("no token at all is a 401", s == 401 and b.get("error") == "unauthorized", (s, b))

print("\n== deleting ==")
s, b = call("DELETE", "/v1/me", ada["token"], {"key": derive(ada["name"], PW)})
check("the right password deletes the account", s == 200 and b.get("deleted") is True and b.get("userId") == ada["id"], (s, b))
check("both her profiles went, the one deleted earlier included", b.get("profiles") == 2, b)
check("with everything in them", b.get("items") == 3, b)
check("the conversation went, both sides of it", b.get("threads") == 1 and b.get("messages") == 3, b)
check("and the two pictures that were only hers", b.get("photos") == 2, b)

print("\n== every phone she was signed in on is told ==")
for label, tok in (("the phone that deleted it", ada["token"]), ("her laptop", ADA_LAPTOP)):
    s, b = call("GET", "/v1/profiles", tok)
    check("%s hears account_deleted, not a bare 401" % label, s == 401 and b.get("error") == "account_deleted", (s, b))
s, b = call("GET", "/v1/profiles", "not-a-token-anybody-ever-had")
check("while a token nobody had is still just unauthorized", s == 401 and b.get("error") == "unauthorized", (s, b))
s, b = call("POST", "/v1/auth/login", body={"username": ada["name"], "key": derive(ada["name"], PW)})
check("nobody can log in to it", s == 401 and b.get("error") == "bad_login", (s, b))
s, b = call("GET", "/v1/auth/available?username=" + ada["name"])
check("and the username is free again", s == 200 and b.get("available") is True, (s, b))

print("\n== what she shared ==")
s, b = call("GET", "/v1/profiles", bob["token"])
check("her profile left bob's list", s == 200 and not any(p["profileId"] == P1 for p in b.get("profiles", [])), b)
s, b = call("GET", "/v1/profiles/%s/changes" % P1, bob["token"])
check("and nothing of it can be read", s == 404, (s, b))
s, b = call("GET", "/v1/photos/" + ONLY, bob["token"])
check("a picture only her library held is gone", s == 404, (s, b))
s, b = call("GET", "/v1/photos/" + BOTH, bob["token"])
check("one cat's library also holds is still there for cat", s == 200 and b.get("photoId") == BOTH, (s, b))

print("\n== what was shared WITH her ==")
s, b = call("GET", "/v1/profiles/%s/grants" % PC, cat["token"])
check("she is gone from cat's people list", s == 200 and not any(g["userId"] == ada["id"] for g in b.get("grants", [])), b)
s, b = call("GET", "/v1/profiles/%s/changes" % PC, cat["token"])
ids = [i["itemId"] for i in b.get("items", [])]
check("the set she logged in cat's profile is cat's, and stays", "ADA1" in ids, ids)

print("\n== conversations, and being found ==")
s, b = call("GET", "/v1/chats", bob["token"])
threads = [c["threadId"] for c in b.get("chats", [])]
check("the conversation left bob's list too", s == 200 and THREAD not in threads, threads)
check("while bob's conversation with cat is untouched", OTHER in threads, threads)
s, b = call("GET", "/v1/chats/%s/messages" % THREAD, bob["token"])
check("and it cannot be opened", s == 404, (s, b))
s, b = call("GET", "/v1/photos/" + str(CHAT_PIC), bob["token"])
check("the picture she sent in it is gone", s == 404, (s, b))
s, b = call("GET", "/v1/users/search?q=" + ada["name"], bob["token"])
check("nobody can find her by name", s == 200 and not any(u["userId"] == ada["id"] for u in b.get("users", [])), b)
s, b = call("POST", "/v1/chats", cat["token"], {"userId": ada["id"]})
check("and nobody can start a chat with her", s == 404, (s, b))

print("\n== the name, taken again, is a new account with nothing in it ==")
s, b = call("POST", "/v1/auth/register", body={"username": ada["name"], "key": derive(ada["name"], "another password")})
check("somebody can register it", s == 201 and b.get("userId") and b.get("userId") != ada["id"], (s, b))
NEW = b.get("token")
s, b = call("GET", "/v1/profiles", NEW)
check("with none of her profiles", s == 200 and b.get("profiles") == [], (s, b))
s, b = call("GET", "/v1/chats", NEW)
check("and none of her conversations", s == 200 and b.get("chats") == [], (s, b))
s, b = call("GET", "/v1/profiles", ada["token"])
check("her old token opens nothing of the new account", s == 401 and b.get("error") == "account_deleted", (s, b))
s, b = call("DELETE", "/v1/me", NEW, {"key": derive(ada["name"], "another password")})
check("(and that one is deleted again)", s == 200, (s, b))

print("\n== a device that never had a password ==")
s, b = call("POST", "/v1/devices", body={"displayName": "unclaimed"})
DEV = b["token"]
call("POST", "/v1/profiles", DEV, {"name": "x"})
s, b = call("DELETE", "/v1/me", DEV, {})
check("is deleted on its token alone: it has nothing else", s == 200 and b.get("profiles") == 1, (s, b))
s, b = call("GET", "/v1/profiles", DEV)
check("and is told so afterwards", s == 401 and b.get("error") == "account_deleted", (s, b))

print("\n== a password can only be guessed so fast, here too ==")
dan = account("zd_dan")
codes = [call("DELETE", "/v1/me", dan["token"], {"key": "%064x" % (i + 1)})[0] for i in range(10)]
check("ten wrong passwords are each just wrong", codes == [403] * 10, codes)
s, b = call("DELETE", "/v1/me", dan["token"], {"key": derive(dan["name"], PW)})
check("the eleventh is refused as too many, right password or not", s == 429 and b.get("error") == "too_many_attempts", (s, b))
s, b = call("POST", "/v1/auth/login", body={"username": dan["name"], "key": derive(dan["name"], PW)})
check("because it shares login's count", s == 429, (s, b))
s, b = call("GET", "/v1/profiles", dan["token"])
check("and the account is still there", s == 200, (s, b))

print("\n== the other two go the same way ==")
for who in (bob, cat):
    s, b = call("DELETE", "/v1/me", who["token"], {"key": derive(who["name"], PW)})
    check("%s deletes theirs" % who["name"][:6], s == 200 and b.get("deleted") is True, (s, b))

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("\nFAILED:")
    for f in FAIL: print("  - " + f)
raise SystemExit(1 if FAIL else 0)
