// Selected-file preview card: name, type, size, and a remove/change control.
// Shows a thumbnail for images, an icon for documents. Presentational.

import { FileText, Image as ImageIcon, X } from 'lucide-react'

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let val = bytes / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export default function FilePreview({ file, kind, previewUrl, onRemove }) {
  if (!file) return null
  const isImage = kind === 'image'
  const typeLabel = file.type || (isImage ? 'image' : 'document')

  return (
    <div className="du-file">
      <div className="du-file-thumb">
        {isImage && previewUrl
          ? <img src={previewUrl} alt={file.name} className="du-file-img" />
          : <span className="du-file-ic">{isImage ? <ImageIcon size={22} /> : <FileText size={22} />}</span>}
      </div>
      <div className="du-file-info">
        <span className="du-file-name" title={file.name}>{file.name}</span>
        <span className="du-file-meta">{typeLabel}{file.size != null ? ` · ${formatBytes(file.size)}` : ''}</span>
      </div>
      <button type="button" className="du-file-remove" onClick={onRemove} aria-label="Remove file"><X size={16} /></button>
    </div>
  )
}
