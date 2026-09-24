// Label/value row inside a card. Empty values read "Not provided" — never
// "None", which would be a clinical claim the user didn't make.
export default function InfoRow({ label, value, icon: Icon, empty = 'Not provided' }) {
  const has = value != null && String(value).trim() !== ''
  return (
    <div className="ui-info-row">
      <span className="ui-info-label">{Icon && <Icon size={16} aria-hidden="true" />}{label}</span>
      <span className={`ui-info-value ${has ? '' : 'is-empty'}`}>{has ? value : empty}</span>
    </div>
  )
}
