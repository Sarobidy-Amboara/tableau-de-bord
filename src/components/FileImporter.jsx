import React from 'react'
import * as XLSX from 'xlsx'

function findKey(keys, candidates){
  keys = keys.map(k=>k.toLowerCase())
  for(const c of candidates){
    const low = c.toLowerCase().replace(/\s+/g,'')
    for(const k of keys){
      if(low.includes(k) || low.includes(k.replace('_','')) ) return c
    }
  }
  return null
}

function parseDateToISO(v){
  if(v == null || v === '') return null
  if(typeof v === 'number'){
    // Excel serial date
    const d = new Date(Date.UTC(0,0,v-1))
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0,10)
  }
  // try ISO-compatible
  const maybe = new Date(v)
  if(!isNaN(maybe)) return maybe.toISOString().slice(0,10)
  // dd/mm/yyyy or dd-mm-yyyy
  const m = v.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/)
  if(m){
    const dd = parseInt(m[1],10), mm = parseInt(m[2],10), yy = parseInt(m[3],10)
    const y = yy < 100 ? 2000 + yy : yy
    const d = new Date(y, mm-1, dd)
    if(!isNaN(d)) return d.toISOString().slice(0,10)
  }
  return null
}

// Parse potential date+time to ISO 'YYYY-MM-DDTHH:mm:ss'.
function parseDateTimeToISO(v){
  if(v == null || v === '') return null
  const pad = (n)=> String(n).padStart(2,'0')
  // Excel serial date (days since 1899-12-30). Supports fractional part for time.
  if(typeof v === 'number'){
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if(!isNaN(d)){
      const y = d.getFullYear(); const m = pad(d.getMonth()+1); const day = pad(d.getDate())
      const hh = pad(d.getHours()); const mi = pad(d.getMinutes()); const ss = pad(d.getSeconds())
      return `${y}-${m}-${day} ${hh}:${mi}:${ss}`
    }
  }
  if(typeof v === 'string'){
    const s = v.trim()
    // Already ISO-like; normalize 'T' to space and trim seconds
    const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
    if(mIso){
      const [,Y,M,D,HH,MM,SS='00'] = mIso
      return `${Y}-${M}-${D} ${HH}:${MM}:${SS}`
    }
    // dd/mm/yyyy[ hh:mm[:ss]] or dd-mm-yyyy[ hh:mm[:ss]]
    const m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
    if(m){
      const dd = parseInt(m[1],10), mm = parseInt(m[2],10), yy = parseInt(m[3],10)
      const hh = parseInt(m[4]||'0',10), mi = parseInt(m[5]||'0',10), ss = parseInt(m[6]||'0',10)
      const y = yy < 100 ? 2000 + yy : yy
      return `${y}-${pad(mm)}-${pad(dd)} ${pad(hh)}:${pad(mi)}:${pad(ss)}`
    }
    // Fallback: try native parser as local time (avoid UTC conversion)
    const n = new Date(s.replace('T',' '))
    if(!isNaN(n)){
      const y = n.getFullYear(); const m = pad(n.getMonth()+1); const day = pad(n.getDate())
      const hh = pad(n.getHours()); const mi = pad(n.getMinutes()); const ss = pad(n.getSeconds())
      return `${y}-${m}-${day} ${hh}:${mi}:${ss}`
    }
  }
  const dOnly = parseDateToISO(v)
  return dOnly ? `${dOnly} 00:00:00` : null
}

function parseHMSToMinutes(hms){
  if(hms == null) return null
  const s = hms.toString().trim()
  const m = s.match(/(\d{1,2}):(\d{2}):(\d{2})/)
  if(!m) return null
  const hh = Number(m[1]) || 0
  const mm = Number(m[2]) || 0
  const ss = Number(m[3]) || 0
  return hh*60 + mm + Math.round(ss/60)
}

// parse a value into minutes. Accepts HH:MM:SS, numeric hours or numeric minutes.
function parseToMinutes(v){
  if(v == null) return null
  if(typeof v === 'number'){
    // heuristic: if number > 24 assume minutes, else assume hours
    return v > 24 ? Math.round(v) : Math.round(v * 60)
  }
  const s = String(v).trim()
  if(!s) return null
  // try h:m:s
  const hms = parseHMSToMinutes(s)
  if(hms != null) return hms
  // numeric string
  const n = Number(s.replace(',', '.'))
  if(!isNaN(n)) return n > 24 ? Math.round(n) : Math.round(n * 60)
  return null
}

export default function FileImporter({onData, setLoading}){
  const handleFile = async (e) => {
    const f = e.target.files[0]
    if(!f) return
    try{
      if(setLoading) setLoading(true)
      const data = await f.arrayBuffer()
      const wb = XLSX.read(data)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, {defval:''})
      if(rows.length === 0){ onData([]); return }

      const headers = Object.keys(rows[0])
      const dateKey = findKey(['date','datecreation','date_de_creation','date_creation','creationdate','created_at'], headers)
      const dateClotKey = findKey(['datecloture','date_de_cloture','closeddate','date_cloture','closuredate'], headers)
      const traiteurKey = findKey(['traiteur','agent','nom_traiteur','owner','assignee'], headers)
      const durKey = findKey(['duree','duration','durée','duree_de_traitement','processing_time'], headers)
  const refKey = findKey(['reference','ref','ticket','ticket_id','id','numero','n°','num'], headers)

      const normalized = rows.map(r => {
        const durMin = parseToMinutes(r['duree_reelle_traitement'] || r['Duree_reelle_traitement'] || r[durKey] || r['duree'] || r['duration'])
        const retardMin = parseToMinutes(r['duree_reelle_retard'] || r['retard'])
        const low = (r['sla_state'] || r['SLA_STATE'] || r['sla'] || r['SLA'] || r['cycle'] || '').toString().toLowerCase()
        // explicit textual flags (from source) if present
        const explicitIn = low && (low.includes('in') || low.includes('oui') || low.includes('ok') || low.includes('true'))
        const explicitOut = low && (low.includes('out') || low.includes('retard') || low.includes('late') || low.includes('non') || low.includes('false'))

        // try to parse SLA into minutes (HH:MM:SS or numeric hours/minutes)
        const slaRaw = r['SLA'] || r['sla'] || r['Sla'] || r['Cycle'] || r['cycle'] || ''
        const slaMin = parseToMinutes(slaRaw)

        // derive a canonical duration used for calculations (minutes)
        const durForCalc = durMin != null ? durMin : (r[durKey] != null ? parseToMinutes(r[durKey]) : null)

        // unify IN/OUT: prefer numeric comparison when both duration and SLA are available
        let sla_in_flag = null
        let sla_out_flag = null
        if(durForCalc != null && slaMin != null){
          sla_in_flag = Number(durForCalc) <= Number(slaMin)
          sla_out_flag = Number(durForCalc) > Number(slaMin)
        } else if(retardMin != null){
          // fallback to retard field if numeric duration/SLA missing
          sla_in_flag = retardMin === 0
          sla_out_flag = retardMin > 0
        } else if(explicitIn || explicitOut){
          // fallback to explicit textual flags if provided
          sla_in_flag = !!explicitIn
          sla_out_flag = !!explicitOut
        }

        // compute backlog fields
        // - backlog_ratio_raw: duration / sla (float)
        // - backlog_excess: max(0, (duration - sla)/sla) (float)
        // - backlog_cycles: integer number of FULL SLA periods beyond the first (0 when duration == sla, 1 when duration == 2*sla)
        let backlog_ratio = null
        let backlog_excess = null
        let backlog_cycles = null
        let backlog_ratio_raw = null
  // durForCalc is defined above (canonical duration in minutes)
  if(durForCalc != null && slaMin != null && slaMin !== 0){
          backlog_ratio_raw = Number((durForCalc / slaMin))
          backlog_excess = Number(Math.max(0, (durForCalc - slaMin) / slaMin).toFixed(2))
          // integer cycles beyond first SLA period
          backlog_cycles = Math.max(0, Math.floor((durForCalc - slaMin) / slaMin + 1e-9))
          // for backward compatibility the field `backlog_ratio` used downstream will be the integer cycles
          backlog_ratio = backlog_cycles
        }

        return {
          _orig: r,
          reference: r[refKey] || r['reference'] || r['Reference'] || r['REF'] || r['ref'] || r['Ticket'] || r['ticket'] || r['ticket_id'] || r['id'] || r['numero'] || r['num'] || '',
          date: parseDateToISO(r[dateKey] ?? r['Date de création'] ?? r['datecreation']),
          date_creation_dt: parseDateTimeToISO(r[dateKey] ?? r['Date de création'] ?? r['datecreation']),
          date_cloture: parseDateToISO(r[dateClotKey] ?? r['Date de clôture'] ?? r['datecloture']),
          date_cloture_dt: parseDateTimeToISO(r[dateClotKey] ?? r['Date de clôture'] ?? r['datecloture']),
          traiteur: (r[traiteurKey] || r['Nom traiteur'] || r['traiteur'] || '').toString(),
          duration: parseFloat(r[durKey]) || null,
          duration_minutes: durMin,
          retard_minutes: retardMin,
          sla_raw: slaRaw,
          sla_minutes: slaMin,
          backlog_ratio: backlog_ratio,
          backlog_ratio_raw: backlog_ratio_raw,
          backlog_excess: backlog_excess,
          backlog_cycles: backlog_cycles,
          backlog_calc: backlog_cycles,
          sla_in: sla_in_flag,
          sla_out: sla_out_flag
        }
      })
      // deduplicate by reference: keep first occurrence for each non-empty reference
      const seen = new Set()
      const deduped = []
      const noRef = []
      normalized.forEach(item => {
        const ref = (item.reference || '').toString().trim()
        if(!ref) { noRef.push(item); return }
        if(!seen.has(ref)) { seen.add(ref); deduped.push(item) }
        // otherwise duplicate -> skip
      })
      const finalRows = deduped.concat(noRef)
  if(onData) onData(finalRows)
    }catch(err){
      console.error('Import error', err)
      onData([])
    }finally{
      if(setLoading) setLoading(false)
    }
  }

  return (
    <label className="inline-flex items-center gap-2 p-2 bg-white rounded shadow">
      Importer fichier
      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
    </label>
  )
}
