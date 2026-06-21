import { Outlet } from 'react-router-dom'
import Sidebar from '@renderer/components/Sidebar'

export default function AppLayout(): JSX.Element {
  return (
    <div className="h-full w-full flex">
      <Sidebar />
      <main className="flex-1 h-full overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
