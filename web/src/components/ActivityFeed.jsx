import React from 'react';
import { useStore } from '../store.js';

const LEVEL_COLOR = {
  system: '#0a84ff', track: '#ff9f0a', info: '#34c759', alert: '#ff453a',
};

export default function ActivityFeed() {
  const feed = useStore(s => s.feed);

  return (
    <div className="feed">
      <div className="fh">
        <span className="t">Activity Feed</span>
        <span className="live"><span className="d" /> LIVE</span>
      </div>
      <div className="stream">
        {feed.map((e, i) => (
          <div className="evt" key={e.ts + i}>
            <span className="ts">{e.ts.slice(11, 19)}</span>
            <span className="bar" style={{ background: LEVEL_COLOR[e.level] || '#6e6e73' }} />
            <span className="msg">
              {e.source && <b>{e.source} </b>}{e.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
