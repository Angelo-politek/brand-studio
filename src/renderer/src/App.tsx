import { useEffect, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useBrandStore } from './stores/brandStore'
import AppLayout from './layouts/AppLayout'
import StartupBrands from './pages/StartupBrands'
import Dashboard from './pages/Dashboard'
import Brands from './pages/Brands'
import Templates from './pages/Templates'
import Projects from './pages/Projects'
import Planner from './pages/Planner'
import Assets from './pages/Assets'
import VideoProjects from './pages/VideoProjects'
import Exports from './pages/Exports'
import Settings from './pages/Settings'
import Editor from './pages/Editor'
import VideoEditor from './pages/VideoEditor'
import FeedbackHosts from './components/feedback/FeedbackHosts'
import ErrorBoundary from './components/ErrorBoundary'
import { resetPythonInfoCache } from './lib/python'

function RequireBrand({ children }: { children: ReactNode }): JSX.Element {
  const currentBrandId = useBrandStore((s) => s.currentBrandId)
  if (!currentBrandId) return <Navigate to="/" replace />
  return <>{children}</>
}

function App(): JSX.Element {
  const load = useBrandStore((s) => s.load)
  const loaded = useBrandStore((s) => s.loaded)

  useEffect(() => {
    void load()
  }, [load])

  // Keep the sidecar client cache fresh: a restart issues a new port + token.
  useEffect(() => {
    return window.api.app.onPythonStatus(() => resetPythonInfoCache())
  }, [])

  if (!loaded) {
    return (
      <div className="h-full w-full grid place-items-center text-ink-faint text-sm">Loading…</div>
    )
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <FeedbackHosts />
        <Routes>
          <Route path="/" element={<StartupBrands />} />
          <Route
            path="/app"
            element={
              <RequireBrand>
                <AppLayout />
              </RequireBrand>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="brands" element={<Brands />} />
            <Route path="templates" element={<Templates />} />
            <Route path="projects" element={<Projects />} />
            <Route path="planner" element={<Planner />} />
            <Route path="assets" element={<Assets />} />
            <Route path="videos" element={<VideoProjects />} />
            <Route path="exports" element={<Exports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route
            path="/app/editor/:projectId"
            element={
              <RequireBrand>
                <Editor />
              </RequireBrand>
            }
          />
          <Route
            path="/app/video/:videoId"
            element={
              <RequireBrand>
                <VideoEditor />
              </RequireBrand>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
