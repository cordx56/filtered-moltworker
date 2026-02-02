import { useState } from 'react'
import AdminPage from './pages/AdminPage'
import { EgressRequestsPage } from './pages/EgressRequestsPage'
import './App.css'

type Tab = 'devices' | 'egress'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('devices')

  return (
    <div className="app">
      <header className="app-header">
        <img src="/logo-small.png" alt="Moltworker" className="header-logo" />
        <h1>Moltbot Admin</h1>
      </header>
      <nav className="app-nav">
        <button
          className={`nav-tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Devices
        </button>
        <button
          className={`nav-tab ${activeTab === 'egress' ? 'active' : ''}`}
          onClick={() => setActiveTab('egress')}
        >
          Egress Requests
        </button>
      </nav>
      <main className="app-main">
        {activeTab === 'devices' && <AdminPage />}
        {activeTab === 'egress' && <EgressRequestsPage />}
      </main>
    </div>
  )
}
