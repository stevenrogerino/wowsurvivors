/* The Nightly board: everyone's best score for the day, kept on Supabase.
 *
 * The game posts a finished Nightly (once the player has given a name) and
 * reads the day's top twenty back. The key below is Supabase's publishable
 * key - it is meant to sit in a web page. What it is allowed to do is set on
 * the database side (supabase/nightly-board.sql): read the board, and post
 * through submit_nightly(), which turns away scores no night could be worth
 * and keeps each player's best.
 *
 * Nothing here is needed to play. Offline, in a sandbox that forbids the
 * request, or under a test harness, the board simply says it cannot be
 * reached and the Nightly plays exactly as before. */
'use strict';
(function (WS) {

  const URL = 'https://rqnsptipbrxbgovxribg.supabase.co';
  const KEY = 'sb_publishable__4GB6GyAffLUGuvHlIy-TQ_zUGMsu5t';
  const TOP = 20;
  const FRESH = 60 * 1000;

  const Board = {};
  const cache = new Map();

  /** False where the board must not be touched: no fetch, or a test
   *  harness driving the page (whose runs are not anyone's score). */
  Board.available = function () {
    return typeof fetch === 'function' && !(typeof navigator !== 'undefined' && navigator.webdriver);
  };

  /** This browser's place on the board: a private id, the name it posts
   *  under, and the rank it last came back with. */
  Board.me = function () {
    const db = WS.Save.db;
    const b = db.board;
    if (!b.id) {
      b.id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => WS.floor(Math.random() * 16).toString(16));
      WS.Save.save();
    }
    return b;
  };

  Board.cleanName = function (s) {
    return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20);
  };

  Board.setName = function (name) {
    const n = Board.cleanName(name);
    if (!n) return false;
    Board.me().name = n;
    WS.Save.save();
    return true;
  };

  function headers(json) {
    const h = { apikey: KEY, Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async function call(path, init) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : 0;
    try {
      const res = await fetch(URL + path, Object.assign({ signal: ctl ? ctl.signal : undefined }, init));
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(body && body.message ? body.message : 'HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return body;
    } finally { if (timer) clearTimeout(timer); }
  }

  /** The day's top twenty, best first. Cached for a minute. */
  Board.top = async function (day, limit) {
    if (!Board.available()) throw new Error('unavailable');
    const n = limit || TOP;
    const k = day + ':' + n;
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < FRESH) return hit.rows;
    const rows = await call('/rest/v1/nightly_scores?select=name,score,time_held,kills,level,map,character,outcome,tries'
      + `&day=eq.${encodeURIComponent(day)}&order=score.desc,updated_at.asc&limit=${n}`, { headers: headers(false) });
    cache.set(k, { at: Date.now(), rows: Array.isArray(rows) ? rows : [] });
    return cache.get(k).rows;
  };

  /** Posts a finished Nightly. Resolves to { rank, best, players }. */
  Board.submit = async function (entry, code) {
    if (!Board.available()) throw new Error('unavailable');
    const me = Board.me();
    if (!me.name) throw new Error('no name');
    const out = await call('/rest/v1/rpc/submit_nightly', {
      method: 'POST', headers: headers(true),
      body: JSON.stringify({
        p_day: entry.nightly, p_player: me.id, p_name: me.name, p_score: entry.score,
        p_time: entry.time, p_kills: entry.kills, p_level: entry.level || 1,
        p_map: entry.map, p_character: entry.char, p_outcome: entry.outcome, p_code: code || null,
      }),
    });
    for (const k of [...cache.keys()]) if (k.startsWith(entry.nightly + ':')) cache.delete(k);
    if (out && Number.isFinite(out.rank)) {
      me.posted = { day: entry.nightly, rank: out.rank, best: out.best, players: out.players };
      WS.Save.save();
    }
    return out;
  };

  /** The rank this browser last posted to `day`, or null. */
  Board.rankOn = function (day) {
    const p = WS.Save.db.board.posted;
    return p && p.day === day ? p : null;
  };

  /** Yesterday's key, for the winners of the night just gone. */
  Board.yesterday = function () {
    return WS.Runs.dayKey(new Date(Date.now() - 86400000));
  };

  WS.Board = Board;
})(window.WS);
