import { Outlet } from 'react-router-dom';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import AudioVisualizer from '../AudioVisualizer';
import PremiumThemeOverlay from '../PremiumThemeOverlay';
import AsteroidsGame from '../AsteroidsGame';
import { useAsteroidsGameStore } from '../../stores/asteroidsGameStore';

export default function AppLayout() {
  const gameOpen = useAsteroidsGameStore(s => s.isOpen);
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-950 text-surface-200 relative">
      <PremiumThemeOverlay />
      <AudioVisualizer />
      <div className="flex flex-col flex-1 overflow-hidden relative z-[1]">
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
      {gameOpen && <AsteroidsGame />}
    </div>
  );
}
