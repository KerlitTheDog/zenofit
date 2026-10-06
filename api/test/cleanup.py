"""Every account and device a smoke suite makes is deleted again when the
suite exits, pass or fail, through the same DELETE /v1/me a person uses, so
the database only ever holds what is meant to be there.

Each suite's call() hands every reply to note(), which writes down what a
POST /v1/devices or /v1/auth/register made; the exit hook deletes it all.
Accounts go first (a claimed device goes with its account), then bare
devices. An account whose token was logged out during the run signs in
again for a fresh one. Whatever could not be deleted is named in the last
line the suite prints."""
import atexit, json, os, urllib.request, urllib.error

API = os.environ.get("ZENOFIT_API", "https://zenofit-api.kerlit.workers.dev")
_accounts, _devices = {}, []


def note(method, path, body, status, reply):
    if method != "POST" or status not in (200, 201) or not isinstance(reply, dict):
        return
    if path == "/v1/auth/register" and isinstance(body, dict):
        # claiming a device answers without a new token: cleanup signs in
        _accounts[str(body.get("username", "")).lower()] = (body.get("username"), body.get("key"), reply.get("token"))
    elif path == "/v1/devices" and reply.get("token"):
        _devices.append(reply["token"])


def _send(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body or {}).encode())
    req.add_header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def _gone(s, b):
    return s == 200 or (s == 401 and b.get("error") == "account_deleted")


@atexit.register
def _cleanup():
    left = []
    for name, key, token in _accounts.values():
        s, b = _send("DELETE", "/v1/me", token, {"key": key}) if token else (401, {})
        if s == 401 and b.get("error") != "account_deleted":   # no token, or it was logged out
            s1, b1 = _send("POST", "/v1/auth/login", None, {"username": name, "key": key})
            if s1 == 200:
                s, b = _send("DELETE", "/v1/me", b1.get("token"), {"key": key})
        if not _gone(s, b):
            left.append((name, s, b.get("error")))
    for token in _devices:
        s, b = _send("DELETE", "/v1/me", token, {})
        if not _gone(s, b):
            left.append(("device", s, b.get("error")))
    n = len(_accounts) + len(_devices)
    print("\ncleanup: %d of %d accounts and devices this run made are deleted%s"
          % (n - len(left), n, "; NOT deleted: %s" % left[:5] if left else ""))
