import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { FaExchangeAlt, FaCopy, FaCheck, FaCog, FaHistory } from 'react-icons/fa';
import CurrencySelect from './CurrencySelect';
import './SwapInterface.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const HISTORY_KEY = 'cs_swap_history';

// EVM networks supported — used to trigger MetaMask
const EVM_CHAINS = {
  eth:      { chainId: '0x1',    name: 'Ethereum Mainnet',  rpc: 'https://mainnet.infura.io/v3/' },
  bsc:      { chainId: '0x38',   name: 'BNB Smart Chain',   rpc: 'https://bsc-dataseed.binance.org/', native: 'BNB', symbol: 'BNB' },
  matic:    { chainId: '0x89',   name: 'Polygon',           rpc: 'https://polygon-rpc.com/',          native: 'MATIC', symbol: 'MATIC' },
  arb:      { chainId: '0xa4b1', name: 'Arbitrum One',      rpc: 'https://arb1.arbitrum.io/rpc' },
  op:       { chainId: '0xa',    name: 'Optimism',          rpc: 'https://mainnet.optimism.io' },
  avax:     { chainId: '0xa86a', name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc', native: 'AVAX', symbol: 'AVAX' },
  ftm:      { chainId: '0xfa',   name: 'Fantom Opera',      rpc: 'https://rpc.ftm.tools',               native: 'FTM',  symbol: 'FTM' },
};

const BADGE_CLASS = { waiting: 'badge-waiting', confirming: 'badge-confirming', exchanging: 'badge-exchanging', sending: 'badge-sending', finished: 'badge-finished', failed: 'badge-failed', refunded: 'badge-refunded' };

const saveToHistory = (entry) => {
  const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  list.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
};

const SwapInterface = ({ walletAddress, onConnectWallet, onOpenHistory }) => {
  const [currencies, setCurrencies]       = useState([]);
  const [fromCurrency, setFromCurrency]   = useState(null);
  const [toCurrency, setToCurrency]       = useState(null);
  const [amount, setAmount]               = useState('');
  const [estimated, setEstimated]         = useState('');
  const [minMax, setMinMax]               = useState({ min: 0, max: 0 });
  const [loading, setLoading]             = useState(false);
  const [exchangeId, setExchangeId]       = useState(null);
  const [exchangeStatus, setExchangeStatus] = useState(null);
  const [showPayment, setShowPayment]     = useState(false);
  const [paymentAddress, setPaymentAddress] = useState('');
  const [paymentExtraId, setPaymentExtraId] = useState('');
  const [copied, setCopied]               = useState(false);
  const [currenciesLoaded, setCurrenciesLoaded] = useState(false);

  const estimateAbort = useRef(null);
  const pollTimer     = useRef(null);

  // ── Load currencies once ──────────────────────────
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/currencies`);
        const active = data.filter(c => c.is_active !== false);
        setCurrencies(active);
        const btc = active.find(c => c.ticker === 'btc' && c.network === 'btc');
        const eth = active.find(c => c.ticker === 'eth' && c.network === 'eth');
        setFromCurrency(btc || active[0]);
        setToCurrency(eth  || active[1] || active[0]);
        setCurrenciesLoaded(true);
      } catch {
        toast.error('Failed to load currencies');
      }
    };
    fetchCurrencies();
    return () => clearInterval(pollTimer.current);
  }, []);

  // ── Fetch range when pair / rate type changes ──────
  const fetchRange = useCallback(async () => {
    if (!fromCurrency || !toCurrency) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/range`, {
        params: { from_currency: fromCurrency.ticker, to_currency: toCurrency.ticker, from_network: fromCurrency.network, to_network: toCurrency.network, fixed: false }
      });
      setMinMax({ min: parseFloat(data.min) || 0, max: parseFloat(data.max) || 0 });
    } catch { /* silent */ }
  }, [fromCurrency, toCurrency, false]);

  useEffect(() => { fetchRange(); }, [fetchRange]);

  // ── Estimate with debounce + abort ──────────────────
  const fetchEstimate = useCallback(async () => {
    if (!amount || !fromCurrency || !toCurrency) return;
    const num = parseFloat(amount);
    if (minMax.min > 0 && (num < minMax.min || (minMax.max > 0 && num > minMax.max))) { setEstimated(''); return; }

    if (estimateAbort.current) estimateAbort.current.abort();
    estimateAbort.current = new AbortController();

    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/estimate`, {
        params: { from_currency: fromCurrency.ticker, to_currency: toCurrency.ticker, from_network: fromCurrency.network, to_network: toCurrency.network, amount, fixed: false, reverse: false },
        signal: estimateAbort.current.signal
      });
      setEstimated(data.final_amount || data.estimatedAmount || '');
    } catch (e) {
      if (!axios.isCancel(e)) toast.error('Estimate failed');
    } finally {
      setLoading(false);
    }
  }, [amount, fromCurrency, toCurrency, minMax, false]);

  useEffect(() => {
    if (!amount) { setEstimated(''); return; }
    const t = setTimeout(fetchEstimate, 400);
    return () => clearTimeout(t);
  }, [amount, fetchEstimate]);

  // ── Poll exchange status ──────────────────────────
  const startPolling = (id) => {
    clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/exchange-status/${id}`);
        const status = data.status;
        setExchangeStatus(status);

        // Update history entry
        const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const idx  = list.findIndex(e => e.id === id);
        if (idx !== -1) { list[idx].status = status; localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }

        if (['finished', 'failed', 'refunded'].includes(status)) {
          clearInterval(pollTimer.current);
          if (status === 'finished') { toast.success('Exchange completed!'); setShowPayment(false); }
          else if (status === 'failed') toast.error('Exchange failed. Contact support.');
          else if (status === 'refunded') toast('Exchange refunded.', { icon: '↩️' });
        }
      } catch { /* silent */ }
    }, 5000);
  };

  // ── Web3 payment trigger ──────────────────────────
  const triggerWeb3Payment = async (depositAddress, sendAmount, currency) => {
    if (!window.ethereum) return false;
    const chain = EVM_CHAINS[currency.network];
    if (!chain) return false; // non-EVM chain, show QR

    try {
      // Switch / add network
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: chain.chainId, chainName: chain.name, rpcUrls: [chain.rpc], nativeCurrency: { name: chain.native || 'ETH', symbol: chain.symbol || 'ETH', decimals: 18 } }]
          });
        } else throw switchErr;
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const from = accounts[0];

      if (!currency.contractAddress) {
        // Native token (ETH, BNB, MATIC…)
        const decimals = currency.precision || 18;
        const wei = BigInt(Math.round(parseFloat(sendAmount) * Math.pow(10, decimals)));
        await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from, to: depositAddress, value: '0x' + wei.toString(16), gas: '0x5208' }]
        });
      } else {
        // ERC-20 / BEP-20 token
        const decimals = currency.precision || 18;
        const amt = BigInt(Math.round(parseFloat(sendAmount) * Math.pow(10, decimals)));
        const paddedAddr = depositAddress.replace('0x', '').padStart(64, '0');
        const paddedAmt  = amt.toString(16).padStart(64, '0');
        const data = '0xa9059cbb' + paddedAddr + paddedAmt;
        await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from, to: currency.contractAddress, value: '0x0', data, gas: '0x186a0' }]
        });
      }
      return true;
    } catch (err) {
      if (err.code === 4001) toast('Transaction cancelled.', { icon: '✋' });
      else toast.error('Web3 error: ' + (err.message || 'unknown'));
      return false;
    }
  };

  // ── Create exchange ──────────────────────────────
  const createExchange = async () => {
    if (!walletAddress) { onConnectWallet(); return; }
    const num = parseFloat(amount);
    if (!amount || !num) { toast.error('Enter an amount'); return; }
    if (minMax.min > 0 && num < minMax.min) { toast.error(`Minimum: ${minMax.min} ${fromCurrency.ticker.toUpperCase()}`); return; }
    if (minMax.max > 0 && num > minMax.max) { toast.error(`Maximum: ${minMax.max} ${fromCurrency.ticker.toUpperCase()}`); return; }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/create-exchange`, {
        from_currency: fromCurrency.ticker,
        to_currency:   toCurrency.ticker,
        from_network:  fromCurrency.network,
        to_network:    toCurrency.network,
        amount,
        fixed:          false,
        address:        walletAddress,
        refund_address: walletAddress,
        rateId:         null
      });

      const id      = data.publicId;
      const deposit = data.addressFrom;
      const extraId = data.extraIdFrom || '';

      setExchangeId(id);
      setPaymentAddress(deposit);
      setPaymentExtraId(extraId);
      setExchangeStatus('waiting');

      // Save to localStorage history
      saveToHistory({
        id,
        from:     fromCurrency.ticker.toUpperCase(),
        fromNet:  fromCurrency.network,
        to:       toCurrency.ticker.toUpperCase(),
        toNet:    toCurrency.network,
        amountFrom: amount,
        status:   'waiting',
        createdAt: new Date().toISOString()
      });

      toast.success('Exchange created!');
      startPolling(id);

      // Try MetaMask / Trust Wallet auto-send
      const web3Sent = await triggerWeb3Payment(deposit, amount, fromCurrency);
      if (!web3Sent) setShowPayment(true); // fallback: show address manually
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create exchange');
    } finally {
      setLoading(false);
    }
  };

  // ── Swap currencies ──────────────────────────────
  const swapPair = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setAmount('');
    setEstimated('');
    setMinMax({ min: 0, max: 0 });
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(paymentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied!');
  };

  const amountNum   = parseFloat(amount) || 0;
  const belowMin    = minMax.min > 0 && amountNum > 0 && amountNum < minMax.min;
  const aboveMax    = minMax.max > 0 && amountNum > minMax.max;
  const rangeError  = belowMin || aboveMax;
  const canSwap     = !!amount && !rangeError && !loading && !!estimated;

  const btnLabel = () => {
    if (!walletAddress)       return 'Connect Wallet';
    if (loading)              return <><span className="spin">⟳</span> Loading…</>;
    if (!amount)              return 'Enter an amount';
    if (rangeError)           return `Amount out of range`;
    if (!estimated)           return 'Getting rate…';
    return 'Swap';
  };

  if (!currenciesLoaded) {
    return (
      <div className="swap-wrapper">
        <div className="swap-card" style={{ textAlign: 'center', padding: '48px', color: '#7a6eaa' }}>
          <span className="spin" style={{ fontSize: 28 }}>⟳</span>
          <p style={{ marginTop: 12 }}>Loading currencies…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="swap-wrapper">
        {/* ── Main card ── */}
        <div className="swap-card">
          <div className="swap-tabs">
            <button className="swap-tab active">Swap</button>
            <span className="swap-tab-spacer" />
            <button className="settings-btn" title="Settings"><FaCog /></button>
            <button className="settings-btn" title="History" onClick={onOpenHistory}><FaHistory /></button>
          </div>

          {/* FROM */}
          <div className="section-label">From</div>
          <div className="token-box">
            <CurrencySelect currencies={currencies} selectedCurrency={fromCurrency} onSelect={setFromCurrency} exclude={toCurrency} />
            <div className="amount-col">
              <input
                className="amount-input"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.0"
              />
              <span className="amount-usd">~0 USD</span>
            </div>
          </div>
          {rangeError && (
            <div className="range-error">
              {belowMin ? `Min: ${minMax.min} ${fromCurrency.ticker.toUpperCase()}` : `Max: ${minMax.max} ${fromCurrency.ticker.toUpperCase()}`}
            </div>
          )}

          {/* Arrow */}
          <div className="swap-arrow-row">
            <div className="divider-line" />
            <button className="swap-arrow-btn" onClick={swapPair} title="Switch"><FaExchangeAlt /></button>
          </div>

          {/* TO */}
          <div className="section-label">To</div>
          <div className="token-box">
            <CurrencySelect currencies={currencies} selectedCurrency={toCurrency} onSelect={setToCurrency} exclude={fromCurrency} />
            <div className="amount-col">
              <input
                className="amount-input"
                type="text"
                readOnly
                value={loading ? '…' : estimated}
                placeholder="0.0"
              />
              <span className="amount-usd">~0 USD</span>
            </div>
          </div>

          {/* Exchange info */}
          {estimated && amount && (
            <div className="exchange-info">
              <div className="info-row">
                <span>Rate</span>
                <strong>1 {fromCurrency.ticker.toUpperCase()} ≈ {(parseFloat(estimated) / parseFloat(amount)).toFixed(6)} {toCurrency.ticker.toUpperCase()}</strong>
              </div>
              {minMax.min > 0 && (
                <>
                  <div className="info-row"><span>Minimum</span><strong>{minMax.min} {fromCurrency.ticker.toUpperCase()}</strong></div>
                  {minMax.max > 0 && <div className="info-row"><span>Maximum</span><strong>{minMax.max} {fromCurrency.ticker.toUpperCase()}</strong></div>}
                </>
              )}
            </div>
          )}

          {/* Current exchange status */}
          {exchangeId && (
            <div className="status-box" style={{ marginTop: 14 }}>
              <span className="exchange-id">ID: {exchangeId}</span>
              <span className={`status-badge ${BADGE_CLASS[exchangeStatus] || 'badge-waiting'}`}>{exchangeStatus || 'waiting'}</span>
            </div>
          )}
        </div>

        {/* ── Bottom card ── */}
        <div className="bottom-card">
          <div className="slippage-row">
            <a href="#">Slippage Tolerance</a>
            <span className="slippage-value">Auto: 0.50% ✏️</span>
          </div>
          <button
            className={`action-btn ${!walletAddress ? 'connect' : canSwap ? 'swap-ready' : ''} ${loading ? 'loading' : ''}`}
            onClick={createExchange}
            disabled={!!walletAddress && (!canSwap && !loading)}
          >
            {btnLabel()}
          </button>
        </div>
      </div>

      {/* ── Payment modal ── */}
      {showPayment && paymentAddress && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Send Payment</h3>
              <button className="modal-close" onClick={() => setShowPayment(false)}>×</button>
            </div>

            <div className="payment-amount">{amount} {fromCurrency.ticker.toUpperCase()}</div>
            <div className="payment-amount-label">Send exactly this amount to the address below</div>

            <div className="address-box">
              <code>{paymentAddress}</code>
              <button className="copy-btn" onClick={copyAddress}>
                {copied ? <FaCheck /> : <FaCopy />}
              </button>
            </div>

            {paymentExtraId && (
              <div className="extra-id-box">
                <strong>⚠️ Memo / Tag required:</strong>
                {paymentExtraId}
              </div>
            )}

            <div className="qr-wrapper">
              <QRCodeSVG value={paymentAddress} size={160} />
            </div>

            {/* MetaMask button if EVM */}
            {EVM_CHAINS[fromCurrency.network] && (
              <button
                className="metamask-btn"
                onClick={async () => {
                  const sent = await triggerWeb3Payment(paymentAddress, amount, fromCurrency);
                  if (sent) setShowPayment(false);
                }}
              >
                🦊 Pay with MetaMask / Wallet
              </button>
            )}

            <p className="modal-note">Transaction is tracked automatically</p>
          </div>
        </div>
      )}

      {/* ── Transaction history ── */}
    </>
  );
};

export default SwapInterface;
