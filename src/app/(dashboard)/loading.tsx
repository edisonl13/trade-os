export default function DashboardLoading() {
  return (
    <div className="page-container" aria-label="Loading">
      <div className="h-8 w-72 animate-pulse rounded-md bg-white/[0.06]" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-white/[0.035]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.7fr)]">
        <div className="panel-surface h-[420px] animate-pulse" />
        <div className="panel-surface h-[420px] animate-pulse" />
      </div>
      <div className="panel-surface h-[360px] animate-pulse" />
    </div>
  );
}
