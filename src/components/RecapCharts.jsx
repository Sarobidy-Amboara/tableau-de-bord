import React, { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

async function ensureDataLabelsRegistered(){
  if(typeof Chart === 'undefined') return;
  if(window && window.chartjsPluginDatalabels){ try{ Chart.register(window.chartjsPluginDatalabels); return }catch(e){} }
  if(window && window.ChartDataLabels){ try{ Chart.register(window.ChartDataLabels); return }catch(e){} }
  try{ const mod = await import(/* @vite-ignore */ 'chartjs-plugin-datalabels'); if(mod && mod.default) Chart.register(mod.default); }catch(e){}
}

function isoWeekKey(dateStr){
  if(!dateStr) return null
  const dt = new Date(dateStr)
  if(isNaN(dt)) return null
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(),0,4)
  const wn = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `S${wn}`
}

export default function RecapCharts({dataset=[] , type='acte', bucket='all', title}){
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const containerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(()=>{
    let cancelled = false
    const setup = async ()=>{
      await ensureDataLabelsRegistered()
      if(cancelled) return
      const weeksSet = new Set()
      dataset.forEach(d=>{ if(d.date) weeksSet.add(isoWeekKey(d.date)) })
      const weeks = Array.from(weeksSet).filter(Boolean).sort((a,b)=> Number(a.replace(/^S/,'')) - Number(b.replace(/^S/,'')))
      const lastWeeks = weeks.slice(-4)

      // aggregate metrics per week
      const backlogAvg = {}
      const pctIn = {} // percentage closed in cycle
      const closedCounts = {}

      dataset.forEach(d=>{
        const wk = isoWeekKey(d.date || d.date_cloture || d._orig?.date || d._orig?.DATE)
        if(!wk || !lastWeeks.includes(wk)) return
        // determine if this row is of the requested type
        const v = (d._orig && d._orig['qualif_1']) || d.qualif_1 || ''
        const isActe = /requêtes|requete|spanco/i.test(String(v))
        const isRecl = /réclam|reclam/i.test(String(v))
  if(type === 'acte' && !isActe) return
  if(type === 'recl' && !isRecl) return

  // bucket filter: are we only counting bloquantes or non bloquantes?
  const catRaw = (d._orig && (d._orig['categorie']||d._orig['CATEGORIE'])) || d.categorie || ''
  const catNorm = String(catRaw||'').toLowerCase()
  const isBloqCat = /b(o|l)qu|bloquante/i.test(String(catRaw)) && !catNorm.includes('non')
  if(bucket === 'bloq' && !isBloqCat) return
  if(bucket === 'non' && isBloqCat) return

        const isClosed = (d.date_cloture && String(d.date_cloture).trim()!=='') || (d.state && /term|clotur|closed|clos|fermé|ferme/i.test(String(d.state)))
        if(!isClosed) return

        closedCounts[wk] = (closedCounts[wk]||0) + 1
        // prefer precomputed backlog_ratio_raw (float) for charting sensitivity,
        // fallback to backlog_excess (float), then legacy backlog_ratio (int), then compute dur/sla
        const brRaw = d.backlog_ratio_raw != null ? Number(d.backlog_ratio_raw) : null
        const be = d.backlog_excess != null ? Number(d.backlog_excess) : null
        const brLegacy = d.backlog_ratio != null ? Number(d.backlog_ratio) : null
        let backlogValue = null
        if(brRaw != null && isFinite(brRaw)) backlogValue = brRaw
        else if(be != null && isFinite(be)) backlogValue = be
        else if(brLegacy != null && isFinite(brLegacy)) backlogValue = brLegacy
        else {
          const dur = d.duration_minutes != null ? Number(d.duration_minutes) : (d.duration != null ? Number(d.duration) : null)
          const sla = d.sla_minutes != null ? Number(d.sla_minutes) : (d.sla_raw != null ? Number(d.sla_raw) : null)
          if(dur!=null && sla!=null && sla>0){ backlogValue = dur / sla }
        }
        if(backlogValue != null) backlogAvg[wk] = (backlogAvg[wk]||[]).concat(Number(backlogValue))
        // in/out
        let isIn = null
        if(typeof d.sla_in === 'boolean') isIn = d.sla_in
        else if(typeof d.sla_out === 'boolean') isIn = !d.sla_out
        else if(d.sla_minutes!=null && d.duration_minutes!=null) isIn = Number(d.duration_minutes) <= Number(d.sla_minutes)
        else if(d.dans_delai) isIn = /in|oui|true|1/i.test(String(d.dans_delai))
        if(isIn) pctIn[wk] = (pctIn[wk]||0) + 1
      })

  const labels = lastWeeks
      const backlogData = labels.map(w=>{
        const arr = backlogAvg[w] || []
        if(arr.length===0) return 0
        // average backlog per week
        return Math.round((arr.reduce((s,x)=>s+x,0)/arr.length) * 100) / 100
      })
      const closedCountsArr = labels.map(w=> closedCounts[w] || 0)
      const pctInArr = labels.map((w,i)=>{
        const closed = closedCounts[w]||0
        const inCount = pctIn[w]||0
        return closed? Math.round((inCount/closed) * 100) : 0
      })

      // objective lines: backlog objective flat at 1, on-time objective flat at 95%
      const objBacklog = labels.map(()=> 1)
      const objOnTime = labels.map(()=> 95)

  if(chartRef.current) chartRef.current.destroy()
      const ctx = canvasRef.current.getContext('2d')

      // show markers and datalabels if plugin available
      const hasDataLabels = !!(window && (window.chartjsPluginDatalabels || window.ChartDataLabels))

      // fallback plugin to draw labels if chartjs-plugin-datalabels isn't available
      const fallbackDataLabels = {
        id: 'fallbackDataLabels',
        afterDatasetsDraw(chart){
          const {ctx} = chart
          chart.data.datasets.forEach((dataset, dsIndex)=>{
            const meta = chart.getDatasetMeta(dsIndex)
            if(!meta || !meta.data) return
            meta.data.forEach((point, index)=>{
              let val = dataset.data[index]
              if(val === null || val === undefined) return
              const x = point.x
              const y = point.y
              ctx.save()
              ctx.font = '600 11px sans-serif'
              ctx.fillStyle = '#111'
              // default: draw right for backlog series
              let dx = 8, dy = 0
              // adjust per series label: backlog -> right; objectif backlog -> top; % -> right; objectif on time -> top
              const lab = (dataset.label||'').toLowerCase()
              if(lab.includes('backlog') && !lab.includes('objectif')){ dx = 8; dy = 0; ctx.textAlign = 'left'; val = Number(val).toFixed(2) }
              else if(lab.includes('objectif backlog')){ dx = 0; dy = -14; ctx.textAlign = 'center'; val = Number(val).toFixed(2) }
              else if(lab.includes('% clôtur') || lab.includes('% clotur') || lab.includes('% cloturées') ){ dx = 8; dy = 0; ctx.textAlign = 'left'; val = String(val) + '%' }
              else if(lab.includes('objectif on time') || lab.includes('on time')){ dx = 0; dy = -14; ctx.textAlign = 'center'; val = String(val) + '%' }
              ctx.textBaseline = 'middle'
              ctx.fillText(String(val), x + dx, y + dy)
              ctx.restore()
            })
          })
        }
      }

      // compute dynamic max for backlog axis (round up to nearest 0.5, min 2)
      const maxBacklogObserved = Math.max(1, ...Object.values(backlogAvg).flat().map(v=>Number(v)||0))
      const suggestedMax = Math.max(2, Math.ceil((maxBacklogObserved + 0.0001) * 2) / 2)

      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Backlog (avg)', data: backlogData, borderColor: '#1f77b4', backgroundColor: 'rgba(31,119,180,0.08)', yAxisID: 'y', tension:0.2, pointRadius:4, pointBackgroundColor:'#1f77b4', order: 1,
              datalabels: hasDataLabels ? { anchor: 'end', align: 'right', offset: 6, formatter: v=> v } : undefined
            },
            { label: 'Objectif Backlog', data: objBacklog, borderColor: '#16a34a', borderDash: [6,4], pointRadius:0, yAxisID: 'y', order: 1,
              datalabels: hasDataLabels ? { anchor: 'center', align: 'top', offset: 6, formatter: v=> v } : undefined
            },
            { label: '% clôturées dans le cycle', data: pctInArr, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)', yAxisID: 'y2', tension:0.2, pointRadius:4, pointBackgroundColor:'#f97316', order: 2,
              datalabels: hasDataLabels ? { anchor: 'end', align: 'right', offset: 6, formatter: v=> v + '%' } : undefined
            },
            { label: 'Objectif On time', data: objOnTime, borderColor: '#000', borderDash: [6,4], pointRadius:0, yAxisID: 'y2', order: 2,
              datalabels: hasDataLabels ? { anchor: 'center', align: 'top', offset: 6, formatter: v=> v + '%' } : undefined
            }
          ]
        },
        options: {
          responsive:true,
          maintainAspectRatio:false,
          // add left/right padding so labels placed to the sides are not clipped
          layout: { padding: { top: 8, bottom: 18, left: 24, right: 24 } },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 18, boxHeight: 10, padding: 12 } },
            datalabels: hasDataLabels ? { color: '#000' } : undefined
          },
          scales: {
            y: { type:'linear', position:'left', beginAtZero:true, title:{display:true,text:'Backlog (ratio)'},
                 ticks: { stepSize: 0.5, callback: v => String(v) },
                 min: 0, max: suggestedMax
            },
            y2: { type:'linear', position:'right', beginAtZero:true, min:0, max:100, grid:{drawOnChartArea:false}, title:{display:true,text:"% in cycle"} }
          }
        },
        plugins: hasDataLabels ? [] : [fallbackDataLabels]
      })
    }
    setup()
    return ()=>{ cancelled = true; if(chartRef.current) chartRef.current.destroy() }
  },[dataset, type])

  // toggle fullscreen: try Fullscreen API, fallback to local CSS fullscreen
  async function toggleFullscreen(){
    const el = containerRef.current
    if(!el) return
    // if already in browser fullscreen, exit
    if(document.fullscreenElement){
      try{ await document.exitFullscreen() }catch(e){}
      setIsFullscreen(false)
      setTimeout(()=> chartRef.current && chartRef.current.resize(), 200)
      return
    }
    // try requestFullscreen
    if(el.requestFullscreen){
      try{ await el.requestFullscreen(); setIsFullscreen(true); setTimeout(()=> chartRef.current && chartRef.current.resize(), 300); return }catch(e){}
    }
    // fallback: use CSS fullscreen mode
    setIsFullscreen(true)
    setTimeout(()=> chartRef.current && chartRef.current.resize(), 200)
  }

  // if user exits native fullscreen, update state
  useEffect(()=>{
    function onFsChange(){ if(!document.fullscreenElement){ setIsFullscreen(false); setTimeout(()=> chartRef.current && chartRef.current.resize(), 200) } }
    document.addEventListener('fullscreenchange', onFsChange)
    return ()=> document.removeEventListener('fullscreenchange', onFsChange)
  },[])

  return (
    <div ref={containerRef} style={{height:isFullscreen? '100vh' : 460, marginTop:12, padding:8, border:'1px solid #eee', borderRadius:6, background:'#fff', position:'relative', zIndex: isFullscreen? 9999: 'auto'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
        { title ? <div style={{fontWeight:700,color:'#c2410c'}}>{title}</div> : <div /> }
        <div>
          <button onClick={toggleFullscreen} style={{padding:'6px 10px', fontSize:12, borderRadius:4, border:'1px solid #ddd', background:'#fff', cursor:'pointer'}}> {isFullscreen? 'Exit' : 'Fullscreen'}</button>
        </div>
      </div>
      <div style={{height:isFullscreen? 'calc(100vh - 70px)' : 420}}>
        <canvas ref={canvasRef} style={{width:'100%',height:'100%'}}></canvas>
      </div>
    </div>
  )
}
