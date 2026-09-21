'use strict';
// Recordings (module:benchmarks, rule 3 — CI runs without a model): every call to a model or to the app's semantic
// search is keyed by what was asked and kept under eval/recorded/<name>.json. Live (`--live` or WATERFALL_LIVE=1)
// asks and records what the recording lacks; replay serves only the recording and throws `MissingRecording` for
// anything else — a suite without its recording fails, it does not silently shrink.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'recorded');
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

class MissingRecording extends Error { constructor(name, key, what) { super(`recording missing in eval/recorded/${name}.json for ${what || key} — run once with --live (WATERFALL_LIVE=1)`); this.name = 'MissingRecording'; this.key = key; } }

class Recording {
    constructor(name, { live = process.env.WATERFALL_LIVE === '1' } = {}) {
        this.name = name; this.file = path.join(DIR, name + '.json'); this.live = live; this.dirty = false;
        try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = { name, entries: {} }; }
        if (!this.data.entries) this.data.entries = {};
    }
    key(parts) { return sha(JSON.stringify(parts)); }
    has(parts) { return this.key(parts) in this.data.entries; }
    // the recorded value for `parts`, else `fn()` when live (recorded with its meta), else MissingRecording
    async get(parts, fn, { what = '', meta = {} } = {}) {
        const k = this.key(parts);
        const hit = this.data.entries[k];
        if (hit) return hit.value;
        if (!this.live) throw new MissingRecording(this.name, k, what);
        const value = await fn();
        this.data.entries[k] = { value, at: new Date().toISOString(), what: what.slice(0, 160), ...meta };
        this.dirty = true; this.save();
        return value;
    }
    save() { if (!this.dirty) return; fs.mkdirSync(DIR, { recursive: true }); const tmp = `${this.file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1)); fs.renameSync(tmp, this.file); this.dirty = false; }
    size() { return Object.keys(this.data.entries).length; }
}

module.exports = { Recording, MissingRecording, DIR };
