'use client';

export default function StatsChart({ data }: {
  data: { date: string; empire_size?: number; military_power?: number; tech_power?: number; victory_rank?: number }[]
}) {
  if (!data || data.length < 2) return null;

  const maxMil = Math.max(...data.map(d => d.military_power || 0), 1);
  return (
    <section className="panel p-5 sm:p-7" aria-label="军力演变图表">
      <div className="section-label">Fleet Power Telemetry</div>
      <div className="mt-2 flex items-end justify-between">
        <h2 className="text-lg font-semibold text-[#d4e4e2]">军力演变</h2>
        <span className="font-mono text-xs text-[#5f7c7e]">PEAK {maxMil.toLocaleString()}</span>
      </div>
      <div className="mt-6 flex h-48 items-end gap-[3px] overflow-x-auto border-b border-[#294d51] bg-[linear-gradient(rgba(70,126,129,0.12)_1px,transparent_1px)] bg-[length:100%_25%]">
        {data.map((d, i) => {
          const h = Math.max(4, ((d.military_power || 0) / maxMil) * 160);
          return (
            <div key={i} className="flex-1 min-w-[6px] flex flex-col items-center group" title={`${d.date}: ${d.military_power?.toLocaleString() || 0}`}>
              <div className="mb-1 text-[9px] text-[#789697] opacity-0 transition-opacity group-hover:opacity-100">{d.empire_size}</div>
              <div className="w-full bg-gradient-to-t from-[#1d6265] to-[#69d9ce] shadow-[0_0_8px_rgba(80,195,186,0.12)] transition-colors hover:to-[#b0fff5]" style={{ height: h }} />
              <div className="mt-1 w-full truncate text-center font-mono text-[9px] text-[#4e696b]">{i % 3 === 0 ? d.date?.slice(-4) : ''}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
