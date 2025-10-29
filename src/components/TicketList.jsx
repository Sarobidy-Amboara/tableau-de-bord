import React, { useMemo, useMemo as _useMemo, useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

function slaPercent(t){
  const dur = t?.duration_minutes ?? t?.duration ?? null
  const sla = t?.sla_minutes ?? null
  if(dur != null && sla != null && Number(sla) > 0){
    const p = Math.round((Number(dur) / Number(sla)) * 100)
    return Math.max(0, Math.min(100, p))
  }
  // fallback using explicit flags
  if(t?.sla_out === true) return 100
  if(t?.sla_in === true) return 100 // atteint le SLA (100%)
  return null
}

function statusLabel(t){
  const isClosed = t?.date_cloture && String(t.date_cloture).trim() !== ''
  return isClosed ? 'Clôturé' : 'Ouvert'
}

function fmtMinutesHMS(min){
  if(min == null || isNaN(min)) return '-'
  const totalSec = Math.max(0, Math.round(Number(min) * 60))
  const hh = Math.floor(totalSec/3600)
  const mm = Math.floor((totalSec%3600)/60)
  const ss = totalSec%60
  const pad = v=> String(v).padStart(2,'0')
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

function fmtDateFR(value){
  if(!value) return '-'
  // Already in dd/mm/yyyy
  if(typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) return value
  // If ISO yyyy-mm-dd or Date-like
  if(typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})/.test(value)){
    const [, y, m, d] = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return `${d}/${m}/${y}`
  }
  try{
    const d = new Date(value)
    if(!isNaN(d)){
      const pad = (v)=> String(v).padStart(2,'0')
      return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`
    }
  }catch(_){/* noop */}
  return String(value)
}

function fmtDateTimeFR(value){
  if(!value) return '-'
  // Already dd/mm/yyyy hh:mm:ss
  if(typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(value.trim())) return value
  // ISO 'YYYY-MM-DDTHH:mm:ss'
  if(typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/.test(value)){
    const [, y,m,d,hh,mm,ss] = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
    return `${d}/${m}/${y} ${hh}:${mm}:${ss}`
  }
  // Fallback: try Date()
  try{
    const d = new Date(value)
    if(!isNaN(d)){
      const pad = v=> String(v).padStart(2,'0')
      return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }
  }catch(_){/* noop */}
  // As last resort, try date-only
  const dateOnly = fmtDateFR(value)
  return dateOnly === '-' ? '-' : `${dateOnly} 00:00:00`
}

export default function TicketList({tickets=[], titleExtra, initialFilters}){
  // New single filter: SLA attained range
  // Options: 'all' | '0-50' | '51-80' | '81-95' | '96-100'
  const [slaRange, setSlaRange] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'open' | 'closed'
  const [slaState, setSlaState] = useState('all') // 'all' | 'in' | 'out'
  const [sortKey, setSortKey] = useState('') // '' | 'sla' | 'status' | 'ref' | 'agent'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(()=>{ setPage(1) }, [slaRange, statusFilter, slaState, sortKey, sortDir, tickets])

  // Initialize filters from opener defaults (e.g., KPI clicked)
  useEffect(()=>{
    if(initialFilters?.status){
      setStatusFilter(initialFilters.status)
    }
    if(initialFilters?.slaState){
      setSlaState(initialFilters.slaState)
    }
    if(initialFilters?.defaultSlaRange){
      setSlaRange(initialFilters.defaultSlaRange)
    }
  }, [initialFilters])

  function toggleSort(key){
    if(sortKey === key){ setSortDir(d => d==='asc'?'desc':'asc') }
    else { setSortKey(key); setSortDir('asc') }
  }

  function exportXlsx(rows){
    const data = rows.map(t=>({
      Reference: t.reference || t._orig?.reference || '',
  Agent: (t.traiteur && String(t.traiteur).trim()) ? t.traiteur : 'Non assignée',
      Statut: statusLabel(t),
      'SLA %': slaPercent(t),
  'Date création': t.date_creation_dt ? fmtDateTimeFR(t.date_creation_dt) : (t.date ? fmtDateTimeFR(t.date) : ''),
  'Date clôture': t.date_cloture_dt ? fmtDateTimeFR(t.date_cloture_dt) : (t.date_cloture ? fmtDateTimeFR(t.date_cloture) : ''),
      'Durée réelle (min)': (t.duration_minutes ?? t.duration ?? ''),
      'SLA (min)': (t.sla_minutes ?? ''),
      'Retard réel (min)': (()=>{
        if(t.duration_minutes!=null && t.sla_minutes!=null){
          return Math.max(0, Math.round(Number(t.duration_minutes) - Number(t.sla_minutes)))
        }
        if(t.retard_minutes!=null) return Math.max(0, Math.round(Number(t.retard_minutes)))
        return ''
      })(),
      'Durée réelle (hh:mm:ss)': ((()=>{ const v=t.duration_minutes ?? t.duration; return v!=null ? fmtMinutesHMS(v) : '' })()),
      'SLA (hh:mm:ss)': ((()=>{ const v=t.sla_minutes; return v!=null ? fmtMinutesHMS(v) : '' })()),
      'Retard réel (hh:mm:ss)': ((()=>{ let val=null; if(t.duration_minutes!=null && t.sla_minutes!=null){ val=Math.max(0, Number(t.duration_minutes)-Number(t.sla_minutes)); } else if(t.retard_minutes!=null){ val=Math.max(0, Number(t.retard_minutes)); } return val!=null?fmtMinutesHMS(val):'' })()),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets')
    XLSX.writeFile(wb, 'tickets.xlsx')
  }

  // Apply initial, non-editable filters from opener (agent/status)
  const baseFiltered = useMemo(()=>{
    return tickets.filter(t=>{
      if(initialFilters?.status==='open' && t.date_cloture) return false
      if(initialFilters?.status==='closed' && !t.date_cloture) return false
      if(initialFilters?.agent){
        const raw=(t.traiteur||'').toString().trim()
  const norm = raw ? raw : 'Non assignée'
        if(norm !== initialFilters.agent) return false
      }
      return true
    })
  }, [tickets, initialFilters])

  // Helpers to decide SLA IN/OUT when booleans might be missing
  function isSlaIn(t){
    if(t?.sla_in === true) return true
    if(t?.sla_out === true) return false
    if(typeof t?.in_sla === 'boolean') return t.in_sla
    if(t?.duration_minutes != null && t?.sla_minutes != null) return Number(t.duration_minutes) <= Number(t.sla_minutes)
    const orig = t?._orig || {}
    const dans = (orig['Dans le délai'] ?? '').toString().toLowerCase()
    if(dans.includes('oui') || dans === 'true' || dans === '1') return true
    return false
  }
  function isSlaOut(t){
    if(t?.sla_out === true) return true
    if(t?.sla_in === true) return false
    if(typeof t?.in_sla === 'boolean') return !t.in_sla
    if(t?.duration_minutes != null && t?.sla_minutes != null) return Number(t.duration_minutes) > Number(t.sla_minutes)
    const orig = t?._orig || {}
    const dans = (orig['Dans le délai'] ?? '').toString().toLowerCase()
    if(dans.includes('oui') || dans === 'true' || dans === '1') return false
    return true
  }

  // Apply interactive status, SLA state, then SLA range filters
  const filtered = useMemo(()=>{
    let arr = baseFiltered
    if(statusFilter !== 'all'){
      arr = arr.filter(t=> statusFilter === 'open' ? !t.date_cloture : !!t.date_cloture)
    }
    if(slaState !== 'all'){
      arr = arr.filter(t=> slaState === 'in' ? isSlaIn(t) : isSlaOut(t))
    }
    if(slaRange !== 'all'){
      const [lo, hi] = slaRange.split('-').map(x=> Number(x))
      arr = arr.filter(t=>{
        const p = slaPercent(t)
        if(p == null) return false
        return p >= lo && p <= hi
      })
    }
    return arr
  }, [baseFiltered, statusFilter, slaState, slaRange])

  // Agent overview (when agent filter is set)
  const agentOverview = useMemo(()=>{
    if(!initialFilters?.agent) return null
    const arr = baseFiltered
    const total = arr.length
    const closed = arr.filter(t=> t.date_cloture).length
    const open = total - closed
    const slaIn = arr.filter(t=> t.sla_in === true).length
    const slaOut = arr.filter(t=> t.sla_out === true || (t.sla_in === false)).length
    const avgDur = arr.reduce((s,t)=> s + (t.duration_minutes ?? (t.duration ?? 0)), 0) / (arr.filter(t=> (t.duration_minutes!=null) || (t.duration!=null)).length || 1)
    const avgDelay = arr.reduce((s,t)=>{
      const r = t.retard_minutes != null ? t.retard_minutes : ((t.duration_minutes!=null && t.sla_minutes!=null && t.duration_minutes>t.sla_minutes) ? (t.duration_minutes - t.sla_minutes) : 0)
      return s + (r>0 ? r : 0)
    },0) / (arr.filter(t=>{
      const r = t.retard_minutes != null ? t.retard_minutes : ((t.duration_minutes!=null && t.sla_minutes!=null && t.duration_minutes>t.sla_minutes) ? (t.duration_minutes - t.sla_minutes) : 0)
      return r>0
    }).length || 1)
    const slaInPct = closed ? Math.round((slaIn/closed)*100) : 0
    const slaOutPct = closed ? Math.round((slaOut/closed)*100) : 0
    return { total, closed, open, slaIn, slaOut, slaInPct, slaOutPct, avgDur: Math.round(avgDur), avgDelay: Math.round(avgDelay) }
  }, [baseFiltered, initialFilters])

  const sorted = useMemo(()=>{
    const arr = [...filtered]
    arr.sort((a,b)=>{
      let va, vb
      if(sortKey==='sla'){
        va = slaPercent(a); vb = slaPercent(b)
        va = va==null ? -1 : va; vb = vb==null ? -1 : vb
      } else if(sortKey==='status'){
        const ca = a.date_cloture ? 1 : 0
        const cb = b.date_cloture ? 1 : 0
        va = ca; vb = cb
      } else if(sortKey==='ref'){
        va = (a.reference || a._orig?.reference || '').toString()
        vb = (b.reference || b._orig?.reference || '').toString()
      } else if(sortKey==='agent'){
        va = (a.traiteur || '').toString(); vb = (b.traiteur || '').toString()
      } else {
        return 0
      }
      if(va < vb) return sortDir==='asc' ? -1 : 1
      if(va > vb) return sortDir==='asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const total = sorted.length
  const startIdx = (page-1)*pageSize
  const endIdx = Math.min(startIdx + pageSize, total)
  const pageRows = sorted.slice(startIdx, endIdx)

  return (
    <div className="space-y-3">
      {titleExtra && <div className="text-sm text-slate-500">{titleExtra}</div>}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500">SLA consommé</label>
          <select value={slaRange} onChange={e=> setSlaRange(e.target.value)} className="border rounded px-2 py-1 text-sm min-w-[160px]">
            <option value="all">Tous</option>
            <option value="0-50">0% à 50%</option>
            <option value="51-80">51% à 80%</option>
            <option value="81-95">81% à 95%</option>
            <option value="96-100">96% à 100%</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Statut</label>
          <select value={statusFilter} onChange={e=> setStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm min-w-[140px]">
            <option value="all">Tous</option>
            <option value="open">Ouverts</option>
            <option value="closed">Clôturés</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">État SLA</label>
          <select value={slaState} onChange={e=> setSlaState(e.target.value)} className="border rounded px-2 py-1 text-sm min-w-[140px]">
            <option value="all">Tous</option>
            <option value="in">SLA IN</option>
            <option value="out">SLA OUT</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=> exportXlsx(sorted)} className="px-3 py-1 bg-white border rounded text-sm">Export XLSX</button>
        </div>
      </div>

      {agentOverview && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">Total</div><div className="font-semibold">{agentOverview.total}</div></div>
          <button type="button" onClick={()=>{ setStatusFilter('open'); setPage(1) }} className="text-left bg-slate-50 rounded p-2 hover:bg-slate-100 cursor-pointer">
            <div className="text-xs text-slate-500">Ouverts</div><div className="font-semibold">{agentOverview.open}</div>
          </button>
          <button type="button" onClick={()=>{ setStatusFilter('closed'); setPage(1) }} className="text-left bg-slate-50 rounded p-2 hover:bg-slate-100 cursor-pointer">
            <div className="text-xs text-slate-500">Clôturés</div><div className="font-semibold">{agentOverview.closed}</div>
          </button>
          <button type="button" onClick={()=>{ setSlaState('in'); setPage(1) }} className="text-left bg-slate-50 rounded p-2 hover:bg-slate-100 cursor-pointer">
            <div className="text-xs text-slate-500">SLA IN</div><div className="font-semibold">{agentOverview.slaIn} ({agentOverview.slaInPct}%)</div>
          </button>
          <button type="button" onClick={()=>{ setSlaState('out'); setPage(1) }} className="text-left bg-slate-50 rounded p-2 hover:bg-slate-100 cursor-pointer">
            <div className="text-xs text-slate-500">SLA OUT</div><div className="font-semibold">{agentOverview.slaOut} ({agentOverview.slaOutPct}%)</div>
          </button>
          <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">Retard moy.</div><div className="font-semibold">{fmtMinutesHMS(agentOverview.avgDelay)}</div></div>
          <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">Durée moy. trait.</div><div className="font-semibold">{fmtMinutesHMS(agentOverview.avgDur)}</div></div>
        </div>
      )}

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left cursor-pointer" onClick={()=> toggleSort('ref')}>Référence {sortKey==='ref' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th className="p-2 text-left cursor-pointer" onClick={()=> toggleSort('agent')}>Agent {sortKey==='agent' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th className="p-2 text-left cursor-pointer" onClick={()=> toggleSort('status')}>Statut {sortKey==='status' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th className="p-2 text-left cursor-pointer" onClick={()=> toggleSort('sla')}>SLA consommé {sortKey==='sla' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th className="p-2 text-left">Date création</th>
              <th className="p-2 text-left">Date clôture</th>
              <th className="p-2 text-left">Durée de traitement</th>
              <th className="p-2 text-left">SLA</th>
              <th className="p-2 text-left">Retard</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-slate-500">Aucun ticket</td></tr>
            )}
            {pageRows.map((t, idx)=>{
              const p = slaPercent(t)
              const badge = p == null ? (
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">N/A</span>
              ) : (
                <span className={`px-2 py-0.5 rounded ${p < 100 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{p}%</span>
              )
              const derivedDelay = (t.duration_minutes!=null && t.sla_minutes!=null) ? Math.max(0, Number(t.duration_minutes) - Number(t.sla_minutes)) : null
              const providedDelay = (t.retard_minutes != null) ? Math.max(0, Number(t.retard_minutes)) : null
              const retard = (derivedDelay != null) ? derivedDelay : (providedDelay != null ? providedDelay : null)
              return (
                <tr key={t.reference || idx} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-medium">{t.reference || t._orig?.reference || '-'}</td>
                  <td className="p-2">{(t.traiteur && String(t.traiteur).trim()) ? t.traiteur : 'Non assignée'}</td>
                  <td className="p-2">{statusLabel(t)}</td>
                  <td className="p-2">{badge}</td>
                  <td className="p-2">{t.date_creation_dt ? fmtDateTimeFR(t.date_creation_dt) : (t.date ? fmtDateTimeFR(t.date) : '-')}</td>
                  <td className="p-2">{t.date_cloture_dt ? fmtDateTimeFR(t.date_cloture_dt) : (t.date_cloture ? fmtDateTimeFR(t.date_cloture) : '-')}</td>
                  <td className="p-2">{t.duration_minutes != null ? fmtMinutesHMS(t.duration_minutes) : (t.duration != null ? fmtMinutesHMS(t.duration) : '-')}</td>
                  <td className="p-2">{t.sla_minutes != null ? fmtMinutesHMS(t.sla_minutes) : '-'}</td>
                  <td className="p-2">{retard != null ? fmtMinutesHMS(retard) : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <div>{total ? `${startIdx+1}-${endIdx} sur ${total}` : '0 sur 0'}</div>
        <div className="flex items-center gap-1">
          <button disabled={page<=1} onClick={()=> setPage(p=> Math.max(1, p-1))} className="px-2 py-1 border rounded disabled:opacity-50">Préc.</button>
          <button disabled={endIdx>=total} onClick={()=> setPage(p=> (endIdx>=total ? p : p+1))} className="px-2 py-1 border rounded disabled:opacity-50">Suiv.</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span>Par page</span>
          <select value={pageSize} onChange={e=> setPageSize(Number(e.target.value))} className="border rounded px-2 py-1">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

  <div className="text-xs text-slate-500">Définitions: “Durée (hh:mm:ss)” = durée réelle importée; “SLA (hh:mm:ss)” = seuil SLA; “Retard (hh:mm:ss)” = max(0, Durée réelle − SLA). SLA% = min(100, Durée / SLA × 100).</div>
    </div>
  )
}
