import React from 'react'
import { PointCloudViewer } from './components/PointCloudViewer'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Point Cloud Web Tools</h1>
        <p>Interactive 3D point cloud visualization and analysis</p>
      </header>
      
      <main className="app-main">
        <PointCloudViewer className="main-viewer" />
      </main>
      
      <footer className="app-footer">
        <p>Built with React, TypeScript, and Babylon.js</p>
      </footer>
    </div>
  )
}

export default App
