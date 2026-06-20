'use client';

export default function StatsChart({ data }: {
  data: { date: string; empire_size?: number; military_power?: number; tech_power?: number; victory_rank?: number }[]
}) {
  if (!data || data.length < 2) return null;

  const maxMil = Math.max(...data.map(d => d.military_power || 0), 1);
  const barW = Math.max(2, Math.floor(600 / data.length));

  return (
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-6">
      <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">军力演变</h2>
      <div className="flex items-end gap-[2px] h-44 overflow-x-auto">
        {data.map((d, i) => {
          const h = Math.max(4, ((d.military_power || 0) / maxMil) * 160);
          return (
            <div key={i} className="flex-1 min-w-[6px] flex flex-col items-center group" title={`${d.date}: ${d.military_power?.toLocaleString() || 0}`}>
              <div className="text-[9px] text-gray-600 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{d.empire_size}</div>
              <div className="w-full rounded-t-[1px] bg-gradient-to-t from-cyan-700 to-cyan-400 hover:to-cyan-300 transition-colors" style={{ height: h }} />
              <div className="text-[9px] text-gray-700 mt-1 truncate w-full text-center">{i % 3 === 0 ? d.date?.slice(-4) : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
