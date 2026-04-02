import { useState, useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import SwapInterface from './components/SwapInterface';
import TransactionHistory from './components/TransactionHistory';
import './App.css';

const APP_NAME = process.env.REACT_APP_APP_NAME || 'CryptoSwap';
const APP_LOGO = process.env.REACT_APP_APP_LOGO || '🔄';

const CHAIN_META = {
  '0x1':    { abbr: 'ETH',  color: '#627EEA', name: 'Ethereum' },
  '0x38':   { abbr: 'BNB',  color: '#F3BA2F', name: 'BNB Chain' },
  '0x89':   { abbr: 'POL',  color: '#8247E5', name: 'Polygon' },
  '0xa4b1': { abbr: 'ARB',  color: '#28A0F0', name: 'Arbitrum' },
  '0xa':    { abbr: 'OP',   color: '#FF0420', name: 'Optimism' },
  '0xa86a': { abbr: 'AVAX', color: '#E84142', name: 'Avalanche' },
  '0xfa':   { abbr: 'FTM',  color: '#1969FF', name: 'Fantom' },
};

const SWITCH_CHAINS = [
  { chainId: '0x1',    name: 'Ethereum' },
  { chainId: '0x38',   name: 'BNB Chain',  rpc: 'https://bsc-dataseed.binance.org/', native: 'BNB',  symbol: 'BNB' },
  { chainId: '0x89',   name: 'Polygon',    rpc: 'https://polygon-rpc.com/',          native: 'MATIC', symbol: 'MATIC' },
  { chainId: '0xa4b1', name: 'Arbitrum',   rpc: 'https://arb1.arbitrum.io/rpc' },
];

function App() {
  const [isConnected, setIsConnected]             = useState(false);
  const [walletAddress, setWalletAddress]         = useState('');
  const [currentChain, setCurrentChain]           = useState('');
  const [showWalletMenu, setShowWalletMenu]       = useState(false);
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [showHistory, setShowHistory]             = useState(false);
  const walletMenuRef = useRef(null);

  const getChain = async () => {
    if (!window.ethereum) return;
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      setCurrentChain(chainId);
    } catch { /* silent */ }
  };

  const checkWalletConnection = async () => {
    if (!window.ethereum) return;
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        setIsConnected(true);
        setWalletAddress(accounts[0]);
        getChain();
      }
    } catch { /* silent */ }
  };

  const connectWallet = async () => {
    if (!window.ethereum) { alert('Please install MetaMask or Trust Wallet!'); return; }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setIsConnected(true);
      setWalletAddress(accounts[0]);
      getChain();
    } catch { /* user rejected */ }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setWalletAddress('');
    setCurrentChain('');
    setShowWalletMenu(false);
  };

  const switchWallet = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) { setIsConnected(true); setWalletAddress(accounts[0]); }
    } catch { /* user cancelled */ }
    setShowWalletMenu(false);
  };

  const switchChain = async (chain) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainId }] });
      setCurrentChain(chain.chainId);
    } catch (err) {
      if (err.code === 4902 && chain.rpc) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: chain.chainId, chainName: chain.name, rpcUrls: [chain.rpc], nativeCurrency: { name: chain.native || 'ETH', symbol: chain.symbol || 'ETH', decimals: 18 } }]
          });
          setCurrentChain(chain.chainId);
        } catch { /* silent */ }
      }
    }
    setShowNetworkPicker(false);
    setShowWalletMenu(false);
  };

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target)) {
        setShowWalletMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    checkWalletConnection();
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) { setIsConnected(true); setWalletAddress(accounts[0]); getChain(); }
        else { setIsConnected(false); setWalletAddress(''); setCurrentChain(''); }
      });
      window.ethereum.on('chainChanged', (chainId) => setCurrentChain(chainId));
    }
  }, []);

  const chainMeta = CHAIN_META[currentChain];

  return (
    <div className="App">
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: '#27262c', color: '#fff', borderRadius: '16px' } }} />

      <nav className="navbar">
        <div className="nav-container">
          <span className="logo">
            <span className="logo-icon">{APP_LOGO}</span>
            {APP_NAME}
          </span>

          <div className="nav-links">
            <a href="#swap" className="nav-link active">Trade</a>
            <button className="nav-link nav-btn" onClick={() => setShowHistory(true)}>History</button>
          </div>

          <div className="nav-right" ref={walletMenuRef}>
            <button
              className={`wallet-button ${isConnected ? 'connected' : ''}`}
              onClick={isConnected ? () => setShowWalletMenu(v => !v) : connectWallet}
            >
              {isConnected ? (
                <>
                  <span className="wallet-dot" />
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  {chainMeta && (
                    <span className="chain-icon-badge" style={{ background: chainMeta.color }}>
                      {chainMeta.abbr}
                    </span>
                  )}
                </>
              ) : 'Connect Wallet'}
            </button>

            {showWalletMenu && isConnected && (
              <div className="wallet-menu">
                <div className="wallet-menu-address">
                  <span className="wallet-dot" />
                  <span>{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</span>
                </div>
                {chainMeta && (
                  <div className="wallet-menu-chain">
                    <span className="chain-dot" style={{ background: chainMeta.color }} />
                    {chainMeta.name}
                  </div>
                )}
                <div className="wallet-menu-divider" />
                <button className="wallet-menu-item" onClick={() => { setShowNetworkPicker(true); setShowWalletMenu(false); }}>
                  🔗 Switch Network
                </button>
                <button className="wallet-menu-item" onClick={switchWallet}>
                  👛 Switch Wallet
                </button>
                <div className="wallet-menu-divider" />
                <button className="wallet-menu-item disconnect" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="main-content">
        <SwapInterface
          walletAddress={walletAddress}
          onConnectWallet={connectWallet}
          onOpenHistory={() => setShowHistory(true)}
        />
      </main>

      {showHistory && <TransactionHistory onClose={() => setShowHistory(false)} />}

      {/* Network picker modal */}
      {showNetworkPicker && (
        <div className="net-picker-overlay" onClick={() => setShowNetworkPicker(false)}>
          <div className="net-picker" onClick={e => e.stopPropagation()}>
            <div className="net-picker-header">
              <span>Switch Network</span>
              <button className="net-picker-close" onClick={() => setShowNetworkPicker(false)}>×</button>
            </div>
            {SWITCH_CHAINS.map(c => {
              const meta = CHAIN_META[c.chainId] || { abbr: '?', color: '#999' };
              const isActive = currentChain === c.chainId;
              return (
                <button key={c.chainId} className={`net-picker-item ${isActive ? 'active' : ''}`}
                  onClick={() => switchChain(c)}>
                  <span className="net-picker-icon" style={{ background: meta.color }}>{meta.abbr}</span>
                  <span className="net-picker-name">{c.name}</span>
                  {isActive && <span className="chain-active-tag">Connected</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer-content">
          <p>© 2024 {APP_NAME} · Powered by SimpleSwap</p>
          <div className="footer-links">
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
