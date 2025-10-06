import React from 'react'

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

function unique(arr){ return [...new Set(arr)] }

export default function Recap({dataset, showActe = true, showRecl = true}){
  if(!dataset || dataset.length===0) return null
  const weeks = unique(dataset.map(d=> d.date ? isoWeekKey(d.date) : null).filter(Boolean)).sort((a,b)=> Number(a.replace(/^S/,'')) - Number(b.replace(/^S/,'')))
  const lastWeeks = weeks.slice(-4)

  const isActe = r => { const v = (r._orig && r._orig['qualif_1']) || r.qualif_1 || ''; return /requêtes|requete|spanco/i.test(String(v)) }
  const isRecl = r => { const v = (r._orig && r._orig['qualif_1']) || r.qualif_1 || ''; return /réclam|reclam/i.test(String(v)) }

  const totalActes = {}
  const actesBloq_cloture = {}
  const actesBloq_dansCycle = {}
  const actesBloq_horsCycle = {}
  const actesNon_cloture = {}
  const actesNon_dansCycle = {}
  const actesNon_horsCycle = {}

  dataset.forEach(r=>{
    if(!isActe(r)) return
    const wk = isoWeekKey(r.date || r.date_cloture || r._orig?.date || r._orig?.DATE)
    if(!wk) return

    // only count closed tickets for recap totals
    const isClosed = (r.date_cloture && String(r.date_cloture).trim()!=='') || (r.state && /term|clotur|closed|clos|fermé|ferme/i.test(String(r.state)))
    if(!isClosed) return

    totalActes[wk] = (totalActes[wk]||0) + 1
    const cat = (r._orig && (r._orig['categorie']||r._orig['CATEGORIE'])) || r.categorie || ''
    const isBloq = /b(o|l)qu|bloquante/i.test(String(cat)) && !String(cat||'').toLowerCase().includes('non')

    // determine SLA in/out using normalized flags where available
    let isInSla = null
    if(typeof r.sla_in === 'boolean') isInSla = r.sla_in
    else if(typeof r.sla_out === 'boolean') isInSla = !r.sla_out
    else if(r.sla_minutes!=null && r.duration_minutes!=null) isInSla = Number(r.duration_minutes) <= Number(r.sla_minutes)
    else if(r.dans_delai) isInSla = /in|oui|true|1/i.test(String(r.dans_delai))

    if(isBloq){
      actesBloq_cloture[wk] = (actesBloq_cloture[wk]||0) + 1
      if(isInSla) actesBloq_dansCycle[wk] = (actesBloq_dansCycle[wk]||0) + 1
      else actesBloq_horsCycle[wk] = (actesBloq_horsCycle[wk]||0) + 1
    } else {
      actesNon_cloture[wk] = (actesNon_cloture[wk]||0) + 1
      if(isInSla) actesNon_dansCycle[wk] = (actesNon_dansCycle[wk]||0) + 1
      else actesNon_horsCycle[wk] = (actesNon_horsCycle[wk]||0) + 1
    }
  })

  // Reclamations aggregation (same rules: only closed, use sla_in/out)
  const recl_totals = {}
  const recl_bloq = {}
  const recl_bloq_in = {}
  const recl_bloq_out = {}
  const recl_non = {}
  const recl_non_in = {}
  const recl_non_out = {}

  dataset.forEach(r=>{
    if(!isRecl(r)) return
    const wk = isoWeekKey(r.date || r.date_cloture || r._orig?.date || r._orig?.DATE)
    if(!wk) return
    const isClosed = (r.date_cloture && String(r.date_cloture).trim()!=='') || (r.state && /term|clotur|closed|clos|fermé|ferme/i.test(String(r.state)))
    if(!isClosed) return

    recl_totals[wk] = (recl_totals[wk]||0) + 1
    const cat = (r._orig && (r._orig['categorie']||r._orig['CATEGORIE'])) || r.categorie || ''
    const isBloq = /b(o|l)qu|bloquante/i.test(String(cat)) && !String(cat||'').toLowerCase().includes('non')
    let isInSla = null
    if(typeof r.sla_in === 'boolean') isInSla = r.sla_in
    else if(typeof r.sla_out === 'boolean') isInSla = !r.sla_out
    else if(r.sla_minutes!=null && r.duration_minutes!=null) isInSla = Number(r.duration_minutes) <= Number(r.sla_minutes)
    else if(r.dans_delai) isInSla = /in|oui|true|1/i.test(String(r.dans_delai))

    if(isBloq){
      recl_bloq[wk] = (recl_bloq[wk]||0) + 1
      if(isInSla) recl_bloq_in[wk] = (recl_bloq_in[wk]||0) + 1
      else recl_bloq_out[wk] = (recl_bloq_out[wk]||0) + 1
    } else {
      recl_non[wk] = (recl_non[wk]||0) + 1
      if(isInSla) recl_non_in[wk] = (recl_non_in[wk]||0) + 1
      else recl_non_out[wk] = (recl_non_out[wk]||0) + 1
    }
  })

  const headerOrange = { background:'#c2410c', color:'#fff', padding:8, textAlign:'center', fontWeight:700 }
  const smallHeader = { fontSize:12, color:'#374151', padding:6 }
  const groupHeader = { background:'#f8e6dc', padding:8, fontWeight:700 }
  const nonBloqHeader = { background:'#d0eef8', padding:8, fontWeight:700 }

  return (
    <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      { showActe && (
        <div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,border:'1px solid #e5e7eb'}}>
            <thead>
              <tr>
                <th style={{width:280}}></th>
                {lastWeeks.map(w=> <th key={w} style={headerOrange}>{w}</th>)}
              </tr>
              <tr>
                <th style={smallHeader}>Objectif On time ≥</th>
                {lastWeeks.map(w=> <th key={w} style={{padding:6,textAlign:'center'}}>95%</th>)}
              </tr>
              <tr>
                <th style={smallHeader}>Objectif Backlog ≤</th>
                {lastWeeks.map(w=> <th key={w} style={{padding:6,textAlign:'center'}}>1</th>)}
              </tr>
            </thead>
            <tbody>
              <tr style={{background:'#f9f5f2'}}>
                <td style={{padding:8,fontWeight:700}}>TOTAL ACTES</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:8,textAlign:'center',fontWeight:700}}>{totalActes[w]||0}</td>)}
              </tr>

              <tr>
                <td style={groupHeader}>Actes Bloquants</td>
                {lastWeeks.map(w=> <td key={w} style={{background:'#fff'}}></td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Total Actes clôturées</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{actesBloq_cloture[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Actes clôturées dans le cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{actesBloq_dansCycle[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Actes clôturées hors cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{actesBloq_horsCycle[w]||0}</td>)}
              </tr>

              <tr>
                <td style={nonBloqHeader}>Actes Non Bloquants</td>
                {lastWeeks.map(w=> <td key={w} style={{background:'#fff'}}></td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Total Actes clôturées</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{actesNon_cloture[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Actes clôturées dans le cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{actesNon_dansCycle[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Actes clôturées hors cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{actesNon_horsCycle[w]||0}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      { showRecl && (
        <div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,border:'1px solid #e5e7eb'}}>
            <thead>
              <tr>
                <th style={{width:280}}></th>
                {lastWeeks.map(w=> <th key={w} style={headerOrange}>{w}</th>)}
              </tr>
              <tr>
                <th style={smallHeader}>Objectif On time ≥</th>
                {lastWeeks.map(w=> <th key={w} style={{padding:6,textAlign:'center'}}>95%</th>)}
              </tr>
              <tr>
                <th style={smallHeader}>Objectif Backlog ≤</th>
                {lastWeeks.map(w=> <th key={w} style={{padding:6,textAlign:'center'}}>1</th>)}
              </tr>
            </thead>
            <tbody>
              <tr style={{background:'#f9f5f2'}}>
                <td style={{padding:8,fontWeight:700}}>TOTAL RECLAMATIONS</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:8,textAlign:'center',fontWeight:700}}>{recl_totals[w]||0}</td>)}
              </tr>

              <tr>
                <td style={groupHeader}>Réclamations Bloquantes</td>
                {lastWeeks.map(w=> <td key={w} style={{background:'#fff'}}></td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Total Réclamations clôturées</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{recl_bloq[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Réclamations clôturées dans le cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{recl_bloq_in[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Réclamations clôturées hors cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{recl_bloq_out[w]||0}</td>)}
              </tr>

              <tr>
                <td style={nonBloqHeader}>Réclamations non Bloquantes</td>
                {lastWeeks.map(w=> <td key={w} style={{background:'#fff'}}></td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Total Réclamations clôturées</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{recl_non[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Réclamations clôturées dans le cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{recl_non_in[w]||0}</td>)}
              </tr>
              <tr>
                <td style={{padding:6}}>Réclamations clôturées hors cycle</td>
                {lastWeeks.map(w=> <td key={w} style={{padding:6,textAlign:'center'}}>{recl_non_out[w]||0}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
