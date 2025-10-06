import React from 'react'

export default function DataTable({dataset=[]}){
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Données</h2>
      <div className="overflow-auto bg-white rounded shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="p-2">Référence</th>
              <th className="p-2">Canal Interaction</th>
              <th className="p-2">Date de création</th>
              <th className="p-2">Date de clôture</th>
              <th className="p-2">Traiteur</th>
              <th className="p-2">Durée de traitement</th>
            </tr>
          </thead>
          <tbody>
            {dataset.map((d, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{d._orig['Référence'] || d._orig['reference'] || ''}</td>
                <td className="p-2">{d._orig['Canal Interaction'] || d._orig['canal'] || ''}</td>
                <td className="p-2">{d.date || ''}</td>
                <td className="p-2">{d.date_cloture || ''}</td>
                <td className="p-2">{d.traiteur || ''}</td>
                <td className="p-2">{d.duration || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
