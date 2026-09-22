#!/usr/bin/env python3
"""Photos: the store an exercise photo lives in, instead of inside its row.

A library row used to carry its photo, and a photo too big for the item limit
was left behind so the lift itself could travel -- the other phone got the
exercise and a placeholder. Now the photo is uploaded once, here, under the
SHA-256 of its data URL, and the row carries only that id.

And the other half, since a photo nobody needs must not stay for ever: every
library row naming a photo, and every chat card showing one, HOLDS it, and a
photo left with no holders is deleted by the daily sweep once its grace period
is over. The sweep can only be set off by a local `wrangler dev`, so the checks
that need it run only there:

    npx wrangler dev --test-scheduled --var PHOTO_GRACE_MS:0
    ZENOFIT_API=http://127.0.0.1:8787 ZENOFIT_SWEEP=1 python3 test/smoke_photos.py

The cases worth holding:
  - an upload whose bytes do not match its id is refused, or anybody could
    store a different picture under an id somebody's library points at
  - the same picture uploaded twice is one row and costs nothing the second
    time, which is what makes "upload whatever has not gone yet" safe to
    run on every sync
  - a device can ask which ids the server already has before uploading
  - only the three formats the app writes are accepted: a data URL goes
    straight into an <img>, and an SVG one can carry script
"""
import os
import json, urllib.request, urllib.error, sys, hashlib, base64, uuid, time

# Override to run against a local `wrangler dev`:
#   ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_photos.py
API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
PASS, FAIL = [], []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {}), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"raw": raw}
        return e.code, parsed, dict(e.headers)


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else "   <- " + str(detail)))


def device():
    s, b, _ = call("POST", "/v1/devices", body={"displayName": None})
    assert s == 201, (s, b)
    return b["token"]


# The id the app computes: SHA-256 of the data URL string, hex.
def photo_id(data_url):
    return hashlib.sha256(data_url.encode()).hexdigest()


def data_url(n=600):
    """A distinct, well-formed JPEG-typed data URL every run, so a rerun
    against the live API tests an upload rather than an already-stored id."""
    raw = b"\xff\xd8\xff\xe0" + os.urandom(n) + b"\xff\xd9"
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


print("API: " + API)
phone = device()
laptop = device()

print("\n== uploading ==")
pic = data_url()
pid = photo_id(pic)
s, r, _ = call("PUT", "/v1/photos/" + pid, token=phone, body={"data": pic})
check("a photo is stored under the hash of what was sent", s == 201 and r.get("photoId") == pid and r.get("stored") is True, (s, r))

s, r, _ = call("PUT", "/v1/photos/" + pid, token=laptop, body={"data": pic})
check("the same picture from another device is the same row, and free",
      s == 200 and r.get("stored") is False, (s, r))

other = data_url()
s, r, _ = call("PUT", "/v1/photos/" + pid, token=phone, body={"data": other})
check("bytes that do not match the id are refused", s == 400 and r.get("error") == "bad_photo_id", (s, r))

svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg onload='alert(1)'/>").decode()
s, r, _ = call("PUT", "/v1/photos/" + photo_id(svg), token=phone, body={"data": svg})
check("an SVG is not a photo", s == 400 and r.get("error") == "bad_photo", (s, r))

s, r, _ = call("PUT", "/v1/photos/" + photo_id("hello"), token=phone, body={"data": "hello"})
check("nor is text", s == 400 and r.get("error") == "bad_photo", (s, r))

s, r, _ = call("PUT", "/v1/photos/not-an-id", token=phone, body={"data": pic})
check("an id that is not a hash is not a route", s == 404, (s, r))

print("\n== asking before uploading ==")
missing = photo_id(data_url())
s, r, _ = call("POST", "/v1/photos/have", token=laptop, body={"ids": [pid, missing, "junk"]})
check("the server says which it already has", s == 200 and r.get("have") == [pid], (s, r))

print("\n== reading ==")
s, r, h = call("GET", "/v1/photos/" + pid, token=laptop)
check("any signed-in device holding the id can read it", s == 200 and r.get("data") == pic, (s, r))
cache = {k.lower(): v for k, v in h.items()}.get("cache-control", "")
check("and is told it never changes", "immutable" in cache, cache)
s, r, _ = call("GET", "/v1/photos/" + missing, token=laptop)
check("a photo nobody uploaded is a 404", s == 404, (s, r))
s, r, _ = call("GET", "/v1/photos/" + pid)
check("no token, no photo", s == 401, (s, r))

# ── who holds a photo ──────────────────────────────────────────────────────
def register(label):
    name = (label + uuid.uuid4().hex[:8])[:24]
    key = hashlib.pbkdf2_hmac("sha256", b"correct horse battery", ("zenofit:" + name.lower()).encode(), 210000, 32).hex()
    s, b, _ = call("POST", "/v1/auth/register", body={"username": name, "key": key})
    assert s == 201, (s, b)
    return b["token"], b["userId"]


def lib_row(item_id, photo=None, name="Belt squat"):
    row = {"id": item_id, "name": name, "muscle": "Legs", "equipment": "", "alternatives": "", "note": "",
           "video": "", "custom": True, "__i": 0}
    if photo:
        row["photoId"] = photo
        row["imageMissing"] = True
    return {"collection": "library", "itemId": item_id, "json": row, "clientUpdatedAt": int(time.time() * 1000)}


def push(token, profile, items):
    return call("POST", "/v1/profiles/%s/items" % profile, token=token, body={"items": items})


def upload(token, pic):
    pid = photo_id(pic)
    s, r, _ = call("PUT", "/v1/photos/" + pid, token=token, body={"data": pic})
    assert s in (200, 201), (s, r)
    return pid


def exists(token, pid):
    return call("GET", "/v1/photos/" + pid, token=token)[0] == 200


owner_tok, owner_id = register("phot")
friend_tok, friend_id = register("frnd")
s, prof, _ = call("POST", "/v1/profiles", token=owner_tok, body={"name": "photo holdings"})
profile = prof["profileId"]

print("\n== a row that names a photo holds it ==")
held = upload(owner_tok, data_url())
s, r, _ = push(owner_tok, profile, [lib_row("ex-held", held)])
check("a row naming an uploaded photo is accepted and nothing is missing",
      s == 200 and r.get("accepted") == 1 and r.get("missingPhotos") == [], (s, r))

never = photo_id(data_url())
s, r, _ = push(owner_tok, profile, [lib_row("ex-hole", never)])
check("a row naming a photo the server does NOT have is told so, so the phone sends it again",
      s == 200 and r.get("missingPhotos") == [never], (s, r))

s, r, _ = push(owner_tok, profile, [lib_row("ex-hole", None)])
check("and a row that names no photo is told nothing", s == 200 and r.get("missingPhotos") == [], (s, r))

print("\n== a photo whose message never went ==")
s, ch, _ = call("POST", "/v1/chats", token=owner_tok, body={"userId": friend_id})
thread = ch["threadId"]
lonely = data_url()
s, up, _ = call("POST", "/v1/chats/%s/photos" % thread, token=owner_tok, body={"data": lonely})
cp = up["photoId"]
s, r, _ = call("DELETE", "/v1/chats/%s/photos/%s" % (thread, cp), token=friend_tok)
check("only the person who uploaded a chat photo can delete it", s == 403, (s, r))
s, r, _ = call("DELETE", "/v1/chats/%s/photos/%s" % (thread, cp), token=owner_tok)
check("its uploader can, when no message shows it", s == 200 and r.get("deleted") is True, (s, r))
check("and it is gone from the server", not exists(owner_tok, cp), cp)
shown = data_url()
s, up, _ = call("POST", "/v1/chats/%s/photos" % thread, token=owner_tok, body={"data": shown})
sp = up["photoId"]
s, m, _ = call("POST", "/v1/chats/%s/messages" % thread, token=owner_tok,
               body={"body": "Photo", "kind": "image", "payload": {"photo": sp}})
s, r, _ = call("DELETE", "/v1/chats/%s/photos/%s" % (thread, sp), token=owner_tok)
check("but not while a message still shows it: that is what unsending is for", s == 409, (s, r))

if os.environ.get("ZENOFIT_SWEEP"):
    def sweep():
        req = urllib.request.Request(API + "/__scheduled?cron=23+3+*+*+*")
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()

    print("\n== the sweep (local only: grace 0, set off by hand) ==")
    sweep()
    check("a photo a row still holds survives the sweep", exists(owner_tok, held), held)

    s, r, _ = push(owner_tok, profile, [lib_row("ex-held", None)])
    sweep()
    check("the row lets go of it (photo removed), and the sweep takes it", not exists(owner_tok, held), held)

    twice = upload(owner_tok, data_url())
    s, prof2, _ = call("POST", "/v1/profiles", token=owner_tok, body={"name": "second"})
    push(owner_tok, profile, [lib_row("ex-a", twice)])
    push(owner_tok, prof2["profileId"], [lib_row("ex-b", twice)])
    push(owner_tok, profile, [lib_row("ex-a", None)])
    sweep()
    check("a photo two rows hold outlives one of them letting go", exists(owner_tok, twice), twice)
    push(owner_tok, prof2["profileId"], [{"collection": "library", "itemId": "ex-b", "json": None, "deleted": True,
                                           "clientUpdatedAt": int(time.time() * 1000)}])
    sweep()
    check("and goes when the last one does (the exercise deleted)", not exists(owner_tok, twice), twice)

    in_profile = upload(owner_tok, data_url())
    s, prof3, _ = call("POST", "/v1/profiles", token=owner_tok, body={"name": "to delete"})
    push(owner_tok, prof3["profileId"], [lib_row("ex-c", in_profile)])
    call("DELETE", "/v1/profiles/" + prof3["profileId"], token=owner_tok)
    sweep()
    check("deleting a profile lets go of every photo its rows held", not exists(owner_tok, in_profile), in_profile)

    carded = upload(owner_tok, data_url())
    push(owner_tok, profile, [lib_row("ex-d", carded)])
    s, card, _ = call("POST", "/v1/chats/%s/messages" % thread, token=owner_tok, body={
        "body": "Exercise: Belt squat", "kind": "exercise",
        "payload": {"v": 1, "ex": {"name": "Belt squat", "muscle": "Legs", "photo": carded}}})
    push(owner_tok, profile, [lib_row("ex-d", None)])
    sweep()
    check("a card still showing a photo keeps it after the exercise lets go", exists(friend_tok, carded), carded)
    call("DELETE", "/v1/chats/%s/messages/%s" % (thread, card["message"]["messageId"]), token=owner_tok)
    sweep()
    check("and unsending the card lets it go", not exists(owner_tok, carded), carded)

    planned = upload(owner_tok, data_url())
    s, pcard, _ = call("POST", "/v1/chats/%s/messages" % thread, token=owner_tok, body={
        "body": "Planned day: Thu", "kind": "plan",
        "payload": {"v": 1, "plan": {"date": "2031-01-02", "entries": []},
                    "lib": [{"name": "Belt squat", "photo": planned}]}})
    sweep()
    check("a planned day's lifts hold their photos too", s == 201 and exists(friend_tok, planned), (s, planned))

    stray = data_url()
    s, up, _ = call("POST", "/v1/chats/%s/photos" % thread, token=owner_tok, body={"data": stray})
    unheld = upload(owner_tok, data_url())
    sweep()
    check("a chat photo no message shows is swept (a send that never happened)", not exists(owner_tok, up["photoId"]), up)
    check("a photo uploaded and never named by anything is swept", not exists(owner_tok, unheld), unheld)
    check("while one a message shows is left alone", exists(friend_tok, sp), sp)
else:
    print("\n(the sweep checks need a local wrangler dev: set ZENOFIT_SWEEP=1, see the top of this file)")

call("DELETE", "/v1/profiles/" + profile, token=owner_tok)

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL:
        print("  - " + f)
sys.exit(1 if FAIL else 0)
