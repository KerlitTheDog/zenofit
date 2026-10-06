#!/usr/bin/env python3
"""Black-box test of usernames and passwords, Phase 6.

Run against production by default, or a local `wrangler dev` with:

    ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_auth.py

The client derives its key with PBKDF2 before anything is sent, so this file
does the same. If these two ever disagree the app will look broken while every
test here passes, so the parameters live in one obvious place at the top.

The ceilings on making identities (devices, registrations, name checks, per
address per hour) and on guessing a password are checked only against a
local `wrangler dev`, because tripping one against production would lock the
tester's own address (and a guessed-at account could not be deleted at the
end, see cleanup.py):

    ZENOFIT_API=http://127.0.0.1:8787 ZENOFIT_LIMITS=1 python3 test/smoke_auth.py

Each of those checks speaks from an address of its own (a CF-Connecting-IP
header, which wrangler dev passes through and Cloudflare overwrites), so the
rest of the run is never refused because of them. They ask until refused, so
they work with the defaults and with any `--var LIMIT_*_PER_HOUR` override.

The daily sweep's other half, deleting rate-limit counters whose window is
long over, can only be set off locally too, with a short keep:

    npx wrangler dev --test-scheduled --var LIMIT_ROW_KEEP_MS:3000
    ZENOFIT_API=http://127.0.0.1:8787 ZENOFIT_SWEEP=1 python3 test/smoke_auth.py
"""
import json, os, urllib.request, urllib.error, hashlib, secrets, time
import cleanup   # deletes what this run makes, at exit

API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
PASS, FAIL = [], []

# Must match deriveKey() in zenofit-cloud.js, exactly.
PBKDF2_ITERS = 210_000

def derive(username, password):
    salt = ("zenofit:" + username.lower()).encode()
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERS).hex()

def call(method, path, token=None, body=None, addr=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")
    if token: req.add_header("Authorization", "Bearer " + token)
    # local only: the address a request claims to come from (see the top)
    if addr: req.add_header("CF-Connecting-IP", addr)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            raw = r.read().decode()
            parsed = json.loads(raw) if raw else {}
            cleanup.note(method, path, body, r.status, parsed)
            return r.status, parsed
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

print("\n== checking a password without signing in (Storage check) ==")
s, b = call("POST", "/v1/auth/verify", body={"username": NAME, "key": derive(NAME, PW)})
check("right password is recognised", s == 200 and b.get("userId") == NEW_USER and b.get("username") == NAME, (s, b))
check("and no token comes back", "token" not in b, b)
s, b = call("POST", "/v1/auth/verify", body={"username": NAME.upper(), "key": derive(NAME.upper(), PW)})
check("the name's case does not matter", s == 200 and b.get("userId") == NEW_USER, (s, b))
s, b = call("POST", "/v1/auth/verify", body={"username": NAME, "key": derive(NAME, "wrong password")})
check("wrong password is 401", s == 401 and b.get("error") == "bad_login", (s, b))
s, b = call("POST", "/v1/auth/verify", body={"username": "zt_nobody_" + tag, "key": derive("zt_nobody_" + tag, PW)})
check("unknown user is the SAME 401", s == 401 and b.get("error") == "bad_login", (s, b))
s, b = call("POST", "/v1/auth/verify", body={"username": NAME, "key": PW})
check("a raw password is never accepted", s == 401, (s, b))

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

print("\n== logging out ends the token, and only that one ==")
# The app used to log out by forgetting the token on the phone, and every
# token ever issued stayed good for ever.
s, b = call("POST", "/v1/auth/login", body={"username": CLAIM, "key": derive(CLAIM, PW)})
LAPTOP = b.get("token")
s, b = call("POST", "/v1/auth/logout", token=LAPTOP)
check("logout answers", s == 200 and b.get("loggedOut") is True, (s, b))
s, b = call("GET", "/v1/profiles", token=LAPTOP)
check("the token that logged out is refused from then on", s == 401, (s, b))
s, b = call("GET", "/v1/profiles", token=FRESH)
check("while the account's other devices stay signed in", s == 200, (s, b))
s, b = call("POST", "/v1/auth/logout")
check("logging out with no token is refused, not a crash", s == 401, (s, b))

LOCAL = API.startswith("http://127.0.0.1") or API.startswith("http://localhost")

def fresh_addr():
    """An address nothing else in the run speaks from (local only, see the top)."""
    return "10.%d.%d.%d" % tuple(secrets.randbelow(250) + 1 for _ in range(3))

if os.environ.get("ZENOFIT_LIMITS") and LOCAL:
    print("\n== a password can only be guessed so fast (local only) ==")
    # Local only since the suites clean up after themselves: a guessed-at
    # account is locked for that name and address for fifteen minutes, and
    # so is DELETE /v1/me, so against production it could not be deleted at
    # the end. Guessed at from an address of its own, the cleanup's
    # requests are not the ones it locked.
    a = fresh_addr()
    GUESS = "zt_guess_" + tag
    s, b = call("POST", "/v1/auth/register", addr=fresh_addr(), body={"username": GUESS, "key": derive(GUESS, PW)})
    check("an account to guess at", s == 201, (s, b))
    codes = []
    for i in range(10):
        s, b = call("POST", "/v1/auth/login", addr=a, body={"username": GUESS, "key": "%064x" % (i + 1)})
        codes.append(s)
    check("ten wrong passwords are each just wrong", codes == [401] * 10, codes)
    s, b = call("POST", "/v1/auth/login", addr=a, body={"username": GUESS, "key": "%064x" % 99})
    check("the eleventh is refused as too many", s == 429 and b.get("error") == "too_many_attempts", (s, b))
    s, b = call("POST", "/v1/auth/verify", addr=a, body={"username": GUESS, "key": derive(GUESS, PW)})
    check("and Storage check's verify shares the count, right password or not", s == 429, (s, b))
    s, b = call("POST", "/v1/auth/login", addr=a, body={"username": CLAIM, "key": derive(CLAIM, PW)})
    check("an account nobody is guessing at still logs in", s == 200, (s, b))
    for _ in range(3):
        s, b = call("POST", "/v1/auth/login", addr=a, body={"username": CLAIM, "key": derive(CLAIM, PW)})
    check("and right passwords are never counted against anyone", s == 200, (s, b))

    print("\n== making identities has a ceiling per address (local only) ==")
    CAP = 1000   # a ceiling above this is not a ceiling worth testing for

    def until_refused(make):
        """Calls make() until it is refused; returns (how many got through, last status, last body)."""
        ok = 0
        for _ in range(CAP):
            s, b = make()
            if s == 429:
                return ok, s, b
            ok += 1
        return ok, s, b

    a = fresh_addr()
    n, s, b = until_refused(lambda: call("POST", "/v1/devices", body={"displayName": None}, addr=a))
    check("minting devices from one address is refused at a ceiling", s == 429 and b.get("error") == "too_many_signups", (n, s, b))
    print("        (refused after %d devices)" % n)
    s, b = call("POST", "/v1/devices", body={"displayName": None}, addr=fresh_addr())
    check("while another address still mints one", s == 201, (s, b))

    a = fresh_addr()
    n, s, b = until_refused(lambda: call("POST", "/v1/auth/register", addr=a,
                                         body={"username": "zl_" + secrets.token_hex(5), "key": secrets.token_hex(32)}))
    check("registering from one address is refused at a ceiling", s == 429 and b.get("error") == "too_many_signups", (n, s, b))
    print("        (refused after %d registrations)" % n)
    s, b = call("POST", "/v1/auth/register", addr=a, body={"username": "x", "key": secrets.token_hex(32)})
    check("a malformed registration is still just malformed: it was never counted", s == 400 and b.get("error") == "bad_username", (s, b))
    s, b = call("POST", "/v1/auth/login", addr=a, body={"username": NAME, "key": derive(NAME, PW)})
    check("and logging in from that address still works", s == 200, (s, b))
    s, b = call("POST", "/v1/auth/register", addr=fresh_addr(),
                body={"username": "zl_" + secrets.token_hex(5), "key": secrets.token_hex(32)})
    check("another address still registers", s == 201, (s, b))

    a = fresh_addr()
    n, s, b = until_refused(lambda: call("GET", "/v1/auth/available?username=zl_" + secrets.token_hex(5), addr=a))
    check("asking whether names are free is refused at a ceiling", s == 429 and b.get("error") == "too_many_lookups", (n, s, b))
    print("        (refused after %d name checks)" % n)
    s, b = call("GET", "/v1/auth/available?username=ab", addr=a)
    check("an illegal name is still answered: it never reaches the database", s == 200 and b.get("available") is False, (s, b))

    # IPv6 counts by its /64, the block one machine is handed: walking
    # through addresses it already owns must not reset anything.
    n, s, b = until_refused(lambda: call("POST", "/v1/devices", body={}, addr="2001:db8:5:%x::1" % 7))
    s2, b2 = call("POST", "/v1/devices", body={}, addr="2001:db8:5:7:abcd:ef01:2345:6789")
    check("an IPv6 address shares its /64's ceiling", s == 429 and s2 == 429, (n, s, s2, b2))
    s, b = call("POST", "/v1/devices", body={}, addr="2001:db8:5:8::1")
    check("and the next /64 has its own", s == 201, (s, b))

    # A wrong login counts only against a name that has an account: every
    # new person's first, refused login is a name nobody owns, and a gym
    # signing a class up on one wifi must not lock that wifi out.
    a = fresh_addr()
    codes = [call("POST", "/v1/auth/login", addr=a, body={"username": "zl_" + secrets.token_hex(5), "key": "%064x" % 1})[0] for _ in range(105)]
    check("105 refused logins for names nobody owns are never too many", codes == [401] * 105, codes[-3:])
    s, b = call("POST", "/v1/auth/login", addr=a, body={"username": NAME, "key": derive(NAME, PW)})
    check("and that address still logs in", s == 200, (s, b))
    G6 = "zl_" + secrets.token_hex(5)
    s, b = call("POST", "/v1/auth/register", addr=fresh_addr(), body={"username": G6, "key": derive(G6, PW)})
    codes = [call("POST", "/v1/auth/login", addr="2001:db8:6:1::%x" % (i + 1), body={"username": G6, "key": "%064x" % (i + 1)})[0] for i in range(10)]
    s, b = call("POST", "/v1/auth/login", addr="2001:db8:6:1:ffff::1", body={"username": G6, "key": "%064x" % 99})
    check("wrong passwords from ten addresses in one /64 are one guesser", codes == [401] * 10 and s == 429, (codes, s, b))
else:
    print("\n(the password-guessing and identity-ceiling checks need a local wrangler dev: set ZENOFIT_LIMITS=1, see the top of this file)")

if os.environ.get("ZENOFIT_SWEEP") and LOCAL:
    print("\n== a spent counter leaves with the daily sweep (local only) ==")
    # needs wrangler dev --test-scheduled --var LIMIT_ROW_KEEP_MS:3000 (see the top)
    def sweep():
        urllib.request.urlopen(urllib.request.Request(API + "/__scheduled?cron=23+3+*+*+*"), timeout=30).read()

    a = fresh_addr()
    for i in range(10):
        call("POST", "/v1/auth/login", addr=a, body={"username": NAME, "key": "%064x" % (i + 1)})
    right = {"username": NAME, "key": derive(NAME, PW)}
    s, b = call("POST", "/v1/auth/login", addr=a, body=right)
    check("an address that guessed ten times is held up", s == 429, (s, b))
    sweep()
    s, b = call("POST", "/v1/auth/login", addr=a, body=right)
    check("a counter that can still refuse something survives the sweep", s == 429, (s, b))
    time.sleep(3.3)
    sweep()
    s, b = call("POST", "/v1/auth/login", addr=a, body=right)
    check("once it is old enough the sweep deletes it (it held an address and a name)", s == 200, (s, b))

    joiner, _ = device("join counter")
    codes = [call("POST", "/v1/join", token=joiner, body={"seed": "ZZZZ-ZZZZ-ZZ"})[0] for _ in range(12)]
    check("a device trying codes is held up", 429 in codes, codes)
    time.sleep(3.3)
    sweep()
    s, b = call("POST", "/v1/join", token=joiner, body={"seed": "ZZZZ-ZZZZ-ZZ"})
    check("and its old join counter goes with the same sweep", s == 404, (s, b))
else:
    print("\n(the counter-sweep checks need a local wrangler dev: set ZENOFIT_SWEEP=1, see the top of this file)")

if os.environ.get("ZENOFIT_TOKENS") and LOCAL:
    # Run ALONE, against `wrangler dev --test-scheduled --var TOKEN_IDLE_MS:3000`:
    # the sweep ends every login idle that long, the rest of this run's too.
    print("\n== a login unused for long enough ends (local only, run alone) ==")
    IDLE = "zt_idle_" + tag
    s, b = call("POST", "/v1/auth/register", body={"username": IDLE, "key": derive(IDLE, PW)})
    old = b.get("token")
    time.sleep(4)
    s, b = call("POST", "/v1/auth/login", body={"username": IDLE, "key": derive(IDLE, PW)})
    fresh = b.get("token")
    urllib.request.urlopen(urllib.request.Request(API + "/__scheduled?cron=23+3+*+*+*"), timeout=30).read()
    s, b = call("GET", "/v1/me", token=old)
    check("the login left unused is ended by the sweep", s == 401 and b.get("error") == "unauthorized", (s, b))
    s, b = call("GET", "/v1/me", token=fresh)
    check("while the one used a moment ago is not", s == 200, (s, b))

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("\nFAILED:")
    for f in FAIL: print("  - " + f)
raise SystemExit(1 if FAIL else 0)
