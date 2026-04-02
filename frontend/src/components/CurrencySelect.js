import { useState, useMemo } from 'react';
import { FaSearch, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import './CurrencySelect.css';

const POPULAR = ['btc', 'eth', 'usdt', 'bnb', 'sol', 'matic'];

const TokenImage = ({ src, alt, imgClass, placeholderClass }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return <div className={placeholderClass}>{(alt || '??').toUpperCase().slice(0, 2)}</div>;
  }
  return <img src={src} alt={alt} className={imgClass} onError={() => setErr(true)} />;
};

const CurrencySelect = ({ currencies, selectedCurrency, onSelect, exclude }) => {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState('');
  const [activeNet, setActiveNet] = useState('all');

  // Derive unique networks for filter bar (top 8 by count)
  const networks = useMemo(() => {
    const count = {};
    currencies.forEach(c => { count[c.network] = (count[c.network] || 0) + 1; });
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([net]) => net);
  }, [currencies]);

  // Representative icon per network
  const netIcon = useMemo(() => {
    const map = {};
    currencies.forEach(c => { if (c.image && !map[c.network]) map[c.network] = c.image; });
    return map;
  }, [currencies]);

  // Popular token objects
  const popular = useMemo(() =>
    POPULAR.map(t => currencies.find(c => c.ticker === t)).filter(Boolean),
    [currencies]
  );

  // Filtered list (capped at 100 for performance)
  const filtered = useMemo(() => {
    let list = currencies;
    if (exclude) list = list.filter(c => !(c.ticker === exclude.ticker && c.network === exclude.network));
    if (activeNet !== 'all') list = list.filter(c => c.network === activeNet);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.ticker.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)
      );
    }
    return list.slice(0, 100);
  }, [currencies, exclude, activeNet, search]);

  const pick = (currency) => {
    onSelect(currency);
    setOpen(false);
    setSearch('');
    setActiveNet('all');
  };

  if (!selectedCurrency) return null;

  return (
    <>
      {/* Inline select button */}
      <button className="token-select-btn" onClick={() => setOpen(true)}>
        <TokenImage src={selectedCurrency.image} alt={selectedCurrency.ticker} imgClass="token-icon" placeholderClass="token-icon-placeholder" />
        <div className="token-name-col">
          <span className="token-ticker">{selectedCurrency.ticker.toUpperCase()}</span>
          <span className="token-network">{selectedCurrency.network.toUpperCase()}</span>
        </div>
        <FaChevronDown className="token-chevron" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="cs-overlay" onClick={() => setOpen(false)}>
          <div className="cs-modal" onClick={e => e.stopPropagation()}>

            <div className="cs-header">
              <h3>Select token</h3>
              <button className="cs-close" onClick={() => setOpen(false)}>×</button>
            </div>

            <div className="cs-search-row">
              <div className="cs-search">
                <FaSearch className="cs-search-icon" />
                <input
                  autoFocus
                  placeholder="Search name or address"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Network filter */}
            <div className="cs-networks">
              <div className="cs-networks-label">Network</div>
              <div className="cs-network-icons">
                <button className={`cs-net-btn ${activeNet === 'all' ? 'active' : ''}`} onClick={() => setActiveNet('all')}>ALL</button>
                {networks.map(net => (
                  <button key={net} className={`cs-net-btn ${activeNet === net ? 'active' : ''}`} onClick={() => setActiveNet(net)} title={net.toUpperCase()}>
                    {netIcon[net] ? <img src={netIcon[net]} alt={net} /> : net.toUpperCase().slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Popular tokens */}
            {!search && popular.length > 0 && (
              <div className="cs-popular">
                <div className="cs-popular-label">Popular tokens</div>
                <div className="cs-popular-pills">
                  {popular.map(c => (
                    <button key={`${c.ticker}-${c.network}`} className="cs-popular-pill" onClick={() => pick(c)}>
                      <TokenImage src={c.image} alt={c.ticker} imgClass="cs-popular-img" placeholderClass="cs-popular-placeholder" />
                      {c.ticker.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Token list */}
            <div className="cs-list">
              {filtered.length === 0
                ? <div className="cs-empty">No tokens found</div>
                : filtered.map(c => {
                    const isSel = selectedCurrency.ticker === c.ticker && selectedCurrency.network === c.network;
                    return (
                      <button key={`${c.ticker}-${c.network}`} className={`cs-token-row ${isSel ? 'selected' : ''}`} onClick={() => pick(c)}>
                        <TokenImage src={c.image} alt={c.ticker} imgClass="cs-token-img" placeholderClass="cs-token-placeholder" />
                        <div className="cs-token-info">
                          <div className="t-ticker">{c.ticker.toUpperCase()}</div>
                          <div className="t-name">{c.name || c.ticker}</div>
                        </div>
                        <span className="cs-net-tag">{c.network.toUpperCase()}</span>
                        <FaChevronRight className="cs-token-arrow" />
                      </button>
                    );
                  })
              }
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CurrencySelect;
