import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import CommunityBanner from './components/CommunityBanner';
import RunBenchmarkPage from './pages/RunBenchmarkPage';
import ResultsPage from './pages/ResultsPage';

const App: React.FC = () => (
  <div className="community-plugin-layout">
    {/* [SHARED] Do not remove — all community plugins must display the CommunityBanner */}
    <CommunityBanner />
    <div className="community-plugin-content">
      <Routes>
        <Route path="/" element={<Navigate to="run" replace />} />
        <Route path="run/*" element={<RunBenchmarkPage />} />
        <Route path="results/*" element={<ResultsPage />} />
      </Routes>
    </div>
  </div>
);

export default App;
