import { Outlet } from 'react-router-dom';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import AudioVisualizer from '../AudioVisualizer';

export default function AppLayout() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-950 text-surface-200 relative">
      <AudioVisualizer />
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
