import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './AdminApp';
import './admin.css';
import { installIntegerSpinnerStepBehavior } from '../shared/utils/numberSpinnerStep';

installIntegerSpinnerStepBehavior();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
