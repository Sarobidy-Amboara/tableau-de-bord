import React from 'react'

export default function KPIs({dataset=[]}){
  const total = dataset.length
  const closed = dataset.filter(d=>d.date_cloture).length
  const open = total - closed
  // prefer derived flags sla_in / sla_out from importer when available
  const hasDerived = dataset.some(d => d.sla_in !== undefined || d.sla_out !== undefined)
  const inSla = hasDerived ? dataset.filter(d => d.sla_in === true).length : dataset.filter(d=> d._orig && (d._orig['Dans le délai'] === true || (d._orig['Dans le délai'] || '').toString().toLowerCase().includes('oui') )).length
  const outSla = hasDerived ? dataset.filter(d => d.sla_out === true).length : total - inSla

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div className="bg-white p-4 rounded shadow"> 
        <div className="text-sm text-slate-500">Total tickets</div>
          <div className="text-2xl font-semibold mt-2">{total}</div>
      </div>

      <div className="bg-white p-4 rounded shadow flex items-center gap-3">
        <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{background:'linear-gradient(90deg,#f59e0b,#fb923c)'}} aria-hidden>
          {/* Bell icon for open tickets */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </div>
        <div>
          <div className="text-sm text-slate-500">Ouverts</div>
          <div className="text-lg font-medium mt-1">{open} <span className="text-sm text-slate-400">({total? Math.round((open/total)*100):0}%)</span></div>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow flex items-center gap-3">
        <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{background:'linear-gradient(90deg,#10b981,#34d399)'}}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd"/></svg>
        </div>
        <div>
          <div className="text-sm text-slate-500">Clôturés</div>
          <div className="text-lg font-medium mt-1">{closed} <span className="text-sm text-slate-400">({total? Math.round((closed/total)*100):0}%)</span></div>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">Dans le délai (IN)</div>
          <div className="text-lg font-medium mt-2 text-emerald-600">{inSla} <span className="text-sm text-slate-400">({total? Math.round((inSla/total)*100):0}%)</span></div>
        </div>
        <div className="w-10 h-10 rounded-md flex items-center justify-center bg-emerald-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">Retard (OUT)</div>
          <div className="text-lg font-medium mt-2 text-rose-600">{outSla} <span className="text-sm text-slate-400">({total? Math.round((outSla/total)*100):0}%)</span></div>
        </div>
        <div className="w-10 h-10 rounded-md flex items-center justify-center bg-rose-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
      </div>
    </section>
  )
}
