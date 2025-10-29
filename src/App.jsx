import React, { useState } from 'react'
import KPIs from './components/KPIs'
import DataTable from './components/DataTable'
import Cohort from './components/Cohort'
import FileImporter from './components/FileImporter'
import AgentsPanel from './components/AgentsPanel'
import ActeReclamation from './components/ActeReclamation'
import Recap from './components/Recap'
import RecapCharts from './components/RecapCharts'
import Spinner from './components/Spinner'
import Modal from './components/Modal'
import TicketList from './components/TicketList'

export default function App(){
  const [view, setView] = useState('stats')
  const [dataset, setDataset] = useState([])
  const [loading, setLoading] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showActe, setShowActe] = useState(true)
  const [showRecl, setShowRecl] = useState(true)
  const [topN, setTopN] = useState(3)
  const [modal, setModal] = useState({ open:false, title:'', tickets: [] })

  const filteredDataset = dataset.filter(d => {
    if(!d.date) return false
    if(fromDate && d.date < fromDate) return false
    if(toDate && d.date > toDate) return false
    return true
  })

  function openModalWithTickets(title, tickets, initialFilters){
    const fmt = (d)=>{
      if(!d) return ''
      const [y,m,day] = d.split('-')
      return `${day}/${m}/${y}`
    }
    const period = (fromDate || toDate) ? `Période: ${fromDate?fmt(fromDate):'—'} → ${toDate?fmt(toDate):'—'}` : 'Période: toutes dates'
    setModal({ open: true, title, tickets, initialFilters, titleExtra: period })
  }

  function handleOpenTickets(){
    const tickets = filteredDataset.filter(d=> !d.date_cloture)
    openModalWithTickets(`Tickets ouverts (${tickets.length})`, tickets, {status:'open'})
  }
  function handleClosedTickets(){
    const tickets = filteredDataset.filter(d=> d.date_cloture)
    openModalWithTickets(`Tickets clôturés (${tickets.length})`, tickets, {status:'closed'})
  }
  function handleInSlaTickets(){
    const tickets = filteredDataset.filter(d=> d.sla_in === true || (d._orig && ((d._orig['Dans le délai']===true) || String(d._orig['Dans le délai']||'').toLowerCase().includes('oui'))))
    openModalWithTickets(`Dans le délai (IN) (${tickets.length})`, tickets, {status:'all', slaState:'in'})
  }
  function handleOutSlaTickets(){
    const tickets = filteredDataset.filter(d=> d.sla_out === true || (d.sla_in === false))
    openModalWithTickets(`Retard (OUT) (${tickets.length})`, tickets, {status:'all', slaState:'out'})
  }
  function handleAgentClick(agent){
    const normAgent = (agent||'').toString().trim()
    const tickets = filteredDataset.filter(d=>{
      const raw = (d.traiteur||'').toString().trim()
      if(normAgent.toLowerCase() === 'non assignée') return raw === ''
      return raw === normAgent
    })
    openModalWithTickets(`Tickets de l'agent ${agent} (${tickets.length})`, tickets, {agent: normAgent})
  }

  return (
    <>
    <div className="min-h-screen p-6">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Reporting DRC</h1>
          <div className="space-x-2">
            <button onClick={() => setView('db')} className="px-3 py-1 rounded bg-white shadow">Base de données</button>
            <button onClick={() => setView('stats')} className="px-3 py-1 rounded bg-white shadow">Statistiques</button>
          </div>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-4">
        <FileImporter onData={(rows)=> setDataset(rows)} setLoading={setLoading} />
        <label className="text-sm">De: <input type="date" value={fromDate} onChange={e=> setFromDate(e.target.value)} className="ml-2 p-1 border rounded" /></label>
        <label className="text-sm">À: <input type="date" value={toDate} onChange={e=> setToDate(e.target.value)} className="ml-2 p-1 border rounded" /></label>
        <button className="px-3 py-1 bg-white rounded shadow" onClick={()=>{ setFromDate(''); setToDate('') }}>Réinitialiser filtres</button>
      </div>

      {view === 'stats' && (
        <main>
          <KPIs dataset={filteredDataset}
            onOpenClick={handleOpenTickets}
            onClosedClick={handleClosedTickets}
            onInSlaClick={handleInSlaTickets}
            onOutSlaClick={handleOutSlaTickets}
          />
          {loading && <div className="p-2"><Spinner className="text-slate-600" size={1.2} /> <span className="ml-2 text-sm text-slate-600">Chargement du fichier...</span></div>}
          <AgentsPanel dataset={filteredDataset} onAgentClick={handleAgentClick} />
          <Cohort dataset={filteredDataset} fromDate={fromDate} toDate={toDate} />
          <ActeReclamation dataset={filteredDataset} showActe={showActe} setShowActe={setShowActe} showRecl={showRecl} setShowRecl={setShowRecl} topN={topN} setTopN={setTopN} />
          <Recap dataset={filteredDataset} showActe={showActe} showRecl={showRecl} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            { showActe && showRecl && (
              <>
                <RecapCharts dataset={filteredDataset} type="acte" bucket="bloq" title="Actes bloquants: Performance de traitement" />
                <RecapCharts dataset={filteredDataset} type="acte" bucket="non" title="Actes non bloquants: Performance de traitement" />
                <RecapCharts dataset={filteredDataset} type="recl" bucket="bloq" title="Réclamations bloquantes: Performance de traitement" />
                <RecapCharts dataset={filteredDataset} type="recl" bucket="non" title="Réclamations non bloquantes: Performance de traitement" />
              </>
            )}
            { showActe && !showRecl && (
              <>
                <RecapCharts dataset={filteredDataset} type="acte" bucket="bloq" title="Actes bloquants: Performance de traitement" />
                <RecapCharts dataset={filteredDataset} type="acte" bucket="non" title="Actes non bloquants: Performance de traitement" />
              </>
            )}
            { showRecl && !showActe && (
              <>
                <RecapCharts dataset={filteredDataset} type="recl" bucket="bloq" title="Réclamations bloquantes: Performance de traitement" />
                <RecapCharts dataset={filteredDataset} type="recl" bucket="non" title="Réclamations non bloquantes: Performance de traitement" />
              </>
            )}
          </div>
        </main>
      )}

      {view === 'db' && (
        <main>
          <DataTable dataset={dataset} />
        </main>
      )}
    </div>
    <Modal open={modal.open} title={modal.title} onClose={()=> setModal(m=>({...m, open:false}))}>
      <TicketList tickets={modal.tickets} initialFilters={modal.initialFilters} titleExtra={modal.titleExtra} />
    </Modal>
    </>
  )
}
