#!/usr/bin/env python3
"""Photos: the store an exercise photo lives in, instead of inside its row.

A library row used to carry its photo, and a photo too big for the item limit
was left behind so the lift itself could travel -- the other phone got the
exercise and a placeholder. Now the photo is uploaded once, here, under the
SHA-256 of its data URL, and the row carries only that id.

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
import json, urllib.request, urllib.error, sys, hashlib, base64, uuid

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

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL:
        print("  - " + f)
sys.exit(1 if FAIL else 0)
