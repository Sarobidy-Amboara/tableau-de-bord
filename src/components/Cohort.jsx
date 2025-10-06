import React, { useState } from 'react'

function monthKey(dateStr){
  if(!dateStr) return 'unknown'
  return dateStr.slice(0,7)
}

function isoWeekKey(dateStr){
  if(!dateStr) return 'unknown'
  const d = new Date(dateStr)
  // ISO week number algorithm
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0,1)
  if(target.getDay() !== 4){
    target.setMonth(0,1 + ((4 - target.getDay()) + 7) % 7)
  }
  const weekNumber = 1 + Math.round((firstThursday - target) / 604800000)
  return d.getFullYear() + '-W' + String(weekNumber).padStart(2,'0')
}

function displayIsoWeek(isoKey){
  // isoKey expected like '2025-W31'
  if(!isoKey) return isoKey
  const m = isoKey.match(/(\d{4})-W(\d{2})/)
  if(!m) return isoKey
  const year = m[1]
  const week = String(Number(m[2])) // remove leading zero
  return `S${week}-${year}`
}

function monthDiff(startStr, endStr){
  if(!startStr || !endStr) return null
  const a = new Date(startStr)
  const b = new Date(endStr)
  if(isNaN(a) || isNaN(b)) return null
  return (b.getFullYear() - a.getFullYear())*12 + (b.getMonth() - a.getMonth())
}

function weekDiff(startStr, endStr){
  if(!startStr || !endStr) return null
  const a = new Date(startStr)
  const b = new Date(endStr)
  if(isNaN(a) || isNaN(b)) return null
  const diffDays = Math.floor((b - a) / (1000*60*60*24))
  return Math.floor(diffDays / 7)
}

export default function Cohort({dataset=[], initialGran='month', fromDate='', toDate=''}){
  // if user applied same from/to date, prefer 'day' granularity
  const autoGran = (fromDate && toDate && fromDate === toDate) ? 'day' : null
  const [gran, setGran] = useState(autoGran || initialGran)
  // selection removed (no chart)

  // Build cohort matrix: { cohortKey: { total, closedCount, ages: {ageBucket: count} } }
  const matrix = {}
  const ages = new Set()
  dataset.forEach(d => {
    const created = d.date
    const closed = d.date_cloture
    // choose cohort key depending on granularity
    let cohort
    if(gran === 'month') cohort = monthKey(created)
    else if(gran === 'week') cohort = isoWeekKey(created)
    else cohort = created // day: group by creation date
    let treatAge = null
    if(created){
      if(gran === 'month') treatAge = closed ? monthDiff(created, closed) : null
      else if(gran === 'week') treatAge = closed ? weekDiff(created, closed) : null
      else treatAge = closed ? Math.max(0, Math.round((new Date(closed) - new Date(created)) / (1000*60*60*24))) : null
    }
    if(!matrix[cohort]) matrix[cohort] = { total:0, closedCount:0, ages: {} }
    matrix[cohort].total += 1
    if(closed) matrix[cohort].closedCount += 1
    if(treatAge != null){
      matrix[cohort].ages[treatAge] = (matrix[cohort].ages[treatAge] || 0) + 1
      ages.add(treatAge)
    }
  })

  const sortedCohorts = Object.keys(matrix).sort()
  const maxAge = ages.size ? Math.max(...Array.from(ages)) : 0

  function ageLabel(ageIndex){
    // For day/week/month: show relative labels when multiple cohorts or when the selected range spans multiple units
    const multipleCohorts = Object.keys(matrix).length > 1
    if(gran === 'day'){
      const multiDayFilter = fromDate && (fromDate !== toDate) && !!toDate
      const useRelative = multiDayFilter || multipleCohorts
      if(useRelative) return `J+${ageIndex}`
      // else fallthrough to absolute date display
    }
    if(gran === 'week'){
      const multiWeekFilter = fromDate && toDate && weekDiff(fromDate,toDate) && weekDiff(fromDate,toDate) > 0
      const useRelative = multiWeekFilter || multipleCohorts
      if(useRelative) return `S+${ageIndex}`
      // else fallthrough to absolute week display
    }
    if(gran === 'month'){
      const multiMonthFilter = fromDate && toDate && monthDiff(fromDate,toDate) && monthDiff(fromDate,toDate) > 0
      const useRelative = multiMonthFilter || multipleCohorts
      if(useRelative) return `M+${ageIndex}`
      // else fallthrough to absolute month display
    }
    if(!fromDate) return gran === 'month' ? `M+${ageIndex}` : gran === 'week' ? `S+${ageIndex}` : `J+${ageIndex}`
    try{
      const base = new Date(fromDate)
      if(isNaN(base)) return gran === 'month' ? `M+${ageIndex}` : gran === 'week' ? `S+${ageIndex}` : `J+${ageIndex}`
      if(gran === 'day'){
        const d = new Date(base)
        d.setDate(d.getDate() + ageIndex)
        const dd = String(d.getDate()).padStart(2,'0')
        const mm = String(d.getMonth()+1).padStart(2,'0')
        const yy = d.getFullYear()
        return `J+${ageIndex} (${dd}/${mm}/${yy})`
      }
      if(gran === 'week'){
        const start = new Date(base)
        start.setDate(start.getDate() + (ageIndex*7))
        // compute ISO week string
        const isoWeek = isoWeekKey(start.toISOString().slice(0,10))
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        const sdd = String(start.getDate()).padStart(2,'0')
        const smm = String(start.getMonth()+1).padStart(2,'0')
        const syy = start.getFullYear()
        const edd = String(end.getDate()).padStart(2,'0')
        const emm = String(end.getMonth()+1).padStart(2,'0')
        const eyy = end.getFullYear()
        // return ISO week notation plus readable date range
        return `${displayIsoWeek(isoWeek)} (${sdd}/${smm}/${syy}→${edd}/${emm}/${eyy})`
      }
      if(gran === 'month'){
        // month bucket: calendar month offset from fromDate
        const m = new Date(base)
        m.setMonth(m.getMonth() + ageIndex)
        const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
        const name = monthNames[m.getMonth()]
        const yy = m.getFullYear()
        return `${name} ${yy}`
      }
    }catch(e){
      return gran === 'month' ? `M+${ageIndex}` : gran === 'week' ? `S+${ageIndex}` : `J+${ageIndex}`
    }
  }

  function displayDate(iso){
    if(!iso) return ''
    const d = new Date(iso)
    if(isNaN(d)) return iso
    const dd = String(d.getDate()).padStart(2,'0')
    const mm = String(d.getMonth()+1).padStart(2,'0')
    const yy = d.getFullYear()
    return `${dd}/${mm}/${yy}`
  }

  function displayMonthKey(ym){
    if(!ym) return ym
    // ym expected 'YYYY-MM'
    const m = ym.split('-')
    if(m.length !== 2) return ym
    const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
    const year = m[0]
    const monthIndex = parseInt(m[1],10) - 1
    // Capitalize month and include dash before year per user's preference
    const monthLabel = (monthNames[monthIndex] || m[1]).charAt(0).toUpperCase() + (monthNames[monthIndex] || m[1]).slice(1)
    return `${monthLabel} -${year}`
  }

  // chart removed — no effect needed

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Vue cohorte du traitement des tickets (par date de création)</h2>
      <div className="bg-white rounded shadow p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm text-slate-500">Période affichée selon les filtres.</div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Vue cohorte:</label>
            <select className="p-2 border rounded" value={gran} onChange={e=> setGran(e.target.value)}>
              <option value="month">Mois</option>
              <option value="week">Semaine</option>
              <option value="day">Jour</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto mb-4">
          {/* Hint: when in day view and multiple dates/cohorts are selected, headers are relative J+N */}
          {gran === 'day' && (fromDate && toDate && fromDate !== toDate || Object.keys(matrix).length > 1) ? (
            <div className="text-xs text-slate-500 mb-2">J+N = N jours après la date de création de la cohorte</div>
          ) : null}
          <table className="min-w-full text-sm table-auto">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2">Cohorte</th>
                <th className="p-2">Total</th>
                {Array.from({length: Math.min(maxAge+1, 12)}, (_,i)=> (
                  <th key={i} className="p-2">{ageLabel(i)}</th>
                ))}
                <th className="p-2">Ouvert</th>
              </tr>
            </thead>
            <tbody>
              {sortedCohorts.map(c => (
                <tr key={c} className="border-t hover:bg-slate-50">
                  <td className="p-2">{
                    gran === 'day' ? displayDate(c)
                    : gran === 'week' ? displayIsoWeek(c)
                    : displayMonthKey(c)
                  }</td>
                  <td className="p-2">{matrix[c].total}</td>
                  {Array.from({length: Math.min(maxAge+1,12)}, (_,i)=> {
                    const val = matrix[c].ages[i] || 0
                    const total = matrix[c].total || 1
                    const pct = Math.round((val/total)*100)
                    // color gradient: 0 => transparent, up to 100 => green
                    const bg = val ? `rgba(16,185,129,${Math.min(0.9, 0.08 + pct/150)})` : 'transparent'
                    return <td key={i} className="p-2 text-center" style={{background:bg}}>{val}</td>
                  })}
                  <td className="p-2 text-center">{(matrix[c].total - (matrix[c].closedCount||0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* chart removed */}
      </div>
    </section>
  )
}
