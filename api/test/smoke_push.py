#!/usr/bin/env python3
"""Phase 5 checks: VAPID config, push registration, timer scheduling.

Cannot verify that a notification actually lands on a phone. Nothing running
on a server can. What it does verify is everything up to the moment the push
service takes over: the key is served, a subscription is stored, a timer is
accepted, bad times are refused, and cancelling works.
"""
import json, urllib.request, urllib.error, urllib.parse, sys, time, base64, os

# Override to run against a local `wrangler dev`:
#   ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_push.py
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
        with urllib.request.urlopen(req, data, timeout=25) as r:
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

b64u = lambda n: base64.urlsafe_b64encode(os.urandom(n)).decode().rstrip("=")

print("\n== VAPID config ==")
s, b = call("GET", "/v1/config")
check("config is public, no auth needed", s == 200, (s, b))
key = (b or {}).get("vapidPublicKey")
check("public key is served", bool(key), b)
check("public key is a P-256 point", bool(key) and len(key) == 87 and key.startswith("B"), key)

tok, uid = device("push test device")

print("\n== push registration ==")
s, b = call("GET", "/v1/push/status", token=tok)
check("new device has no subscriptions", s == 200 and b.get("subscriptions") == 0, (s, b))
check("server has a private key configured", b.get("configured") is True, b)

for bad, why in [
    ({}, "empty"),
    ({"endpoint": "http://insecure.example/x", "keys": {"p256dh": "a", "auth": "b"}}, "non-https"),
    ({"endpoint": "https://fcm.googleapis.com/x"}, "missing keys"),
]:
    s, b = call("POST", "/v1/push/subscribe", token=tok, body=bad)
    check("rejects %s subscription" % why, s == 400, (s, b))

fake = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/" + b64u(24),
    "keys": {"p256dh": b64u(65), "auth": b64u(16)},
    "platform": "android",
}
s, b = call("POST", "/v1/push/subscribe", token=tok, body=fake)
check("accepts a well-formed subscription", s == 201, (s, b))
s, b = call("GET", "/v1/push/status", token=tok)
check("subscription is stored", s == 200 and b.get("subscriptions") == 1, (s, b))

s, b = call("POST", "/v1/push/subscribe", token=tok, body=fake)
check("re-subscribing does not duplicate", s == 201, (s, b))
s, b = call("GET", "/v1/push/status", token=tok)
check("still exactly one subscription", b.get("subscriptions") == 1, b)

print("\n== which kinds this device wants ==")
s, b = call("POST", "/v1/push/subscribe", token=tok, body=dict(fake, off=["chat", "nonsense"]))
check("a subscription can say no to a kind", s == 201 and b.get("off") == ["chat"], (s, b))
s, b = call("GET", "/v1/push/status?endpoint=" + urllib.parse.quote(fake["endpoint"], safe=""), token=tok)
check("status knows THIS device is subscribed", b.get("thisDevice") is True, b)
check("and which kinds it turned off", b.get("off") == ["chat"], b)
s, b = call("PUT", "/v1/push/prefs", token=tok, body={"endpoint": fake["endpoint"], "off": ["timer", "chat"]})
check("prefs can be changed without re-subscribing", s == 200 and b.get("off") == ["chat", "timer"], (s, b))
s, b = call("PUT", "/v1/push/prefs", token=tok, body={"endpoint": fake["endpoint"], "off": []})
check("and turned all back on", s == 200 and b.get("off") == [], (s, b))
s, b = call("PUT", "/v1/push/prefs", token=tok, body={"endpoint": "https://fcm.googleapis.com/fcm/send/nobody", "off": ["chat"]})
check("prefs for an endpoint that is not yours are a 404", s == 404, (s, b))
s, b = call("GET", "/v1/push/status?endpoint=https%3A%2F%2Fexample.com%2Fnope", token=tok)
check("a device that is not subscribed says so", b.get("thisDevice") is False, b)

print("\n== sending to a dead endpoint ==")
s, b = call("POST", "/v1/push/test", token=tok)
check("test push runs without crashing", s == 200, (s, b))
check("bogus endpoint counted as failed, not sent", b.get("sent") == 0, b)
s, b = call("GET", "/v1/push/status", token=tok)
check("dead subscription was pruned", b.get("subscriptions") == 0, b)

print("\n== timer validation ==")
now = int(time.time() * 1000)
for fire, why, code in [
    (now - 60_000, "a time in the past", "too_soon"),
    (now + 500, "under a second away", "too_soon"),
    (now + 40 * 60 * 60 * 1000, "more than a day out", "too_far"),
    ("soon", "a non-numeric time", "bad_request"),
]:
    s, b = call("POST", "/v1/timers", token=tok, body={"fireAt": fire})
    check("refuses %s" % why, s == 400 and b.get("error") == code, (s, b))

print("\n== scheduling ==")
fire = now + 90_000
s, t = call("POST", "/v1/timers", token=tok, body={"fireAt": fire, "label": "Rest", "title": "Rest done"})
check("schedules a 90 second timer", s == 201 and t.get("timerId"), (s, t))
check("echoes server time for clock drift", isinstance(t.get("serverNow"), int), t)
drift = abs(t.get("serverNow", 0) - now)
check("our clock agrees with the server within 5s", drift < 5000, "%d ms" % drift)

s, b = call("GET", "/v1/timers", token=tok)
check("timer appears as scheduled", s == 200 and len(b.get("timers", [])) == 1, (s, b))

print("\n== cancelling ==")
s, b = call("DELETE", "/v1/timers/" + t["timerId"], token=tok)
check("cancels the timer", s == 200 and b.get("cancelled"), (s, b))
s, b = call("GET", "/v1/timers", token=tok)
check("cancelled timer leaves the list", s == 200 and b.get("timers") == [], (s, b))
s, b = call("DELETE", "/v1/timers/" + t["timerId"], token=tok)
check("cancelling twice is a clean 404", s == 404, (s, b))

tok2, _ = device("other device")
s, t2 = call("POST", "/v1/timers", token=tok, body={"fireAt": now + 120_000, "label": "mine"})
s, b = call("DELETE", "/v1/timers/" + t2["timerId"], token=tok2)
check("cannot cancel someone else's timer", s == 404, (s, b))
call("DELETE", "/v1/timers/" + t2["timerId"], token=tok)

print("\n== duration beats a wrong clock ==")
s, td = call("POST", "/v1/timers", token=tok, body={"durationMs": 90_000, "label": "Rest"})
check("accepts durationMs", s == 201 and td.get("timerId"), (s, td))
gap = td.get("fireAt", 0) - td.get("serverNow", 0)
check("fires 90s after the SERVER's now, not ours", 89_000 < gap < 91_000, "%d ms" % gap)
s, b = call("POST", "/v1/timers", token=tok, body={"durationMs": -5000})
check("refuses a negative duration", s == 400, (s, b))
s, b = call("POST", "/v1/timers", token=tok, body={"label": "no time given"})
check("refuses a timer with no time at all", s == 400, (s, b))
call("DELETE", "/v1/timers/" + td["timerId"], token=tok)

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL: print("  - " + f)
sys.exit(1 if FAIL else 0)
