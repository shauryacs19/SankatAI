import React from 'react'
import { useNavigate } from 'react-router-dom'
import { AUTH_STATUS, useAuth } from '../../context/AuthContext.jsx'

export default function Header({ isOffline = true }) {
  const navigate = useNavigate()
  const { status, signOut } = useAuth()
  const authed = status === AUTH_STATUS.AUTHENTICATED

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {/* Inline styles for the professional pulse animation. 
        You can move this to your main CSS file later if you prefer.
      */}
      <style>{`
        @keyframes offline-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(196, 80, 75, 0.4);
            transform: scale(0.98);
            background-color: rgba(196, 80, 75, 0.05);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(196, 80, 75, 0);
            transform: scale(1.02);
            background-color: rgba(196, 80, 75, 0.15);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(196, 80, 75, 0);
            transform: scale(0.98);
            background-color: rgba(196, 80, 75, 0.05);
          }
        }

        .badge-offline {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #C4504B; /* Professional slight red */
          border: 1px solid rgba(196, 80, 75, 0.2);
          animation: offline-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          transition: all 0.3s ease;
        }

        .badge-icon {
          width: 14px;
          height: 14px;
        }
      `}</style>

      <nav className="top-navbar">
        {/* Left: Brand */}
        <div className="navbar-brand">
          <div className="navbar-brand-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.25 4.53l-6.72 3.36a2 2 0 00-1.03 1.57v4.61c0 4.15 2.62 7.89 6.46 9.2a2 2 0 001.28 0c3.84-1.31 6.46-5.05 6.46-9.2v-4.6a2 2 0 00-1.03-1.58l-6.72-3.36a2 2 0 00-1.78 0z" />
              <path fillRule="evenodd" d="M12 7.5a.75.75 0 01.75.75v3h3a.75.75 0 010 1.5h-3v3a.75.75 0 01-1.5 0v-3h-3a.75.75 0 010-1.5h3v-3A.75.75 0 0112 7.5z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="navbar-brand-text">
            <span className="navbar-title">Sankat.Ai</span>
            <span className="navbar-subtitle">Emergency Response</span>
          </div>
        </div>

        {/* Right: Pulsing Badge */}
        <div className="navbar-actions">
          {isOffline && (
            <div className="badge-offline">
              <svg className="badge-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              Offline & Secure
            </div>
          )}
          {authed && (
            <button type="button" className="navbar-link" onClick={handleSignOut}>
              Sign Out
            </button>
          )}
        </div>
      </nav>
    </>
  )
}