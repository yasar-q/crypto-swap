import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaCheckCircle, 
  FaExclamationCircle, 
  FaInfoCircle, 
  FaTimesCircle,
  FaTimes,
  FaSpinner
} from 'react-icons/fa';
import './ToastNotification.css';

// Toast Context for global state management
export const ToastContext = React.createContext();

// Toast Provider Component
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
    const newToast = {
      id,
      message,
      type,
      duration,
      timestamp: new Date()
    };
    
    setToasts(prev => [...prev, newToast]);
    
    if (duration !== Infinity) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  }, []);

  return (
    <ToastContext.Provider value={{ 
      toasts, 
      addToast, 
      removeToast, 
      clearAllToasts,
      updateToast 
    }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

// Custom hook for using toast
export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// Individual Toast Component
const Toast = ({ id, message, type, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => Math.max(0, prev - 2));
    }, 100);
    
    return () => clearInterval(timer);
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 300);
  };

  const getIcon = () => {
    switch(type) {
      case 'success':
        return <FaCheckCircle className="toast-icon success" />;
      case 'error':
        return <FaTimesCircle className="toast-icon error" />;
      case 'warning':
        return <FaExclamationCircle className="toast-icon warning" />;
      case 'loading':
        return <FaSpinner className="toast-icon loading spin" />;
      default:
        return <FaInfoCircle className="toast-icon info" />;
    }
  };

  const getBackgroundColor = () => {
    switch(type) {
      case 'success': return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'error': return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      case 'warning': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      case 'loading': return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
      default: return 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)';
    }
  };

  return (
    <motion.div
      className={`toast toast-${type}`}
      initial={{ opacity: 0, x: 400, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 400, scale: 0.8 }}
      transition={{ type: 'spring', damping: 20 }}
      style={{ background: getBackgroundColor() }}
    >
      <div className="toast-content">
        <div className="toast-icon-wrapper">
          {getIcon()}
        </div>
        <div className="toast-message">
          {typeof message === 'string' ? message : message.component}
        </div>
        <button className="toast-close" onClick={handleClose}>
          <FaTimes />
        </button>
      </div>
      <div className="toast-progress">
        <motion.div 
          className="toast-progress-bar"
          initial={{ width: '100%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </motion.div>
  );
};

// Toast Container
const ToastContainer = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={removeToast}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Predefined toast types for convenience
export const toast = {
  success: (message, duration) => {
    const { addToast } = useToast();
    return addToast(message, 'success', duration);
  },
  error: (message, duration) => {
    const { addToast } = useToast();
    return addToast(message, 'error', duration);
  },
  warning: (message, duration) => {
    const { addToast } = useToast();
    return addToast(message, 'warning', duration);
  },
  info: (message, duration) => {
    const { addToast } = useToast();
    return addToast(message, 'info', duration);
  },
  loading: (message, duration = Infinity) => {
    const { addToast } = useToast();
    return addToast(message, 'loading', duration);
  }
};

export default ToastNotification;