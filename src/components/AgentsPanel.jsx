import React, { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// try to register datalabels plugin if available globally or via dynamic import
async function ensureDataLabelsRegistered(){
  if(typeof Chart === 'undefined') return;
  // if plugin already registered, skip
  if(Chart._registered && Chart._registered.length && Chart._registered.find(p=>p.id && p.id.includes('datalabels'))) return;
  // global (CDN) attach point
  if(window && window.chartjsPluginDatalabels){
    try{ Chart.register(window.chartjsPluginDatalabels); return; }catch(e){/*ignore*/}
  }
  // try common global names
  if(window && window.ChartDataLabels){ try{ Chart.register(window.ChartDataLabels); return }catch(e){} }
  // attempt dynamic import (works in dev if package installed)
  try{
    // avoid Vite static analysis if the package is not present in node_modules
    const pluginName = 'chartjs-plugin-datalabels'
    const mod = await import(/* @vite-ignore */ pluginName)
    if(mod && mod.default) Chart.register(mod.default);
  }catch(e){ /* not available, continue without labels */ }
}

export default function AgentsPanel({dataset=[]}){
  function formatMinutesToHMS(mins){
    if(mins == null || mins === '-' || isNaN(mins)) return '-'
    const totalSec = Math.round(Number(mins) * 60)
    const hh = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    const ss = totalSec % 60
    const pad = v => String(v).padStart(2,'0')
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
  }
  
    // aggregate per agent: total, closed, avg duration, slaIn/slaOut (counts over closed tickets)
    const agg = {}
    dataset.forEach(d => {
      const a = (d.traiteur && d.traiteur.trim()) ? d.traiteur.toString() : 'Inconnu'
      if(!agg[a]) agg[a] = { total:0, closed:0, durations: [], slaIn:0, slaOut:0 }
      agg[a].total += 1
      // prefer duration_minutes (parsed HH:MM:SS) else fallback to numeric duration
      if(d.duration_minutes != null) agg[a].durations.push(d.duration_minutes)
      else if(d.duration) agg[a].durations.push(d.duration)

      // detect closed and update closed count and SLA counts only for closed tickets
      const isClosed = d.date_cloture && d.date_cloture.toString().trim() !== ''
      if(isClosed) {
        agg[a].closed += 1
        const orig = d._orig || {}
        // determine SLA in/out for closed tickets
        let isIn = false
        if(d.sla_in === true) isIn = true
        else if(d.sla_out === true) isIn = false
        else if(typeof d.in_sla === 'boolean') isIn = d.in_sla
        else if(d.SLA && d.duration) isIn = Number(d.duration) <= Number(d.SLA)
        else if(d.dans_delai && /in|oui|true|1/i.test(d.dans_delai.toString())) isIn = true
        else {
          const inSla = (orig['Dans le délai'] === true) || (orig['Dans le délai'] || '').toString().toLowerCase().includes('oui')
          isIn = !!inSla
        }
        if(isIn) agg[a].slaIn += 1; else agg[a].slaOut += 1
      }
    })

  const agents = Object.keys(agg).sort((x,y)=> agg[y].total - agg[x].total)
  const chartRef = useRef(null)
  const chartInst = useRef(null)
  // removed search/sort/pagination per user request

  useEffect(()=>{
    let cancelled = false
    const setup = async ()=>{
      await ensureDataLabelsRegistered()
      if(cancelled) return
      const ctx = chartRef.current.getContext('2d')
      const labels = agents
      const dataClosed = labels.map(l => agg[l].closed)
      if(chartInst.current) chartInst.current.destroy()
      // generate HSL palette per bar
      const palette = (n) => {
        const out = [];
        for(let i=0;i<n;i++){
          const h = Math.round((i * 137.508) % 360);
          out.push(`hsl(${h} 70% 60%)`)
        }
        return out
      }
      const colors = palette(labels.length || 1)
      // disable chartjs-plugin-datalabels display (we draw our own centered labels)
      const chartOptions = {
        responsive:true,
        maintainAspectRatio:false,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
        plugins: { datalabels: { display: false } }
      }

      // custom plugin to draw centered black labels inside bars; if a bar is too short,
      // we draw the label just above the bar so it stays legible.
      const centeredBarLabels = {
        id: 'centeredBarLabels',
        afterDatasetsDraw(chart){
          const {ctx} = chart;
          chart.data.datasets.forEach((dataset, dsIndex)=>{
            const meta = chart.getDatasetMeta(dsIndex);
            if(!meta || !meta.data) return;
            meta.data.forEach((bar, index)=>{
              const val = dataset.data[index];
              if(val === null || val === undefined) return;
              const base = bar.base !== undefined ? bar.base : (chart.scales && chart.scales.y ? chart.scales.y.getPixelForValue(0) : 0);
              const barTop = bar.y;
              const barBottom = base;
              const height = Math.abs(barBottom - barTop);
              const centerY = (barTop + barBottom) / 2;
              const centerX = bar.x !== undefined ? bar.x : (bar.left + (bar.right - bar.left)/2 || 0);
              ctx.save();
              ctx.fillStyle = '#000';
              ctx.font = '700 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              // if bar too small to contain the label, draw label slightly above the bar
              if(height < 18){
                const y = Math.min(barTop, barBottom) - 6; // above the bar
                ctx.fillText(String(val), centerX, y);
              } else {
                ctx.fillText(String(val), centerX, centerY);
              }
              ctx.restore();
            })
          })
        }
      }

      chartInst.current = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label:'Tickets clôturés', data: dataClosed, backgroundColor: colors }] },
        options: chartOptions,
        plugins: [centeredBarLabels]
      })
    }
    setup()
    return ()=>{ if(chartInst.current) chartInst.current.destroy() }
  },[dataset, agents])

  // show all agents (no search/filter/pagination)
  const pageItems = agents

  return (
    <section className="agents-section my-6 bg-white rounded shadow p-4">
      <h2 className="text-lg font-semibold mb-3">Performance individuelle des agents</h2>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm">Agents: <strong>{agents.length}</strong> — Tickets: <strong>{dataset.length}</strong></div>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-sm">% OUT (moy): <strong>{
              (()=>{
                const totals = Object.values(agg).reduce((s,a)=>{ s.closed += (a.closed||0); s.out += (a.slaOut||0); return s }, {closed:0, out:0});
                return totals.closed ? Math.round((totals.out / totals.closed) * 100) : 0
              })()
            }%</strong></div>
        </div>
      </div>
      {/* search/sort inputs removed */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2">Agent</th>
                <th className="p-2">Tickets (clôturés / total)</th>
                <th className="p-2">Durée moyenne</th>
           <th className="p-2">% SLA OUT</th>
           <th className="p-2">% SLA IN</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(a => {
                const item = agg[a]
                const avg = item.durations.length ? (item.durations.reduce((s,x)=>s+x,0)/item.durations.length) : null
                const pctIn = item.total ? Math.round((item.in / item.total) * 100) : 0
                const pctOut = item.total ? Math.round((item.out / item.total) * 100) : 0
                return (
                  <tr key={a} className="border-t">
                    <td className="p-2">{a}</td>
                    <td className="p-2">{item.closed}</td>
                    <td className="p-2">{avg != null ? formatMinutesToHMS(avg) : '-'}</td>
                    {
                      (()=>{
                        const pctIn = item.closed ? Math.round((item.slaIn / item.closed) * 100) : 0
                        const pctOut = item.closed ? Math.round((item.slaOut / item.closed) * 100) : 0
                        return (
                          <>
                            <td className="p-2"><span className={"px-2 py-0.5 rounded text-sm font-medium " + (pctOut>0 ? 'bg-rose-50 text-rose-600' : 'text-slate-500')}>{item.slaOut} ({pctOut}%)</span></td>
                            <td className="p-2"><span className="px-2 py-0.5 rounded text-sm font-medium bg-emerald-50 text-emerald-600">{item.slaIn} ({pctIn}%)</span></td>
                          </>
                        )
                      })()
                    }
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="lg:col-span-2">
          <div style={{height:220}}>
            <canvas ref={chartRef}></canvas>
          </div>
        </div>
      </div>
      {/* pagination removed */}
    </section>
  )
}
