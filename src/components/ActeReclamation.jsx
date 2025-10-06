import React, { useMemo, useState, useEffect } from 'react'

function isoWeekLabel(dateStr){
  const dt = new Date(dateStr)
  if(isNaN(dt)) return 'S?'
  const tmp = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
  tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7)
  const week1 = new Date(tmp.getFullYear(),0,4)
  const weekNo = 1 + Math.round(((tmp - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `S${weekNo}`
}

export default function ActeReclamation({dataset=[] , maxWeeks=4, showActe: parentShowActe, setShowActe: parentSetShowActe, showRecl: parentShowRecl, setShowRecl: parentSetShowRecl, topN: parentTopN, setTopN: parentSetTopN}){
  const [localShowActe, localSetShowActe] = useState(true)
  const [localShowRecl, localSetShowRecl] = useState(true)
  const [localTopN, localSetTopN] = useState(3)
  const showActe = parentShowActe !== undefined ? parentShowActe : localShowActe
  const setShowActe = parentSetShowActe !== undefined ? parentSetShowActe : localSetShowActe
  const showRecl = parentShowRecl !== undefined ? parentShowRecl : localShowRecl
  const setShowRecl = parentSetShowRecl !== undefined ? parentSetShowRecl : localSetShowRecl
  const topN = parentTopN !== undefined ? parentTopN : localTopN
  const setTopN = parentSetTopN !== undefined ? parentSetTopN : localSetTopN

  const filtered = useMemo(()=> dataset || [], [dataset])

  // determine weeks present
  const weeks = useMemo(()=>{
    const set = new Set()
    filtered.forEach(d=>{ if(d.date) set.add(isoWeekLabel(d.date)) })
    // normalize labels to extract numbers and sort numerically ascending
    const arr = Array.from(set).map(w=>({label:w, num: Number(String(w).replace(/[^0-9]/g,'')) || 0}))
    arr.sort((a,b)=> a.num - b.num)
    return arr.map(x=> x.label)
  },[filtered])
  // select up to maxWeeks most recent entries but keep ascending order
  const lastWeeks = useMemo(()=>{
    if(maxWeeks <= 0) return weeks
    return weeks.slice(Math.max(0, weeks.length - maxWeeks))
  },[weeks,maxWeeks])

  // helper to read original sheet values case-insensitively from _orig
  // normalize string: remove diacritics, lower, remove spaces and non-word chars
  function normalizeKey(s){
    if(s == null) return ''
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
  }

  function getOrigVal(r, candidates){
    const src = r._orig || r._raw || {}
    const map = {}
    Object.keys(src||{}).forEach(k=> map[normalizeKey(k)] = src[k])
    for(const c of candidates){
      const key = normalizeKey(c)
      if(map[key] !== undefined) return map[key]
    }
    return undefined
  }

  const actes = useMemo(()=> filtered.filter(r=>{ const v = getOrigVal(r, ['qualif_1','qualif1','qualification_primaire','qualification primaire']) || r.qualif_1 || ''; return /requêtes|spanco/i.test(String(v)) }),[filtered])
  const reclam = useMemo(()=> filtered.filter(r=>{ const v = getOrigVal(r, ['qualif_1','qualif1','qualification_primaire','qualification primaire']) || r.qualif_1 || ''; return /réclam|reclam/i.test(String(v)) }),[filtered])

  function groupRows(rows){
    const map = {}
    rows.forEach(r=>{
      const k = getOrigVal(r, ['qualif_2','qualif2','qualification_secondaire','qualification secondaire']) || r.qualif_2 || r.qualification_secondaire || 'Autre'
      const wk = isoWeekLabel(r.date)
      if(!map[k]) map[k] = {}
      map[k][wk] = (map[k][wk]||0) + 1
    })
    return map
  }

  // split actes into bloquantes / non bloquantes using same category heuristics
  const actesBuckets = useMemo(()=>{
    const buckets = {Bloquantes:[], 'Non Bloquantes':[]}
    actes.forEach(r=>{
      const catRaw = getOrigVal(r, ['categorie','category','cat','categorie_ticket']) || r.categorie || r.CATEGORIE || ''
      const cat = normalizeKey(catRaw)
      if(cat.includes('bloqu')){
        if(cat.includes('non')) buckets['Non Bloquantes'].push(r)
        else buckets.Bloquantes.push(r)
      } else {
        buckets['Non Bloquantes'].push(r)
      }
    })
    return {Bloquantes: groupRows(buckets.Bloquantes), Non: groupRows(buckets['Non Bloquantes']), counts: {Bloquantes: buckets.Bloquantes.length, 'Non Bloquantes': buckets['Non Bloquantes'].length}}
  },[actes])

  const reclBuckets = useMemo(()=>{
    const buckets = {Bloquantes:[], 'Non Bloquantes':[]} ;
    reclam.forEach(r=>{
      const catRaw = getOrigVal(r, ['categorie','category','cat','categorie_ticket']) || r.categorie || r.CATEGORIE || ''
      const cat = normalizeKey(catRaw)
      // classification: if contains 'bloqu' and NOT 'non' => Bloquantes
      // if contains 'bloqu' and contains 'non' => Non Bloquantes
      if(cat.includes('bloqu')){
        if(cat.includes('non')) buckets['Non Bloquantes'].push(r)
        else buckets.Bloquantes.push(r)
      } else {
        // default to Non Bloquantes when category not explicit
        buckets['Non Bloquantes'].push(r)
      }
    })
    return {Bloquantes: groupRows(buckets.Bloquantes), Non: groupRows(buckets['Non Bloquantes']), counts: {Bloquantes: buckets.Bloquantes.length, 'Non Bloquantes': buckets['Non Bloquantes'].length}}
  },[reclam])

  useEffect(()=>{
    // no-op but keep effect for future side-effects
  },[showActe, showRecl])

  return (
    <section className="my-4">
      <h2 className="text-lg font-semibold">Actes / Réclamations — visibilité</h2>
      <div className="flex items-center gap-4 my-2">
        <label className="text-sm"><input type="checkbox" checked={showActe} onChange={e=> setShowActe(e.target.checked)} className="mr-2"/>Acte</label>
        <label className="text-sm"><input type="checkbox" checked={showRecl} onChange={e=> setShowRecl(e.target.checked)} className="mr-2"/>Réclamation</label>
        <div className="text-sm">Top: <select value={topN} onChange={e=> setTopN(Number(e.target.value))} className="ml-2 p-1 border rounded">
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={-1}>Tous</option>
        </select></div>
        <small className="text-slate-500">(Acte = qualif_1 contient 'Requêtes' ou 'Spanco'; Réclamation = qualif_1 contient 'Réclam')</small>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {showActe && (
          <>
          <div className="border rounded p-3">
            <div className="font-semibold mb-2 bg-emerald-700 text-white inline-block px-3 py-1 rounded">ACTES BLOQUANTES ({actesBuckets.counts?.Bloquantes||0})</div>
            <table className="w-full text-sm">
              <thead className="text-left"><tr><th>Qualification secondaire</th>{lastWeeks.map(w=> <th key={w} className="text-center">{w}</th>)}</tr></thead>
              <tbody>
                {Object.keys(actesBuckets.Bloquantes)
                  .map(k=> ({k, total: lastWeeks.reduce((s,w)=> s + (actesBuckets.Bloquantes[k][w]||0), 0)}))
                  .sort((a,b)=> b.total - a.total)
                  .slice(topN > 0 ? 0 : 0, topN > 0 ? topN : undefined)
                  .map(row=> (
                    <tr key={row.k}><td className="py-1">{row.k}</td>{lastWeeks.map(w=> <td key={w} className="text-center">{actesBuckets.Bloquantes[row.k][w]||0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border rounded p-3">
            <div className="font-semibold mb-2 bg-emerald-600 text-white inline-block px-3 py-1 rounded">ACTES NON BLOQUANTES ({actesBuckets.counts?.['Non Bloquantes']||0})</div>
            <table className="w-full text-sm">
              <thead className="text-left"><tr><th>Qualification secondaire</th>{lastWeeks.map(w=> <th key={w} className="text-center">{w}</th>)}</tr></thead>
              <tbody>
                {Object.keys(actesBuckets.Non)
                  .map(k=> ({k, total: lastWeeks.reduce((s,w)=> s + (actesBuckets.Non[k][w]||0), 0)}))
                  .sort((a,b)=> b.total - a.total)
                  .slice(topN > 0 ? 0 : 0, topN > 0 ? topN : undefined)
                  .map(row=> (
                    <tr key={row.k}><td className="py-1">{row.k}</td>{lastWeeks.map(w=> <td key={w} className="text-center">{actesBuckets.Non[row.k][w]||0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {showRecl && (
          <>
          <div className="border rounded p-3">
            <div className="font-semibold mb-2 bg-green-700 text-white inline-block px-3 py-1 rounded">RECLAMATIONS BLOQUANTES ({reclBuckets.counts?.Bloquantes||0})</div>
            <table className="w-full text-sm">
              <thead className="text-left"><tr><th>Qualification secondaire</th>{lastWeeks.map(w=> <th key={w} className="text-center">{w}</th>)}</tr></thead>
              <tbody>
                {Object.keys(reclBuckets.Bloquantes)
                  .map(k=> ({k, total: lastWeeks.reduce((s,w)=> s + (reclBuckets.Bloquantes[k][w]||0), 0)}))
                  .sort((a,b)=> b.total - a.total)
                  .slice(topN > 0 ? 0 : 0, topN > 0 ? topN : undefined)
                  .map(row=> (
                    <tr key={row.k}><td className="py-1">{row.k}</td>{lastWeeks.map(w=> <td key={w} className="text-center">{reclBuckets.Bloquantes[row.k][w]||0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border rounded p-3">
            <div className="font-semibold mb-2 bg-green-600 text-white inline-block px-3 py-1 rounded">RECLAMATIONS NON BLOQUANTES ({reclBuckets.counts?.['Non Bloquantes']||0})</div>
            <table className="w-full text-sm">
              <thead className="text-left"><tr><th>Qualification secondaire</th>{lastWeeks.map(w=> <th key={w} className="text-center">{w}</th>)}</tr></thead>
              <tbody>
                {Object.keys(reclBuckets.Non)
                  .map(k=> ({k, total: lastWeeks.reduce((s,w)=> s + (reclBuckets.Non[k][w]||0), 0)}))
                  .sort((a,b)=> b.total - a.total)
                  .slice(topN > 0 ? 0 : 0, topN > 0 ? topN : undefined)
                  .map(row=> (
                    <tr key={row.k}><td className="py-1">{row.k}</td>{lastWeeks.map(w=> <td key={w} className="text-center">{reclBuckets.Non[row.k][w]||0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </section>
  )
}
