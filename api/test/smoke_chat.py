#!/usr/bin/env python3
"""Chat: messages between accounts.

Everything else in this suite is about a PROFILE -- what is in it, who can
read it, how its name and position travel. A message is none of those things:
it belongs to an account, it goes to another person, and it is never edited.
So the cases worth holding are different too.

The ones that actually break a chat:
  - two people tapping each other's name at the same moment making TWO
    threads, each holding half a conversation
  - a retried send arriving twice, because the phone lost the reply and not
    the request
  - an unread badge that will not clear, or clears on its own
  - a stranger reading a thread by guessing an id
  - a block that only hides messages on one screen while the other side
    goes on sending
"""
import os
import json, urllib.request, urllib.error, sys, hashlib, time, uuid

# Override to run against a local `wrangler dev`:
#   ZENOFIT_API=http://127.0.0.1:8787 python3 test/smoke_chat.py
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
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"raw": raw}
        return e.code, parsed


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else "   <- " + str(detail)))


# The client's half of the password work, as zenofit-cloud.js does it. The
# iteration count has to match PBKDF2_ITERS there or every login fails.
def derive(username, password):
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), ("zenofit:" + username.lower()).encode(), 210000, 32
    ).hex()


def account(label):
    """A fresh signed-up account. Chat is account data: a device that has
    never registered has no username and cannot be addressed at all."""
    name = (label + uuid.uuid4().hex[:8])[:24]
    s, b = call("POST", "/v1/auth/register", body={"username": name, "key": derive(name, "correct horse battery")})
    assert s == 201, (s, b)
    return {"token": b["token"], "id": b["userId"], "name": b["username"]}


print("API: " + API)

her = account("ada")
him = account("bob")
nosy = account("eve")

print("\n== finding somebody by name ==")
s, r = call("GET", "/v1/users/search?q=" + her["name"], token=him["token"])
found = [u for u in r.get("users", []) if u["userId"] == her["id"]]
check("a full username finds the account", s == 200 and len(found) == 1, r)
check("and carries the id the chat is opened with", found and found[0]["username"] == her["name"], r)

s, r = call("GET", "/v1/users/search?q=" + her["name"][:5], token=him["token"])
check("a prefix finds it too", any(u["userId"] == her["id"] for u in r.get("users", [])), r)

s, r = call("GET", "/v1/users/search?q=" + her["name"][3:], token=him["token"])
check("a MIDDLE fragment does not: this is not a directory",
      not any(u["userId"] == her["id"] for u in r.get("users", [])), r)

s, r = call("GET", "/v1/users/search?q=a", token=him["token"])
check("one character is refused rather than answered", s == 200 and r["users"] == [], r)

s, r = call("GET", "/v1/users/search?q=" + him["name"], token=him["token"])
check("you never find yourself", not any(u["userId"] == him["id"] for u in r.get("users", [])), r)

s, b = call("POST", "/v1/devices", body={"displayName": "unclaimed"})
unclaimed_token = b["token"]
s, r = call("GET", "/v1/users/search?q=" + her["name"], token=unclaimed_token)
check("an unregistered device can still search", s == 200, (s, r))

print("\n== opening a chat is find-or-create ==")
s, t1 = call("POST", "/v1/chats", token=him["token"], body={"userId": her["id"]})
check("first time creates it", s == 201 and t1.get("created") is True, (s, t1))
check("and says who is in it", [m["userId"] for m in t1.get("members", [])] == [her["id"]], t1)

s, t2 = call("POST", "/v1/chats", token=him["token"], body={"userId": her["id"]})
check("asking again returns the SAME thread, not a second one",
      s == 200 and t2["threadId"] == t1["threadId"] and t2.get("created") is False, (s, t2))

s, t3 = call("POST", "/v1/chats", token=her["token"], body={"userId": him["id"]})
check("and so does asking from the other end", t3["threadId"] == t1["threadId"], t3)

thread = t1["threadId"]

s, r = call("POST", "/v1/chats", token=him["token"], body={"userId": him["id"]})
check("you cannot open a chat with yourself", s == 400, (s, r))
s, r = call("POST", "/v1/chats", token=him["token"], body={"userId": str(uuid.uuid4())})
check("nor with an id that is nobody", s == 404, (s, r))

print("\n== sending and receiving ==")
s, m1 = call("POST", "/v1/chats/%s/messages" % thread, token=him["token"],
             body={"body": "  gym at six?  ", "clientId": "c-one"})
check("a message is stored", s == 201 and m1["message"]["body"] == "gym at six?", (s, m1))
check("stamped by the SERVER, not the phone", m1["message"]["at"] > 0, m1)
check("and says it reached one person", m1.get("recipients") == 1, m1)

s, dup = call("POST", "/v1/chats/%s/messages" % thread, token=him["token"],
              body={"body": "gym at six?", "clientId": "c-one"})
check("a RETRY of the same clientId lands on the same row",
      dup.get("duplicate") is True and dup["message"]["messageId"] == m1["message"]["messageId"], dup)

s, r = call("POST", "/v1/chats/%s/messages" % thread, token=him["token"], body={"body": "   "})
check("whitespace is not a message", s == 400 and r.get("error") == "empty", (s, r))

s, m2 = call("POST", "/v1/chats/%s/messages" % thread, token=her["token"],
             body={"body": "six works", "clientId": "c-two"})
check("she can reply", s == 201, (s, m2))

s, r = call("GET", "/v1/chats/%s/messages" % thread, token=her["token"])
bodies = [m["body"] for m in r.get("messages", [])]
check("the thread reads oldest first", bodies == ["gym at six?", "six works"], bodies)

s, r = call("GET", "/v1/chats/%s/messages?since=%d" % (thread, m2["message"]["at"]), token=him["token"])
check("`since` carries only what is new",
      [m["messageId"] for m in r["messages"]] == [m2["message"]["messageId"]], r.get("messages"))

s, r = call("GET", "/v1/chats/%s/messages?before=%d" % (thread, m2["message"]["at"]), token=him["token"])
check("`before` pages backwards into history",
      [m["body"] for m in r["messages"]] == ["gym at six?"], r.get("messages"))

long_body = "x" * 4000
s, r = call("POST", "/v1/chats/%s/messages" % thread, token=him["token"],
            body={"body": long_body, "clientId": "c-long"})
check("an over-long message is cut, not refused", s == 201 and len(r["message"]["body"]) == 2000, s)

print("\n== unread, and how it clears ==")
s, r = call("GET", "/v1/chats", token=her["token"])
mine = [c for c in r.get("chats", []) if c["threadId"] == thread]
check("the thread is in her list", len(mine) == 1, r)
# She replied above, and replying is reading: everything before her own
# message is already seen, so only the one that came AFTER it is unread.
check("only what arrived after her own last message is unread", mine and mine[0]["unread"] == 1, mine)
check("and the last one is the preview", mine and mine[0]["lastMessage"]["body"] == long_body[:2000], mine)

s, r = call("GET", "/v1/chats", token=him["token"])
his = [c for c in r.get("chats", []) if c["threadId"] == thread]
check("sending is reading: nothing of his own is unread to him", his and his[0]["unread"] == 0, his)

s, r = call("POST", "/v1/chats/%s/read" % thread, token=her["token"])
check("marking read is accepted", s == 200, (s, r))
read_at = r["lastReadAt"]
s, r = call("GET", "/v1/chats", token=her["token"])
mine = [c for c in r.get("chats", []) if c["threadId"] == thread]
check("and the badge is gone", mine and mine[0]["unread"] == 0, mine)

s, r = call("POST", "/v1/chats/%s/read" % thread, token=her["token"], body={"at": 1})
check("a LATE mark from an older screen cannot wind it back",
      r.get("lastReadAt") == read_at, (r, read_at))

print("\n== a stranger ==")
s, r = call("GET", "/v1/chats/%s/messages" % thread, token=nosy["token"])
check("cannot read the thread", s == 404, (s, r))
s, r = call("POST", "/v1/chats/%s/messages" % thread, token=nosy["token"], body={"body": "hello?"})
check("cannot write to it", s == 404, (s, r))
check("and is told it does not exist rather than that it is not theirs",
      r.get("error") == "not_found", r)
s, r = call("GET", "/v1/chats", token=nosy["token"])
check("their own list is empty", r.get("chats") == [], r)

print("\n== mute is quiet, not gone ==")
s, r = call("POST", "/v1/chats/%s/mute" % thread, token=her["token"])
check("muting works", s == 200 and r.get("muted") is True, (s, r))
s, m = call("POST", "/v1/chats/%s/messages" % thread, token=him["token"], body={"body": "still there?"})
check("a message to a muted thread is still DELIVERED", s == 201, (s, m))
s, r = call("GET", "/v1/chats", token=her["token"])
mine = [c for c in r.get("chats", []) if c["threadId"] == thread]
check("and still counts as unread", mine and mine[0]["unread"] == 1, mine)
check("the flag is reported back", mine and mine[0]["muted"] is True, mine)
s, r = call("DELETE", "/v1/chats/%s/mute" % thread, token=her["token"])
check("and it comes off", r.get("muted") is False, r)

print("\n== blocking ==")
blocker = account("cara")
s, bt = call("POST", "/v1/chats", token=blocker["token"], body={"userId": nosy["id"]})
btid = bt["threadId"]
s, _ = call("POST", "/v1/chats/%s/messages" % btid, token=nosy["token"], body={"body": "hi"})
check("before the block, they can write", s == 201, s)

s, r = call("POST", "/v1/chats/blocks", token=blocker["token"], body={"userId": nosy["id"]})
check("blocking works", s == 201 and r.get("blocked") is True, (s, r))

s, r = call("POST", "/v1/chats/%s/messages" % btid, token=nosy["token"], body={"body": "hi again"})
check("THEIR side is stopped at the server, not filtered on mine",
      s == 403 and r.get("error") == "blocked", (s, r))

s, r = call("POST", "/v1/chats/%s/messages" % btid, token=blocker["token"], body={"body": "no"})
check("and the blocker cannot write to them either, with a reason saying why",
      s == 409 and r.get("error") == "you_blocked", (s, r))

s, r = call("GET", "/v1/users/search?q=" + nosy["name"], token=blocker["token"])
check("a blocked account is out of search", not any(u["userId"] == nosy["id"] for u in r.get("users", [])), r)
s, r = call("GET", "/v1/users/search?q=" + blocker["name"], token=nosy["token"])
check("in BOTH directions", not any(u["userId"] == blocker["id"] for u in r.get("users", [])), r)

s, r = call("GET", "/v1/chats/blocks", token=blocker["token"])
check("the block list says who", [b["userId"] for b in r.get("blocks", [])] == [nosy["id"]], r)

s, r = call("POST", "/v1/chats", token=nosy["token"], body={"userId": blocker["id"]})
check("and a fresh chat cannot be started around it", s == 403, (s, r))

s, r = call("DELETE", "/v1/chats/blocks/" + nosy["id"], token=blocker["token"])
check("unblocking works", s == 200 and r.get("blocked") is False, (s, r))
s, r = call("POST", "/v1/chats/%s/messages" % btid, token=nosy["token"], body={"body": "hi once more"})
check("and they can write again", s == 201, (s, r))

print("\n== leaving ==")
s, r = call("DELETE", "/v1/chats/" + btid, token=blocker["token"])
check("leaving is accepted", s == 200 and r.get("left") is True, (s, r))
s, r = call("GET", "/v1/chats", token=blocker["token"])
check("the thread is out of MY list", not any(c["threadId"] == btid for c in r.get("chats", [])), r)
s, r = call("GET", "/v1/chats", token=nosy["token"])
check("and still in theirs: their copy is not mine to delete",
      any(c["threadId"] == btid for c in r.get("chats", [])), r)
s, r = call("GET", "/v1/chats/%s/messages" % btid, token=blocker["token"])
check("I can no longer read it", s == 404, s)

s, r = call("POST", "/v1/chats", token=blocker["token"], body={"userId": nosy["id"]})
check("writing to them again puts the SAME thread back, not a second one",
      s == 200 and r["threadId"] == btid, (s, r))
s, r = call("GET", "/v1/chats/%s/messages" % btid, token=blocker["token"])
check("with the history still in it", len(r.get("messages", [])) >= 2, r.get("messages"))

print("\n== unauthenticated ==")
s, r = call("GET", "/v1/chats")
check("no token, no chats", s == 401, (s, r))
s, r = call("GET", "/v1/users/search?q=ada")
check("nor a name search", s == 401, (s, r))

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILED:")
    for f in FAIL:
        print("  - " + f)
sys.exit(1 if FAIL else 0)
