import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';
// Module-specific CSS is imported inside each lazy-loaded component
// (sales.css → SalesView.tsx, purchases.css → PurchasesView.tsx)
// so it only loads when that module is first opened.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
);
