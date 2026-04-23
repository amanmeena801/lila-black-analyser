import { KillFeedPanel } from '@/components/killfeed/KillFeedPanel';
import { FilterSidebar } from '@/components/layout/FilterSidebar';
import { StatsPanel } from '@/components/layout/StatsPanel';
import { Topbar } from '@/components/layout/Topbar';
import { MapCanvas } from '@/components/map/MapCanvas';
import { TimeSlider } from '@/components/timeline/TimeSlider';
import { useManifest } from '@/hooks/useManifest';
import { useFilterStore } from '@/state/filterStore';

export default function App() {
  const { manifest, loading, error } = useManifest();
  const view = useFilterStore((s) => s.view);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        Loading manifest…
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className="flex h-full items-center justify-center text-rose-400">
        Failed to load manifest: {error?.message ?? 'unknown error'}
      </div>
    );
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] bg-surface-900">
      <Topbar />
      <div className="grid min-h-0 grid-cols-[20rem_1fr_20rem]">
        <FilterSidebar manifest={manifest} />
        <MapCanvas />
        {view === 'killfeed' ? <KillFeedPanel /> : <StatsPanel />}
      </div>
      <TimeSlider />
    </div>
  );
}
