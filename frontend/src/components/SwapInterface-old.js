import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { FaExchangeAlt, FaCopy, FaCheck, FaArrowDown } from 'react-icons/fa';
import CurrencySelect from './CurrencySelect';
import LoadingSpinner from './LoadingSpinner';
import TransactionHistory from './TransactionHistory';
import './SwapInterface.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const SwapInterface = ({ walletAddress }) => {
  const [currencies, setCurrencies] = useState([]);
  const [fromCurrency, setFromCurrency] = useState(null);
  const [toCurrency, setToCurrency] = useState(null);
  const [amount, setAmount] = useState('');
  const [estimatedAmount, setEstimatedAmount] = useState('');
  const [minMax, setMinMax] = useState({ min: 0, max: 0 });
  const [loading, setLoading] = useState(false);
  const [fixedRate, setFixedRate] = useState(true);
  const [exchangeId, setExchangeId] = useState(null);
  const [exchangeStatus, setExchangeStatus] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [rateId, setRateId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [paymentAddress, setPaymentAddress] = useState('');

  // Fetch currencies on mount
  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/currencies`);
      const activeCurrencies = response.data.filter(c => c.is_active !== false);
      setCurrencies(activeCurrencies);
      
      // Set default currencies
      if (activeCurrencies.length > 0) {
        const btc = activeCurrencies.find(c => c.ticker === 'btc');
        const eth = activeCurrencies.find(c => c.ticker === 'eth');
        setFromCurrency(btc || activeCurrencies[0]);
        setToCurrency(eth || activeCurrencies[1] || activeCurrencies[0]);
      }
    } catch (error) {
      toast.error('Failed to load currencies');
      console.error(error);
    }
  };

  const fetchRange = useCallback(async () => {
    if (!fromCurrency || !toCurrency) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/range`, {
        params: {
          from_currency: fromCurrency.ticker,
          to_currency: toCurrency.ticker,
          from_network: fromCurrency.network,
          to_network: toCurrency.network,
          fixed: fixedRate
        }
      });
      setMinMax({
        min: parseFloat(response.data.min),
        max: parseFloat(response.data.max)
      });
    } catch (error) {
      console.error('Failed to fetch range:', error);
    }
  }, [fromCurrency, toCurrency, fixedRate]);

  const fetchEstimate = useCallback(async () => {
    if (!amount || !fromCurrency || !toCurrency) return;
    
    const numAmount = parseFloat(amount);
    if (numAmount < minMax.min || numAmount > minMax.max) {
      setEstimatedAmount('');
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/estimate`, {
        params: {
          from_currency: fromCurrency.ticker,
          to_currency: toCurrency.ticker,
          from_network: fromCurrency.network,
          to_network: toCurrency.network,
          amount: amount,
          fixed: fixedRate,
          reverse: false
        }
      });
      
      setEstimatedAmount(response.data.final_amount || response.data.estimated_amount);
      if (response.data.rate_id) {
        setRateId(response.data.rate_id);
      }
    } catch (error) {
      toast.error('Failed to get estimate');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [amount, fromCurrency, toCurrency, minMax, fixedRate]);

  const createExchange = async () => {
    if (!walletAddress) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    if (!amount || parseFloat(amount) < minMax.min || parseFloat(amount) > minMax.max) {
      toast.error(`Amount must be between ${minMax.min} and ${minMax.max}`);
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/create-exchange`, {
        from_currency: fromCurrency.ticker,
        to_currency: toCurrency.ticker,
        from_network: fromCurrency.network,
        to_network: toCurrency.network,
        amount: amount,
        fixed: fixedRate,
        address: walletAddress,
        refund_address: walletAddress
      });
      
      setExchangeId(response.data.id);
      setPaymentAddress(response.data.payin_address);
      
      toast.success('Exchange created successfully!');
      
      // Start polling for status
      pollExchangeStatus(response.data.id);
      
      // Show payment modal
      setShowQR(true);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create exchange');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const pollExchangeStatus = async (id) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/api/exchange-status/${id}`);
        setExchangeStatus(response.data.status);
        
        if (['finished', 'failed', 'refunded'].includes(response.data.status)) {
          clearInterval(interval);
          if (response.data.status === 'finished') {
            toast.success('Exchange completed successfully!');
            setShowQR(false);
          } else if (response.data.status === 'failed') {
            toast.error('Exchange failed. Please contact support.');
          }
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 3000);
  };

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setAmount('');
    setEstimatedAmount('');
    setMinMax({ min: 0, max: 0 });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard!');
  };

  useEffect(() => {
    if (fromCurrency && toCurrency) {
      fetchRange();
    }
  }, [fromCurrency, toCurrency, fetchRange]);

  useEffect(() => {
    if (amount && minMax.min && minMax.max) {
      const debounce = setTimeout(() => fetchEstimate(), 500);
      return () => clearTimeout(debounce);
    }
  }, [amount, fetchEstimate, minMax]);

  if (!fromCurrency || !toCurrency) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <motion.div 
        className="swap-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="swap-card">
          <div className="swap-header">
            <h2>Swap</h2>
            <button 
              className="history-button"
              onClick={() => setShowHistory(!showHistory)}
            >
              📜 History
            </button>
          </div>
          
          <div className="rate-toggle-container">
            <button 
              className={`rate-toggle ${fixedRate ? 'active' : ''}`}
              onClick={() => setFixedRate(true)}
            >
              Fixed Rate
            </button>
            <button 
              className={`rate-toggle ${!fixedRate ? 'active' : ''}`}
              onClick={() => setFixedRate(false)}
            >
              Floating Rate
            </button>
          </div>
          
          {/* From Section */}
          <motion.div 
            className="swap-section from-section"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="section-label">
              <span>You Send</span>
              <span className="balance">Balance: --</span>
            </div>
            <div className="input-group">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="amount-input"
              />
              <CurrencySelect
                currencies={currencies}
                selectedCurrency={fromCurrency}
                onSelect={setFromCurrency}
              />
            </div>
            {amount && (parseFloat(amount) < minMax.min || parseFloat(amount) > minMax.max) && (
              <motion.div 
                className="error-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Amount must be between {minMax.min} and {minMax.max}
              </motion.div>
            )}
          </motion.div>
          
          {/* Swap Button */}
          <motion.button 
            className="swap-button"
            onClick={swapCurrencies}
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.95 }}
          >
            <FaExchangeAlt />
          </motion.button>
          
          {/* To Section */}
          <motion.div 
            className="swap-section to-section"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="section-label">
              <span>You Receive</span>
              <span className="rate">
                Rate: 1 {fromCurrency.ticker.toUpperCase()} ≈ {estimatedAmount && amount ? 
                  (parseFloat(estimatedAmount) / parseFloat(amount)).toFixed(8) : '0.00'} {toCurrency.ticker.toUpperCase()}
              </span>
            </div>
            <div className="input-group">
              <input
                type="text"
                value={loading ? 'Calculating...' : estimatedAmount}
                readOnly
                placeholder="0.00"
                className="amount-input"
              />
              <CurrencySelect
                currencies={currencies}
                selectedCurrency={toCurrency}
                onSelect={setToCurrency}
              />
            </div>
          </motion.div>
          
          {/* Exchange Info */}
          {minMax.min > 0 && (
            <motion.div 
              className="info-box"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="info-item">
                <span>Min:</span>
                <strong>{minMax.min} {fromCurrency.ticker.toUpperCase()}</strong>
              </div>
              <div className="info-item">
                <span>Max:</span>
                <strong>{minMax.max} {fromCurrency.ticker.toUpperCase()}</strong>
              </div>
              {fixedRate && (
                <div className="info-item">
                  <span>Rate valid for:</span>
                  <strong>15 minutes</strong>
                </div>
              )}
            </motion.div>
          )}
          
          {/* Action Button */}
          <motion.button 
            className="exchange-button"
            onClick={createExchange}
            disabled={loading || !amount || parseFloat(amount) < minMax.min || parseFloat(amount) > minMax.max}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? <LoadingSpinner size="small" /> : 'Start Exchange'}
          </motion.button>
          
          {/* Status Display */}
          {exchangeId && (
            <motion.div 
              className="status-box"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h4>Exchange ID: {exchangeId}</h4>
              <div className="status-badge" data-status={exchangeStatus || 'pending'}>
                {exchangeStatus || 'Pending'}
              </div>
              {exchangeStatus === 'finished' && (
                <div className="success-message">✓ Exchange Completed!</div>
              )}
              {exchangeStatus === 'failed' && (
                <div className="error-message">✗ Exchange Failed</div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
      
      {/* QR Modal */}
      <AnimatePresence>
        {showQR && paymentAddress && (
          <motion.div 
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowQR(false)}
          >
            <motion.div 
              className="modal-content"
              initial={{ scale: 0.8, y: 100 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 100 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Send Payment</h3>
              <p>Send exactly {amount} {fromCurrency.ticker.toUpperCase()} to:</p>
              <div className="payment-address">
                <code>{paymentAddress}</code>
                <button onClick={() => copyToClipboard(paymentAddress)}>
                  {copied ? <FaCheck /> : <FaCopy />}
                </button>
              </div>
              <div className="qr-code">
                {/* QR code component would go here */}
              </div>
              <p className="note">Transaction will be tracked automatically</p>
              <button className="close-modal" onClick={() => setShowQR(false)}>
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Transaction History */}
      {showHistory && (
        <TransactionHistory 
          walletAddress={walletAddress}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
};

export default SwapInterface;