/* One Durable Object per scheduled timer.
 *
 * Why a DO and not a cron: crons run at most once a minute. A rest timer is
 * 60 to 180 seconds, so a cron would fire up to 59 seconds late, which for a
 * rest timer is the whole point missed. A DO alarm fires at the second.
 *
 * The object holds one timer and then goes away. It is addressed by the timer
 * id, so cancelling is "open the same object, drop its alarm".
 */

import { sendToUser } from "./push.js";

export class TimerAlarm {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/schedule") {
      const body = await request.json();
      await this.state.storage.put("timer", body);
      await this.state.storage.setAlarm(body.fireAt);
      return new Response(JSON.stringify({ scheduled: true, fireAt: body.fireAt }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/cancel") {
      await this.state.storage.deleteAlarm();
      await this.state.storage.deleteAll();
      return new Response(JSON.stringify({ cancelled: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  }

  async alarm() {
    const t = await this.state.storage.get("timer");
    if (!t) return;

    /* requireInteraction keeps a rest timer on screen until it is seen. A
       notification that auto-dismisses while the phone is in a pocket is the
       same as no notification. */
    const result = await sendToUser(this.env, t.userId, {
      title: t.title || "Timer done",
      body: t.body || "",
      tag: "timer-" + t.timerId,
      kind: "timer",
      id: t.timerId,
      url: "./",
      requireInteraction: true,
    });

    console.log("timer fired", t.timerId, JSON.stringify(result));

    await this.env.DB.prepare("UPDATE timers SET status = 'fired' WHERE id = ?")
      .bind(t.timerId).run().catch(() => {});

    /* The object has done its one job. Leaving state behind costs storage for
       nothing. */
    await this.state.storage.deleteAll();
  }
}
