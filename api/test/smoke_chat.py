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

print("\n== a conversation with nothing in it ==")
quiet_a = account("dan")
quiet_b = account("fay")
s, qt = call("POST", "/v1/chats", token=quiet_a["token"], body={"userId": quiet_b["id"]})
qtid = qt["threadId"]
s, r = call("GET", "/v1/chats", token=quiet_a["token"])
check("whoever opened it sees it straight away", any(c["threadId"] == qtid for c in r.get("chats", [])), r)
s, r = call("GET", "/v1/chats", token=quiet_b["token"])
check("the other person does NOT, until something is said",
      not any(c["threadId"] == qtid for c in r.get("chats", [])), r)
s, qm = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"], body={"body": "hey", "clientId": "q1"})
s, r = call("GET", "/v1/chats", token=quiet_b["token"])
check("and does once it is", any(c["threadId"] == qtid for c in r.get("chats", [])), r)

print("\n== unsending ==")
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, qm["message"]["messageId"]), token=quiet_b["token"])
check("only the sender can unsend", s == 403 and r.get("error") == "not_yours", (s, r))
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, qm["message"]["messageId"]), token=quiet_a["token"])
check("the sender can", s == 200 and r.get("unsent") is True and r.get("deletedAt"), (s, r))
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, qm["message"]["messageId"]), token=quiet_a["token"])
check("twice is the same answer, not an error", s == 200 and r.get("unsent") is True, (s, r))
s, r = call("GET", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"])
check("an unsent message is in nobody's page, not even as a placeholder", r.get("messages") == [], r)
s, r = call("GET", "/v1/chats", token=quiet_b["token"])
check("and a chat left with nothing in it leaves the other person's list again",
      not any(c["threadId"] == qtid for c in r.get("chats", [])), r)
s, r = call("GET", "/v1/chats", token=quiet_a["token"])
check("while staying in the list of whoever opened it", any(c["threadId"] == qtid for c in r.get("chats", [])), r)
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, str(uuid.uuid4())), token=quiet_a["token"])
check("unsending a message that is not there is a 404", s == 404, (s, r))
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, qm["message"]["messageId"]), token=nosy["token"])
check("a stranger cannot even find the thread to try", s == 404, (s, r))

# a message the other phone had ALREADY fetched has to be taken back off it
s, keep = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"], body={"body": "first", "clientId": "q2"})
s, gone = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"], body={"body": "oops", "clientId": "q3"})
s, r = call("GET", "/v1/chats", token=quiet_b["token"])
mine = [c for c in r.get("chats", []) if c["threadId"] == qtid]
check("before: two unread, and the newest is the preview",
      mine and mine[0]["unread"] == 2 and mine[0]["lastMessage"]["body"] == "oops", mine)
since = gone["message"]["at"]
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, gone["message"]["messageId"]), token=quiet_a["token"])
s, r = call("GET", "/v1/chats/%s/messages?since=%d" % (qtid, since), token=quiet_b["token"])
check("a `since` poll names what was unsent since, so the other phone drops its copy",
      gone["message"]["messageId"] in r.get("unsent", []), r)
check("and does not carry the message itself", all(m["messageId"] != gone["message"]["messageId"] for m in r.get("messages", [])), r)
s, r = call("GET", "/v1/chats/%s/messages?since=%d" % (qtid, int(time.time() * 1000) + 60000), token=quiet_b["token"])
check("a poll from after the unsend is not told about it again", r.get("unsent") == [], r)
s, r = call("GET", "/v1/chats", token=quiet_b["token"])
mine = [c for c in r.get("chats", []) if c["threadId"] == qtid]
check("after: the unread count drops by one", mine and mine[0]["unread"] == 1, mine)
check("and the preview falls back to the message before it", mine and mine[0]["lastMessage"]["body"] == "first", mine)

print("\n== a thing, not just words ==")
ex_payload = {"v": 1, "title": "Belt squat", "ex": {"name": "Belt squat", "muscle": "Legs", "kind": "strength"}}
s, r = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"],
            body={"body": "Exercise: Belt squat", "clientId": "q4", "kind": "exercise", "payload": ex_payload})
check("an exercise can be sent", s == 201 and r["message"]["kind"] == "exercise", (s, r))
check("and comes back carrying its payload", r["message"].get("payload") == ex_payload, r)
s, r = call("GET", "/v1/chats/%s/messages" % qtid, token=quiet_b["token"])
last = (r.get("messages") or [{}])[-1]
check("the other side reads it with its kind and payload", last.get("kind") == "exercise" and last.get("payload") == ex_payload, last)
check("and a plain message reads as text", r["messages"][0].get("kind") == "text" and r["messages"][0].get("payload") is None, r["messages"][0])
s, r = call("GET", "/v1/chats", token=quiet_b["token"])
mine = [c for c in r.get("chats", []) if c["threadId"] == qtid]
check("the chat list says what kind the last message was", mine and mine[0]["lastMessage"].get("kind") == "exercise", mine)
s, r = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"],
            body={"body": "x", "kind": "virus", "payload": {}})
check("an unknown kind is refused by name", s == 400 and r.get("error") == "bad_kind", (s, r))
s, r = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"], body={"body": "x", "kind": "preset"})
check("a thing with no payload is refused", s == 400 and r.get("error") == "bad_payload", (s, r))
s, r = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"],
            body={"body": "x", "kind": "preset", "payload": {"junk": "y" * 40000}})
check("and so is one that is an essay", s == 400 and r.get("error") == "bad_payload", (s, r))

print("\n== a photo in a conversation ==")
tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
s, r = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"],
            body={"body": "Photo", "kind": "image", "payload": {"photo": "0" * 64}})
check("a photo message naming a photo nobody uploaded here is refused", s == 400 and r.get("error") == "bad_payload", (s, r))
s, r = call("POST", "/v1/chats/%s/photos" % qtid, token=quiet_a["token"], body={"data": "data:image/svg+xml;base64,PHN2Zz4="})
check("an SVG is not a photo", s == 400 and r.get("error") == "bad_photo", (s, r))
s, up = call("POST", "/v1/chats/%s/photos" % qtid, token=quiet_a["token"], body={"data": tiny})
check("a photo is uploaded into the thread", s == 201 and len(up.get("photoId", "")) == 64, (s, up))
pid = up.get("photoId")
s, again = call("POST", "/v1/chats/%s/photos" % qtid, token=quiet_a["token"], body={"data": tiny})
check("uploading it again lands on the same photo", s == 200 and again.get("photoId") == pid and again.get("stored") is False, (s, again))
s, r = call("GET", "/v1/photos/" + pid, token=quiet_b["token"])
check("the other member can read it", s == 200 and r.get("data") == tiny, (s, r))
s, r = call("GET", "/v1/photos/" + pid, token=nosy["token"])
check("somebody outside the thread cannot, and is told it does not exist", s == 404, (s, r))
s, pm = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"],
             body={"body": "Photo", "clientId": "q5", "kind": "image", "payload": {"photo": pid, "w": 1, "h": 1}})
check("and a message can show it", s == 201 and pm["message"]["payload"]["photo"] == pid, (s, pm))
# a SECOND photo in the same thread, so the unsend below has another live
# photo message to look past -- the case that once failed, because the check
# used a LIKE pattern longer than D1 allows
second = tiny.replace("AAAABJRU5ErkJggg==", "AAAABJRU5ErkJggh==")
s, up2 = call("POST", "/v1/chats/%s/photos" % qtid, token=quiet_a["token"], body={"data": second})
keep_pid = up2["photoId"]
s, keep_m = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"],
                 body={"body": "Photo", "clientId": "q6", "kind": "image", "payload": {"photo": keep_pid, "w": 1, "h": 1}})
s, r = call("DELETE", "/v1/chats/%s/messages/%s" % (qtid, pm["message"]["messageId"]), token=quiet_a["token"])
check("unsending a photo in a thread that shows another photo works", s == 200 and r.get("unsent") is True, (s, r))
s, r = call("GET", "/v1/photos/" + pid, token=quiet_b["token"])
check("unsending the message deletes the photo with it", s == 404, (s, r))
s, r = call("GET", "/v1/photos/" + keep_pid, token=quiet_b["token"])
check("and leaves the other message's photo alone", s == 200, (s, r))

print("\n== a planned day ==")
s, r = call("POST", "/v1/chats/%s/messages" % qtid, token=quiet_a["token"], body={
    "body": "Planned day: Thu 2 Jan", "clientId": "q7", "kind": "plan",
    "payload": {"v": 1, "plan": {"date": "2031-01-02", "name": "Legs", "entries": [{"exercise": "Leg Press", "kind": "strength", "sets": [{"reps": "10", "weight": "150"}]}]}, "lib": []}})
check("a planned day can be sent", s == 201 and r["message"]["kind"] == "plan", (s, r))
check("with its lifts and targets intact", r["message"]["payload"]["plan"]["entries"][0]["sets"][0]["weight"] == "150", r)

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
