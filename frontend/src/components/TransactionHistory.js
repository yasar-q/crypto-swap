import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaTimes, FaExternalLinkAlt, FaSync, FaChevronDown, FaChevronUp, FaCopy, FaCheck } from 'react-icons/fa';
import './TransactionHistory.css';

const API_URL     = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const HISTORY_KEY = 'cs_swap_history';

const STATUS_COLORS = {
  waiting:    { bg: '#e5f9fa', color: '#1fc7d4' },
  confirming: { bg: '#fff3cd', color: '#d97706' },
  exchanging: { bg: '#dbeafe', color: '#2563eb' },
  sending:    { bg: '#ede9fe', color: '#7645d9' },
  finished:   { bg: '#d1fae5', color: '#059669' },
  failed:     { bg: '#fee2e2', color: '#dc2626' },
  refunded:   { bg: '#f3f4f6', color: '#6b7280' },
};

const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso || ''; }
};

const CopyBtn = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const doCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="hist-copy-btn" onClick={doCopy} title="Copy">
      {copied ? <FaCheck size={10} /> : <FaCopy size={10} />}
    </button>
  );
};

const TransactionHistory = ({ onClose }) => {
  const [items, setItems]           = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    setItems(list);
  }, []);

  const refreshStatuses = useCallback(async () => {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const pending = list.filter(e => !['finished', 'failed', 'refunded'].includes(e.status));
    if (!pending.length) { setItems(list); return; }

    setRefreshing(true);
    try {
      const updated = [...list];
      await Promise.all(
        pending.map(async (entry) => {
          try {
            const { data } = await axios.get(`${API_URL}/api/exchange-status/${entry.id}`);
            const idx = updated.findIndex(e => e.id === entry.id);
            if (idx !== -1) updated[idx] = { ...updated[idx], status: data.status, amountTo: data.amountTo };
          } catch { /* skip */ }
        })
      );
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      setItems(updated);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refreshStatuses(); }, [refreshStatuses]);

  const clearHistory = () => { localStorage.removeItem(HISTORY_KEY); setItems([]); };

  const stStyle = (status) => STATUS_COLORS[status] || { bg: '#f3f4f6', color: '#6b7280' };

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="hist-overlay" onClick={onClose}>
      <div className="hist-panel" onClick={e => e.stopPropagation()}>
        <div className="hist-header">
          <h3>Recent Transactions</h3>
          <div className="hist-header-actions">
            <button className={`hist-refresh ${refreshing ? 'spinning' : ''}`} onClick={refreshStatuses} title="Refresh statuses">
              <FaSync />
            </button>
            <button className="hist-close" onClick={onClose}><FaTimes /></button>
          </div>
        </div>

        <div className="hist-body">
          {items.length === 0 ? (
            <div className="hist-empty">
              <span style={{ fontSize: 48 }}>📋</span>
              <p>No transactions yet</p>
              <small>Your swaps will appear here</small>
            </div>
          ) : (
            <>
              <div className="hist-list">
                {items.map(tx => {
                  const st = stStyle(tx.status);
                  const isOpen = expandedId === tx.id;
                  return (
                    <div key={tx.id} className={`hist-item ${isOpen ? 'expanded' : ''}`}>
                      {/* Collapsed header — always visible, click to toggle */}
                      <div className="hist-item-top" onClick={() => toggleExpand(tx.id)} style={{ cursor: 'pointer' }}>
                        <div className="hist-pair">
                          <span className="hist-from">{tx.from}</span>
                          <span className="hist-arrow">→</span>
                          <span className="hist-to">{tx.to}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="hist-badge" style={{ background: st.bg, color: st.color }}>{tx.status}</span>
                          <span className="hist-chevron">{isOpen ? <FaChevronUp size={11} /> : <FaChevronDown size={11} />}</span>
                        </div>
                      </div>

                      {/* Brief summary when collapsed */}
                      {!isOpen && (
                        <div className="hist-item-mid">
                          <span>Sent: <strong>{tx.amountFrom} {tx.from}</strong></span>
                          {tx.amountTo && <span>Got: <strong>{tx.amountTo} {tx.to}</strong></span>}
                        </div>
                      )}

                      {/* Full details when expanded */}
                      {isOpen && (
                        <div className="hist-details">
                          <div className="hist-detail-row">
                            <span className="hist-detail-label">Exchange ID</span>
                            <span className="hist-detail-val mono">
                              {tx.id || '—'}
                              {tx.id && <CopyBtn text={tx.id} />}
                            </span>
                          </div>
                          <div className="hist-detail-row">
                            <span className="hist-detail-label">Status</span>
                            <span className="hist-badge" style={{ background: st.bg, color: st.color }}>{tx.status}</span>
                          </div>
                          <div className="hist-detail-row">
                            <span className="hist-detail-label">From</span>
                            <span className="hist-detail-val">
                              <strong>{tx.amountFrom} {tx.from}</strong>
                              {tx.fromNet && <span className="hist-net-tag">{tx.fromNet.toUpperCase()}</span>}
                            </span>
                          </div>
                          <div className="hist-detail-row">
                            <span className="hist-detail-label">To</span>
                            <span className="hist-detail-val">
                              <strong>{tx.amountTo ? `${tx.amountTo} ${tx.to}` : `? ${tx.to}`}</strong>
                              {tx.toNet && <span className="hist-net-tag">{tx.toNet.toUpperCase()}</span>}
                            </span>
                          </div>
                          <div className="hist-detail-row">
                            <span className="hist-detail-label">Date</span>
                            <span className="hist-detail-val">{fmtDate(tx.createdAt)}</span>
                          </div>
                          {tx.id && (
                            <a
                              className="hist-view-btn"
                              href={`https://simpleswap.io/exchange?id=${tx.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              View on SimpleSwap <FaExternalLinkAlt size={11} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button className="hist-clear" onClick={clearHistory}>Clear history</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionHistory;
