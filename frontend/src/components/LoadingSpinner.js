import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium' }) => {
  const sizeClass = `spinner-${size}`;
  
  return (
    <div className={`spinner ${sizeClass}`}>
      <div className="double-bounce1"></div>
      <div className="double-bounce2"></div>
    </div>
  );
};

export default LoadingSpinner;