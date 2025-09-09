import React from 'react'
import { PointCloudViewer } from './components/PointCloudViewer'
import './App.css'

function App() {
  return (
    <div className="app">
      <main className="app-main">
        <PointCloudViewer className="main-viewer" />
      </main>
    </div>
  )
}

export default App
