import React, { useEffect } from 'react';
import { useStore } from './store.js';
import { startDataSource } from './lib/dataSource.js';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import GlobeView from './components/GlobeView.jsx';
import DetailPanel from './components/DetailPanel.jsx';

export default function App() {
  // Boot the data source once (sim in-browser, or live WS if VITE_WS_URL set).
  useEffect(() => startDataSource(useStore), []);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Sidebar />
        <GlobeView />
        <DetailPanel />
      </div>
    </div>
  );
}
