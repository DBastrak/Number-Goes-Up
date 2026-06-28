import { formatDate } from '../utils/format'

export default function Notifications({ items = [], onClear, onClose }) {
  return (
    <>
      <div className="notif-backdrop" onClick={onClose} />
      <div className="notif-pop" role="dialog">
        <div className="notif-head">
          <span className="notif-title">New clears since launch</span>
          <div className="notif-head-actions">
            {items.length > 0 && (
              <button className="notif-clear" onClick={onClear}>
                Clear
              </button>
            )}
            <button className="notif-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="notif-empty">
            No new clears since the app launched. Followed Guardians&apos; clears will appear here.
          </div>
        ) : (
          <ul className="notif-list">
            {items.map((it, i) => (
              <li key={`${it.instanceId}-${i}`} className="notif-item">
                <span className="notif-icon" aria-hidden="true">
                  {it.mode === 'raid' ? '⚔' : '☠'}
                </span>
                <div className="notif-body">
                  <div className="notif-line">
                    <span className="notif-user">{it.user}</span>
                    <span className="notif-date">{formatDate(it.period)}</span>
                  </div>
                  <div className="notif-activity">
                    {it.activityName}
                    {it.difficulty && it.difficulty !== 'normal' && (
                      <span className={`activity-tag tag-${it.difficulty}`}>{it.difficulty}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
